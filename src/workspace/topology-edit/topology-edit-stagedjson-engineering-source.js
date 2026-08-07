import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

const STAGED_JSON_SCHEMAS = new Set([
  'rvm-converter-stage/v1',
  'json-viewer-selection/v1',
  'inputxml-managed-stage/v1',
]);
const RELATION_SCHEMA = 'TopologyEditJunctionBranchRelation.v1';

export function enrichTopologyEditStagedJsonEngineering({
  dataset, topologyGraph, nodes, edges, junctions,
} = {}) {
  if (!STAGED_JSON_SCHEMAS.has(dataset?.sourceSchema)) {
    return deepFreeze({ edges: [...(edges ?? [])], junctions: [...(junctions ?? [])] });
  }
  const entities = new Map((dataset.entities ?? []).map((row) => [row.entityId, row]));
  const enrichedEdges = (edges ?? []).map((edge) => enrichEdge(edge, entities.get(edge.componentKey)));
  const edgeIndex = new Map(enrichedEdges.map((row) => [row.id, row]));
  const nodeIndex = new Map((nodes ?? []).map((row) => [row.id, row]));
  const portIndex = new Map((topologyGraph?.ports ?? []).map((row) => [row.portKey, row]));
  const enrichedJunctions = (junctions ?? []).map((junction) => enrichJunction(
    junction,
    entities.get(junction.componentKey),
    { edgeIndex, nodeIndex, portIndex },
  ));
  return deepFreeze({ edges: enrichedEdges, junctions: enrichedJunctions });
}

function enrichEdge(edge, entity) {
  const type = token(edge.entityType);
  if (!entity || !['VALVE', 'REDUCER'].includes(type)) return edge;
  const binding = exactCatalogueBinding(entity, type);
  const additions = binding ? {
    catalogueBinding: binding,
    catalogueRecordId: binding.recordId,
    catalogueRecordHash: binding.recordHash,
    catalogueHash: binding.catalogueHash,
    catalogueSourceHash: binding.sourceHash,
  } : {};
  if (type === 'REDUCER') {
    return deepFreeze({
      ...edge,
      secondaryNominalSizeMm: positiveMaybe(sourceValue(entity, ['DN_OUT', 'SECONDARY_DN']))
        ?? edge.secondaryNominalSizeMm ?? null,
      reducerType: textMaybe(sourceValue(entity, ['REDUCER_TYPE'])),
      reducerOrientation: textMaybe(sourceValue(entity, ['REDUCER_ORIENTATION', 'ORIENTATION'])),
      ...additions,
    });
  }
  const faceToFaceMm = positiveMaybe(sourceValue(entity, ['FACE_TO_FACE_MM', 'COMPONENT_LENGTH_MM']));
  return deepFreeze({
    ...edge,
    componentLengthMm: faceToFaceMm ?? edge.componentLengthMm ?? null,
    valveFaceToFaceMm: faceToFaceMm ?? edge.valveFaceToFaceMm ?? null,
    componentMassKg: positiveMaybe(sourceValue(entity, ['COMPONENT_WEIGHT_KG', 'COMPONENT_MASS_KG'])),
    materialSpecification: textMaybe(sourceValue(entity, ['MATERIAL_SPECIFICATION', 'MATERIAL'])),
    pressureClass: textMaybe(sourceValue(entity, ['PRESSURE_CLASS', 'RATING'])),
    pipingClass: textMaybe(sourceValue(entity, ['PIPING_CLASS'])) ?? edge.pipingClass ?? null,
    endConnectionFrom: upperMaybe(sourceValue(entity, ['END_CONNECTION_FROM'])),
    endConnectionTo: upperMaybe(sourceValue(entity, ['END_CONNECTION_TO'])),
    valveType: upperMaybe(sourceValue(entity, ['VALVE_TYPE'])),
    lengthAuthority: textMaybe(sourceValue(entity, ['TOPOLOGY_EDIT_LENGTH_AUTHORITY'])),
    insertionDirection: upperMaybe(sourceValue(entity, ['TOPOLOGY_EDIT_INSERTION_DIRECTION'])),
    ...additions,
  });
}

