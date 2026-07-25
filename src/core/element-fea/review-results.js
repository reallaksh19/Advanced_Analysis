import { deepFreeze } from '../shared-piping-model/immutable.js';
import { ELEMENT_TYPES } from './constants.js';
import { PROJECTED_STRESS_AUTHORITY, RAW_STRESS_AUTHORITY, compareIdentity } from './review-contract.js';

export function createResultReviews(model, result, adapterResult, input, profile) {
  return deepFreeze({
    solverSummary: createSolverSummary(model, result),
    loadReview: createLoadReview(model, result, adapterResult),
    constraintReview: createConstraintReview(model, adapterResult),
    displacementReview: createDisplacementReview(model, result),
    reactionReview: createReactionReview(result),
    rawStressReview: createRawStressReview(model, result),
    projectedStressReview: createProjectedStressReview(input.stressProjection, profile.includeProjectedStress),
    convergenceReview: createConvergenceReview(input.convergenceStudy, input.convergenceResult, profile.includeConvergenceEvidence),
  });
}

export function createSolverSummary(model, result) {
  const sparse = result.schema === 'fea-continuum-result/v3';
  return {
    resultSchema: result.schema,
    backendIdentity: sparse ? result.backendIdentity : result.backendTrace.backendIdentity,
    solverProfileIdentity: model.solverProfileIdentity,
    terminationStatus: sparse ? result.iterativeSolverEvidence.terminationStatus : result.backendTrace.classification,
    freeResidualInfinity: result.freeDofResidual.infinityNorm,
    completeResidualInfinity: result.globalResidual.infinityNorm,
    trueResidualL2: sparse ? result.iterativeSolverEvidence.finalTrueResidualL2 : null,
    targetResidual: sparse ? result.iterativeSolverEvidence.targetResidual : null,
    iterationCount: sparse ? result.iterativeSolverEvidence.iterationCount : null,
    matrixNonzeroCount: sparse ? result.sparseMatrixEvidence.nonzeroCount : null,
    strainEnergy: result.strainEnergy,
    energyAbsoluteDifference: result.energyConsistency.absoluteDifference,
  };
}

export function createLoadReview(model, result, adapterResult) {
  const loadCase = model.loadCases.find((row) => row.loadCaseId === result.loadCaseIdentity);
  const evidence = new Map((result.edgeLoadEvidence || []).map((row) => [row.loadId, row]));
  const authority = pressureAuthorityMap(adapterResult);
  const nodalForces = loadCase.nodalForces.map((row) => ({ ...row, magnitude: Math.hypot(row.fx, row.fy) })).sort(idCompare('loadId'));
  const edgeTractions = loadCase.edgeLoads.filter((row) => row.type === 'TRACTION').map((row) => edgeLoadRow(row, evidence, authority)).sort(idCompare('loadId'));
  const edgePressures = loadCase.edgeLoads.filter((row) => row.type === 'PRESSURE').map((row) => edgeLoadRow(row, evidence, authority)).sort(idCompare('loadId'));
  return {
    loadCaseIdentity: loadCase.loadCaseId,
    nodalForces,
    edgeTractions,
    edgePressures,
    totals: { ...result.appliedLoadTotals },
    counts: { nodalForce: nodalForces.length, edgeTraction: edgeTractions.length, edgePressure: edgePressures.length },
  };
}

export function createConstraintReview(model, adapterResult) {
  const parent = constraintParentMap(adapterResult);
  const fixed = model.restraints.map((row) => constraintRow(row, 'FIXED', parent));
  const prescribed = model.prescribedDisplacements.map((row) => constraintRow(row, 'PRESCRIBED', parent));
  const rows = [...fixed, ...prescribed].sort((a, b) => compareIdentity(a.nodeId, b.nodeId) || componentOrder(a.component) - componentOrder(b.component));
  return {
    rows,
    constrainedNodeCount: new Set(rows.map((row) => row.nodeId)).size,
    constrainedDofCount: rows.length,
    prescribedNonzeroDofCount: rows.filter((row) => row.constraintType === 'PRESCRIBED' && row.prescribedValue !== 0).length,
    restraintSets: restraintSets(rows),
  };
}

export function createDisplacementReview(model, result) {
  const values = new Map(result.nodalDisplacements.map((row) => [`${row.nodeId}:${row.component}`, row.value]));
  const rows = model.nodes.map((node) => {
    const ux = values.get(`${node.nodeId}:UX`) ?? 0;
    const uy = values.get(`${node.nodeId}:UY`) ?? 0;
    return { nodeId: node.nodeId, ux, uy, magnitude: Math.hypot(ux, uy) };
  }).sort(idCompare('nodeId'));
  return { rows, governing: {
    maximumAbsoluteUx: governing(rows, (row) => Math.abs(row.ux), 'ux'),
    maximumAbsoluteUy: governing(rows, (row) => Math.abs(row.uy), 'uy'),
    maximumMagnitude: governing(rows, (row) => row.magnitude, 'magnitude'),
  } };
}

