#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import {
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_WORKBENCH_STATE_SCHEMA,
  createLafeaArtifactRecord,
  createLafeaLifecycleEvent,
  createLafeaWorkbenchStore,
} from '../src/workspace/lafea-workbench.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stageId = 'LAFEA.3';
const sourceHashA = 'sha256:u3b-source-A';
const sourceHashB = 'sha256:u3b-source-B';

const rejectedImportStore = createLafeaWorkbenchStore({ initialStage: 'LAFEA.1' });
rejectedImportStore.importDocument(null, 'LAFEA.1', 'sha256:must-not-bind');
assert.equal(rejectedImportStore.getState().status, 'FAILED');
assert.equal(rejectedImportStore.getState().stages['LAFEA.1'].lifecycle, null);
assert.equal(
  rejectedImportStore.getState().stages['LAFEA.1'].lifecycleBinding.status,
  'UNINITIALIZED',
);

const store = createLafeaWorkbenchStore({
  initialStage: stageId,
  initialDocument: continuumFixture(),
});

let state = store.getState();
let stage = state.stages[stageId];
assert.equal(state.schema, LAFEA_WORKBENCH_STATE_SCHEMA);
assert.equal(stage.lifecycle, null);
assert.equal(stage.lifecycleBinding.schema, LAFEA_LIFECYCLE_BINDING_SCHEMA);
assert.equal(stage.lifecycleBinding.status, 'UNINITIALIZED');
assert.equal(stage.lifecycleReadiness.lifecycleInitialized, false);
assert.equal(stage.lifecycleReadiness.resultReady, false);
assert.deepEqual(stage.lifecycleReadiness.blockingReasons, ['LIFECYCLE_NOT_INITIALIZED']);
assert.ok(Object.isFrozen(state));
assert.ok(Object.isFrozen(stage.lifecycleBinding));

store.initializeLifecycle(sourceHashA, 'U3B-CHECK/SOURCE');
state = store.getState();
stage = state.stages[stageId];
assert.equal(stage.lifecycle.source.sourceHash, sourceHashA);
assert.equal(stage.lifecycleBinding.status, 'CURRENT');
assert.equal(stage.lifecycleReadiness.lifecycleInitialized, true);
assert.equal(stage.lifecycleReadiness.modelCurrent, false);

const modelRecord = createLafeaArtifactRecord({
  stageId,
  kind: 'CANONICAL_MODEL',
  status: 'CURRENT',
  artifactHash: 'sha256:u3b-model-A',
  parentHashes: { sourceHash: sourceHashA },
  qualification: 'PASS',
  producerRef: 'U3B-CHECK/MODEL/v1',
  diagnostics: [],
});
store.registerLifecycleArtifact(modelRecord, 'U3B-REG-MODEL-A');
state = store.getState();
stage = state.stages[stageId];
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'CURRENT');
assert.equal(stage.lifecycleReadiness.modelCurrent, true);

const nodeB = stage.document.nodes.find((row) => row.nodeId === 'B');
store.setScalar('LAFEA.3.node.x', 'B', String(nodeB.x + 25), 'U3B_CHECK');
state = store.getState();
stage = state.stages[stageId];
assert.equal(stage.lifecycleBinding.status, 'STALE_DOCUMENT_REVISION');
assert.equal(stage.lifecycleReadiness.sourceCurrent, false);
assert.equal(stage.lifecycleReadiness.modelCurrent, false);
assert.ok(stage.lifecycleReadiness.blockingReasons.includes(
  'LIFECYCLE_SOURCE_BINDING_STALE_DOCUMENT_REVISION',
));
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'CURRENT');

store.registerLifecycleArtifact(modelRecord, 'U3B-REG-MODEL-WHILE-STALE');
state = store.getState();
assert.equal(state.status, 'FAILED');
assert.ok(state.diagnostics.some((row) => row.code === 'LAFEA_LIFECYCLE_BINDING_NOT_CURRENT'));

store.applyLifecycleEvent(createLafeaLifecycleEvent({
  eventId: 'U3B-SOURCE-GEOMETRY-B',
  stageId,
  changeClass: 'GEOMETRY',
  previousSourceHash: sourceHashA,
  currentSourceHash: sourceHashB,
  profileHash: null,
  originRef: 'U3B-CHECK/GEOMETRY-EDIT',
}));
state = store.getState();
stage = state.stages[stageId];
assert.equal(stage.lifecycle.source.sourceHash, sourceHashB);
assert.equal(stage.lifecycleBinding.status, 'CURRENT');
assert.equal(stage.lifecycle.artifacts.CANONICAL_MODEL.status, 'STALE');
assert.equal(stage.lifecycleReadiness.modelCurrent, false);

