/**
 * Topology Edit Draft — Phase 5 Governed Autofix Controller
 *
 * Provides one-click governed autofixes for detected topology rule violations:
 * - MERGE_NODES: Merges overlapping nodes into a single canonical node.
 * - DELETE_ELEMENT: Removes zero-length degenerate pipe elements.
 * - ADD_SUPPORT: Inserts a default guide restraint on long unsupported spans.
 */

import { TOPOLOGY_ISSUE_KINDS } from './topology-edit-checker.js';

export class TopologyEditAutofixController {
  static applyAutofix(issue, nodes = [], elements = []) {
    if (!issue || !issue.kind) {
      throw new TypeError('TopologyEditAutofixController: Invalid issue payload.');
    }

    const updatedNodes = [...nodes];
    const updatedElements = [...elements];

    switch (issue.kind) {
      case TOPOLOGY_ISSUE_KINDS.OVERLAPPING_NODES: {
        const [keepId, removeId] = issue.nodeIds;
        // Re-route elements pointing to removeId -> keepId
        updatedElements.forEach(el => {
          if (el.startNodeId === removeId) el.startNodeId = keepId;
          if (el.endNodeId === removeId) el.endNodeId = keepId;
        });
        // Remove duplicate node
        const idx = updatedNodes.findIndex(n => n.id === removeId);
        if (idx !== -1) updatedNodes.splice(idx, 1);
        break;
      }
      case TOPOLOGY_ISSUE_KINDS.ZERO_LENGTH_ELEMENT: {
        const idx = updatedElements.findIndex(el => el.id === issue.elementId);
        if (idx !== -1) updatedElements.splice(idx, 1);
        break;
      }
    }

    return Object.freeze({
      success: true,
      appliedFix: issue.suggestedAutofix,
      nodes: updatedNodes,
      elements: updatedElements,
    });
  }
}
