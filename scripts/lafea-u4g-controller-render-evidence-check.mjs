#!/usr/bin/env node

import assert from 'node:assert/strict';
import { LafeaWorkbenchController } from '../src/workspace/lafea-workbench-controller.js';
import { LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA } from '../src/workspace/lafea-workbench-accessory-panels.js';
import {
  lafeaWorkbenchDisplayRenderPacket,
} from '../src/workspace/lafea-workbench-render-evidence.js';
import {
  FakeDocument,
  fakeThree,
  u4gRenderPacket,
} from './lafea-u4g-fixtures.mjs';

const documentRef = new FakeDocument();
const root = documentRef.createElement('main');
let renderCount = 0;
let viewDestroyCount = 0;
let panelDestroyCount = 0;
let observedAccessoryFacade = null;

const accessoryPanel = Object.freeze({
  schema: LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
  panelId: 'U4G_FACADE_GUARD',
  label: 'U4G facade guard',
  order: 1,
  mount({ controller }) {
    observedAccessoryFacade = controller;
    return Object.freeze({ destroy() { panelDestroyCount += 1; } });
  },
});

const controller = new LafeaWorkbenchController(root, {
  initialStage: 'LAFEA.3',
  THREE: fakeThree(true),
  accessoryPanels: [accessoryPanel],
});
const viewportState = Object.freeze({
  stageId: 'LAFEA.3',
  sceneRevision: 4,
  mode: 'SOURCE_AUTHORING',
  status: 'BLOCKED',
});
const fakeViewport = Object.freeze({
  scene: Object.freeze({ sourceSemanticHash: 'sha256:source-u4g' }),
  getState: () => viewportState,
  destroy() {},
});
controller.view.render = () => {
  renderCount += 1;
  controller.view.activeViewport = fakeViewport;
};
controller.view.destroy = () => {
  viewDestroyCount += 1;
  controller.view.activeViewport = null;
  root.replaceChildren();
};
controller.benchmarkPanel.render = () => {};
controller.benchmarkPanel.destroy = () => {};

controller.init();
assert.equal(renderCount, 1);
assert.equal('getRenderPacket' in controller.view, false);
assert.equal('THREE' in controller.view, false);
assert.deepEqual(controller.getDisplayViewportContext(), {
  schema: 'lafea-workbench-display-context/v1',
  stageId: 'LAFEA.3',
  sceneRevision: 4,
  sourceSemanticHash: 'sha256:source-u4g',
  mode: 'SOURCE_AUTHORING',
  status: 'BLOCKED',
});
assert.equal(Object.isFrozen(controller.getDisplayViewportContext()), true);
assert.equal('renderPacket' in controller.getDisplayViewportContext(), false);
assert.equal('positions' in controller.getDisplayViewportContext(), false);

assert.ok(observedAccessoryFacade);
assert.equal(Object.isFrozen(observedAccessoryFacade), true);
assert.deepEqual(Object.keys(observedAccessoryFacade), ['getState', 'importDocument']);
for (const forbidden of [
  'getDisplayViewportContext',
  'setDisplayRenderPacket',
  'clearDisplayRenderPacket',
  'store',
  'view',
]) {
  assert.equal(forbidden in observedAccessoryFacade, false);
}

const activePacket = u4gRenderPacket(4, 'LAFEA.3');
const activeBinding = controller.setDisplayRenderPacket(activePacket);
assert.deepEqual(activeBinding, {
  schema: 'lafea-workbench-display-packet-binding/v1',
  stageId: 'LAFEA.3',
  sceneRevision: 4,
  fieldId: 'FIELD-U4G',
  status: 'BOUND',
});
assert.equal(Object.isFrozen(activeBinding), true);
assert.equal(renderCount, 2);
assert.equal('packet' in activeBinding, false);
assert.equal('positions' in activeBinding, false);

const retainedActive = lafeaWorkbenchDisplayRenderPacket(controller, 'LAFEA.3');
assert.notStrictEqual(retainedActive, activePacket);
assert.notStrictEqual(retainedActive.positions, activePacket.positions);
activePacket.positions[0] = 99;
activePacket.fieldValues[0] = 99;
assert.equal(retainedActive.positions[0], 0);
assert.equal(retainedActive.fieldValues[0], 10);

const inactivePacket = u4gRenderPacket(1, 'LAFEA.4');
controller.setDisplayRenderPacket(inactivePacket);
assert.equal(renderCount, 2);
assert.ok(lafeaWorkbenchDisplayRenderPacket(controller, 'LAFEA.4'));
assert.strictEqual(
  lafeaWorkbenchDisplayRenderPacket(controller, 'LAFEA.3'),
  retainedActive,
);

const inactiveClear = controller.clearDisplayRenderPacket('LAFEA.4');
assert.equal(inactiveClear.status, 'CLEARED');
assert.equal(renderCount, 2);
assert.equal(lafeaWorkbenchDisplayRenderPacket(controller, 'LAFEA.4'), null);
assert.strictEqual(
  lafeaWorkbenchDisplayRenderPacket(controller, 'LAFEA.3'),
  retainedActive,
);

const activeClear = controller.clearDisplayRenderPacket('LAFEA.3');
assert.equal(activeClear.status, 'CLEARED');
assert.equal(renderCount, 3);
assert.equal(lafeaWorkbenchDisplayRenderPacket(controller, 'LAFEA.3'), null);
const repeatedClear = controller.clearDisplayRenderPacket('LAFEA.3');
assert.equal(repeatedClear.status, 'NOT_BOUND');
assert.equal(renderCount, 3);

controller.destroy();
controller.destroy();
assert.equal(viewDestroyCount, 1);
assert.equal(panelDestroyCount, 1);
assert.equal(controller.getDisplayViewportContext(), null);
assert.throws(
  () => controller.setDisplayRenderPacket(u4gRenderPacket(4)),
  (error) => error.code === 'LAFEA_WORKBENCH_RENDER_EVIDENCE_NOT_INITIALIZED',
);

console.log(JSON.stringify({
  check: 'lafea-u4g-controller-render-evidence',
  status: 'PASS',
  activeStageRerenders: true,
  inactiveStageRerenders: false,
  noOpClearRerenders: false,
  packetResealed: true,
  stageScoped: true,
  summariesBufferFree: true,
  displayContextBufferFree: true,
  viewDependenciesPrivate: true,
  accessoryFacadeUnchanged: true,
  teardownIdempotent: true,
}));
