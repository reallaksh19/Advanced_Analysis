import {
  LafeaLiveTemplateWizardController,
  LafeaLiveTemplateWizardView,
} from './live-wizard.js';

export const LAFEA_T7A_PARAMETER_WIZARD_STATUS =
  'PARAMETER_DRAFT_VALIDATION_ONLY';

export class LafeaT7aParameterWizardController extends LafeaLiveTemplateWizardController {
  constructor(rootElement, options = {}) {
    super(rootElement, options);
    this.view = new LafeaT7aParameterWizardView(rootElement);
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
