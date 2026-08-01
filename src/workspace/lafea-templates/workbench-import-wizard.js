import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  createLafeaLiveTemplateWizardModel,
} from './live-wizard.js';
import {
  LafeaT7bCompilationWizardController,
  LafeaT7bCompilationWizardView,
  createLafeaT7bCompilationWizardModel,
} from './compilation-preview-wizard.js';
import { createLafeaTemplateWizardModel } from './wizard-model.js';
import { createLafeaT7aParameterWizardModel } from './parameter-wizard.js';

export const LAFEA_T7C_IMPORT_WIZARD_MODEL_SCHEMA =
  'lafea-t7c-import-wizard-model/v1';
export const LAFEA_T7C_IMPORT_WIZARD_SELECTION_SCHEMA =
  'lafea-t7c-import-wizard-selection/v1';
export const LAFEA_T7C_IMPORT_WIZARD_STATUS =
  'CURRENT_HANDOFF_IMPORT_ONLY';
export const LAFEA_T7C_IMPORT_WIZARD_ACTION_AUTHORITY =
  'CURRENT_HANDOFF_IMPORT_ONLY';
export const LAFEA_T7C_IMPORT_WIZARD_ACTIONS = deepFreeze({
  compilerInvocation: true,
  compilationInspection: true,
  engineExecution: false,
  handoffInspection: true,
  lifecycleInitialization: false,
  lifecycleRegistration: false,
  parameterEntry: true,
  parameterValidation: true,
  releasePromotion: false,
  resultDisplayBinding: false,
  selectionOnly: false,
  templateSelection: true,
  workbenchImport: true,
});

const T7B_IMPORT_BLOCKER =
  'Compilation and governed handoff inspection are active for VALID parameter sets; workbench import and engine execution remain disabled.';
const T7C_IMPORT_LIMITATION =
  'Import of the current compiler-produced handoff is active; engine execution, lifecycle authority, result binding and release promotion remain disabled.';

export class LafeaT7cImportWizardController extends LafeaT7bCompilationWizardController {
  constructor(rootElement, options = {}) {
    super(rootElement, options);
    this.view = new LafeaT7cImportWizardView(rootElement);
  }

  refresh(notify) {
    const standaloneModel = createLafeaTemplateWizardModel({
      catalogModel: this.catalogModel,
      query: this.query,
      selectedTemplateId: this.selectedTemplateId,
    });
    const liveModel = createLafeaLiveTemplateWizardModel(standaloneModel);
    const parameterModel = createLafeaT7aParameterWizardModel(liveModel);
    const compilationModel = createLafeaT7bCompilationWizardModel(parameterModel);
    this.model = createLafeaT7cImportWizardModel(compilationModel);
    this.view.render(this.model, this.catalogModel);
    if (notify && this.onSelectionChange) {
      this.onSelectionChange(this.model.selection, this.model);
    }
  }
}

export class LafeaT7cImportWizardView extends LafeaT7bCompilationWizardView {
  header() {
    const header = create(this.documentRef, 'header', 'lafea-template-wizard__header');
    header.append(
      textNode(this.documentRef, 'span', 'panel-eyebrow', 'LAFEA application templates'),
      textNode(this.documentRef, 'h2', null, 'Template handoff import'),
      textNode(
        this.documentRef,
        'p',
        'lafea-template-wizard__notice',
        'Template selection, parameter drafting, validation, compilation preview and controlled workbench import are enabled. Engine execution remains disabled.',
      ),
      textNode(
        this.documentRef,
        'p',
        null,
        'T7C imports only the current compiler-produced stage source. It does not initialize lifecycle authority, run an engine, bind results or promote a release.',
      ),
    );
    return header;
  }
}

export function mountLafeaT7cImportWizard(rootElement, options) {
  return new LafeaT7cImportWizardController(rootElement, options).init();
}

export function createLafeaT7cImportWizardModel(compilationModel) {
  if (!compilationModel || typeof compilationModel !== 'object' || Array.isArray(compilationModel)) {
    throw new TypeError('T7B compilation wizard model is required.');
  }
  const selection = compilationModel.selection === null
    ? null
    : createT7cSelection(compilationModel.selection);
  const base = {
    ...compilationModel,
    schema: LAFEA_T7C_IMPORT_WIZARD_MODEL_SCHEMA,
    actions: LAFEA_T7C_IMPORT_WIZARD_ACTIONS,
    selection,
  };
  delete base.semanticHash;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function createT7cSelection(compilationSelection) {
  const limitations = compilationSelection.limitations
    .filter((value) => value !== T7B_IMPORT_BLOCKER);
  if (!limitations.includes(T7C_IMPORT_LIMITATION)) {
    limitations.push(T7C_IMPORT_LIMITATION);
  }
  const base = {
    ...compilationSelection,
    schema: LAFEA_T7C_IMPORT_WIZARD_SELECTION_SCHEMA,
    actionAuthority: LAFEA_T7C_IMPORT_WIZARD_ACTION_AUTHORITY,
    integrationStatus: LAFEA_T7C_IMPORT_WIZARD_STATUS,
    limitations: deepFreeze(limitations),
  };
  delete base.semanticHash;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function textNode(documentRef, tagName, className, text) {
  const node = create(documentRef, tagName, className);
  node.textContent = text;
  return node;
}

function create(documentRef, tagName, className = null) {
  const node = documentRef.createElement(tagName);
  if (className) node.className = className;
  return node;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
