import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_POLICY,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_VALIDATION_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_CANDIDATE_COUNTS,
  LAFEA_BUCKET_01_REPLAY_CHECK_KEYS,
  LAFEA_BUCKET_01_REPLAY_COMMON_COUNTS,
  LAFEA_BUCKET_01_REPLAY_PER_LEVEL_KINDS,
  LAFEA_BUCKET_01_REPLAY_REFERENCE_COUNTS,
  LAFEA_BUCKET_01_REPLAY_SCOPES,
} from './lafea-bucket-01-replay-artifact-policy.js';

const LAFEA_BUCKET_01_CHARACTERISTIC_H_SCHEMA =
  'lafea-bucket-01-characteristic-h-evidence/v1';

const FROZEN_HASH_KEYS = Object.freeze([
  'coordinates', 'stressTolerances', 'loads', 'supports', 'material',
  'solverPolicy', 'codeBasisBoundary', 'physicalProblemDefinition',
  'geometry', 'thickness', 'formulationProfile', 'probeSpecification',
  'expectedValueRegistry', 'loadMappingPolicy', 'boundaryMappingPolicy',
  'recoveryProfile', 'convergenceProfile', 'qualificationProfile',
]);
const ENVIRONMENT_KEYS = Object.freeze([
  'packageLockHash', 'nodeVersion', 'npmVersion', 'platform', 'architecture',
  'allowlistedEnvironmentHash', 'preRunTrackedStatusHash',
  'postRunTrackedStatusHash', 'isolatedOutputNamespace',
]);
const ARTIFACT_KEYS = Object.freeze([
  'schema', 'artifactId', 'artifactKind', 'artifactScope', 'artifactSchema',
  'producerRevision', 'routeId', 'levelOrdinal', 'exactHeadSha', 'designHash',
  'parentArtifactHashes', 'semanticHash', 'rawFileHash', 'payloadDigest',
  'relativePath', 'registryId', 'registryRevision', 'validatorId',
  'validatorRevision', 'validationStatus', 'validationReasons',
  'validationEvidenceHash', 'derivedCheck',
]);

export function validateFrozenInputHashes(value) {
  exactKeys(value, FROZEN_HASH_KEYS, 'frozen input hashes');
  return deepFreeze(Object.fromEntries(
    FROZEN_HASH_KEYS.map((key) => [key, sha256(value[key], `frozen.${key}`)]),
  ));
}

export function validateExecutionEnvironment(value) {
  exactKeys(value, ENVIRONMENT_KEYS, 'execution environment');
  for (const key of [
    'packageLockHash', 'allowlistedEnvironmentHash',
    'preRunTrackedStatusHash', 'postRunTrackedStatusHash',
  ]) sha256(value[key], `executionEnvironment.${key}`);
  for (const key of [
    'nodeVersion', 'npmVersion', 'platform', 'architecture',
    'isolatedOutputNamespace',
  ]) text(value[key], `executionEnvironment.${key}`);
  if (value.isolatedOutputNamespace.includes('..')) {
    throw replayError('LAFEA_B01_REPLAY_OUTPUT_NAMESPACE_INVALID');
  }
  if (value.preRunTrackedStatusHash !== value.postRunTrackedStatusHash) {
    throw replayError('LAFEA_B01_REPLAY_TRACKED_STATUS_DRIFT');
  }
  return deepFreeze({ ...value });
}

