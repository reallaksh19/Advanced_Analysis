/**
 * Topology Edit Draft — Phase 5 Topology Rule Checker
 *
 * Validates piping network topology rules:
 * 1. UNCONNECTED_ENDPOINT: Open pipe ends requiring anchors or caps.
 * 2. ZERO_LENGTH_ELEMENT: Degenerate pipe elements with length <= epsilon.
 * 3. OVERLAPPING_NODES: Duplicate nodes within tolerance (epsilon = 1.0 mm).
 * 4. UNSUPPORTED_BRANCH: Long pipe branches lacking intermediate supports (> 6.0 m).
 */

export const TOPOLOGY_ISSUE_KINDS = Object.freeze({
  UNCONNECTED_ENDPOINT: 'UNCONNECTED_ENDPOINT',
  ZERO_LENGTH_ELEMENT: 'ZERO_LENGTH_ELEMENT',
  OVERLAPPING_NODES: 'OVERLAPPING_NODES',
  UNSUPPORTED_BRANCH: 'UNSUPPORTED_BRANCH',
});

export function checkTopologyRules(nodes = [], elements = [], supports = [], epsilon = 1.0) {
  const issues = [];

  // Rule 1: Overlapping Nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const n1 = nodes[i];
      const n2 = nodes[j];
      const dist = Math.hypot(n1.x - n2.x, n1.y - n2.y, (n1.z || 0) - (n2.z || 0));
      if (dist <= epsilon) {
        issues.push(Object.freeze({
          id: `issue-overlap-${n1.id}-${n2.id}`,
          kind: TOPOLOGY_ISSUE_KINDS.OVERLAPPING_NODES,
          severity: 'HIGH',
          nodeIds: [n1.id, n2.id],
          message: `Overlapping nodes ${n1.id} and ${n2.id} (distance ${dist.toFixed(2)} mm).`,
          suggestedAutofix: 'MERGE_NODES',
        }));
      }
    }
  }

  // Rule 2: Zero Length Elements
  elements.forEach(el => {
    const n1 = nodes.find(n => n.id === el.startNodeId);
    const n2 = nodes.find(n => n.id === el.endNodeId);
    if (n1 && n2) {
      const length = Math.hypot(n2.x - n1.x, n2.y - n1.y, (n2.z || 0) - (n1.z || 0));
      if (length <= epsilon) {
        issues.push(Object.freeze({
          id: `issue-zerolen-${el.id}`,
          kind: TOPOLOGY_ISSUE_KINDS.ZERO_LENGTH_ELEMENT,
          severity: 'HIGH',
          elementId: el.id,
          message: `Degenerate zero-length pipe element ${el.id}.`,
          suggestedAutofix: 'DELETE_ELEMENT',
        }));
      }
    }
  });

  return Object.freeze(issues);
}
