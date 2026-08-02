import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { reconstructControlledContinuumResultHashes } from './lafea-controlled-continuum-stage-route.js';
import {
  LAFEA_LUG_PINHOLE_EXECUTION_SCHEMA,
  validateLafeaLugPinholePhysicalProblemProjection,
} from './lafea-lug-pinhole-physical-problem-batch.js';

export const LAFEA_LOAD_DRIVEN_PILOT_QUALIFICATION_SCHEMA =
  'lafea-load-driven-pilot-qualification/v1';
export const LAFEA_LOAD_DRIVEN_PILOT_MANIFEST_SCHEMA =
  'lafea-load-driven-pilot-manifest/v1';
export const LAFEA_LOAD_DRIVEN_PILOT_RECEIPT_SCHEMA =
  'lafea-load-driven-pilot-receipt/v1';
export const LAFEA_LOAD_DRIVEN_PILOT_PRODUCER_REVISION = 'NB-T6D.1';

const INPUT_KEYS = Object.freeze([
  'qualificationId', 'exactHeadSha', 'projection', 'execution', 'tolerances',
]);
const TOLERANCE_KEYS = Object.freeze([
  'equilibriumAbsolute', 'displacementRelative', 'stressRelative',
]);
const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const STAGE_ID = 'LAFEA.3';

