import { buildSharedPipingModelFromWorkspaceDataset } from '../../core/shared-piping-model/adapters/workspace-dataset-to-shared.js';
import {
  createSourcePackageSnapshot,
  validateSourcePackageSnapshot,
} from '../../core/shared-piping-model/source-package-snapshot.js';
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { buildDatasetHierarchy } from '../dataset-hierarchy.js';
import { WORKSPACE_DATASET_SCHEMA } from '../dataset-adapter.js';
import { TOPOLOGY_EDIT_CANONICAL_SCHEMA } from './topology-edit-source-adapter.js';
import {
  assertCanonicalTopologyHash,
  finalizeCanonicalTopology,
} from './topology-edit-canonical-state.js';

export const NATIVE_MODEL_BOOTSTRAP_REQUEST_SCHEMA = 'NativeModelBootstrapRequest.v1';
export const NATIVE_MODEL_BOOTSTRAP_SCHEMA = 'NativeModelBootstrap.v1';
export const NATIVE_MODEL_SOURCE_SCHEMA = 'Native3DAuthoringSource.v1';
export const NATIVE_MODEL_SOURCE_KIND = 'NATIVE_3D_AUTHORING';
export const NATIVE_MODEL_IDENTITY_POLICY = 'COMMAND_ROLE_HASH_V1';

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const REQUEST_KEYS = new Set([
  'schema', 'requestHash', 'modelKey', 'documentId', 'revision', 'sourceKind',
  'unitSystem', 'coordinateSystem', 'catalogueBasis', 'identityPolicy',
  'authoringPolicyHash',
]);

function fail(message, Constructor = TypeError) {
  throw new Constructor(`NativeModelBootstrap: ${message}`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function exactHash(value, label) {
  const hash = requiredText(value, label).toLowerCase();
  if (!SHA256.test(hash)) fail(`${label} must be sha256:<64 lowercase hex>.`, RangeError);
  return hash;
}
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}
function onlyKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) fail(`${label} contains unsupported field(s): ${unknown.sort().join(', ')}.`);
}
function normalizedUnits(value) {
  const source = record(value, 'unitSystem');
  onlyKeys(source, new Set(['length', 'angle']), 'unitSystem');
  const length = requiredText(source.length, 'unitSystem.length').toUpperCase();
  const angle = requiredText(source.angle, 'unitSystem.angle').toUpperCase();
  if (length !== 'MM' || angle !== 'DEG') {
    fail('unitSystem must be { length: MM, angle: DEG }.', RangeError);
  }
  return { length, angle };
}
function normalizedTransform(value) {
  if (!Array.isArray(value) || value.length !== 16) {
    fail('coordinateSystem.transformToModel must contain 16 numbers.', RangeError);
  }
  const matrix = value.map(Number);
  if (!matrix.every(Number.isFinite)) {
    fail('coordinateSystem.transformToModel must contain finite numbers.', RangeError);
  }
  return matrix.map((number) => Object.is(number, -0) ? 0 : number);
}
function normalizedCoordinateSystem(value) {
  const source = record(value, 'coordinateSystem');
  onlyKeys(source, new Set(['coordinateSystemId', 'datumId', 'transformToModel']), 'coordinateSystem');
  return {
    coordinateSystemId: requiredText(source.coordinateSystemId, 'coordinateSystem.coordinateSystemId'),
    datumId: requiredText(source.datumId, 'coordinateSystem.datumId'),
    transformToModel: normalizedTransform(source.transformToModel),
  };
}
function normalizedCatalogueBasis(value) {
  const source = record(value, 'catalogueBasis');
  onlyKeys(source, new Set([
    'catalogueId', 'catalogueVersion', 'catalogueHash', 'sourceHash',
  ]), 'catalogueBasis');
  return {
    catalogueId: requiredText(source.catalogueId, 'catalogueBasis.catalogueId'),
    catalogueVersion: requiredText(source.catalogueVersion, 'catalogueBasis.catalogueVersion'),
    catalogueHash: exactHash(source.catalogueHash, 'catalogueBasis.catalogueHash'),
    sourceHash: exactHash(source.sourceHash, 'catalogueBasis.sourceHash'),
  };
}
function requestMaterial(input) {
  const source = record(input, 'request');
  onlyKeys(source, REQUEST_KEYS, 'request');
  const sourceKind = requiredText(
    source.sourceKind ?? NATIVE_MODEL_SOURCE_KIND,
    'sourceKind',
  ).toUpperCase();
  if (sourceKind !== NATIVE_MODEL_SOURCE_KIND) {
    fail(`sourceKind must be ${NATIVE_MODEL_SOURCE_KIND}.`, RangeError);
  }
  const identityPolicy = requiredText(
    source.identityPolicy ?? NATIVE_MODEL_IDENTITY_POLICY,
    'identityPolicy',
  ).toUpperCase();
  if (identityPolicy !== NATIVE_MODEL_IDENTITY_POLICY) {
    fail(`identityPolicy must be ${NATIVE_MODEL_IDENTITY_POLICY}.`, RangeError);
  }
  return {
    schema: NATIVE_MODEL_BOOTSTRAP_REQUEST_SCHEMA,
    modelKey: requiredText(source.modelKey, 'modelKey'),
    documentId: requiredText(source.documentId, 'documentId'),
    revision: requiredText(source.revision, 'revision'),
    sourceKind,
    unitSystem: normalizedUnits(source.unitSystem),
    coordinateSystem: normalizedCoordinateSystem(source.coordinateSystem),
    catalogueBasis: normalizedCatalogueBasis(source.catalogueBasis),
    identityPolicy,
    authoringPolicyHash: exactHash(source.authoringPolicyHash, 'authoringPolicyHash'),
  };
}

