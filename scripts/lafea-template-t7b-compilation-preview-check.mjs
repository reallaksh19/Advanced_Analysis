#!/usr/bin/env node
import assert from 'node:assert/strict';
import { sourceFixture } from './lafea.1-fixtures.mjs';
import {
  FORMULATIONS,
  MODEL_SCHEMA,
  QUALIFICATION_PROFILE,
} from '../src/core/local-continuum/index.js';
import {
  createLafeaAccessoryPanelManager,
} from '../src/workspace/lafea-workbench-accessory-panels.js';
import {
  validateLafeaAccessoryPanelDescriptor,
} from '../src/workspace/lafea-workbench.js';
import {
  requireT6AParameterSchema,
} from '../src/workspace/lafea-templates/wizard-model.js';
import {
  createLafeaTemplateParameterDraft,
  updateLafeaTemplateParameterDraft,
  validateLafeaTemplateParameterDraft,
} from '../src/workspace/lafea-templates/t7a-parameter-entry.js';
import {
  LAFEA_T7B_COMPILATION_ACCESSORY_PANEL_DESCRIPTOR,
  LAFEA_T7B_COMPILATION_WIZARD_ACTION_AUTHORITY,
  LAFEA_T7B_COMPILATION_WIZARD_ACTIONS,
  LAFEA_T7B_COMPILATION_WIZARD_MODEL_SCHEMA,
  LAFEA_T7B_COMPILATION_WIZARD_SELECTION_SCHEMA,
  LAFEA_T7B_COMPILATION_WIZARD_STATUS,
  LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
  attemptLafeaTemplateCompilationPreview,
  createLafeaT7bCompilationAccessoryPanelDescriptor,
  createLafeaT7bCompilationWorkbenchRegistration,
  createLafeaTemplateCompilationPreview,
  mountLafeaT7bCompilationPreviewPanel,
  mountLafeaT7bCompilationWizard,
} from '../src/workspace/lafea-templates/t7b-compilation-preview.js';

const T7A_COMPILATION_BLOCKER =
  'Parameter drafting and governed validation are active; compilation, document import and engine execution remain disabled.';

const analyticalTemplateId = 'ALG-LOAD-REFERENCE-TRANSFER';
const analyticalSchema = requireT6AParameterSchema(analyticalTemplateId);
const analyticalRaw = loadTransferParameters(sourceFixture());
const analyticalDraft = draftFromRaw(analyticalSchema, analyticalRaw);
const analyticalValidation = validateLafeaTemplateParameterDraft(
  analyticalSchema,
  analyticalDraft,
);
assert.equal(analyticalValidation.status, 'VALID');

const analyticalPreview = createLafeaTemplateCompilationPreview(
  analyticalSchema,
  analyticalDraft,
  analyticalValidation,
);
assert.equal(analyticalPreview.status, 'READY_FOR_INSPECTION');
assert.equal(analyticalPreview.templateId, analyticalTemplateId);
assert.equal(analyticalPreview.entryStageId, 'LAFEA.1');
assert.equal(analyticalPreview.compilation.status, 'READY');
assert.equal(analyticalPreview.compilation.handoff.status, 'READY');
assert.ok(analyticalPreview.compilation.handoff.diagnostics.includes('ENGINE_NOT_EXECUTED'));
assert.ok(analyticalPreview.diagnostics.includes('COMPILATION_PREVIEW_ONLY'));
assert.ok(analyticalPreview.diagnostics.includes('WORKBENCH_IMPORT_NOT_AUTHORIZED'));
assert.equal(Object.isFrozen(analyticalPreview), true);
assert.equal(Object.isFrozen(analyticalPreview.compilation), true);
assert.equal(Object.isFrozen(analyticalPreview.compilation.handoff), true);

const missingValidationAttempt = attemptLafeaTemplateCompilationPreview(
  analyticalSchema,
  analyticalDraft,
  null,
);
assert.equal(missingValidationAttempt.status, 'BLOCKED');
assert.equal(missingValidationAttempt.errorCode, 'T7B_VALID_PARAMETER_SET_REQUIRED');
assert.equal(missingValidationAttempt.preview, null);

