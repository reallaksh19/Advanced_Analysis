#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  validateLafeaAccessoryPanelDescriptor,
} from '../src/workspace/lafea-workbench.js';
import {
  createLafeaAccessoryPanelManager,
} from '../src/workspace/lafea-workbench-accessory-panels.js';
import {
  requireT6AParameterSchema,
} from '../src/workspace/lafea-templates/wizard-model.js';
import {
  LAFEA_T7A_PARAMETER_ACCESSORY_PANEL_DESCRIPTOR,
  LAFEA_T7A_PARAMETER_WIZARD_ACTION_AUTHORITY,
  LAFEA_T7A_PARAMETER_WIZARD_ACTIONS,
  LAFEA_T7A_PARAMETER_WIZARD_MODEL_SCHEMA,
  LAFEA_T7A_PARAMETER_WIZARD_SELECTION_SCHEMA,
  LAFEA_T7A_PARAMETER_WIZARD_STATUS,
  LAFEA_TEMPLATE_PARAMETER_PANEL_AUTHORITY,
  createLafeaT7aParameterAccessoryPanelDescriptor,
  createLafeaT7aParameterWorkbenchRegistration,
  createLafeaTemplateParameterDraft,
  mountLafeaT7aParameterWizard,
  updateLafeaTemplateParameterDraft,
  validateLafeaTemplateParameterDraft,
} from '../src/workspace/lafea-templates/t7a-parameter-entry.js';

const T6C_PARAMETER_BLOCKER =
  'Live workbench composition is active through the governed accessory-panel seam; parameter entry, compilation, document import and engine execution remain disabled.';

const analyticalSchema = requireT6AParameterSchema('ALG-LOAD-REFERENCE-TRANSFER');
let analyticalDraft = createLafeaTemplateParameterDraft(analyticalSchema);
assert.equal(Object.isFrozen(analyticalDraft), true);
assert.equal(analyticalDraft.templateId, analyticalSchema.templateId);
assert.equal(analyticalDraft.parameterSchemaId, analyticalSchema.parameterSchemaId);
assert.equal(
  validateLafeaTemplateParameterDraft(analyticalSchema, analyticalDraft).status,
  'BLOCKED',
);

for (const descriptor of analyticalSchema.parameters) {
  analyticalDraft = updateLafeaTemplateParameterDraft(
    analyticalSchema,
    analyticalDraft,
    descriptor.parameterId,
    {
      present: true,
      valueInput: sampleValue(descriptor),
      unit: descriptor.canonicalUnit,
      sourceRefInput: descriptor.sourceRequired
        ? JSON.stringify({ sourceId: `SRC-${descriptor.parameterId}` })
        : '',
      sourceStatus: descriptor.sourceRequired ? 'VERIFIED' : null,
    },
  );
}
const valid = validateLafeaTemplateParameterDraft(
  analyticalSchema,
  analyticalDraft,
);
assert.equal(valid.status, 'VALID');
assert.equal(valid.parameterSet.status, 'VALID');
assert.equal(valid.diagnostics.length, 0);
assert.equal(Object.isFrozen(valid), true);
assert.equal(Object.isFrozen(valid.parameterSet), true);

assert.throws(
  () => updateLafeaTemplateParameterDraft(
    analyticalSchema,
    analyticalDraft,
    analyticalSchema.parameters[0].parameterId,
    { unknown: true },
  ),
  /unknown keys/u,
);
const invalidJsonDraft = updateLafeaTemplateParameterDraft(
  analyticalSchema,
  analyticalDraft,
  'identity',
  {
    present: true,
    valueInput: '{invalid',
    sourceRefInput: '{"sourceId":"SRC-identity"}',
    sourceStatus: 'VERIFIED',
    unit: null,
  },
);
const invalidJson = validateLafeaTemplateParameterDraft(
  analyticalSchema,
  invalidJsonDraft,
);
assert.equal(invalidJson.status, 'BLOCKED');
assert.ok(invalidJson.diagnostics.includes('INVALID_VALUE:identity'));

