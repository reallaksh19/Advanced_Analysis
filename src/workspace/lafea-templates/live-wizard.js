import { semanticHash } from '../../core/shared-piping-model/index.js';
import { LafeaTemplateWizardController } from './wizard-controller.js';
import { createLafeaTemplateWizardModel } from './wizard-model.js';
import { LafeaTemplateWizardView } from './wizard-view.js';

export const LAFEA_LIVE_TEMPLATE_WIZARD_MODEL_SCHEMA =
  'lafea-live-template-wizard-model/v1';
export const LAFEA_LIVE_TEMPLATE_WIZARD_SELECTION_SCHEMA =
  'lafea-live-template-wizard-selection/v1';
export const LAFEA_LIVE_TEMPLATE_WIZARD_INTEGRATION_STATUS =
  'LIVE_UI_COMPOSITION_ONLY';
export const LAFEA_LIVE_TEMPLATE_WIZARD_INTEGRATION = deepFreeze({
  issueNumber: 61,
  reference: 'Advanced_Analysis#61',
  status: 'RESOLVED_INTERFACE_MERGED',
});

const BLOCKED_LIMITATION =
  'Live workbench insertion remains blocked until Advanced_Analysis#61 is resolved.';
const LIVE_LIMITATION =
  'Live workbench composition is active through the governed accessory-panel seam; parameter entry, compilation, document import and engine execution remain disabled.';

export class LafeaLiveTemplateWizardController extends LafeaTemplateWizardController {
  constructor(rootElement, options = {}) {
    super(rootElement, options);
    this.view = new LafeaLiveTemplateWizardView(rootElement);
  }

  refresh(notify) {
    const sourceModel = createLafeaTemplateWizardModel({
      catalogModel: this.catalogModel,
      query: this.query,
      selectedTemplateId: this.selectedTemplateId,
    });
    this.model = createLafeaLiveTemplateWizardModel(sourceModel);
    this.view.render(this.model, this.catalogModel);
    if (notify && this.onSelectionChange) {
      this.onSelectionChange(this.model.selection, this.model);
    }
  }
}

export class LafeaLiveTemplateWizardView extends LafeaTemplateWizardView {
  header() {
    const header = create(this.documentRef, 'header', 'lafea-template-wizard__header');
    header.append(
      textNode(this.documentRef, 'span', 'panel-eyebrow', 'LAFEA application templates'),
      textNode(this.documentRef, 'h2', null, 'Read-only template selection wizard'),
      textNode(
        this.documentRef,
        'p',
        'lafea-template-wizard__notice',
        'Live workbench composition is active. Selection and evidence inspection only; parameter entry, compilation, document import and engine execution remain disabled.',
      ),
      textNode(
        this.documentRef,
        'p',
        null,
        `Accessory-panel interface ${LAFEA_LIVE_TEMPLATE_WIZARD_INTEGRATION.reference} is resolved and merged.`,
      ),
    );
    return header;
  }
}

export function mountLafeaLiveTemplateWizard(rootElement, options) {
  return new LafeaLiveTemplateWizardController(rootElement, options).init();
}

export function createLafeaLiveTemplateWizardModel(sourceModel) {
  if (!sourceModel || typeof sourceModel !== 'object' || Array.isArray(sourceModel)) {
    throw new TypeError('Source template wizard model is required.');
  }
  const selection = sourceModel.selection === null
    ? null
    : createLiveSelection(sourceModel.selection);
  const base = {
    ...sourceModel,
    schema: LAFEA_LIVE_TEMPLATE_WIZARD_MODEL_SCHEMA,
    selection,
    integrationIssue: LAFEA_LIVE_TEMPLATE_WIZARD_INTEGRATION,
  };
  delete base.semanticHash;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function createLiveSelection(sourceSelection) {
  const limitations = sourceSelection.limitations
    .filter((value) => value !== BLOCKED_LIMITATION);
  if (!limitations.includes(LIVE_LIMITATION)) limitations.push(LIVE_LIMITATION);
  const base = {
    ...sourceSelection,
    schema: LAFEA_LIVE_TEMPLATE_WIZARD_SELECTION_SCHEMA,
    integrationStatus: LAFEA_LIVE_TEMPLATE_WIZARD_INTEGRATION_STATUS,
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