const staleDraft = updateLafeaTemplateParameterDraft(
  analyticalSchema,
  analyticalDraft,
  'identity',
  {
    present: true,
    valueInput: JSON.stringify({
      ...analyticalRaw.identity.value,
      adapterVersion: '2',
    }),
    unit: null,
    sourceRefInput: JSON.stringify(analyticalRaw.identity.sourceRef),
    sourceStatus: analyticalRaw.identity.sourceStatus,
  },
);
const staleAttempt = attemptLafeaTemplateCompilationPreview(
  analyticalSchema,
  staleDraft,
  analyticalValidation,
);
assert.equal(staleAttempt.status, 'BLOCKED');
assert.equal(staleAttempt.errorCode, 'T7B_PARAMETER_VALIDATION_STALE');

const compilerInvalidRaw = validatorValidCompilerInvalidRaw(analyticalSchema);
const compilerInvalidDraft = draftFromRaw(analyticalSchema, compilerInvalidRaw);
const compilerInvalidValidation = validateLafeaTemplateParameterDraft(
  analyticalSchema,
  compilerInvalidDraft,
);
assert.equal(compilerInvalidValidation.status, 'VALID');
const compilerInvalidAttempt = attemptLafeaTemplateCompilationPreview(
  analyticalSchema,
  compilerInvalidDraft,
  compilerInvalidValidation,
);
assert.equal(compilerInvalidAttempt.status, 'BLOCKED');
assert.equal(compilerInvalidAttempt.preview, null);
assert.ok(compilerInvalidAttempt.diagnostics.length > 0);

const continuumTemplateId = 'C2D-LUG-PINHOLE';
const continuumSchema = requireT6AParameterSchema(continuumTemplateId);
const continuumRaw = continuumParameters(continuumTemplateId);
const continuumDraft = draftFromRaw(continuumSchema, continuumRaw);
const continuumValidation = validateLafeaTemplateParameterDraft(
  continuumSchema,
  continuumDraft,
);
assert.equal(continuumValidation.status, 'VALID');
const continuumPreview = createLafeaTemplateCompilationPreview(
  continuumSchema,
  continuumDraft,
  continuumValidation,
);
assert.equal(continuumPreview.status, 'READY_FOR_INSPECTION');
assert.equal(continuumPreview.entryStageId, 'LAFEA.3');
assert.notEqual(continuumPreview.compilation.meshRequest, null);
assert.ok(continuumPreview.compilation.meshRequest.diagnostics.includes(
  'TEMPLATE_COMPILER_GENERATED_MESH=false',
));
assert.equal(
  continuumPreview.compilation.geometry.ancestry.compilerGeneratedMesh,
  false,
);
assert.equal(
  continuumPreview.compilation.geometry.ancestry.meshQualificationClaimed,
  false,
);

assert.strictEqual(
  analyticalPreview.authority,
  LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
);
for (const field of [
  'compilerInvocation',
  'compilationInspection',
  'handoffInspection',
]) {
  assert.equal(analyticalPreview.authority[field], true);
}
for (const field of [
  'workbenchImport',
  'engineExecution',
  'lifecycleRegistration',
  'releasePromotion',
]) {
  assert.equal(analyticalPreview.authority[field], false);
}

