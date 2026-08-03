import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA =
  'lafea-bucket-01-controlled-replay-result-input/v1';
export const LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA =
  'lafea-bucket-01-controlled-replay-result/v2';
export const LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA =
  'lafea-bucket-01-replay-artifact-validation-receipt/v1';
export const LAFEA_BUCKET_01_CHARACTERISTIC_H_SCHEMA =
  'lafea-bucket-01-characteristic-h-evidence/v1';
export const LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_REVISION =
  'B01-CONTROLLED-REPLAY-RESULT.2';

const INPUT_KEYS = Object.freeze([
  'schema', 'routeId', 'routeKind', 'exactHeadSha', 'designHash',
  'codeRevisionHash', 'candidatePackageHash', 'candidateIntakeEvidenceHash',
  'independentCheckerEvidenceHash', 'frozenInputHashes', 'characteristicH',
  'executionEnvironment', 'artifacts',
]);
const ROUTE_KINDS = Object.freeze(new Set(['REFERENCE', 'CANDIDATE']));
const CHECK_KEYS = Object.freeze([
  'meshQuality', 'solverAndEquilibrium', 'globalResponseConvergence',
  'kirschFixedProbes', 'productionLugStress', 'probeTopologyAudit',
  'repositoryGate',
]);
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
  'parentArtifactHashes', 'semanticHash', 'rawFileHash', 'relativePath',
  'validatorId', 'validatorRevision', 'validationStatus',
  'validationReasons', 'derivedCheck',
]);
const SCOPES = Object.freeze(new Set([
  'CANDIDATE_MESH_BOUND', 'REFERENCE_MESH_BOUND',
  'REPOSITORY_REGRESSION', 'EXECUTION_ENVIRONMENT',
]));
const PER_LEVEL_KINDS = Object.freeze(new Set([
  'ANALYSIS_MESH_EVIDENCE', 'STAGE_DOCUMENT', 'LOAD_MAPPING',
  'BOUNDARY_MAPPING', 'MAPPING_PACKAGE', 'EXECUTION_RECEIPT',
]));
const COMMON_COUNTS = Object.freeze({
  ANALYSIS_MESH_EVIDENCE: 4,
  STAGE_DOCUMENT: 4,
  LOAD_MAPPING: 4,
  BOUNDARY_MAPPING: 4,
  MAPPING_PACKAGE: 4,
  EXECUTION_RECEIPT: 4,
  RESPONSE_EVIDENCE: 1,
  KIRSCH_EVIDENCE: 1,
  PRODUCTION_STRESS_EVIDENCE: 1,
  TOPOLOGY_AUDIT_EVIDENCE: 1,
  CONVERGENCE_EVIDENCE: 1,
  REPOSITORY_GATE_REPORT: 1,
  STDOUT_LOG: 1,
  STDERR_LOG: 1,
  PACKAGE_LOCK: 1,
  EXECUTION_ENVIRONMENT: 1,
});
const CANDIDATE_COUNTS = Object.freeze({
  CANDIDATE_PACKAGE: 1,
  CANDIDATE_INTAKE: 1,
  INDEPENDENT_CHECKER_EVIDENCE: 1,
});
const REFERENCE_COUNTS = Object.freeze({ REFERENCE_MESH_LADDER: 1 });
const KIND_POLICY = Object.freeze({
  CANDIDATE_PACKAGE: Object.freeze({
    scope: 'CANDIDATE_MESH_BOUND', check: 'meshQuality',
  }),
  CANDIDATE_INTAKE: Object.freeze({
    scope: 'CANDIDATE_MESH_BOUND', check: 'meshQuality',
  }),
  INDEPENDENT_CHECKER_EVIDENCE: Object.freeze({
    scope: 'CANDIDATE_MESH_BOUND', check: 'probeTopologyAudit',
  }),
  REFERENCE_MESH_LADDER: Object.freeze({
    scope: 'REFERENCE_MESH_BOUND', check: 'meshQuality',
  }),
  ANALYSIS_MESH_EVIDENCE: Object.freeze({ scope: null, check: 'meshQuality' }),
  STAGE_DOCUMENT: Object.freeze({ scope: null, check: 'repositoryGate' }),
  LOAD_MAPPING: Object.freeze({ scope: null, check: 'solverAndEquilibrium' }),
  BOUNDARY_MAPPING: Object.freeze({ scope: null, check: 'solverAndEquilibrium' }),
  MAPPING_PACKAGE: Object.freeze({ scope: null, check: 'solverAndEquilibrium' }),
  EXECUTION_RECEIPT: Object.freeze({ scope: null, check: 'solverAndEquilibrium' }),
  RESPONSE_EVIDENCE: Object.freeze({ scope: null, check: 'globalResponseConvergence' }),
  KIRSCH_EVIDENCE: Object.freeze({
    scope: 'REPOSITORY_REGRESSION', check: 'kirschFixedProbes',
  }),
  PRODUCTION_STRESS_EVIDENCE: Object.freeze({ scope: null, check: 'productionLugStress' }),
  TOPOLOGY_AUDIT_EVIDENCE: Object.freeze({ scope: null, check: 'probeTopologyAudit' }),
  CONVERGENCE_EVIDENCE: Object.freeze({ scope: null, check: 'productionLugStress' }),
  REPOSITORY_GATE_REPORT: Object.freeze({
    scope: 'REPOSITORY_REGRESSION', check: 'repositoryGate',
  }),
  STDOUT_LOG: Object.freeze({ scope: 'EXECUTION_ENVIRONMENT', check: 'repositoryGate' }),
  STDERR_LOG: Object.freeze({ scope: 'EXECUTION_ENVIRONMENT', check: 'repositoryGate' }),
  PACKAGE_LOCK: Object.freeze({ scope: 'EXECUTION_ENVIRONMENT', check: 'repositoryGate' }),
  EXECUTION_ENVIRONMENT: Object.freeze({
    scope: 'EXECUTION_ENVIRONMENT', check: 'repositoryGate',
  }),
});

