import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  createTopologyEditSourcePatch,
  readTopologyEditSourceJsonPointer,
} from './topology-edit-source-surgical-patch.js';

const VALVE_ALLOWED_KEYS = new Set([
  'diameterMm', 'outsideDiameterMm', 'diameterAuthority', 'componentLengthMm',
  'valveFaceToFaceMm', 'componentMassKg', 'materialSpecification', 'pressureClass',
  'pipingClass', 'endConnectionFrom', 'endConnectionTo', 'valveType', 'lengthAuthority',
  'insertionDirection', 'topologyOperation', 'catalogueBinding', 'catalogueRecordId',
  'catalogueRecordHash', 'catalogueHash', 'catalogueSourceHash', 'lastModifiedByCommandId',
  'editAncestry',
]);
const TEE_ALLOWED_KEYS = new Set([
  'runDiameterMm', 'branchDiameterMm', 'branchNodeId', 'runNodeIds', 'branchPortKey',
  'branchRelation', 'topologyOperation', 'lastModifiedByCommandId', 'editAncestry',
]);

export function compileTopologyEditStagedJsonEngineeringPatches({
  dataset, baseCanonicalTopology: base, canonicalTopology: edited,
} = {}) {
  assertSameIds(base?.nodes, edited?.nodes, 'nodes');
  assertSameIds(base?.edges, edited?.edges, 'edges');
  assertSameIds(base?.junctions, edited?.junctions, 'junctions');
  assertNodeNonGeometry(base.nodes, edited.nodes);
  for (const key of ['supports', 'boundaries', 'rigids', 'bends']) {
    if (semanticHash(base?.[key] ?? []) !== semanticHash(edited?.[key] ?? [])) {
      unsupported(`${key} changed`);
    }
  }

  const entities = new Map((dataset?.entities ?? []).map((row) => [row.entityId, row]));
  const patches = [];
  const changedEdgeIds = [];
  const changedJunctionIds = [];
  const baseEdges = new Map(base.edges.map((row) => [row.id, row]));
  for (const edge of edited.edges) {
    const prior = baseEdges.get(edge.id);
    if (semanticHash(prior) === semanticHash(edge)) continue;
    if (!isValveReplacement(prior, edge)) unsupported(`edge ${edge.id} changed`);
    const entity = exactEntity(entities, edge.componentKey, edge.id);
    patches.push(...compileValvePatches(dataset, entity, edge));
    changedEdgeIds.push(edge.id);
  }

  const baseJunctions = new Map(base.junctions.map((row) => [row.id, row]));
  for (const junction of edited.junctions) {
    const prior = baseJunctions.get(junction.id);
    if (semanticHash(prior) === semanticHash(junction)) continue;
    if (!isTeeRelationUpdate(prior, junction)) unsupported(`junction ${junction.id} changed`);
    const entity = exactEntity(entities, junction.componentKey, junction.id);
    patches.push(...compileTeePatches(dataset, entity, junction));
    changedJunctionIds.push(junction.id);
  }
  return deepFreeze({
    patches,
    changedEdgeIds: changedEdgeIds.sort(),
    changedJunctionIds: changedJunctionIds.sort(),
  });
}

function isValveReplacement(prior, edited) {
  return token(prior?.entityType) === 'VALVE'
    && token(edited?.entityType) === 'VALVE'
    && edited?.topologyOperation === 'REPLACE_INLINE_COMPONENT'
    && exactStableRecord(prior, edited, VALVE_ALLOWED_KEYS)
    && exactValveBinding(edited.catalogueBinding);
}

function isTeeRelationUpdate(prior, edited) {
  return token(prior?.entityType) === 'TEE'
    && token(edited?.entityType) === 'TEE'
    && edited?.topologyOperation === 'UPDATE_JUNCTION_BRANCH_RELATION'
    && exactStableRecord(prior, edited, TEE_ALLOWED_KEYS)
    && exactTeeRelation(edited.branchRelation);
}

