import assert from 'node:assert/strict';
import { canonicalStringify } from '../src/core/shared-piping-model/index.js';
import {
  IMPORT_FIDELITY, SKETCHER_EVENTS, SketcherDraftAuthority,
  createSketcherWorkspacePackage, importWorkspaceGeometryToSketcher,
  parseSketcherDraftJson, serializeSketcherDraft,
} from '../src/core/sketcher-draft/index.js';
import { SketcherController } from '../src/workspace/sketcher-controller.js';
import { EVENT_TOPICS } from '../src/workspace/event-topics.js';
import { qualifySketcherWorkspaceAdoption } from '../src/workspace/sketcher-workspace-adapter.js';

function TestBus(){this.listeners=new Map();this.events=[];}
TestBus.prototype.subscribe=function(topic,callback){const rows=this.listeners.get(topic)||new Set();rows.add(callback);this.listeners.set(topic,rows);return()=>rows.delete(callback);};
TestBus.prototype.publish=function(topic,payload){this.events.push({topic,payload});[...(this.listeners.get(topic)||[])].forEach((callback)=>callback(payload));};
TestBus.prototype.count=function(topic){return this.events.filter((row)=>row.topic===topic).length;};

const full = importWorkspaceGeometryToSketcher({ sharedModel: sharedModel(false), topologyGraph: topologyGraph(), currentDraftId:'draft-001', revision:1 });
const repeated = importWorkspaceGeometryToSketcher({ sharedModel: sharedModel(false), topologyGraph: topologyGraph(), currentDraftId:'draft-001', revision:1 });
assert.equal(full.fidelity, IMPORT_FIDELITY.FULL_FIDELITY);
assert.equal(canonicalStringify(full), canonicalStringify(repeated));
assert.equal(full.document.nodes.length, 3);
assert.equal(full.document.segments.length, 2);
assert.equal(full.document.segments[0].endNodeId, full.document.segments[1].startNodeId);
const lossy = importWorkspaceGeometryToSketcher({ sharedModel: sharedModel(true), topologyGraph: topologyGraph(), currentDraftId:'draft-001', revision:1 });
assert.equal(lossy.fidelity, IMPORT_FIDELITY.PARTIAL_WITH_DIAGNOSTICS);
assert.ok(lossy.diagnostics.some((row) => row.code === 'UNSUPPORTED_WORKSPACE_ENTITY'));
assert.throws(() => createSketcherWorkspacePackage(lossy.document), /FULL_FIDELITY/);
const noTopology = importWorkspaceGeometryToSketcher({ sharedModel: sharedModel(false), topologyGraph:null, currentDraftId:'draft-001', revision:1 });
assert.equal(noTopology.fidelity, IMPORT_FIDELITY.PARTIAL_WITH_DIAGNOSTICS);
assert.equal(noTopology.document.nodes.length, 4);
const json = serializeSketcherDraft(full.document);
assert.equal(parseSketcherDraftJson(json).semanticHash, full.document.semanticHash);

const authority = draftAuthority();
const qualified = qualifySketcherWorkspaceAdoption(authority.getDocument());
assert.equal(qualified.adoption.qualification, 'QUALIFIED');
assert.equal(qualified.adoption.normalizedPipeCount, authority.getDocument().segments.length);
assert.equal(qualified.normalizedDataset.summary.pipes, authority.getDocument().segments.length);
assert.equal(qualified.packageJson.schema, 'inputxml-managed-stage/v1');
assert.equal(canonicalStringify(qualified.packageJson), canonicalStringify(qualifySketcherWorkspaceAdoption(authority.getDocument()).packageJson));

const bus = new TestBus();
const controller = new SketcherController(null, () => ({ contracts:{} }), bus);
controller.init();
const emptyHash = controller.getDocument().semanticHash;
bus.publish(SKETCHER_EVENTS.ADOPTION_REQUESTED, {});
assert.equal(bus.count(EVENT_TOPICS.DATASET_LOAD_REQUESTED), 0);
assert.equal(controller.getDocument().semanticHash, emptyHash);
bus.publish(SKETCHER_EVENTS.COMMAND_REQUESTED, { commandType:'ADD_PIPE_SEGMENT', payload:{ start:{xMm:0,yMm:0,zMm:0}, end:{xMm:1000,yMm:0,zMm:0} } });
bus.publish(SKETCHER_EVENTS.COMMAND_REQUESTED, { commandType:'ADD_PIPE_SEGMENT', payload:{ start:{nodeId:'N002'}, end:{xMm:1000,yMm:1000,zMm:0} } });
const draftHash = controller.getDocument().semanticHash;
bus.publish(SKETCHER_EVENTS.ADOPTION_REQUESTED, {});
assert.equal(bus.count(EVENT_TOPICS.DATASET_LOAD_REQUESTED), 1);
assert.equal(bus.count(EVENT_TOPICS.ANALYSIS_REQUESTED), 0);
assert.equal(bus.count(EVENT_TOPICS.ANALYSIS_EXPORT_REQUESTED), 0);
assert.equal(controller.getDocument().semanticHash, draftHash);
bus.publish(EVENT_TOPICS.DATASET_LOAD_FAILED, { message:'synthetic load rejection', sourceName:'draft.json' });
assert.equal(controller.getDocument().semanticHash, draftHash);
assert.equal(controller.getAdoption(), null);
controller.destroy();
console.log('✅ W10.R4 Workspace import, loss evidence, JSON round-trip and explicit adoption properties passed.');

function draftAuthority() {
  const authority = new SketcherDraftAuthority();
  authority.execute(authority.createCommand('ADD_PIPE_SEGMENT', { start:{xMm:0,yMm:0,zMm:0}, end:{xMm:1000,yMm:0,zMm:0} }));
  authority.execute(authority.createCommand('ADD_PIPE_SEGMENT', { start:{nodeId:'N002'}, end:{xMm:1000,yMm:1000,zMm:0} }));
  return authority;
}
function sharedModel(includeUnsupported) {
  const components = [
    { componentKey:'PIPE-A',type:'PIPE',geometry:{start:{x:0,y:0,z:0},end:{x:1000,y:0,z:0}} },
    { componentKey:'PIPE-B',type:'PIPE',geometry:{start:{x:1000,y:0,z:0},end:{x:1000,y:1000,z:0}} },
  ];
  if (includeUnsupported) components.push({ componentKey:'VALVE-A',type:'VALVE',geometry:{start:{x:1000,y:1000,z:0},end:{x:1200,y:1000,z:0}} });
  return { schema:'shared-piping-model/v1',project:{datasetId:'workspace-fixture'},semanticHash:'fnv1a64:3333333333333333',components };
}
function topologyGraph() {
  const ports = ['PIPE-A:port:start','PIPE-A:port:end','PIPE-B:port:start','PIPE-B:port:end'].map((portKey) => ({ portKey }));
  return { schema:'piping-port-topology-graph/v1',ports,connections:[{portAKey:'PIPE-A:port:end',portBKey:'PIPE-B:port:start'}] };
}
