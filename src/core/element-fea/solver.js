import { assembleContinuumSystem, partitionSystem, reconstructDisplacement } from './assembly.js';
import { CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, CONTINUUM_RESULT_SCHEMA_V3, ELEMENT_TYPES, FORMULATIONS, LINEAR_BACKENDS, RESULT_STATUS } from './constants.js';
import { recoverElementResult } from './element-dispatch.js';
import { solveLinearSystem } from './linear-backend-dispatch.js';
import { dot, multiplyMatrixVector, subtractVectors, vectorNormInfinity } from './matrix.js';
import { qualifyContinuumModel } from './model.js';
import { profileLinearBackend } from './profile.js';
import { qualifiedResult, rejectedResult } from './result.js';
import { assembleSparseContinuumSystem } from './sparse-assembly.js';
import { multiplySparseSystem, partitionSparseSystem } from './sparse-partition.js';

export function solveContinuumModel(input, loadCaseIdentity) {
  const qualification = qualifyContinuumModel(input);
  if (!qualification.ok) return rejectedResult(input, RESULT_STATUS.REJECTED_INVALID, qualification.diagnostics);
  const model = qualification.model; const loadCase = selectLoadCase(model, loadCaseIdentity);
  if (!loadCase) return rejectedResult(model, RESULT_STATUS.REJECTED_INVALID, [diagnostic('LOAD_CASE_MISSING', 'An exact load-case identity is required and must exist.')], model.limitations);
  try { return solveQualifiedModel(model, loadCase); }
  catch (error) { return rejectedException(model, error); }
}

function solveQualifiedModel(model, loadCase) {
  const sparse = profileLinearBackend(model.solverProfile) === LINEAR_BACKENDS.SPARSE_PCG_V1;
  const system = sparse ? assembleSparseContinuumSystem(model, loadCase) : assembleContinuumSystem(model, loadCase);
  const partition = sparse ? partitionSparseSystem(system, model) : partitionSystem(system, model);
  const backend = solveLinearSystem(partition, model.solverProfile);
  if (!backend.ok) return failedBackendResult(model, system, backend);
  const displacement = reconstructDisplacement(system.dofMap.length, partition, backend.solution);
  const recovery = recoverSystem(model, system, partition, displacement, backend, sparse);
  const failure = qualificationFailure(model, recovery);
  return failure || qualifiedResult(model, loadCase, recovery);
}

function rejectedException(model, error) {
  const resource = error instanceof RangeError; const status = resource ? RESULT_STATUS.REJECTED_INVALID : RESULT_STATUS.QUARANTINED_NUMERICAL;
  const code = resource ? 'RESOURCE_QUALIFICATION_FAILED' : 'SOLVER_FAILURE'; const trace = error?.capacityEvidence ? { capacityEvidence: error.capacityEvidence } : {};
  return rejectedResult(model, status, [diagnostic(code, error.message)], model.limitations, trace);
}

function failedBackendResult(model, system, backend) {
  const unsupported = backend.classification === 'UNSUPPORTED_BACKEND';
  const singular = backend.classification === 'SINGULAR' || backend.classification === 'BREAKDOWN';
  const status = unsupported ? RESULT_STATUS.REJECTED_INVALID : singular ? RESULT_STATUS.REJECTED_SINGULAR : RESULT_STATUS.QUARANTINED_NUMERICAL;
  const code = unsupported ? 'UNSUPPORTED_BACKEND' : singular ? 'SINGULAR_OR_NON_SPD_SYSTEM' : backend.classification || 'BACKEND_FAILURE';
  const trace = { backendTrace: backendTrace(backend) };
  if (system.sparseStiffness) trace.sparseMatrixEvidence = system.sparseStiffness.evidence;
  if (system.capacityEvidence) trace.capacityEvidence = system.capacityEvidence;
  return rejectedResult(model, status, [diagnostic(code, `Linear solve failed: ${backend.breakdownReason || backend.classification}.`)], model.limitations, trace);
}

