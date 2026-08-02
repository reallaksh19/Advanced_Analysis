import {
  LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  templateReleaseSha256,
} from './release-record-v2-hash.js';

export const LAFEA_CONTROLLED_CONTINUUM_REQUEST_SCHEMA =
  'lafea-controlled-continuum-execution-request/v1';
export const LAFEA_CONTROLLED_CONTINUUM_LEVEL_EVIDENCE_SCHEMA =
  'lafea-controlled-continuum-level-evidence/v1';
export const LAFEA_CONTROLLED_CONTINUUM_RECEIPT_SCHEMA =
  'lafea-controlled-continuum-execution-receipt/v1';
export const LAFEA_CONTROLLED_CONTINUUM_PILOT_ID =
  'C2D-LUG-PINHOLE->LAFEA.3/B7C';
export const LAFEA_CONTROLLED_CONTINUUM_RECEIPT_STATUSES = Object.freeze([
  'ACCEPTED', 'BLOCKED', 'FAILED',
]);
export const LAFEA_CONTROLLED_CONTINUUM_LEVEL_STATUSES = Object.freeze([
  'ACCEPTED', 'BLOCKED', 'FAILED',
]);
export const LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_BOUNDARY = deepFreeze({
  schema: 'lafea-controlled-continuum-controller-boundary/v1',
  authority: 'B7C_CONTRACT_ONLY_CONTROLLER_IMPLEMENTATION_WITHHELD',
  pilotId: LAFEA_CONTROLLED_CONTINUUM_PILOT_ID,
  uiMay: ['SUBMIT_EXACT_REQUEST', 'DISPLAY_RECEIPT_AND_DIAGNOSTICS'],
  uiMustNot: [
    'CALL_EXECUTE_LAFEA_STAGE',
    'CALL_CALCULATE_LOCAL_CONTINUUM',
    'SUPPLY_SOURCE_HASH',
    'SUPPLY_SOURCE_AUTHORITY_HASH',
    'REGISTER_LIFECYCLE_EVIDENCE',
    'PROJECT_ASSESSMENT_STRESS',
    'PROMOTE_CODE_READY',
    'PROMOTE_RELEASE_QUALIFIED',
  ],
  requiredControllerSequence: [
    'VALIDATE_REQUEST',
    'REVALIDATE_ENGINE_EXECUTABLE_RELEASE_RECORD',
    'REVALIDATE_CURRENT_TARGET_COMPATIBILITY',
    'REVALIDATE_B7A_MAPPING_PACKAGE',
    'REVALIDATE_B7B_BENCHMARK_QUALIFICATION',
    'VERIFY_IMPORTED_DOCUMENT_REVISION',
    'ISSUE_SOURCE_AUTHORITY',
    'EXECUTE_EXACT_THREE_LEVEL_PILOT',
    'CREATE_AUTHORITATIVE_INTEGRATION_POINT_RECOVERY',
    'EVALUATE_PILOT_CONVERGENCE',
    'CREATE_IMMUTABLE_RECEIPT',
  ],
});

const SHA = /^sha256:[0-9a-f]{64}$/u;
const ENGINEERING_HASH = /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u;
const REVISION = /^fnv1a64:[0-9a-f]{16}$/u;
const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const STAGE_ID = 'LAFEA.3';
const REQUEST_KEYS = Object.freeze([
  'schema', 'requestId', 'pilotId', 'templateId', 'stageId',
  'releaseRecordHash', 'releaseAuthorityState', 'releaseValidity',
  'compatibilityReceiptHash', 'compatibilityStatus',
  'mappingPackageHash', 'mappingStatus', 'boundBindingHash',
  'boundBindingStatus', 'benchmarkQualificationHash', 'benchmarkStatus',
  'importedDocumentRevisionDigest', 'sourceAuthorityRequest',
  'canonicalModelHash', 'analysisGeometryHash', 'meshLevels',
  'recoveryProfileHash', 'convergenceProfileHash',
  'hashProfile', 'semanticHash',
]);
const REQUEST_CREATE_KEYS = Object.freeze(REQUEST_KEYS.filter((key) =>
  !['schema', 'pilotId', 'templateId', 'stageId', 'hashProfile', 'semanticHash']
    .includes(key)));
