#!/usr/bin/env node
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { sourceFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture } from './lafea.2-fixtures.mjs';
import { createLafeaWorkbenchStore } from '../src/workspace/lafea-lifecycle-workbench-store.js';
import {
  createLafeaAccessoryPanelManager,
} from '../src/workspace/lafea-workbench-accessory-panels.js';
import {
  requireT6AParameterSchema,
} from '../src/workspace/lafea-templates/wizard-model.js';
import {
  createLafeaTemplateParameterDraft,
  updateLafeaTemplateParameterDraft,
  validateLafeaTemplateParameterDraft,
} from '../src/workspace/lafea-templates/parameter-draft.js';
import {
  attemptLafeaTemplateCompilationPreview,
} from '../src/workspace/lafea-templates/compilation-preview.js';
import {
  LAFEA_T7C_IMPORT_ACCESSORY_PANEL_DESCRIPTOR,
  LAFEA_T7C_IMPORT_WIZARD_ACTION_AUTHORITY,
  LAFEA_T7C_IMPORT_WIZARD_ACTIONS,
  LAFEA_T7C_IMPORT_WIZARD_MODEL_SCHEMA,
  LAFEA_T7C_IMPORT_WIZARD_SELECTION_SCHEMA,
  LAFEA_T7C_IMPORT_WIZARD_STATUS,
  LAFEA_TEMPLATE_WORKBENCH_IMPORT_AUTHORITY,
  attemptLafeaTemplateWorkbenchImport,
  createLafeaT7cImportWorkbenchRegistration,
  mountLafeaT7cImportWizard,
  mountLafeaT7cWorkbenchImportPanel,
} from '../src/workspace/lafea-templates/t7c-workbench-import.js';

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

  remove() {}

  click() {
    this.listeners.get('click')?.();
  }
}

const transferSource = sourceFixture();
assert.equal(transferSource.units.moment, 'N·mm');
const transfer = createValidCompilationAttempt(
  'ALG-LOAD-REFERENCE-TRANSFER',
  loadTransferParameters(transferSource),
);
assert.equal(transfer.attempt.preview.compilation.handoff.stageSource.units.moment, 'N·mm');
assert.equal(geometryUnit(transfer.attempt.preview.compilation, 'moment'), 'N*mm');

const screening = createValidCompilationAttempt(
  'ALG-PIPE-SECTION-COMBINED',
  pipeSectionParameters(rawRequestFixture()),
);
assert.equal(
  screening.attempt.preview.compilation.handoff.stageSource
    .sourceEvidence.foundationModel.units.declared.moment,
  'N·mm',
);
assert.equal(geometryUnit(screening.attempt.preview.compilation, 'moment'), 'N*mm');

const store = createLafeaWorkbenchStore({ initialStage: 'LAFEA.1' });
const importCalls = [];
const importDocument = (...args) => {
  importCalls.push(args);
  return store.importDocument(...args);
};

const transferImport = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: transfer.attempt,
  retainedCompilationAttempt: transfer.attempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument,
});
assert.equal(transferImport.status, 'READY');
assert.equal(Object.isFrozen(transferImport), true);
assert.equal(transferImport.receipt.status, 'IMPORTED_FOR_EDITING');
assert.equal(Object.isFrozen(transferImport.receipt), true);
assert.equal(transferImport.receipt.entryStageId, 'LAFEA.1');
assert.equal(transferImport.receipt.executionPresent, false);
assert.equal(transferImport.receipt.lifecycleInitialized, false);
assert.equal(transferImport.receipt.lifecycleBindingStatus, 'UNINITIALIZED');
assert.equal(transferImport.receipt.workbenchStateSchema, 'lafea-workbench-state/v2');
assert.match(transferImport.receipt.workbenchStateIdentityHash, /^fnv1a64:[0-9a-f]{16}$/u);
assert.equal(importCalls.length, 1);
assert.equal(importCalls[0].length, 2);
assert.strictEqual(
  importCalls[0][0],
  transfer.attempt.preview.compilation.handoff.stageSource,
);
assert.equal(importCalls[0][1], 'LAFEA.1');
assert.equal(store.getState().schema, 'lafea-workbench-state/v2');
assert.equal(store.getState().activeStageId, 'LAFEA.1');
assert.equal(store.getState().stages['LAFEA.1'].execution, null);
assert.equal(store.getState().stages['LAFEA.1'].lifecycle, null);
assert.equal(
  store.getState().stages['LAFEA.1'].lifecycleBinding.status,
  'UNINITIALIZED',
);

