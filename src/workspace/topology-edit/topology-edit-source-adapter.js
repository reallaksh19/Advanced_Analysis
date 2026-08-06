/**
 * Topology Edit Draft — Entities <-> Canonical Topology Translation Layer
 *
 * The rest of the app models a dataset as a flat, per-component entity list
 * (src/workspace/dataset-adapter.js). The ported Edit Draft engine (and its
 * source feature) models the same data as a node/edge route graph
 * (CanonicalTopology.v1: nodes/edges/junctions/supports). Nothing in the
 * ported package ever built that translation — this module is it.
 *
 * Node identity and connectivity are NOT re-derived here: they are read from
 * the app's existing piping-topology port/connection graph
 * (core/piping-topology/topology-graph.js, already tolerance-aware and already
 * wired via TopologyStore), and support/restraint classification is read from
 * the existing support-restraints models (SupportRestraintStore), so this
 * module stays a pure reshape, not a second implementation of connectivity
 * inference or restraint-family classification.
 */

import { deepFreeze, semanticHash, stringValue } from '../../core/shared-piping-model/index.js';
import {
  NATIVE_PIPE_WRITEBACK_SCHEMA,
  recoverNativePipeCanonicalRecords,
} from './topology-edit-native-pipe-writeback.js';

export const TOPOLOGY_EDIT_CANONICAL_SCHEMA = 'topology-edit-canonical-topology/v1';

/**
 * Builds a CanonicalTopology.v1-shaped draft from the live workspace dataset.
 *
 * @param {object} dataset WorkspaceState.getSnapshot().dataset
 * @param {object} topologyGraph TopologyStore.getGraph() (PipingPortTopologyGraph)
 * @param {object|null} attachmentModel SupportRestraintStore.getAttachmentModel()
 * @param {object|null} restraintModel SupportRestraintStore.getRestraintModel()
 */
export function buildCanonicalTopologyFromWorkspaceDataset(dataset, topologyGraph, attachmentModel = null, restraintModel = null) {
  if (!dataset?.entities) throw new TypeError('buildCanonicalTopologyFromWorkspaceDataset requires a workspace dataset.');
  if (!topologyGraph?.ports || !topologyGraph?.components) throw new TypeError('buildCanonicalTopologyFromWorkspaceDataset requires a piping topology graph.');

  const entitiesById = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
  const nativeNodesById = nativeNodeRecords(dataset);
  const nodeGroups = groupPortsIntoNodes(topologyGraph);
  const portToNode = new Map();
  const nodes = nodeGroups.map((group) => {
    const nodeId = group.explicitNodeId || deriveNodeId(dataset.datasetId, group.portKeys);
    group.portKeys.forEach((portKey) => portToNode.set(portKey, nodeId));
    const native = nativeNodesById.get(nodeId);
    if (native) {
      if (semanticHash(native.position) !== semanticHash(group.position)) {
        throw new Error(`Native node ${nodeId} position differs from topology projection.`);
      }
      return freezeNode({
        ...native,
        position: group.position,
        portKeys: [...group.portKeys].sort(),
      });
    }
    return freezeNode({ id: nodeId, position: group.position, portKeys: [...group.portKeys].sort() });
  }).sort((left, right) => left.id.localeCompare(right.id));

  const { edges, junctions } = buildEdgesAndJunctions(topologyGraph, entitiesById, portToNode);
  const supports = buildSupports(dataset, topologyGraph, portToNode, attachmentModel, restraintModel);
  const crosswalk = buildCrosswalk(nodes, edges, junctions, supports);
  const canonicalDatasetVersion = Number(
    dataset.nativeAuthoring?.canonicalDatasetVersion ?? dataset.version ?? 0,
  );
  const topologyGraphHash = dataset.nativeAuthoring?.topologyGraphAuthorityHash
    ?? topologyGraph.semanticHash;

  const base = {
    schema: TOPOLOGY_EDIT_CANONICAL_SCHEMA,
    datasetId: dataset.datasetId,
    datasetVersion: canonicalDatasetVersion,
    sourceHash: dataset.sourceSnapshot?.sourceSemanticHash || null,
    topologyGraphHash,
    nodes,
    edges,
    junctions,
    supports,
    // Not modeled anywhere in this app's dataset today. Left explicitly empty
    // rather than fabricated; downstream consumers must treat these as
    // "not yet sourced," not "confirmed absent."
    boundaries: [],
    rigids: [],
  };
  return deepFreeze({ ...base, crosswalk, canonicalTopologyHash: semanticHash(base) });
}