export function createReactionReview(result) {
  const constraints = new Map((result.constraintPartition.constrainedEquations || []).map((row) => [row.equation, row.constraintId]));
  const rows = result.reactions.map((row) => ({ nodeId: row.nodeId, component: row.component, reaction: row.value, constraintIdentity: constraints.get(row.equation) || row.equationIdentity })).sort((a, b) => compareIdentity(a.nodeId, b.nodeId) || componentOrder(a.component) - componentOrder(b.component));
  return {
    rows,
    totals: { fx: result.reactionTotals.fx, fy: result.reactionTotals.fy, mz: result.reactionTotals.mz },
    forceBalanceResidual: { fx: result.equilibriumTotals.fx, fy: result.equilibriumTotals.fy },
    momentBalanceResidual: result.equilibriumTotals.mz,
    authority: 'ORIGINAL_SYSTEM_R_EQUALS_KU_MINUS_F',
  };
}

export function createRawStressReview(model, result) {
  const rows = result.schema === 'fea-continuum-result/v1' ? t3RawRows(model, result) : integrationRawRows(result);
  rows.sort((a, b) => compareIdentity(a.elementId, b.elementId) || compareIdentity(a.resultLocationId, b.resultLocationId));
  return {
    status: 'AVAILABLE',
    authority: RAW_STRESS_AUTHORITY,
    rows,
    governing: {
      maximumVonMises: governing(rows, (row) => row.vonMises, 'vonMises'),
      maximumPrincipal: governing(rows, (row) => row.principal1, 'principal1'),
      minimumPrincipal: governingMinimum(rows, (row) => row.principal2, 'principal2'),
      maximumAbsoluteSx: governing(rows, (row) => Math.abs(row.sx), 'sx'),
      maximumAbsoluteSy: governing(rows, (row) => Math.abs(row.sy), 'sy'),
      maximumAbsoluteTxy: governing(rows, (row) => Math.abs(row.txy), 'txy'),
    },
  };
}

export function createProjectedStressReview(projection, include) {
  if (!projection) return { status: 'NOT_SUPPLIED', authority: PROJECTED_STRESS_AUTHORITY, elementCornerValues: [], nodalValues: [], authorityWarning: 'Projected stress was not supplied; raw stress remains authoritative.' };
  const warning = 'NON-AUTHORITATIVE REVIEW PROJECTION — do not use for governing stress, convergence, acceptance, equilibrium, or energy.';
  const corners = include ? projection.elementCornerValues.map((row) => ({ ...row, authority: PROJECTED_STRESS_AUTHORITY, authorityWarning: warning })) : [];
  const nodes = include ? projection.nodalValues.map((row) => ({ ...row, authority: PROJECTED_STRESS_AUTHORITY, authorityWarning: warning })) : [];
  return {
    status: include ? 'AVAILABLE_NON_AUTHORITATIVE' : 'NOT_INCLUDED_BY_PROFILE',
    authority: PROJECTED_STRESS_AUTHORITY,
    projectionSchema: projection.schema,
    projectionIdentity: projection.projectionIdentity,
    projectionSemanticHash: projection.semanticHash,
    projectionPolicyIdentity: projection.extrapolationEvidence?.matrixIdentity || 'T3_CONSTANT_COPY_AND_Q4_GAUSS_EXTRAPOLATION',
    elementCornerValues: corners,
    nodalValues: nodes,
    authorityWarning: warning,
  };
}

export function createConvergenceReview(study, result, include) {
  if (!study || !result) return { status: 'NOT_SUPPLIED', levels: [], quantities: [], warning: 'A stable global response does not prove convergence of a local peak stress.' };
  if (!include) return { status: 'NOT_INCLUDED_BY_PROFILE', studyIdentity: study.studyIdentity, studySemanticHash: study.semanticHash, resultIdentity: result.interpretationIdentity, resultSemanticHash: result.semanticHash, levels: [], quantities: [], warning: convergenceWarning() };
  return {
    status: 'AVAILABLE',
    studyIdentity: study.studyIdentity,
    studySemanticHash: study.semanticHash,
    resultIdentity: result.interpretationIdentity,
    resultSemanticHash: result.semanticHash,
    levels: result.levelEvidence.map((row) => ({ ...row })),
    quantities: result.quantityResults.map((row) => ({ ...row })),
    warning: convergenceWarning(),
  };
}

function edgeLoadRow(row, evidence, authority) {
  const qualified = evidence.get(row.loadId);
  if (!qualified) throw new TypeError(`Missing qualified edge-load evidence for ${row.loadId}.`);
  const common = {
    loadId: row.loadId,
    elementId: row.elementId,
    edgeNodeIds: [...row.edgeNodeIds],
    equivalentResultantX: qualified.integratedForce[0],
    equivalentResultantY: qualified.integratedForce[1],
    sourceSemanticHash: row.sourceSemanticHash,
  };
  return row.type === 'TRACTION'
    ? { ...common, loadType: 'TRACTION', tx: row.tx, ty: row.ty, pressure: null, outwardNormalAuthority: null }
    : { ...common, loadType: 'PRESSURE', tx: null, ty: null, pressure: row.pressure, outwardNormalAuthority: authority.get(row.loadId) || 'ELEMENT_LOCAL_COUNTERCLOCKWISE_CONNECTIVITY' };
}