const screeningImport = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: screening.attempt,
  retainedCompilationAttempt: screening.attempt,
  currentDraftSemanticHash: screening.draft.semanticHash,
  importDocument,
});
assert.equal(screeningImport.status, 'READY');
assert.equal(screeningImport.receipt.entryStageId, 'LAFEA.2');
assert.equal(importCalls.length, 2);
assert.equal(importCalls[1].length, 2);
assert.strictEqual(
  importCalls[1][0],
  screening.attempt.preview.compilation.handoff.stageSource,
);
assert.equal(importCalls[1][1], 'LAFEA.2');
assert.equal(store.getState().activeStageId, 'LAFEA.2');
assert.equal(store.getState().stages['LAFEA.2'].execution, null);
assert.equal(store.getState().stages['LAFEA.2'].lifecycle, null);
assert.equal(
  store.getState().stages['LAFEA.2'].lifecycleBinding.status,
  'UNINITIALIZED',
);
assert.notEqual(
  transferImport.receipt.importedDocumentSemanticHash,
  screeningImport.receipt.importedDocumentSemanticHash,
);

const callCountBeforeBlockedParents = importCalls.length;
const detachedRetainedAttempt = Object.freeze({ ...transfer.attempt });
const retainedIdentityMismatch = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: transfer.attempt,
  retainedCompilationAttempt: detachedRetainedAttempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument,
});
assert.equal(retainedIdentityMismatch.status, 'BLOCKED');
assert.equal(
  retainedIdentityMismatch.errorCode,
  'T7C_RETAINED_COMPILATION_ATTEMPT_IDENTITY_MISMATCH',
);
assert.equal(importCalls.length, callCountBeforeBlockedParents);

const mutableAttempt = { ...transfer.attempt };
const mutable = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: mutableAttempt,
  retainedCompilationAttempt: mutableAttempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument,
});
assert.equal(mutable.status, 'BLOCKED');
assert.equal(mutable.errorCode, 'T7C_T7B_ATTEMPT_MUST_BE_FROZEN');
assert.equal(importCalls.length, callCountBeforeBlockedParents);

const mutablePreview = { ...transfer.attempt.preview };
const mutablePreviewAttemptBase = {
  ...transfer.attempt,
  preview: mutablePreview,
};
delete mutablePreviewAttemptBase.semanticHash;
const mutablePreviewAttempt = Object.freeze({
  ...mutablePreviewAttemptBase,
  semanticHash: semanticHash(mutablePreviewAttemptBase),
});
const mutablePreviewResult = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: mutablePreviewAttempt,
  retainedCompilationAttempt: mutablePreviewAttempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument,
});
assert.equal(mutablePreviewResult.status, 'BLOCKED');
assert.equal(mutablePreviewResult.errorCode, 'T7C_T7B_PREVIEW_MUST_BE_FROZEN');
assert.equal(importCalls.length, callCountBeforeBlockedParents);

const stale = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: transfer.attempt,
  retainedCompilationAttempt: transfer.attempt,
  currentDraftSemanticHash: 'fnv1a64:0000000000000000',
  importDocument,
});
assert.equal(stale.status, 'BLOCKED');
assert.equal(stale.errorCode, 'T7C_COMPILATION_ATTEMPT_STALE');
assert.equal(importCalls.length, callCountBeforeBlockedParents);