const SOURCE_AUTHORITY_REQUEST_KEYS = Object.freeze([
  'originRef', 'expectedStageId', 'expectedDocumentRevisionDigest',
  'requestedRole',
]);
const MESH_LEVEL_KEYS = Object.freeze([
  'ordinal', 'meshHash', 'meshProfileHash', 'elementType',
  'canonicalModelHash', 'analysisGeometryHash',
]);
const LEVEL_KEYS = Object.freeze([
  'schema', 'requestHash', 'ordinal', 'meshHash', 'sourceAuthorityHash',
  'exactSourceHash', 'importedDocumentRevisionDigest', 'executionHash',
  'resultHash', 'recoveryHash', 'resultSchema', 'calculationAccepted',
  'recoveryAuthority', 'integrationPointResultHash',
  'projectedDisplayHash', 'projectedDisplayRole', 'status', 'diagnostics',
  'hashProfile', 'semanticHash', 'evidenceHash',
]);
const LEVEL_CREATE_KEYS = Object.freeze(LEVEL_KEYS.filter((key) =>
  !['schema', 'hashProfile', 'semanticHash', 'evidenceHash'].includes(key)));
const RECEIPT_KEYS = Object.freeze([
  'schema', 'receiptId', 'request', 'requestHash',
  'currentDocumentRevisionDigest', 'sourceAuthorityHash', 'exactSourceHash',
  'levelEvidence', 'pilotConvergence', 'lifecycleParents',
  'calculationAccepted', 'recoveryReady', 'convergenceReady', 'resultReady',
  'assessmentReady', 'codeReady', 'releaseQualified',
  'generalT7dAuthorized', 'status', 'diagnostics',
  'hashProfile', 'semanticHash', 'evidenceHash',
]);
const RECEIPT_CREATE_KEYS = Object.freeze([
  'receiptId', 'request', 'currentDocumentRevisionDigest',
  'sourceAuthorityHash', 'exactSourceHash', 'levelEvidence',
  'pilotConvergence', 'diagnostics',
]);
const CONVERGENCE_INPUT_KEYS = Object.freeze([
  'quantityId', 'units', 'tolerance', 'levels',
]);
const CONVERGENCE_LEVEL_KEYS = Object.freeze([
  'ordinal', 'meshHash', 'recoveryHash', 'observedQuantity',
]);