function enrichJunction(junction, entity, context) {
  if (!entity || token(junction.entityType) !== 'TEE') return junction;
  const runDiameterMm = positiveMaybe(sourceValue(entity, ['RUN_DN', 'RUN_DIAMETER']))
    ?? positiveMaybe(entity.nominalDiameterMm);
  const branchDiameterMm = positiveMaybe(sourceValue(entity, ['BRANCH_DN', 'BRANCH_DIAMETER']));
  const branchAngleDeg = positiveMaybe(sourceValue(entity, ['BRANCH_ANGLE', 'ANGLE']));
  const basic = deepFreeze({
    ...junction,
    ...(runDiameterMm ? { runDiameterMm } : {}),
    ...(branchDiameterMm ? { branchDiameterMm } : {}),
    ...(branchAngleDeg ? { branchAngleDeg } : {}),
  });
  const policy = upperMaybe(sourceValue(entity, ['TOPOLOGY_EDIT_RELATION_POLICY']));
  if (!policy || policy === 'UNDECLARED') return basic;
  if (policy !== 'EXPLICIT_REDUCER') {
    throw new RangeError(`StagedJSON engineering source: unsupported TEE relation policy ${policy}.`);
  }
  const branchPortKey = textMaybe(sourceValue(entity, ['TOPOLOGY_EDIT_BRANCH_PORT_KEY']));
  const reducerRecordId = textMaybe(sourceValue(entity, ['TOPOLOGY_EDIT_REDUCER_RECORD_ID']));
  if (!branchPortKey || !reducerRecordId || !runDiameterMm || !branchDiameterMm) {
    throw new RangeError('StagedJSON engineering source: explicit TEE relation custody is incomplete.');
  }
  const port = context.portIndex.get(branchPortKey);
  if (!port || port.componentKey !== junction.componentKey) {
    throw new RangeError('StagedJSON engineering source: explicit TEE branch port is not bound to the source TEE.');
  }
  const branchNode = [...context.nodeIndex.values()].filter((node) => (
    (node.portKeys ?? []).includes(branchPortKey) && (junction.nodeIds ?? []).includes(node.id)
  ));
  if (branchNode.length !== 1) {
    throw new RangeError('StagedJSON engineering source: explicit TEE branch port does not resolve one canonical node.');
  }
  const branchNodeId = branchNode[0].id;
  const reducers = [...context.edgeIndex.values()].filter((edge) => (
    token(edge.entityType) === 'REDUCER'
    && (edge.fromNodeId === branchNodeId || edge.toNodeId === branchNodeId)
    && edge.catalogueBinding?.recordId === reducerRecordId
  ));
  if (reducers.length !== 1) {
    throw new RangeError(`StagedJSON engineering source: explicit reducer ${reducerRecordId} resolved ${reducers.length} exact connected edges.`);
  }
  const reducer = reducers[0];
  const binding = relationReducerBinding(reducer.catalogueBinding);
  const branchAtFrom = reducer.fromNodeId === branchNodeId;
  const downstreamNominalSizeMm = branchAtFrom
    ? binding.toNominalSizeMm : binding.fromNominalSizeMm;
  const reducerBranchSize = branchAtFrom
    ? binding.fromNominalSizeMm : binding.toNominalSizeMm;
  if (!nearlyEqual(reducerBranchSize, branchDiameterMm)) {
    throw new RangeError('StagedJSON engineering source: reducer branch size differs from declared TEE branch size.');
  }
  const runNodeIds = (junction.nodeIds ?? []).filter((id) => id !== branchNodeId).sort();
  if (runNodeIds.length !== 2) {
    throw new RangeError('StagedJSON engineering source: explicit TEE relation requires exactly two run nodes.');
  }
  const payloadMaterial = {
    schema: RELATION_SCHEMA,
    junctionId: junction.id,
    branchNodeId,
    branchPortKey,
    runNodeIds,
    reducerEdgeId: reducer.id,
    reducerCatalogueBinding: binding,
    runNominalSizeMm: runDiameterMm,
    teeBranchNominalSizeMm: branchDiameterMm,
    downstreamNominalSizeMm,
    relationPolicy: policy,
  };
  const relationHash = semanticHash(payloadMaterial);
  const relation = deepFreeze({
    schema: RELATION_SCHEMA,
    relationPolicy: policy,
    branchNodeId,
    branchPortKey,
    runNodeIds,
    reducerEdgeId: reducer.id,
    reducerRecordId: binding.recordId,
    reducerRecordHash: binding.recordHash,
    reducerCatalogueHash: binding.catalogueHash,
    reducerSourceHash: binding.sourceHash,
    runNominalSizeMm: runDiameterMm,
    teeBranchNominalSizeMm: branchDiameterMm,
    downstreamNominalSizeMm,
    relationHash,
  });
  return deepFreeze({ ...basic, branchNodeId, branchPortKey, runNodeIds, branchRelation: relation });
}