const forgedAttempt = Object.freeze({
  ...transfer.attempt,
  semanticHash: 'fnv1a64:0000000000000000',
});
const forged = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: forgedAttempt,
  retainedCompilationAttempt: forgedAttempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument,
});
assert.equal(forged.status, 'BLOCKED');
assert.equal(forged.errorCode, 'T7C_T7B_ATTEMPT_HASH_INVALID');
assert.equal(importCalls.length, callCountBeforeBlockedParents);

const blockedCompilation = attemptLafeaTemplateCompilationPreview(
  transfer.parameterSchema,
  transfer.draft,
  null,
);
const blocked = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: blockedCompilation,
  retainedCompilationAttempt: blockedCompilation,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument,
});
assert.equal(blocked.status, 'BLOCKED');
assert.equal(blocked.errorCode, 'T7C_READY_COMPILATION_ATTEMPT_REQUIRED');
assert.equal(importCalls.length, callCountBeforeBlockedParents);

let failedImportCalls = 0;
const failed = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: transfer.attempt,
  retainedCompilationAttempt: transfer.attempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument(...args) {
    failedImportCalls += 1;
    assert.equal(args.length, 2);
    return deepFreeze({
      schema: 'lafea-workbench-state/v2',
      activeStageId: 'LAFEA.1',
      status: 'FAILED',
      stages: {},
      diagnostics: [],
    });
  },
});
assert.equal(failed.status, 'BLOCKED');
assert.equal(failed.errorCode, 'T7C_WORKBENCH_IMPORT_NOT_READY');
assert.equal(failedImportCalls, 1);
assert.equal(failed.receipt, null);

const forgedSchemaStore = createLafeaWorkbenchStore({ initialStage: 'LAFEA.1' });
let forgedSchemaCalls = 0;
const forgedStateSchema = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: transfer.attempt,
  retainedCompilationAttempt: transfer.attempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument(...args) {
    forgedSchemaCalls += 1;
    assert.equal(args.length, 2);
    const state = forgedSchemaStore.importDocument(...args);
    return deepFreeze({ ...state, schema: 'forged-workbench-state/v2' });
  },
});
assert.equal(forgedStateSchema.status, 'BLOCKED');
assert.equal(forgedStateSchema.errorCode, 'T7C_WORKBENCH_STATE_SCHEMA_INVALID');
assert.equal(forgedSchemaCalls, 1);
assert.equal(forgedStateSchema.receipt, null);

const lifecycleStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.1',
  initialDocument: transfer.attempt.preview.compilation.handoff.stageSource,
});
const lifecycleInitializedState = lifecycleStore.initializeLifecycle(
  'sha256:t7c-preexisting-source',
  'T7C-PREEXISTING-SOURCE-AUTHORITY',
);
assert.equal(lifecycleInitializedState.stages['LAFEA.1'].lifecycleBinding.status, 'CURRENT');
let lifecycleImportCalls = 0;
const lifecycleObserved = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: transfer.attempt,
  retainedCompilationAttempt: transfer.attempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument(...args) {
    lifecycleImportCalls += 1;
    assert.equal(args.length, 2);
    return lifecycleStore.importDocument(...args);
  },
});
assert.equal(lifecycleObserved.status, 'READY');
assert.equal(lifecycleImportCalls, 1);
assert.equal(lifecycleObserved.receipt.lifecycleInitialized, true);
assert.ok([
  'CURRENT',
  'STALE_DOCUMENT_REVISION',
  'REVALIDATION_REQUIRED',
].includes(lifecycleObserved.receipt.lifecycleBindingStatus));
assert.notEqual(lifecycleObserved.receipt.lifecycleBindingStatus, 'UNINITIALIZED');
assert.ok(lifecycleObserved.receipt.diagnostics.includes(
  'LIFECYCLE_METHODS_NOT_INVOKED_BY_T7C',
));
assert.ok(lifecycleObserved.receipt.diagnostics.includes(
  'OBSERVED_LIFECYCLE_BINDING_RECORDED',
));

