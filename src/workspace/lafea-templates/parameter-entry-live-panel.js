import {
  LAFEA_TEMPLATE_PARAMETER_PANEL_SCHEMA,
  LafeaTemplateParameterPanelController,
} from './parameter-entry-panel.js';
import { mountLafeaT7aParameterWizard } from './parameter-wizard.js';

export class LafeaT7aParameterPanelController extends LafeaTemplateParameterPanelController {
  init() {
    if (this.destroyed) throw new TypeError('T7A_PARAMETER_PANEL_DESTROYED');
    if (this.wizard) return this;
    const shell = create(this.documentRef, 'section', 'lafea-template-parameter-panel');
    shell.dataset.role = 'lafea-template-parameter-panel';
    shell.dataset.schema = LAFEA_TEMPLATE_PARAMETER_PANEL_SCHEMA;

    this.catalogHost = create(this.documentRef, 'div', 'lafea-template-parameter-panel__catalog');
    this.catalogHost.dataset.role = 'lafea-template-parameter-catalog';
    this.parameterHost = create(this.documentRef, 'div', 'lafea-template-parameter-panel__editor');
    this.parameterHost.dataset.role = 'lafea-template-parameter-editor';
    shell.append(this.catalogHost, this.parameterHost);
    this.rootElement.replaceChildren(shell);

    this.wizard = mountLafeaT7aParameterWizard(this.catalogHost, {
      catalogModel: this.options.catalogModel,
      query: this.options.query,
      selectedTemplateId: this.options.selectedTemplateId,
      onSelectionChange: (selection, model) => {
        this.applySelection(selection, model, true);
      },
    });
    const model = this.wizard.getModel();
    this.applySelection(model.selection, model, false);
    return this;
  }
}

export function mountLafeaT7aParameterPanel(rootElement, options) {
  return new LafeaT7aParameterPanelController(rootElement, options).init();
}

function create(documentRef, tagName, className = null) {
  const node = documentRef.createElement(tagName);
  if (className) node.className = className;
  return node;
}