/**
 * Maps an edited canonical topology (post command-journal replay) back onto
 * the workspace entity array, in the same entity shape
 * sequential-sketcher/sequential-command-gateway.js already produces for
 * MOVE/SPLIT/ADD/DELETE-equivalent edits, so downstream consumers (tree,
 * properties panel, checker, load calc) see entities in the shape they
 * already expect.
 *
 * @param {object} dataset WorkspaceState.getSnapshot().dataset
 * @param {object} baseCanonicalTopology the draft's starting canonical topology
 * @param {object} editedCanonicalTopology the draft's current (edited) canonical topology
 * @param {string} editSessionId stable id for this edit session, used for audit tagging
 */
export function applyCanonicalTopologyToWorkspaceEntities(dataset, baseCanonicalTopology, editedCanonicalTopology, editSessionId) {
  if (!dataset?.entities) throw new TypeError('applyCanonicalTopologyToWorkspaceEntities requires a workspace dataset.');
  if (!editedCanonicalTopology?.nodes) throw new TypeError('applyCanonicalTopologyToWorkspaceEntities requires an edited canonical topology.');

  const entitiesById = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
  const nodePositionById = new Map(editedCanonicalTopology.nodes.map((node) => [node.id, node.position]));
  const baseEdgesById = new Map((baseCanonicalTopology?.edges || []).map((edge) => [edge.id, edge]));

  const touchedEntityIds = new Set();
  const result = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));

  // Edges present after editing: either an unchanged/moved original edge
  // (has a componentKey we recognize) or a brand-new edge synthesized by a
  // command such as ADD_STRAIGHT_ELEMENT / BRIDGE_GAP / SPLIT_EDGE.
  editedCanonicalTopology.edges.forEach((edge) => {
    const start = nodePositionById.get(edge.fromNodeId);
    const end = nodePositionById.get(edge.toNodeId);
    if (!start || !end) return; // Dangling reference; do not fabricate geometry.
    const existing = edge.componentKey ? entitiesById.get(edge.componentKey) : null;
    if (existing) {
      result.set(existing.entityId, editGeometryEntity(existing, existing.entityId, start, end, editSessionId));
      touchedEntityIds.add(existing.entityId);
    } else {
      const entityId = deriveEditEntityId(dataset, editSessionId, edge.id);
      result.set(entityId, synthesizePipeEntity(entityId, start, end, edge, editSessionId));
      touchedEntityIds.add(entityId);
    }
  });

  // Edges that existed before the edit but have no surviving counterpart
  // (DELETE_EDGE, or absorbed by MERGE_NODES/SPLIT_EDGE) are removed.
  const survivingComponentKeys = new Set(editedCanonicalTopology.edges.map((edge) => edge.componentKey).filter(Boolean));
  baseEdgesById.forEach((edge) => {
    if (edge.componentKey && !survivingComponentKeys.has(edge.componentKey) && !touchedEntityIds.has(edge.componentKey)) {
      result.delete(edge.componentKey);
    }
  });

  // Junctions follow their resolved node's position (component center only;
  // junction entities are never created/deleted by the 7 native commands).
  editedCanonicalTopology.junctions.forEach((junction) => {
    const entity = junction.componentKey ? entitiesById.get(junction.componentKey) : null;
    if (!entity) return;
    const positions = junction.nodeIds.map((nodeId) => nodePositionById.get(nodeId)).filter(Boolean);
    if (!positions.length) return;
    const center = averagePoint(positions);
    result.set(entity.entityId, patchGeometryCenter(entity, center, editSessionId));
  });

  // Supports translate with their resolved node.
  editedCanonicalTopology.supports.forEach((support) => {
    const entity = support.entityId ? entitiesById.get(support.entityId) : null;
    if (!entity || !support.nodeId) return;
    const newPosition = nodePositionById.get(support.nodeId);
    if (!newPosition) return;
    result.set(entity.entityId, patchGeometryCenter(entity, newPosition, editSessionId));
  });

  return [...result.values()];
}