const wizardDocument = new FakeDocument();
const wizardRoot = new FakeElement('section', wizardDocument);
const wizard = mountLafeaT7bCompilationWizard(wizardRoot, {
  selectedTemplateId: analyticalTemplateId,
});
const wizardModel = wizard.getModel();
assert.equal(wizardModel.schema, LAFEA_T7B_COMPILATION_WIZARD_MODEL_SCHEMA);
assert.strictEqual(wizardModel.actions, LAFEA_T7B_COMPILATION_WIZARD_ACTIONS);
assert.equal(wizardModel.actions.compilerInvocation, true);
assert.equal(wizardModel.actions.compilationInspection, true);
assert.equal(wizardModel.actions.handoffInspection, true);
assert.equal(wizardModel.actions.workbenchImport, false);
assert.equal(wizardModel.actions.engineExecution, false);
assert.equal(
  wizardModel.selection.schema,
  LAFEA_T7B_COMPILATION_WIZARD_SELECTION_SCHEMA,
);
assert.equal(
  wizardModel.selection.actionAuthority,
  LAFEA_T7B_COMPILATION_WIZARD_ACTION_AUTHORITY,
);
assert.equal(
  wizardModel.selection.integrationStatus,
  LAFEA_T7B_COMPILATION_WIZARD_STATUS,
);
assert.equal(
  wizardModel.selection.limitations.includes(T7A_COMPILATION_BLOCKER),
  false,
);
assert.ok(wizardModel.selection.limitations.some(
  (value) => value.includes('Compilation and governed handoff inspection are active'),
));
wizard.destroy();

const panelDocument = new FakeDocument();
const panelRoot = new FakeElement('section', panelDocument);
const panel = mountLafeaT7bCompilationPreviewPanel(panelRoot, {
  selectedTemplateId: analyticalTemplateId,
});
applyRawToPanel(panel, analyticalSchema, analyticalRaw);
const panelValidation = panel.validateCurrentDraft();
assert.equal(panelValidation.status, 'VALID');
const panelAttempt = panel.compileCurrentPreview();
assert.equal(panelAttempt.status, 'READY');
const retainedAnalyticalHash = panel.getCompilationPreview().semanticHash;
assert.equal(
  panel.getState().authority.compilerInvocation,
  true,
);
assert.equal(panel.getState().authority.workbenchImport, false);

panel.wizard.selectTemplate(continuumTemplateId);
assert.equal(panel.getState().selectedTemplateId, continuumTemplateId);
assert.equal(panel.getCompilationPreview(), null);
panel.wizard.selectTemplate(analyticalTemplateId);
assert.equal(panel.getCompilationPreview().semanticHash, retainedAnalyticalHash);

panel.updateField('identity', {
  present: true,
  valueInput: JSON.stringify({
    ...analyticalRaw.identity.value,
    adapterVersion: '3',
  }),
  unit: null,
  sourceRefInput: JSON.stringify(analyticalRaw.identity.sourceRef),
  sourceStatus: analyticalRaw.identity.sourceStatus,
});
assert.equal(panel.getState().compilationAttempt, null);
assert.equal(panel.getCompilationPreview(), null);
const panelText = collectText(panelRoot);
assert.match(panelText, /Compilation and handoff inspection/u);
assert.match(panelText, /workbench import and engine execution remain disabled/u);
assert.doesNotMatch(panelText, /compilation, document import and engine execution remain disabled/u);
panel.destroy();
panel.destroy();

const registration = createLafeaT7bCompilationWorkbenchRegistration({
  workbenchOptions: { initialStage: 'LAFEA.3' },
  compilationPanelOptions: { selectedTemplateId: analyticalTemplateId },
});
assert.equal(Object.isFrozen(registration), true);
assert.strictEqual(
  registration.authority,
  LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
);
assert.throws(
  () => createLafeaT7bCompilationWorkbenchRegistration({
    workbenchOptions: { accessoryPanels: [] },
  }),
  /must not supply accessoryPanels/u,
);
validateLafeaAccessoryPanelDescriptor(
  LAFEA_T7B_COMPILATION_ACCESSORY_PANEL_DESCRIPTOR,
);
validateLafeaAccessoryPanelDescriptor(registration.descriptor);

