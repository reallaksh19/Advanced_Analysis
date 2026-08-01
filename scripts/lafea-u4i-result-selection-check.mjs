#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createLafeaResultSelectionAuthority } from '../src/workspace/lafea-canvas/result-selection-authority.js';
import {
  createLafeaLiveWorkbenchViewportModel,
  mountLafeaLiveWorkbenchViewport,
} from '../src/workspace/lafea-live-workbench-viewport.js';
import { mountLafeaHybridResultViewport } from '../src/workspace/lafea-hybrid-result-viewport.js';
import {
  FakeDocument,
  fakeThree,
  u4gCurrentBinding,
  u4gDocument,
  u4gQualifiedLifecycle,
  u4gRenderPacket,
} from './lafea-u4g-fixtures.mjs';

const sceneRevision = 14;
const packet = u4gRenderPacket(sceneRevision);
const lifecycle = u4gQualifiedLifecycle();
const lifecycleBinding = u4gCurrentBinding();
const documentValue = u4gDocument();
const model = createLafeaLiveWorkbenchViewportModel({
  stageId: 'LAFEA.3',
  document: documentValue,
  lifecycle,
  lifecycleBinding,
  sceneRevision,
  renderPacket: packet,
  selection: null,
  cssWidth: 760,
  cssHeight: 440,
  devicePixelRatio: 1,
});
assert.equal(model.mode, 'QUALIFIED_RESULT');

const authority = createLafeaResultSelectionAuthority({
  sceneRevision,
  sourceScene: model.sourceModel.scene,
  pickMap: model.intake.packet.pickMap,
  initialSelection: null,
});
assert.deepEqual(authority.getSelection(), {
  sceneRevision,
  sourceEntityId: null,
  meshEntityId: null,
  entityRole: null,
});
assert.equal(Object.isFrozen(authority.getSelection()), true);
assert.equal(authority.selectSource('N2').sourceEntityId, 'N2');
const resolved = authority.selectMeshPick({
  drawGroup: 'TRIANGLES',
  primitiveIndex: 0,
});
assert.deepEqual(resolved, {
  sceneRevision,
  sourceEntityId: 'E1',
  meshEntityId: 'E1',
  entityRole: 'ELEMENT',
});
assert.equal(Object.isFrozen(resolved), true);
assert.deepEqual(authority.clear(), {
  sceneRevision,
  sourceEntityId: null,
  meshEntityId: null,
  entityRole: null,
});
assert.throws(
  () => authority.selectSource('UNKNOWN'),
  (error) => error.code === 'LAFEA_HYBRID_RESULT_SOURCE_SELECTION_INVALID',
);
assert.throws(
  () => authority.selectMeshPick({ drawGroup: 'TRIANGLES', primitiveIndex: 99 }),
  (error) => error.code === 'LAFEA_GPU_PICK_UNRESOLVED',
);
assert.throws(
  () => createLafeaResultSelectionAuthority({
    sceneRevision,
    sourceScene: model.sourceModel.scene,
    pickMap: { ...model.intake.packet.pickMap, sceneRevision: sceneRevision - 1 },
    initialSelection: null,
  }),
  (error) => error.code === 'LAFEA_RESULT_SELECTION_PICK_MAP_INVALID',
);
assert.throws(
  () => createLafeaResultSelectionAuthority({
    sceneRevision,
    sourceScene: model.sourceModel.scene,
    pickMap: {
      ...model.intake.packet.pickMap,
      entries: [{
        ...model.intake.packet.pickMap.entries[0],
        sourceEntityId: 'FORGED-SOURCE',
      }],
    },
    initialSelection: null,
  }),
  (error) => error.code === 'LAFEA_RESULT_SELECTION_SOURCE_ID_UNRESOLVED',
);

const THREE = augmentPicking(fakeThree(true), 0);
const documentRef = new FakeDocument();
const root = documentRef.createElement('div');
const selections = [];
const mounted = mountLafeaHybridResultViewport(root, {
  stageId: 'LAFEA.3',
  sourceScene: model.sourceModel.scene,
  intake: model.intake,
  viewport: model.resultViewport,
  selection: null,
  THREE,
  onSelectionChange: (selection) => selections.push(selection),
});
assert.equal(mounted.getState().status, 'READY');
assert.equal(mounted.getState().renderer, 'THREE_WEBGL');
const renderCount = THREE.lastRenderer.renderCount;
root.dispatchEvent({ type: 'click', clientX: 380, clientY: 220 });
assert.deepEqual(mounted.getSelection(), {
  sceneRevision,
  sourceEntityId: 'E1',
  meshEntityId: 'E1',
  entityRole: 'ELEMENT',
});
assert.deepEqual(selections.at(-1), mounted.getSelection());
assert.ok(THREE.lastRenderer.renderCount > renderCount);
assert.equal(THREE.lastFaceIndex, 0);
assert.equal(THREE.lastPickCamera.isOrthographicCamera, true);
assert.equal(THREE.lastPickCamera.near, -1);
assert.equal(THREE.lastPickCamera.far, 1);
assert.ok(root.children[1].querySelectorAll('[data-element-id]').some(
  (node) => node.dataset.elementId === 'E1'
    && node.dataset.selected === 'true',
));
assert.match(
  root.children[2].children[1].textContent,
  /Selected Entity: E1 \(ELEMENT\)/u,
);

