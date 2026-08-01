#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createLafeaLiveWorkbenchViewportModel,
} from '../src/workspace/lafea-live-workbench-viewport.js';
import {
  mountLafeaHybridResultViewport as mountInternalHybridResultViewport,
} from '../src/workspace/lafea-hybrid-result-viewport.js';
import {
  mountLafeaHybridResultViewport as mountPublicHybridResultViewport,
} from '../src/workspace/lafea-hybrid-result-viewport-public.js';
import * as publicSurface from '../src/workspace/lafea-workbench.js';
import {
  FakeDocument,
  fakeThree,
  u4gCurrentBinding,
  u4gDocument,
  u4gQualifiedLifecycle,
  u4gRenderPacket,
} from './lafea-u4g-fixtures.mjs';

const sceneRevision = 9;
const base = {
  stageId: 'LAFEA.3',
  document: u4gDocument(),
  lifecycle: u4gQualifiedLifecycle(),
  lifecycleBinding: u4gCurrentBinding(),
  sceneRevision,
  selection: null,
  cssWidth: 760,
  cssHeight: 440,
  devicePixelRatio: 1,
};
const readyModel = createLafeaLiveWorkbenchViewportModel({
  ...base,
  renderPacket: u4gRenderPacket(sceneRevision),
});
assert.equal(readyModel.mode, 'QUALIFIED_RESULT');

const documentRef = new FakeDocument();
const root = documentRef.createElement('div');
const THREE = fakeThree(true);
const selections = [];
const mounted = mountInternalHybridResultViewport(root, {
  stageId: 'LAFEA.3',
  sourceScene: readyModel.sourceModel.scene,
  intake: readyModel.intake,
  viewport: readyModel.resultViewport,
  selection: null,
  THREE,
  onSelectionChange: (selection) => selections.push(selection),
});
assert.equal(mounted.getState().status, 'READY');
assert.equal(mounted.getState().renderer, 'THREE_WEBGL');
assert.equal(mounted.getState().renderResult.fieldId, 'FIELD-U4G');
assert.equal(root.dataset.resultStatus, 'READY');
assert.equal(root.dataset.resultRenderer, 'THREE_WEBGL');
assert.equal(root.dataset.resultFieldId, 'FIELD-U4G');
assert.equal(root.children.length, 3);
assert.equal(root.children[0].dataset.layer, 'webgl');
assert.equal(root.children[1].dataset.layer, 'engineering-overlay');
assert.equal(root.children[2].dataset.layer, 'accessible-inspector');
assert.equal(root.children[0].dataset.ready, 'true');
assert.ok(root.children[1].querySelectorAll('[data-node-id]').length >= 3);

const initialRenderCount = THREE.lastRenderer.renderCount;
const nodeN2 = root.children[1].querySelectorAll('[data-node-id]')
  .find((node) => node.dataset.nodeId === 'N2');
nodeN2.dispatchEvent({ type: 'click' });
assert.equal(mounted.getSelection().sourceEntityId, 'N2');
assert.equal(mounted.getSelection().meshEntityId, null);
assert.equal(selections.at(-1).sourceEntityId, 'N2');
assert.ok(THREE.lastRenderer.renderCount > initialRenderCount);
assert.ok(root.children[1].querySelectorAll('[data-node-id]').some(
  (node) => node.dataset.nodeId === 'N2'
    && node.dataset.selected === 'true'
    && node.classList.contains('lafea-svg-highlighted'),
));
assert.throws(
  () => mounted.selectSource('UNKNOWN'),
  (error) => error.code === 'LAFEA_HYBRID_RESULT_SOURCE_SELECTION_INVALID',
);
mounted.clearSelection();
assert.equal(mounted.getSelection().sourceEntityId, null);

