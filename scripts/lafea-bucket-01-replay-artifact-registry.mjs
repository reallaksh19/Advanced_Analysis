import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_POLICY,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_VALIDATION_SCHEMA,
} from '../src/workspace/lafea-bucket-01-replay-artifact-policy.js';
import {
  LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA,
  createLafeaBucket01ControlledReplayResult,
  registerLafeaBucket01ReplayArtifactReceiptInternal,
} from '../src/workspace/lafea-bucket-01-controlled-replay-result.js';

export {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_VALIDATION_SCHEMA,
};

const JSON_KINDS = new Set([
  'CANDIDATE_PACKAGE',
  'CANDIDATE_INTAKE',
  'INDEPENDENT_CHECKER_EVIDENCE',
  'REFERENCE_MESH_LADDER',
  'ANALYSIS_MESH_EVIDENCE',
  'STAGE_DOCUMENT',
  'LOAD_MAPPING',
  'BOUNDARY_MAPPING',
  'MAPPING_PACKAGE',
  'EXECUTION_RECEIPT',
  'RESPONSE_EVIDENCE',
  'KIRSCH_EVIDENCE',
  'PRODUCTION_STRESS_EVIDENCE',
  'TOPOLOGY_AUDIT_EVIDENCE',
  'CONVERGENCE_EVIDENCE',
  'REPOSITORY_GATE_REPORT',
  'PACKAGE_LOCK',
  'EXECUTION_ENVIRONMENT',
]);

const POLICIES = Object.freeze({
  CANDIDATE_PACKAGE: policy(
    'CANDIDATE_MESH_BOUND',
    'meshQuality',
    ['lafea-bucket-01-probe-stable-candidate-mesh-package/v1'],
    (payload) => payload.status === 'PASS',
  ),
  CANDIDATE_INTAKE: policy(
    'CANDIDATE_MESH_BOUND',
    'meshQuality',
    ['lafea-bucket-01-probe-stable-candidate-intake-evidence/v2'],
    (payload) => payload.status
      === 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW',
  ),
  INDEPENDENT_CHECKER_EVIDENCE: policy(
    'CANDIDATE_MESH_BOUND',
    'probeTopologyAudit',
    ['lafea-bucket-01-independent-candidate-verification-evidence/v1'],
    (payload) => payload.status === 'PASS'
      && payload.authority?.independentCheckerExecution === true,
  ),
  REFERENCE_MESH_LADDER: policy(
    'REFERENCE_MESH_BOUND',
    'meshQuality',
    ['lafea-bucket-01-controlled-replay-reference-mesh-ladder/v1'],
    (payload) => payload.status === 'PASS'
      && sameNumbers(payload.elementCounts, [64, 256, 1024, 4096]),
  ),
  ANALYSIS_MESH_EVIDENCE: policy(
    null,
    'meshQuality',
    ['lafea-bucket-01-controlled-replay-analysis-mesh/v1'],
    (payload) => payload.status === 'PASS'
      && payload.qualityAccepted === true
      && Number.isInteger(payload.elementCount)
      && payload.elementCount > 0
      && sha(payload.meshHash),
  ),
  STAGE_DOCUMENT: policy(
    null,
    'repositoryGate',
    ['lafea-bucket-01-controlled-replay-stage-document/v1'],
    (payload) => payload.status === 'PASS'
      && sha(payload.documentHash)
      && sha(payload.meshHash),
  ),
  LOAD_MAPPING: policy(
    null,
    'solverAndEquilibrium',
    ['lafea-bucket-01-controlled-replay-load-mapping/v1'],
    (payload) => payload.status === 'PASS'
      && payload.physicalWindowExact === true
      && sha(payload.mappingHash),
  ),
  BOUNDARY_MAPPING: policy(
    null,
    'solverAndEquilibrium',
    ['lafea-bucket-01-controlled-replay-boundary-mapping/v1'],
    (payload) => payload.status === 'PASS'
      && payload.physicalWindowExact === true
      && sha(payload.mappingHash),
  ),
  MAPPING_PACKAGE: policy(
    null,
    'solverAndEquilibrium',
    ['lafea-bucket-01-controlled-replay-mapping-package/v1'],
    (payload) => payload.status === 'PASS'
      && sha(payload.mappingPackageHash),
  ),
  EXECUTION_RECEIPT: policy(
    null,
    'solverAndEquilibrium',
    ['lafea-bucket-01-controlled-replay-execution-receipt/v1'],
    (payload) => payload.status === 'PASS'
      && payload.solverAccepted === true
      && payload.equilibriumAccepted === true
      && payload.energyAccepted === true
      && sha(payload.resultHash),
  ),
  RESPONSE_EVIDENCE: policy(
    null,
    'globalResponseConvergence',
    [
      'lafea-bucket-01-candidate-response-evidence/v1',
      'lafea-bucket-01-production-response-evidence/v2',
    ],
    (payload) => payload.status === 'PASS',
  ),
  KIRSCH_EVIDENCE: policy(
    'REPOSITORY_REGRESSION',
    'kirschFixedProbes',
    ['lafea-bucket-01-kirsch-fixed-probe-evidence/v2'],
    (payload) => payload.status === 'PASS',
  ),
  PRODUCTION_STRESS_EVIDENCE: policy(
    null,
    'productionLugStress',
    [
      'lafea-bucket-01-candidate-stress-evidence/v1',
      'lafea-bucket-01-probe-stable-v3-direct-point-receipt/v1',
      'lafea-bucket-01-production-lug-fixed-probe-evidence/v2',
    ],
    (payload) => payload.status === 'PASS',
  ),
  TOPOLOGY_AUDIT_EVIDENCE: policy(
    null,
    'probeTopologyAudit',
    [
      'lafea-bucket-01-controlled-replay-topology-audit/v1',
      'lafea-bucket-01-independent-candidate-verification-evidence/v1',
      'lafea-bucket-01-probe-topology-audit-evidence/v1',
    ],
    (payload) => payload.status === 'PASS',
  ),
  CONVERGENCE_EVIDENCE: policy(
    null,
    'productionLugStress',
    ['lafea-bucket-01-controlled-replay-convergence/v1'],
    (payload) => payload.status === 'PASS'
      && payload.allLocationsPass === true,
  ),
  REPOSITORY_GATE_REPORT: policy(
    'REPOSITORY_REGRESSION',
    'repositoryGate',
    ['lafea-bucket-01-exact-head-report/v17', 'lafea-bucket-01-exact-head-report/v18'],
    (payload) => payload.status === 'EXACT_HEAD_REPAIR_EVIDENCE_PASS'
      && Array.isArray(payload.blockingCheckIds)
      && payload.blockingCheckIds.length === 0,
  ),
  STDOUT_LOG: textPolicy(
    'EXECUTION_ENVIRONMENT',
    'repositoryGate',
    (content) => content.trim().length > 0,
  ),
  STDERR_LOG: textPolicy(
    'EXECUTION_ENVIRONMENT',
    'repositoryGate',
    () => true,
  ),
  PACKAGE_LOCK: policy(
    'EXECUTION_ENVIRONMENT',
    'repositoryGate',
    [],
    (payload) => Number.isInteger(payload.lockfileVersion)
      && payload.lockfileVersion > 0,
  ),
  EXECUTION_ENVIRONMENT: policy(
    'EXECUTION_ENVIRONMENT',
    'repositoryGate',
    ['lafea-bucket-01-controlled-replay-execution-environment/v1'],
    (payload) => payload.status === 'PASS'
      && payload.preRunTrackedClean === true
      && payload.postRunTrackedClean === true
      && sha(payload.packageLockHash)
      && sha(payload.allowlistedEnvironmentHash),
  ),
});