const bindingStore = createLafeaWorkbenchStore({ initialStage: 'LAFEA.1' });
let forgedBindingCalls = 0;
const forgedBinding = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: transfer.attempt,
  retainedCompilationAttempt: transfer.attempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument(...args) {
    forgedBindingCalls += 1;
    assert.equal(args.length, 2);
    const state = bindingStore.importDocument(...args);
    const stage = state.stages['LAFEA.1'];
    return deepFreeze({
      ...state,
      stages: {
        ...state.stages,
        'LAFEA.1': {
          ...stage,
          lifecycleBinding: {
            ...stage.lifecycleBinding,
            status: 'FORGED_BINDING_STATUS',
          },
        },
      },
    });
  },
});
assert.equal(forgedBinding.status, 'BLOCKED');
assert.equal(
  forgedBinding.errorCode,
  'T7C_WORKBENCH_LIFECYCLE_BINDING_STATUS_INVALID',
);
assert.equal(forgedBindingCalls, 1);
assert.equal(forgedBinding.receipt, null);

const inconsistentStore = createLafeaWorkbenchStore({ initialStage: 'LAFEA.1' });
let inconsistentBindingCalls = 0;
const inconsistentBinding = attemptLafeaTemplateWorkbenchImport({
  compilationAttempt: transfer.attempt,
  retainedCompilationAttempt: transfer.attempt,
  currentDraftSemanticHash: transfer.draft.semanticHash,
  importDocument(...args) {
    inconsistentBindingCalls += 1;
    assert.equal(args.length, 2);
    const state = inconsistentStore.importDocument(...args);
    const stage = state.stages['LAFEA.1'];
    return deepFreeze({
      ...state,
      stages: {
        ...state.stages,
        'LAFEA.1': {
          ...stage,
          lifecycleBinding: {
            ...stage.lifecycleBinding,
            status: 'CURRENT',
          },
        },
      },
    });
  },
});
assert.equal(inconsistentBinding.status, 'BLOCKED');
assert.equal(
  inconsistentBinding.errorCode,
  'T7C_WORKBENCH_LIFECYCLE_BINDING_INCONSISTENT',
);
assert.equal(inconsistentBindingCalls, 1);
assert.equal(inconsistentBinding.receipt, null);

const wizardDocument = new FakeDocument();
const wizardRoot = new FakeElement('section', wizardDocument);
const wizard = mountLafeaT7cImportWizard(wizardRoot, {
  selectedTemplateId: 'ALG-LOAD-REFERENCE-TRANSFER',
});
const wizardModel = wizard.getModel();
assert.equal(wizardModel.schema, LAFEA_T7C_IMPORT_WIZARD_MODEL_SCHEMA);
assert.strictEqual(wizardModel.actions, LAFEA_T7C_IMPORT_WIZARD_ACTIONS);
assert.equal(wizardModel.actions.workbenchImport, true);
assert.equal(wizardModel.actions.engineExecution, false);
assert.equal(wizardModel.actions.lifecycleInitialization, false);
assert.equal(wizardModel.actions.lifecycleRegistration, false);
assert.equal(wizardModel.actions.resultDisplayBinding, false);
assert.equal(wizardModel.selection.schema, LAFEA_T7C_IMPORT_WIZARD_SELECTION_SCHEMA);
assert.equal(wizardModel.selection.actionAuthority, LAFEA_T7C_IMPORT_WIZARD_ACTION_AUTHORITY);
assert.equal(wizardModel.selection.integrationStatus, LAFEA_T7C_IMPORT_WIZARD_STATUS);
assert.ok(wizardModel.selection.limitations.some(
  (value) => value.includes('Import of the current compiler-produced handoff is active'),
));
assert.equal(wizardModel.selection.limitations.some(
  (value) => value.includes('workbench import and engine execution remain disabled'),
), false);
wizard.destroy();

