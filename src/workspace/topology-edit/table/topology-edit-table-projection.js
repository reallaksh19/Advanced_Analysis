import { deepFreeze, semanticHash, stringValue } from '../../../core/shared-piping-model/index.js';
import { assertCanonicalTopologyHash } from '../topology-edit-canonical-state.js';
import { topologyEditTableColumnKeysFor } from './topology-edit-table-columns.js';
import { buildTopologyEditTableCustody } from './topology-edit-table-custody.js';

export const TOPOLOGY_EDIT_TABLE_PROJECTION_SCHEMA = 'TopologyEditTableProjection.v1';
export const TOPOLOGY_EDIT_TABLE_ROW_SCHEMA = 'TopologyEditTableRow.v1';

export function buildTopologyEditTableProjection({ canonicalTopology, dataset, topologyGraph } = {}) {
  const topology = assertCanonicalTopologyHash(canonicalTopology);
  assertAuthority(topology, dataset, topologyGraph);
  const entities = new Map((dataset?.entities ?? []).map((entity) => [entity.entityId, entity]));
  const nodes = new Map((topology.nodes ?? []).map((node) => [node.id, node]));
  const graphPorts = new Map((topologyGraph?.ports ?? []).map((port) => [port.portKey, port]));
  const context = { topology, dataset, entities, nodes, graphPorts };
  const rows = [
    ...(topology.edges ?? []).map((record) => edgeRow(record, context)),
    ...(topology.junctions ?? []).map((record) => junctionRow(record, context)),
    ...(topology.supports ?? []).map((record) => supportRow(record, context)),
  ].sort(compareRows);
  const authority = {
    datasetId: topology.datasetId,
    datasetVersion: topology.datasetVersion,
    sourceHash: topology.sourceHash,
    topologyGraphHash: topology.topologyGraphHash ?? null,
    canonicalTopologyHash: topology.canonicalTopologyHash,
  };
  const material = { schema: TOPOLOGY_EDIT_TABLE_PROJECTION_SCHEMA, authority, rows };
  return deepFreeze({ ...material, projectionHash: semanticHash(material) });
}

export function assertTopologyEditTableProjection(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_PROJECTION_SCHEMA || !Array.isArray(value.rows)) {
    throw new TypeError(`Table projection must use ${TOPOLOGY_EDIT_TABLE_PROJECTION_SCHEMA}.`);
  }
  const material = { schema: value.schema, authority: value.authority, rows: value.rows };
  if (semanticHash(material) !== value.projectionHash) {
    throw new Error('TopologyEditTableProjection: projection hash mismatch.');
  }
  return value;
}

function assertAuthority(topology, dataset, graph) {
  if (dataset && dataset.datasetId !== topology.datasetId) {
    throw new Error('TopologyEditTableProjection: datasetId differs from canonical authority.');
  }
  const sourceHash = dataset?.sourceSnapshot?.sourceSemanticHash ?? null;
  if (sourceHash && topology.sourceHash && sourceHash !== topology.sourceHash) {
    throw new Error('TopologyEditTableProjection: source hash differs from canonical authority.');
  }
  if (graph?.semanticHash && topology.topologyGraphHash
    && graph.semanticHash !== topology.topologyGraphHash) {
    throw new Error('TopologyEditTableProjection: topology graph hash differs from canonical authority.');
  }
}

function edgeRow(record, context) {
  const entity = context.entities.get(record.componentKey) ?? null;
  const type = normalizedType(record.entityType ?? entity?.entityType ?? 'COMPONENT');
  const bindings = edgeBindings(record, context);
  const from = context.nodes.get(record.fromNodeId) ?? null;
  const to = context.nodes.get(record.toNodeId) ?? null;
  const custody = buildTopologyEditTableCustody({ dataset: context.dataset, entity, canonicalRecord: record });
  const packed = edgeFields(record, entity, type, from, to, bindings, custody);
  return rowRecord({
    canonicalKind: 'EDGE', canonicalId: record.id, type, entity, record,
    nodeIds: [record.fromNodeId, record.toNodeId], portBindings: bindings,
    fields: packed.fields, fieldAuthority: packed.authority, custody,
  });
}

