/**
 * Topology Edit Draft — Phase 4 Interactive Tools Controller
 *
 * Manages 3D editing tools:
 * - SELECT          (Single/multi object selection)
 * - MOVE_NODE       (3D position translation)
 * - STRETCH_PIPE    (Axial pipe elongation)
 * - CONNECT_NODE    (Snap node endpoints)
 * - SPLIT_EDGE      (Insert node into pipe segment)
 * - ROTATE_SUBGRAPH (Angular rotation around axis)
 * - BRIDGE_GAP      (Connect line endpoints)
 */

export const EDIT_TOOLS = Object.freeze({
  SELECT: 'select',
  MOVE_NODE: 'move-node',
  STRETCH_PIPE: 'stretch-pipe',
  CONNECT_NODE: 'connect-node',
  SPLIT_EDGE: 'split-edge',
  ROTATE_SUBGRAPH: 'rotate-subgraph',
  BRIDGE_GAP: 'bridge-gap',
  DELETE_ENTITY: 'delete-entity',
  MEASURE: 'measure',
  RUN_AUTOFIX: 'run-autofix',
  ADD_NODE: 'add-node',
  ADD_ELBOW: 'add-elbow',
  ADD_TEE: 'add-tee',
  ADD_VALVE: 'add-valve',
  ADD_ANCHOR: 'add-anchor',
  ADD_HANGER: 'add-hanger',
  ADD_RESTRAINT: 'add-restraint',
});

export class TopologyEditToolsController {
  constructor(initialTool = EDIT_TOOLS.SELECT) {
    this.activeTool = initialTool;
    this.listeners = new Set();
  }

  setActiveTool(toolId) {
    if (!Object.values(EDIT_TOOLS).includes(toolId)) {
      throw new TypeError(`TopologyEditToolsController: Invalid tool ID "${toolId}".`);
    }
    this.activeTool = toolId;
    this.notify();
    return this.activeTool;
  }

  getActiveTool() {
    return this.activeTool;
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
    }
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(cb => {
      try { cb(this.activeTool); } catch { /* ignore */ }
    });
  }
}