function t3RawRows(model, result) {
  const nodes = new Map(model.nodes.map((row) => [row.nodeId, row]));
  const strains = new Map(result.elementStrains.map((row) => [row.elementId, row]));
  const stresses = new Map(result.elementStresses.map((row) => [row.elementId, row]));
  const principals = new Map(result.principalStresses.map((row) => [row.elementId, row]));
  const vonMises = new Map(result.vonMisesStress.map((row) => [row.elementId, row]));
  const energies = new Map(result.elementStrainEnergy.map((row) => [row.elementId, row]));
  return model.elements.map((element) => {
    const point = centroid(element.nodeIds.map((id) => nodes.get(id)));
    const strain = strains.get(element.elementId); const stress = stresses.get(element.elementId); const principal = principals.get(element.elementId);
    return rawRow(element.elementId, element.type, 'T3_CONSTANT', null, point, strain.values, stress.values, stress.sigmaZ, principal.values, principal.angleRadians, vonMises.get(element.elementId).value, energies.get(element.elementId).value);
  });
}

function integrationRawRows(result) {
  return result.integrationPointResults.map((row) => rawRow(
    row.elementId, row.elementType, row.integrationPointId, row.naturalCoordinates || null,
    row.globalCoordinates, row.strain, row.stress, row.sigmaZ, row.principalStresses,
    row.principalOrientationRadians, row.vonMisesStress, row.strainEnergyContribution,
  ));
}

function rawRow(elementId, elementType, locationId, natural, global, strain, stress, sigmaZ, principal, angle, vonMises, energy) {
  return {
    elementId, elementType, resultLocationId: locationId,
    xi: natural?.xi ?? null, eta: natural?.eta ?? null,
    x: global.x, y: global.y,
    ex: strain[0], ey: strain[1], gxy: strain[2],
    sx: stress[0], sy: stress[1], txy: stress[2], sigmaZ,
    principal1: Math.max(...principal), principal2: Math.min(...principal), principalAngle: angle,
    vonMises, strainEnergy: energy, authority: RAW_STRESS_AUTHORITY,
  };
}

function pressureAuthorityMap(adapterResult) {
  const rows = adapterResult.assignmentEvidence?.loadAssignments || [];
  return new Map(rows.flatMap((row) => row.generatedChildren || []).map((row) => [row.generatedLoadId, row.outwardNormalAuthority || null]));
}
function constraintParentMap(adapterResult) {
  const rows = adapterResult.assignmentEvidence?.constraintAssignments || [];
  return new Map(rows.flatMap((row) => row.generatedConstraints.map((child) => [child.generatedConstraintId, row.parentConstraintId])));
}
function constraintRow(row, type, parent) {
  return { constraintId: row.constraintId, parentConstraintIdentity: parent.get(row.constraintId) || null, nodeId: row.nodeId, component: row.component, constraintType: type, prescribedValue: row.value, sourceSemanticHash: row.sourceSemanticHash };
}
function restraintSets(rows) {
  const groups = new Map();
  rows.forEach((row) => { const id = row.parentConstraintIdentity || row.constraintId; groups.set(id, [...(groups.get(id) || []), row.constraintId].sort(compareIdentity)); });
  return [...groups].map(([restraintSetIdentity, constraintIds]) => ({ restraintSetIdentity, constraintIds })).sort(idCompare('restraintSetIdentity'));
}
function governing(rows, metric, valueKey) {
  const selected = [...rows].sort((a, b) => metric(b) - metric(a) || rawIdentityCompare(a, b))[0];
  return selected ? governingRow(selected, valueKey) : null;
}
function governingMinimum(rows, metric, valueKey) {
  const selected = [...rows].sort((a, b) => metric(a) - metric(b) || rawIdentityCompare(a, b))[0];
  return selected ? governingRow(selected, valueKey) : null;
}
function governingRow(row, valueKey) {
  return { nodeId: row.nodeId || null, elementId: row.elementId || null, resultLocationId: row.resultLocationId || null, value: row[valueKey] };
}
function rawIdentityCompare(a, b) {
  return compareIdentity(a.nodeId || '', b.nodeId || '') || compareIdentity(a.elementId || '', b.elementId || '') || compareIdentity(a.resultLocationId || '', b.resultLocationId || '');
}
function centroid(nodes) {
  return { x: nodes.reduce((sum, row) => sum + row.x, 0) / nodes.length, y: nodes.reduce((sum, row) => sum + row.y, 0) / nodes.length };
}
function componentOrder(value) { return value === 'UX' ? 0 : 1; }
function idCompare(key) { return (a, b) => compareIdentity(a[key], b[key]); }
function convergenceWarning() { return 'A stable global response does not prove convergence of a local peak stress.'; }