function junctionRow(record, context) {
  const entity = context.entities.get(record.componentKey) ?? null;
  const type = normalizedType(record.entityType ?? entity?.entityType ?? 'JUNCTION');
  const bindings = junctionBindings(record, context);
  const custody = buildTopologyEditTableCustody({ dataset: context.dataset, entity, canonicalRecord: record });
  const packed = commonFields(record, entity, type, custody);
  addSourceField(packed, 'runDnMm', entity?.nominalDiameterMm, entity, ['RUN_DN', 'RUN_DIAMETER']);
  addSourceField(packed, 'branchDnMm', record.branchDiameterMm, entity, ['BRANCH_DN', 'BRANCH_DIAMETER']);
  addSourceField(packed, 'branchAngleDeg', record.branchAngleDeg, entity, ['BRANCH_ANGLE', 'ANGLE']);
  return rowRecord({
    canonicalKind: 'JUNCTION', canonicalId: record.id, type, entity, record,
    nodeIds: [...(record.nodeIds ?? (record.nodeId ? [record.nodeId] : []))],
    portBindings: bindings, fields: packed.fields, fieldAuthority: packed.authority, custody,
  });
}

function supportRow(record, context) {
  const entity = context.entities.get(record.entityId) ?? null;
  const custody = buildTopologyEditTableCustody({ dataset: context.dataset, entity, canonicalRecord: record });
  const packed = commonFields(record, entity, 'SUPPORT', custody);
  add(packed, 'hostEntityId', record.hostEntityId ?? null, 'CANONICAL');
  addSourceField(packed, 'stationMm', record.stationMm, entity, ['STATION_MM', 'STATION']);
  addSourceField(packed, 'supportType', record.restraint?.type, entity, ['SUPPORT_TYPE', 'RESTRAINT_TYPE']);
  add(packed, 'direction', record.restraint?.direction ?? record.restraint?.vector ?? null, 'CANONICAL');
  addSourceField(packed, 'gapMm', record.restraint?.gapMm, entity, ['GAP_MM', 'GAP']);
  addSourceField(packed, 'travelMm', record.restraint?.travelMm, entity, ['TRAVEL_MM', 'TRAVEL']);
  return rowRecord({
    canonicalKind: 'SUPPORT', canonicalId: record.id, type: 'SUPPORT', entity, record,
    nodeIds: record.nodeId ? [record.nodeId] : [], portBindings: [],
    fields: packed.fields, fieldAuthority: packed.authority, custody,
  });
}

function rowRecord(input) {
  const identity = {
    canonicalKind: input.canonicalKind,
    canonicalId: input.canonicalId,
    componentKey: input.record.componentKey ?? null,
    entityId: input.record.entityId ?? input.entity?.entityId ?? null,
    sourceEntityId: input.entity?.sourceEntityId ?? null,
    nodeIds: [...input.nodeIds].filter(Boolean).sort(),
    portBindings: [...input.portBindings].sort(compareBindings),
  };
  const rowId = `table:${input.canonicalKind.toLowerCase()}:${semanticHash(identity).split(':').at(-1).slice(0, 20)}`;
  return deepFreeze({
    schema: TOPOLOGY_EDIT_TABLE_ROW_SCHEMA,
    rowId,
    identity: deepFreeze(identity),
    elementType: input.type,
    columnKeys: topologyEditTableColumnKeysFor(input.type),
    fields: deepFreeze(input.fields),
    fieldAuthority: deepFreeze(input.fieldAuthority),
    custody: input.custody,
    targetRevision: semanticHash({ kind: input.canonicalKind, record: input.record }),
  });
}