function recoverSystem(model, system, partition, displacement, backend, sparse) {
  const originalInternalForce = sparse ? multiplySparseSystem(system, displacement) : multiplyMatrixVector(system.stiffness, displacement);
  const imbalance = subtractVectors(originalInternalForce, system.appliedLoad); const constrainedSet = new Set(partition.constrainedEquations);
  const reactionVector = imbalance.map((value, equation) => constrainedSet.has(equation) ? value : 0);
  const freeResidualValues = partition.freeEquations.map((equation) => imbalance[equation]); const globalResidualValues = subtractVectors(imbalance, reactionVector);
  const elementEvidence = recoverElements(model, system, displacement, sparse); const strainEnergy = 0.5 * dot(displacement, originalInternalForce);
  const elementEnergyTotal = elementEvidence.elementStrainEnergy.reduce((sum, row) => sum + row.value, 0);
  const appliedLoadTotals = componentTotals(model.nodes, system.dofMap, system.appliedLoad); const reactionTotals = componentTotals(model.nodes, system.dofMap, reactionVector);
  return recoveryRecord(model, system, partition, backend, elementEvidence, displacement, reactionVector, imbalance, freeResidualValues, globalResidualValues, appliedLoadTotals, reactionTotals, strainEnergy, elementEnergyTotal, sparse);
}

function recoveryRecord(model, system, partition, backend, elementEvidence, displacement, reactionVector, imbalance, freeResidualValues, globalResidualValues, appliedLoadTotals, reactionTotals, strainEnergy, elementEnergyTotal, sparse) {
  const sparseEvidence = sparse ? { sparseMatrixEvidence: system.sparseStiffness.evidence, capacityEvidence: system.capacityEvidence, iterativeSolverEvidence: backendTrace(backend) } : {};
  return {
    resultSchema: elementEvidence.resultSchema, predecessorResultSchema: elementEvidence.predecessorResultSchema || null,
    assembledSystemHash: system.assembledSystemHash, backendTrace: backendTrace(backend), dofMap: system.dofMap,
    constraintPartition: partitionEvidence(system.dofMap, partition), directNodalLoads: system.directNodalLoads,
    directNodalLoadEvidence: system.directNodalLoadEvidence, equivalentEdgeLoads: system.equivalentEdgeLoads,
    edgeLoadEvidence: system.edgeLoadEvidence, appliedLoadVector: system.appliedLoad, effectiveFreeLoad: partition.effectiveFreeLoad,
    nodalDisplacements: dofRows(system.dofMap, displacement), reactions: constrainedRows(system.dofMap, partition.constrainedEquations, reactionVector),
    constrainedDofImbalance: constrainedRows(system.dofMap, partition.constrainedEquations, imbalance), ...elementEvidence,
    freeDofResidual: residualEvidence(system.dofMap, partition.freeEquations, freeResidualValues), globalResidual: residualEvidence(system.dofMap, system.dofMap.map((row) => row.equation), globalResidualValues),
    appliedLoadTotals, reactionTotals, equilibriumTotals: addTotals(appliedLoadTotals, reactionTotals), strainEnergy,
    energyConsistency: { elementEnergyTotal, absoluteDifference: Math.abs(strainEnergy - elementEnergyTotal) }, diagnostics: lockingDiagnostics(model), additionalLimitations: lockingLimitations(model), ...sparseEvidence,
  };
}

function recoverElements(model, system, displacement, sparse) {
  const materialMap = new Map(model.materials.map((row) => [row.materialId, row]));
  const rows = system.operators.map(({ element, operator, indices }) => {
    const localDisplacement = indices.map((index) => displacement[index]);
    const result = recoverElementResult(element, operator, localDisplacement, materialMap.get(element.materialId), model.solverProfile.formulation);
    return { element, operator, localDofOrder: element.nodeIds.flatMap((nodeId) => [`${nodeId}:UX`, `${nodeId}:UY`]), result };
  });
  if (sparse) return sparseEvidence(rows);
  return rows.some((row) => row.element.type === ELEMENT_TYPES.Q4) ? q4Evidence(rows) : t3Evidence(rows);
}

function sparseEvidence(rows) {
  const evidence = q4Evidence(rows); const hasQ4 = rows.some((row) => row.element.type === ELEMENT_TYPES.Q4);
  return { ...evidence, resultSchema: CONTINUUM_RESULT_SCHEMA_V3, predecessorResultSchema: hasQ4 ? CONTINUUM_RESULT_SCHEMA_V2 : CONTINUUM_RESULT_SCHEMA };
}