const panelDocument = new FakeDocument();
const panelRoot = new FakeElement('section', panelDocument);
const panelStore = createLafeaWorkbenchStore({ initialStage: 'LAFEA.1' });
const panelCalls = [];
const panel = mountLafeaT7cWorkbenchImportPanel(
  panelRoot,
  { selectedTemplateId: 'ALG-LOAD-REFERENCE-TRANSFER' },
  (...args) => {
    panelCalls.push(args);
    return panelStore.importDocument(...args);
  },
);
assert.equal(Object.prototype.hasOwnProperty.call(panel, 'importDocument'), false);
assert.equal('importDocument' in panel, false);
applyRawParameters(panel, transfer.parameterSchema, transfer.rawParameters);
assert.equal(panel.validateCurrentDraft().status, 'VALID');
assert.equal(panel.compileCurrentPreview().status, 'READY');
assert.equal(panel.importCurrentPreview().status, 'READY');
assert.equal(panelCalls.length, 1);
assert.equal(panelCalls[0].length, 2);
const firstTransferReceipt = panel.getWorkbenchImportReceipt();
assert.equal(firstTransferReceipt.entryStageId, 'LAFEA.1');

assert.equal(panel.compileCurrentPreview().status, 'READY');
assert.equal(panel.getWorkbenchImportReceipt(), null);
assert.equal(panel.importCurrentPreview().status, 'READY');
assert.equal(panelCalls.length, 2);
const retainedTransferReceipt = panel.getWorkbenchImportReceipt();
assert.equal(retainedTransferReceipt.entryStageId, 'LAFEA.1');
assert.notStrictEqual(retainedTransferReceipt, firstTransferReceipt);

panel.wizard.selectTemplate('ALG-PIPE-SECTION-COMBINED');
applyRawParameters(panel, screening.parameterSchema, screening.rawParameters);
assert.equal(panel.validateCurrentDraft().status, 'VALID');
assert.equal(panel.compileCurrentPreview().status, 'READY');
assert.equal(panel.importCurrentPreview().status, 'READY');
assert.equal(panelCalls.length, 3);
assert.equal(panelCalls[2].length, 2);
const screeningPanelReceipt = panel.getWorkbenchImportReceipt();
assert.equal(screeningPanelReceipt.entryStageId, 'LAFEA.2');

panel.wizard.selectTemplate('ALG-LOAD-REFERENCE-TRANSFER');
assert.strictEqual(panel.getWorkbenchImportReceipt(), retainedTransferReceipt);
panel.wizard.selectTemplate('ALG-PIPE-SECTION-COMBINED');
assert.strictEqual(panel.getWorkbenchImportReceipt(), screeningPanelReceipt);

const screeningDescriptor = screening.parameterSchema.parameters[0];
const screeningEnvelope = screening.rawParameters[screeningDescriptor.parameterId];
panel.updateField(
  screeningDescriptor.parameterId,
  patchFor(screeningDescriptor, screeningEnvelope),
);
assert.equal(panel.getWorkbenchImportReceipt(), null);
assert.equal(panel.getCompilationPreview(), null);

panel.wizard.selectTemplate('ALG-LOAD-REFERENCE-TRANSFER');
assert.strictEqual(panel.getWorkbenchImportReceipt(), retainedTransferReceipt);
panel.clearCurrentDraft();
assert.equal(panel.getWorkbenchImportReceipt(), null);
assert.equal(panel.getCompilationPreview(), null);
panel.destroy();

