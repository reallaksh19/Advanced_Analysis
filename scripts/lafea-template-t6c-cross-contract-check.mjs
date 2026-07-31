#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA as AGENT1_PANEL_SCHEMA,
  validateLafeaAccessoryPanelDescriptor,
} from '../src/workspace/lafea-workbench.js';
import {
  createLafeaAccessoryPanelManager,
} from '../src/workspace/lafea-workbench-accessory-panels.js';
import {
  LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_ID,
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA as AGENT2_PANEL_SCHEMA,
  validateLafeaTemplateAccessoryPanelDescriptor,
} from '../src/workspace/lafea-templates/t6b-accessory-panel.js';
import {
  LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR,
  LAFEA_LIVE_TEMPLATE_WIZARD_INTEGRATION,
  LAFEA_LIVE_TEMPLATE_WIZARD_INTEGRATION_STATUS,
  LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_AUTHORITY,
  LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_SCHEMA,
  LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_STATUS,
  createLafeaTemplateWorkbenchRegistration,
} from '../src/workspace/lafea-templates/t6c-live-registration.js';

assert.equal(AGENT1_PANEL_SCHEMA, AGENT2_PANEL_SCHEMA);
assert.equal(
  validateLafeaTemplateAccessoryPanelDescriptor(
    LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR,
  ).ok,
  true,
);
validateLafeaAccessoryPanelDescriptor(LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR);
const liveValidated = validateLafeaAccessoryPanelDescriptor(
  LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR,
);
assert.equal(liveValidated.schema, AGENT1_PANEL_SCHEMA);
assert.equal(liveValidated.panelId, LAFEA_TEMPLATE_ACCESSORY_PANEL_ID);
assert.equal(
  LAFEA_LIVE_TEMPLATE_WIZARD_INTEGRATION.status,
  'RESOLVED_INTERFACE_MERGED',
);
assert.equal(
  LAFEA_LIVE_TEMPLATE_WIZARD_INTEGRATION_STATUS,
  'LIVE_UI_COMPOSITION_ONLY',
);

const registration = createLafeaTemplateWorkbenchRegistration({
  workbenchOptions: { initialStage: 'LAFEA.3' },
});
assert.equal(registration.schema, LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_SCHEMA);
assert.equal(registration.status, LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_STATUS);
assert.strictEqual(registration.authority, LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_AUTHORITY);
assert.equal(Object.isFrozen(registration), true);
assert.equal(Object.isFrozen(registration.mountOptions), true);
assert.equal(Object.isFrozen(registration.mountOptions.accessoryPanels), true);
assert.deepEqual(registration.mountOptions.accessoryPanels, [
  LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR,
]);
assert.equal(registration.mountOptions.initialStage, 'LAFEA.3');
assert.equal(registration.authority.liveUiComposition, true);
assert.equal(registration.authority.selectionOnly, true);
for (const field of [
  'parameterEntry',
  'compilerInvocation',
  'workbenchImport',
  'engineExecution',
  'lifecycleRegistration',
  'releasePromotion',
]) {
  assert.equal(registration.authority[field], false);
}
assert.throws(
  () => createLafeaTemplateWorkbenchRegistration({
    workbenchOptions: { accessoryPanels: [] },
  }),
  /must not supply accessoryPanels/u,
);
assert.throws(
  () => createLafeaTemplateWorkbenchRegistration({ unknown: true }),
  /unknown keys/u,
);

let templateMountCount = 0;
let templateDestroyCount = 0;
let getStateCalls = 0;
let importDocumentCalls = 0;
const countedTemplateDescriptor = Object.freeze({
  schema: LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.schema,
  panelId: LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.panelId,
  label: LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.label,
  order: LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.order,
  mount(context) {
    templateMountCount += 1;
    const handle = LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.mount(context);
    return Object.freeze({
      destroy() {
        templateDestroyCount += 1;
        handle.destroy();
      },
    });
  },
});
const failingDescriptor = Object.freeze({
  schema: AGENT1_PANEL_SCHEMA,
  panelId: 'T6C_NEIGHBOR_FAILURE',
  label: 'T6C neighbor failure',
  order: 50,
  mount() {
    const error = new Error('T6C_NEIGHBOR_MOUNT_REJECTED');
    error.code = 'T6C_NEIGHBOR_MOUNT_REJECTED';
    throw error;
  },
});

