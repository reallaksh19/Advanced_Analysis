/** Lineage-aware equivalence for checker findings after semantics-preserving edge splits. */
import { semanticHash } from '../../core/shared-piping-model/index.js';

const SPLIT_LINEAGE_PAIR_ISSUES = new Set([
  'CENTERLINE_CLASH',
  'OVERLAPPING_ELEMENTS',
  'PHYSICAL_CLEARANCE_CLASH',
]);

export function topologyEditCheckerIssueLineageEquivalent(
  issue,
  issueTopology,
  candidates,
  candidateTopology,
) {
  const signature = lineagePairSignature(issue, issueTopology);
  if (!signature) return false;
  return (candidates ?? []).some((candidate) => (
    lineagePairSignature(candidate, candidateTopology) === signature
  ));
}

function lineagePairSignature(issue, topology) {
  if (!SPLIT_LINEAGE_PAIR_ISSUES.has(issue?.kind)) return null;
  const edgeIds = [...new Set(
    issue?.edgeIds ?? (issue?.edgeId ? [issue.edgeId] : []),
  )];
  if (edgeIds.length !== 2) return null;
  const rootEdgeId = edgeLineageResolver(topology);
  return semanticHash({
    kind: issue.kind,
    severity: issue.severity,
    rootEdgeIds: edgeIds.map(rootEdgeId).sort(),
  });
}

function edgeLineageResolver(topology) {
  const edges = new Map((topology?.edges ?? []).map((edge) => [edge.id, edge]));
  return (edgeId) => {
    let current = String(edgeId ?? '');
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      const parent = String(edges.get(current)?.derivedFromEdgeId ?? '').trim();
      if (!parent) return current;
      current = parent;
    }
    return current;
  };
}
