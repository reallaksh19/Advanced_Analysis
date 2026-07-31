import {
  canonicalStringify,
  deepFreeze,
  semanticHash,
} from '../shared-piping-model/index.js';
import {
  LAFEA_STAGE_REGISTRY,
  LAFEA_STAGE_REGISTRY_SCHEMA,
  requireLafeaStageRegistryEntry,
} from '../../workspace/lafea-stage-registry.js';
import {
  LAFEA_TEMPLATE_RELEASE_STATUSES,
  asciiCompare,
  assertExactKeys,
} from './contracts.js';

export const LAFEA_STAGE_REGISTRY_DEPENDENCY_SCHEMA =
  'lafea-stage-registry-dependency/v1';
export const LAFEA_COMPUTATIONAL_BUCKET_SCHEMA =
  'lafea-computational-bucket/v1';

export const LAFEA_BUCKET_IDS = Object.freeze([
  'ANALYTICAL_MECHANICS',
  'CONTINUUM_2D_FEA',
  'RECOVERY_ASSESSMENT',
  'SURFACE_SHELL_FEA',
]);

const DEPENDENCY_ENTRY_KEYS = Object.freeze([
  'authority',
  'collectionPaths',
  'enginePackage',
  'engineState',
  'inputContractRole',
  'presenterRole',
  'previewPolicy',
  'previewSource',
  'resultContractRole',
  'stageId',
]);

const BUCKET_INPUT_KEYS = Object.freeze([
  'architectureOrder',
  'authoritativeOutputs',
  'bucketId',
  'kind',
  'label',
  'limitations',
  'numericalMachine',
  'parentRegistryHash',
  'releaseStatus',
  'requiredProfileRoles',
  'stageIds',
]);

export function createStageRegistryDependencySnapshot(
  registry = LAFEA_STAGE_REGISTRY,
) {
  if (!Array.isArray(registry)) {
    throw new TypeError('Stage registry dependency source must be an array.');
  }
  const stages = registry.map((entry) => {
    assertExactKeys(
      pickDependencyEntry(entry),
      DEPENDENCY_ENTRY_KEYS,
      `Stage registry dependency ${entry?.stageId ?? 'UNKNOWN'}`,
    );
    return deepFreeze(pickDependencyEntry(entry));
  }).sort((left, right) => asciiCompare(left.stageId, right.stageId));
  if (new Set(stages.map((entry) => entry.stageId)).size !== stages.length) {
    throw new TypeError('Stage registry dependency contains duplicate stage identities.');
  }
  return deepFreeze({
    schema: LAFEA_STAGE_REGISTRY_DEPENDENCY_SCHEMA,
    stageRegistrySchema: LAFEA_STAGE_REGISTRY_SCHEMA,
    stages,
  });
}

export function stageRegistryDependencyHash(registry = LAFEA_STAGE_REGISTRY) {
  return semanticHash(createStageRegistryDependencySnapshot(registry));
}

export const LAFEA_STAGE_REGISTRY_DEPENDENCY_SNAPSHOT =
  createStageRegistryDependencySnapshot();

export const LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH =
  stageRegistryDependencyHash();

export function requireLafeaStageDependencyEntry(stageId) {
  const result = LAFEA_STAGE_REGISTRY_DEPENDENCY_SNAPSHOT.stages
    .find((entry) => entry.stageId === stageId);
  if (!result) {
    throw new TypeError(`Unsupported LAFEA stage dependency: ${stageId}.`);
  }
  return result;
}

