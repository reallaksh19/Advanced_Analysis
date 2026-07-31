#!/usr/bin/env node

import assert from 'node:assert/strict';
import { LafeaWorkbenchController } from '../src/workspace/lafea-workbench-controller.js';
import {
  LAFEA_WORKBENCH_ACCESSORY_DIAGNOSTIC_SCHEMA as publicDiagnosticSchema,
  LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA as publicHostSchema,
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA as publicPanelSchema,
  validateLafeaAccessoryPanelDescriptor as publicValidator,
} from '../src/workspace/lafea-workbench.js';
import {
  LAFEA_WORKBENCH_ACCESSORY_DIAGNOSTIC_SCHEMA,
  LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA,
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
  lafeaAccessoryPanelConfigurationRequiresHost,
  validateLafeaAccessoryPanelDescriptor,
} from '../src/workspace/lafea-workbench-accessory-panels.js';

assert.equal(publicPanelSchema, LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA);
assert.equal(publicHostSchema, LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA);
assert.equal(publicDiagnosticSchema, LAFEA_WORKBENCH_ACCESSORY_DIAGNOSTIC_SCHEMA);
assert.strictEqual(publicValidator, validateLafeaAccessoryPanelDescriptor);

assert.equal(lafeaAccessoryPanelConfigurationRequiresHost(undefined), false);
assert.equal(lafeaAccessoryPanelConfigurationRequiresHost({}), false);
assert.equal(lafeaAccessoryPanelConfigurationRequiresHost({ accessoryPanels: [] }), false);
assert.equal(lafeaAccessoryPanelConfigurationRequiresHost({ accessoryPanels: {} }), true);
assert.equal(lafeaAccessoryPanelConfigurationRequiresHost({ accessoryPanels: [{}] }), true);

const omitted = new LafeaWorkbenchController(new FakeRoot(new FakeDocument()), {
  initialStage: 'LAFEA.3',
});
const empty = new LafeaWorkbenchController(new FakeRoot(new FakeDocument()), {
  initialStage: 'LAFEA.4',
  accessoryPanels: [],
});
const invalid = new LafeaWorkbenchController(new FakeRoot(new FakeDocument()), {
  initialStage: 'LAFEA.3',
  accessoryPanels: { invalid: true },
});

assert.equal(omitted.getState().activeStageId, 'LAFEA.3');
assert.equal(empty.getState().activeStageId, 'LAFEA.4');
assert.equal(invalid.getState().activeStageId, 'LAFEA.3');
assert.deepEqual(Object.keys(empty).sort(), Object.keys(omitted).sort());
assert.deepEqual(Object.keys(invalid).sort(), Object.keys(omitted).sort());
for (const controller of [omitted, empty, invalid]) {
  assert.equal('accessoryPanelManager' in controller, false);
  assert.equal('destroyed' in controller, false);
}

omitted.destroy();
omitted.destroy();
empty.destroy();
empty.destroy();
invalid.destroy();
invalid.destroy();

console.log(JSON.stringify({
  check: 'lafea-accessory-panel-integration',
  status: 'PASS',
  omittedPanelsPreserveLegacyShape: true,
  emptyPanelsPreserveLegacyShape: true,
  accessoryStateControllerPrivate: true,
  invalidCollectionDoesNotChangePublicShape: true,
  publicContractIdentity: true,
  controllerDestroyIdempotent: true,
}));

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) { return new FakeElement(tagName, this); }
  querySelector() { return null; }
}

class FakeRoot extends FakeElement {
  constructor(ownerDocument) { super('main', ownerDocument); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.classList = { add() {}, remove() {} };
    this.hidden = false;
    this.textContent = '';
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}
