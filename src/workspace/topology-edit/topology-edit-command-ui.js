/** Pure selection and UI-action mapping for the seven governed commands. */
import { deepFreeze } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_MOVE_DELTA_MM = 100;
export const TOPOLOGY_EDIT_SPLIT_FRACTION = 0.5;

export const TOPOLOGY_EDIT_COMMAND_ACTIONS = deepFreeze([
  { id: 'move-positive-z', label: 'Move +Z 100 mm', title: 'Move the selected node exactly +100 mm on canonical Z.' },
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
    return `Selected nodes 1=${selection.nodeIds[0]}, 2=${selection.nodeIds[1]}.`;
  }
  if (selection.nodeIds.length === 1) {
    return `Selected node ${selection.nodeIds[0]}. Shift-click a second node for two-node commands.`;
  }
  return 'No canonical node or edge selected.';
}

export function canRunTopologyEditAction(actionId, selection) {
  if (actionId === 'move-positive-z') return selection.nodeIds.length === 1;
  if (NODE_ACTIONS.has(actionId)) return selection.nodeIds.length === 2;
  if (EDGE_ACTIONS.has(actionId)) return Boolean(selection.edgeId);
  return false;
}

export function createTopologyEditCommandIntent(actionId, selection, topology) {
  if (!canRunTopologyEditAction(actionId, selection)) {
    throw new Error(`Topology edit action ${actionId} does not have the required selection.`);
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