export function createLafeaBucket01ControlledReplayResult(input) {
  exactKeys(input, INPUT_KEYS, 'controlled replay result input');
  if (input.schema !== LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA) {
    throw replayError('LAFEA_B01_REPLAY_RESULT_INPUT_SCHEMA_INVALID');
  }
  const routeId = text(input.routeId, 'routeId');
  const routeKind = text(input.routeKind, 'routeKind');
  if (!ROUTE_KINDS.has(routeKind)) {
    throw replayError('LAFEA_B01_REPLAY_ROUTE_KIND_INVALID');
  }
  const exactHeadSha = gitSha(input.exactHeadSha);
  const designHash = sha256(input.designHash, 'designHash');
  const codeRevisionHash = sha256(input.codeRevisionHash, 'codeRevisionHash');
  const candidatePackageHash = sha256(
    input.candidatePackageHash,
    'candidatePackageHash',
  );
  const candidateIntakeEvidenceHash = sha256(
    input.candidateIntakeEvidenceHash,
    'candidateIntakeEvidenceHash',
  );
  const independentCheckerEvidenceHash = routeKind === 'CANDIDATE'
    ? sha256(input.independentCheckerEvidenceHash, 'independentCheckerEvidenceHash')
    : requireNull(input.independentCheckerEvidenceHash,
      'reference independentCheckerEvidenceHash');
  const frozenInputHashes = validateFrozenInputHashes(input.frozenInputHashes);
  const characteristicH = validateCharacteristicH(input.characteristicH);
  const executionEnvironment = validateExecutionEnvironment(
    input.executionEnvironment,
  );
  const artifacts = validateArtifacts({
    artifacts: input.artifacts,
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    candidatePackageHash,
    candidateIntakeEvidenceHash,
    independentCheckerEvidenceHash,
  });
  validateArtifactAncestry(artifacts, routeKind);
  const checks = deriveChecks(artifacts);
  const status = CHECK_KEYS.every((key) => checks[key] === 'PASS')
    ? 'PASS' : 'BLOCKED';
  const reasons = status === 'PASS' ? [] : artifacts
    .filter((artifact) => artifact.validationStatus === 'BLOCKED')
    .flatMap((artifact) => artifact.validationReasons.length > 0
      ? artifact.validationReasons.map((reason) =>
        `${artifact.derivedCheck}:${artifact.artifactId}:${reason}`)
      : [`${artifact.derivedCheck}:${artifact.artifactId}:BLOCKED`]);
  const artifactManifestHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-replay-artifact-manifest/v1',
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    artifacts,
  });
  const base = {
    schema: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_REVISION,
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    codeRevisionHash,
    candidatePackageHash,
    candidateIntakeEvidenceHash,
    independentCheckerEvidenceHash,
    frozenInputHashes,
    characteristicH,
    executionEnvironment,
    artifacts,
    artifactManifestHash,
    checks,
    status,
    reasons,
    authority: {
      artifactCustodyValidated: true,
      statusesDerivedFromArtifacts: true,
      frozenInputsBound: true,
      characteristicHRetained: true,
      independentCheckerExecution: routeKind === 'CANDIDATE',
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

export function validateLafeaBucket01ControlledReplayResult(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA
      || value.producerRevision
        !== LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_REVISION) {
      throw replayError('LAFEA_B01_REPLAY_RESULT_SCHEMA_INVALID');
    }
    const rebuilt = createLafeaBucket01ControlledReplayResult({
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
      artifacts: value.artifacts,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw replayError('LAFEA_B01_REPLAY_RESULT_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw replayError('LAFEA_B01_REPLAY_RESULT_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_REPLAY_RESULT_INVALID'],
    });
  }
}

function validateFrozenInputHashes(value) {
  exactKeys(value, FROZEN_HASH_KEYS, 'frozen input hashes');
  return deepFreeze(Object.fromEntries(
    FROZEN_HASH_KEYS.map((key) => [key, sha256(value[key], `frozen.${key}`)]),
  ));
}

function validateExecutionEnvironment(value) {
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
  return deepFreeze({ ...value });
}

function validateCharacteristicH(value) {
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
  if (new Set(locations.map((row) => row.locationId)).size !== locations.length) {
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

function validateArtifacts(context) {
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
      !== artifacts.length) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_IDENTITY_DUPLICATE');
  }
  const expectedCounts = {
    ...COMMON_COUNTS,
    ...(context.routeKind === 'CANDIDATE'
      ? CANDIDATE_COUNTS : REFERENCE_COUNTS),
  };
  for (const [kind, expected] of Object.entries(expectedCounts)) {
    const rows = artifacts.filter((row) => row.artifactKind === kind);
    if (rows.length !== expected) {
      throw replayError('LAFEA_B01_REPLAY_ARTIFACT_COUNT_INVALID', kind);
    }
    if (PER_LEVEL_KINDS.has(kind)
      && JSON.stringify(rows.map((row) => row.levelOrdinal).sort((a, b) => a - b))
        !== JSON.stringify([1, 2, 3, 4])) {
      throw replayError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_SET_INVALID', kind);
    }
  }
  for (const kind of Object.keys(KIND_POLICY)) {
    if (!(kind in expectedCounts)
      && artifacts.some((row) => row.artifactKind === kind)) {
      throw replayError('LAFEA_B01_REPLAY_ARTIFACT_KIND_FOR_ROUTE_INVALID', kind);
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
  const policy = KIND_POLICY[artifactKind];
  if (!policy) throw replayError('LAFEA_B01_REPLAY_ARTIFACT_KIND_INVALID');
  const expectedRouteScope = context.routeKind === 'CANDIDATE'
    ? 'CANDIDATE_MESH_BOUND' : 'REFERENCE_MESH_BOUND';
  const expectedScope = policy.scope ?? expectedRouteScope;
  if (!SCOPES.has(value.artifactScope) || value.artifactScope !== expectedScope) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_SCOPE_INVALID', artifactKind);
  }
  if (value.routeId !== context.routeId
    || value.exactHeadSha !== context.exactHeadSha
    || value.designHash !== context.designHash
    || value.derivedCheck !== policy.check) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_CUSTODY_INVALID', artifactKind);
  }
  if (PER_LEVEL_KINDS.has(artifactKind)) {
    if (!Number.isInteger(value.levelOrdinal)
      || value.levelOrdinal < 1 || value.levelOrdinal > 4) {
      throw replayError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_INVALID');
    }
  } else if (value.levelOrdinal !== null) {
    throw replayError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_UNEXPECTED');
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
    semanticHash: sha256(value.semanticHash, 'artifact.semanticHash'),
    rawFileHash: sha256(value.rawFileHash, 'artifact.rawFileHash'),
    relativePath: value.relativePath,
    validatorId: value.validatorId,
    validatorRevision: value.validatorRevision,
    validationStatus,
    validationReasons: [...value.validationReasons],
    derivedCheck: value.derivedCheck,
  });
}