const registration = createLafeaT7cImportWorkbenchRegistration({
  workbenchOptions: { initialStage: 'LAFEA.1' },
  importPanelOptions: { selectedTemplateId: 'ALG-LOAD-REFERENCE-TRANSFER' },
});
assert.strictEqual(registration.authority, LAFEA_TEMPLATE_WORKBENCH_IMPORT_AUTHORITY);
assert.equal(registration.mountOptions.accessoryPanels.length, 1);
assert.throws(
  () => createLafeaT7cImportWorkbenchRegistration({
    workbenchOptions: { accessoryPanels: [] },
  }),
  /must not supply accessoryPanels/u,
);

let managerGetStateCalls = 0;
let managerImportCalls = 0;
let panelDestroyCount = 0;
const countedDescriptor = Object.freeze({
  ...LAFEA_T7C_IMPORT_ACCESSORY_PANEL_DESCRIPTOR,
  mount(context) {
    const handle = LAFEA_T7C_IMPORT_ACCESSORY_PANEL_DESCRIPTOR.mount(context);
    return Object.freeze({
      destroy() {
        panelDestroyCount += 1;
        handle.destroy();
      },
    });
  },
});
const failingDescriptor = Object.freeze({
  schema: countedDescriptor.schema,
  panelId: 'T7C_NEIGHBOR_FAILURE',
  label: 'T7C neighbor failure',
  order: 50,
  mount() {
    const error = new Error('T7C_NEIGHBOR_MOUNT_REJECTED');
    error.code = 'T7C_NEIGHBOR_MOUNT_REJECTED';
    throw error;
  },
});
const managerDocument = new FakeDocument();
const manager = createLafeaAccessoryPanelManager(managerDocument, [
  countedDescriptor,
  failingDescriptor,
]);
const managerSnapshot = manager.mount({
  getState() {
    managerGetStateCalls += 1;
    return Object.freeze({});
  },
  importDocument() {
    managerImportCalls += 1;
    throw new Error('IMPORT_NOT_EXPECTED_DURING_MOUNT');
  },
});
assert.ok(managerSnapshot.diagnostics.some(
  (entry) => entry.code === 'T7C_NEIGHBOR_MOUNT_REJECTED',
));
assert.equal(managerGetStateCalls, 0);
assert.equal(managerImportCalls, 0);
manager.destroy();
manager.destroy();
assert.equal(panelDestroyCount, 1);

console.log(JSON.stringify({
  check: 'lafea-template-t7c-workbench-import',
  status: 'PASS',
  sourceMomentUnit: transferSource.units.moment,
  resultMomentUnit: geometryUnit(transfer.attempt.preview.compilation, 'moment'),
  analyticalImportReady: true,
  screeningImportReady: true,
  exactFacadeArgumentCount: 2,
  sourceHashArguments: 0,
  retainedAttemptIdentityRequired: true,
  mutableAttemptBlockedBeforeImport: true,
  mutablePreviewBlockedBeforeImport: true,
  staleParentsBlockedBeforeImport: true,
  forgedParentsBlockedBeforeImport: true,
  blockedPreviewsBlockedBeforeImport: true,
  failedImportContained: true,
  forgedStateSchemaRejected: true,
  preexistingLifecycleObserved: true,
  malformedLifecycleBindingRejected: true,
  inconsistentLifecycleBindingRejected: true,
  rawImportFacadeExposed: false,
  panelReceiptInvalidatedOnRecompile: true,
  panelReceiptInvalidatedOnDraftMutation: true,
  panelReceiptInvalidatedOnClear: true,
  perTemplateReceiptIsolation: true,
  truthfulWizardModel: true,
  neighboringFailureContained: true,
  managerGetStateCalls,
  managerImportCalls,
  engineExecutionPaths: 0,
  lifecycleInitializationPaths: 0,
  lifecycleRegistrationPaths: 0,
  resultDisplayBindingPaths: 0,
  releasePromotionPaths: 0,
}, null, 2));