function edgeFields(record, entity, type, from, to, bindings, custody) {
  const packed = commonFields(record, entity, type, custody);
  const canonicalNominal = record.nominalSizeMm ?? record.diameterMm ?? null;
  const observedNominal = entity?.nominalDiameterMm ?? sourceValue(entity, ['DN_IN', 'NOMINAL_DIAMETER']);
  const nominal = canonicalNominal ?? observedNominal ?? null;
  const nominalAuthority = canonicalNominal != null ? 'CANONICAL'
    : observedNominal != null ? 'SOURCE_OBSERVED' : 'UNRESOLVED';
  const observedSecondary = sourceValue(entity, ['DN_OUT', 'SECONDARY_DN', 'LBORE', 'ABORE']);
  const secondary = record.secondaryNominalSizeMm ?? observedSecondary
    ?? (type === 'REDUCER' ? null : nominal);
  const secondaryAuthority = record.secondaryNominalSizeMm != null ? 'CANONICAL'
    : observedSecondary != null ? 'SOURCE_OBSERVED'
      : type === 'REDUCER' ? 'UNRESOLVED' : nominalAuthority;
  const reverse = record.insertionDirection === 'TO_FROM';
  add(packed, 'dnInMm', reverse ? secondary : nominal, reverse ? secondaryAuthority : nominalAuthority);
  add(packed, 'dnOutMm', reverse ? nominal : secondary, reverse ? nominalAuthority : secondaryAuthority);
  add(packed, 'connectFrom', bindingLabel(bindings.find((row) => row.endpoint === 'FROM')), 'DERIVED_DISPLAY');
  add(packed, 'connectTo', bindingLabel(bindings.find((row) => row.endpoint === 'TO')), 'DERIVED_DISPLAY');
  addSourceField(packed, 'schedule', record.schedule, entity, ['SCHEDULE', 'SCH']);
  addSourceField(packed, 'material', record.materialSpecification, entity, ['MATERIAL', 'MATERIAL_SPECIFICATION']);
  addSourceField(packed, 'pipingClass', record.pipingClass ?? entity?.pipingClass, entity, ['PIPING_CLASS']);
  addSourceField(packed, 'pressureClass', record.pressureClass, entity, ['PRESSURE_CLASS', 'RATING']);
  add(packed, 'lengthMm', distance(from?.position, to?.position), 'DERIVED_DISPLAY');
  add(packed, 'slopePercent', slopePercent(from?.position, to?.position), 'DERIVED_DISPLAY');
  addSourceField(packed, 'angleDeg', record.angleDeg, entity, ['ANGLE_DEG', 'ANGLE']);
  addSourceField(packed, 'radiusMm', record.radiusMm, entity, ['RADIUS_MM', 'RADIUS']);
  addSourceField(packed, 'turnIntent', record.turnIntent, entity, ['TURN_INTENT']);
  addSourceField(packed, 'flangeType', record.flangeType, entity, ['FLANGE_TYPE']);
  addSourceField(packed, 'flangeFacing', record.flangeFacing, entity, ['FLANGE_FACING', 'FACING']);
  addSourceField(packed, 'rating', record.flangeClass ?? record.pressureClass, entity, ['FLANGE_CLASS', 'RATING']);
  addSourceField(packed, 'valveType', record.valveType, entity, ['VALVE_TYPE']);
  addSourceField(packed, 'endConnectionFrom', record.endConnectionFrom, entity, ['END_CONNECTION_FROM']);
  addSourceField(packed, 'endConnectionTo', record.endConnectionTo, entity, ['END_CONNECTION_TO']);
  addSourceField(packed, 'operator', record.operator, entity, ['OPERATOR', 'OPERATOR_TYPE']);
  addSourceField(packed, 'flowDirection', record.flowDirection, entity, ['FLOW_DIRECTION']);
  addSourceField(packed, 'componentLengthMm', record.componentLengthMm ?? record.valveFaceToFaceMm, entity, ['FACE_TO_FACE_MM', 'COMPONENT_LENGTH_MM']);
  addSourceField(packed, 'reducerType', record.reducerType, entity, ['REDUCER_TYPE']);
  addSourceField(packed, 'reducerOrientation', record.reducerOrientation, entity, ['REDUCER_ORIENTATION', 'ORIENTATION']);
  return packed;
}

function commonFields(record, entity, type, custody) {
  const packed = { fields: {}, authority: {} };
  add(packed, 'tag', stringValue(entity?.name ?? entity?.componentReference ?? record.componentKey ?? record.entityId ?? record.id) || null, entity ? 'SOURCE_OBSERVED' : 'CANONICAL');
  add(packed, 'elementType', type, 'CANONICAL');
  add(packed, 'line', stringValue(entity?.lineNumber ?? entity?.lineId) || null, 'SOURCE_OBSERVED');
  add(packed, 'catalogueAuthority', custody.catalogueAuthority, custody.catalogue ? 'EXACT_CATALOGUE' : 'UNRESOLVED');
  add(packed, 'sourceStatus', custody.sourceStatus, 'SOURCE_CUSTODY');
  return packed;
}

