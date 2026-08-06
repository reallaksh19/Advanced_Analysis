import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOVERNED_SJSON_EDIT_DRAFT_SOURCE_HASHES,
  SJSON_BENCHMARK_SOURCE_HASH,
  TOPOLOGY_EDIT_20_ELEMENT_DEMO_SOURCE_HASH,
  isGovernedSjsonEditDraftSourceHash,
} from '../src/workspace/topology-edit/topology-edit-sjson-runtime-authority-v2.js';

test('governed edit-draft source authority accepts only exact qualified hashes', () => {
  assert.deepEqual(GOVERNED_SJSON_EDIT_DRAFT_SOURCE_HASHES, [
    SJSON_BENCHMARK_SOURCE_HASH,
    TOPOLOGY_EDIT_20_ELEMENT_DEMO_SOURCE_HASH,
  ]);
  assert.equal(Object.isFrozen(GOVERNED_SJSON_EDIT_DRAFT_SOURCE_HASHES), true);
  assert.equal(isGovernedSjsonEditDraftSourceHash(SJSON_BENCHMARK_SOURCE_HASH), true);
  assert.equal(isGovernedSjsonEditDraftSourceHash(TOPOLOGY_EDIT_20_ELEMENT_DEMO_SOURCE_HASH), true);
  assert.equal(isGovernedSjsonEditDraftSourceHash('fnv1a64:0000000000000000'), false);
  assert.equal(isGovernedSjsonEditDraftSourceHash(''), false);
  assert.equal(isGovernedSjsonEditDraftSourceHash(null), false);
});
