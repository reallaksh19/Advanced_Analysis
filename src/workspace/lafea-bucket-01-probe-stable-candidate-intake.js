import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_PACKAGE_SCHEMA =
  'lafea-bucket-01-probe-stable-candidate-mesh-package/v1';
export const LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_TOPOLOGY_REPORT_SCHEMA =
  'lafea-bucket-01-probe-stable-candidate-topology-report/v1';
export const LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_INPUT_SCHEMA =
  'lafea-bucket-01-probe-stable-candidate-intake-input/v1';
export const LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA =
  'lafea-bucket-01-probe-stable-candidate-intake-evidence/v1';
export const LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_VALIDATION_EVIDENCE_SCHEMA =
  'lafea-bucket-01-probe-stable-candidate-validation-evidence/v1';
export const LAFEA_BUCKET_01_PROBE_STABLE_TOPOLOGY_VALIDATION_EVIDENCE_SCHEMA =
  'lafea-bucket-01-probe-stable-topology-validation-evidence/v1';
export const LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_REVISION =
  'B01-PROBE-STABLE-INTAKE.2';

const EXPECTED_LEVELS = Object.freeze([
  Object.freeze({
    ordinal: 1,
    radialCellCount: 12,
    circumferentialCellCount: 20,
    elementCount: 480,
  }),
  Object.freeze({
    ordinal: 2,
    radialCellCount: 17,
    circumferentialCellCount: 35,
    elementCount: 1190,
  }),
  Object.freeze({
    ordinal: 3,
    radialCellCount: 30,
    circumferentialCellCount: 68,
    elementCount: 4080,
  }),
  Object.freeze({
    ordinal: 4,
    radialCellCount: 53,
    circumferentialCellCount: 132,
    elementCount: 13992,
  }),
]);
const EXPECTED_LOCATION_COUNT = 7;
const MINIMUM_CANDIDATE_NATURAL_MARGIN = 0.05;

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'designHash', 'candidatePackage', 'topologyReport',
  'candidateValidationEvidence', 'topologyValidationEvidence',
]);
const PACKAGE_KEYS = Object.freeze([
  'schema', 'producerRevision', 'exactHeadSha', 'designHash', 'levels',
  'status', 'reasons', 'authority', 'semanticHash',
]);
const PACKAGE_LEVEL_KEYS = Object.freeze([
  'ordinal', 'radialCellCount', 'circumferentialCellCount', 'elementCount',
  'meshHash', 'radialCoordinateHash', 'circumferentialCoordinateHash',
  'featureSetHash', 'qualityHash', 'status',
]);
const TOPOLOGY_KEYS = Object.freeze([
  'schema', 'producerRevision', 'exactHeadSha', 'designHash',
  'candidatePackageHash', 'locationCount', 'levelReports', 'status',
  'reasons', 'authority', 'semanticHash',
]);
const TOPOLOGY_LEVEL_KEYS = Object.freeze([
  'ordinal', 'locationCount', 'allLocationsUnique', 'allCoordinatesFrozen',
  'allContainingElementsUnique', 'allJacobiansPositive',
  'allTriangleSidesStable', 'allOrientationsStable',
  'allLineagesCompatible', 'allOffNodesEdgesDiagonals',
  'minimumNaturalMargin', 'naturalCoordinateDriftReported', 'status',
]);
const CANDIDATE_VALIDATION_KEYS = Object.freeze([
  'schema', 'producerRevision', 'exactHeadSha', 'designHash',
  'candidatePackageHash', 'executed', 'meshPackageRebuilt',
  'coordinateHashesRebuilt', 'featureSetHashesRebuilt',
  'qualityHashesRebuilt', 'status', 'reasons', 'authority', 'semanticHash',
]);
const TOPOLOGY_VALIDATION_KEYS = Object.freeze([
  'schema', 'producerRevision', 'exactHeadSha', 'designHash',
  'candidatePackageHash', 'topologyReportHash', 'executed',
  'locationRecordsRebuilt', 'topologyAssertionsRecomputed',
  'status', 'reasons', 'authority', 'semanticHash',
]);
const VALIDATION_AUTHORITY_KEYS = Object.freeze([
  'independentCheckerExecution', 'productionSwitchApplied',
  'productionMeshAuthority', 'stressAcceptanceAuthority',
  'qualificationAuthority', 'bucketQualified',
]);
const CANDIDATE_AUTHORITY_KEYS = Object.freeze([
  'candidateOnly', 'solverExecuted', 'productionSwitchApplied',
  'productionMeshAuthority', 'stressAcceptanceAuthority',
  'qualificationAuthority', 'bucketQualified',
]);
const TOPOLOGY_AUTHORITY_KEYS = Object.freeze([
  'candidateTopologyProof', 'productionSwitchApplied',
  'productionMeshAuthority', 'stressAcceptanceAuthority',
  'qualificationAuthority', 'bucketQualified',
]);

