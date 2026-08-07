import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  compileTopologyEditStagedJsonEngineeringPatches,
} from './topology-edit-stagedjson-engineering-writeback.js';
import {
  createTopologyEditSourcePatch,
  prepareTopologyEditSourceSurgicalPatch,
  readTopologyEditSourceJsonPointer,
} from './topology-edit-source-surgical-patch.js';

export const TOPOLOGY_EDIT_STAGEDJSON_WRITEBACK_SCHEMA =
  'TopologyEditStagedJsonWriteback.v1';

const STAGED_JSON_SCHEMAS = new Set([
  'rvm-converter-stage/v1',
  'json-viewer-selection/v1',
  'inputxml-managed-stage/v1',
]);

export function prepareTopologyEditStagedJsonWriteback(input = {}) {
  const dataset = assertDataset(input.dataset);
  const base = assertCanonical(input.baseCanonicalTopology, 'baseCanonicalTopology');
  const edited = assertCanonical(input.canonicalTopology, 'canonicalTopology');
  assertSourceAuthority(dataset, base, edited);
  const engineering = compileTopologyEditStagedJsonEngineeringPatches({
    dataset,
    baseCanonicalTopology: base,
    canonicalTopology: edited,
  });

  const entities = new Map((dataset.entities ?? []).map((row) => [row.entityId, row]));
  const baseNodes = new Map(base.nodes.map((row) => [row.id, row]));
  const editedNodes = new Map(edited.nodes.map((row) => [row.id, row]));
  const patches = [...engineering.patches];
  const changedNodeIds = [];

  for (const [nodeId, editedNode] of editedNodes) {
    const baseNode = baseNodes.get(nodeId);
    if (!baseNode) throw new RangeError(`StagedJSON writeback: new node ${nodeId} is not source-representable.`);
    if (semanticHash(baseNode.position) === semanticHash(editedNode.position)) continue;
    changedNodeIds.push(nodeId);
    compileNodeEndpointPatches({ nodeId, position: editedNode.position, base, dataset, entities, patches });
  }

  if (!patches.length) {
    throw new RangeError('StagedJSON writeback: no source-representable changes were found.');
  }
  const surgical = prepareTopologyEditSourceSurgicalPatch({
    sourceSnapshot: dataset.sourceSnapshot,
    patches,
  });
  const material = {
    schema: TOPOLOGY_EDIT_STAGEDJSON_WRITEBACK_SCHEMA,
    datasetId: dataset.datasetId,
    sourceSchema: dataset.sourceSchema,
    baseCanonicalTopologyHash: base.canonicalTopologyHash,
    canonicalTopologyHash: edited.canonicalTopologyHash,
    sourceHash: dataset.sourceSnapshot.sourceSemanticHash,
    changedNodeIds: [...changedNodeIds].sort(),
    changedEdgeIds: engineering.changedEdgeIds,
    changedJunctionIds: engineering.changedJunctionIds,
    patchHashes: surgical.patchHashes,
    surgicalPatchHash: surgical.surgicalPatchHash,
    resultingSourceSemanticHash: surgical.resultingSourceSemanticHash,
  };
  return deepFreeze({
    ...material,
    writebackHash: semanticHash(material),
    patches,
    surgical,
  });
}

export function assertTopologyEditStagedJsonWriteback(value) {
  if (value?.schema !== TOPOLOGY_EDIT_STAGEDJSON_WRITEBACK_SCHEMA) {
    throw new TypeError(`StagedJSON writeback must use ${TOPOLOGY_EDIT_STAGEDJSON_WRITEBACK_SCHEMA}.`);
  }
  const { writebackHash, patches: _patches, surgical: _surgical, ...material } = value;
  if (semanticHash(material) !== writebackHash
    || value.surgical?.surgicalPatchHash !== value.surgicalPatchHash) {
    throw new Error('StagedJSON writeback: authority hash mismatch.');
  }
  return value;
}

function compileNodeEndpointPatches({ nodeId, position, base, dataset, entities, patches }) {
  let represented = 0;
  for (const edge of base.edges) {
    const role = edge.fromNodeId === nodeId ? 'start' : edge.toNodeId === nodeId ? 'end' : null;
    if (!role) continue;
    const entity = entities.get(edge.componentKey);
    if (!entity) throw new RangeError(`StagedJSON writeback: missing source entity ${edge.componentKey}.`);
    patches.push(pointPatch(dataset, entity, role, position, edge.id));
    represented += 1;
    const centerPatch = explicitCenterPatch(dataset, entity, edge, nodeId, position, base);
    if (centerPatch) patches.push(centerPatch);
  }
  if (!represented) {
    throw new RangeError(`StagedJSON writeback: changed node ${nodeId} has no exact imported edge endpoint.`);
  }
}

