#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildBm4SolveAuthorities } from './lfea-m034-bm4-solve-fixtures.mjs';
import {
  M035_BEND_SCORING_EXCLUDED_NODE_IDS,
  M035_SCOPE_POLICY,
  M036_CROSS_EFFECT_WATCH_NODE_IDS,
  M036_UNILATERAL_SUPPORT_NODE_IDS,
  classifyM035ComparisonScope,
} from './lfea-m035-bm4-scope-policy.mjs';

console.log('\n--- M035 BM4 scope isolation from M036 unilateral-support work ---');

const authorities = buildBm4SolveAuthorities();
const nodesById = new Map(authorities.normalized.geometry.nodes.map((node) => [String(node.id), node]));

assert.equal(M035_SCOPE_POLICY.schema, 'm035-bm4-scope-policy/v1');
assert.deepEqual(M035_BEND_SCORING_EXCLUDED_NODE_IDS, ['20090']);
assert.deepEqual(M036_CROSS_EFFECT_WATCH_NODE_IDS, ['20170', '21640']);

for (const nodeId of M036_UNILATERAL_SUPPORT_NODE_IDS) {
  const node = nodesById.get(nodeId);
  assert.ok(node, `BM4 owner-declared unilateral node ${nodeId} must exist.`);
  const plusY = (node.meta.restraints ?? []).filter((row) => row.typeCode === '14');
  assert.equal(plusY.length, 1, `BM4 node ${nodeId} must retain exactly one canonical +Y restraint.`);
  assert.equal(Math.abs(plusY[0].yCosine), 1, `BM4 node ${nodeId} +Y restraint must be Y-aligned.`);
  assert.equal(plusY[0].frictionCoefficient, 0.3, `BM4 node ${nodeId} must retain FRIC_COEF=0.3 source evidence.`);

  const disposition = classifyM035ComparisonScope({ family: 'restraint', nodeId });
  assert.equal(disposition.scope, 'M036_OUT_OF_SCOPE');
  assert.equal(disposition.includeInM035ScopedRate, false);
}

const bend20090 = classifyM035ComparisonScope({ family: 'bend', nodeId: '20090' });
assert.equal(bend20090.scope, 'M036_OUT_OF_SCOPE');
assert.equal(bend20090.includeInM035ScopedRate, false);

for (const nodeId of M036_CROSS_EFFECT_WATCH_NODE_IDS) {
  const disposition = classifyM035ComparisonScope({ family: 'globalForce', nodeId });
  assert.equal(disposition.scope, 'M035_IN_SCOPE_WITH_M036_CROSS_EFFECT_DISCLOSURE');
  assert.equal(disposition.includeInM035ScopedRate, true);
}

const ordinary = classifyM035ComparisonScope({ family: 'bend', nodeId: '20300' });
assert.equal(ordinary.scope, 'M035_IN_SCOPE');
assert.equal(ordinary.includeInM035ScopedRate, true);

console.log(JSON.stringify({
  check: 'm035-bm4-scope-isolation',
  status: 'PASS',
  nonlinearSupportOwner: M035_SCOPE_POLICY.nonlinearSupportOwner,
  unilateralSupportNodeIds: M036_UNILATERAL_SUPPORT_NODE_IDS,
  bendScoringExcludedNodeIds: M035_BEND_SCORING_EXCLUDED_NODE_IDS,
  crossEffectWatchNodeIds: M036_CROSS_EFFECT_WATCH_NODE_IDS,
  solverMutation: false,
}, null, 2));
console.log('M035 BM4 scope isolation PASS');