export function evaluateLafeaBucket01ProbeStableCandidateIntake(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'candidate intake input');
  if (inputValue.schema
    !== LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_INPUT_SCHEMA) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_INTAKE_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const designHash = sha256(inputValue.designHash, 'designHash');
  const candidatePackage = validateCandidatePackage(
    inputValue.candidatePackage,
    exactHeadSha,
    designHash,
  );
  const topologyReport = validateTopologyReport(
    inputValue.topologyReport,
    exactHeadSha,
    designHash,
    candidatePackage.semanticHash,
  );
  const candidateValidationEvidence = validateCandidateValidationEvidence(
    inputValue.candidateValidationEvidence,
    exactHeadSha,
    designHash,
    candidatePackage.semanticHash,
  );
  const topologyValidationEvidence = validateTopologyValidationEvidence(
    inputValue.topologyValidationEvidence,
    exactHeadSha,
    designHash,
    candidatePackage.semanticHash,
    topologyReport.semanticHash,
  );
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_REVISION,
    exactHeadSha,
    designHash,
    candidatePackageHash: candidatePackage.semanticHash,
    topologyReportHash: topologyReport.semanticHash,
    candidateValidationEvidenceHash: candidateValidationEvidence.semanticHash,
    topologyValidationEvidenceHash: topologyValidationEvidence.semanticHash,
    expectedLocationCount: EXPECTED_LOCATION_COUNT,
    minimumCandidateNaturalMargin: MINIMUM_CANDIDATE_NATURAL_MARGIN,
    levels: candidatePackage.levels.map((level, index) => ({
      ordinal: level.ordinal,
      radialCellCount: level.radialCellCount,
      circumferentialCellCount: level.circumferentialCellCount,
      elementCount: level.elementCount,
      meshHash: level.meshHash,
      topologyMinimumNaturalMargin:
        topologyReport.levelReports[index].minimumNaturalMargin,
      status: 'PASS',
    })),
    status: 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW',
    reasons: [],
    authority: {
      candidatePackageVerified: true,
      topologyProofVerified: true,
      candidateRebuildValidationExecuted: true,
      topologyRecomputationExecuted: true,
      exactHeadBound: true,
      designHashBound: true,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01ProbeStableCandidateIntakeEvidence(value) {
  try {
    if (!value
      || value.schema
        !== LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA
      || value.producerRevision
        !== LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_REVISION) {
      throw intakeError('LAFEA_B01_PROBE_STABLE_INTAKE_EVIDENCE_INVALID');
    }
    const basis = { ...value };
    delete basis.semanticHash;
    if (canonicalLafeaSha256(basis) !== value.semanticHash) {
      throw intakeError('LAFEA_B01_PROBE_STABLE_INTAKE_HASH_TAMPERED');
    }
    if (!isDeepFrozen(value)) {
      throw intakeError('LAFEA_B01_PROBE_STABLE_INTAKE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_PROBE_STABLE_INTAKE_INVALID'],
    });
  }
}

function validateCandidatePackage(value, exactHeadSha, designHash) {
  exactKeys(value, PACKAGE_KEYS, 'candidate mesh package');
  if (value.schema !== LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_PACKAGE_SCHEMA) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_PACKAGE_SCHEMA_INVALID');
  }
  text(value.producerRevision, 'candidatePackage.producerRevision');
  if (value.exactHeadSha !== exactHeadSha || value.designHash !== designHash) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_PACKAGE_CUSTODY_MISMATCH');
  }
  if (value.status !== 'PASS' || !Array.isArray(value.reasons)
    || value.reasons.length !== 0) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_PACKAGE_BLOCKED');
  }
  exactKeys(
    value.authority,
    CANDIDATE_AUTHORITY_KEYS,
    'candidate package authority',
  );
  requireBoolean(
    value.authority.candidateOnly,
    true,
    'LAFEA_B01_PROBE_STABLE_PACKAGE_NOT_CANDIDATE_ONLY',
  );
  for (const key of [
    'solverExecuted', 'productionSwitchApplied', 'productionMeshAuthority',
    'stressAcceptanceAuthority', 'qualificationAuthority', 'bucketQualified',
  ]) {
    requireBoolean(
      value.authority[key],
      false,
      'LAFEA_B01_PROBE_STABLE_PACKAGE_AUTHORITY_ESCALATED',
    );
  }
  if (!Array.isArray(value.levels)
    || value.levels.length !== EXPECTED_LEVELS.length) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_PACKAGE_LEVEL_COUNT_INVALID');
  }
  value.levels.forEach((level, index) => {
    exactKeys(
      level,
      PACKAGE_LEVEL_KEYS,
      `candidate package level ${index + 1}`,
    );
    const expected = EXPECTED_LEVELS[index];
    if (level.ordinal !== expected.ordinal
      || level.radialCellCount !== expected.radialCellCount
      || level.circumferentialCellCount !== expected.circumferentialCellCount
      || level.elementCount !== expected.elementCount
      || level.status !== 'PASS') {
      throw intakeError('LAFEA_B01_PROBE_STABLE_PACKAGE_LEVEL_INVALID');
    }
    for (const key of [
      'meshHash', 'radialCoordinateHash', 'circumferentialCoordinateHash',
      'featureSetHash', 'qualityHash',
    ]) {
      sha256(level[key], `candidatePackage.levels.${key}`);
    }
  });
  verifySemanticHash(
    value,
    'LAFEA_B01_PROBE_STABLE_PACKAGE_HASH_TAMPERED',
  );
  return value;
}

