import assert from 'node:assert/strict';
import test from 'node:test';
import { createTopologyEditEditorStore } from '../src/workspace/topology-edit/editor-state/topology-edit-editor-store.js';
import { TopologyEditSelectionCoordinator } from '../src/workspace/topology-edit/editor-state/topology-edit-selection-coordinator.js';
import { createTopologyEditSelectionRequest, TOPOLOGY_EDIT_SELECTION_EVENTS } from '../src/workspace/topology-edit/editor-state/topology-edit-selection-events.js';

class Bus{
  constructor(){this.map=new Map();this.published=[];}
  subscribe(topic,fn){const rows=this.map.get(topic)??new Set();rows.add(fn);this.map.set(topic,rows);return()=>rows.delete(fn);}
  publish(topic,payload){this.published.push({topic,payload});for(const fn of this.map.get(topic)??[])fn(payload);}
}
const topology={
  nodes:[{id:'node:a',portKeys:['P-001:port:start']},{id:'node:b',portKeys:['P-002:port:start']}],
  edges:[{id:'edge:P-001',componentKey:'P-001',fromNodeId:'node:a',toNodeId:'node:b'}],
  supports:[{id:'support:S-001',entityId:'S-001',nodeId:'node:a'}],
  junctions:[],boundaries:[],rigids:[],bends:[],
};

test('tree workspace request resolves to canonical selection and publishes projection',()=>{
  const store=createTopologyEditEditorStore({dataset:{sourceHash:'s',canonicalHash:'c',sessionVersion:1}});
  const bus=new Bus();
  const coordinator=new TopologyEditSelectionCoordinator({store,eventBus:bus,getTopology:()=>topology});
  coordinator.connect();
  bus.publish(TOPOLOGY_EDIT_SELECTION_EVENTS.REQUESTED,createTopologyEditSelectionRequest({action:'REPLACE',source:'tree',workspaceEntityIds:['P-001']}));
  assert.deepEqual(store.getState().selection.canonicalIds,['edge:P-001']);
  const changed=bus.published.filter((row)=>row.topic===TOPOLOGY_EDIT_SELECTION_EVENTS.CHANGED).at(-1);
  assert.deepEqual(changed.payload.workspaceEntityIds,['P-001']);
  coordinator.disconnect();
});

test('viewport additive selection uses the same store authority',()=>{
  const store=createTopologyEditEditorStore();
  const bus=new Bus();
  const coordinator=new TopologyEditSelectionCoordinator({store,eventBus:bus,getTopology:()=>topology});
  coordinator.selectPick({objectId:'node:a',objectKind:'node'},{});
  coordinator.selectPick({objectId:'node:b',objectKind:'node'},{shiftKey:true});
  assert.deepEqual(store.getState().selection.canonicalIds,['node:a','node:b']);
  assert.equal(store.getState().selection.revision,2);
});