const retainedSelection = mounted.getSelection();
const selectionEventCount = selections.length;
THREE.nextFaceIndex = 99;
root.dispatchEvent({ type: 'click', clientX: 380, clientY: 220 });
assert.equal(root.dataset.gpuPickStatus, 'REJECTED');
assert.equal(root.dataset.gpuPickReason, 'LAFEA_GPU_PICK_UNRESOLVED');
assert.deepEqual(mounted.getSelection(), retainedSelection);
assert.equal(mounted.getState().status, 'READY');
assert.equal(selections.length, selectionEventCount);

THREE.nextFaceIndex = null;
root.dispatchEvent({ type: 'click', clientX: 380, clientY: 220 });
assert.equal(root.dataset.gpuPickStatus, 'NO_HIT');
assert.equal('gpuPickReason' in root.dataset, false);
assert.deepEqual(mounted.getSelection(), retainedSelection);
assert.equal(selections.length, selectionEventCount);

const sourceRoot = new FakeDocument().createElement('div');
const sourceMounted = mountLafeaLiveWorkbenchViewport(sourceRoot, {
  stageId: 'LAFEA.3',
  document: documentValue,
  lifecycle,
  lifecycleBinding,
  sceneRevision,
  renderPacket: null,
  selection: retainedSelection,
  THREE,
  cssWidth: 760,
  cssHeight: 440,
  devicePixelRatio: 1,
});
assert.equal(sourceMounted.getMode(), 'SOURCE_AUTHORING');
assert.equal(sourceMounted.getState().renderer, 'SVG');
assert.deepEqual(sourceMounted.getSelection(), {
  sceneRevision,
  sourceEntityId: 'E1',
  meshEntityId: null,
  entityRole: 'SOURCE',
});
sourceMounted.destroy();

mounted.destroy();
assert.equal('gpuPickStatus' in root.dataset, false);
assert.equal('gpuPickReason' in root.dataset, false);
const remountRoot = new FakeDocument().createElement('div');
const remounted = mountLafeaHybridResultViewport(remountRoot, {
  stageId: 'LAFEA.3',
  sourceScene: model.sourceModel.scene,
  intake: model.intake,
  viewport: model.resultViewport,
  selection: retainedSelection,
  THREE: augmentPicking(fakeThree(true), 0),
});
assert.deepEqual(remounted.getSelection(), retainedSelection);
remounted.clearSelection();
assert.equal(remounted.getSelection().meshEntityId, null);
remounted.destroy();

console.log(JSON.stringify({
  check: 'lafea-u4i-result-selection',
  status: 'PASS',
  primitiveIdentityResolvedBySelectionStore: true,
  stalePickMapRejected: true,
  forgedSourceIdentityRejected: true,
  projectionDepthDerived: true,
  liveGpuSelection: true,
  unresolvedPickContained: true,
  noHitPreservesSelection: true,
  sourceModeProjectionSafe: true,
  meshSelectionRetainedAcrossRemount: true,
  numericalAuthorityChanged: false,
  lafea6Enabled: false,
}));

function augmentPicking(THREE, faceIndex) {
  THREE.nextFaceIndex = faceIndex;
  THREE.Vector2 = class {
    constructor() { this.x = 0; this.y = 0; }
  };
  THREE.Raycaster = class {
    setFromCamera(pointer, camera) {
      THREE.lastPointer = { x: pointer.x, y: pointer.y };
      THREE.lastPickCamera = camera;
    }
    intersectObjects(objects, recursive) {
      assert.equal(recursive, false);
      assert.ok(objects.length > 0);
      THREE.lastFaceIndex = THREE.nextFaceIndex;
      return THREE.nextFaceIndex === null ? [] : [{ faceIndex: THREE.nextFaceIndex }];
    }
  };
  return THREE;
}