function validateTopologyReport(value, exactHeadSha, designHash, packageHash) {
  exactKeys(value, TOPOLOGY_KEYS, 'candidate topology report');
  if (value.schema
    !== LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_TOPOLOGY_REPORT_SCHEMA) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_TOPOLOGY_SCHEMA_INVALID');
  }
  text(value.producerRevision, 'topologyReport.producerRevision');
  if (value.exactHeadSha !== exactHeadSha
    || value.designHash !== designHash
    || value.candidatePackageHash !== packageHash) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_TOPOLOGY_CUSTODY_MISMATCH');
  }
  if (value.status !== 'PASS' || !Array.isArray(value.reasons)
    || value.reasons.length !== 0
    || value.locationCount !== EXPECTED_LOCATION_COUNT) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_TOPOLOGY_BLOCKED');
  }
  exactKeys(
    value.authority,
    TOPOLOGY_AUTHORITY_KEYS,
    'candidate topology authority',
  );
  requireBoolean(
    value.authority.candidateTopologyProof,
    true,
    'LAFEA_B01_PROBE_STABLE_TOPOLOGY_PROOF_MISSING',
  );
  for (const key of [
    'productionSwitchApplied', 'productionMeshAuthority',
    'stressAcceptanceAuthority', 'qualificationAuthority', 'bucketQualified',
  ]) {
    requireBoolean(
      value.authority[key],
      false,
      'LAFEA_B01_PROBE_STABLE_TOPOLOGY_AUTHORITY_ESCALATED',
    );
  }
  if (!Array.isArray(value.levelReports)
    || value.levelReports.length !== EXPECTED_LEVELS.length) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_TOPOLOGY_LEVEL_COUNT_INVALID');
  }
  value.levelReports.forEach((level, index) => {
    exactKeys(
      level,
      TOPOLOGY_LEVEL_KEYS,
      `candidate topology level ${index + 1}`,
    );
    if (level.ordinal !== EXPECTED_LEVELS[index].ordinal
      || level.locationCount !== EXPECTED_LOCATION_COUNT
      || level.status !== 'PASS') {
      throw intakeError('LAFEA_B01_PROBE_STABLE_TOPOLOGY_LEVEL_INVALID');
    }
    for (const key of [
      'allLocationsUnique', 'allCoordinatesFrozen',
      'allContainingElementsUnique', 'allJacobiansPositive',
      'allTriangleSidesStable', 'allOrientationsStable',
      'allLineagesCompatible', 'allOffNodesEdgesDiagonals',
      'naturalCoordinateDriftReported',
    ]) {
      requireBoolean(
        level[key],
        true,
        'LAFEA_B01_PROBE_STABLE_TOPOLOGY_PROOF_INCOMPLETE',
      );
    }
    if (typeof level.minimumNaturalMargin !== 'number'
      || !Number.isFinite(level.minimumNaturalMargin)
      || level.minimumNaturalMargin < MINIMUM_CANDIDATE_NATURAL_MARGIN) {
      throw intakeError('LAFEA_B01_PROBE_STABLE_TOPOLOGY_MARGIN_INADEQUATE');
    }
  });
  verifySemanticHash(
    value,
    'LAFEA_B01_PROBE_STABLE_TOPOLOGY_HASH_TAMPERED',
  );
  return value;
}