const SOURCE_KEYS = Object.freeze([
  'artifactId',
  'artifactKind',
  'artifactScope',
  'routeId',
  'levelOrdinal',
  'exactHeadSha',
  'designHash',
  'parentArtifactHashes',
  'relativePath',
]);

export function createRegisteredReplayArtifactReceipt(rootDirectory, source) {
  exactKeys(source, SOURCE_KEYS, 'registered replay artifact source');
  const policyValue = POLICIES[source.artifactKind];
  const registeredPolicy = LAFEA_BUCKET_01_REPLAY_ARTIFACT_POLICY[source.artifactKind];
  if (!policyValue || !registeredPolicy) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_KIND_UNREGISTERED');
  }
  const expectedScope = registeredPolicy.scope ?? source.artifactScope;
  if (source.artifactScope !== expectedScope) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_SCOPE_INVALID');
  }
  if (!Number.isInteger(source.levelOrdinal) && source.levelOrdinal !== null) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_INVALID');
  }
  if (source.levelOrdinal !== null
    && (source.levelOrdinal < 1 || source.levelOrdinal > 4)) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_INVALID');
  }
  const relativePath = safeRelativePath(source.relativePath);
  const absolutePath = path.resolve(rootDirectory, relativePath);
  const relativeCheck = path.relative(path.resolve(rootDirectory), absolutePath);
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_PATH_ESCAPE');
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_SOURCE_MISSING');
  }
  const rawBuffer = fs.readFileSync(absolutePath);
  const rawContent = rawBuffer.toString('utf8');
  const rawFileHash = `sha256:${createHash('sha256').update(rawBuffer).digest('hex')}`;
  let payload = null;
  let artifactSchema;
  let producerRevision;
  let payloadDigest;
  let sourceSemanticHash;
  let accepted;
  let validationReasons = [];
  if (JSON_KINDS.has(source.artifactKind)) {
    try {
      payload = JSON.parse(rawContent);
    } catch {
      throw registryError('LAFEA_B01_REPLAY_ARTIFACT_JSON_INVALID');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw registryError('LAFEA_B01_REPLAY_ARTIFACT_PAYLOAD_INVALID');
    }
    artifactSchema = source.artifactKind === 'PACKAGE_LOCK'
      ? 'application/vnd.npm.package-lock+json'
      : requiredText(payload.schema, 'artifact payload schema');
    if (registeredPolicy.schemas.length > 0
      && !registeredPolicy.schemas.includes(artifactSchema)) {
      throw registryError('LAFEA_B01_REPLAY_ARTIFACT_SOURCE_SCHEMA_UNREGISTERED');
    }
    producerRevision = typeof payload.producerRevision === 'string'
      && payload.producerRevision.trim()
      ? payload.producerRevision.trim()
      : 'STATIC_OR_RUNNER_OUTPUT';
    validatePayloadCustody(payload, source);
    verifySelfHashWhenPresent(payload);
    payloadDigest = canonicalLafeaSha256(payload);
    sourceSemanticHash = declaredSemanticHash(payload) ?? payloadDigest;
    accepted = policyValue.accept(payload);
    if (!accepted) validationReasons = deriveReasons(payload);
  } else {
    artifactSchema = 'text/plain; charset=utf-8';
    producerRevision = 'RUNNER_OUTPUT';
    payloadDigest = canonicalLafeaSha256({ rawContent });
    sourceSemanticHash = payloadDigest;
    accepted = policyValue.accept(rawContent);
    if (!accepted) validationReasons = ['REGISTERED_TEXT_VALIDATOR_BLOCKED'];
  }
  const validatorId = registeredPolicy.validatorId;
  const validatorRevision = registeredPolicy.validatorRevision;
  const validationStatus = accepted ? 'PASS' : 'BLOCKED';
  const validationEvidenceBase = {
    schema: LAFEA_BUCKET_01_REPLAY_ARTIFACT_VALIDATION_SCHEMA,
    registryId: LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
    registryRevision: LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
    artifactId: source.artifactId,
    artifactKind: source.artifactKind,
    artifactSchema,
    producerRevision,
    routeId: source.routeId,
    levelOrdinal: source.levelOrdinal,
    exactHeadSha: source.exactHeadSha,
    designHash: source.designHash,
    rawFileHash,
    payloadDigest,
    validatorId,
    validatorRevision,
    validationStatus,
    validationReasons,
  };
  const validationEvidenceHash = canonicalLafeaSha256(validationEvidenceBase);
  const receipt = Object.freeze({
    schema: LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
    artifactId: source.artifactId,
    artifactKind: source.artifactKind,
    artifactScope: source.artifactScope,
    artifactSchema,
    producerRevision,
    routeId: source.routeId,
    levelOrdinal: source.levelOrdinal,
    exactHeadSha: source.exactHeadSha,
    designHash: source.designHash,
    parentArtifactHashes: [...source.parentArtifactHashes],
    semanticHash: sourceSemanticHash,
    rawFileHash,
    payloadDigest,
    relativePath,
    registryId: LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
    registryRevision: LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
    validatorId,
    validatorRevision,
    validationStatus,
    validationReasons,
    validationEvidenceHash,
    derivedCheck: registeredPolicy.check,
  });
  return registerLafeaBucket01ReplayArtifactReceiptInternal(receipt);
}