export function validateCharacteristicH(value) {
  exactKeys(value, [
    'schema', 'globalDefinition', 'globalLevels', 'localDefinition',
    'locations', 'constantGlobalRatioAssumed', 'unequalRatioMethod',
    'topologyCompatibilityVerified',
  ], 'characteristic h evidence');
  if (value.schema !== LAFEA_BUCKET_01_CHARACTERISTIC_H_SCHEMA
    || value.constantGlobalRatioAssumed !== false
    || value.unequalRatioMethod !== 'ACTUAL_H_VALUES_OR_BLOCK'
    || value.topologyCompatibilityVerified !== true) {
    throw replayError('LAFEA_B01_REPLAY_CHARACTERISTIC_H_POLICY_INVALID');
  }
  text(value.globalDefinition, 'characteristicH.globalDefinition');
  if (value.localDefinition
    !== 'SQRT_DELTA_R_TIMES_RADIUS_TIMES_DELTA_THETA_RADIANS') {
    throw replayError('LAFEA_B01_REPLAY_LOCAL_H_DEFINITION_INVALID');
  }
  if (!Array.isArray(value.globalLevels) || value.globalLevels.length !== 4) {
    throw replayError('LAFEA_B01_REPLAY_GLOBAL_H_LEVELS_INVALID');
  }
  const globalLevels = value.globalLevels.map((row, index) =>
    validateHLevel(row, index + 1, 'global'));
  for (let index = 1; index < globalLevels.length; index += 1) {
    const expected = globalLevels[index - 1].globalCharacteristicH
      / globalLevels[index].globalCharacteristicH;
    if (Math.abs(
      globalLevels[index].refinementRatioToPrevious - expected,
    ) > 1e-10 * Math.max(1, expected)) {
      throw replayError('LAFEA_B01_REPLAY_GLOBAL_H_RATIO_INVALID');
    }
  }
  if (!Array.isArray(value.locations) || value.locations.length !== 7) {
    throw replayError('LAFEA_B01_REPLAY_LOCAL_H_LOCATIONS_INVALID');
  }
  const locations = value.locations.map((row) => {
    exactKeys(row, [
      'locationId', 'radius', 'levelValues', 'refinementRatiosToPrevious',
    ], 'local characteristic h location');
    const locationId = text(row.locationId, 'characteristicH.locationId');
    const radius = positive(row.radius, 'characteristicH.radius');
    if (!Array.isArray(row.levelValues) || row.levelValues.length !== 4
      || !Array.isArray(row.refinementRatiosToPrevious)
      || row.refinementRatiosToPrevious.length !== 3) {
      throw replayError('LAFEA_B01_REPLAY_LOCAL_H_SHAPE_INVALID');
    }
    const levelValues = row.levelValues.map((number, index) =>
      positive(number, `${locationId}.h${index + 1}`));
    const refinementRatiosToPrevious = row.refinementRatiosToPrevious
      .map((number, index) => {
        const ratio = positive(number, `${locationId}.r${index + 2}`);
        const expected = levelValues[index] / levelValues[index + 1];
        if (Math.abs(ratio - expected) > 1e-10 * Math.max(1, expected)) {
          throw replayError('LAFEA_B01_REPLAY_LOCAL_H_RATIO_INVALID');
        }
        return ratio;
      });
    return deepFreeze({
      locationId, radius, levelValues, refinementRatiosToPrevious,
    });
  });
  if (new Set(locations.map((row) => row.locationId)).size
    !== locations.length) {
    throw replayError('LAFEA_B01_REPLAY_LOCAL_H_LOCATION_DUPLICATE');
  }
  return deepFreeze({
    schema: value.schema,
    globalDefinition: value.globalDefinition,
    globalLevels,
    localDefinition: value.localDefinition,
    locations,
    constantGlobalRatioAssumed: false,
    unequalRatioMethod: value.unequalRatioMethod,
    topologyCompatibilityVerified: true,
  });
}

function validateHLevel(value, ordinal, label) {
  exactKeys(value, [
    'ordinal', 'globalCharacteristicH', 'refinementRatioToPrevious',
  ], `${label} characteristic h level`);
  if (value.ordinal !== ordinal) {
    throw replayError('LAFEA_B01_REPLAY_GLOBAL_H_ORDINAL_INVALID');
  }
  const globalCharacteristicH = positive(
    value.globalCharacteristicH,
    `${label}.globalCharacteristicH`,
  );
  if (ordinal === 1) {
    if (value.refinementRatioToPrevious !== null) {
      throw replayError('LAFEA_B01_REPLAY_GLOBAL_H_FIRST_RATIO_INVALID');
    }
    return deepFreeze({
      ordinal, globalCharacteristicH, refinementRatioToPrevious: null,
    });
  }
  const refinementRatioToPrevious = positive(
    value.refinementRatioToPrevious,
    `${label}.refinementRatioToPrevious`,
  );
  return deepFreeze({
    ordinal, globalCharacteristicH, refinementRatioToPrevious,
  });
}

