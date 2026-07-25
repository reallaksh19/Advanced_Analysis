import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  AUDIT_CODES, QUALIFICATION, VERTICAL_BEAM_SOLUTION_SCHEMA,
} from './constants.js';
import { assembleVerticalBeamSystem, partitionFreeSystem } from './assembly.js';
import { diagnostic, diagnosticOrder, uniqueSorted } from './diagnostics.js';
import {
  displacementResidualProof, forceEquilibrium, matrixResidualProof, momentEquilibrium,
} from './equilibrium.js';
import { solveScaledPartialPivot } from './linear-solver.js';
import { matrixVector, maxAbs, subtractVectors } from './numeric.js';
import { validateVerticalBeamModel } from './beam-model.js';
import { validateVerticalBeamSolverProfile } from './profile.js';

export function solveVerticalBeamModel(beamModel, profile) {
  assertInputs(beamModel, profile);
  const pathCases = beamModel.pathCases.map((row) => solvePathCase(row, profile)).sort(caseOrder);
  const diagnostics = pathCases.flatMap((row) => row.diagnostics).sort(diagnosticOrder);
  const base = {
    schema: VERTICAL_BEAM_SOLUTION_SCHEMA, datasetId: beamModel.datasetId,
    beamModelSemanticHash: beamModel.semanticHash, profile,
    pathCases, diagnostics,
    summary: {
      pathCaseCount: pathCases.length,
      readyPathCaseCount: pathCases.filter(isReady).length,
      blockedPathCaseCount: pathCases.filter((row) => !isReady(row)).length,
      supportResultCount: pathCases.reduce((sum, row) => sum + row.supportForceResults.length, 0),
      maximumAbsoluteDisplacementM: Math.max(0, ...pathCases.map((row) => row.maximumAbsoluteDisplacementM || 0)),
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateVerticalBeamSolution(value) {
  const errors = [];
  if (value?.schema !== VERTICAL_BEAM_SOLUTION_SCHEMA) errors.push('Invalid vertical-beam solution schema.');
  if (!Array.isArray(value?.pathCases)) errors.push('Vertical-beam solution path cases must be an array.');
  const keys = (value?.pathCases || []).map((row) => `${row.pathId}|${row.loadCaseId}`);
  if (new Set(keys).size !== keys.length) errors.push('Vertical-beam solution path/case records must be unique.');
  (value?.pathCases || []).forEach((row) => validatePathCase(row, errors));
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Vertical-beam solution semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function solvePathCase(pathCase, profile) {
  if (pathCase.qualification !== QUALIFICATION.READY) return blockedFromModel(pathCase);
  const assembly = assembleVerticalBeamSystem(pathCase);
  if (!assembly.finite) return blockedSolution(pathCase, [AUDIT_CODES.MATRIX_NONFINITE], assembly);
  const partition = partitionFreeSystem(assembly);
  const solved = solveScaledPartialPivot(partition.matrix, partition.vector, profile.numericalSolverPolicy);
  if (!solved.ok) return blockedSolution(pathCase, solved.diagnostics.map((row) => row.code), assembly, solved);
  return completedSolution(pathCase, profile, assembly, solved);
}

function completedSolution(pathCase, profile, assembly, solved) {
  const displacement = expandSolution(pathCase.dofMap.length, assembly.freeDofIndices, solved.solution);
  const residual = subtractVectors(matrixVector(assembly.matrix, displacement), assembly.vector);
  const nodeResults = buildNodeResults(pathCase, displacement);
  const elementEndForces = buildElementEndForces(pathCase, assembly, displacement);
  const elementExtrema = buildElementExtrema(pathCase, displacement);
  const supportForceResults = buildSupportResults(pathCase, residual, displacement, profile);
  const proof = solutionProof(pathCase, profile, assembly, residual, displacement, supportForceResults);
  const blockers = resultBlockers(proof.force, proof.moment, proof.matrix, proof.supportDisplacement);
  const diagnostics = solutionDiagnostics(pathCase, blockers, supportForceResults);
  const base = {
    pathId: pathCase.pathId, loadCaseId: pathCase.loadCaseId,
    nodeResults, elementEndForces, elementExtrema, supportForceResults,
    maximumAbsoluteDisplacementM: Math.max(0, ...elementExtrema.map((row) => row.maximumAbsoluteDisplacementM)),
    maximumAbsoluteRotationRad: Math.max(0, ...elementExtrema.map((row) => row.maximumAbsoluteRotationRad)),
    appliedForceTotalN: proof.applied.forceN, supportForceTotalN: proof.supportForceTotalN,
    appliedMomentAboutPathZeroNm: proof.applied.momentNm, supportMomentAboutPathZeroNm: proof.supportMomentNm,
    forceEquilibrium: proof.force, momentEquilibrium: proof.moment, matrixResidual: proof.matrix,
    supportDisplacementResidual: proof.supportDisplacement, matrixDimensions: assembly.matrixDimensions,
    freeDofCount: assembly.freeDofCount, constrainedDofCount: assembly.constrainedDofCount,
    pivotEvidence: solved.trace, minimumPivot: solved.minimumPivot, minimumScaledPivot: solved.minimumScaledPivot,
    qualification: blockers.length ? QUALIFICATION.BLOCKED : QUALIFICATION.READY, blockers, diagnostics,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function solutionProof(pathCase, profile, assembly, residual, displacement, supports) {
  const applied = appliedTotals(pathCase.loadVectorRecords);
  const supportForceTotalN = supports.reduce((sum, row) => sum + row.signedSupportForceN, 0);
  const supportMomentNm = supports.reduce((sum, row) => sum + row.signedSupportForceN * row.pathStationM, 0);
  const matrixResidualNorm = maxAbs(assembly.freeDofIndices.map((index) => residual[index]));
  const constrained = pathCase.constraints.map((row) => pathCase.dofMap.find((item) => item.dofId === row.constrainedDofId)?.index);
  const supportResidualM = Math.max(0, ...constrained.map((index) => Math.abs(displacement[index] || 0)));
  return {
    applied, supportForceTotalN, supportMomentNm,
    force: forceEquilibrium(applied.forceN, supportForceTotalN, profile.forceEquilibriumTolerancePolicy),
    moment: momentEquilibrium(applied.momentNm, supportMomentNm, profile.momentEquilibriumTolerancePolicy),
    matrix: matrixResidualProof(matrixResidualNorm, maxAbs(assembly.vector), profile.matrixResidualTolerancePolicy),
    supportDisplacement: displacementResidualProof(supportResidualM, maxAbs(displacement), profile.supportDisplacementTolerancePolicy),
  };
}

function solutionDiagnostics(pathCase, blockers, supportResults) {
  return [
    ...blockers.map((code) => diagnostic(code, `${pathCase.pathId}:${pathCase.loadCaseId}`, `Vertical beam solution failed proof: ${code}.`)),
    ...supportResults.flatMap((row) => row.diagnostics),
  ];
}

function buildNodeResults(pathCase, displacement) {
  const index = new Map(pathCase.dofMap.map((row) => [row.dofId, row.index]));
  return pathCase.nodes.map((node) => deepFreeze({
    nodeId: node.nodeId, pathStationM: node.pathStationM,
    verticalDisplacementM: displacement[index.get(node.verticalDofId)],
    rotationRad: displacement[index.get(node.rotationDofId)],
    directionConvention: 'VERTICAL_POSITIVE_GRAVITY_DOWN_ROTATION_POSITIVE_LOCAL_DV_DX',
  }));
}

function buildElementEndForces(pathCase, assembly, displacement) {
  const elementById = new Map(pathCase.elements.map((row) => [row.elementId, row]));
  return assembly.elementAssemblies.map((row) => {
    const localDisplacement = row.dofIndices.map((index) => displacement[index]);
    const internal = row.stiffness.matrix.map((matrixRow) => matrixRow.reduce((sum, value, index) => sum + value * localDisplacement[index], 0));
    const endForces = internal.map((value, index) => value - row.localLoadVector[index]);
    const element = elementById.get(row.elementId);
    return deepFreeze({
      elementId: row.elementId, componentKey: element.componentKey,
      startStationM: element.startStationM, endStationM: element.endStationM,
      localEndForceVector: endForces,
      convention: '[V_start,M_start,V_end,M_end]_POSITIVE_BY_ELEMENT_DOF',
      stiffnessFormulaId: row.stiffness.formulaId,
      loadFormulaTraces: row.loadFormulaTraces,
    });
  });
}

function buildElementExtrema(pathCase, displacement) {
  const dofIndex = new Map(pathCase.dofMap.map((row) => [row.dofId, row.index]));
  const nodes = new Map(pathCase.nodes.map((row) => [row.nodeId, row]));
  return pathCase.elements.map((element) => {
    const left = nodes.get(element.startNodeId), right = nodes.get(element.endNodeId);
    const values = [
      displacement[dofIndex.get(left.verticalDofId)], displacement[dofIndex.get(left.rotationDofId)],
      displacement[dofIndex.get(right.verticalDofId)], displacement[dofIndex.get(right.rotationDofId)],
    ];
    return elementExtremaRecord(element, values);
  });
}

function elementExtremaRecord(element, [v1, theta1, v2, theta2]) {
  const length = element.lengthM;
  const coefficients = [
    v1,
    length * theta1,
    -3 * v1 - 2 * length * theta1 + 3 * v2 - length * theta2,
    2 * v1 + length * theta1 - 2 * v2 + length * theta2,
  ];
  const displacementXi = uniqueUnitValues([0, 1, ...quadraticRoots(3 * coefficients[3], 2 * coefficients[2], coefficients[1])]);
  const rotationXi = uniqueUnitValues([0, 1, linearRoot(6 * coefficients[3], 2 * coefficients[2])]);
  const displacementSamples = displacementXi.map((xi) => sampleDisplacement(coefficients, xi));
  const rotationSamples = rotationXi.map((xi) => sampleRotation(coefficients, xi, length));
  return deepFreeze({
    elementId: element.elementId,
    maximumAbsoluteDisplacementM: Math.max(...displacementSamples.map(Math.abs)),
    maximumAbsoluteRotationRad: Math.max(...rotationSamples.map(Math.abs)),
    displacementExtremaStationsM: displacementXi.map((xi) => element.startStationM + xi * length),
    rotationExtremaStationsM: rotationXi.map((xi) => element.startStationM + xi * length),
  });
}
function sampleDisplacement(c, x) { return c[0] + c[1] * x + c[2] * x ** 2 + c[3] * x ** 3; }
function sampleRotation(c, x, length) { return (c[1] + 2 * c[2] * x + 3 * c[3] * x ** 2) / length; }
function quadraticRoots(a, b, c) {
  if (Math.abs(a) < 1e-30) return [linearRoot(b, c)].filter(Number.isFinite);
  const discriminant = b ** 2 - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}
function linearRoot(a, b) { return Math.abs(a) < 1e-30 ? NaN : -b / a; }
function uniqueUnitValues(values) { return [...new Set(values.filter((x) => Number.isFinite(x) && x >= 0 && x <= 1).map((x) => Number(x.toPrecision(15))))].sort((a, b) => a - b); }

function buildSupportResults(pathCase, residual, displacement, profile) {
  const dofById = new Map(pathCase.dofMap.map((row) => [row.dofId, row]));
  const upliftTolerance = profile.forceEquilibriumTolerancePolicy.absoluteTolerance;
  return pathCase.constraints.map((constraint) => {
    const dof = dofById.get(constraint.constrainedDofId);
    const signedSupportForceN = residual[dof.index];
    const directionReversal = signedSupportForceN > upliftTolerance;
    const diagnostics = directionReversal ? [diagnostic(
      AUDIT_CODES.SUPPORT_UPLIFT_OR_DIRECTION_REVERSAL, constraint.supportKey,
      'Support force acts in the positive-down direction and is preserved without clamping.',
      { signedSupportForceN }, 'WARNING',
    )] : [];
    return deepFreeze({
      resultId: `vertical-beam-support-force:${pathCase.loadCaseId}:${pathCase.pathId}:${constraint.supportKey}`,
      supportKey: constraint.supportKey, pathStationM: constraint.pathStationM,
      constrainedDofId: constraint.constrainedDofId,
      signedSupportForceN, upwardSupportForceN: Math.max(0, -signedSupportForceN),
      constrainedDisplacementM: displacement[dof.index],
      directionConvention: 'SIGNED_SUPPORT_FORCE_POSITIVE_GRAVITY_DOWN',
      sourceEvidence: constraint.sourceEvidence,
      qualification: QUALIFICATION.READY, diagnostics,
    });
  });
}

function appliedTotals(records) {
  return records.reduce((sum, row) => {
    if (row.pointForceN !== null) {
      sum.forceN += row.pointForceN; sum.momentNm += row.pointForceN * row.pathStationM;
    } else {
      const length = row.intervalEndM - row.intervalStartM;
      const force = row.forcePerLengthNM * length;
      sum.forceN += force; sum.momentNm += force * (row.intervalStartM + row.intervalEndM) / 2;
    }
    return sum;
  }, { forceN: 0, momentNm: 0 });
}

function resultBlockers(force, moment, matrix, supportDisplacement) {
  return uniqueSorted([
    ...(force.pass ? [] : [AUDIT_CODES.FORCE_EQUILIBRIUM_MISMATCH]),
    ...(moment.pass ? [] : [AUDIT_CODES.MOMENT_EQUILIBRIUM_MISMATCH]),
    ...(matrix.pass ? [] : [AUDIT_CODES.MATRIX_RESIDUAL_EXCEEDED]),
    ...(supportDisplacement.pass ? [] : [AUDIT_CODES.SUPPORT_DISPLACEMENT_RESIDUAL]),
  ]);
}

function blockedFromModel(pathCase) { return blockedSolution(pathCase, pathCase.blockers || [AUDIT_CODES.PATH_NOT_QUALIFIED]); }
function blockedSolution(pathCase, blockers, assembly = null, solve = null) {
  const base = {
    pathId: pathCase.pathId, loadCaseId: pathCase.loadCaseId,
    nodeResults: [], elementEndForces: [], elementExtrema: [], supportForceResults: [],
    maximumAbsoluteDisplacementM: null, maximumAbsoluteRotationRad: null,
    appliedForceTotalN: null, supportForceTotalN: null,
    appliedMomentAboutPathZeroNm: null, supportMomentAboutPathZeroNm: null,
    forceEquilibrium: null, momentEquilibrium: null, matrixResidual: null,
    supportDisplacementResidual: null,
    matrixDimensions: assembly?.matrixDimensions || null,
    freeDofCount: assembly?.freeDofCount ?? null,
    constrainedDofCount: assembly?.constrainedDofCount ?? null,
    pivotEvidence: solve?.trace || null, minimumPivot: solve?.minimumPivot ?? null,
    minimumScaledPivot: solve?.minimumScaledPivot ?? null,
    qualification: QUALIFICATION.BLOCKED, blockers: uniqueSorted(blockers),
    diagnostics: uniqueSorted(blockers).map((code) => diagnostic(code, `${pathCase.pathId}:${pathCase.loadCaseId}`, `Vertical beam solution is blocked: ${code}.`, { pathId: pathCase.pathId, loadCaseId: pathCase.loadCaseId }, 'WARNING')),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}
function expandSolution(size, free, values) { const result = Array(size).fill(0); free.forEach((index, offset) => { result[index] = values[offset]; }); return result; }
function validatePathCase(row, errors) {
  if (!stringValue(row?.pathId) || !stringValue(row?.loadCaseId)) errors.push('Vertical-beam solution identity is required.');
  const nodes = Array.isArray(row?.nodeResults) ? row.nodeResults : [];
  const supports = Array.isArray(row?.supportForceResults) ? row.supportForceResults : [];
  validateUnique(nodes, 'nodeId', `solution ${row?.pathId || ''} nodes`, errors);
  validateUnique(supports, 'resultId', `solution ${row?.pathId || ''} supports`, errors);
  if (row?.qualification === QUALIFICATION.READY) {
    const proofs = [row.forceEquilibrium, row.momentEquilibrium, row.matrixResidual, row.supportDisplacementResidual];
    if (proofs.some((proof) => !proof?.pass)) errors.push(`Vertical-beam solution ${row?.pathId || ''} has failed proof.`);
    if (nodes.some((item) => !Number.isFinite(item.verticalDisplacementM) || !Number.isFinite(item.rotationRad))) errors.push(`Vertical-beam solution ${row?.pathId || ''} has non-finite nodal results.`);
    if (supports.some((item) => !Number.isFinite(item.signedSupportForceN))) errors.push(`Vertical-beam solution ${row?.pathId || ''} has non-finite support force.`);
  }
  if (row?.semanticHash !== semanticHash(withoutHash(row))) errors.push(`Vertical-beam solution ${row?.pathId || ''} hash mismatch.`);
}
function validateUnique(rows, key, label, errors) {
  const ids = rows.map((item) => stringValue(item?.[key]));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) errors.push(`Vertical-beam ${label} must have unique ${key} values.`);
}
function assertInputs(model, profile) {
  const modelValidation = validateVerticalBeamModel(model), profileValidation = validateVerticalBeamSolverProfile(profile);
  if (!modelValidation.ok || !profileValidation.ok) throw new TypeError('Invalid vertical-beam solution input.');
  if (model.profile.semanticHash !== profile.semanticHash) throw new TypeError('Vertical-beam profile does not match model.');
}
function isReady(row) { return row.qualification === QUALIFICATION.READY; }
function caseOrder(a, b) { return `${a.pathId}|${a.loadCaseId}`.localeCompare(`${b.pathId}|${b.loadCaseId}`); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