function compileValvePatches(dataset, entity, edge) {
  const binding = edge.catalogueBinding;
  const patches = [
    attributePatch(dataset, entity, ['VALVE_TYPE'], edge.valveType, edge.id, 'valveType'),
    attributePatch(dataset, entity, ['FACE_TO_FACE_MM', 'COMPONENT_LENGTH_MM'], edge.valveFaceToFaceMm, edge.id, 'valveFaceToFaceMm'),
    attributePatch(dataset, entity, ['PIPING_CLASS'], edge.pipingClass, edge.id, 'pipingClass'),
    attributePatch(dataset, entity, ['PRESSURE_CLASS', 'RATING'], edge.pressureClass, edge.id, 'pressureClass'),
    attributePatch(dataset, entity, ['MATERIAL_SPECIFICATION', 'MATERIAL'], edge.materialSpecification, edge.id, 'materialSpecification'),
    attributePatch(dataset, entity, ['COMPONENT_WEIGHT_KG', 'COMPONENT_MASS_KG'], edge.componentMassKg, edge.id, 'componentMassKg'),
    attributePatch(dataset, entity, ['END_CONNECTION_FROM'], edge.endConnectionFrom, edge.id, 'endConnectionFrom'),
    attributePatch(dataset, entity, ['END_CONNECTION_TO'], edge.endConnectionTo, edge.id, 'endConnectionTo'),
    attributePatch(dataset, entity, ['OUTSIDE_DIAMETER_MM', 'OUTSIDE_DIAMETER'], edge.outsideDiameterMm, edge.id, 'outsideDiameterMm'),
    attributePatch(dataset, entity, ['TOPOLOGY_EDIT_LENGTH_AUTHORITY'], edge.lengthAuthority, edge.id, 'lengthAuthority'),
    attributePatch(dataset, entity, ['TOPOLOGY_EDIT_INSERTION_DIRECTION'], edge.insertionDirection, edge.id, 'insertionDirection'),
    nativeNumberPatch(dataset, entity, ['outerDiameter', 'outsideDiameterMm'], edge.outsideDiameterMm, edge.id, 'nativeOutsideDiameterMm'),
    cataloguePatch(dataset, entity, binding, edge.id),
  ];
  return patches.filter(Boolean);
}

function compileTeePatches(dataset, entity, junction) {
  const relation = junction.branchRelation;
  return [
    attributePatch(dataset, entity, ['RUN_DN', 'RUN_DIAMETER'], relation.runNominalSizeMm, junction.id, 'runNominalSizeMm'),
    attributePatch(dataset, entity, ['BRANCH_DN', 'BRANCH_DIAMETER'], relation.teeBranchNominalSizeMm, junction.id, 'teeBranchNominalSizeMm'),
    attributePatch(dataset, entity, ['TOPOLOGY_EDIT_RELATION_POLICY'], relation.relationPolicy, junction.id, 'relationPolicy'),
    attributePatch(dataset, entity, ['TOPOLOGY_EDIT_BRANCH_PORT_KEY'], relation.branchPortKey, junction.id, 'branchPortKey'),
    attributePatch(dataset, entity, ['TOPOLOGY_EDIT_REDUCER_RECORD_ID'], relation.reducerRecordId, junction.id, 'reducerRecordId'),
  ].filter(Boolean);
}

function cataloguePatch(dataset, entity, binding, canonicalId) {
  const pointer = `${entityPointer(entity)}/nativeParams/catalogue`;
  const before = readTopologyEditSourceJsonPointer(dataset.sourceSnapshot.sourcePackage, pointer);
  if (!before || typeof before !== 'object' || Array.isArray(before)) {
    fail(`${canonicalId} catalogue source object is not writable.`);
  }
  const value = {
    ...before,
    catalogueHash: binding.catalogueHash,
    catalogueSourceHash: binding.sourceHash,
    catalogueRecordId: binding.recordId,
    catalogueRecordHash: binding.recordHash,
    catalogueSourceReference: structuredClone(binding.sourceReference),
    componentType: 'VALVE',
    nominalSizeMm: binding.nominalSizeMm,
    outsideDiameterMm: binding.outsideDiameterMm,
    pipingClass: binding.pipingClass,
    pressureClass: binding.pressureClass,
    materialSpecification: binding.materialSpecification,
    componentMassKg: binding.componentMassKg,
    endConnectionFrom: binding.endConnectionFrom,
    endConnectionTo: binding.endConnectionTo,
    valveType: binding.valveType,
    valveFaceToFaceMm: binding.valveFaceToFaceMm,
  };
  return sourcePatch(pointer, canonicalId, 'catalogueBinding', before, value);
}