// ---- node grouping -------------------------------------------------------

function groupPortsIntoNodes(topologyGraph) {
  const parent = new Map(topologyGraph.ports.map((port) => [port.portKey, port.portKey]));
  const find = (key) => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = key;
    while (current !== root) { const next = parent.get(current); parent.set(current, root); current = next; }
    return root;
  };
  const union = (left, right) => {
    const rootLeft = find(left); const rootRight = find(right);
    if (rootLeft !== rootRight) parent.set(rootLeft, rootRight);
  };
  topologyGraph.connections.forEach((connection) => union(connection.portAKey, connection.portBKey));

  const groups = new Map();
  const portsByKey = new Map(topologyGraph.ports.map((port) => [port.portKey, port]));
  topologyGraph.ports.forEach((port) => {
    const root = find(port.portKey);
    const bucket = groups.get(root) || [];
    bucket.push(port.portKey);
    groups.set(root, bucket);
  });

  return [...groups.values()].map((portKeys) => {
    const explicitNodeIds = [...new Set(portKeys.map((portKey) => (
      stringValue(portsByKey.get(portKey)?.sourceEndpointIdentity)
    )).filter(Boolean))];
    if (explicitNodeIds.length > 1) {
      throw new Error(`Connected native ports disagree on node identity: ${explicitNodeIds.sort().join(', ')}.`);
    }
    return {
      portKeys,
      explicitNodeId: explicitNodeIds[0] || null,
      position: portsByKey.get(portKeys[0])?.position || null,
    };
  }).filter((group) => group.position);
}

function deriveNodeId(datasetId, portKeys) {
  return `node:${semanticHash({ datasetId, portKeys: [...portKeys].sort() }).slice(0, 20)}`;
}

function nativeNodeRecords(dataset) {
  const result = new Map();
  for (const entity of dataset.entities ?? []) {
    if (entity.properties?.nativeParams?.schema !== NATIVE_PIPE_WRITEBACK_SCHEMA) continue;
    const recovered = recoverNativePipeCanonicalRecords(entity);
    for (const node of recovered.nodes) {
      const existing = result.get(node.id);
      if (existing && semanticHash(existing) !== semanticHash(node)) {
        throw new Error(`Native node ${node.id} has conflicting writeback records.`);
      }
      result.set(node.id, node);
    }
  }
  return result;
}

// ---- edges / junctions ----------------------------------------------------

