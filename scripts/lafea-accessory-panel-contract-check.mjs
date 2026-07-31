#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
  createLafeaAccessoryPanelManager,
  validateLafeaAccessoryPanelDescriptor,
} from '../src/workspace/lafea-workbench-accessory-panels.js';

const valid = descriptor('PANEL_VALID', 'Valid panel', 10, () => ({ destroy() {} }));
const validated = validateLafeaAccessoryPanelDescriptor(valid);
assert.ok(Object.isFrozen(validated));
assert.deepEqual(Object.keys(validated), ['schema', 'panelId', 'label', 'order', 'mount']);

for (const invalid of [
  { ...valid, extra: true },
  { ...valid, schema: 'wrong' },
  { ...valid, panelId: '' },
  { ...valid, panelId: 'BAD ID' },
  { ...valid, label: '   ' },
  { ...valid, order: 1.5 },
  { ...valid, mount: null },
]) {
  assert.throws(() => validateLafeaAccessoryPanelDescriptor(invalid));
}

const documentRef = new FakeDocument();
const mountCounts = new Map();
const destroyCounts = new Map();
let observedFacade = null;

const values = [
  descriptor('PANEL_B', 'Panel B', 100, mounted('PANEL_B')),
  descriptor('PANEL_A', 'Panel A', 100, mounted('PANEL_A')),
  descriptor('PANEL_FIRST', 'Panel first', -20, mounted('PANEL_FIRST')),
  descriptor('PANEL_FAIL', 'Panel failure', 50, () => {
    throw codedError('PANEL_MOUNT_REJECTED');
  }),
  descriptor('PANEL_DESTROY_FAIL', 'Destroy failure', 70, ({ controller }) => {
    observeFacade(controller);
    increment(mountCounts, 'PANEL_DESTROY_FAIL');
    return { destroy() { increment(destroyCounts, 'PANEL_DESTROY_FAIL'); throw codedError('PANEL_DESTROY_REJECTED'); } };
  }),
  descriptor('PANEL_DUPLICATE', 'Duplicate one', 1, mounted('PANEL_DUPLICATE_1')),
  descriptor('PANEL_DUPLICATE', 'Duplicate two', 2, mounted('PANEL_DUPLICATE_2')),
  { ...valid, panelId: 'INVALID PANEL' },
];

const manager = createLafeaAccessoryPanelManager(documentRef, values);
assert.ok(Object.isFrozen(manager));
assert.deepEqual(manager.getSnapshot().panelOrder, [
  'PANEL_FIRST', 'PANEL_FAIL', 'PANEL_DESTROY_FAIL', 'PANEL_A', 'PANEL_B',
]);
assert.equal(manager.hostElement.dataset.role, 'lafea-accessory-panels');
assert.equal(manager.hostElement.children.filter(
  (node) => node.dataset.role === 'lafea-accessory-panel',
).length, 5);
assert.equal(manager.getSnapshot().diagnostics.filter(
  (entry) => entry.code === 'LAFEA_ACCESSORY_PANEL_DUPLICATE_ID',
).length, 2);
assert.ok(manager.getSnapshot().diagnostics.some(
  (entry) => entry.code === 'LAFEA_ACCESSORY_PANEL_ID_INVALID',
));

const controller = {
  state: Object.freeze({ activeStageId: 'LAFEA.3' }),
  getState() { return this.state; },
  importDocument(value, stageId) { return { value, stageId, owner: this }; },
  store: { forbidden: true },
  view: { forbidden: true },
};

const mountedSnapshot = manager.mount(controller);
assert.equal(mountedSnapshot.mounted, true);
assert.equal(mountedSnapshot.controllerFacadeFrozen, true);
assert.equal(mountedSnapshot.panels.find((row) => row.panelId === 'PANEL_FAIL').status, 'BLOCKED');
assert.ok(mountedSnapshot.diagnostics.some((entry) => entry.code === 'PANEL_MOUNT_REJECTED'));
assert.deepEqual([...mountCounts.entries()].sort(), [
  ['PANEL_A', 1],
  ['PANEL_B', 1],
  ['PANEL_DESTROY_FAIL', 1],
  ['PANEL_FIRST', 1],
]);
assert.ok(observedFacade);
assert.ok(Object.isFrozen(observedFacade));
assert.deepEqual(Object.keys(observedFacade), ['getState', 'importDocument']);
assert.equal('store' in observedFacade, false);
assert.equal('view' in observedFacade, false);
assert.equal('initializeLifecycle' in observedFacade, false);
assert.equal(observedFacade.getState(), controller.state);
assert.equal(observedFacade.importDocument({ schema: 'test' }, 'LAFEA.3').owner, controller);

manager.mount(controller);
assert.deepEqual([...mountCounts.entries()].sort(), [
  ['PANEL_A', 1],
  ['PANEL_B', 1],
  ['PANEL_DESTROY_FAIL', 1],
  ['PANEL_FIRST', 1],
]);

const destroyedSnapshot = manager.destroy();
assert.equal(destroyedSnapshot.destroyed, true);
assert.ok(destroyedSnapshot.diagnostics.some((entry) => entry.code === 'PANEL_DESTROY_REJECTED'));
assert.deepEqual([...destroyCounts.entries()].sort(), [
  ['PANEL_A', 1],
  ['PANEL_B', 1],
  ['PANEL_DESTROY_FAIL', 1],
  ['PANEL_FIRST', 1],
]);
manager.destroy();
assert.deepEqual([...destroyCounts.entries()].sort(), [
  ['PANEL_A', 1],
  ['PANEL_B', 1],
  ['PANEL_DESTROY_FAIL', 1],
  ['PANEL_FIRST', 1],
]);

const invalidCollection = createLafeaAccessoryPanelManager(documentRef, { not: 'an array' });
assert.deepEqual(invalidCollection.getSnapshot().panelOrder, []);
assert.equal(
  invalidCollection.getSnapshot().diagnostics[0].code,
  'LAFEA_ACCESSORY_PANEL_COLLECTION_INVALID',
);

console.log(JSON.stringify({
  check: 'lafea-accessory-panel-contract',
  status: 'PASS',
  deterministicOrder: true,
  duplicateGroupRejected: true,
  mountFailureContained: true,
  facadeFrozen: true,
  teardownExactlyOnce: true,
}));

function descriptor(panelId, label, order, mount) {
  return {
    schema: LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
    panelId,
    label,
    order,
    mount,
  };
}

function mounted(panelId) {
  return ({ controller }) => {
    observeFacade(controller);
    increment(mountCounts, panelId);
    return { destroy() { increment(destroyCounts, panelId); } };
  };
}

function observeFacade(value) {
  if (observedFacade === null) observedFacade = value;
  else assert.strictEqual(value, observedFacade);
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.hidden = false;
    this.textContent = '';
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}
