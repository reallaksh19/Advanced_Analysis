import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import { buildBm4NlOpeLadderReport } from './lfea-m047-bm4nl-ope-report.mjs';

// M047 qualification gate. Evidence-only, like M043: this module reads the
// BM4_NL-configured M035 solve and the committed BM4_NL CAESAR authority and
// retraces; it changes no mechanics. What has to be proven is that the
// retrace is sound (self-test) and that its headline finding -- the
// dominant OPE residual sits at node 22010/element IX-S68, an ALREADY
// DISCLOSED uncorrected inline reducer transition (BM4_NO_TRUE_REDUCER_
// CONDENSATION / inlineReducerCandidates, reducerCondensationActive: 0) --
// is reproducible and traceable to that specific, named, pre-existing gap.

const MODULES = Object.freeze([
  'lfea-m047-bm4nl-ope-retrace.mjs',
  'lfea-m047-bm4nl-ope-report.mjs',
  'lfea-m047-bm4nl-ope-check.mjs',
]);
const LINE_LIMIT = 300;

console.log('\n--- M047 BM4_NL OPE causal-order check ---');

for (const name of MODULES) {
  const path = fileURLToPath(new URL(`./${name}`, import.meta.url));
  const lines = readFileSync(path, 'utf8').split('\n').length;
  assert.ok(lines < LINE_LIMIT, `${name} has ${lines} physical lines; limit is <${LINE_LIMIT}`);
}
console.log(`M047-T01 PASS All ${MODULES.length} modules are under ${LINE_LIMIT} physical lines`);

const report = buildBm4NlOpeLadderReport();

// M047-T02: the retrace self-test qualifies for both cases before any
// finding is trusted (mirrors M043-T02/T03's discipline).
for (const label of ['SUS', 'OPE']) {
  const selfTest = report.cases[label].selfTest;
  assert.equal(selfTest.status, 'QUALIFIED', `${label} self-test must qualify`);
  assert.ok(selfTest.reactionWorstRelative <= selfTest.reactionLimit, `${label} retrace does not reproduce solver reactions`);
  assert.ok(selfTest.freeDofToSolverResidualRatio < 10, `${label} retrace free-DOF residual is not proportional to the solver's own`);
}
console.log('M047-T02 PASS Retrace self-test qualifies for both SUS and OPE (reproduces solver reactions, inherits rather than manufactures residual)');

// M047-T03: the headline finding is pinned and well-resolved -- node
// 22010/IX-S68 is the worst OPE residual, at a magnitude and
// signal-to-noise ratio that rules out serialisation noise.
const worstOpe = report.cases.OPE.signature.worstNodesByForceResidual[0];
assert.equal(worstOpe.nodeId, 'BM4M035.N22010', `expected node 22010 to be the worst OPE residual, got ${worstOpe.nodeId}`);
assert.equal(worstOpe.governingElementId, 'BM4M035.IX-S68', `expected IX-S68 to govern the worst OPE residual, got ${worstOpe.governingElementId}`);
assert.ok(worstOpe.forceMagnitude > 1e6, `worst OPE residual dropped to ${worstOpe.forceMagnitude} N; re-verify the finding`);
assert.ok(worstOpe.signalToNoiseRatio > 1000, `worst OPE residual SNR dropped to ${worstOpe.signalToNoiseRatio}; re-verify against the noise floor`);
console.log(`M047-T03 PASS Worst OPE residual is node 22010/IX-S68: ${worstOpe.forceMagnitude.toFixed(0)} N at SNR ${worstOpe.signalToNoiseRatio.toFixed(0)}`);

// M047-T04: node 22010 is the SAME anomaly in both cases (present, smaller,
// in SUS; ~39x larger in OPE) -- not an OPE-only artifact -- and it
// reproduces to an EXACT, named, pre-existing model limitation: an
// uncorrected inline reducer transition at this exact node.
const worstSus = report.cases.SUS.signature.worstNodesByForceResidual[0];
assert.equal(worstSus.nodeId, 'BM4M035.N22010', 'expected node 22010 to also be the worst SUS residual');
const amplification = worstOpe.forceMagnitude / worstSus.forceMagnitude;
assert.ok(amplification > 20, `SUS->OPE amplification at node 22010 dropped to ${amplification}x`);
const authorities = buildBm4M035FeatureAuthorities();
const transition = authorities.inlineReducers.transitions.find((row) => row.nodeId === '22010');
assert.ok(transition, 'node 22010 must be a detected inline reducer transition');
assert.equal(transition.condensationActivation.status, 'BLOCKED_PENDING_FINITE_REDUCER_GEOMETRY_AND_PARITY', 'reducer condensation at node 22010 unexpectedly active; re-verify the root-cause attribution');
console.log(`M047-T04 PASS Node 22010 is a real, present-in-both-cases anomaly (${amplification.toFixed(1)}x SUS->OPE amplification), traced to the uncorrected inline reducer transition at that exact node (${transition.fromSection.outerDiameter}m -> ${transition.toSection.outerDiameter}m OD)`);

console.log('\nM047 BM4_NL OPE causal-order check PASS\n');