export function createLafeaLoadDrivenPilotQualification(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'load-driven qualification input');
  exactKeys(inputValue.tolerances, TOLERANCE_KEYS, 'load-driven tolerances');
  const qualificationId = text(inputValue.qualificationId, 'qualificationId');
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const tolerances = deepFreeze({
    equilibriumAbsolute: nonNegative(
      inputValue.tolerances.equilibriumAbsolute,
      'equilibriumAbsolute',
    ),
    displacementRelative: positive(
      inputValue.tolerances.displacementRelative,
      'displacementRelative',
    ),
    stressRelative: positive(
      inputValue.tolerances.stressRelative,
      'stressRelative',
    ),
  });
  const projection = requireProjection(inputValue.projection, exactHeadSha);
  const execution = requireExecution(inputValue.execution, projection);
  const appliedResultant = vector2(
    projection.physicalProblem.loadCase.resultant,
    'appliedResultant',
  );
  if (Math.hypot(...appliedResultant) === 0) {
    throw qualificationError('LAFEA_NB_T6D_NONZERO_RESULTANT_REQUIRED');
  }
  if (projection.physicalProblem.kinematics.mode !== 'BOUNDARY_ZERO') {
    throw qualificationError('LAFEA_NB_T6D_BOUNDARY_ZERO_REQUIRED');
  }

  const levels = deepFreeze(projection.levels.map((level, index) =>
    qualifyLevel({
      ordinal: index + 1,
      projection,
      execution,
      level,
      appliedResultant,
      equilibriumTolerance: tolerances.equilibriumAbsolute,
    })));
  const displacementConvergence = evaluateLafeaLoadDrivenConvergence(
    'MAXIMUM_NODAL_DISPLACEMENT_MAGNITUDE',
    projection.physicalProblem.units.length,
    levels.map((row) => row.maximumDisplacementMagnitude),
    tolerances.displacementRelative,
  );
  const stressConvergence = evaluateLafeaLoadDrivenConvergence(
    'MAXIMUM_RETAINED_INTEGRATION_POINT_VON_MISES',
    projection.physicalProblem.units.stress,
    levels.map((row) => row.maximumRetainedVonMises),
    tolerances.stressRelative,
  );
  if (displacementConvergence.status !== 'PASS') {
    throw qualificationError('LAFEA_NB_T6D_DISPLACEMENT_CONVERGENCE_BLOCKED');
  }
  if (stressConvergence.status !== 'PASS') {
    throw qualificationError('LAFEA_NB_T6D_STRESS_CONVERGENCE_BLOCKED');
  }

  const manifestBase = {
    schema: LAFEA_LOAD_DRIVEN_PILOT_MANIFEST_SCHEMA,
    producerRevision: LAFEA_LOAD_DRIVEN_PILOT_PRODUCER_REVISION,
    qualificationId,
    exactHeadSha,
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    projectionHash: projection.projectionHash,
    executionHash: execution.executionHash,
    requestHash: execution.request.semanticHash,
    controllerReceiptHash: execution.controllerResult.receipt.evidenceHash,
    benchmarkQualificationHash: execution.benchmarkQualification.semanticHash,
    physicalProblemHash: projection.physicalProblemHash,
    featureProjectionHash: projection.featureProjectionHash,
    appliedResultant,
    tolerances,
    requiredEvidence: [
      'NONZERO_APPLIED_RESULTANT',
      'BOUNDARY_ZERO_RESTRAINTS',
      'DETERMINISTIC_CHOLESKY_FREE_DOF_SOLVE',
      'REACTION_EQUILIBRIUM',
      'RETAINED_INTEGRATION_POINT_RECOVERY',
      'THREE_LEVEL_DISPLACEMENT_CONVERGENCE',
      'THREE_LEVEL_RETAINED_STRESS_CONVERGENCE',
    ],
  };
  const manifest = deepFreeze({
    ...manifestBase,
    semanticHash: canonicalLafeaSha256(manifestBase),
  });

  const receiptBase = {
    schema: LAFEA_LOAD_DRIVEN_PILOT_RECEIPT_SCHEMA,
    producerRevision: LAFEA_LOAD_DRIVEN_PILOT_PRODUCER_REVISION,
    qualificationId,
    manifestHash: manifest.semanticHash,
    levelEvidence: levels,
    displacementConvergence,
    stressConvergence,
    calculationAccepted: true,
    recoveryReady: true,
    equilibriumReady: true,
    freeDofSolveReady: true,
    selectedPilotQualified: true,
    status: 'LOAD_DRIVEN_SELECTED_PILOT_QUALIFIED',
    diagnostics: [],
  };
  const receiptSemanticBasis = { ...receiptBase };
  delete receiptSemanticBasis.diagnostics;
  const receiptSemanticHash = canonicalLafeaSha256(receiptSemanticBasis);
  const receipt = deepFreeze({
    ...receiptBase,
    semanticHash: receiptSemanticHash,
    evidenceHash: canonicalLafeaSha256({
      schema: 'lafea-load-driven-pilot-receipt-evidence/v1',
      semanticHash: receiptSemanticHash,
      diagnostics: receiptBase.diagnostics,
    }),
  });

  const packageBase = {
    schema: LAFEA_LOAD_DRIVEN_PILOT_QUALIFICATION_SCHEMA,
    producerRevision: LAFEA_LOAD_DRIVEN_PILOT_PRODUCER_REVISION,
    qualificationId,
    exactHeadSha,
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    manifest,
    receipt,
    status: receipt.status,
    authority: {
      selectedLoadDrivenPilotEvidence: true,
      selectedPilotQualification: true,
      generalT7dAuthorized: false,
      additionalContinuumTemplatesAuthorized: false,
      arbitraryOuterProfileSupported: false,
      arbitraryHoleTopologySupported: false,
      shellAuthorized: false,
      sclAuthorized: false,
      structuralStressAuthorized: false,
      assessmentReady: false,
      codeReady: false,
      reportAuthority: false,
      releaseQualified: false,
    },
  };
  return deepFreeze({
    ...packageBase,
    semanticHash: canonicalLafeaSha256(packageBase),
  });
}

export function validateLafeaLoadDrivenPilotQualification(value) {
  try {
    if (!value || value.schema !== LAFEA_LOAD_DRIVEN_PILOT_QUALIFICATION_SCHEMA
      || value.producerRevision !== LAFEA_LOAD_DRIVEN_PILOT_PRODUCER_REVISION
      || value.templateId !== TEMPLATE_ID || value.stageId !== STAGE_ID
      || value.status !== 'LOAD_DRIVEN_SELECTED_PILOT_QUALIFIED'
      || value.receipt?.selectedPilotQualified !== true
      || value.receipt?.status !== value.status
      || value.receipt?.manifestHash !== value.manifest?.semanticHash
      || value.authority?.selectedPilotQualification !== true
      || value.authority?.generalT7dAuthorized !== false
      || value.authority?.shellAuthorized !== false
      || value.authority?.codeReady !== false
      || value.authority?.releaseQualified !== false) {
      throw qualificationError('LAFEA_NB_T6D_QUALIFICATION_CONTRACT_INVALID');
    }
    const packageBasis = { ...value };
    delete packageBasis.semanticHash;
    if (canonicalLafeaSha256(packageBasis) !== value.semanticHash) {
      throw qualificationError('LAFEA_NB_T6D_QUALIFICATION_HASH_TAMPERED');
    }
    if (!isDeepFrozen(value)) {
      throw qualificationError('LAFEA_NB_T6D_QUALIFICATION_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_NB_T6D_QUALIFICATION_INVALID'],
    });
  }
}