const documentRef = new FakeDocument();
const manager = createLafeaAccessoryPanelManager(documentRef, [
  countedTemplateDescriptor,
  failingDescriptor,
]);
const controller = {
  getState() {
    getStateCalls += 1;
    return Object.freeze({ activeStageId: 'LAFEA.3' });
  },
  importDocument() {
    importDocumentCalls += 1;
    throw new Error('T6C_IMPORT_MUST_NOT_BE_CALLED');
  },
};

assert.deepEqual(manager.getSnapshot().panelOrder, [
  'T6C_NEIGHBOR_FAILURE',
  LAFEA_TEMPLATE_ACCESSORY_PANEL_ID,
]);
assert.notEqual(manager.hostElement.dataset.role, 'lafea-benchmark-host');
const mounted = manager.mount(controller);
assert.equal(templateMountCount, 1);
assert.equal(templateDestroyCount, 0);
assert.equal(getStateCalls, 0);
assert.equal(importDocumentCalls, 0);
assert.equal(
  mounted.panels.find((panel) => panel.panelId === LAFEA_TEMPLATE_ACCESSORY_PANEL_ID).status,
  'MOUNTED',
);
assert.equal(
  mounted.panels.find((panel) => panel.panelId === 'T6C_NEIGHBOR_FAILURE').status,
  'BLOCKED',
);
assert.ok(mounted.diagnostics.some(
  (entry) => entry.code === 'T6C_NEIGHBOR_MOUNT_REJECTED',
));
assert.equal(mounted.controllerFacadeFrozen, true);

const templateSection = manager.hostElement.children.find(
  (node) => node.dataset.panelId === LAFEA_TEMPLATE_ACCESSORY_PANEL_ID,
);
const templateHost = templateSection.children.find(
  (node) => node.dataset.role === 'lafea-accessory-panel-host',
);
const initialWizardRoot = templateHost.children[0];
assert.ok(initialWizardRoot);
const renderedText = collectText(templateHost);
assert.match(renderedText, /Live workbench composition is active/u);
assert.doesNotMatch(renderedText, /insertion is blocked|remains blocked/u);
manager.mount(controller);
assert.equal(templateMountCount, 1);
assert.equal(templateDestroyCount, 0);
assert.strictEqual(templateHost.children[0], initialWizardRoot);
assert.equal(getStateCalls, 0);
assert.equal(importDocumentCalls, 0);

manager.destroy();
assert.equal(templateDestroyCount, 1);
assert.equal(templateHost.children.length, 0);
manager.destroy();
assert.equal(templateDestroyCount, 1);
assert.equal(getStateCalls, 0);
assert.equal(importDocumentCalls, 0);

console.log(JSON.stringify({
  check: 'lafea-template-t6c-cross-contract',
  status: 'PASS',
  agent1SchemaMatchesAgent2: true,
  canonicalT6BDescriptorAccepted: true,
  truthfulLiveDescriptorAccepted: true,
  resolvedInterfaceRendered: true,
  liveUiCompositionRegistered: true,
  templateMountCount,
  templateDestroyCount,
  neighboringFailureContained: true,
  stableHostIdentity: true,
  controllerFacadeMethodInvocations: getStateCalls + importDocumentCalls,
  workbenchImportPaths: 0,
  compilerInvocationPaths: 0,
  engineExecutionPaths: 0,
  lifecycleRegistrationPaths: 0,
  releasePromotionPaths: 0,
}, null, 2));

function collectText(node) {
  return [node.textContent, ...node.children.flatMap((child) => collectText(child))]
    .filter(Boolean)
    .join(' ');
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  querySelector() { return null; }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.className = '';
    this.hidden = false;
    this.selected = false;
    this.style = {};
    this.textContent = '';
    this.type = '';
    this.value = '';
    this.listeners = new Map();
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
}
