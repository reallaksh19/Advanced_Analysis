/**
 * Governed, stage-specific editable-input descriptors for the LAFEA workbench.
 *
 * These descriptors authorize a bounded editable surface. They do not discover
 * fields recursively or create lifecycle, mesh, solve or code authority.
 */
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  contractError,
  deepFreeze,
  getAtPath,
  getAtSegments,
  isRecord,
  validateDescriptor,
} from './lafea-stage-input-descriptor-contracts.js';
import {
  LAFEA_PIPE_INPUT_DESCRIPTORS,
} from './lafea-stage-input-descriptors-pipe.js';
import {
  LAFEA_CONTINUUM_INPUT_DESCRIPTORS,
} from './lafea-stage-input-descriptors-continuum.js';
import {
  LAFEA_SHELL_INPUT_DESCRIPTORS,
} from './lafea-stage-input-descriptors-shell.js';

export {
  LAFEA_INPUT_CONTROLS,
  LAFEA_INPUT_DESCRIPTOR_REVISION,
  LAFEA_INPUT_DESCRIPTOR_SCHEMA,
  LAFEA_INPUT_DOMAIN_TYPES,
  LAFEA_INVALIDATION_CLASSES,
  LAFEA_VALUE_STATES,
} from './lafea-stage-input-descriptor-contracts.js';

const DEFINITIONS = Object.freeze({
  ...LAFEA_PIPE_INPUT_DESCRIPTORS,
  ...LAFEA_CONTINUUM_INPUT_DESCRIPTORS,
  ...LAFEA_SHELL_INPUT_DESCRIPTORS,
});

export const LAFEA_COLLECTION_IDENTITY_KEYS = deepFreeze({
  'LAFEA.1': {
    materials: 'identity',
    pressureDefinitions: 'identity',
    loadReferencePoints: 'identity',
    loadCases: 'identity',
  },
  'LAFEA.2': {
    screeningCases: 'screeningCaseId',
    evaluationLocations: 'evaluationLocationId',
  },
  'LAFEA.3': {
    materials: 'materialId',
    nodes: 'nodeId',
    elements: 'elementId',
    constraints: 'constraintId',
    loadCases: 'loadCaseId',
  },
  'LAFEA.4': {
    materials: 'materialId',
    nodes: 'nodeId',
    elements: 'elementId',
    constraints: 'constraintId',
    loadCases: 'loadCaseId',
  },
  'LAFEA.5': {
    'shellTemplate.materials': 'materialId',
    'shellTemplate.nodes': 'nodeId',
    'shellTemplate.elements': 'elementId',
    'shellTemplate.constraints': 'constraintId',
    loadCaseMappings: 'workflowLoadCaseId',
    assessmentRegions: 'regionId',
  },
  'LAFEA.6': {
    materials: 'materialId',
    nodes: 'nodeId',
    elements: 'elementId',
    loadCases: 'loadCaseId',
  },
});

for (const stageId of Object.keys(DEFINITIONS)) {
  requireLafeaStageRegistryEntry(stageId);
  DEFINITIONS[stageId].forEach(validateDescriptor);
}

/** Return the immutable descriptor catalog for one exact stage. */
export function lafeaStageInputDescriptors(stageId) {
  requireLafeaStageRegistryEntry(stageId);
  return DEFINITIONS[stageId];
}

/** Resolve one exact descriptor by stable ID. */
export function requireLafeaInputDescriptor(stageId, descriptorId) {
  const result = lafeaStageInputDescriptors(stageId)
    .find((descriptor) => descriptor.descriptorId === descriptorId);
  if (!result) {
    throw contractError(
      'LAFEA_INPUT_DESCRIPTOR_NOT_FOUND',
      `No input descriptor ${descriptorId} is registered for ${stageId}.`,
    );
  }
  return result;
}

/** Resolve the display unit without changing the stored engineering value. */
export function resolveLafeaDescriptorUnit(documentValue, descriptor) {
  if (descriptor.unitContract.canonicalUnit) {
    return descriptor.unitContract.canonicalUnit;
  }
  const value = getAtSegments(
    documentValue,
    descriptor.unitContract.unitSourcePath,
  );
  return typeof value === 'string' ? value : null;
}

/** Resolve the retained source reference associated with the target field. */
export function resolveLafeaDescriptorSourceRef(
  documentValue,
  descriptor,
  entityId = null,
) {
  const root = resolveDescriptorEntity(documentValue, descriptor, entityId);
  const value = getAtSegments(root, descriptor.metadataPolicy.sourceRefPath);
  return typeof value === 'string' ? value : null;
}

/** Resolve the exact collection identity contract for a stage. */
export function lafeaCollectionIdentityKeys(stageId) {
  requireLafeaStageRegistryEntry(stageId);
  return LAFEA_COLLECTION_IDENTITY_KEYS[stageId];
}

/** Resolve an entity strictly by engineering identity; no index fallback. */
export function resolveDescriptorEntity(documentValue, descriptor, entityId = null) {
  if (!descriptor.target.collectionPath) return documentValue;
  if (typeof entityId !== 'string' || !entityId) {
    throw contractError(
      'LAFEA_ENTITY_ID_REQUIRED',
      `${descriptor.descriptorId} requires an exact entity ID.`,
    );
  }
  const rows = getAtPath(documentValue, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) {
    throw contractError(
      'LAFEA_COLLECTION_NOT_FOUND',
      `Missing collection ${descriptor.target.collectionPath}.`,
    );
  }
  return requireUniqueEntity(rows, descriptor, entityId);
}

function requireUniqueEntity(rows, descriptor, entityId) {
  const matches = rows.filter((row) => isRecord(row)
    && row[descriptor.target.identityKey] === entityId);
  if (matches.length === 1) return matches[0];
  throw contractError(
    matches.length ? 'LAFEA_IDENTITY_COLLISION' : 'LAFEA_ENTITY_NOT_FOUND',
    `${descriptor.target.collectionPath} must contain exactly one ${descriptor.target.identityKey}=${entityId}.`,
  );
}