function attributePatch(dataset, entity, candidates, value, canonicalId, property) {
  const attributes = entity?.properties?.attributes;
  const key = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(attributes ?? {}, candidate));
  if (!key) fail(`${canonicalId} source attribute for ${property} is not explicitly writable.`);
  const pointer = `${entityPointer(entity)}/attributes/${escapePointer(key)}`;
  const before = readTopologyEditSourceJsonPointer(dataset.sourceSnapshot.sourcePackage, pointer);
  return sourcePatch(pointer, canonicalId, property, before, value);
}

function nativeNumberPatch(dataset, entity, candidates, value, canonicalId, property) {
  const native = entity?.properties?.nativeParams;
  const key = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(native ?? {}, candidate));
  if (!key) fail(`${canonicalId} native source field for ${property} is not explicitly writable.`);
  const pointer = `${entityPointer(entity)}/nativeParams/${escapePointer(key)}`;
  const before = readTopologyEditSourceJsonPointer(dataset.sourceSnapshot.sourcePackage, pointer);
  return sourcePatch(pointer, canonicalId, property, before, value);
}

function sourcePatch(pointer, canonicalId, property, before, value) {
  if (semanticHash(before) === semanticHash(value)) return null;
  return createTopologyEditSourcePatch({
    pointer,
    canonicalId,
    property,
    expectedPreimageHash: semanticHash(before),
    value,
  });
}

function exactValveBinding(value) {
  const required = [
    'catalogueHash', 'sourceHash', 'recordId', 'recordHash', 'sourceReference',
    'nominalSizeMm', 'outsideDiameterMm', 'pipingClass', 'endConnectionFrom',
    'endConnectionTo', 'valveType', 'valveFaceToFaceMm',
  ];
  return value?.componentType === 'VALVE' && required.every((key) => value[key] !== null && value[key] !== undefined && value[key] !== '');
}

function exactTeeRelation(value) {
  return value?.schema === 'TopologyEditJunctionBranchRelation.v1'
    && value.relationPolicy === 'EXPLICIT_REDUCER'
    && Boolean(value.branchNodeId && value.branchPortKey && value.reducerEdgeId
      && value.reducerRecordId && value.reducerRecordHash && value.reducerCatalogueHash
      && value.reducerSourceHash && value.runNominalSizeMm && value.teeBranchNominalSizeMm
      && value.downstreamNominalSizeMm)
    && Array.isArray(value.runNodeIds) && value.runNodeIds.length === 2;
}

function exactStableRecord(left, right, allowedKeys) {
  const strip = (value) => Object.fromEntries(Object.entries(value ?? {})
    .filter(([key]) => !allowedKeys.has(key)));
  return semanticHash(strip(left)) === semanticHash(strip(right));
}
function assertSameIds(left, right, label) {
  const ids = (rows) => (rows ?? []).map((row) => row.id).sort();
  if (semanticHash(ids(left)) !== semanticHash(ids(right))) {
    unsupported(`${label} identity changed`);
  }
}
function assertNodeNonGeometry(left, right) {
  const index = new Map((left ?? []).map((row) => [row.id, row]));
  for (const row of right ?? []) {
    const prior = index.get(row.id);
    const strip = (value) => Object.fromEntries(Object.entries(value ?? {})
      .filter(([key]) => key !== 'position'));
    if (semanticHash(strip(prior)) !== semanticHash(strip(row))) {
      unsupported(`node ${row.id} changed`);
    }
  }
}
function exactEntity(index, componentKey, canonicalId) {
  const entity = componentKey ? index.get(componentKey) : null;
  if (!entity) fail(`${canonicalId} has no exact source entity.`);
  return entity;
}
function entityPointer(entity) {
  const pointer = String(entity?.jsonPointer ?? '');
  if (!pointer.startsWith('/')) fail('source entity JSON Pointer is missing.');
  return pointer;
}
function escapePointer(value) { return String(value).replace(/~/gu, '~0').replace(/\//gu, '~1'); }
function token(value) { return String(value ?? '').trim().toUpperCase(); }
function unsupported(label) {
  fail(`${label} outside the qualified geometry vocabulary or explicit M06/M10 engineering vocabulary.`);
}
function fail(message) { throw new RangeError(`StagedJSON writeback: ${message}`); }
