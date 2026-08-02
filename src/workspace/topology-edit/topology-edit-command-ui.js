/** Pure selection and UI-action mapping for governed topology commands. */
import { deepFreeze } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_MOVE_DELTA_MM = 100;
export const TOPOLOGY_EDIT_SPLIT_FRACTION = 0.5;
export const TOPOLOGY_EDIT_EXACT_GAP_MM = deepFreeze({
  'set-gap-3': 3,
  'set-gap-20': 20,
});

export const TOPOLOGY_EDIT_COMMAND_ACTIONS = deepFreeze([
  { id: 'move-positive-z', label: 'Move +Z 100 mm', title: 'Move the selected node exactly +100 mm on canonical Z.' },
  { id: 'set-gap-3', label: 'Set gap 3 mm', title: 'Keep selected node 1 fixed and move open endpoint 2 to an exact 3 mm gap.' },
  { id: 'set-gap-20', label: 'Set gap 20 mm', title: 'Keep selected node 1 fixed and move open endpoint 2 to an exact 20 mm gap.' },
  { id: 'merge-nodes', label: 'Merge nodes', title: 'Merge the first selected node into the second selected node.' },
  { id: 'bridge-gap', label: 'Bridge gap', title: 'Create a bridge edge between two selected nodes; diameter remains unresolved.' },
  { id: 'add-straight', label: 'Add straight', title: 'Create a straight edge between two selected nodes; diameter remains unresolved.' },
  { id: 'split-edge-half', label: 'Split edge 50%', title: 'Split the selected edge at exactly 50% of centerline length.' },
  { id: 'disconnect-from', label: 'Disconnect FROM', title: 'Disconnect the selected edge FROM endpoint.' },
  { id: 'disconnect-to', label: 'Disconnect TO', title: 'Disconnect the selected edge TO endpoint.' },
  { id: 'delete-edge', label: 'Delete edge', title: 'Delete the selected canonical edge.' },
]);

const NODE_ACTIONS = new Set([
  'merge-nodes',
  'bridge-gap',
  'add-straight',
]);
const EDGE_ACTIONS = new Set([
  'split-edge-half',
  'disconnect-from',
  'disconnect-to',
  'delete-edge',
]);

export function createTopologyEditSelection() {
  return deepFreeze({ nodeIds: [], edgeId: null });
}

export function updateTopologyEditSelection(selection, objectId, additive = false) {
  if (String(objectId).startsWith('node:')) {
    return selectNode(selection, objectId, additive);
  }
  if (String(objectId).startsWith('edge:')) {
    return deepFreeze({ nodeIds: [], edgeId: objectId });
  }
  return selection;
}

function selectNode(selection, nodeId, additive) {
  if (!additive) return deepFreeze({ nodeIds: [nodeId], edgeId: null });
  const current = selection.nodeIds ?? [];
  const nodeIds = current.includes(nodeId)
    ? current.filter((id) => id !== nodeId)
    : [...current, nodeId].slice(-2);
  return deepFreeze({ nodeIds, edgeId: null });
}

export function topologyEditSelectionDescription(selection) {
  if (selection.edgeId) return `Selected edge ${selection.edgeId}.`;
  if (selection.nodeIds.length === 2) {
    return `Selected nodes 1=${selection.nodeIds[0]}, 2=${selection.nodeIds[1]}. Node 1 is the anchor for exact-gap moves.`;
  }
  if (selection.nodeIds.length === 1) {
    return `Selected node ${selection.nodeIds[0]}. Shift-click a second node for two-node commands.`;
  }
  return 'No canonical node or edge selected.';
}

export function topologyEditExactGapContext(selection, topology) {
  if (selection?.nodeIds?.length !== 2 || !Array.isArray(topology?.nodes)
      || !Array.isArray(topology?.edges)) return null;
  const [anchorNodeId, movingNodeId] = selection.nodeIds;
  if (anchorNodeId === movingNodeId) return null;
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const anchor = nodes.get(anchorNodeId);
  const moving = nodes.get(movingNodeId);
  const anchorPoint = finitePoint(anchor?.position);
  const movingPoint = finitePoint(moving?.position);
  if (!anchorPoint || !movingPoint) return null;
  const degrees = topologyDegrees(topology.nodes, topology.edges);
  if (degrees.get(anchorNodeId) !== 1 || degrees.get(movingNodeId) !== 1) return null;
  const components = topologyComponents(topology.nodes, topology.edges);
  if (components.get(anchorNodeId) === components.get(movingNodeId)) return null;
  const delta = {
    x: movingPoint.x - anchorPoint.x,
    y: movingPoint.y - anchorPoint.y,
    z: movingPoint.z - anchorPoint.z,
  };
  const currentGapMm = Math.hypot(delta.x, delta.y, delta.z);
  if (!(currentGapMm > 0)) return null;
  return deepFreeze({
    anchorNodeId,
    movingNodeId,
    currentGapMm,
    direction: {
      x: delta.x / currentGapMm,
      y: delta.y / currentGapMm,
      z: delta.z / currentGapMm,
    },
    anchorPosition: anchorPoint,
  });
}

