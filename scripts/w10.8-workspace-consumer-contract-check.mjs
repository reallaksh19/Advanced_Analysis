import assert from 'node:assert/strict';
import {
  CONSUMER_IDS, createApplicationViewState, createWorkspaceConsumerContext,
  createWorkspaceConsumerReadiness, createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistry, IMPLEMENTATION_STATUS, READINESS_STATES,
  refreshApplicationViewState, transitionApplicationViewState,
  validateApplicationViewState, validateWorkspaceConsumerContext,
  validateWorkspaceConsumerReadiness, validateWorkspaceConsumerReadinessShape,
  validateWorkspaceConsumerRegistry, workspaceConsumerDescriptor,
} from '../src/core/workspace-consumers/index.js';
import { deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import { renderReportsConsumer } from '../src/workspace/reports-consumer-controller.js';
import { APPLICATION_EVENTS, assertEventPayload } from '../src/workspace/event-topics.js';
import { buildWorkspaceConsumerFixture } from './w10.8-fixtures.mjs';

const checks={context:checkContexts,registry:checkRegistry,readiness:checkReadiness,views:checkViews,events:checkEvents,reports:checkReports,immutability:checkImmutability};
const selected=process.argv[2];
console.log(`\n--- W10.8 ${selected||'workspace consumer contracts'} ---\n`);
if(selected)run(selected);else Object.keys(checks).forEach(run);
console.log('✅ W10.8 workspace consumer contracts passed.\n');
function run(name){if(!checks[name])throw new TypeError(`Unknown W10.8 contract check: ${name}.`);checks[name]();}

function checkContexts(){
  const empty=createWorkspaceConsumerContext({workspaceVersion:0});
  assert.equal(validateWorkspaceConsumerContext(empty).ok,true);
  assert.ok(Object.values(empty.contracts).every((value)=>value===null));
  assert.throws(()=>createWorkspaceConsumerContext({datasetId:{},workspaceVersion:0}),/datasetId/);
  assert.throws(()=>createWorkspaceConsumerContext({workspaceVersion:0,selectedEntityId:{}}),/selectedEntityId/);
  assert.throws(()=>createWorkspaceConsumerContext({workspaceVersion:-1}),/workspaceVersion/);
  const fixture=buildWorkspaceConsumerFixture(),full=contextFor(fixture);
  assert.equal(validateWorkspaceConsumerContext(full).ok,true);
  assert.equal(full.availabilitySummary.availableContractKeys.length,20);
  Object.entries(fixture.contracts).forEach(([key,value])=>assert.equal(full.contracts[key],value));
  assert.equal(contextFor(fixture,{},'COMP-2').contextId,full.contextId);
  assert.equal(contextFor(fixture,{},'COMP-2').semanticHash,full.semanticHash);
  const stale=contextFor(fixture,{topologyGraph:staleTopology(fixture.contracts.topologyGraph)});
  assert.equal(stale.contracts.topologyGraph,null);
  assert.ok(stale.diagnostics.some((row)=>row.contractKey==='topologyGraph'));
  assert.equal(validateWorkspaceConsumerContext(stale).ok,true);
  const other=buildWorkspaceConsumerFixture({datasetId:'W10.8-OTHER'});
  const mixed=contextFor(fixture,{topologyGraph:other.contracts.topologyGraph});
  assert.equal(mixed.contracts.topologyGraph,null);
  assert.ok(mixed.diagnostics.some((row)=>row.code==='DATASET_MISMATCH'));
  rejectsContext(full,(copy)=>{copy.contracts.sharedModel.project.name='tampered';});
  rejectsContext(full,(copy)=>{copy.contractReferences[0].semanticHash='fnv1a64:forged';});
  rejectsContext(full,(copy)=>{copy.contractReferences[0].availability='UNAVAILABLE';});
  rejectsContext(full,(copy)=>{copy.availabilitySummary.availableContractKeys.pop();});
  rejectsContext(full,(copy)=>{copy.diagnostics.push({code:'INVALID_CONTRACT',severity:'ERROR',contractKey:'sharedModel',message:'forged'});});
  rejectsContext(full,(copy)=>{copy.contracts.topologyGraph=staleTopology(copy.contracts.topologyGraph);copy.contractReferences[1].semanticHash=copy.contracts.topologyGraph.semanticHash;});
  rejectsContext(full,(copy)=>{copy.contracts.topologyGraph=structuredClone(other.contracts.topologyGraph);copy.contractReferences[1].semanticHash=copy.contracts.topologyGraph.semanticHash;});
  rejectsContext(full,(copy)=>{delete copy.contracts.sharedModel;});
  rejectsContext(full,(copy)=>{copy.contractReferences.reverse();});
  rejectsContext(full,(copy)=>{copy.selectedEntityId={forged:true};});
  rejectsContext(full,(copy)=>{copy.selectedEntityId=' COMP-1 ';});
  rejectsContext(full,(copy)=>{delete copy.selectedEntityId;});
  rejectsContext(full,(copy)=>{copy.datasetId=' '+copy.datasetId;});
  const badId=structuredClone(full);badId.contextId='workspace-consumer-context:forged';assert.equal(validateWorkspaceConsumerContext(badId).ok,false);
  const badHash=structuredClone(full);badHash.semanticHash='fnv1a64:forged';assert.equal(validateWorkspaceConsumerContext(badHash).ok,false);
}
function checkRegistry(){
  const registry=createWorkspaceConsumerRegistry();
  assert.equal(validateWorkspaceConsumerRegistry(registry).ok,true);
  assert.equal(workspaceConsumerDescriptor(registry,CONSUMER_IDS.WORKSPACE).implementationStatus,IMPLEMENTATION_STATUS.IMPLEMENTED);
  [CONSUMER_IDS.LOAD_CALC,CONSUMER_IDS.THREE_D_CALC,CONSUMER_IDS.PIPE_SOLVER,CONSUMER_IDS.QA,CONSUMER_IDS.DEBUG].forEach((id)=>assert.equal(workspaceConsumerDescriptor(registry,id).implementationStatus,IMPLEMENTATION_STATUS.NOT_IMPLEMENTED));
  registryMutationRejected(registry,(copy)=>{copy.consumers.find((row)=>row.consumerId===CONSUMER_IDS.PIPE_SOLVER).implementationStatus=IMPLEMENTATION_STATUS.IMPLEMENTED;});
  registryMutationRejected(registry,(copy)=>{copy.consumers.pop();});
  registryMutationRejected(registry,(copy)=>{copy.consumers.push(structuredClone(copy.consumers[0]));});
  registryMutationRejected(registry,(copy)=>{copy.consumers[0].consumerId='UNKNOWN';});
  registryMutationRejected(registry,(copy)=>{copy.consumers[0].requiredContractKeys.push(copy.consumers[0].optionalContractKeys[0]);});
  registryMutationRejected(registry,(copy)=>{copy.consumers[0].requiredContractKeys.push('UNKNOWN_CONTRACT');});
  registryMutationRejected(registry,(copy)=>{copy.consumers[0].allowedActions.push('RUN_SOLVER');});
  registryMutationRejected(registry,(copy)=>{copy.consumers[0].purpose='';});
  registryMutationRejected(registry,(copy)=>{copy.consumers[0].engineeringClaimPolicy='';});
  registryMutationRejected(registry,(copy)=>{copy.consumers.reverse();});
  assert.throws(()=>workspaceConsumerDescriptor(registry,'UNKNOWN'),/Unknown workspace consumer/);
}
function checkReadiness(){
  const registry=createWorkspaceConsumerRegistry(),empty=createWorkspaceConsumerContext({workspaceVersion:0});
  const blocked=createWorkspaceConsumerReadiness(registry,empty,CONSUMER_IDS.REPORTS,{workspaceBooted:true});
  assert.equal(blocked.readinessState,READINESS_STATES.BLOCKED_MISSING_CONTRACTS);
  assert.equal(validateWorkspaceConsumerReadiness(blocked,registry,empty,{workspaceBooted:true}).ok,true);
  const fixture=buildWorkspaceConsumerFixture(),full=contextFor(fixture);
  const available=createWorkspaceConsumerReadiness(registry,full,CONSUMER_IDS.REPORTS,{workspaceBooted:true});
  assert.equal(available.readinessState,READINESS_STATES.AVAILABLE);
  readinessMutationRejected(available,registry,full,(copy)=>{copy.readinessState=READINESS_STATES.NOT_IMPLEMENTED;});
  readinessMutationRejected(available,registry,full,(copy)=>{copy.missingRequiredContractKeys=['modelCalculationLedger'];});
  readinessMutationRejected(available,registry,full,(copy)=>{copy.contextSemanticHash='fnv1a64:wrong';});
  readinessMutationRejected(available,registry,full,(copy)=>{copy.blockers=['MISSING_CONTRACT:modelCalculationLedger'];});
  readinessMutationRejected(available,registry,full,(copy)=>{copy.diagnostics=[{code:'forged',severity:'INFO',contractKey:null,message:'forged'}];});
  const noContextHash=structuredClone(available);noContextHash.contextSemanticHash='';rehashReadiness(noContextHash);
  assert.equal(validateWorkspaceConsumerReadinessShape(noContextHash).ok,false);
  const future=createWorkspaceConsumerReadiness(registry,full,CONSUMER_IDS.PIPE_SOLVER,{workspaceBooted:true});
  assert.equal(future.readinessState,READINESS_STATES.NOT_IMPLEMENTED);
  readinessMutationRejected(future,registry,full,(copy)=>{copy.readinessState=READINESS_STATES.AVAILABLE;copy.blockers=[];copy.diagnostics=[];});
}
function checkViews(){
  const registry=createWorkspaceConsumerRegistry(),empty=createWorkspaceConsumerContext({workspaceVersion:0});
  const emptyRows=readinessRows(registry,empty),initial=createApplicationViewState(emptyRows);
  assert.equal(validateApplicationViewState(initial).ok,true);
  const blocked=transitionApplicationViewState(initial,CONSUMER_IDS.REPORTS,emptyRows);
  assert.equal(blocked.activated,false);assert.equal(blocked.state,initial);assert.equal(blocked.state.version,initial.version);
  const fixture=buildWorkspaceConsumerFixture(),fullRows=readinessRows(registry,contextFor(fixture));
  const reports=transitionApplicationViewState(initial,CONSUMER_IDS.REPORTS,fullRows);
  assert.equal(reports.activated,true);assert.equal(reports.state.activeViewId,CONSUMER_IDS.REPORTS);
  const forged=structuredClone(initial);forged.activeViewId=CONSUMER_IDS.REPORTS;assert.equal(validateApplicationViewState(forged).ok,false);
  const mixedRows=structuredClone(fullRows),mixedReport=mixedRows.find((row)=>row.consumerId===CONSUMER_IDS.REPORTS);
  mixedReport.contextSemanticHash='fnv1a64:mixed-context';rehashReadiness(mixedReport);
  assert.throws(()=>createApplicationViewState(mixedRows),/one consumer context/);
  const mixedState=structuredClone(reports.state);
  mixedState.viewReadiness.REPORTS.contextSemanticHash='fnv1a64:mixed-context';rehashReadiness(mixedState.viewReadiness.REPORTS);
  assert.equal(validateApplicationViewState(mixedState).ok,false);
  const replacement=createWorkspaceConsumerContext({datasetId:fixture.contracts.sharedModel.project.datasetId,workspaceVersion:2});
  const reset=refreshApplicationViewState(reports.state,readinessRows(registry,replacement));
  assert.equal(reset.activeViewId,CONSUMER_IDS.WORKSPACE);assert.equal(reset.version,reports.state.version+1);
}
function checkEvents(){
  const fixture=buildWorkspaceConsumerFixture(),context=contextFor(fixture),registry=createWorkspaceConsumerRegistry();
  const readiness=readinessRows(registry,context),state=createApplicationViewState(readiness);
  assert.doesNotThrow(()=>assertEventPayload(APPLICATION_EVENTS.CHANGE_REQUESTED,{viewId:'REPORTS',source:'api'}));
  assert.throws(()=>assertEventPayload(APPLICATION_EVENTS.CHANGE_REQUESTED,{viewId:'UNKNOWN',source:'api'}));
  assert.throws(()=>assertEventPayload(APPLICATION_EVENTS.CHANGE_REQUESTED,{viewId:'REPORTS',source:'test'}));
  assert.doesNotThrow(()=>assertEventPayload(APPLICATION_EVENTS.CHANGED,{state,previousViewId:'WORKSPACE',reason:'api'}));
  assert.throws(()=>assertEventPayload(APPLICATION_EVENTS.CHANGED,{previousViewId:'WORKSPACE',reason:'api'}));
  assert.doesNotThrow(()=>assertEventPayload(APPLICATION_EVENTS.CHANGE_FAILED,{viewId:'LOAD_CALC',activeViewId:'WORKSPACE',code:'VIEW_NOT_IMPLEMENTED',message:'Unavailable'}));
  assert.throws(()=>assertEventPayload(APPLICATION_EVENTS.CHANGE_FAILED,{viewId:'LOAD_CALC',activeViewId:'WORKSPACE',code:'',message:''}));
  assert.doesNotThrow(()=>assertEventPayload(APPLICATION_EVENTS.CONTEXT_CHANGED,{context,readiness,reason:'test'}));
  assert.throws(()=>assertEventPayload(APPLICATION_EVENTS.CONTEXT_CHANGED,{context,readiness:[],reason:'test'}));
  assert.throws(()=>assertEventPayload(APPLICATION_EVENTS.CONTEXT_CHANGED,{context:{...context,semanticHash:'bad'},readiness,reason:'test'}));
}
function checkReports(){
  const fixture=buildWorkspaceConsumerFixture({datasetId:'W10.8-<img src=x onerror=alert(1)>'});
  const context=contextFor(fixture),registry=createWorkspaceConsumerRegistry();
  const readiness=createWorkspaceConsumerReadiness(registry,context,CONSUMER_IDS.REPORTS,{workspaceBooted:true});
  const element={className:'',dataset:{},innerHTML:''};
  const view=renderReportsConsumer({createElement:()=>element},context,readiness,{message:'<script>boom()</script>'});
  assert.equal(view.innerHTML.includes('<script>'),false);
  assert.equal(view.innerHTML.includes('<img src=x'),false);
  assert.match(view.innerHTML,/&lt;script&gt;boom\(\)&lt;\/script&gt;/);
}
function checkImmutability(){
  const fixture=buildWorkspaceConsumerFixture(),context=contextFor(fixture),registry=createWorkspaceConsumerRegistry();
  assertDeepFrozen(context);assertDeepFrozen(registry);assertDeepFrozen(readinessRows(registry,context));assertDeepFrozen(createApplicationViewState(readinessRows(registry,context)));
  assert.equal(context.contracts.sharedModel,fixture.contracts.sharedModel);
}
function contextFor(fixture,overrides={},selectedEntityId='COMP-1'){return createWorkspaceConsumerContext({datasetId:fixture.contracts.sharedModel.project.datasetId,workspaceVersion:1,selectedEntityId,contracts:{...fixture.contracts,...overrides}});}
function readinessRows(registry,context){return createWorkspaceConsumerReadinessRegistry(registry,context,{workspaceBooted:true});}
function staleTopology(graph){const{semanticHash:_hash,...base}=structuredClone(graph);const stale={...base,sharedModelSemanticHash:'fnv1a64:stale'};return deepFreeze({...stale,semanticHash:semanticHash(stale)});}
function rejectsContext(value,mutate){const copy=structuredClone(value);mutate(copy);rehashContext(copy);assert.equal(validateWorkspaceConsumerContext(copy).ok,false);}
function rehashContext(copy){const identity={schema:copy.schema,datasetId:copy.datasetId,contractReferences:copy.contractReferences,availabilitySummary:copy.availabilitySummary,diagnostics:copy.diagnostics};copy.contextId=`workspace-consumer-context:${semanticHash(identity).split(':')[1]}`;copy.semanticHash=semanticHash({...identity,contextId:copy.contextId});}
function registryMutationRejected(value,mutate){const copy=structuredClone(value);mutate(copy);const{semanticHash:_hash,...base}=copy;copy.semanticHash=semanticHash(base);assert.equal(validateWorkspaceConsumerRegistry(copy).ok,false);}
function readinessMutationRejected(value,registry,context,mutate){const copy=structuredClone(value);mutate(copy);rehashReadiness(copy);assert.equal(validateWorkspaceConsumerReadiness(copy,registry,context,{workspaceBooted:true}).ok,false);}
function rehashReadiness(copy){const{semanticHash:_hash,...base}=copy;copy.semanticHash=semanticHash(base);}
function assertDeepFrozen(value,seen=new WeakSet()){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);assert.equal(Object.isFrozen(value),true);Object.values(value).forEach((child)=>assertDeepFrozen(child,seen));}
