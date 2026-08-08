import { readFileSync } from 'node:fs';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  BM4NL_DISPLACEMENTS_PATH,
  BM4NL_RESTRAINT_SUMMARY_PATH,
  BM4NL_SOURCE_ID,
  M044_CASES,
  loadBm4NlCiiOutput,
} from './lfea-m044-bm4nl-fixtures.mjs';
import { auditNodalDisplacementParity, auditNodalReactionParity } from './lfea-m044-bm4nl-node-comparison.mjs';
import { bm4NlLfeaExecutions } from './lfea-m044-bm4nl-solve.mjs';

// M044 orchestrator: BM4_NL node-level benchmark, CASE 19 (SUS) first per the
// dispatched instruction, CASE 20 (OPE) alongside it since the same machinery
// covers both with no extra assumptions. EXP is NOT reported here: BM4_NL's
// own accdb carries no CASE 21 row, and L20-L19 is a derived difference of
// two solves, not an independent measurement -- reporting it as parity
// evidence would overstate what this fixture actually contains.

export function buildBm4NlNodeReport() {
  const cii = loadBm4NlCiiOutput();
  const lfea = bm4NlLfeaExecutions();
  const perCase = M044_CASES.map((caseLabel) => Object.freeze({
    caseLabel,
    reaction: auditNodalReactionParity(cii, lfea[caseLabel], caseLabel),
    displacement: auditNodalDisplacementParity(cii, lfea[caseLabel], caseLabel),
  }));
  return Object.freeze({
    schema: 'm044-bm4nl-node-level-report/v1',
    sourceId: BM4NL_SOURCE_ID,
    sourceSemanticHash: semanticHash({
      content: readFileSync(BM4NL_DISPLACEMENTS_PATH, 'utf8') + readFileSync(BM4NL_RESTRAINT_SUMMARY_PATH, 'utf8'),
    }),
    cases: M044_CASES,
    perCase: Object.freeze(perCase),
  });
}

function printReport(report) {
  console.log('\n--- M044 BM4_NL node-level benchmark ---');
  for (const level of report.perCase) {
    console.log(`\nCASE ${level.caseLabel}`);
    console.log(`  reaction: ${level.reaction.nodeSummary.passedCount}/${level.reaction.nodeSummary.total} nodes pass (all-DOF), ${level.reaction.summary.passedCount}/${level.reaction.summary.total} DOF-rows pass`);
    for (const node of level.reaction.failingNodes) {
      console.log(`    FAIL node ${node.nodeId}: worst ${node.worst.dof} ours=${node.worst.ours.toFixed(2)} ref=${node.worst.reference.toFixed(2)} (${node.worst.percentDifference?.toFixed(1)}%)`);
    }
    console.log(`  displacement: ${level.displacement.summary.passedCount}/${level.displacement.summary.total} DOF-rows pass across ${level.displacement.matchedNodeCount} nodes`);
  }
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printReport(buildBm4NlNodeReport());
}