export function createControlledContinuumExecutionRequest(input) {
  exactKeys(input, REQUEST_CREATE_KEYS, 'Controlled continuum request input');
  const sourceAuthorityRequest = normalizeSourceAuthorityRequest(
    input.sourceAuthorityRequest,
    input.importedDocumentRevisionDigest,
  );
  const meshLevels = normalizeMeshLevels(
    input.meshLevels,
    input.canonicalModelHash,
    input.analysisGeometryHash,
  );
  requireText(input.requestId, 'requestId');
  requireSha(input.releaseRecordHash, 'releaseRecordHash');
  requireSha(input.compatibilityReceiptHash, 'compatibilityReceiptHash');
  requireSha(input.mappingPackageHash, 'mappingPackageHash');
  requireSha(input.boundBindingHash, 'boundBindingHash');
  requireSha(input.benchmarkQualificationHash, 'benchmarkQualificationHash');
  requireSha(input.canonicalModelHash, 'canonicalModelHash');
  requireSha(input.analysisGeometryHash, 'analysisGeometryHash');
  requireEngineeringHash(input.recoveryProfileHash, 'recoveryProfileHash');
  requireEngineeringHash(input.convergenceProfileHash, 'convergenceProfileHash');
  requireRevision(
    input.importedDocumentRevisionDigest,
    'importedDocumentRevisionDigest',
  );
  if (input.releaseAuthorityState !== 'ENGINE_EXECUTABLE'
    || input.releaseValidity !== 'CURRENT') {
    throw new TypeError('Controlled continuum request requires a current ENGINE_EXECUTABLE release record.');
  }
  if (input.compatibilityStatus !== 'CURRENT') {
    throw new TypeError('Controlled continuum request requires a CURRENT compatibility receipt.');
  }
  if (input.mappingStatus !== 'MAPPING_EVIDENCE_QUALIFIED'
    || input.boundBindingStatus !== 'BOUND') {
    throw new TypeError('Controlled continuum request requires qualified B7A mapping evidence and a BOUND mesh binding.');
  }
  if (input.benchmarkStatus !== 'BENCHMARK_EVIDENCE_QUALIFIED') {
    throw new TypeError('Controlled continuum request requires qualified B7B benchmark evidence.');
  }
  const base = {
    schema: LAFEA_CONTROLLED_CONTINUUM_REQUEST_SCHEMA,
    requestId: input.requestId,
    pilotId: LAFEA_CONTROLLED_CONTINUUM_PILOT_ID,
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    releaseRecordHash: input.releaseRecordHash,
    releaseAuthorityState: input.releaseAuthorityState,
    releaseValidity: input.releaseValidity,
    compatibilityReceiptHash: input.compatibilityReceiptHash,
    compatibilityStatus: input.compatibilityStatus,
    mappingPackageHash: input.mappingPackageHash,
    mappingStatus: input.mappingStatus,
    boundBindingHash: input.boundBindingHash,
    boundBindingStatus: input.boundBindingStatus,
    benchmarkQualificationHash: input.benchmarkQualificationHash,
    benchmarkStatus: input.benchmarkStatus,
    importedDocumentRevisionDigest: input.importedDocumentRevisionDigest,
    sourceAuthorityRequest,
    canonicalModelHash: input.canonicalModelHash,
    analysisGeometryHash: input.analysisGeometryHash,
    meshLevels,
    recoveryProfileHash: input.recoveryProfileHash,
    convergenceProfileHash: input.convergenceProfileHash,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  return deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

export function validateControlledContinuumExecutionRequest(value) {
  return validateRebuild(
    value,
    REQUEST_KEYS,
    REQUEST_CREATE_KEYS,
    (input) => createControlledContinuumExecutionRequest(input),
    'Controlled continuum request',
  );
}

export function createControlledContinuumLevelEvidence(input) {
  exactKeys(input, LEVEL_CREATE_KEYS, 'Controlled continuum level evidence input');
  requireSha(input.requestHash, 'requestHash');
  integer(input.ordinal, 'ordinal');
  if (![1, 2, 3].includes(input.ordinal)) {
    throw new TypeError('Level ordinal must be 1, 2 or 3.');
  }
  requireSha(input.meshHash, 'meshHash');
  requireSha(input.sourceAuthorityHash, 'sourceAuthorityHash');
  requireSha(input.exactSourceHash, 'exactSourceHash');
  requireRevision(
    input.importedDocumentRevisionDigest,
    'importedDocumentRevisionDigest',
  );
  nullableSha(input.executionHash, 'executionHash');
  nullableSha(input.resultHash, 'resultHash');
  nullableSha(input.recoveryHash, 'recoveryHash');
  nullableSha(input.integrationPointResultHash, 'integrationPointResultHash');
  nullableSha(input.projectedDisplayHash, 'projectedDisplayHash');
  boolean(input.calculationAccepted, 'calculationAccepted');
  oneOf(input.status, LAFEA_CONTROLLED_CONTINUUM_LEVEL_STATUSES, 'status');
  const diagnostics = textArray(input.diagnostics, 'diagnostics');
  if (input.resultSchema !== 'local-continuum-result/v1') {
    throw new TypeError('Controlled continuum level result schema is invalid.');
  }
  if (!['RETAINED_INTEGRATION_POINT_VALUES', 'NOT_PRODUCED']
    .includes(input.recoveryAuthority)) {
    throw new TypeError('Controlled continuum recovery authority is invalid.');
  }
  if (!['NOT_PRODUCED', 'DISPLAY_ONLY_NOT_ASSESSMENT_AUTHORITY']
    .includes(input.projectedDisplayRole)) {
    throw new TypeError('Projected display role is invalid.');
  }
  if (input.projectedDisplayHash === null
    && input.projectedDisplayRole !== 'NOT_PRODUCED') {
    throw new TypeError('Projected display role requires a display hash.');
  }
  if (input.projectedDisplayHash !== null
    && input.projectedDisplayRole !== 'DISPLAY_ONLY_NOT_ASSESSMENT_AUTHORITY') {
    throw new TypeError('Projected display values must remain display-only.');
  }
  if (input.status === 'ACCEPTED') {
    for (const field of [
      'executionHash', 'resultHash', 'recoveryHash',
      'integrationPointResultHash',
    ]) {
      if (input[field] === null) {
        throw new TypeError(`ACCEPTED level evidence requires ${field}.`);
      }
    }
    if (!input.calculationAccepted
      || input.recoveryAuthority !== 'RETAINED_INTEGRATION_POINT_VALUES') {
      throw new TypeError('ACCEPTED level evidence requires calculation acceptance and retained integration-point recovery.');
    }
  }
  if (input.status !== 'ACCEPTED' && diagnostics.length === 0) {
    throw new TypeError('Blocked or failed level evidence requires diagnostics.');
  }
  if (!input.calculationAccepted && input.recoveryHash !== null) {
    throw new TypeError('Rejected calculation cannot claim recovery evidence.');
  }
  const base = {
    schema: LAFEA_CONTROLLED_CONTINUUM_LEVEL_EVIDENCE_SCHEMA,
    requestHash: input.requestHash,
    ordinal: input.ordinal,
    meshHash: input.meshHash,
    sourceAuthorityHash: input.sourceAuthorityHash,
    exactSourceHash: input.exactSourceHash,
    importedDocumentRevisionDigest: input.importedDocumentRevisionDigest,
    executionHash: input.executionHash,
    resultHash: input.resultHash,
    recoveryHash: input.recoveryHash,
    resultSchema: input.resultSchema,
    calculationAccepted: input.calculationAccepted,
    recoveryAuthority: input.recoveryAuthority,
    integrationPointResultHash: input.integrationPointResultHash,
    projectedDisplayHash: input.projectedDisplayHash,
    projectedDisplayRole: input.projectedDisplayRole,
    status: input.status,
    diagnostics,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  const semanticBasis = { ...base };
  delete semanticBasis.diagnostics;
  const semanticHash = templateReleaseSha256(semanticBasis);
  const evidenceHash = templateReleaseSha256({
    schema: 'lafea-controlled-continuum-level-evidence-diagnostics/v1',
    semanticHash,
    diagnostics,
  });
  return deepFreeze({ ...base, semanticHash, evidenceHash });
}

export function validateControlledContinuumLevelEvidence(value) {
  return validateRebuild(
    value,
    LEVEL_KEYS,
    LEVEL_CREATE_KEYS,
    (input) => createControlledContinuumLevelEvidence(input),
    'Controlled continuum level evidence',
  );
}

export function createControlledContinuumExecutionReceipt(input) {
  exactKeys(input, RECEIPT_CREATE_KEYS, 'Controlled continuum receipt input');
  requireValid(
    validateControlledContinuumExecutionRequest(input.request),
    'Controlled continuum request is invalid.',
  );
  requireText(input.receiptId, 'receiptId');
  requireRevision(
    input.currentDocumentRevisionDigest,
    'currentDocumentRevisionDigest',
  );
  requireSha(input.sourceAuthorityHash, 'sourceAuthorityHash');
  requireSha(input.exactSourceHash, 'exactSourceHash');
  const diagnostics = textArray(input.diagnostics, 'diagnostics');
  const levelEvidence = normalizeReceiptLevels(
    input.levelEvidence,
    input.request,
    input.sourceAuthorityHash,
    input.exactSourceHash,
  );
  const revisionCurrent = input.currentDocumentRevisionDigest
    === input.request.importedDocumentRevisionDigest;
  const calculationAccepted = revisionCurrent
    && levelEvidence.every((row) => row.calculationAccepted && row.status === 'ACCEPTED');
  const recoveryReady = calculationAccepted
    && levelEvidence.every((row) =>
      row.recoveryAuthority === 'RETAINED_INTEGRATION_POINT_VALUES'
      && row.integrationPointResultHash !== null
      && row.recoveryHash !== null);
  const pilotConvergence = normalizePilotConvergence(
    input.pilotConvergence,
    input.request,
    levelEvidence,
    recoveryReady,
  );
  const convergenceReady = recoveryReady && pilotConvergence.status === 'PASS';
  const resultReady = calculationAccepted && recoveryReady;
  const reasons = [];
  if (!revisionCurrent) reasons.push('IMPORTED_DOCUMENT_REVISION_STALE');
  levelEvidence.forEach((row) => {
    if (row.status !== 'ACCEPTED') reasons.push(`LEVEL_${row.ordinal}_${row.status}`);
  });
  reasons.push(...pilotConvergence.reasons);
  const status = !revisionCurrent || !calculationAccepted || !recoveryReady
    ? levelEvidence.some((row) => row.status === 'FAILED') ? 'FAILED' : 'BLOCKED'
    : convergenceReady ? 'ACCEPTED' : 'BLOCKED';
  const lifecycleParents = deepFreeze({
    schema: 'lafea-controlled-continuum-lifecycle-parents/v1',
    stageId: STAGE_ID,
    recoveryHash: levelEvidence[2].recoveryHash,
    recoverySetHash: pilotConvergence.recoverySetHash,
    convergenceProfileHash: input.request.convergenceProfileHash,
    registrationAuthorized: status === 'ACCEPTED',
  });
  const base = {
    schema: LAFEA_CONTROLLED_CONTINUUM_RECEIPT_SCHEMA,
    receiptId: input.receiptId,
    request: input.request,
    requestHash: input.request.semanticHash,
    currentDocumentRevisionDigest: input.currentDocumentRevisionDigest,
    sourceAuthorityHash: input.sourceAuthorityHash,
    exactSourceHash: input.exactSourceHash,
    levelEvidence,
    pilotConvergence,
    lifecycleParents,
    calculationAccepted,
    recoveryReady,
    convergenceReady,
    resultReady,
    assessmentReady: false,
    codeReady: false,
    releaseQualified: false,
    generalT7dAuthorized: false,
    status,
    diagnostics: [...new Set([...diagnostics, ...reasons])].sort(),
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  const semanticBasis = { ...base };
  delete semanticBasis.diagnostics;
  const semanticHash = templateReleaseSha256(semanticBasis);
  const evidenceHash = templateReleaseSha256({
    schema: 'lafea-controlled-continuum-receipt-diagnostics/v1',
    semanticHash,
    diagnostics: base.diagnostics,
  });
  return deepFreeze({ ...base, semanticHash, evidenceHash });
}

export function validateControlledContinuumExecutionReceipt(value) {
  return validateRebuild(
    value,
    RECEIPT_KEYS,
    RECEIPT_CREATE_KEYS,
    (input) => createControlledContinuumExecutionReceipt(input),
    'Controlled continuum receipt',
  );
}

function normalizeSourceAuthorityRequest(value, revisionDigest) {
  exactKeys(value, SOURCE_AUTHORITY_REQUEST_KEYS, 'sourceAuthorityRequest');
  requireText(value.originRef, 'sourceAuthorityRequest.originRef');
  if (value.expectedStageId !== STAGE_ID) {
    throw new TypeError('Source-authority request must target LAFEA.3.');
  }
  requireRevision(
    value.expectedDocumentRevisionDigest,
    'sourceAuthorityRequest.expectedDocumentRevisionDigest',
  );
  if (value.expectedDocumentRevisionDigest !== revisionDigest) {
    throw new TypeError('Source-authority request document revision is stale.');
  }
  if (value.requestedRole !== 'AUTHORITATIVE_EDITABLE_STAGE_SOURCE') {
    throw new TypeError('Source-authority request role is invalid.');
  }
  return { ...value };
}

function normalizeMeshLevels(value, canonicalModelHash, analysisGeometryHash) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError('Controlled continuum request requires exactly three mesh levels.');
  }
  const levels = [...value].sort((left, right) => left.ordinal - right.ordinal)
    .map((level) => {
      exactKeys(level, MESH_LEVEL_KEYS, 'mesh level');
      integer(level.ordinal, 'meshLevel.ordinal');
      if (![1, 2, 3].includes(level.ordinal)) {
        throw new TypeError('Mesh level ordinal must be 1, 2 or 3.');
      }
      requireSha(level.meshHash, 'meshLevel.meshHash');
      requireEngineeringHash(level.meshProfileHash, 'meshLevel.meshProfileHash');
      requireSha(level.canonicalModelHash, 'meshLevel.canonicalModelHash');
      requireSha(level.analysisGeometryHash, 'meshLevel.analysisGeometryHash');
      if (level.elementType !== 'T6') {
        throw new TypeError('Controlled continuum pilot requires T6 at every level.');
      }
      if (level.canonicalModelHash !== canonicalModelHash
        || level.analysisGeometryHash !== analysisGeometryHash) {
        throw new TypeError('Mesh level model or geometry parent is stale.');
      }
      return { ...level };
    });
  if (levels.some((row, index) => row.ordinal !== index + 1)) {
    throw new TypeError('Controlled continuum mesh levels must be ordinal 1, 2 and 3.');
  }
  if (new Set(levels.map((row) => row.meshHash)).size !== 3
    || new Set(levels.map((row) => row.meshProfileHash)).size !== 3) {
    throw new TypeError('Controlled continuum mesh levels require distinct mesh and profile hashes.');
  }
  return levels;
}

function normalizeReceiptLevels(value, request, sourceAuthorityHash, exactSourceHash) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError('Controlled continuum receipt requires exactly three level records.');
  }
  const levels = [...value].sort((left, right) => left.ordinal - right.ordinal);
  levels.forEach((level, index) => {
    requireValid(
      validateControlledContinuumLevelEvidence(level),
      `Level ${index + 1} evidence is invalid.`,
    );
    const expected = request.meshLevels[index];
    if (level.ordinal !== expected.ordinal
      || level.meshHash !== expected.meshHash
      || level.requestHash !== request.semanticHash
      || level.sourceAuthorityHash !== sourceAuthorityHash
      || level.exactSourceHash !== exactSourceHash
      || level.importedDocumentRevisionDigest
        !== request.importedDocumentRevisionDigest) {
      throw new TypeError(`Level ${index + 1} parent identity is stale.`);
    }
  });
  const acceptedRecoveries = levels
    .filter((row) => row.recoveryHash !== null)
    .map((row) => row.recoveryHash);
  if (new Set(acceptedRecoveries).size !== acceptedRecoveries.length) {
    throw new TypeError('Controlled continuum levels require distinct recovery hashes.');
  }
  return levels;
}