export const LAFEA_COMPUTATIONAL_BUCKET_REGISTRY = Object.freeze([
  bucket({
    bucketId: 'ANALYTICAL_MECHANICS',
    architectureOrder: 'A',
    kind: 'COMPUTATIONAL_BUCKET',
    label: 'Analytical mechanics',
    stageIds: ['LAFEA.1', 'LAFEA.2', 'LAFEA.6'],
    numericalMachine:
      'No finite-element mesh; deterministic vector, resultant, section or line integration.',
    authoritativeOutputs: [
      'ENVELOPES',
      'EQUILIBRIUM_EVIDENCE',
      'NOMINAL_SCREENING_STRESS',
      'RESULTANTS',
    ],
    requiredProfileRoles: ['solverProfileId'],
    releaseStatus: 'CONCEPT',
    limitations: [
      'LAFEA.6 analytical weld mechanics remain unavailable.',
      'Method profiles are distinct and cannot be treated as one universal formula.',
      'No finite-element displacement field or local shell stress authority.',
    ],
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  }),
  bucket({
    bucketId: 'CONTINUUM_2D_FEA',
    architectureOrder: 'B',
    kind: 'COMPUTATIONAL_BUCKET',
    label: 'Two-dimensional continuum FEA',
    stageIds: ['LAFEA.3'],
    numericalMachine:
      'T6/Q8 plane stress or plane strain through the registered LAFEA.3 route.',
    authoritativeOutputs: [
      'DISPLACEMENT',
      'GAUSS_STRESS',
      'REACTION',
      'STRAIN_ENERGY',
    ],
    requiredProfileRoles: [
      'formulationProfileId',
      'meshProfileId',
      'recoveryProfileId',
      'solverProfileId',
    ],
    releaseStatus: 'CONCEPT',
    limitations: [
      'Axisymmetric kinematics are not registered as qualified.',
      'Nodal projection is display-only.',
      'Production geometry-to-mesh-to-convergence orchestration remains incomplete.',
    ],
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  }),
  bucket({
    bucketId: 'RECOVERY_ASSESSMENT',
    architectureOrder: 'D',
    kind: 'SHARED_PLANE',
    label: 'Recovery and assessment',
    stageIds: ['LAFEA.3', 'LAFEA.4', 'LAFEA.5', 'LAFEA.6'],
    numericalMachine:
      'No independent stiffness solve; consumes qualified recovery and convergence evidence.',
    authoritativeOutputs: [
      'CODE_CLASSIFIED_STRESS',
      'PATH_SCL_STRESS',
      'STRUCTURAL_STRESS',
      'UTILIZATION_UNDER_CONFIGURED_PROFILE',
    ],
    requiredProfileRoles: ['recoveryProfileId'],
    releaseStatus: 'BLOCKED',
    limitations: [
      'Code and allowable profiles must be caller-authorized.',
      'Every assessed quantity requires qualified convergence.',
      'Required recovery, convergence and code consumers are not yet qualified.',
    ],
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  }),
  bucket({
    bucketId: 'SURFACE_SHELL_FEA',
    architectureOrder: 'C',
    kind: 'COMPUTATIONAL_BUCKET',
    label: 'Surface and shell FEA',
    stageIds: ['LAFEA.4', 'LAFEA.5'],
    numericalMachine:
      'Production shell family subject to Agent 1 shell-formulation authority.',
    authoritativeOutputs: [
      'INTERFACE_EQUILIBRIUM',
      'SHELL_RESULTANTS',
      'SURFACE_STRESS',
    ],
    requiredProfileRoles: [
      'formulationProfileId',
      'meshProfileId',
      'recoveryProfileId',
      'solverProfileId',
    ],
    releaseStatus: 'BLOCKED',
    limitations: [
      'Current LAFEA.4 route is the legacy five-DOF CST+DKT thin shell.',
      'No visual MITC label is formulation authority.',
      'Shell templates remain blocked until Agent 1 registers a production shell authority.',
    ],
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  }),
].sort((left, right) => asciiCompare(left.bucketId, right.bucketId)));

export function requireLafeaComputationalBucket(bucketId) {
  if (!LAFEA_BUCKET_IDS.includes(bucketId)) {
    throw new TypeError(`Unsupported LAFEA computational bucket: ${bucketId}.`);
  }
  const bucketEntry = LAFEA_COMPUTATIONAL_BUCKET_REGISTRY
    .find((entry) => entry.bucketId === bucketId);
  if (!bucketEntry) {
    throw new TypeError(`LAFEA computational bucket is missing: ${bucketId}.`);
  }
  return bucketEntry;
}