function exactCatalogueBinding(entity, type) {
  const catalogue = entity?.properties?.nativeParams?.catalogue;
  if (!catalogue || typeof catalogue !== 'object' || Array.isArray(catalogue)) return null;
  const common = {
    catalogueHash: textMaybe(catalogue.catalogueHash),
    sourceHash: textMaybe(catalogue.catalogueSourceHash ?? catalogue.sourceHash),
    recordId: textMaybe(catalogue.catalogueRecordId ?? catalogue.recordId),
    recordHash: textMaybe(catalogue.catalogueRecordHash ?? catalogue.recordHash),
    sourceReference: sourceReference(catalogue.catalogueSourceReference ?? catalogue.sourceReference),
  };
  if (!common.catalogueHash || !common.sourceHash || !common.recordId
    || !common.recordHash || !common.sourceReference) return null;
  if (type === 'REDUCER') {
    return deepFreeze({
      ...common,
      componentType: 'REDUCER',
      fromNominalSizeMm: positiveMaybe(catalogue.fromNominalSizeMm)
        ?? positiveMaybe(entity.nominalDiameterMm),
      toNominalSizeMm: positiveMaybe(catalogue.toNominalSizeMm)
        ?? positiveMaybe(sourceValue(entity, ['DN_OUT', 'SECONDARY_DN'])),
    });
  }
  const full = {
    ...common,
    componentType: 'VALVE',
    nominalSizeMm: positiveMaybe(catalogue.nominalSizeMm) ?? positiveMaybe(entity.nominalDiameterMm),
    outsideDiameterMm: positiveMaybe(catalogue.outsideDiameterMm) ?? positiveMaybe(entity.outsideDiameterMm),
    pipingClass: upperMaybe(catalogue.pipingClass ?? sourceValue(entity, ['PIPING_CLASS'])),
    pressureClass: upperMaybe(catalogue.pressureClass ?? sourceValue(entity, ['PRESSURE_CLASS', 'RATING'])),
    materialSpecification: upperMaybe(catalogue.materialSpecification ?? sourceValue(entity, ['MATERIAL_SPECIFICATION', 'MATERIAL'])),
    componentMassKg: positiveMaybe(catalogue.componentMassKg ?? sourceValue(entity, ['COMPONENT_WEIGHT_KG', 'COMPONENT_MASS_KG'])),
    endConnectionFrom: upperMaybe(catalogue.endConnectionFrom ?? sourceValue(entity, ['END_CONNECTION_FROM'])),
    endConnectionTo: upperMaybe(catalogue.endConnectionTo ?? sourceValue(entity, ['END_CONNECTION_TO'])),
    valveType: upperMaybe(catalogue.valveType ?? sourceValue(entity, ['VALVE_TYPE'])),
    valveFaceToFaceMm: positiveMaybe(catalogue.valveFaceToFaceMm ?? sourceValue(entity, ['FACE_TO_FACE_MM', 'COMPONENT_LENGTH_MM'])),
  };
  return Object.values(full).some((value) => value === null) ? deepFreeze(common) : deepFreeze(full);
}

function relationReducerBinding(value) {
  const result = {
    catalogueHash: textMaybe(value?.catalogueHash), sourceHash: textMaybe(value?.sourceHash),
    recordId: textMaybe(value?.recordId), recordHash: textMaybe(value?.recordHash),
    componentType: token(value?.componentType),
    fromNominalSizeMm: positiveMaybe(value?.fromNominalSizeMm),
    toNominalSizeMm: positiveMaybe(value?.toNominalSizeMm),
  };
  if (!result.catalogueHash || !result.sourceHash || !result.recordId || !result.recordHash
    || result.componentType !== 'REDUCER' || !result.fromNominalSizeMm || !result.toNominalSizeMm) {
    throw new RangeError('StagedJSON engineering source: exact reducer catalogue relation custody is incomplete.');
  }
  return deepFreeze(result);
}
function sourceReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const documentId = textMaybe(value.documentId); const revision = textMaybe(value.revision);
  const path = textMaybe(value.path);
  return documentId && revision && path ? deepFreeze({ documentId, revision, path }) : null;
}
function sourceValue(entity, keys) {
  const bags = [entity, entity?.properties?.nativeParams, entity?.properties?.attributes,
    entity?.properties?.enrichedAttributes, entity?.properties?.sourceAttributes];
  for (const bag of bags) for (const key of keys) {
    if (!bag || typeof bag !== 'object') continue;
    for (const candidate of [key, key.toUpperCase(), key.toLowerCase()]) {
      const value = bag[candidate];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return null;
}
function textMaybe(value) { const text = String(value ?? '').trim(); return text || null; }
function upperMaybe(value) { const text = textMaybe(value); return text ? text.toUpperCase() : null; }
function positiveMaybe(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function nearlyEqual(left, right) { return Math.abs(Number(left) - Number(right)) <= 1e-9; }
function token(value) { return String(value ?? '').trim().toUpperCase(); }