export function revalidateRegisteredControlledReplayResult(
  rootDirectory, value,
) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.artifacts)) {
    throw registryError('LAFEA_B01_REPLAY_RESULT_REVALIDATION_INPUT_INVALID');
  }
  const artifacts = value.artifacts.map((stored) => {
    const regenerated = createRegisteredReplayArtifactReceipt(rootDirectory, {
      artifactId: stored.artifactId,
      artifactKind: stored.artifactKind,
      artifactScope: stored.artifactScope,
      routeId: stored.routeId,
      levelOrdinal: stored.levelOrdinal,
      exactHeadSha: stored.exactHeadSha,
      designHash: stored.designHash,
      parentArtifactHashes: stored.parentArtifactHashes,
      relativePath: stored.relativePath,
    });
    if (JSON.stringify(regenerated) !== JSON.stringify(stored)) {
      throw registryError(
        'LAFEA_B01_REPLAY_ARTIFACT_REVALIDATION_MISMATCH',
        stored.artifactId,
      );
    }
    return regenerated;
  });
  const result = createLafeaBucket01ControlledReplayResult({
    schema: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA,
    routeId: value.routeId,
    routeKind: value.routeKind,
    exactHeadSha: value.exactHeadSha,
    designHash: value.designHash,
    codeRevisionHash: value.codeRevisionHash,
    candidatePackageHash: value.candidatePackageHash,
    candidateIntakeEvidenceHash: value.candidateIntakeEvidenceHash,
    independentCheckerEvidenceHash: value.independentCheckerEvidenceHash,
    frozenInputHashes: value.frozenInputHashes,
    characteristicH: value.characteristicH,
    executionEnvironment: value.executionEnvironment,
    artifacts,
  });
  if (result.semanticHash !== value.semanticHash
    || JSON.stringify(result) !== JSON.stringify(value)) {
    throw registryError('LAFEA_B01_REPLAY_RESULT_REVALIDATION_MISMATCH');
  }
  return result;
}

