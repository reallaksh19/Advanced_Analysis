import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  createLafeaLiveTemplateWizardModel,
  LafeaLiveTemplateWizardController,
  LafeaLiveTemplateWizardView,
} from './live-wizard.js';
import { createLafeaTemplateWizardModel } from './wizard-model.js';

export const LAFEA_T7A_PARAMETER_WIZARD_MODEL_SCHEMA =
  'lafea-t7a-parameter-wizard-model/v1';
export const LAFEA_T7A_PARAMETER_WIZARD_SELECTION_SCHEMA =
  'lafea-t7a-parameter-wizard-selection/v1';
export const LAFEA_T7A_PARAMETER_WIZARD_STATUS =
  'PARAMETER_DRAFT_VALIDATION_ONLY';
export const LAFEA_T7A_PARAMETER_WIZARD_ACTION_AUTHORITY =
  'PARAMETER_DRAFT_VALIDATION_ONLY';
export const LAFEA_T7A_PARAMETER_WIZARD_ACTIONS = deepFreeze({
  compilerInvocation: false,
  engineExecution: false,
  lifecycleRegistration: false,
  parameterEntry: true,
  parameterValidation: true,
  releasePromotion: false,
  selectionOnly: false,
  templateSelection: true,
  workbenchImport: false,
});

const T6C_PARAMETER_BLOCKER =
  'Live workbench composition is active through the governed accessory-panel seam; parameter entry, compilation, document import and engine execution remain disabled.';
const T7A_PARAMETER_LIMITATION =
  'Parameter drafting and governed validation are active; compilation, document import and engine execution remain disabled.';

export class LafeaT7aParameterWizardController extends LafeaLiveTemplateWizardController {
  constructor(rootElement, options = {}) {
    super(rootElement, options);
    this.view = new LafeaT7aParameterWizardView(rootElement);
  }

  refresh(notify) {
    const standaloneModel = createLafeaTemplateWizardModel({
      catalogModel: this.catalogModel,
      query: this.query,
      selectedTemplateId: this.selectedTemplateId,
    });
    const liveModel = createLafeaLiveTemplateWizardModel(standaloneModel);
    this.model = createLafeaT7aParameterWizardModel(liveModel);
    this.view.render(this.model, this.catalogModel);
    if (notify && this.onSelectionChange) {
      this.onSelectionChange(this.model.selection, this.model);
    }
  }
}

export class LafeaT7aParameterWizardView extends LafeaLiveTemplateWizardView {
  header() {
    const header = create(this.documentRef, 'header', 'lafea-template-wizard__header');
    header.append(
      textNode(this.documentRef, 'span', 'panel-eyebrow', 'LAFEA application templates'),
      textNode(this.documentRef, 'h2', null, 'Template selection and parameter drafting'),
      textNode(
        this.documentRef,
        'p',
        'lafea-template-wizard__notice',
        'Template selection, parameter drafting and governed validation are enabled. Compilation, document import and engine execution remain disabled.',
      ),
      textNode(
        this.documentRef,
        'p',
        null,
        'T7A produces inspectable parameter sets only; it does not create a stage handoff.',
      ),
    );
    return header;
  }
}

export function mountLafeaT7aParameterWizard(rootElement, options) {
  return new LafeaT7aParameterWizardController(rootElement, options).init();
}

export function createLafeaT7aParameterWizardModel(liveModel) {
  if (!liveModel || typeof liveModel !== 'object' || Array.isArray(liveModel)) {
    throw new TypeError('Live template wizard model is required.');
  }
  const selection = liveModel.selection === null
    ? null
    : createT7aSelection(liveModel.selection);
  const base = {
    ...liveModel,
    schema: LAFEA_T7A_PARAMETER_WIZARD_MODEL_SCHEMA,
    actions: LAFEA_T7A_PARAMETER_WIZARD_ACTIONS,
    selection,
  };
  delete base.semanticHash;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function createT7aSelection(liveSelection) {
  const limitations = liveSelection.limitations
    .filter((value) => value !== T6C_PARAMETER_BLOCKER);
  if (!limitations.includes(T7A_PARAMETER_LIMITATION)) {
    limitations.push(T7A_PARAMETER_LIMITATION);
  }
  const base = {
    ...liveSelection,
    schema: LAFEA_T7A_PARAMETER_WIZARD_SELECTION_SCHEMA,
    actionAuthority: LAFEA_T7A_PARAMETER_WIZARD_ACTION_AUTHORITY,
    integrationStatus: LAFEA_T7A_PARAMETER_WIZARD_STATUS,
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
