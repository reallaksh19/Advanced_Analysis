#!/usr/bin/env node

import assert from 'node:assert/strict';
import { LafeaWorkbenchController } from '../src/workspace/lafea-workbench-controller.js';
import {
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
} from '../src/workspace/lafea-workbench-accessory-panels.js';

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  querySelector(selector) {
    if (selector !== '[data-lafea-workbench-styles]') return null;
    return findDescendant(
      this.head,
      (node) => node.dataset.lafeaWorkbenchStyles === 'true',
    );
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.classList = { add() {}, remove() {} };
    this.hidden = false;
    this.textContent = '';
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

const documentRef = new FakeDocument();
const root = new FakeElement('main', documentRef);
let validMountCount = 0;
let validDestroyCount = 0;
let failingMountCount = 0;
let observedFacade = null;
let validPanelHost = null;
let viewRenderCount = 0;
let viewDestroyCount = 0;
let benchmarkDestroyCount = 0;
let lastRenderedState = null;

const validPanel = Object.freeze({
  schema: LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
  panelId: 'PANEL_VALID_CONTROLLER_LIFECYCLE',
  label: 'Valid controller lifecycle panel',
  order: 10,
  mount({ hostElement, controller }) {
    validMountCount += 1;
    validPanelHost = hostElement;
    observedFacade = controller;
    hostElement.dataset.testMounted = 'true';
    return Object.freeze({
      destroy() {
        validDestroyCount += 1;
      },
    });
  },
});

const failingPanel = Object.freeze({
  schema: LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
  panelId: 'PANEL_FAIL_CONTROLLER_LIFECYCLE',
  label: 'Failing controller lifecycle panel',
  order: 20,
  mount() {
    failingMountCount += 1;
    const error = new Error('CONTROLLER_LIFECYCLE_PANEL_MOUNT_REJECTED');
    error.code = 'CONTROLLER_LIFECYCLE_PANEL_MOUNT_REJECTED';
    throw error;
  },
});

const controller = new LafeaWorkbenchController(root, {
  initialStage: 'LAFEA.3',
  accessoryPanels: [failingPanel, validPanel],
});

// Preserve the real controller, store subscription and accessory manager while
// replacing only DOM-heavy workbench rendering and benchmark drawing.
controller.view.render = (state) => {
  viewRenderCount += 1;
  lastRenderedState = state;
};
controller.view.destroy = () => {
  viewDestroyCount += 1;
  root.replaceChildren();
};
controller.benchmarkPanel.render = () => {};
controller.benchmarkPanel.destroy = () => {
  benchmarkDestroyCount += 1;
};

assert.strictEqual(controller.init(), controller);
assert.equal(validMountCount, 1);
assert.equal(failingMountCount, 1);
assert.equal(validDestroyCount, 0);
assert.equal(viewRenderCount, 1);
assert.equal(lastRenderedState.activeStageId, 'LAFEA.3');

assert.ok(observedFacade);
assert.equal(Object.isFrozen(observedFacade), true);
assert.deepEqual(Object.keys(observedFacade), ['getState', 'importDocument']);
for (const forbidden of [
  'store', 'view', 'run', 'initializeLifecycle', 'applyLifecycleEvent',
  'registerLifecycleArtifact', 'benchmarkPanel',
]) {
  assert.equal(forbidden in observedFacade, false);
}
assert.equal(observedFacade.getState().activeStageId, controller.getState().activeStageId);
assert.equal(observedFacade.getState().schema, controller.getState().schema);

const accessoryHost = requireDescendant(
  root,
  (node) => node.dataset.role === 'lafea-accessory-panels',
  'Accessory host was not mounted by controller.init().',
);
const validSection = requireDescendant(
  accessoryHost,
  (node) => node.dataset.panelId === validPanel.panelId
    && node.dataset.role === 'lafea-accessory-panel',
  'Valid accessory section was not mounted.',
);
const failingSection = requireDescendant(
  accessoryHost,
  (node) => node.dataset.panelId === failingPanel.panelId
    && node.dataset.role === 'lafea-accessory-panel',
  'Failing accessory section was not retained as a contained panel record.',
);
assert.equal(validSection.dataset.status, 'MOUNTED');
assert.equal(failingSection.dataset.status, 'BLOCKED');
assert.ok(validPanelHost);
assert.equal(validPanelHost.dataset.testMounted, 'true');
assert.ok(requireDescendant(
  accessoryHost,
  (node) => node.dataset.code === 'CONTROLLER_LIFECYCLE_PANEL_MOUNT_REJECTED',
  'Failing panel diagnostic was not surfaced.',
));

const renderCountBeforeStateChange = viewRenderCount;
controller.store.selectStage('LAFEA.4');
assert.equal(controller.getState().activeStageId, 'LAFEA.4');
assert.equal(observedFacade.getState().activeStageId, 'LAFEA.4');
assert.equal(viewRenderCount, renderCountBeforeStateChange + 1);
assert.equal(lastRenderedState.activeStageId, 'LAFEA.4');
assert.equal(validMountCount, 1);
assert.equal(failingMountCount, 1);
assert.equal(validDestroyCount, 0);
assert.strictEqual(
  requireDescendant(
    root,
    (node) => node.dataset.role === 'lafea-accessory-panels',
    'Accessory host disappeared after workbench rerender.',
  ),
  accessoryHost,
);
assert.strictEqual(
  requireDescendant(
    accessoryHost,
    (node) => node.dataset.panelId === validPanel.panelId
      && node.dataset.role === 'lafea-accessory-panel-host',
    'Valid panel host disappeared after workbench rerender.',
  ),
  validPanelHost,
);
assert.equal(failingSection.dataset.status, 'BLOCKED');

controller.destroy();
assert.equal(validDestroyCount, 1);
assert.equal(viewDestroyCount, 1);
assert.equal(benchmarkDestroyCount, 1);

controller.destroy();
assert.equal(validDestroyCount, 1);
assert.equal(viewDestroyCount, 1);
assert.equal(benchmarkDestroyCount, 1);

console.log(JSON.stringify({
  check: 'lafea-accessory-panel-controller-lifecycle',
  status: 'PASS',
  controllerInitialized: true,
  validPanelMountCount: validMountCount,
  failingPanelMountCount: failingMountCount,
  validPanelDestroyCount: validDestroyCount,
  workbenchRerenderObserved: true,
  hostIdentityPreserved: true,
  facadeFrozen: true,
  facadeKeys: Object.keys(observedFacade),
  failureContained: true,
  secondDestroyIdempotent: true,
}));

function requireDescendant(rootElement, predicate, message) {
  const match = findDescendant(rootElement, predicate);
  assert.ok(match, message);
  return match;
}

function findDescendant(rootElement, predicate) {
  if (predicate(rootElement)) return rootElement;
  for (const child of rootElement.children ?? []) {
    const match = findDescendant(child, predicate);
    if (match) return match;
  }
  return null;
}