const artifactSnapshot = structuredClone(stage.lifecycle.artifacts);
store.applyLifecycleEvent(createLafeaLifecycleEvent({
  eventId: 'U3B-DISPLAY-PALETTE',
  stageId,
  changeClass: 'CONTOUR_PALETTE',
  previousSourceHash: null,
  currentSourceHash: null,
  profileHash: 'sha256:u3b-palette-B',
  originRef: 'U3B-CHECK/DISPLAY',
}));
state = store.getState();
stage = state.stages[stageId];
assert.deepEqual(stage.lifecycle.artifacts, artifactSnapshot);
assert.equal(stage.lifecycle.display.contourPaletteHash, 'sha256:u3b-palette-B');
assert.equal(stage.lifecycleBinding.status, 'CURRENT');

store.run();
state = store.getState();
stage = state.stages[stageId];
assert.equal(stage.execution.status, 'QUALIFIED');
assert.equal(stage.lifecycle.artifacts.EXECUTION.status, 'ABSENT');
assert.equal(stage.lifecycleReadiness.resultReady, false);

store.undo();
assert.equal(store.getState().stages[stageId].lifecycleBinding.status, 'STALE_DOCUMENT_REVISION');
store.redo();
assert.equal(store.getState().stages[stageId].lifecycleBinding.status, 'REVALIDATION_REQUIRED');
store.revalidateLifecycleBinding(sourceHashB, 'U3B-CHECK/EXPLICIT-REVALIDATION');
assert.equal(store.getState().stages[stageId].lifecycleBinding.status, 'CURRENT');

const lifecycleExport = store.exportLifecycle();
assert.equal(lifecycleExport.schema, 'lafea-workbench-lifecycle-export/v1');
assert.equal(lifecycleExport.stageId, stageId);
assert.equal(lifecycleExport.binding.status, 'CURRENT');

const weldPlaceholder = {
  schema: 'lafea-weld-profile-placeholder/v1',
  identity: 'WELD-NOT-IMPLEMENTED',
};
store.importDocument(weldPlaceholder, 'LAFEA.6', 'sha256:u3b-weld-source');
assert.equal(store.getState().stages['LAFEA.6'].lifecycleBinding.status, 'CURRENT');
store.applyLifecycleEvent(createLafeaLifecycleEvent({
  eventId: 'U3B-WELD-DISPLAY',
  stageId: 'LAFEA.6',
  changeClass: 'CONTOUR_PALETTE',
  previousSourceHash: null,
  currentSourceHash: null,
  profileHash: 'sha256:u3b-weld-palette',
  originRef: 'U3B-CHECK/WELD-DISPLAY',
}));
assert.equal(
  store.getState().stages['LAFEA.6'].lifecycle.display.contourPaletteHash,
  'sha256:u3b-weld-palette',
);
store.applyLifecycleEvent(createLafeaLifecycleEvent({
  eventId: 'U3B-WELD-SOURCE-EDIT',
  stageId: 'LAFEA.6',
  changeClass: 'GEOMETRY',
  previousSourceHash: 'sha256:u3b-weld-source',
  currentSourceHash: 'sha256:u3b-weld-source-B',
  profileHash: null,
  originRef: 'U3B-CHECK/WELD-SOURCE',
}));
assert.ok(store.getState().diagnostics.some(
  (row) => row.code === 'LAFEA_LIFECYCLE_EDIT_NOT_AUTHORIZED',
));

const workspace = path.join(ROOT, 'src', 'workspace');
const read = (name) => fs.readFileSync(path.join(workspace, name), 'utf8');
const facadeSource = read('lafea-lifecycle-workbench-store.js');
const panelSource = read('lafea-lifecycle-panel.js');
const viewSource = read('lafea-workbench-view.js');
const controllerSource = read('lafea-workbench-controller.js');
const publicSource = read('lafea-workbench.js');

assert.match(facadeSource, /revision token only/u);
assert.match(facadeSource, /LAFEA_LIFECYCLE_BINDING_NOT_CURRENT/u);
assert.match(facadeSource, /baseState\.status !== 'FAILED'/u);
assert.doesNotMatch(facadeSource, /createLafeaArtifactRecord\([^)]*execution/u);
assert.match(panelSource, /not registered automatically as lifecycle evidence/u);
assert.doesNotMatch(panelSource, /\[PASS\]|qualified\s*=\s*true/u);
assert.match(viewSource, /Lifecycle and lineage evidence/u);
assert.match(controllerSource, /initializeLifecycle/u);
assert.match(controllerSource, /registerLifecycleArtifact/u);
assert.match(publicSource, /lafea-lifecycle-workbench-store\.js/u);
assert.doesNotMatch(publicSource, /lafea-templates/u);

console.log(JSON.stringify({
  check: 'lafea-u3b-live-lifecycle-integration',
  status: 'PASS',
  stateSchema: LAFEA_WORKBENCH_STATE_SCHEMA,
  lifecycleBindingSchema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
  rejectedImportCreatesLifecycleAuthority: false,
  sourceEditsStaleBinding: true,
  exactRevisionRestoreRequiresRevalidation: true,
  calculationAutoPromotesLifecycleEvidence: false,
  displayChangesInvalidateEngineeringEvidence: false,
  unsupportedStageEngineeringLifecycle: false,
}));