export function validateArtifacts(context) {
  if (!Array.isArray(context.artifacts)) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACTS_REQUIRED');
  }
  const artifacts = context.artifacts.map((value) =>
    validateArtifact(value, context));
  if (new Set(artifacts.map((row) => row.artifactId)).size
      !== artifacts.length
    || new Set(artifacts.map((row) => row.semanticHash)).size
      !== artifacts.length
    || new Set(artifacts.map((row) => row.relativePath)).size
      !== artifacts.length
    || new Set(artifacts.map((row) => row.validationEvidenceHash)).size
      !== artifacts.length) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_IDENTITY_DUPLICATE');
  }
  const expectedCounts = {
    ...LAFEA_BUCKET_01_REPLAY_COMMON_COUNTS,
    ...(context.routeKind === 'CANDIDATE'
      ? LAFEA_BUCKET_01_REPLAY_CANDIDATE_COUNTS
      : LAFEA_BUCKET_01_REPLAY_REFERENCE_COUNTS),
  };
  for (const [kind, expected] of Object.entries(expectedCounts)) {
    const rows = artifacts.filter((row) => row.artifactKind === kind);
    if (rows.length !== expected) {
      throw replayError('LAFEA_B01_REPLAY_ARTIFACT_COUNT_INVALID', kind);
    }
    if (LAFEA_BUCKET_01_REPLAY_PER_LEVEL_KINDS.has(kind)
      && JSON.stringify(rows.map((row) => row.levelOrdinal)
        .sort((left, right) => left - right))
        !== JSON.stringify([1, 2, 3, 4])) {
      throw replayError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_SET_INVALID', kind);
    }
  }
  for (const artifact of artifacts) {
    if (!(artifact.artifactKind in expectedCounts)) {
      throw replayError(
        'LAFEA_B01_REPLAY_ARTIFACT_KIND_FOR_ROUTE_INVALID',
        artifact.artifactKind,
      );
    }
  }
  return deepFreeze(artifacts.sort((left, right) =>
    left.artifactKind.localeCompare(right.artifactKind)
      || (left.levelOrdinal ?? 0) - (right.levelOrdinal ?? 0)
      || left.artifactId.localeCompare(right.artifactId)));
}