export function createNativeModelBootstrapRequest(input = {}) {
  const material = requestMaterial(input);
  return deepFreeze({ ...material, requestHash: semanticHash(material) });
}

export function assertNativeModelBootstrapRequest(value) {
  const rebuilt = createNativeModelBootstrapRequest(value);
  if (value?.schema !== NATIVE_MODEL_BOOTSTRAP_REQUEST_SCHEMA
    || value?.requestHash !== rebuilt.requestHash) {
    fail('request differs from its immutable normalized authority.', RangeError);
  }
  return rebuilt;
}

function digest(material) {
  return semanticHash(material).split(':').at(-1);
}
function identities(request) {
  const datasetId = `native-dataset:${digest({
    schema: 'NativeModelDatasetIdentity.v1',
    modelKey: request.modelKey,
    documentId: request.documentId,
    requestHash: request.requestHash,
  }).slice(0, 32)}`;
  const nativeModelId = `native-model:${digest({
    schema: 'NativeModelIdentity.v1', datasetId, documentId: request.documentId,
  }).slice(0, 32)}`;
  return { datasetId, nativeModelId };
}
function sourcePackage(request, nativeModelId) {
  return {
    schema: NATIVE_MODEL_SOURCE_SCHEMA,
    sourceKind: request.sourceKind,
    nativeModelId,
    documentId: request.documentId,
    revision: request.revision,
    units: {
      length: request.unitSystem.length.toLowerCase(),
      angle: request.unitSystem.angle.toLowerCase(),
    },
    coordinateSystem: request.coordinateSystem,
    catalogueBasis: request.catalogueBasis,
    identityPolicy: request.identityPolicy,
    authoringPolicyHash: request.authoringPolicyHash,
    entities: [],
  };
}
function emptySourceModel() {
  return deepFreeze({
    schema: 'Native3DAuthoringSourceModel.v1',
    roots: [], nodes: [], entries: [], diagnostics: [],
    summary: { nodeCount: 0, rootCount: 0 },
  });
}
function emptySummary() {
  return deepFreeze({
    nodeCount: 0, sourceNodeCount: 0, sourceRootCount: 0,
    pipes: 0, supports: 0, components: 0,
  });
}