function t3Evidence(rows) {
  return { resultSchema: CONTINUUM_RESULT_SCHEMA, elementStrains: rows.map((row) => ({ elementId: row.element.elementId, values: row.result.integrationPointResults[0].strain, recoveryLocation: 'T3_CONSTANT_ELEMENT_DOMAIN' })), elementStresses: rows.map((row) => ({ elementId: row.element.elementId, values: row.result.integrationPointResults[0].stress, sigmaZ: row.result.integrationPointResults[0].sigmaZ, recoveryLocation: 'T3_CONSTANT_ELEMENT_DOMAIN' })), principalStresses: rows.map((row) => ({ elementId: row.element.elementId, ...row.result.integrationPointResults[0].principal })), vonMisesStress: rows.map((row) => ({ elementId: row.element.elementId, value: row.result.integrationPointResults[0].vonMises })), elementInternalForces: internalForces(rows), elementStrainEnergy: elementEnergies(rows) };
}

function q4Evidence(rows) {
  const integrationPointResults = rows.flatMap((row) => row.result.integrationPointResults.map((point) => integrationPointRow(row.element, point)));
  const elementIntegrationEvidence = rows.map((row) => ({ elementId: row.element.elementId, elementType: row.element.type, integrationRule: row.operator.integrationRule || 'T3_CONSTANT_EXACT', points: row.element.type === ELEMENT_TYPES.Q4 ? row.operator.integrationPoints.map(integrationEvidence) : [{ integrationPointId: 'T3_CONSTANT', B: row.operator.geometry.B, determinantMeasure: row.operator.geometry.area, globalCoordinates: row.operator.centroid }] }));
  const elementQualityEvidence = rows.map((row) => ({ elementId: row.element.elementId, elementType: row.element.type, evidence: row.element.type === ELEMENT_TYPES.Q4 ? row.operator.qualityEvidence : { signedArea: row.operator.geometry.area } }));
  return { resultSchema: CONTINUUM_RESULT_SCHEMA_V2, integrationPointResults, elementIntegrationEvidence, elementQualityEvidence, elementInternalForces: internalForces(rows), elementStrainEnergy: elementEnergies(rows) };
}

function integrationPointRow(element, point) { return { elementId: element.elementId, elementType: element.type, integrationPointId: point.integrationPointId, naturalCoordinates: point.naturalCoordinates, globalCoordinates: point.globalCoordinates, strain: point.strain, stress: point.stress, sigmaZ: point.sigmaZ, principalStresses: point.principal.values, inPlanePrincipalStresses: point.principal.inPlane, principalOrientationRadians: point.principal.angleRadians, principalOrientationDefined: point.principal.orientationDefined, vonMisesStress: point.vonMises, recoveryLocation: point.recoveryLocation, strainEnergyContribution: point.strainEnergyContribution }; }
function integrationEvidence(point) { return { integrationPointId: point.integrationPointId, naturalCoordinates: { xi: point.xi, eta: point.eta }, globalCoordinates: point.globalCoordinates, weight: point.weight, jacobian: point.jacobian, determinant: point.determinant, inverseJacobian: point.inverseJacobian, globalDerivatives: point.globalDerivatives, B: point.B }; }
function internalForces(rows) { return rows.map((row) => ({ elementId: row.element.elementId, elementType: row.element.type, localDofOrder: row.localDofOrder, values: row.result.internalForce })); }
function elementEnergies(rows) { return rows.map((row) => ({ elementId: row.element.elementId, elementType: row.element.type, value: row.result.strainEnergy, integratedPointEnergy: row.result.integratedPointEnergy })); }

function qualificationFailure(model, recovery) {
  const tolerances = model.solverProfile.tolerances; const loadScale = Math.max(1, vectorNormInfinity(recovery.appliedLoadVector));
  const residualLimit = tolerances.residualForceAbsolute + tolerances.residualForceRelative * loadScale;
  if (recovery.freeDofResidual.infinityNorm > residualLimit) return quarantine(model, 'FREE_RESIDUAL_FAILURE', 'Free-DOF residual exceeds the approved tolerance.', recovery);
  if (recovery.globalResidual.infinityNorm > residualLimit) return quarantine(model, 'GLOBAL_RESIDUAL_FAILURE', 'Complete-system residual exceeds the approved tolerance.', recovery);
  if (Math.max(Math.abs(recovery.equilibriumTotals.fx), Math.abs(recovery.equilibriumTotals.fy)) > tolerances.forceEquilibriumAbsolute || Math.abs(recovery.equilibriumTotals.mz) > tolerances.momentEquilibriumAbsolute) return quarantine(model, 'EQUILIBRIUM_FAILURE', 'Global force or moment balance exceeds the approved tolerance.', recovery);
  if (!Number.isFinite(recovery.strainEnergy) || recovery.strainEnergy < -tolerances.energyAbsolute || recovery.energyConsistency.absoluteDifference > tolerances.energyAbsolute) return quarantine(model, 'ENERGY_FAILURE', 'Strain-energy evidence exceeds the approved consistency tolerance.', recovery);
  return null;
}

