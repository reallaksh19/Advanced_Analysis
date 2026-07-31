import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  createLafeaLiveTemplateWizardModel,
} from './live-wizard.js';
import {
  LafeaT7aParameterWizardController,
  LafeaT7aParameterWizardView,
  createLafeaT7aParameterWizardModel,
} from './parameter-wizard.js';
import { createLafeaTemplateWizardModel } from './wizard-model.js';

export const LAFEA_T7B_COMPILATION_WIZARD_MODEL_SCHEMA =
  'lafea-t7b-compilation-wizard-model/v1';
export const LAFEA_T7B_COMPILATION_WIZARD_SELECTION_SCHEMA =
  'lafea-t7b-compilation-wizard-selection/v1';
export const LAFEA_T7B_COMPILATION_WIZARD_STATUS =
  'COMPILATION_PREVIEW_ONLY';
export const LAFEA_T7B_COMPILATION_WIZARD_ACTION_AUTHORITY =
  'COMPILATION_PREVIEW_ONLY';
export const LAFEA_T7B_COMPILATION_WIZARD_ACTIONS = deepFreeze({
  compilerInvocation: true,
  compilationInspection: true,
  engineExecution: false,
  handoffInspection: true,
  lifecycleRegistration: false,
  parameterEntry: true,
  parameterValidation: true,
  releasePromotion: false,
  selectionOnly: false,
  templateSelection: true,
  workbenchImport: false,
});

const T7A_COMPILATION_BLOCKER =
  'Parameter drafting and governed validation are active; compilation, document import and engine execution remain disabled.';
const T7B_COMPILATION_LIMITATION =
  'Compilation and governed handoff inspection are active for VALID parameter sets; workbench import and engine execution remain disabled.';

export class LafeaT7bCompilationWizardController extends LafeaT7aParameterWizardController {
  constructor(rootElement, options = {}) {
    super(rootElement, options);
    this.view = new LafeaT7bCompilationWizardView(rootElement);
  }

  refresh(notify) {
    const standaloneModel = createLafeaTemplateWizardModel({
      catalogModel: this.catalogModel,
      query: this.query,
      selectedTemplateId: this.selectedTemplateId,
    });
    const liveModel = createLafeaLiveTemplateWizardModel(standaloneModel);
    const parameterModel = createLafeaT7aParameterWizardModel(liveModel);
    this.model = createLafeaT7bCompilationWizardModel(parameterModel);
    this.view.render(this.model, this.catalogModel);
    if (notify && this.onSelectionChange) {
      this.onSelectionChange(this.model.selection, this.model);
    }
  }
}

export class LafeaT7bCompilationWizardView extends LafeaT7aParameterWizardView {
  header() {
    const header = create(this.documentRef, 'header', 'lafea-template-wizard__header');
    header.append(
      textNode(this.documentRef, 'span', 'panel-eyebrow', 'LAFEA application templates'),
      textNode(this.documentRef, 'h2', null, 'Template compilation preview'),
      textNode(
        this.documentRef,
        'p',
        'lafea-template-wizard__notice',
        'Template selection, parameter drafting, governed validation and compilation preview are enabled. Workbench import and engine execution remain disabled.',
      ),
      textNode(
        this.documentRef,
        'p',
        null,
        'T7B produces inspectable compilation and handoff artifacts only; it does not import or execute them.',
      ),
    );
    return header;
  }
}

export function mountLafeaT7bCompilationWizard(rootElement, options) {
  return new LafeaT7bCompilationWizardController(rootElement, options).init();
}

export function createLafeaT7bCompilationWizardModel(parameterModel) {
  if (!parameterModel || typeof parameterModel !== 'object' || Array.isArray(parameterModel)) {
    throw new TypeError('T7A parameter wizard model is required.');
  }
  const selection = parameterModel.selection === null
    ? null
    : createT7bSelection(parameterModel.selection);
  const base = {
    ...parameterModel,
    schema: LAFEA_T7B_COMPILATION_WIZARD_MODEL_SCHEMA,
    actions: LAFEA_T7B_COMPILATION_WIZARD_ACTIONS,
    selection,
  };
  delete base.semanticHash;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function createT7bSelection(parameterSelection) {
  const limitations = parameterSelection.limitations
    .filter((value) => value !== T7A_COMPILATION_BLOCKER);
  if (!limitations.includes(T7B_COMPILATION_LIMITATION)) {
    limitations.push(T7B_COMPILATION_LIMITATION);
  }
  const base = {
    ...parameterSelection,
    schema: LAFEA_T7B_COMPILATION_WIZARD_SELECTION_SCHEMA,
    actionAuthority: LAFEA_T7B_COMPILATION_WIZARD_ACTION_AUTHORITY,
    integrationStatus: LAFEA_T7B_COMPILATION_WIZARD_STATUS,
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