function addSourceField(packed, key, canonicalValue, entity, sourceKeys) {
  if (canonicalValue !== undefined && canonicalValue !== null && canonicalValue !== '') {
    add(packed, key, canonicalValue, 'CANONICAL'); return;
  }
  const observed = sourceValue(entity, sourceKeys);
  add(packed, key, observed, observed == null ? 'UNRESOLVED' : 'SOURCE_OBSERVED');
}
function add(packed, key, value, authority) {
  packed.fields[key] = value ?? null;
  packed.authority[key] = authority;
}

function edgeBindings(record, context) {
  const native = Array.isArray(record.nativePortKeys) ? record.nativePortKeys : [];
  return [
    bindingFor(record, context, record.fromNodeId, 'FROM', 'start', native[0]),
    bindingFor(record, context, record.toNodeId, 'TO', 'end', native[1]),
  ];
}
function junctionBindings(record, context) {
  return (record.nodeIds ?? (record.nodeId ? [record.nodeId] : [])).flatMap((nodeId) => {
    const node = context.nodes.get(nodeId);
    return exactComponentPorts(node, record.componentKey, context.graphPorts).map((port) => ({
      endpoint: 'MULTIPORT', nodeId, portKey: port.portKey, portRole: port.role ?? null,
    }));
  });
}
function bindingFor(record, context, nodeId, endpoint, expectedRole, nativePortKey) {
  if (nativePortKey) return { endpoint, nodeId, portKey: nativePortKey, portRole: expectedRole };
  const node = context.nodes.get(nodeId);
  const candidates = exactComponentPorts(node, record.componentKey, context.graphPorts)
    .filter((port) => !port.role || port.role === expectedRole);
  const exact = candidates.length === 1 ? candidates[0] : null;
  return { endpoint, nodeId, portKey: exact?.portKey ?? null, portRole: exact?.role ?? null };
}
function exactComponentPorts(node, componentKey, graphPorts) {
  if (!node || !componentKey || !graphPorts.size) return [];
  return (node.portKeys ?? []).map((key) => graphPorts.get(key)).filter((port) => (
    port?.componentKey === componentKey
  )).sort((a, b) => a.portKey.localeCompare(b.portKey));
}

function sourceValue(entity, keys) {
  if (!entity) return null;
  const bags = [entity, entity.properties?.nativeParams, entity.properties?.attributes,
    entity.properties?.enrichedAttributes, entity.properties?.sourceAttributes];
  for (const bag of bags) for (const key of keys) {
    if (!bag || typeof bag !== 'object') continue;
    for (const candidate of [key, key.toUpperCase(), key.toLowerCase()]) {
      if (bag[candidate] !== undefined && bag[candidate] !== null && bag[candidate] !== '') return bag[candidate];
    }
  }
  return null;
}
function normalizedType(value) {
  const token = stringValue(value).toUpperCase();
  return ({ FLAN: 'FLANGE', VALV: 'VALVE', REDU: 'REDUCER', BEND: 'ELBOW' })[token] || token || 'COMPONENT';
}
function bindingLabel(binding) {
  if (!binding) return null;
  if (binding.portKey) return `${binding.portKey}${binding.portRole ? ` [${binding.portRole}]` : ''}`;
  return binding.nodeId ? `node:${binding.nodeId}` : null;
}
function distance(a, b) {
  if (!point(a) || !point(b)) return null;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
function slopePercent(a, b) {
  if (!point(a) || !point(b)) return null;
  const horizontal = Math.hypot(b.x - a.x, b.y - a.y);
  if (horizontal <= 1e-12) return Math.abs(b.z - a.z) <= 1e-12 ? 0 : null;
  return ((b.z - a.z) / horizontal) * 100;
}
function point(value) { return value && [value.x, value.y, value.z].every(Number.isFinite); }
function compareRows(a, b) { return a.identity.canonicalKind.localeCompare(b.identity.canonicalKind) || a.identity.canonicalId.localeCompare(b.identity.canonicalId); }
function compareBindings(a, b) { return a.nodeId.localeCompare(b.nodeId) || String(a.portKey ?? '').localeCompare(String(b.portKey ?? '')); }