let panelMountCount = 0;
let panelDestroyCount = 0;
let getStateCalls = 0;
let importDocumentCalls = 0;
const countedDescriptor = countedPanelDescriptor(
  createLafeaT7bCompilationAccessoryPanelDescriptor({
    selectedTemplateId: analyticalTemplateId,
  }),
);
const failingDescriptor = Object.freeze({
  schema: countedDescriptor.schema,
  panelId: 'T7B_NEIGHBOR_FAILURE',
  label: 'T7B neighbor failure',
  order: 50,
  mount() {
    const error = new Error('T7B_NEIGHBOR_MOUNT_REJECTED');
    error.code = 'T7B_NEIGHBOR_MOUNT_REJECTED';
    throw error;
  },
});
const managerDocument = new FakeDocument();
const manager = createLafeaAccessoryPanelManager(managerDocument, [
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
    throw new Error('T7B_IMPORT_MUST_NOT_BE_CALLED');
  },
};
const mounted = manager.mount(controller);
assert.equal(panelMountCount, 1);
assert.equal(panelDestroyCount, 0);
assert.equal(getStateCalls, 0);
assert.equal(importDocumentCalls, 0);
assert.ok(mounted.diagnostics.some(
  (entry) => entry.code === 'T7B_NEIGHBOR_MOUNT_REJECTED',
));
manager.mount(controller);
assert.equal(panelMountCount, 1);
manager.destroy();
assert.equal(panelDestroyCount, 1);
manager.destroy();
assert.equal(panelDestroyCount, 1);
assert.equal(getStateCalls, 0);
assert.equal(importDocumentCalls, 0);

console.log(JSON.stringify({
  check: 'lafea-template-t7b-compilation-preview',
  status: 'PASS',
  analyticalCompilationPreview: true,
  continuumCompilationPreview: true,
  currentValidationRequired: true,
  staleValidationBlocked: true,
  compilerDomainFailureContained: true,
  independentPreviewRetention: true,
  draftMutationInvalidatesPreview: true,
  truthfulWizardModel: true,
  neighboringFailureContained: true,
  panelMountCount,
  panelDestroyCount,
  controllerFacadeMethodInvocations: getStateCalls + importDocumentCalls,
  compilerInvocationPaths: 2,
  workbenchImportPaths: 0,
  engineExecutionPaths: 0,
  lifecycleRegistrationPaths: 0,
  releasePromotionPaths: 0,
}, null, 2));

function draftFromRaw(parameterSchema, rawParameters) {
  let draft = createLafeaTemplateParameterDraft(parameterSchema);
  for (const descriptor of parameterSchema.parameters) {
    const envelope = rawParameters[descriptor.parameterId];
    draft = updateLafeaTemplateParameterDraft(
      parameterSchema,
      draft,
      descriptor.parameterId,
      draftPatch(descriptor, envelope),
    );
  }
  return draft;
}

function applyRawToPanel(panel, parameterSchema, rawParameters) {
  for (const descriptor of parameterSchema.parameters) {
    panel.updateField(
      descriptor.parameterId,
      draftPatch(descriptor, rawParameters[descriptor.parameterId]),
    );
  }
}

function draftPatch(descriptor, envelope) {
  return {
    present: true,
    valueInput: descriptor.valueKind === 'JSON_RECORD'
      ? JSON.stringify(envelope.value)
      : String(envelope.value),
    unit: envelope.unit,
    sourceRefInput: envelope.sourceRef === null
      ? ''
      : JSON.stringify(envelope.sourceRef),
    sourceStatus: envelope.sourceStatus,
  };
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
    }, 'identity', 'IMPORTED'),
    units: envelope(source.units, 'units', 'IMPORTED'),
    pipeContext: envelope({
      outsideDiameter: source.pipeGeometry.outsideDiameter,
      pipeCoordinateSystem: source.pipeCoordinateSystem,
      materials: source.materials,
      thicknessBasis: source.thicknessBasis,
    }, 'pipe-context', 'IMPORTED'),
    loadTransfer: envelope({
      loadReferencePoints: source.loadReferencePoints,
      loadCases: source.loadCases,
    }, 'load-transfer', 'IMPORTED'),
    qualificationProfile: envelope(
      source.qualificationProfile,
      'qualification-profile',
      'IMPORTED',
    ),
    limitations: envelope({ values: [] }, null, null),
  };
}

function validatorValidCompilerInvalidRaw(parameterSchema) {
  return Object.fromEntries(parameterSchema.parameters.map((descriptor) => [
    descriptor.parameterId,
    envelope(
      { declared: true, parameterId: descriptor.parameterId },
      descriptor.sourceRequired ? `INVALID#${descriptor.parameterId}` : null,
      descriptor.sourceRequired ? 'VERIFIED' : null,
    ),
  ]));
}