function validateArtifact(value, context) {
  exactKeys(value, ARTIFACT_KEYS, 'replay artifact receipt');
  if (value.schema !== LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_SCHEMA_INVALID');
  }
  const artifactKind = text(value.artifactKind, 'artifactKind');
  const policy = LAFEA_BUCKET_01_REPLAY_ARTIFACT_POLICY[artifactKind];
  if (!policy) throw replayError('LAFEA_B01_REPLAY_ARTIFACT_KIND_INVALID');
  const expectedRouteScope = context.routeKind === 'CANDIDATE'
    ? 'CANDIDATE_MESH_BOUND' : 'REFERENCE_MESH_BOUND';
  const expectedScope = policy.scope ?? expectedRouteScope;
  if (!LAFEA_BUCKET_01_REPLAY_SCOPES.has(value.artifactScope)
    || value.artifactScope !== expectedScope) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_SCOPE_INVALID', artifactKind);
  }
  if (value.routeId !== context.routeId
    || value.exactHeadSha !== context.exactHeadSha
    || value.designHash !== context.designHash
    || value.derivedCheck !== policy.check) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_CUSTODY_INVALID', artifactKind);
  }
  if (LAFEA_BUCKET_01_REPLAY_PER_LEVEL_KINDS.has(artifactKind)) {
    if (!Number.isInteger(value.levelOrdinal)
      || value.levelOrdinal < 1 || value.levelOrdinal > 4) {
      throw replayError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_INVALID');
    }
  } else if (value.levelOrdinal !== null) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_UNEXPECTED');
  }
  if (value.registryId !== LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID
    || value.registryRevision
      !== LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION
    || value.validatorId !== policy.validatorId
    || value.validatorRevision !== policy.validatorRevision) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_VALIDATOR_UNREGISTERED');
  }
  if (!policy.schemas.includes(value.artifactSchema)) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_SOURCE_SCHEMA_UNREGISTERED');
  }
  const validationStatus = value.validationStatus;
  if (!['PASS', 'BLOCKED'].includes(validationStatus)
    || !Array.isArray(value.validationReasons)
    || (validationStatus === 'PASS' && value.validationReasons.length !== 0)
    || (validationStatus === 'BLOCKED' && value.validationReasons.length === 0)) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_STATUS_INVALID');
  }
  for (const reason of value.validationReasons) text(reason, 'validationReason');
  if (!Array.isArray(value.parentArtifactHashes)) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_PARENTS_INVALID');
  }
  const parentArtifactHashes = value.parentArtifactHashes.map((hash) =>
    sha256(hash, 'parentArtifactHash'));
  if (new Set(parentArtifactHashes).size !== parentArtifactHashes.length) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_PARENT_DUPLICATE');
  }
  for (const key of [
    'artifactId', 'artifactSchema', 'producerRevision', 'relativePath',
    'validatorId', 'validatorRevision',
  ]) text(value[key], key);
  if (value.relativePath.startsWith('/') || value.relativePath.includes('..')) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_PATH_INVALID');
  }
  const semanticHash = sha256(value.semanticHash, 'artifact.semanticHash');
  const rawFileHash = sha256(value.rawFileHash, 'artifact.rawFileHash');
  const payloadDigest = sha256(value.payloadDigest, 'artifact.payloadDigest');
  const validationEvidenceHash = sha256(
    value.validationEvidenceHash,
    'artifact.validationEvidenceHash',
  );
  const expectedValidationHash = canonicalLafeaSha256({
    schema: LAFEA_BUCKET_01_REPLAY_ARTIFACT_VALIDATION_SCHEMA,
    registryId: value.registryId,
    registryRevision: value.registryRevision,
    artifactId: value.artifactId,
    artifactKind,
    artifactSchema: value.artifactSchema,
    producerRevision: value.producerRevision,
    routeId: value.routeId,
    levelOrdinal: value.levelOrdinal,
    exactHeadSha: value.exactHeadSha,
    designHash: value.designHash,
    rawFileHash,
    payloadDigest,
    validatorId: value.validatorId,
    validatorRevision: value.validatorRevision,
    validationStatus,
    validationReasons: value.validationReasons,
  });
  if (expectedValidationHash !== validationEvidenceHash) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_VALIDATION_HASH_MISMATCH');
  }
  if (artifactKind === 'CANDIDATE_PACKAGE'
    && semanticHash !== context.candidatePackageHash) {
    throw replayError('LAFEA_B01_REPLAY_CANDIDATE_PACKAGE_HASH_MISMATCH');
  }
  if (artifactKind === 'CANDIDATE_INTAKE'
    && semanticHash !== context.candidateIntakeEvidenceHash) {
    throw replayError('LAFEA_B01_REPLAY_CANDIDATE_INTAKE_HASH_MISMATCH');
  }
  if (artifactKind === 'INDEPENDENT_CHECKER_EVIDENCE'
    && semanticHash !== context.independentCheckerEvidenceHash) {
    throw replayError('LAFEA_B01_REPLAY_INDEPENDENT_CHECKER_HASH_MISMATCH');
  }
  return deepFreeze({
    schema: value.schema,
    artifactId: value.artifactId,
    artifactKind,
    artifactScope: value.artifactScope,
    artifactSchema: value.artifactSchema,
    producerRevision: value.producerRevision,
    routeId: value.routeId,
    levelOrdinal: value.levelOrdinal,
    exactHeadSha: value.exactHeadSha,
    designHash: value.designHash,
    parentArtifactHashes,
    semanticHash,
    rawFileHash,
    payloadDigest,
    relativePath: value.relativePath,
    registryId: value.registryId,
    registryRevision: value.registryRevision,
    validatorId: value.validatorId,
    validatorRevision: value.validatorRevision,
    validationStatus,
    validationReasons: [...value.validationReasons],
    validationEvidenceHash,
    derivedCheck: value.derivedCheck,
  });
}