function pointPatch(dataset, entity, role, position, canonicalId) {
  const source = entity.properties?.geometry?.sources?.[role] ?? '';
  const suffix = sourceSuffix(source);
  if (!suffix) {
    throw new RangeError(`StagedJSON writeback: ${canonicalId} ${role} source ${source || 'missing'} is not writable.`);
  }
  const pointer = appendPointer(entity.jsonPointer, suffix);
  const before = readTopologyEditSourceJsonPointer(dataset.sourceSnapshot.sourcePackage, pointer);
  const value = pointLike(before, position);
  return createTopologyEditSourcePatch({
    pointer,
    canonicalId,
    property: `${role}Position`,
    expectedPreimageHash: semanticHash(before),
    value,
  });
}

function explicitCenterPatch(dataset, entity, edge, movedNodeId, movedPosition, base) {
  if (!entity.properties?.geometry?.explicitCenter) return null;
  const source = entity.properties?.geometry?.sources?.center ?? '';
  const suffix = sourceSuffix(source);
  if (!suffix) {
    throw new RangeError(`StagedJSON writeback: ${edge.id} explicit center source ${source || 'missing'} is not writable.`);
  }
  const otherNodeId = edge.fromNodeId === movedNodeId ? edge.toNodeId : edge.fromNodeId;
  const other = base.nodes.find((row) => row.id === otherNodeId)?.position;
  if (!other) throw new RangeError(`StagedJSON writeback: missing peer node ${otherNodeId}.`);
  const center = midpoint(movedPosition, other);
  const pointer = appendPointer(entity.jsonPointer, suffix);
  const before = readTopologyEditSourceJsonPointer(dataset.sourceSnapshot.sourcePackage, pointer);
  return createTopologyEditSourcePatch({
    pointer,
    canonicalId: edge.id,
    property: 'centerPosition',
    expectedPreimageHash: semanticHash(before),
    value: pointLike(before, center),
  });
}

function sourceSuffix(source) {
  const map = {
    'nativeParams.startPoint': '/nativeParams/startPoint',
    'nativeParams.endPoint': '/nativeParams/endPoint',
    'nativeParams.center': '/nativeParams/center',
    'nativeParams.centrePoint': '/nativeParams/centrePoint',
    'item.apos': '/apos',
    'item.lpos': '/lpos',
    'item.center': '/center',
    'item.centrePoint': '/centrePoint',
    'attributes.APOS': '/attributes/APOS',
    'attributes.LPOS': '/attributes/LPOS',
    'attributes.CENTER': '/attributes/CENTER',
    'sourceAttributes.APOS': '/sourceAttributes/APOS',
    'sourceAttributes.LPOS': '/sourceAttributes/LPOS',
    'sourceAttributes.CENTER': '/sourceAttributes/CENTER',
  };
  return map[source] ?? null;
}

function pointLike(before, point) {
  const xyz = [finite(point?.x), finite(point?.y), finite(point?.z)];
  if (Array.isArray(before)) return [...xyz, ...before.slice(3)];
  if (before && typeof before === 'object') {
    const result = { ...before };
    const upper = ['X', 'Y', 'Z'].some((key) => Object.prototype.hasOwnProperty.call(before, key));
    const keys = upper ? ['X', 'Y', 'Z'] : ['x', 'y', 'z'];
    keys.forEach((key, index) => { result[key] = xyz[index]; });
    return result;
  }
  if (typeof before === 'string') return xyz.join(' ');
  throw new RangeError('StagedJSON writeback: source point shape is not writable without regeneration.');
}

function assertSourceAuthority(dataset, base, edited) {
  if (!STAGED_JSON_SCHEMAS.has(dataset.sourceSchema)) {
    throw new RangeError(`StagedJSON writeback: unsupported source schema ${dataset.sourceSchema}.`);
  }
  if (!dataset.sourceSnapshot || dataset.sourceSnapshot.datasetId !== dataset.datasetId) {
    throw new RangeError('StagedJSON writeback: source snapshot custody is missing or mismatched.');
  }
  if (base.datasetId !== dataset.datasetId || edited.datasetId !== dataset.datasetId
    || base.sourceHash !== dataset.sourceSnapshot.sourceSemanticHash) {
    throw new RangeError('StagedJSON writeback: canonical/source authority is stale.');
  }
}
function assertDataset(value) {
  if (!value?.datasetId || !Array.isArray(value.entities) || !value.sourceSnapshot) {
    throw new TypeError('StagedJSON writeback requires a workspace dataset with source custody.');
  }
  return value;
}
function assertCanonical(value, label) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new TypeError(`StagedJSON writeback requires ${label}.`);
  }
  return value;
}
function appendPointer(base, suffix) {
  const pointer = String(base ?? '');
  if (!pointer.startsWith('/')) throw new RangeError('StagedJSON writeback: entity JSON Pointer is missing.');
  return `${pointer}${suffix}`;
}
function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}
function finite(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new RangeError('StagedJSON writeback: point coordinates must be finite.');
  return Object.is(number, -0) ? 0 : number;
}
