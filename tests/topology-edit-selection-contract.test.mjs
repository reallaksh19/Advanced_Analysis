import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertTopologyEditCanonicalSelection,
  createTopologyEditCanonicalSelection,
  createTopologyEditSelectionFromLegacy,
  topologyEditLegacySelection,
} from '../src/workspace/topology-edit/editor-state/topology-edit-selection-contract.js';

test('selection normalizes duplicates and deterministic ordering',()=>{
  const value=createTopologyEditCanonicalSelection({canonicalIds:['node:b','node:a','node:b'],primaryId:'node:b',anchorId:'node:a',source:'tree',revision:2});
  assert.deepEqual(value.canonicalIds,['node:a','node:b']);
  assert.equal(value.primaryId,'node:b');
  assert.equal(value.anchorId,'node:a');
  assert.equal(assertTopologyEditCanonicalSelection(value).selectionHash,value.selectionHash);
});

test('legacy bridge preserves two-node anchor role',()=>{
  const value=createTopologyEditSelectionFromLegacy({nodeIds:['node:z','node:a'],edgeId:null},'command');
  assert.deepEqual(topologyEditLegacySelection(value),{nodeIds:['node:z','node:a'],edgeId:null});
});

test('primary and anchor must be selected',()=>{
  assert.throws(()=>createTopologyEditCanonicalSelection({canonicalIds:['node:a'],primaryId:'node:b'}),/included/);
});
