import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBm4NlCiiOutput } from './lfea-m044-bm4nl-fixtures.mjs';
import { auditNodalReactionParity } from './lfea-m044-bm4nl-node-comparison.mjs';
import {
  bm4NlLfeaExecutionsWithPressureElongation,
  solveBm4M045PressureElongationCases,
} from './lfea-m045-bm4-pressure-elongation-solve.mjs';
import { closedEndPressureAxialStrain } from './lfea-m045-bm4-pressure-elongation.mjs';

// M045 qualification gate. This is a REAL, measured, PARTIAL fix, not a
// closed RCA: it records what closed-end pressure elongation actually
// changes on BM4_NL's CASE 19/20 node-level benchmark (M044), honestly,
// including where it falls short of what a separately-reported RCA claimed
// for what should be the same mechanism (M045-T05's comment) and where it
// does nothing at all (CASE OPE, M045-T06).

const MODULES = Object.freeze([
  'lfea-m045-bm4-pressure-elongation.mjs',
  'lfea-m045-bm4-pressure-elongation-solve.mjs',
  'lfea-m045-bm4-pressure-elongation-check.mjs',
]);
const LINE_LIMIT = 300;

console.log('\n--- M045 BM4 closed-end pressure elongation check ---');

for (const name of MODULES) {
  const path = fileURLToPath(new URL(`./${name}`, import.meta.url));
  const lines = readFileSync(path, 'utf8').split('\n').length;
  assert.ok(lines < LINE_LIMIT, `${name} has ${lines} physical lines; limit is <${LINE_LIMIT}`);
}
console.log(`M045-T01 PASS All ${MODULES.length} modules are under ${LINE_LIMIT} physical lines`);

// M045-T02: formula reproduces a hand-verified value for IX-S37's real
// pressure/geometry (P=11.6MPa, Di=146.354mm, Do=168.300mm, nu=0.292,
// E=203.395GPa): epsilon_p = 0.416*11.6e6*0.021420/(203.395e9*0.006905).
const strain = closedEndPressureAxialStrain({
  pressure: 11600000, poissonRatio: 0.292, innerDiameter: 0.146354403, outerDiameter: 0.168300003,
  elasticModulus: 203395008000,
});
assert.ok(Math.abs(strain - 0.00007359381872149178) < 1e-15, `IX-S37 axial strain drifted to ${strain}`);
console.log(`M045-T02 PASS closedEndPressureAxialStrain reproduces the hand-verified IX-S37 strain (${strain})`);

// M045-T03: the solve completes (skip-list elements do not corrupt assembly)
// and discloses how many elements it actually touched.
const solved = solveBm4M045PressureElongationCases();
assert.equal(solved.sustained.pressureElongationSkippedCount, 2, 'expected exactly 2 skipped tee-modified pressurized elements');
assert.equal(solved.sustained.execution.diagnostics.forceEquilibrium.status, 'PASS', 'SUS force equilibrium must still pass with pressure elongation applied');
console.log(`M045-T03 PASS Solve completes; ${solved.sustained.pressureElongationSkippedCount} tee-modified elements explicitly excluded, equilibrium holds`);

// M045-T04: node 21470's SUS reaction is pinned at its measured value with
// the fix applied -- this is a regression anchor, not a claim of correctness.
const uy21470 = solved.sustained.execution.reactions.find((row) => row.nodeId === 'BM4M035.N21470' && row.dof === 'UY');
assert.ok(Math.abs(uy21470.value - 418.2662420824944) < 1e-6, `node 21470 SUS UY (with pressure elongation) drifted to ${uy21470.value}`);
console.log(`M045-T04 PASS node 21470 SUS UY (with pressure elongation) reproduces at ${uy21470.value}`);

// M045-T05: aggregate CASE SUS node-level pass rate improves (M044 baseline:
// 13/30 nodes, 159/180 DOF-rows -- see M044-T04). Measured with the fix:
// 16/30 nodes, 164/180 rows; node 21470 itself moves +590.05 -> +418.27,
// i.e. ~172N of the ~1247N shift toward CII's implied -656.90N. That is a
// real, correctly-signed, but PARTIAL correction -- roughly 14% of the gap
// at this node, well short of the ~80% a separately-reported RCA measured
// for what should be the same mechanism. That magnitude discrepancy is
// unresolved and is recorded here rather than papered over.
const cii = loadBm4NlCiiOutput();
const lfea = bm4NlLfeaExecutionsWithPressureElongation();
const sus = auditNodalReactionParity(cii, lfea.SUS, 'SUS');
assert.ok(sus.nodeSummary.passedCount >= 15, `CASE SUS node-pass-count regressed to ${sus.nodeSummary.passedCount}/30`);
assert.ok(sus.summary.passedCount >= 160, `CASE SUS DOF-row pass-count regressed to ${sus.summary.passedCount}/180`);
console.log(`M045-T05 PASS CASE SUS improves to ${sus.nodeSummary.passedCount}/30 nodes, ${sus.summary.passedCount}/180 DOF-rows (M044 baseline: 13/30, 159/180) -- partial, not a closed fix`);

// M045-T06: CASE OPE is explicitly NOT addressed by this mechanism -- it
// stays at its M044 baseline (7/30 nodes) to within a few Newtons/percent.
// Recorded so nobody mistakes the SUS improvement for having touched OPE's
// much larger (2-6x), separately-tracked, still-unexplained anomaly.
const ope = auditNodalReactionParity(cii, lfea.OPE, 'OPE');
assert.ok(ope.nodeSummary.passedCount <= 9, `CASE OPE node-pass-count moved to ${ope.nodeSummary.passedCount}/30 -- if pressure elongation now measurably affects OPE, document why`);
console.log(`M045-T06 PASS CASE OPE unchanged by this fix: ${ope.nodeSummary.passedCount}/30 nodes pass (M044 baseline: 7/30) -- separate, unresolved anomaly`);

console.log('\nM045 BM4 closed-end pressure elongation check PASS\n');
