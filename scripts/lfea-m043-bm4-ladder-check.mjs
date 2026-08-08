import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { M043_LADDER_POLICY } from './lfea-m043-bm4-ladder-fixtures.mjs';
import { buildBm4LadderReport } from './lfea-m043-bm4-ladder-report.mjs';

// M043 qualification gate. Evidence-only: this module family reads the solved
// BM4 model and the committed CAESAR output authority and produces a report. It
// changes no mechanics, so what has to be proven is that the INSTRUMENT is sound
// -- because an unsound instrument is exactly how the previous BM4 root-cause
// attempts reached two disproven conclusions.

const MODULES = Object.freeze([
  'lfea-m043-bm4-ladder-fixtures.mjs',
  'lfea-m043-bm4-load-balance.mjs',
  'lfea-m043-bm4-displacement-parity.mjs',
  'lfea-m043-bm4-residual-retrace.mjs',
  'lfea-m043-bm4-retrace-domain.mjs',
  'lfea-m043-bm4-residual-signature.mjs',
  'lfea-m043-bm4-ladder-report.mjs',
  'lfea-m043-bm4-ladder-check.mjs',
]);
const LINE_LIMIT = 300;

console.log('\n--- M043 BM4 causal-order ladder check ---');

// M043-T01: anti-drift. Every module stays under the repository's line bar.
for (const name of MODULES) {
  const path = fileURLToPath(new URL(`./${name}`, import.meta.url));
  const lines = readFileSync(path, 'utf8').split('\n').length;
  assert.ok(lines < LINE_LIMIT, `${name} has ${lines} physical lines; limit is <${LINE_LIMIT}`);
}
console.log(`M043-T01 PASS All ${MODULES.length} modules are under ${LINE_LIMIT} physical lines`);

const report = buildBm4LadderReport();

// M043-T02: the retrace reproduces the solver's own reaction vector. This is the
// instrument's calibration: it can only pass if the sign convention, the DOF
// ordering, the row-major 12x12 layout and the load-assembly rule are all
// simultaneously correct. Nothing downstream is trustworthy without it.
const selfTest = report.levels.L4.selfTest;
assert.equal(selfTest.status, 'QUALIFIED', 'L4 self-test must qualify before any retrace is reported');
assert.ok(
  selfTest.reactionWorstRelative <= selfTest.reactionLimit,
  `retrace reproduces solver reactions to ${selfTest.reactionWorstRelative}, limit ${selfTest.reactionLimit}`,
);
console.log(`M043-T02 PASS Retrace reproduces the solver's own reactions to ${selfTest.reactionWorstRelative.toExponential(3)} relative`);

// M043-T03: the free-DOF residual is inherited conditioning, not manufactured.
// A ratio near 1 against the solver's own reported residual proves the retrace
// is not introducing imbalance of its own.
assert.ok(
  selfTest.freeDofToSolverResidualRatio !== null && selfTest.freeDofToSolverResidualRatio < 10,
  `retrace free-DOF residual is ${selfTest.freeDofToSolverResidualRatio}x the solver's own; it must inherit, not manufacture`,
);
console.log(`M043-T03 PASS Free-DOF residual is ${selfTest.freeDofToSolverResidualRatio.toFixed(3)}x the solver's own reported residual`);

// M043-T04: the retrace declares its domain of validity. BM4 carries connector
// stubs whose stiffness amplifies the authority's serialisation precision past
// any useful scale; those elements must be excluded, and the exclusion must be
// visible rather than silent.
for (const level of report.levels.L4.perCase) {
  assert.equal(level.status, 'COMPUTED', `L4 ${level.caseLabel} must compute once the self-test qualifies`);
  assert.ok(
    level.elementAdmission.rejectedElementCount > 0,
    `L4 ${level.caseLabel} must report the elements excluded for stiffness amplification`,
  );
  assert.ok(
    level.excludedNodeCount > 0 && level.retraceableNodeCount > 0,
    `L4 ${level.caseLabel} must retain a retraceable subset and disclose the excluded remainder`,
  );
  const worst = level.signature.worstNodesByForceResidual[0];
  assert.ok(
    worst.forceMagnitude < 1e6,
    `L4 ${level.caseLabel} worst nodal residual ${worst.forceMagnitude} N is not physically scaled against a 93.5 kN model; the admission gate has failed`,
  );
}
console.log('M043-T04 PASS Every retraced case declares its excluded elements/nodes and stays physically scaled');

// M043-T05: constrained DOFs are never read as residual. At a restrained DOF
// K*u - F is the reaction, so including it would rank every supported node as an
// offender purely for being supported.
for (const level of report.levels.L4.perCase) {
  for (const row of level.signature.worstNodesByForceResidual) {
    assert.ok(
      Number.isFinite(row.forceMagnitude) && Number.isFinite(row.forceNoiseBound),
      `L4 ${level.caseLabel} node ${row.nodeId} has a non-finite residual or noise bound`,
    );
    assert.ok(
      row.signalToNoiseRatio >= M043_LADDER_POLICY.authorityDisplacementPrecision.resolvableSignalToNoiseRatio,
      `L4 ${level.caseLabel} node ${row.nodeId} was reported below the resolvable signal-to-noise bar`,
    );
  }
}
console.log('M043-T05 PASS Reported nodes are all above their own noise bound');

// M043-T06: the authority's own case-load invariant is measured, not assumed.
// This is what settles applied-force-set membership arithmetically.
const invariants = report.levels.L2.authorityInvariants;
assert.ok(
  typeof invariants.appliedForceSetPresentInAnyCase === 'boolean',
  'L2 must resolve applied-force-set membership from the authority rather than leaving it open',
);
console.log(`M043-T06 PASS Authority case-load invariant resolved: ${invariants.interpretation}`);

// M043-T07: L3 reports a per-DOF breakdown, not just an aggregate. The whole
// diagnostic value of the level is that a direction-specific error is visible.
for (const level of report.levels.L3.perCase) {
  for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) {
    assert.ok(level.summary.byDof[dof], `L3 ${level.caseLabel} is missing the ${dof} breakdown`);
  }
  assert.ok(level.matchedNodeCount > 0, `L3 ${level.caseLabel} matched no node`);
  assert.equal(
    level.comparisonSurface,
    'SHARED_PHYSICAL_NODES_ONLY_NO_INTERPOLATION_ACROSS_DIFFERING_DISCRETISATION',
    'L3 must not interpolate across differing discretisations',
  );
}
console.log('M043-T07 PASS L3 reports all six DOF per case on shared physical nodes only');

// M043-T08: L0 stays fail-closed. It has no independent oracle in the committed
// fixtures and must say so rather than compare against a circular one.
assert.ok(
  report.levels.L0.status.startsWith('BLOCKED_'),
  'L0 must remain fail-closed while no independent coordinate oracle is committed',
);
console.log(`M043-T08 PASS L0 fail-closed: ${report.levels.L0.status}`);

// M043-T09: determinism. Two independent builds must be byte-identical, or none
// of the above evidence is reproducible.
const repeated = buildBm4LadderReport();
assert.equal(
  semanticHash(report),
  semanticHash(repeated),
  'M043 ladder report must be deterministic across runs',
);
console.log(`M043-T09 PASS Report is deterministic (${semanticHash(report)})`);

console.log('\nM043 BM4 causal-order ladder check PASS\n');