export function replayArtifactPolicyFor(kind) {
  const policyValue = LAFEA_BUCKET_01_REPLAY_ARTIFACT_POLICY[kind];
  if (!policyValue) return null;
  return Object.freeze({
    scope: policyValue.scope,
    check: policyValue.check,
    schemas: [...policyValue.schemas],
    validatorId: policyValue.validatorId,
    validatorRevision: policyValue.validatorRevision,
  });
}

function validatePayloadCustody(payload, source) {
  for (const key of ['exactHeadSha', 'verificationHeadSha']) {
    if (key in payload && payload[key] !== source.exactHeadSha) {
      throw registryError('LAFEA_B01_REPLAY_ARTIFACT_HEAD_MISMATCH');
    }
  }
  if ('designHash' in payload && payload.designHash !== source.designHash) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_DESIGN_MISMATCH');
  }
  if ('routeId' in payload && payload.routeId !== source.routeId) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_ROUTE_MISMATCH');
  }
  if (source.levelOrdinal !== null) {
    const observed = payload.levelOrdinal
      ?? payload.ordinal
      ?? payload.spec?.ordinal
      ?? null;
    if (observed !== null && observed !== source.levelOrdinal) {
      throw registryError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_MISMATCH');
    }
  }
}

function verifySelfHashWhenPresent(payload) {
  for (const key of ['semanticHash', 'evidenceHash']) {
    if (!(key in payload)) continue;
    if (!sha(payload[key])) {
      throw registryError('LAFEA_B01_REPLAY_ARTIFACT_DECLARED_HASH_INVALID');
    }
    const base = { ...payload };
    delete base[key];
    if (canonicalLafeaSha256(base) !== payload[key]) {
      throw registryError('LAFEA_B01_REPLAY_ARTIFACT_SELF_HASH_MISMATCH');
    }
    return;
  }
}

function declaredSemanticHash(payload) {
  for (const key of [
    'semanticHash',
    'evidenceHash',
    'projectionHash',
    'executionHash',
    'resultHash',
    'meshHash',
    'definitionSetHash',
  ]) {
    if (sha(payload[key])) return payload[key];
  }
  return null;
}

function deriveReasons(payload) {
  if (Array.isArray(payload.reasons) && payload.reasons.length > 0) {
    return payload.reasons.map((reason) => String(reason));
  }
  if (Array.isArray(payload.blockingCheckIds)
    && payload.blockingCheckIds.length > 0) {
    return payload.blockingCheckIds.map((reason) => String(reason));
  }
  if (Array.isArray(payload.blockingLocationIds)
    && payload.blockingLocationIds.length > 0) {
    return payload.blockingLocationIds.map(
      (locationId) => `LOCATION_BLOCKED:${locationId}`,
    );
  }
  return ['REGISTERED_PAYLOAD_VALIDATOR_BLOCKED'];
}

function policy(scope, check, schemas, accept) {
  return Object.freeze({ scope, check, schemas: Object.freeze(schemas), accept });
}
function textPolicy(scope, check, accept) {
  return Object.freeze({ scope, check, schemas: Object.freeze([]), accept });
}
function sameNumbers(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function sha(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}
function safeRelativePath(value) {
  const text = requiredText(value, 'relativePath').replaceAll('\\', '/');
  if (text.startsWith('/') || text.split('/').includes('..')) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_PATH_INVALID');
  }
  return text;
}
function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_TEXT_REQUIRED', label);
  }
  return value.trim();
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw registryError('LAFEA_B01_REPLAY_ARTIFACT_SOURCE_EXACT_KEYS_INVALID', label);
  }
}
function registryError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