export function createNativeModelWorkspaceDataset(requestInput) {
  const request = assertNativeModelBootstrapRequest(requestInput);
  const { datasetId, nativeModelId } = identities(request);
  const sourceSnapshot = createSourcePackageSnapshot({
    datasetId,
    sourceSchema: NATIVE_MODEL_SOURCE_SCHEMA,
    sourcePackage: sourcePackage(request, nativeModelId),
    sourceBytes: null,
  });
  const sourceModel = emptySourceModel();
  const base = deepFreeze({
    schema: WORKSPACE_DATASET_SCHEMA,
    datasetId,
    version: 0,
    sourceSchema: NATIVE_MODEL_SOURCE_SCHEMA,
    sourceName: request.documentId,
    sourceSnapshot,
    sourceSha256: null,
    sourceModel,
    entities: [],
    hierarchy: buildDatasetHierarchy([]),
    summary: emptySummary(),
    source: {
      sourceKind: request.sourceKind,
      documentId: request.documentId,
      revision: request.revision,
    },
    axisTransform: { matrix: request.coordinateSystem.transformToModel },
    nativeAuthoring: {
      nativeModelId,
      bootstrapRequestHash: request.requestHash,
      coordinateSystem: request.coordinateSystem,
      catalogueBasis: request.catalogueBasis,
      identityPolicy: request.identityPolicy,
      authoringPolicyHash: request.authoringPolicyHash,
    },
  });
  return deepFreeze({
    ...base,
    sharedModel: buildSharedPipingModelFromWorkspaceDataset(base),
  });
}

export function createEmptyNativeCanonicalTopology(dataset) {
  if (!dataset || dataset.schema !== WORKSPACE_DATASET_SCHEMA) {
    fail(`dataset must use ${WORKSPACE_DATASET_SCHEMA}.`);
  }
  const snapshotValidation = validateSourcePackageSnapshot(dataset.sourceSnapshot);
  if (!snapshotValidation.ok) {
    fail(`source snapshot is invalid: ${snapshotValidation.errors.join(' ')}`, RangeError);
  }
  if (dataset.datasetId !== dataset.sourceSnapshot.datasetId) {
    fail('datasetId differs from source snapshot datasetId.', RangeError);
  }
  if (dataset.entities.length !== 0 || Number(dataset.version) !== 0) {
    fail('native bootstrap dataset must contain zero entities at version 0.', RangeError);
  }
  return finalizeCanonicalTopology({
    schema: TOPOLOGY_EDIT_CANONICAL_SCHEMA,
    datasetId: dataset.datasetId,
    datasetVersion: 0,
    sourceHash: dataset.sourceSnapshot.sourceSemanticHash,
    topologyGraphHash: semanticHash({
      schema: 'NativeEmptyTopologyGraph.v1', datasetId: dataset.datasetId,
      components: [], ports: [], connections: [],
    }),
    nodes: [], edges: [], junctions: [], supports: [],
    boundaries: [], rigids: [], bends: [],
  });
}

export function createNativeModelBootstrap(input = {}) {
  const request = createNativeModelBootstrapRequest(input);
  const dataset = createNativeModelWorkspaceDataset(request);
  const canonicalTopology = createEmptyNativeCanonicalTopology(dataset);
  const authority = {
    schema: NATIVE_MODEL_BOOTSTRAP_SCHEMA,
    requestHash: request.requestHash,
    datasetHash: semanticHash(dataset),
    sourceHash: dataset.sourceSnapshot.sourceSemanticHash,
    canonicalTopologyHash: canonicalTopology.canonicalTopologyHash,
  };
  return deepFreeze({
    ...authority,
    bootstrapHash: semanticHash(authority),
    request,
    dataset,
    canonicalTopology,
  });
}

export function assertNativeModelBootstrap(value) {
  if (value?.schema !== NATIVE_MODEL_BOOTSTRAP_SCHEMA) {
    fail(`bootstrap must use ${NATIVE_MODEL_BOOTSTRAP_SCHEMA}.`);
  }
  const rebuilt = createNativeModelBootstrap(value.request);
  for (const field of [
    'requestHash', 'datasetHash', 'sourceHash',
    'canonicalTopologyHash', 'bootstrapHash',
  ]) {
    if (value[field] !== rebuilt[field]) fail(`bootstrap ${field} mismatch.`, RangeError);
  }
  assertCanonicalTopologyHash(value.canonicalTopology);
  if (semanticHash(value.dataset) !== value.datasetHash) {
    fail('bootstrap dataset differs from datasetHash.', RangeError);
  }
  return value;
}