function validateArtifactAncestry(artifacts, routeKind) {
  const byKind = (kind) => artifacts.filter((row) => row.artifactKind === kind);
  const one = (kind) => byKind(kind)[0];
  const byLevel = (kind, level) => byKind(kind)
    .find((row) => row.levelOrdinal === level);
  const requireParents = (child, parents) => {
    const expected = parents.map((row) => row.semanticHash);
    if (!expected.every((hash) => child.parentArtifactHashes.includes(hash))) {
      throw replayError('LAFEA_B01_REPLAY_ARTIFACT_ANCESTRY_INVALID', child.artifactId);
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

function deriveChecks(artifacts) {
  return deepFreeze(Object.fromEntries(CHECK_KEYS.map((key) => {
    const rows = artifacts.filter((artifact) => artifact.derivedCheck === key);
    if (rows.length === 0) {
      throw replayError('LAFEA_B01_REPLAY_CHECK_ARTIFACT_MISSING', key);
    }
    return [key, rows.every((row) => row.validationStatus === 'PASS')
      ? 'PASS' : 'BLOCKED'];
  })));
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw replayError('LAFEA_B01_REPLAY_EXACT_KEYS_INVALID', label);
  }
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw replayError('LAFEA_B01_REPLAY_HASH_INVALID', label);
  }
  return value;
}
function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw replayError('LAFEA_B01_REPLAY_HEAD_INVALID');
  }
  return value;
}
function text(value, label) {
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
function requireNull(value, label) {
  if (value !== null) throw replayError('LAFEA_B01_REPLAY_NULL_REQUIRED', label);
  return null;
}
function replayError(code, message = code) {
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