const canvas = root.children[0];
canvas.dispatchEvent({ type: 'webglcontextlost' });
assert.equal(mounted.getState().status, 'BLOCKED');
assert.equal(mounted.getState().renderer, 'SVG');
assert.ok(mounted.getState().blockingReasons.includes(
  'LAFEA_HYBRID_RESULT_WEBGL_CONTEXT_LOST',
));
assert.equal(canvas.dataset.ready, 'false');
assert.equal(canvas.hidden, true);
canvas.dispatchEvent({ type: 'webglcontextrestored' });
assert.ok(mounted.getState().blockingReasons.includes(
  'LAFEA_HYBRID_RESULT_RERENDER_REQUIRED',
));
assert.equal(mounted.refresh().status, 'READY');
assert.equal(canvas.dataset.ready, 'true');
assert.equal(canvas.hidden, false);

const unavailableRoot = new FakeDocument().createElement('div');
const unavailable = mountInternalHybridResultViewport(unavailableRoot, {
  stageId: 'LAFEA.3',
  sourceScene: readyModel.sourceModel.scene,
  intake: readyModel.intake,
  viewport: readyModel.resultViewport,
  selection: null,
  THREE: fakeThree(false),
});
assert.equal(unavailable.getState().status, 'BLOCKED');
assert.equal(unavailable.getState().renderer, 'SVG');
assert.ok(unavailable.getState().blockingReasons.includes(
  'LAFEA_HYBRID_RESULT_WEBGL_UNAVAILABLE',
));

const blockedModel = createLafeaLiveWorkbenchViewportModel({
  ...base,
  renderPacket: null,
});
const blockedRoot = new FakeDocument().createElement('div');
const blocked = mountInternalHybridResultViewport(blockedRoot, {
  stageId: 'LAFEA.3',
  sourceScene: blockedModel.sourceModel.scene,
  intake: blockedModel.intake,
  viewport: readyModel.resultViewport,
  selection: null,
  THREE: null,
});
assert.equal(blocked.getState().status, 'BLOCKED');
assert.equal(blocked.getState().renderer, 'SVG');
assert.ok(blocked.getState().blockingReasons.includes(
  'LAFEA_RENDER_PACKET_NOT_SUPPLIED',
));
assert.ok(blockedRoot.children[1].querySelectorAll('[data-node-id]').length >= 3);

assert.equal(publicSurface.mountLafeaHybridResultViewport, mountPublicHybridResultViewport);
const coordinatorSource = read('../src/workspace/lafea-hybrid-result-viewport.js');
const overlaySource = read('../src/workspace/lafea-canvas/source-overlay-adapter.js');
const liveViewSource = read('../src/workspace/lafea-workbench-view.js');
assert.match(coordinatorSource, /LAFEA_HYBRID_RESULT_WEBGL_UNAVAILABLE/u);
assert.match(coordinatorSource, /LAFEA_HYBRID_RESULT_RERENDER_REQUIRED/u);
assert.doesNotMatch(coordinatorSource, /stage\.execution|initializeLifecycle|registerLifecycleArtifact/u);
assert.doesNotMatch(coordinatorSource, /SVG_FALLBACK|CANVAS2D_FALLBACK|RASTER_WEBGL_CAPTURE/u);
assert.match(overlaySource, /renderLafeaWorkbenchSvg/u);
assert.doesNotMatch(liveViewSource, /mountLafeaHybridResultViewport/u);

blocked.destroy();
unavailable.destroy();
mounted.destroy();
assert.equal(root.children.length, 0);
assert.equal(root.dataset.resultStatus, 'DESTROYED');
assert.equal(root.dataset.resultRenderer, undefined);
assert.equal(root.dataset.resultFieldId, undefined);

console.log(JSON.stringify({
  check: 'lafea-u4f-hybrid-result-viewport',
  status: 'PASS',
  readyRenderer: 'THREE_WEBGL',
  blockedRenderer: 'SVG',
  sourceOverlayAlwaysVisible: true,
  exactSourceSelection: true,
  webglFallbackUsed: false,
  contextRestoreRequiresRefresh: true,
  liveWorkbenchMounted: false,
  numericalAuthorityChanged: false,
  lafea6Enabled: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
