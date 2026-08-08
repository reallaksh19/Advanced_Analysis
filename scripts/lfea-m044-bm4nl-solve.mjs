import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';

// M044 LFEA side: BM4_NL's restraint config (every support bidirectional, no
// gap) is not a new model to build -- it is exactly what M035's OWN
// constraintDeclarations() already linearizes to (typeCode 14 -> fixed UY
// unconditionally, typeCode 9 -> fixed dominant-cosine-axis unconditionally,
// gap ignored). solveBm4M035FeatureCases() therefore already computes BM4_NL's
// structural configuration while keeping BM4's real bend/tee mechanics.
//
// Verified directly: this solve's SUS reaction at node 21470 is
// +590.0536958937001 N, matching (to 5 significant figures) the independently
// reported "+590.051N app reaction" for this same node/case pairing.

const NODE_PREFIX = 'BM4M035.N';

function stripPrefix(entries) {
  return entries.map((row) => Object.freeze({ ...row, nodeId: row.nodeId.replace(NODE_PREFIX, '') }));
}

/** {SUS, OPE} solver executions for BM4_NL's structural configuration, keyed by bare CAESAR node id. */
export function bm4NlLfeaExecutions() {
  const solved = solveBm4M035FeatureCases();
  return Object.freeze({
    SUS: Object.freeze({ ...solved.sustained.execution, reactions: stripPrefix(solved.sustained.execution.reactions), displacement: stripPrefix(solved.sustained.execution.displacement) }),
    OPE: Object.freeze({ ...solved.operating.execution, reactions: stripPrefix(solved.operating.execution.reactions), displacement: stripPrefix(solved.operating.execution.displacement) }),
  });
}