function requireProjection(value, exactHeadSha) {
  const validation = validateLafeaLugPinholePhysicalProblemProjection(value);
  if (!validation.ok) {
    throw qualificationError(
      'LAFEA_NB_T6D_PROJECTION_INVALID',
      validation.errors.join(' '),
    );
  }
  if (value.releaseRecord.candidateHeadSha !== exactHeadSha) {
    throw qualificationError('LAFEA_NB_T6D_EXACT_HEAD_PARENT_STALE');
  }
  return value;
}

function requireExecution(value, projection) {
  if (!value || value.schema !== LAFEA_LUG_PINHOLE_EXECUTION_SCHEMA
    || value.producerRevision !== 'NB-T6C.1'
    || value.stageId !== STAGE_ID || value.templateId !== TEMPLATE_ID
    || value.projectionHash !== projection.projectionHash
    || value.status !== 'ACCEPTED' || value.accepted !== true
    || value.controllerResult?.status !== 'ACCEPTED'
    || value.controllerResult?.accepted !== true
    || value.controllerResult?.receipt?.status !== 'ACCEPTED'
    || value.controllerResult?.receipt?.calculationAccepted !== true
    || value.controllerResult?.receipt?.recoveryReady !== true
    || value.controllerResult?.receipt?.convergenceReady !== true
    || value.controllerResult?.receipt?.resultReady !== true
    || value.controllerResult?.receipt?.codeReady !== false
    || value.controllerResult?.receipt?.releaseQualified !== false
    || value.authority?.generalT7dAuthorized !== false
    || value.authority?.shellAuthorized !== false
    || value.authority?.codeReady !== false
    || value.authority?.releaseQualified !== false) {
    throw qualificationError('LAFEA_NB_T6D_EXECUTION_NOT_ACCEPTED');
  }
  const expectedExecutionHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6c-execution-hash-input/v1',
    projectionHash: projection.projectionHash,
    requestHash: value.request.semanticHash,
    benchmarkQualificationHash: value.benchmarkQualification.semanticHash,
    controllerReceiptHash: value.controllerResult.receipt.evidenceHash,
    controllerStatus: value.controllerResult.status,
  });
  if (expectedExecutionHash !== value.executionHash) {
    throw qualificationError('LAFEA_NB_T6D_EXECUTION_HASH_TAMPERED');
  }
  const request = value.request;
  if (request.canonicalModelHash !== projection.canonicalModelHash
    || request.analysisGeometryHash !== projection.analysisGeometryHash
    || request.mappingPackageHash !== projection.mappingPackage.semanticHash
    || request.boundBindingHash !== projection.mappingPackage.boundBinding.semanticHash
    || request.benchmarkQualificationHash
      !== value.benchmarkQualification.semanticHash
    || value.benchmarkQualification.mappingPackageHash
      !== projection.mappingPackage.semanticHash) {
    throw qualificationError('LAFEA_NB_T6D_EXECUTION_PARENT_STALE');
  }
  return value;
}

