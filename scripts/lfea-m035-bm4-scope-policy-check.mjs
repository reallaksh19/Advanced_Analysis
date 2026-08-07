#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  M035_BEND_SCORING_EXCLUDED_NODE_IDS,
  M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS,
  M035_NONLINEAR_SUPPORT_NODE_IDS,
  M035_SCOPE_POLICY,
} from './lfea-m035-bm4-scope-policy.mjs';

assert.equal(M035_SCOPE_POLICY.issue, 834);
assert.equal(M035_SCOPE_POLICY.nonlinearSupportIssue, 668);
assert.deepEqual(M035_NONLINEAR_SUPPORT_NODE_IDS, ['20090','20350','21470','21610']);
assert.deepEqual(M035_BEND_SCORING_EXCLUDED_NODE_IDS, ['20090']);
assert.deepEqual(M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS, ['20170','21640']);
assert.equal(M035_SCOPE_POLICY.rules.implementUnilateralSupportIteration, false);
assert.equal(M035_SCOPE_POLICY.rules.implementGapContact, false);
assert.equal(M035_SCOPE_POLICY.rules.implementFriction, false);
assert.equal(M035_SCOPE_POLICY.rules.fitFeatureStiffnessToLiftOffRows, false);
assert.equal(M035_SCOPE_POLICY.rules.preserveRawComparisonRows, true);
assert.equal(M035_SCOPE_POLICY.rules.discloseCrossEffects, true);

console.log(JSON.stringify({ status: 'PASS', scope: M035_SCOPE_POLICY }, null, 2));