export function validateLafeaComputationalBucketRegistry(
  registry = LAFEA_COMPUTATIONAL_BUCKET_REGISTRY,
) {
  const errors = [];
  try {
    if (!Array.isArray(registry)) throw new TypeError('Bucket registry must be an array.');
    if (registry.length !== LAFEA_BUCKET_IDS.length) {
      throw new TypeError('Bucket registry count is invalid.');
    }
    if (
      canonicalStringify(registry.map((entry) => entry.bucketId))
      !== canonicalStringify([...LAFEA_BUCKET_IDS].sort(asciiCompare))
    ) {
      throw new TypeError('Bucket registry must use deterministic ASCII bucket ordering.');
    }
    registry.forEach((entry) => {
      assertExactKeys(
        entry,
        [...BUCKET_INPUT_KEYS, 'schema', 'semanticHash'],
        `Bucket ${entry?.bucketId ?? 'UNKNOWN'}`,
      );
      if (entry.schema !== LAFEA_COMPUTATIONAL_BUCKET_SCHEMA) {
        throw new TypeError('Bucket schema is invalid.');
      }
      const { schema: ignoredSchema, semanticHash: declaredHash, ...input } = entry;
      void ignoredSchema;
      const expected = bucket(input);
      if (
        declaredHash !== expected.semanticHash
        || canonicalStringify(entry) !== canonicalStringify(expected)
      ) {
        throw new TypeError(`Bucket ${entry.bucketId} semantic content is invalid.`);
      }
      entry.stageIds.forEach(requireLafeaStageRegistryEntry);
      if (entry.parentRegistryHash !== LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH) {
        throw new TypeError(`Bucket ${entry.bucketId} has stale registry ancestry.`);
      }
      if (!Object.isFrozen(entry)) throw new TypeError(`Bucket ${entry.bucketId} is mutable.`);
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function bucket(value) {
  assertExactKeys(value, BUCKET_INPUT_KEYS, 'Computational bucket input');
  const stageIds = sortedStrings(value.stageIds, 'stageIds');
  const base = {
    schema: LAFEA_COMPUTATIONAL_BUCKET_SCHEMA,
    bucketId: enumValue(value.bucketId, LAFEA_BUCKET_IDS, 'bucketId'),
    architectureOrder: enumValue(
      value.architectureOrder,
      ['A', 'B', 'C', 'D'],
      'architectureOrder',
    ),
    kind: enumValue(
      value.kind,
      ['COMPUTATIONAL_BUCKET', 'SHARED_PLANE'],
      'kind',
    ),
    label: text(value.label, 'label'),
    stageIds,
    numericalMachine: text(value.numericalMachine, 'numericalMachine'),
    authoritativeOutputs: sortedStrings(
      value.authoritativeOutputs,
      'authoritativeOutputs',
    ),
    requiredProfileRoles: sortedStrings(
      value.requiredProfileRoles,
      'requiredProfileRoles',
    ),
    releaseStatus: enumValue(
      value.releaseStatus,
      LAFEA_TEMPLATE_RELEASE_STATUSES,
      'releaseStatus',
    ),
    limitations: sortedStrings(value.limitations, 'limitations'),
    parentRegistryHash: hash(value.parentRegistryHash, 'parentRegistryHash'),
  };
  if (base.limitations.length === 0) {
    throw new TypeError('Bucket limitations must not be empty.');
  }
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function pickDependencyEntry(source) {
  if (!source || typeof source !== 'object') {
    throw new TypeError('Stage registry dependency entry must be an object.');
  }
  return {
    stageId: source.stageId,
    engineState: source.engineState,
    enginePackage: source.enginePackage,
    authority: source.authority,
    inputContractRole: source.inputContractRole,
    resultContractRole: source.resultContractRole,
    presenterRole: source.presenterRole,
    previewPolicy: source.previewPolicy,
    previewSource: source.previewSource,
    collectionPaths: source.collectionPaths,
  };
}

function sortedStrings(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array.`);
  const result = value.map((item) => text(item, field)).sort(asciiCompare);
  if (new Set(result).size !== result.length) {
    throw new TypeError(`${field} must contain unique values.`);
  }
  return result;
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  if (/[^\x20-\x7e]/u.test(value)) {
    throw new TypeError(`${field} must contain printable ASCII only.`);
  }
  return value.trim();
}

function enumValue(value, allowed, field) {
  if (!allowed.includes(value)) throw new TypeError(`${field} is invalid.`);
  return value;
}

function hash(value, field) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${field} must be a semantic hash.`);
  }
  return value;
}