const continuumSchema = requireT6AParameterSchema('C2D-LUG-PINHOLE');
const continuumDraft = createLafeaTemplateParameterDraft(continuumSchema);
assert.notEqual(continuumDraft.templateId, analyticalDraft.templateId);
assert.notEqual(continuumDraft.semanticHash, analyticalDraft.semanticHash);
assert.equal(
  continuumDraft.fields.some((field) => field.parameterId === 'identity'),
  false,
);

const registration = createLafeaT7aParameterWorkbenchRegistration({
  workbenchOptions: { initialStage: 'LAFEA.3' },
  parameterPanelOptions: {
    selectedTemplateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  },
});
assert.equal(Object.isFrozen(registration), true);
assert.equal(Object.isFrozen(registration.mountOptions), true);
assert.equal(Object.isFrozen(registration.mountOptions.accessoryPanels), true);
assert.strictEqual(registration.authority, LAFEA_TEMPLATE_PARAMETER_PANEL_AUTHORITY);
assert.equal(registration.authority.parameterEntry, true);
assert.equal(registration.authority.parameterValidation, true);
for (const field of [
  'compilerInvocation',
  'workbenchImport',
  'engineExecution',
  'lifecycleRegistration',
  'releasePromotion',
]) {
  assert.equal(registration.authority[field], false);
}
validateLafeaAccessoryPanelDescriptor(
  LAFEA_T7A_PARAMETER_ACCESSORY_PANEL_DESCRIPTOR,
);
validateLafeaAccessoryPanelDescriptor(registration.descriptor);
assert.throws(
  () => createLafeaT7aParameterWorkbenchRegistration({
    workbenchOptions: { accessoryPanels: [] },
  }),
  /must not supply accessoryPanels/u,
);

const wizardDocument = new FakeDocument();
const wizardRoot = new FakeElement('section', wizardDocument);
const parameterWizard = mountLafeaT7aParameterWizard(wizardRoot, {
  selectedTemplateId: 'ALG-LOAD-REFERENCE-TRANSFER',
});
const wizardModel = parameterWizard.getModel();
assert.equal(wizardModel.schema, LAFEA_T7A_PARAMETER_WIZARD_MODEL_SCHEMA);
assert.strictEqual(wizardModel.actions, LAFEA_T7A_PARAMETER_WIZARD_ACTIONS);
assert.equal(wizardModel.actions.templateSelection, true);
assert.equal(wizardModel.actions.selectionOnly, false);
assert.equal(wizardModel.actions.parameterEntry, true);
assert.equal(wizardModel.actions.parameterValidation, true);
assert.equal(wizardModel.actions.compilerInvocation, false);
assert.equal(wizardModel.actions.workbenchImport, false);
assert.equal(wizardModel.actions.engineExecution, false);
assert.equal(wizardModel.selection.schema, LAFEA_T7A_PARAMETER_WIZARD_SELECTION_SCHEMA);
assert.equal(
  wizardModel.selection.actionAuthority,
  LAFEA_T7A_PARAMETER_WIZARD_ACTION_AUTHORITY,
);
assert.equal(
  wizardModel.selection.integrationStatus,
  LAFEA_T7A_PARAMETER_WIZARD_STATUS,
);
assert.equal(
  wizardModel.selection.limitations.includes(T6C_PARAMETER_BLOCKER),
  false,
);
assert.ok(wizardModel.selection.limitations.some(
  (value) => value.includes('Parameter drafting and governed validation are active'),
));
assert.equal(Object.isFrozen(wizardModel), true);
assert.equal(Object.isFrozen(wizardModel.actions), true);
assert.equal(Object.isFrozen(wizardModel.selection), true);
parameterWizard.destroy();

