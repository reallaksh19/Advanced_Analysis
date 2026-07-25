import { validatePipingPortTopologyGraph } from '../core/piping-topology/index.js';

class TopologyStoreContract {
  #graph = null;

  setGraph(graph) {
    const validation = validatePipingPortTopologyGraph(graph);
    if (!validation.ok) throw new TypeError(`Topology graph is invalid: ${validation.errors.join(' ')}`);
    this.#graph = graph;
    return this.#graph;
  }

  getGraph() {
    return this.#graph;
  }

  getAudit() {
    return this.#graph?.topologyAudit || null;
  }

  clear() {
    this.#graph = null;
  }
}

export const TopologyStore = Object.freeze(new TopologyStoreContract());
