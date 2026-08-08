import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { retraceBm4NlCase } from './lfea-m047-bm4nl-ope-retrace.mjs';

// M047 orchestrator: L4 causal-order residual retrace for BM4_NL, CASE 19
// (SUS, dispatched calibration case) and CASE 20 (OPE, the actual target --
// the ~2-6x reaction over-prediction M045/M044 left unexplained). Unlike
// M043 (BM4/Output_BM4.xml, M035+M036 unilateral solve), this targets
// BM4_NL specifically: non-friction, no lift-off, 100% linear, via
// solveBm4M035FeatureCases().

export function buildBm4NlOpeLadderReport() {
  const sustained = retraceBm4NlCase('SUS', false);
  const operating = retraceBm4NlCase('OPE', true);
  return Object.freeze({
    schema: 'm047-bm4nl-ope-causal-order-report/v1',
    cases: Object.freeze({ SUS: sustained, OPE: operating }),
  });
}

function printWorst(rows, label) {
  console.log(`  worst ${label} (top 5):`);
  for (const row of rows.slice(0, 5)) {
    console.log(`    ${row.nodeId}: magnitude=${(row.forceMagnitude ?? row.momentMagnitude).toFixed(1)} element=${row.governingElementId} axialFraction=${row.axialFraction?.toFixed(3) ?? 'n/a'} SNR=${row.signalToNoiseRatio.toFixed(0)}`);
  }
}

function printReport(report) {
  console.log('\n--- M047 BM4_NL OPE causal-order residual retrace ---');
  for (const [label, level] of Object.entries(report.cases)) {
    console.log(`\nCASE ${label}: selfTest=${level.selfTest.status}, retraceable nodes=${level.retraceableNodeCount}/${level.retraceableNodeCount + level.excludedNodeCount}`);
    console.log(`  verdict: ${level.verdict.status} -- ${level.verdict.findings.map((f) => f.code).join(', ')}`);
    printWorst(level.signature.worstNodesByForceResidual, 'force residual nodes');
  }
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildBm4NlOpeLadderReport();
  printReport(report);
  console.log('report hash:', semanticHash(report));
}