function validateCandidateValidationEvidence(value, exactHeadSha,
  designHash, candidatePackageHash) {
  exactKeys(
    value,
    CANDIDATE_VALIDATION_KEYS,
    'candidate validation evidence',
  );
  if (value.schema
    !== LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_VALIDATION_EVIDENCE_SCHEMA) {
    throw intakeError(
      'LAFEA_B01_PROBE_STABLE_CANDIDATE_VALIDATION_SCHEMA_INVALID',
    );
  }
  text(value.producerRevision, 'candidateValidationEvidence.producerRevision');
  if (value.exactHeadSha !== exactHeadSha
    || value.designHash !== designHash
    || value.candidatePackageHash !== candidatePackageHash) {
    throw intakeError(
      'LAFEA_B01_PROBE_STABLE_CANDIDATE_VALIDATION_CUSTODY_MISMATCH',
    );
  }
  if (value.executed !== true
    || value.meshPackageRebuilt !== true
    || value.coordinateHashesRebuilt !== true
    || value.featureSetHashesRebuilt !== true
    || value.qualityHashesRebuilt !== true
    || value.status !== 'PASS'
    || !Array.isArray(value.reasons)
    || value.reasons.length !== 0) {
    throw intakeError(
      'LAFEA_B01_PROBE_STABLE_CANDIDATE_VALIDATION_INCOMPLETE',
    );
  }
  validateValidationAuthority(value.authority);
  verifySemanticHash(
    value,
    'LAFEA_B01_PROBE_STABLE_CANDIDATE_VALIDATION_HASH_TAMPERED',
  );
  return value;
}

function validateTopologyValidationEvidence(value, exactHeadSha,
  designHash, candidatePackageHash, topologyReportHash) {
  exactKeys(
    value,
    TOPOLOGY_VALIDATION_KEYS,
    'topology validation evidence',
  );
  if (value.schema
    !== LAFEA_BUCKET_01_PROBE_STABLE_TOPOLOGY_VALIDATION_EVIDENCE_SCHEMA) {
    throw intakeError(
      'LAFEA_B01_PROBE_STABLE_TOPOLOGY_VALIDATION_SCHEMA_INVALID',
    );
  }
  text(value.producerRevision, 'topologyValidationEvidence.producerRevision');
  if (value.exactHeadSha !== exactHeadSha
    || value.designHash !== designHash
    || value.candidatePackageHash !== candidatePackageHash
    || value.topologyReportHash !== topologyReportHash) {
    throw intakeError(
      'LAFEA_B01_PROBE_STABLE_TOPOLOGY_VALIDATION_CUSTODY_MISMATCH',
    );
  }
  if (value.executed !== true
    || value.locationRecordsRebuilt !== true
    || value.topologyAssertionsRecomputed !== true
    || value.status !== 'PASS'
    || !Array.isArray(value.reasons)
    || value.reasons.length !== 0) {
    throw intakeError(
      'LAFEA_B01_PROBE_STABLE_TOPOLOGY_VALIDATION_INCOMPLETE',
    );
  }
  validateValidationAuthority(value.authority);
  verifySemanticHash(
    value,
    'LAFEA_B01_PROBE_STABLE_TOPOLOGY_VALIDATION_HASH_TAMPERED',
  );
  return value;
}

function validateValidationAuthority(value) {
  exactKeys(
    value,
    VALIDATION_AUTHORITY_KEYS,
    'candidate validation authority',
  );
  requireBoolean(
    value.independentCheckerExecution,
    true,
    'LAFEA_B01_PROBE_STABLE_VALIDATION_CHECKER_NOT_EXECUTED',
  );
  for (const key of [
    'productionSwitchApplied', 'productionMeshAuthority',
    'stressAcceptanceAuthority', 'qualificationAuthority', 'bucketQualified',
  ]) {
    requireBoolean(
      value[key],
      false,
      'LAFEA_B01_PROBE_STABLE_VALIDATION_AUTHORITY_ESCALATED',
    );
  }
}

function verifySemanticHash(value, code) {
  const basis = { ...value };
  delete basis.semanticHash;
  if (canonicalLafeaSha256(basis) !== value.semanticHash) {
    throw intakeError(code);
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_INTAKE_RECORD_INVALID', label);
  }
  if (JSON.stringify(Object.keys(value).sort())
    !== JSON.stringify([...expected].sort())) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_INTAKE_EXACT_KEYS_INVALID', label);
  }
}

function requireBoolean(value, expected, code) {
  if (value !== expected) throw intakeError(code);
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_INTAKE_HEAD_INVALID');
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_INTAKE_HASH_INVALID', label);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw intakeError('LAFEA_B01_PROBE_STABLE_INTAKE_TEXT_REQUIRED', label);
  }
  return value;
}

function intakeError(code, message = code) {
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
