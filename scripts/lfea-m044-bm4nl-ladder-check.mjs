import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { M044_CASES, loadBm4NlCiiOutput } from './lfea-m044-bm4nl-fixtures.mjs';
import { buildBm4NlNodeReport } from './lfea-m044-bm4nl-report.mjs';

// M044 qualification gate. This benchmark is a SEPARATE CAESAR fixture from
// Output_BM4.xml (M034/M043), independently onboarded to settle whether
// M043's sign convention and pass-rate pattern hold outside that one
// fixture. The gate therefore checks structure and known-true measurements,
// not an aspirational target: CASE OPE currently fails at scale (a new,
// unexplained finding -- see M044-T05) and the gate says so rather than
// hiding it behind a loose tolerance.

const MODULES = Object.freeze([
  'lfea-m044-bm4nl-fixtures.mjs',
  'lfea-m044-bm4nl-solve.mjs',
  'lfea-m044-bm4nl-node-comparison.mjs',
  'lfea-m044-bm4nl-report.mjs',
  'lfea-m044-bm4nl-ladder-check.mjs',
]);
const LINE_LIMIT = 300;

console.log('\n--- M044 BM4_NL node-level benchmark check ---');

// M044-T01: anti-drift.
for (const name of MODULES) {
  const path = fileURLToPath(new URL(`./${name}`, import.meta.url));
  const lines = readFileSync(path, 'utf8').split('\n').length;
  assert.ok(lines < LINE_LIMIT, `${name} has ${lines} physical lines; limit is <${LINE_LIMIT}`);
}
console.log(`M044-T01 PASS All ${MODULES.length} modules are under ${LINE_LIMIT} physical lines`);

// M044-T02: the fixture actually carries both dispatched cases and nothing
// else -- BM4_NL's own accdb has no CASE 21 (EXP) row, so a fixture that
// silently invented one would be reporting evidence that doesn't exist.
const cii = loadBm4NlCiiOutput();
assert.deepEqual([...cii.displacement.keys()].sort(), [...M044_CASES].sort());
assert.deepEqual([...cii.restraint.keys()].sort(), [...M044_CASES].sort());
for (const label of M044_CASES) {
  assert.ok(cii.displacement.get(label).size >= 96, `CASE ${label} displacement report has too few nodes`);
  assert.ok(cii.restraint.get(label).size === 30, `CASE ${label} restraint report expected 30 restrained nodes, got ${cii.restraint.get(label).size}`);
}
console.log('M044-T02 PASS Fixture carries exactly CASE 19 (SUS) and CASE 20 (OPE), 30 restrained nodes each');

// M044-T03: node 21470's SUS reaction, the value independently reported
// elsewhere as "+590.051N app reaction", must still be exactly reproduced by
// this module's solve wrapper -- it is the one number this whole benchmark
// was cross-checked against before any other code was written.
const report = buildBm4NlNodeReport();
const susReaction = report.perCase.find((level) => level.caseLabel === 'SUS').reaction;
const node21470 = susReaction.nodeSummaries.find((node) => node.nodeId === '21470');
const uy21470 = node21470.rows.find((row) => row.dof === 'UY');
assert.ok(Math.abs(uy21470.ours - 590.0536958937001) < 1e-6, `node 21470 SUS UY drifted to ${uy21470.ours}`);
console.log(`M044-T03 PASS node 21470 SUS UY reaction reproduces at ${uy21470.ours}`);

// M044-T04: the sign convention is a measured fact, not an assumption. Two
// distinct pass rates are meaningful here and must not be conflated: the
// DOF-row rate (every individual FX/FY/.../MZ comparison, dominated by the
// dominant-load-path component at each node) and the all-DOF node rate
// (requires every component, including small secondary GUI/LIM cross-axis
// components, to pass at once). Measured: 159/180 (88%) DOF-rows pass;
// 13/30 (43%) nodes pass on every DOF simultaneously -- the gap between
// those two numbers IS the finding: dominant-direction reactions agree well
// once negated (confirming M043's sign convention independently on this
// second fixture), secondary cross-axis components carry more relative
// noise and are not yet explained.
assert.ok(
  susReaction.summary.passedCount / susReaction.summary.total >= 0.8,
  `CASE SUS DOF-row pass fraction dropped to ${susReaction.summary.passedCount}/${susReaction.summary.total}; sign-convention regression or comparator bug`,
);
assert.ok(
  susReaction.nodeSummary.passedCount >= 10,
  `CASE SUS all-DOF node-pass-count dropped to ${susReaction.nodeSummary.passedCount}/30`,
);
console.log(`M044-T04 PASS CASE SUS: ${susReaction.summary.passedCount}/${susReaction.summary.total} DOF-rows pass; ${susReaction.nodeSummary.passedCount}/${susReaction.nodeSummary.total} nodes pass on every DOF`);

// M044-T05: CASE OPE is NOT gated at a healthy bar. It measures far worse
// than SUS (LFEA reactions 2-6x CAESAR's at several dominant-Y nodes, e.g.
// node 20090: LFEA -162593.57N vs CAESAR-implied -51788.32N) despite
// identical weight/pressure/temperature input data (verified byte-for-byte
// against BM4.ACCDB's INPUT_BASIC_ELEMENT_DATA, keyed by node pair). This
// assertion records the measurement rather than hiding it: it fails loudly
// if OPE ever becomes as healthy as SUS without an explicit review of why.
const opeReaction = report.perCase.find((level) => level.caseLabel === 'OPE').reaction;
assert.ok(
  opeReaction.nodeSummary.passedCount <= 15,
  `CASE OPE node-pass-count rose to ${opeReaction.nodeSummary.passedCount}/30 -- if this is a real fix, tighten this assertion and document why`,
);
console.log(`M044-T05 PASS (measurement recorded, not resolved): CASE OPE ${opeReaction.nodeSummary.passedCount}/${opeReaction.nodeSummary.total} restrained nodes pass -- open finding, see M044 report`);

console.log('\nM044 BM4_NL node-level benchmark check PASS\n');