export function canRunTopologyEditAction(actionId, selection, topology = null) {
  if (actionId === 'move-positive-z') return selection.nodeIds.length === 1;
  if (Object.hasOwn(TOPOLOGY_EDIT_EXACT_GAP_MM, actionId)) {
    return topology ? Boolean(topologyEditExactGapContext(selection, topology))
      : selection.nodeIds.length === 2;
  }
  if (NODE_ACTIONS.has(actionId)) return selection.nodeIds.length === 2;
  if (EDGE_ACTIONS.has(actionId)) return Boolean(selection.edgeId);
  return false;
}

export function createTopologyEditCommandIntent(actionId, selection, topology) {
  if (!canRunTopologyEditAction(actionId, selection, topology)) {
    throw new Error(`Topology edit action ${actionId} does not have the required exact selection and topology context.`);
  }
  if (Object.hasOwn(TOPOLOGY_EDIT_EXACT_GAP_MM, actionId)) {
    return exactGapMoveIntent(selection, topology, TOPOLOGY_EDIT_EXACT_GAP_MM[actionId]);
  }
  switch (actionId) {
    case 'move-positive-z': return moveIntent(selection.nodeIds[0], topology);
    case 'merge-nodes': return twoNodeIntent('MERGE_NODES', selection, 'sourceNodeId', 'targetNodeId');
    case 'bridge-gap': return twoNodeIntent('BRIDGE_GAP', selection, 'fromNodeId', 'toNodeId');
    case 'add-straight': return twoNodeIntent('ADD_STRAIGHT_ELEMENT', selection, 'fromNodeId', 'toNodeId');
    case 'split-edge-half': return edgeIntent('SPLIT_EDGE', selection.edgeId, { fraction: TOPOLOGY_EDIT_SPLIT_FRACTION });
    case 'disconnect-from': return edgeIntent('DISCONNECT_ENDPOINT', selection.edgeId, { endpoint: 'FROM' });
    case 'disconnect-to': return edgeIntent('DISCONNECT_ENDPOINT', selection.edgeId, { endpoint: 'TO' });
    case 'delete-edge': return edgeIntent('DELETE_EDGE', selection.edgeId);
    default: throw new RangeError(`Unsupported topology edit action ${actionId}.`);
  }
}

function moveIntent(nodeId, topology) {
  const matches = (topology.nodes ?? []).filter((node) => node.id === nodeId);
  if (matches.length !== 1) {
    throw new Error(`Selected node ${nodeId} no longer resolves exactly once.`);
  }
  const point = matches[0].position;
  return deepFreeze({
    commandType: 'MOVE_NODE',
    payload: {
      nodeId,
      position: {
        x: point.x,
        y: point.y,
        z: point.z + TOPOLOGY_EDIT_MOVE_DELTA_MM,
      },
    },
  });
}

function exactGapMoveIntent(selection, topology, requestedGapMm) {
  const context = topologyEditExactGapContext(selection, topology);
  if (!context) throw new Error('Exact-gap move requires two distinct graph-open endpoints in different components.');
  return deepFreeze({
    commandType: 'MOVE_NODE',
    payload: {
      nodeId: context.movingNodeId,
      position: {
        x: context.anchorPosition.x + context.direction.x * requestedGapMm,
        y: context.anchorPosition.y + context.direction.y * requestedGapMm,
        z: context.anchorPosition.z + context.direction.z * requestedGapMm,
      },
    },
  });
}

function topologyDegrees(nodes, edges) {
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (degrees.has(edge.fromNodeId)) degrees.set(edge.fromNodeId, degrees.get(edge.fromNodeId) + 1);
    if (degrees.has(edge.toNodeId)) degrees.set(edge.toNodeId, degrees.get(edge.toNodeId) + 1);
  }
  return degrees;
}

function topologyComponents(nodes, edges) {
  const neighbors = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!neighbors.has(edge.fromNodeId) || !neighbors.has(edge.toNodeId)) continue;
    neighbors.get(edge.fromNodeId).push(edge.toNodeId);
    neighbors.get(edge.toNodeId).push(edge.fromNodeId);
  }
  const components = new Map();
  let componentId = 0;
  for (const nodeId of [...neighbors.keys()].sort()) {
    if (components.has(nodeId)) continue;
    const queue = [nodeId];
    components.set(nodeId, componentId);
    while (queue.length) {
      const current = queue.shift();
      for (const next of neighbors.get(current).sort()) {
        if (components.has(next)) continue;
        components.set(next, componentId);
        queue.push(next);
      }
    }
    componentId += 1;
  }
  return components;
}

function finitePoint(value) {
  if (!value || typeof value !== 'object') return null;
  const point = { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
  return Object.values(point).every(Number.isFinite) ? point : null;
}

function twoNodeIntent(commandType, selection, firstKey, secondKey) {
  return deepFreeze({
    commandType,
    payload: {
      [firstKey]: selection.nodeIds[0],
      [secondKey]: selection.nodeIds[1],
    },
  });
}

function edgeIntent(commandType, edgeId, extras = {}) {
  return deepFreeze({ commandType, payload: { edgeId, ...extras } });
}