function normalizePilotConvergence(value, request, levels, recoveryReady) {
  if (value === null
    || (value?.schema === 'lafea-controlled-continuum-convergence-evidence/v1'
      && value.quantityId === null)) {
    const reasons = [recoveryReady
      ? 'PILOT_CONVERGENCE_INPUT_REQUIRED'
      : 'PILOT_RECOVERY_LEVEL_NOT_ACCEPTED'];
    const base = {
      schema: 'lafea-controlled-continuum-convergence-evidence/v1',
      quantityId: null,
      units: null,
      tolerance: null,
      levels: [],
      relativeChanges: [],
      recoverySetHash: null,
      convergenceProfileHash: request.convergenceProfileHash,
      status: 'BLOCKED',
      reasons,
    };
    const result = deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
    if (value !== null && JSON.stringify(result) !== JSON.stringify(value)) {
      throw new TypeError('Pilot convergence evidence is stale or tampered.');
    }
    return result;
  }
  const normalizedInput = Object.hasOwn(value, 'schema')
    ? {
      quantityId: value.quantityId,
      units: value.units,
      tolerance: value.tolerance,
      levels: value.levels,
    }
    : value;
  exactKeys(normalizedInput, CONVERGENCE_INPUT_KEYS, 'pilotConvergence');
  requireText(normalizedInput.quantityId, 'pilotConvergence.quantityId');
  requireText(normalizedInput.units, 'pilotConvergence.units');
  positive(normalizedInput.tolerance, 'pilotConvergence.tolerance');
  if (!Array.isArray(normalizedInput.levels) || normalizedInput.levels.length !== 3) {
    throw new TypeError('Pilot convergence requires exactly three levels.');
  }
  const observations = [...normalizedInput.levels]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((row, index) => {
      exactKeys(row, CONVERGENCE_LEVEL_KEYS, 'pilotConvergence.level');
      integer(row.ordinal, 'pilotConvergence.level.ordinal');
      requireSha(row.meshHash, 'pilotConvergence.level.meshHash');
      requireSha(row.recoveryHash, 'pilotConvergence.level.recoveryHash');
      finite(row.observedQuantity, 'pilotConvergence.level.observedQuantity');
      const evidence = levels[index];
      if (row.ordinal !== index + 1
        || row.meshHash !== request.meshLevels[index].meshHash
        || row.recoveryHash !== evidence.recoveryHash) {
        throw new TypeError('Pilot convergence level parents are stale.');
      }
      return { ...row };
    });
  const relativeChanges = [null];
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1].observedQuantity;
    const current = observations[index].observedQuantity;
    relativeChanges.push(
      Math.abs(current - previous) / Math.max(1, Math.abs(current)),
    );
  }
  const reasons = [];
  if (relativeChanges[2] > normalizedInput.tolerance) {
    reasons.push('PILOT_FINE_LEVEL_CHANGE_EXCEEDS_TOLERANCE');
  }
  if (relativeChanges[2] > relativeChanges[1]) {
    reasons.push('PILOT_CONVERGENCE_NOT_IMPROVING');
  }
  if (levels.some((row) => row.status !== 'ACCEPTED'
    || row.recoveryAuthority !== 'RETAINED_INTEGRATION_POINT_VALUES')) {
    reasons.push('PILOT_RECOVERY_LEVEL_NOT_ACCEPTED');
  }
  const recoverySetHash = templateReleaseSha256({
    schema: 'lafea-controlled-continuum-recovery-set/v1',
    requestHash: request.semanticHash,
    levels: observations.map((row) => ({
      ordinal: row.ordinal,
      meshHash: row.meshHash,
      recoveryHash: row.recoveryHash,
    })),
  });
  const base = {
    schema: 'lafea-controlled-continuum-convergence-evidence/v1',
    quantityId: normalizedInput.quantityId,
    units: normalizedInput.units,
    tolerance: normalizedInput.tolerance,
    levels: observations,
    relativeChanges,
    recoverySetHash,
    convergenceProfileHash: request.convergenceProfileHash,
    status: reasons.length ? 'BLOCKED' : 'PASS',
    reasons: [...new Set(reasons)].sort(),
  };
  const result = deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
  if (Object.hasOwn(value, 'schema')
    && JSON.stringify(result) !== JSON.stringify(value)) {
    throw new TypeError('Pilot convergence evidence is stale or tampered.');
  }
  return result;
}

