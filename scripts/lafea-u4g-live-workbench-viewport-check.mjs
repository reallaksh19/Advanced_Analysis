#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  createLafeaLiveWorkbenchViewportModel,
  LAFEA_LIVE_WORKBENCH_VIEWPORT_MODES,
  mountLafeaLiveWorkbenchViewport,
} from '../src/workspace/lafea-live-workbench-viewport.js';
import {
  FakeDocument,
  U4G_LINEAGE,
  fakeThree,
  u4gCurrentBinding,
  u4gDocument,
  u4gQualifiedLifecycle,
  u4gRenderPacket,
  u4gStaleBinding,
} from './lafea-u4g-fixtures.mjs';

assert.deepEqual(LAFEA_LIVE_WORKBENCH_VIEWPORT_MODES, [
  'SOURCE_AUTHORING',
  'QUALIFIED_RESULT',
]);
assert.equal(Object.isFrozen(LAFEA_LIVE_WORKBENCH_VIEWPORT_MODES), true);

const lifecycle = u4gQualifiedLifecycle();
const binding = u4gCurrentBinding();
const baseInput = {
  stageId: 'LAFEA.3',
  document: u4gDocument(),
  lifecycle,
  lifecycleBinding: binding,
  sceneRevision: 7,
  selection: null,
  cssWidth: 760,
  cssHeight: 440,
  devicePixelRatio: 1,
};

const missingPacketModel = createLafeaLiveWorkbenchViewportModel({
  ...baseInput,
  renderPacket: null,
});
assert.equal(missingPacketModel.mode, 'SOURCE_AUTHORING');
assert.equal(missingPacketModel.intake.status, 'BLOCKED');
assert.ok(missingPacketModel.intake.blockingReasons.includes(
  'LAFEA_RENDER_PACKET_NOT_SUPPLIED',
));
assert.equal(missingPacketModel.resultViewport, null);

const sourceDocument = new FakeDocument();
const sourceRoot = sourceDocument.createElement('div');
const sourceSelections = [];
const sourceMounted = mountLafeaLiveWorkbenchViewport(sourceRoot, {
  ...baseInput,
  renderPacket: null,
  onSelectionChange: (selection) => sourceSelections.push(selection),
});
assert.equal(sourceMounted.getMode(), 'SOURCE_AUTHORING');
assert.equal(sourceMounted.getState().status, 'BLOCKED');
assert.equal(sourceMounted.getState().renderer, 'SVG');
assert.equal(sourceRoot.dataset.liveViewportMode, 'SOURCE_AUTHORING');
assert.ok(sourceRoot.querySelector('[data-role="lafea-live-result-blocked-status"]'));
assert.ok(sourceRoot.querySelectorAll('[data-node-id]').length >= 3);
sourceMounted.selectSource('N2');
assert.equal(sourceMounted.getSelection().sourceEntityId, 'N2');
assert.equal(sourceSelections.at(-1).sourceEntityId, 'N2');

const packet = u4gRenderPacket(7);
const readyModel = createLafeaLiveWorkbenchViewportModel({
  ...baseInput,
  renderPacket: packet,
});
assert.equal(readyModel.mode, 'QUALIFIED_RESULT');
assert.equal(readyModel.intake.status, 'READY');
assert.equal(readyModel.resultViewport.displayOptions.sourceAuthoring, false);
assert.deepEqual(
  readyModel.resultViewport.displayOptions.fieldBounds,
  packet.field.bounds,
);
assert.equal(
  readyModel.resultViewport.displayOptions.colorMapId,
  packet.field.colorMapId,
);
assert.deepEqual(
  readyModel.resultViewport.worldBounds,
  readyModel.sourceModel.viewport.worldBounds,
);

const resultDocument = new FakeDocument();
const resultRoot = resultDocument.createElement('div');
const THREE = fakeThree(true);
const resultMounted = mountLafeaLiveWorkbenchViewport(resultRoot, {
  ...baseInput,
  renderPacket: packet,
  THREE,
});
assert.equal(resultMounted.getMode(), 'QUALIFIED_RESULT');
assert.equal(resultMounted.getState().status, 'READY');
assert.equal(resultMounted.getState().renderer, 'THREE_WEBGL');
assert.equal(resultRoot.dataset.liveViewportMode, 'QUALIFIED_RESULT');
assert.equal(resultRoot.querySelector('[data-role="lafea-live-result-blocked-status"]'), null);
assert.equal(THREE.lastRenderer.renderCount, 1);
assert.deepEqual(Object.keys(resultMounted), [
  'schema', 'scene', 'getMode', 'getState', 'getSelection',
  'selectSource', 'clearSelection', 'refresh', 'destroy',
]);
assert.equal('model' in resultMounted, false);
assert.equal('intake' in resultMounted, false);
assert.equal('renderPacket' in resultMounted, false);
assert.equal('positions' in resultMounted, false);

const staleModel = createLafeaLiveWorkbenchViewportModel({
  ...baseInput,
  lifecycleBinding: u4gStaleBinding(),
  renderPacket: u4gRenderPacket(7),
});
assert.equal(staleModel.mode, 'SOURCE_AUTHORING');
assert.ok(staleModel.intake.blockingReasons.includes(
  'LAFEA_RENDER_LIFECYCLE_BINDING_STALE_DOCUMENT_REVISION',
));

const revisionMismatch = createLafeaLiveWorkbenchViewportModel({
  ...baseInput,
  renderPacket: u4gRenderPacket(6),
});
assert.equal(revisionMismatch.mode, 'SOURCE_AUTHORING');
assert.ok(revisionMismatch.intake.blockingReasons.includes(
  'LAFEA_RENDER_PACKET_SCENE_REVISION_MISMATCH',
));

const lafea6 = createLafeaLiveWorkbenchViewportModel({
  stageId: 'LAFEA.6',
  document: null,
  lifecycle: null,
  lifecycleBinding: null,
  sceneRevision: 1,
  renderPacket: null,
  selection: null,
  cssWidth: 760,
  cssHeight: 440,
  devicePixelRatio: 1,
});
assert.equal(lafea6.mode, 'SOURCE_AUTHORING');
assert.ok(lafea6.intake.blockingReasons.includes(
  'LAFEA_RENDER_STAGE_ENGINE_NOT_IMPLEMENTED',
));

packet.positions[0] = 99;
assert.equal(readyModel.intake.packet.positions[0], 0);
assert.equal(readyModel.sourceModel.scene.sourceSemanticHash, U4G_LINEAGE.sourceHash);

sourceMounted.destroy();
resultMounted.destroy();
assert.equal(sourceRoot.dataset.liveViewportMode, 'DESTROYED');
assert.equal(resultRoot.dataset.liveViewportMode, 'DESTROYED');

console.log(JSON.stringify({
  check: 'lafea-u4g-live-workbench-viewport',
  status: 'PASS',
  noPacketMode: 'SOURCE_AUTHORING',
  qualifiedRenderer: 'THREE_WEBGL',
  staleBindingFailsClosed: true,
  sceneRevisionMismatchFailsClosed: true,
  packetResealed: true,
  lafea6Enabled: false,
  numericalAuthorityChanged: false,
}));