function createValidCompilationAttempt(templateId, rawParameters) {
  const parameterSchema = requireT6AParameterSchema(templateId);
  let draft = createLafeaTemplateParameterDraft(parameterSchema);
  for (const descriptor of parameterSchema.parameters) {
    draft = updateLafeaTemplateParameterDraft(
      parameterSchema,
      draft,
      descriptor.parameterId,
      patchFor(descriptor, rawParameters[descriptor.parameterId]),
    );
  }
  const validation = validateLafeaTemplateParameterDraft(parameterSchema, draft);
  assert.equal(validation.status, 'VALID');
  const attempt = attemptLafeaTemplateCompilationPreview(
    parameterSchema,
    draft,
    validation,
  );
  assert.equal(attempt.status, 'READY');
  return { parameterSchema, rawParameters, draft, validation, attempt };
}

function applyRawParameters(panel, parameterSchema, rawParameters) {
  for (const descriptor of parameterSchema.parameters) {
    panel.updateField(
      descriptor.parameterId,
      patchFor(descriptor, rawParameters[descriptor.parameterId]),
    );
  }
}

function patchFor(descriptor, envelopeValue) {
  return {
    present: true,
    valueInput: serializeValue(descriptor.valueKind, envelopeValue.value),
    unit: envelopeValue.unit,
    sourceRefInput: envelopeValue.sourceRef === null
      ? ''
      : JSON.stringify(envelopeValue.sourceRef),
    sourceStatus: envelopeValue.sourceStatus,
  };
}

function serializeValue(valueKind, value) {
  if (valueKind === 'JSON_RECORD') return JSON.stringify(value);
  if (valueKind === 'BOOLEAN') return value ? 'true' : 'false';
  return String(value);
}

function geometryUnit(compilation, dimension) {
  const record = compilation.geometry.units.find((row) => row.dimension === dimension);
  assert.ok(record, `Missing geometry unit for ${dimension}.`);
  return record.unit;
}

function loadTransferParameters(source) {
  return {
    identity: envelope({
      modelIdentity: source.modelIdentity,
      modelVersion: source.modelVersion,
      sourceModelIdentity: source.sourceAncestry.sourceModelIdentity,
      sourceVersion: source.sourceAncestry.sourceVersion,
      adapterIdentity: 'LAFEA-TEMPLATE-ANALYTICAL-COMPILER',
      adapterVersion: '1',
    }, 'identity'),
    units: envelope(source.units, 'units'),
    pipeContext: envelope({
      outsideDiameter: source.pipeGeometry.outsideDiameter,
      pipeCoordinateSystem: source.pipeCoordinateSystem,
      materials: source.materials,
      thicknessBasis: source.thicknessBasis,
    }, 'pipe-context'),
    loadTransfer: envelope({
      loadReferencePoints: source.loadReferencePoints,
      loadCases: source.loadCases,
    }, 'load-transfer'),
    qualificationProfile: envelope(source.qualificationProfile, 'qualification-profile'),
    limitations: envelope({ values: [] }, null, null),
  };
}

function pipeSectionParameters(raw) {
  return {
    requestIdentity: envelope(raw.requestIdentity, 'request-identity'),
    requestVersion: envelope(raw.requestVersion, 'request-version'),
    sourceEvidence: envelope(raw.sourceEvidence, 'foundation-source-evidence'),
    screeningCases: envelope({ values: raw.screeningCases }, 'screening-cases'),
    evaluationLocations: envelope({ values: raw.evaluationLocations }, 'evaluation-locations'),
    envelopeQuantities: envelope(
      { values: raw.resultRequests.envelopeQuantities },
      'envelope-quantities',
    ),
    qualificationProfile: envelope(raw.qualificationProfile, 'qualification-profile'),
    limitations: envelope({ values: raw.limitations }, null, null),
  };
}

function envelope(value, path, sourceStatus = 'IMPORTED') {
  return {
    value,
    unit: null,
    sourceRef: path === null ? null : { document: 'T7C-CHECK', path },
    sourceStatus,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