function qualifyLevel({
  ordinal,
  projection,
  execution,
  level,
  appliedResultant,
  equilibriumTolerance,
}) {
  const controllerLevel = execution.controllerResult.levelResults[ordinal - 1];
  if (controllerLevel?.ordinal !== ordinal
    || controllerLevel.levelEvidence?.status !== 'ACCEPTED'
    || controllerLevel.levelEvidence?.calculationAccepted !== true
    || controllerLevel.levelEvidence?.recoveryAuthority
      !== 'RETAINED_INTEGRATION_POINT_VALUES'
    || controllerLevel.levelEvidence?.projectedDisplayHash !== null
    || controllerLevel.levelEvidence?.projectedDisplayRole !== 'NOT_PRODUCED'
    || controllerLevel.meshEvidence?.meshHash !== level.meshEvidence.meshHash) {
    throw qualificationError('LAFEA_NB_T6D_LEVEL_EVIDENCE_INVALID');
  }
  const result = controllerLevel.execution?.result;
  if (result?.schema !== 'local-continuum-result/v1'
    || result?.qualification?.state !== 'ACCEPTED') {
    throw qualificationError('LAFEA_NB_T6D_LEVEL_RESULT_NOT_ACCEPTED');
  }
  const reconstructed = reconstructControlledContinuumResultHashes(result);
  if (JSON.stringify(reconstructed) !== JSON.stringify(result.semanticHashes)) {
    throw qualificationError('LAFEA_NB_T6D_RESULT_HASH_RECONSTRUCTION_FAILED');
  }
  const reconstructedResultHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-result-hash-evidence/v1',
    reconstructed,
  });
  if (reconstructedResultHash !== controllerLevel.levelEvidence.resultHash) {
    throw qualificationError('LAFEA_NB_T6D_RESULT_EVIDENCE_HASH_MISMATCH');
  }
  const loadCaseId = projection.physicalProblem.loadCase.loadCaseId;
  const sourceLoadCase = level.document.loadCases.find(
    (row) => row.loadCaseId === loadCaseId,
  );
  const resultLoadCase = result.loadCaseResults?.find(
    (row) => row.loadCaseId === loadCaseId,
  );
  if (!sourceLoadCase || !resultLoadCase) {
    throw qualificationError('LAFEA_NB_T6D_LOAD_CASE_MISSING');
  }
  const projectedResultant = sourceLoadCase.nodalForces.reduce(
    (sum, row) => [sum[0] + row.fx, sum[1] + row.fy],
    [0, 0],
  );
  assertVectorClose(
    projectedResultant,
    appliedResultant,
    equilibriumTolerance,
    'LAFEA_NB_T6D_PROJECTED_RESULTANT_MISMATCH',
  );
  if (!Array.isArray(resultLoadCase.freeDofIdentities)
    || resultLoadCase.freeDofIdentities.length === 0
    || resultLoadCase.solverEvidence?.method !== 'DETERMINISTIC_CHOLESKY'
    || resultLoadCase.solverEvidence?.accepted !== true
    || !Array.isArray(resultLoadCase.solverEvidence?.pivots)
    || resultLoadCase.solverEvidence.pivots.length === 0
    || resultLoadCase.equilibrium?.accepted !== true) {
    throw qualificationError('LAFEA_NB_T6D_FREE_DOF_SOLVE_EVIDENCE_INVALID');
  }
  const equilibriumClosure = [
    resultLoadCase.equilibrium.reactionPlusAppliedForce?.x,
    resultLoadCase.equilibrium.reactionPlusAppliedForce?.y,
  ];
  assertVectorClose(
    equilibriumClosure,
    [0, 0],
    Math.max(
      equilibriumTolerance,
      resultLoadCase.equilibrium.reactionEquilibriumTolerance ?? 0,
    ),
    'LAFEA_NB_T6D_REACTION_EQUILIBRIUM_FAILED',
  );
  const reactionResultant = resultLoadCase.reactions.reduce(
    (sum, row) => {
      const axis = row.dofIdentity.endsWith(':UX') ? 0 : 1;
      sum[axis] += row.value;
      return sum;
    },
    [0, 0],
  );
  assertVectorClose(
    [
      reactionResultant[0] + appliedResultant[0],
      reactionResultant[1] + appliedResultant[1],
    ],
    [0, 0],
    Math.max(
      equilibriumTolerance,
      resultLoadCase.equilibrium.reactionEquilibriumTolerance ?? 0,
    ),
    'LAFEA_NB_T6D_REACTION_RESULTANT_MISMATCH',
  );
  const maximumDisplacementMagnitude = Math.max(
    ...resultLoadCase.nodalDisplacements.map((row) => Math.hypot(row.ux, row.uy)),
  );
  const retainedVonMises = resultLoadCase.elementResults.flatMap((element) => {
    if (element.recoveryLayer !== 'INTEGRATION_POINT'
      || !Array.isArray(element.gaussPointResults)
      || element.gaussPointResults.length === 0) {
      throw qualificationError('LAFEA_NB_T6D_INTEGRATION_POINT_RECOVERY_REQUIRED');
    }
    return element.gaussPointResults.map((point) => point.vonMises);
  });
  const maximumRetainedVonMises = Math.max(...retainedVonMises);
  for (const [value, code] of [
    [maximumDisplacementMagnitude, 'LAFEA_NB_T6D_DISPLACEMENT_INVALID'],
    [maximumRetainedVonMises, 'LAFEA_NB_T6D_STRESS_INVALID'],
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw qualificationError(code);
    }
  }
  const base = {
    schema: 'lafea-load-driven-pilot-level-evidence/v1',
    ordinal,
    meshHash: level.meshEvidence.meshHash,
    meshProfileHash: level.meshEvidence.meshProfileHash,
    elementCount: level.meshEvidence.mesh.elements.length,
    projectedResultant,
    reactionResultant,
    equilibriumClosure,
    freeDofCount: resultLoadCase.freeDofIdentities.length,
    constrainedDofCount: resultLoadCase.constrainedDofIdentities.length,
    solverMethod: resultLoadCase.solverEvidence.method,
    minimumPivot: resultLoadCase.solverEvidence.minimumPivot,
    pivotRatio: resultLoadCase.solverEvidence.pivotRatio,
    maximumDisplacementMagnitude,
    maximumRetainedVonMises,
    executionHash: controllerLevel.levelEvidence.executionHash,
    resultHash: controllerLevel.levelEvidence.resultHash,
    recoveryHash: controllerLevel.levelEvidence.recoveryHash,
    integrationPointResultHash:
      controllerLevel.levelEvidence.integrationPointResultHash,
    status: 'PASS',
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function evaluateLafeaLoadDrivenConvergence(
  quantityId, units, observations, tolerance,
) {
  if (!Array.isArray(observations) || observations.length !== 3
    || observations.some((value) => !Number.isFinite(value))) {
    throw qualificationError('LAFEA_NB_T6D_CONVERGENCE_OBSERVATIONS_INVALID');
  }
  const relativeChanges = [null];
  for (let index = 1; index < observations.length; index += 1) {
    relativeChanges.push(
      Math.abs(observations[index] - observations[index - 1])
        / Math.max(1, Math.abs(observations[index])),
    );
  }
  const fineRelativeChange = relativeChanges[2];
  const trend = fineRelativeChange <= relativeChanges[1]
    ? 'IMPROVING_OR_STABLE' : 'NOT_IMPROVING';
  const status = fineRelativeChange <= tolerance ? 'PASS' : 'BLOCKED';
  const base = {
    schema: 'lafea-load-driven-pilot-convergence-evidence/v1',
    quantityId,
    units,
    tolerance,
    observations,
    relativeChanges,
    fineRelativeChange,
    trend,
    status,
    reasons: status === 'PASS'
      ? [] : ['FINE_LEVEL_CHANGE_EXCEEDS_TOLERANCE'],
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function assertVectorClose(actual, expected, tolerance, code) {
  if (!Array.isArray(actual) || actual.length !== 2
    || actual.some((value) => !Number.isFinite(value))
    || actual.some((value, index) =>
      Math.abs(value - expected[index]) > tolerance)) {
    throw qualificationError(code);
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw qualificationError('LAFEA_NB_T6D_RECORD_INVALID', `${label} invalid.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw qualificationError('LAFEA_NB_T6D_EXACT_KEYS_INVALID', `${label} keys differ.`);
  }
}

function vector2(value, label) {
  if (!Array.isArray(value) || value.length !== 2
    || value.some((row) => typeof row !== 'number' || !Number.isFinite(row))) {
    throw qualificationError('LAFEA_NB_T6D_VECTOR2_INVALID', `${label} invalid.`);
  }
  return value.map((row) => Object.is(row, -0) ? 0 : row);
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw qualificationError('LAFEA_NB_T6D_EXACT_HEAD_SHA_INVALID');
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw qualificationError('LAFEA_NB_T6D_TEXT_REQUIRED', `${label} required.`);
  }
  return value;
}

function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw qualificationError('LAFEA_NB_T6D_NONNEGATIVE_REQUIRED', `${label} invalid.`);
  }
  return value;
}

function positive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw qualificationError('LAFEA_NB_T6D_POSITIVE_REQUIRED', `${label} invalid.`);
  }
  return value;
}

function qualificationError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