function continuumParameters(templateId) {
  return {
    applicationEvidence: envelope({
      geometryClass: 'LUG_PINHOLE',
      declarationBasis: 'CALLER_ENGINEERING_CLASSIFICATION',
      featureIds: ['LOAD-EDGE', 'ROOT-REGION'],
      sourceReference: `APPLICATION#${templateId}`,
    }, `PARAM#${templateId}#applicationEvidence`),
    stageSource: envelope(
      continuumSource(),
      `PARAM#${templateId}#stageSource`,
    ),
    meshProvenance: envelope({
      generationMode: 'CALLER_SUPPLIED_ANALYSIS_MESH',
      meshProfileId: 'CALLER-T6-MESH-PROFILE/V1',
      qualityProfileId: 'CALLER-T6-QUALITY-PROFILE/V1',
      producerIdentity: 'INDEPENDENT-CONTINUUM-MESHER',
      producerVersion: '1',
      sourceReference: `MESH#${templateId}`,
      sourceStatus: 'VERIFIED',
    }, `PARAM#${templateId}#meshProvenance`),
    featureSizing: envelope({
      items: [
        sizing('LOAD-EDGE', 8),
        sizing('ROOT-REGION', 4),
      ],
    }, `PARAM#${templateId}#featureSizing`),
    limitations: envelope(
      { items: ['NO_APPLICATION_GEOMETRY_INFERENCE'] },
      null,
      null,
    ),
  };
}

function continuumSource() {
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: 'T7B-CONTINUUM-SOURCE',
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: 'T7B-CALLER-SOURCE',
      sourceVersion: '1',
      adapterIdentity: 'T7B-CONTINUUM-INTAKE',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: FORMULATIONS.PLANE_STRESS,
    materials: [{
      materialId: 'MAT',
      elasticModulus: 200000,
      poissonRatio: 0.3,
      sourceReference: 'MATERIAL#MAT',
    }],
    nodes: [
      node('A', 0, 0),
      node('B', 100, 0),
      node('C', 0, 100),
      node('AB', 50, 0),
      node('BC', 50, 50),
      node('CA', 0, 50),
    ],
    elements: [{
      elementId: 'E1',
      elementType: 'T6',
      nodeIds: ['A', 'B', 'C', 'AB', 'BC', 'CA'],
      materialId: 'MAT',
      thickness: 10,
      sourceReference: 'ELEMENT#E1',
    }],
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'PRODUCTION_T6_REQUIRED',
    },
    constraints: [
      constraint('C1', 'A', 'UX', 0),
      constraint('C2', 'A', 'UY', 0),
      constraint('C3', 'B', 'UY', 0),
    ],
    loadCases: [{
      loadCaseId: 'LC1',
      nodalForces: [{
        loadId: 'F1',
        nodeId: 'B',
        fx: 1000,
        fy: 0,
        sourceReference: 'FORCE#F1',
      }],
      edgeTractions: [],
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: 'CASE#LC1',
    }],
    resultRequests: { loadCaseIds: ['LC1'] },
    qualificationProfile: clone(QUALIFICATION_PROFILE),
    limitations: [],
  };
}

function envelope(value, reference, sourceStatus = 'VERIFIED') {
  return {
    value,
    unit: null,
    sourceRef: reference === null ? null : { reference },
    sourceStatus,
  };
}

function sizing(featureId, targetSize) {
  return {
    featureId,
    targetSize,
    unit: 'mm',
    sourceRef: { reference: `SIZING#${featureId}` },
    status: 'VERIFIED',
  };
}

function node(nodeId, x, y) {
  return { nodeId, x, y, sourceReference: `NODE#${nodeId}` };
}

function constraint(constraintId, nodeId, dof, value) {
  return {
    constraintId,
    nodeId,
    dof,
    value,
    sourceReference: `CONSTRAINT#${constraintId}`,
  };
}

function countedPanelDescriptor(descriptor) {
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