function quarantine(model, code, message, recovery) { const trace = { backendTrace: recovery.backendTrace }; if (recovery.sparseMatrixEvidence) trace.sparseMatrixEvidence = recovery.sparseMatrixEvidence; if (recovery.capacityEvidence) trace.capacityEvidence = recovery.capacityEvidence; return rejectedResult(model, RESULT_STATUS.QUARANTINED_NUMERICAL, [diagnostic(code, message)], model.limitations, trace); }
function lockingDiagnostics(model) { return hasQ4PlaneStrain(model) ? [diagnostic('Q4_PLANE_STRAIN_LOCKING_APPLICABILITY', 'Full-integration Q4 plane strain may exhibit volumetric locking near incompressibility; no formulation change is applied.','WARNING')] : []; }
function lockingLimitations(model) { return hasQ4PlaneStrain(model) ? ['Q4 plane-strain applicability near incompressibility requires independent mesh-convergence evidence; reduced integration is not authorized.'] : []; }
function hasQ4PlaneStrain(model) { return model.solverProfile.formulation === FORMULATIONS.PLANE_STRAIN && model.elements.some((row) => row.type === ELEMENT_TYPES.Q4); }
function partitionEvidence(dofMap, partition) { const byEquation = new Map(dofMap.map((row) => [row.equation, row])); return { method: 'PARTITION_ELIMINATION', freeEquations: partition.freeEquations.map((equation) => ({ equation, equationIdentity: byEquation.get(equation).equationIdentity })), constrainedEquations: partition.constraints.map((row) => ({ equation: row.equation, equationIdentity: byEquation.get(row.equation).equationIdentity, constraintId: row.constraintId, constraintType: row.constraintType, prescribedValue: row.value })), freeDofIndices: [...partition.freeEquations], constrainedDofIndices: [...partition.constrainedEquations], freeAppliedLoad: partition.freeAppliedLoad, imposedDisplacementLoad: partition.imposedDisplacementLoad }; }
function backendTrace(backend) { if (backend.backendIdentity === LINEAR_BACKENDS.SPARSE_PCG_V1) { const { solution: _solution, ok: _ok, classification: _classification, ...trace } = backend; return trace; } return { backendIdentity: backend.backendIdentity, pivots: backend.pivots || [], pivotRatio: backend.pivotRatio ?? null, minimumPivot: backend.minimumPivot ?? null, maximumPivot: backend.maximumPivot ?? null, classification: backend.classification || 'SOLVED' }; }
function dofRows(dofMap, values) { return dofMap.map((row) => ({ ...row, value: values[row.equation] })); }
function constrainedRows(dofMap, equations, values) { const rows = new Map(dofMap.map((row) => [row.equation, row])); return equations.map((equation) => ({ ...rows.get(equation), value: values[equation] })); }
function residualEvidence(dofMap, equations, values) { const rows = new Map(dofMap.map((row) => [row.equation, row])); return { values, infinityNorm: vectorNormInfinity(values), equations: equations.map((equation) => ({ equation, equationIdentity: rows.get(equation).equationIdentity })) }; }
function componentTotals(nodes, dofMap, values) { const nodeMap = new Map(nodes.map((node) => [node.nodeId, node])); const forces = new Map(nodes.map((node) => [node.nodeId, { fx: 0, fy: 0 }])); dofMap.forEach((row) => { forces.get(row.nodeId)[row.component === 'UX' ? 'fx' : 'fy'] += values[row.equation]; }); return [...forces].reduce((totals, [nodeId, force]) => { const node = nodeMap.get(nodeId); totals.fx += force.fx; totals.fy += force.fy; totals.mz += node.x * force.fy - node.y * force.fx; return totals; }, { fx: 0, fy: 0, mz: 0 }); }
function addTotals(left, right) { return { fx: left.fx + right.fx, fy: left.fy + right.fy, mz: left.mz + right.mz }; }
function selectLoadCase(model, identity) { if (identity !== undefined && identity !== null) return model.loadCases.find((row) => row.loadCaseId === identity) || null; return model.loadCases.length === 1 ? model.loadCases[0] : null; }
function diagnostic(code, message, severity = 'ERROR') { return { code, severity, message }; }