function validateRebuild(value, keys, createKeys, create, label) {
  const errors = [];
  try {
    exactKeys(value, keys, label);
    const input = {};
    for (const key of createKeys) input[key] = value[key];
    const rebuilt = create(input);
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw new TypeError(`${label} is stale or tampered.`);
    }
    if (!isDeepFrozen(value)) {
      throw new TypeError(`${label} must be deeply frozen.`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function requireValid(validation, message) {
  if (!validation.ok) {
    throw new TypeError(`${message} ${validation.errors.join(' ')}`.trim());
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !ENGINEERING_HASH.test(value)) {
    throw new TypeError(`${field} must be an engineering hash.`);
  }
  return value;
}
function requireEngineeringHash(value, field) {
  return requireHash(value, field);
}
function requireSha(value, field) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new TypeError(`${field} must be canonical SHA-256.`);
  }
  return value;
}
function nullableSha(value, field) {
  return value === null ? null : requireSha(value, field);
}
function requireRevision(value, field) {
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new TypeError(`${field} must be an FNV revision digest.`);
  }
  return value;
}
function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be non-empty text.`);
  }
  return value;
}
function boolean(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  return value;
}
function integer(value, field) {
  if (!Number.isInteger(value)) throw new TypeError(`${field} must be an integer.`);
  return value;
}
function finite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be finite.`);
  }
  return value;
}
function positive(value, field) {
  finite(value, field);
  if (value <= 0) throw new TypeError(`${field} must be positive.`);
  return value;
}
function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw new TypeError(`${field} is invalid.`);
  return value;
}
function textArray(value, field) {
  if (!Array.isArray(value)
    || value.some((row) => typeof row !== 'string' || !row.trim())) {
    throw new TypeError(`${field} must contain non-empty strings.`);
  }
  return [...new Set(value)].sort();
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
