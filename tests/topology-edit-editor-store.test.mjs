import assert from 'node:assert/strict';
import test from 'node:test';
import { createTopologyEditEditorStore } from '../src/workspace/topology-edit/editor-state/topology-edit-editor-store.js';

function store(){return createTopologyEditEditorStore({dataset:{sourceHash:'source:a',canonicalHash:'canonical:a',sessionVersion:1}});}

test('semantic changes increment revision while source-only changes do not',()=>{
  const value=store();
  value.getState().actions.replaceSelection(['node:b','node:a'],'viewport',{primaryId:'node:b',anchorId:'node:a'});
  assert.equal(value.getState().selection.revision,1);
  value.getState().actions.replaceSelection(['node:a','node:b'],'tree',{primaryId:'node:b',anchorId:'node:a'});
  assert.equal(value.getState().selection.revision,1);
  assert.equal(value.getState().selection.source,'tree');
});

test('add toggle range remove and clear remain deterministic',()=>{
  const value=store();
  value.getState().actions.replaceSelection(['node:b'],'tree');
  value.getState().actions.addSelection(['node:a'],'tree',{primaryId:'node:a'});
  assert.deepEqual(value.getState().selection.canonicalIds,['node:a','node:b']);
  value.getState().actions.toggleSelection('node:b','tree');
  assert.deepEqual(value.getState().selection.canonicalIds,['node:a']);
  value.getState().actions.rangeSelection('node:a','node:c','tree',['node:a','node:b','node:c']);
  assert.deepEqual(value.getState().selection.canonicalIds,['node:a','node:b','node:c']);
  value.getState().actions.removeSelection(['node:b'],'tree');
  assert.deepEqual(value.getState().selection.canonicalIds,['node:a','node:c']);
  value.getState().actions.clearSelection('tree');
  assert.deepEqual(value.getState().selection.canonicalIds,[]);
});

test('transaction receipt remaps and removes selected IDs',()=>{
  const value=store();
  value.getState().actions.replaceSelection(['edge:old','node:removed'],'viewport',{primaryId:'edge:old',anchorId:'node:removed'});
  value.getState().actions.reconcileSelection({replacedIds:{'edge:old':'edge:new'},removedIds:['node:removed']});
  assert.deepEqual(value.getState().selection.canonicalIds,['edge:new']);
  assert.equal(value.getState().selection.primaryId,'edge:new');
  assert.equal(value.getState().selection.anchorId,'edge:new');
});

test('dataset replacement clears and stale requests are rejected',()=>{
  const value=store();
  value.getState().actions.replaceSelection(['node:a'],'viewport');
  const stale=value.getState().actions.applySelectionRequest({action:'REPLACE',canonicalIds:['node:b'],source:'tree',expectedDatasetSessionVersion:2});
  assert.equal(stale.disposition,'STALE');
  assert.deepEqual(value.getState().selection.canonicalIds,['node:a']);
  value.getState().actions.replaceDatasetIdentity({sourceHash:'source:b',canonicalHash:'canonical:b',sessionVersion:2});
  assert.deepEqual(value.getState().selection.canonicalIds,[]);
});

test('identical dataset identity does not publish a new store state',()=>{
  const value=store();
  let notifications=0;
  const unsubscribe=value.subscribe(()=>{notifications+=1;});
  value.getState().actions.replaceDatasetIdentity({sourceHash:'source:a',canonicalHash:'canonical:a',sessionVersion:1});
  value.getState().actions.updateCanonicalIdentity('canonical:a');
  unsubscribe();
  assert.equal(notifications,0);
});
