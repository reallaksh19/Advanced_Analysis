#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildBm2CiiComparisonConditioned } from './lfea-b3.26-bm2-output-comparison-runtime.mjs';
import {
  BM2_DIRECTIONAL_CONTACT_POLICY,
  solveBm2WithDirectionalRestraints,
} from './lfea-b3.27-bm2-restraint-active-set-runtime.mjs';
import { buildBm2DirectionalRestraintComparison } from './lfea-b3.27-bm2-restraint-comparison-runtime.mjs';

console.log('\n--- LFEA B-3.27 M027 corrected InputXML directional-restraint active set ---');

const directSolve = solveBm2WithDirectionalRestraints();
assert.equal(directSolve.report.schema, 'm027-bm2-directional-restraint-solve-report/v1');
assert.equal(directSolve.directional.length, 2);

const plusY = directSolve.directional.find(
  (row) => row.sourceNodeId === '40' && row.dof === 'UY',
);
assert.ok(plusY, 'BM2 node 40 must retain the corrected +Y restraint.');
assert.equal(plusY.sourceTypeCode, '17');
assert.equal(plusY.effectiveTypeCode, '14');
assert.equal(plusY.mutationApplied, true);
assert.equal(plusY.label, '+Y');
assert.equal(plusY.freeDirection, 'POSITIVE');
assert.equal(plusY.restrainedDirection, 'NEGATIVE');

const plusZ = directSolve.directional.find(
  (row) => row.sourceNodeId === '130' && row.dof === 'UZ',
);
assert.ok(plusZ, 'BM2 node 130 must retain the corrected +Z restraint.');
assert.equal(plusZ.sourceTypeCode, '18');
assert.equal(plusZ.effectiveTypeCode, '15');
assert.equal(plusZ.mutationApplied, true);
assert.equal(plusZ.label, '+Z');
assert.equal(plusZ.freeDirection, 'POSITIVE');
assert.equal(plusZ.restrainedDirection, 'NEGATIVE');

for (const [label, analysis] of Object.entries({
  SUS: directSolve.sustained,
  OPE: directSolve.operating,
})) {
  assert.equal(analysis.contact.status, 'CONVERGED', `${label} contact convergence`);
  assert.ok(
    analysis.contact.iterations <= BM2_DIRECTIONAL_CONTACT_POLICY.maximumIterations,
    `${label} contact iteration limit`,
  );
  const final = analysis.contact.history.at(-1);
  assert.ok(final, `${label} final contact iteration`);
  for (const evaluation of final.evaluations) {
    assert.equal(evaluation.active, evaluation.nextActive, `${label} stable ${evaluation.restraintId}`);
    if (evaluation.active) {
      assert.ok(
        Math.abs(evaluation.signedFreeDisplacement)
          <= BM2_DIRECTIONAL_CONTACT_POLICY.displacementTolerance,
        `${label} active displacement ${evaluation.restraintId}`,
      );
      assert.ok(
        evaluation.signedContactReaction
          >= -BM2_DIRECTIONAL_CONTACT_POLICY.reactionTolerance,
        `${label} active reaction ${evaluation.restraintId}`,
      );
    } else {
      assert.ok(
        evaluation.signedFreeDisplacement
          >= -BM2_DIRECTIONAL_CONTACT_POLICY.displacementTolerance,
        `${label} free displacement ${evaluation.restraintId}`,
      );
      assert.ok(
        Math.abs(evaluation.reaction)
          <= BM2_DIRECTIONAL_CONTACT_POLICY.reactionTolerance,
        `${label} inactive reaction ${evaluation.restraintId}`,
      );
    }
  }
}

const baseline = buildBm2CiiComparisonConditioned();
assert.deepEqual(baseline.totals, {
  comparisons: 2232,
  passed: 771,
  failed: 1461,
  untraced: 0,
});
const result = buildBm2DirectionalRestraintComparison(baseline);
assert.equal(result.comparison.schema, 'lfea-bm2-cii-output-comparison/v4');
assert.equal(
  result.comparison.restraintAuthority,
  'INPUTXML_MUTATION_PLUS_DIRECTIONAL_ACTIVE_SET_V1',
);
assert.equal(result.comparison.totals.comparisons, 2232);
assert.equal(
  result.comparison.totals.comparisons,
  result.comparison.totals.passed + result.comparison.totals.failed,
);
assert.equal(result.comparison.totals.untraced, 0);
assert.equal(
  result.delta.netFailureChange,
  result.comparison.totals.failed - baseline.totals.failed,
);
assert.equal(
  result.delta.newlyPassed.length - result.delta.newlyFailed.length,
  baseline.totals.failed - result.comparison.totals.failed,
);

const repeated = buildBm2DirectionalRestraintComparison(baseline);
assert.equal(
  JSON.stringify(repeated.comparison),
  JSON.stringify(result.comparison),
  'Directional-restraint comparison must be deterministic.',
);
assert.equal(
  JSON.stringify(repeated.delta),
  JSON.stringify(result.delta),
  'Directional-restraint delta ledger must be deterministic.',
);

const reportDirectory = fileURLToPath(new URL('../reports', import.meta.url));
mkdirSync(reportDirectory, { recursive: true });
const reportPath = fileURLToPath(new URL(
  '../reports/lfea-bm2-directional-restraint-comparison.json',
  import.meta.url,
));
writeFileSync(reportPath, `${JSON.stringify({
  schema: 'lfea-bm2-directional-restraint-qualification/v1',
  baselineTotals: baseline.totals,
  correctedTotals: result.comparison.totals,
  delta: result.delta,
  directionalRestraints: result.solved.directional,
  contactCases: result.solved.report.contactCases,
  comparison: result.comparison,
}, null, 2)}\n`);

console.log(JSON.stringify({
  baseline: baseline.totals,
  corrected: result.comparison.totals,
  delta: {
    newlyPassed: result.delta.newlyPassed.length,
    newlyFailed: result.delta.newlyFailed.length,
    netFailureChange: result.delta.netFailureChange,
  },
  directionalRestraints: result.solved.directional,
  contactCases: Object.fromEntries(Object.entries(result.solved.report.contactCases).map(
    ([label, contact]) => [label, {
      status: contact.status,
      iterations: contact.iterations,
      activeState: contact.activeState,
    }],
  )),
}, null, 2));
console.log('LFEA B-3.27 M027 directional-restraint active-set qualification complete.');