export function validateArtifactAncestry(artifacts, routeKind) {
  const byKind = (kind) => artifacts.filter((row) => row.artifactKind === kind);
  const one = (kind) => byKind(kind)[0];
  const byLevel = (kind, level) => byKind(kind)
    .find((row) => row.levelOrdinal === level);
  const requireParents = (child, parents) => {
    const expected = parents.map((row) => row.semanticHash);
    if (!expected.every((hash) => child.parentArtifactHashes.includes(hash))) {
      throw replayError(
        'LAFEA_B01_REPLAY_ARTIFACT_ANCESTRY_INVALID',
        child.artifactId,
      );
    }
  };
  const root = routeKind === 'CANDIDATE'
    ? one('CANDIDATE_PACKAGE') : one('REFERENCE_MESH_LADDER');
  if (root.parentArtifactHashes.length !== 0) {
    throw replayError('LAFEA_B01_REPLAY_ROOT_ARTIFACT_PARENT_INVALID');
  }
  if (routeKind === 'CANDIDATE') {
    requireParents(one('CANDIDATE_INTAKE'), [root]);
    requireParents(one('INDEPENDENT_CHECKER_EVIDENCE'), [
      root, one('CANDIDATE_INTAKE'),
    ]);
  }
  for (let level = 1; level <= 4; level += 1) {
    const mesh = byLevel('ANALYSIS_MESH_EVIDENCE', level);
    const document = byLevel('STAGE_DOCUMENT', level);
    const load = byLevel('LOAD_MAPPING', level);
    const boundary = byLevel('BOUNDARY_MAPPING', level);
    const mapping = byLevel('MAPPING_PACKAGE', level);
    const execution = byLevel('EXECUTION_RECEIPT', level);
    requireParents(mesh, [root]);
    requireParents(document, [mesh]);
    requireParents(load, [mesh, document]);
    requireParents(boundary, [mesh, document]);
    requireParents(mapping, [mesh, document, load, boundary]);
    requireParents(execution, [mesh, document, mapping]);
  }
  const meshes = byKind('ANALYSIS_MESH_EVIDENCE');
  const executions = byKind('EXECUTION_RECEIPT');
  requireParents(one('RESPONSE_EVIDENCE'), executions);
  requireParents(one('PRODUCTION_STRESS_EVIDENCE'), executions);
  requireParents(one('CONVERGENCE_EVIDENCE'), executions);
  requireParents(one('TOPOLOGY_AUDIT_EVIDENCE'), meshes);
}

export function deriveChecks(artifacts) {
  return deepFreeze(Object.fromEntries(
    LAFEA_BUCKET_01_REPLAY_CHECK_KEYS.map((key) => {
      const rows = artifacts.filter((artifact) => artifact.derivedCheck === key);
      if (rows.length === 0) {
        throw replayError('LAFEA_B01_REPLAY_CHECK_ARTIFACT_MISSING', key);
      }
      return [key, rows.every((row) => row.validationStatus === 'PASS')
        ? 'PASS' : 'BLOCKED'];
    }),
  ));
}

export function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw replayError('LAFEA_B01_REPLAY_EXACT_KEYS_INVALID', label);
  }
}
export function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw replayError('LAFEA_B01_REPLAY_HASH_INVALID', label);
  }
  return value;
}
export function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw replayError('LAFEA_B01_REPLAY_HEAD_INVALID');
  }
  return value;
}
export function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw replayError('LAFEA_B01_REPLAY_TEXT_REQUIRED', label);
  }
  return value;
}
function positive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    throw replayError('LAFEA_B01_REPLAY_POSITIVE_NUMBER_REQUIRED', label);
  }
  return value;
}
export function requireNull(value, label) {
  if (value !== null) throw replayError('LAFEA_B01_REPLAY_NULL_REQUIRED', label);
  return null;
}
export function replayError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
export function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