let panelMountCount = 0;
let panelDestroyCount = 0;
let getStateCalls = 0;
let importDocumentCalls = 0;
const countedDescriptor = createCountedDescriptor(
  createLafeaT7aParameterAccessoryPanelDescriptor({
    selectedTemplateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  }),
);
const failingDescriptor = Object.freeze({
  schema: countedDescriptor.schema,
  panelId: 'T7A_NEIGHBOR_FAILURE',
  label: 'T7A neighbor failure',
  order: 50,
  mount() {
    const error = new Error('T7A_NEIGHBOR_MOUNT_REJECTED');
    error.code = 'T7A_NEIGHBOR_MOUNT_REJECTED';
    throw error;
  },
});
const documentRef = new FakeDocument();
const manager = createLafeaAccessoryPanelManager(documentRef, [
  countedDescriptor,
  failingDescriptor,
]);
const controller = {
  getState() {
    getStateCalls += 1;
    return Object.freeze({ activeStageId: 'LAFEA.3' });
  },
  importDocument() {
    importDocumentCalls += 1;
    throw new Error('T7A_IMPORT_MUST_NOT_BE_CALLED');
  },
};
const mounted = manager.mount(controller);
assert.equal(panelMountCount, 1);
assert.equal(panelDestroyCount, 0);
assert.equal(getStateCalls, 0);
assert.equal(importDocumentCalls, 0);
assert.ok(mounted.diagnostics.some(
  (entry) => entry.code === 'T7A_NEIGHBOR_MOUNT_REJECTED',
));
const text = collectText(manager.hostElement);
assert.match(text, /Parameter drafting and validation/u);
assert.match(text, /Template selection, parameter drafting and governed validation are enabled/u);
assert.match(text, /PARAMETER_DRAFT_VALIDATION_ONLY/u);
assert.match(text, /Compilation, workbench import and engine execution remain disabled/u);
assert.doesNotMatch(text, /parameter entry, compilation, document import and engine execution remain disabled/u);
assert.doesNotMatch(text, /Compile parameters|Run engine|Import document/u);

manager.mount(controller);
assert.equal(panelMountCount, 1);
assert.equal(panelDestroyCount, 0);
manager.destroy();
assert.equal(panelDestroyCount, 1);
manager.destroy();
assert.equal(panelDestroyCount, 1);
assert.equal(getStateCalls, 0);
assert.equal(importDocumentCalls, 0);

console.log(JSON.stringify({
  check: 'lafea-template-t7a-parameter-entry',
  status: 'PASS',
  validParameterSetProduced: true,
  invalidJsonBlocked: true,
  crossTemplateDraftIsolation: true,
  truthfulWizardModel: true,
  selectionOnly: false,
  staleT6cParameterBlockerRetained: false,
  parameterEntryAuthority: true,
  parameterValidationAuthority: true,
  panelMountCount,
  panelDestroyCount,
  neighboringFailureContained: true,
  controllerFacadeMethodInvocations: getStateCalls + importDocumentCalls,
  compilerInvocationPaths: 0,
  workbenchImportPaths: 0,
  engineExecutionPaths: 0,
  lifecycleRegistrationPaths: 0,
  releasePromotionPaths: 0,
}, null, 2));

function sampleValue(descriptor) {
  if (descriptor.valueKind === 'JSON_RECORD') {
    return JSON.stringify({ parameterId: descriptor.parameterId, declared: true });
  }
  if (descriptor.valueKind === 'BOOLEAN') return 'true';
  if (descriptor.valueKind === 'ENUM') return descriptor.enumValues[0];
  if (descriptor.valueKind === 'FINITE_NUMBER') return '1';
  return `VALUE-${descriptor.parameterId}`;
}

function createCountedDescriptor(descriptor) {
  return Object.freeze({
    schema: descriptor.schema,
    panelId: descriptor.panelId,
    label: descriptor.label,
    order: descriptor.order,
    mount(context) {
      panelMountCount += 1;
      const handle = descriptor.mount(context);
      return Object.freeze({
        destroy() {
          panelDestroyCount += 1;
          handle.destroy();
        },
      });
    },
  });
}

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

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  querySelector() {
    return null;
  }
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
    this.disabled = false;
    this.listeners = new Map();
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

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }
}