function buildEdgesAndJunctions(topologyGraph, entitiesById, portToNode) {
  const edges = [];
  const junctions = [];
  const portsByComponent = new Map();
  topologyGraph.ports.forEach((port) => {
    const bucket = portsByComponent.get(port.componentKey) || [];
    bucket.push(port);
    portsByComponent.set(port.componentKey, bucket);
  });

  topologyGraph.components.forEach((component) => {
    const entity = entitiesById.get(component.componentKey);
    if (!entity || entity.category === 'support') return;
    const ports = portsByComponent.get(component.componentKey) || [];
    const nodeIds = ports.map((port) => portToNode.get(port.portKey)).filter(Boolean);
    const uniqueNodeIds = [...new Set(nodeIds)];
    // 2-port components (the common pipe case) preserve start->end
    // directionality by port role, not array/sort order — 'start' and 'end'
    // portKeys otherwise sort alphabetically as 'end' < 'start', which would
    // silently swap geometry.start/end when writing edits back.
    const startPort = ports.find((port) => port.role === 'start');
    const endPort = ports.find((port) => port.role === 'end');
    if (ports.length === 2 && startPort && endPort && uniqueNodeIds.length === 2) {
      edges.push(buildCanonicalEdge(
        component,
        entity,
        portToNode.get(startPort.portKey),
        portToNode.get(endPort.portKey),
      ));
    } else if (ports.length === 2 && uniqueNodeIds.length === 2) {
      edges.push(buildCanonicalEdge(component, entity, nodeIds[0], nodeIds[1]));
    } else if (uniqueNodeIds.length >= 2) {
      junctions.push(freezeJunction({
        id: deriveCanonicalId('junction', component.componentKey),
        componentKey: component.componentKey,
        nodeIds: uniqueNodeIds,
        entityType: normalizeTopologyEditEntityType(entity.entityType),
      }));
    }
    // Components resolving to fewer than 2 nodes (open/unconnected ports)
    // are left un-modeled as edges/junctions; they remain visible via the
    // dataset itself but are not part of the editable route graph yet.
  });
  return {
    edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
    junctions: junctions.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function buildCanonicalEdge(component, entity, fromNodeId, toNodeId) {
  if (entity.properties?.nativeParams?.schema === NATIVE_PIPE_WRITEBACK_SCHEMA) {
    const recovered = recoverNativePipeCanonicalRecords(entity).edge;
    if (recovered.componentKey !== component.componentKey
      || recovered.fromNodeId !== fromNodeId
      || recovered.toNodeId !== toNodeId) {
      throw new Error(`Native pipe ${component.componentKey} topology identity differs from writeback.`);
    }
    return freezeEdge(recovered);
  }
  const outsideDiameterMm = resolveOutsideDiameterMm(entity);
  return freezeEdge({
    id: deriveCanonicalId('edge', component.componentKey),
    componentKey: component.componentKey,
    fromNodeId,
    toNodeId,
    diameterMm: resolveDiameterMm(entity),
    outsideDiameterMm,
    diameterAuthority: outsideDiameterMm === null ? 'UNRESOLVED' : 'OUTSIDE_DIAMETER',
    entityType: normalizeTopologyEditEntityType(entity.entityType),
    sourcePath: entity.sourcePath,
  });
}

function resolveDiameterMm(entity) {
  return Number.isFinite(entity.nominalDiameterMm) ? entity.nominalDiameterMm : null;
}

function resolveOutsideDiameterMm(entity) {
  return Number.isFinite(entity.outsideDiameterMm) && entity.outsideDiameterMm > 0
    ? entity.outsideDiameterMm
    : null;
}

function normalizeTopologyEditEntityType(value) {
  const token = stringValue(value).toUpperCase();
  return ({
    FLAN: 'FLANGE',
    VALV: 'VALVE',
    REDU: 'REDUCER',
    GASK: 'GASKET',
    INST: 'INSTRUMENT',
  })[token] || token;
}

function deriveCanonicalId(kind, sourceIdentity) {
  const identity = stringValue(sourceIdentity);
  if (identity && !/\s/u.test(identity)) return `${kind}:${identity}`;
  return `${kind}:hash-${semanticHash({ kind, sourceIdentity: identity }).slice(0, 24)}`;
}

// ---- supports ---------------------------------------------------------

function buildSupports(dataset, topologyGraph, portToNode, attachmentModel, restraintModel) {
  const componentsByKey = new Map(topologyGraph.components.map((component) => [component.componentKey, component]));
  const attachmentsBySupportKey = new Map((attachmentModel?.attachments || []).map((row) => [row.supportKey, row]));
  const restraintsBySupportKey = new Map((restraintModel?.restraints || []).map((row) => [row.supportKey, row]));

  return dataset.entities
    .filter((entity) => entity.category === 'support')
    .map((entity) => {
      const attachment = attachmentsBySupportKey.get(entity.entityId);
      const nodeId = resolveSupportNodeId(attachment, componentsByKey, portToNode);
      return freezeSupport({
        id: deriveCanonicalId('support', entity.entityId),
        entityId: entity.entityId,
        nodeId,
        hostEntityId: attachment?.attachedComponentKey || null,
        resolved: Boolean(nodeId),
        attachmentEvidenceType: attachment?.evidenceType || null,
        restraint: restraintsBySupportKey.get(entity.entityId) || null,
      });
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolveSupportNodeId(attachment, componentsByKey, portToNode) {
  if (!attachment) return null;
  if (attachment.attachedPortKey) return portToNode.get(attachment.attachedPortKey) || null;
  const component = attachment.attachedComponentKey ? componentsByKey.get(attachment.attachedComponentKey) : null;
  if (!component) return null;
  // Geometric (mid-span) attachments do not resolve to a discrete port.
  // Approximate with the nearest of the target component's own nodes so the
  // support is still editable/visible, rather than leaving it unattached.
  const candidateNodeIds = (component.portKeys || []).map((portKey) => portToNode.get(portKey)).filter(Boolean);
  return candidateNodeIds[0] || null;
}

// ---- crosswalk ---------------------------------------------------------

function buildCrosswalk(nodes, edges, junctions, supports) {
  return deepFreeze({
    nodeIdToPortKeys: Object.fromEntries(nodes.map((node) => [node.id, node.portKeys])),
    edgeIdToComponentKey: Object.fromEntries(edges.map((edge) => [edge.id, edge.componentKey])),
    junctionIdToComponentKey: Object.fromEntries(junctions.map((junction) => [junction.id, junction.componentKey])),
    supportIdToEntityId: Object.fromEntries(supports.map((support) => [support.id, support.entityId])),
  });
}

// ---- entity synthesis / patching (mirrors sequential-command-gateway.js) -

function editGeometryEntity(entity, entityId, start, end, editSessionId) {
  return freezeEntity({
    ...entity,
    properties: {
      ...entity.properties,
      geometry: { ...entity.properties?.geometry, start, end, center: midpoint(start, end) },
      attributes: { ...entity.properties?.attributes, EDIT_COMMAND_ID: entityId, TOPOLOGY_EDIT_SESSION_ID: editSessionId },
    },
  });
}

function patchGeometryCenter(entity, center, editSessionId) {
  return freezeEntity({
    ...entity,
    properties: {
      ...entity.properties,
      geometry: { ...entity.properties?.geometry, center, start: center, end: center },
      attributes: { ...entity.properties?.attributes, TOPOLOGY_EDIT_SESSION_ID: editSessionId },
    },
  });
}

function synthesizePipeEntity(entityId, start, end, edge, editSessionId) {
  return freezeEntity({
    entityId,
    sourceEntityId: entityId,
    name: `PIPE ${entityId}`,
    entityType: 'PIPE',
    selectionType: 'component',
    category: 'pipe',
    componentReference: entityId,
    nominalDiameterMm: Number.isFinite(edge.diameterMm) ? edge.diameterMm : null,
    outsideDiameterMm: Number.isFinite(edge.outsideDiameterMm) ? edge.outsideDiameterMm : null,
    properties: {
      identity: { entityId, sourceEntityId: entityId, name: `PIPE ${entityId}`, entityType: 'PIPE' },
      geometry: { start, end, center: midpoint(start, end) },
      sourceAttributes: {},
      attributes: { TYPE: 'PIPE', EDIT_COMMAND_ID: entityId, TOPOLOGY_EDIT_SESSION_ID: editSessionId },
      enrichedAttributes: {},
      nativeParams: {},
      diagnostics: [],
    },
  });
}

function deriveEditEntityId(dataset, editSessionId, edgeId) {
  return `edit:${semanticHash({ datasetId: dataset.datasetId, version: dataset.version || 0, editSessionId, edgeId }).slice(0, 20)}`;
}

function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }; }
function averagePoint(points) {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z }), { x: 0, y: 0, z: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

function freezeNode(value) { return deepFreeze(value); }
function freezeEdge(value) { return deepFreeze(value); }
function freezeJunction(value) { return deepFreeze(value); }
function freezeSupport(value) { return deepFreeze(value); }
function freezeEntity(value) { return deepFreeze(value); }

export function validateCanonicalTopologyDraft(draft) {
  const errors = [];
  if (!draft || draft.schema !== TOPOLOGY_EDIT_CANONICAL_SCHEMA) errors.push('Invalid canonical topology draft schema.');
  if (!stringValue(draft?.datasetId)) errors.push('Canonical topology draft datasetId is required.');
  if (!Array.isArray(draft?.nodes) || !Array.isArray(draft?.edges)) errors.push('Canonical topology draft nodes/edges must be arrays.');
  const nodeIds = new Set((draft?.nodes || []).map((node) => node.id));
  (draft?.edges || []).forEach((edge) => {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) errors.push(`Edge ${edge.id} references an unknown node.`);
  });
  return deepFreeze({ ok: errors.length === 0, errors });
}
