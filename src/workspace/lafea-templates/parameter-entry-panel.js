import {
  LAFEA_TEMPLATE_SOURCE_STATUSES,
} from '../../core/lafea-application-templates/contracts.js';
import {
  LAFEA_T6A_STANDALONE_CATALOG_MODEL,
  requireT6AParameterSchema,
} from './wizard-model.js';
import {
  createEmptyLafeaTemplateCatalogQuery,
} from './catalog-query.js';
import { mountLafeaLiveTemplateWizard } from './live-wizard.js';
import {
  clearLafeaTemplateParameterDraft,
  createLafeaTemplateParameterDraft,
  updateLafeaTemplateParameterDraft,
  validateLafeaTemplateParameterDraft,
} from './parameter-draft.js';

export const LAFEA_TEMPLATE_PARAMETER_PANEL_SCHEMA =
  'lafea-template-parameter-panel/v1';
export const LAFEA_TEMPLATE_PARAMETER_PANEL_STATUS =
  'PARAMETER_DRAFT_VALIDATION_ONLY';

export const LAFEA_TEMPLATE_PARAMETER_PANEL_AUTHORITY = Object.freeze({
  liveUiComposition: true,
  templateSelection: true,
  parameterEntry: true,
  parameterValidation: true,
  compilerInvocation: false,
  workbenchImport: false,
  engineExecution: false,
  lifecycleRegistration: false,
  releasePromotion: false,
});

const OPTION_KEYS = Object.freeze([
  'catalogModel',
  'onParameterValidation',
  'onSelectionChange',
  'query',
  'selectedTemplateId',
]);

export class LafeaTemplateParameterPanelController {
  constructor(rootElement, options = {}) {
    if (!rootElement) throw new TypeError('Template parameter panel root is required.');
    this.options = normalizeLafeaTemplateParameterPanelOptions(options);
    this.rootElement = rootElement;
    this.documentRef = rootElement.ownerDocument ?? globalThis.document;
    this.catalogHost = null;
    this.parameterHost = null;
    this.wizard = null;
    this.selection = null;
    this.wizardModel = null;
    this.drafts = new Map();
    this.validations = new Map();
    this.destroyed = false;
  }

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

    this.wizard = mountLafeaLiveTemplateWizard(this.catalogHost, {
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

  getState() {
    const templateId = this.selection?.templateId ?? null;
    return Object.freeze({
      schema: LAFEA_TEMPLATE_PARAMETER_PANEL_SCHEMA,
      status: LAFEA_TEMPLATE_PARAMETER_PANEL_STATUS,
      authority: LAFEA_TEMPLATE_PARAMETER_PANEL_AUTHORITY,
      selectedTemplateId: templateId,
      draft: templateId === null ? null : this.drafts.get(templateId) ?? null,
      validation: templateId === null ? null : this.validations.get(templateId) ?? null,
    });
  }

  getParameterSet() {
    return this.getState().validation?.parameterSet ?? null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.wizard?.destroy();
    this.wizard = null;
    this.selection = null;
    this.wizardModel = null;
    this.drafts.clear();
    this.validations.clear();
    this.rootElement?.replaceChildren();
    this.catalogHost = null;
    this.parameterHost = null;
    this.rootElement = null;
  }

  applySelection(selection, model, notify) {
    this.selection = selection;
    this.wizardModel = model;
    if (selection?.selectionAllowed) {
      const schema = requireT6AParameterSchema(selection.templateId);
      if (!this.drafts.has(selection.templateId)) {
        this.drafts.set(
          selection.templateId,
          createLafeaTemplateParameterDraft(schema),
        );
      }
    }
    this.renderParameterEditor();
    if (notify && this.options.onSelectionChange) {
      this.options.onSelectionChange(selection, model);
    }
  }

  updateField(parameterId, patch) {
    if (!this.selection?.selectionAllowed) return;
    const schema = requireT6AParameterSchema(this.selection.templateId);
    const draft = this.drafts.get(this.selection.templateId);
    this.drafts.set(
      this.selection.templateId,
      updateLafeaTemplateParameterDraft(schema, draft, parameterId, patch),
    );
    this.validations.delete(this.selection.templateId);
    this.renderParameterEditor();
  }

  validateCurrentDraft() {
    if (!this.selection?.selectionAllowed) return null;
    const schema = requireT6AParameterSchema(this.selection.templateId);
    const draft = this.drafts.get(this.selection.templateId);
    const validation = validateLafeaTemplateParameterDraft(schema, draft);
    this.validations.set(this.selection.templateId, validation);
    this.renderParameterEditor();
    if (this.options.onParameterValidation) {
      this.options.onParameterValidation(validation.parameterSet, validation);
    }
    return validation;
  }

  clearCurrentDraft() {
    if (!this.selection?.selectionAllowed) return;
    const schema = requireT6AParameterSchema(this.selection.templateId);
    this.drafts.set(this.selection.templateId, clearLafeaTemplateParameterDraft(schema));
    this.validations.delete(this.selection.templateId);
    this.renderParameterEditor();
  }

  renderParameterEditor() {
    if (!this.parameterHost) return;
    const section = create(this.documentRef, 'section', 'lafea-template-parameter-editor');
    section.dataset.role = 'lafea-template-parameter-drafting';
    section.append(
      textNode(this.documentRef, 'h2', null, 'Parameter drafting and validation'),
      textNode(
        this.documentRef,
        'p',
        'lafea-template-parameter-editor__notice',
        'Parameter envelopes are validated only. Compilation, workbench import and engine execution remain disabled.',
      ),
    );

    if (this.selection === null) {
      section.append(textNode(
        this.documentRef,
        'p',
        null,
        'Select a preparation-authorized template to draft parameters.',
      ));
      this.parameterHost.replaceChildren(section);
      return;
    }

    if (!this.selection.selectionAllowed) {
      section.append(textNode(
        this.documentRef,
        'p',
        null,
        'Parameter entry is unavailable because this template is outside the preparation-authorized set.',
      ));
      this.parameterHost.replaceChildren(section);
      return;
    }

    const schema = requireT6AParameterSchema(this.selection.templateId);
    const draft = this.drafts.get(this.selection.templateId);
    const validation = this.validations.get(this.selection.templateId) ?? null;
    section.append(
      definitionList(this.documentRef, [
        ['Template', this.selection.templateId],
        ['Parameter schema', schema.parameterSchemaId],
        ['Draft status', validation?.status ?? 'NOT_VALIDATED'],
      ]),
    );

    const form = create(this.documentRef, 'div', 'lafea-template-parameter-editor__form');
    form.dataset.role = 'lafea-template-parameter-form';
    for (const descriptor of schema.parameters) {
      const field = draft.fields.find((item) => item.parameterId === descriptor.parameterId);
      form.append(this.parameterField(descriptor, field));
    }
    section.append(form);

    const actions = create(this.documentRef, 'div', 'lafea-template-parameter-editor__actions');
    const validate = button(
      this.documentRef,
      'Validate parameters',
      () => this.validateCurrentDraft(),
    );
    validate.dataset.role = 'lafea-template-parameter-validate';
    const clear = button(
      this.documentRef,
      'Clear parameter draft',
      () => this.clearCurrentDraft(),
    );
    clear.dataset.role = 'lafea-template-parameter-clear';
    actions.append(validate, clear);
    section.append(actions);

    const result = create(this.documentRef, 'section', 'lafea-template-parameter-editor__result');
    result.dataset.role = 'lafea-template-parameter-validation';
    result.append(textNode(
      this.documentRef,
      'h3',
      null,
      validation ? `Validation — ${validation.status}` : 'Validation not run',
    ));
    if (validation) {
      const list = create(this.documentRef, 'ul');
      if (validation.diagnostics.length === 0) {
        list.append(textNode(this.documentRef, 'li', null, 'No validation diagnostics.'));
      } else {
        validation.diagnostics.forEach((item) => {
          list.append(textNode(this.documentRef, 'li', null, item));
        });
      }
      result.append(list);
    }
    section.append(result);
    this.parameterHost.replaceChildren(section);
  }

  parameterField(descriptor, field) {
    const fieldset = create(this.documentRef, 'fieldset', 'lafea-template-parameter-editor__field');
    fieldset.dataset.parameterId = descriptor.parameterId;
    fieldset.append(textNode(
      this.documentRef,
      'legend',
      null,
      `${descriptor.label} — ${descriptor.parameterId}`,
    ));

    const valueControl = valueInput(this.documentRef, descriptor, field.valueInput);
    valueControl.dataset.role = 'lafea-template-parameter-value';
    valueControl.dataset.parameterId = descriptor.parameterId;
    valueControl.addEventListener('change', () => {
      this.updateField(descriptor.parameterId, {
        valueInput: valueControl.value,
        present: true,
      });
    });
    fieldset.append(labelled(
      this.documentRef,
      `Value (${descriptor.valueKind})`,
      valueControl,
    ));

    if (descriptor.canonicalUnit !== null || descriptor.allowedUnits.length > 0) {
      const unitControl = unitInput(this.documentRef, descriptor, field.unit);
      unitControl.dataset.role = 'lafea-template-parameter-unit';
      unitControl.dataset.parameterId = descriptor.parameterId;
      unitControl.addEventListener('change', () => {
        this.updateField(descriptor.parameterId, {
          unit: unitControl.value || null,
          present: true,
        });
      });
      fieldset.append(labelled(this.documentRef, 'Unit', unitControl));
    }

    const sourceStatus = create(this.documentRef, 'select');
    appendOption(this.documentRef, sourceStatus, '', 'Not declared', field.sourceStatus === null);
    LAFEA_TEMPLATE_SOURCE_STATUSES.forEach((status) => {
      appendOption(this.documentRef, sourceStatus, status, status, field.sourceStatus === status);
    });
    sourceStatus.dataset.role = 'lafea-template-parameter-source-status';
    sourceStatus.dataset.parameterId = descriptor.parameterId;
    sourceStatus.addEventListener('change', () => {
      this.updateField(descriptor.parameterId, {
        sourceStatus: sourceStatus.value || null,
        present: true,
      });
    });
    fieldset.append(labelled(
      this.documentRef,
      descriptor.sourceRequired ? 'Source status — required' : 'Source status — optional',
      sourceStatus,
    ));

    const sourceRef = create(this.documentRef, 'textarea');
    sourceRef.value = field.sourceRefInput;
    sourceRef.dataset.role = 'lafea-template-parameter-source-ref';
    sourceRef.dataset.parameterId = descriptor.parameterId;
    sourceRef.addEventListener('change', () => {
      this.updateField(descriptor.parameterId, {
        sourceRefInput: sourceRef.value,
        present: true,
      });
    });
    fieldset.append(labelled(this.documentRef, 'Source reference JSON', sourceRef));
    return fieldset;
  }
}

export function mountLafeaTemplateParameterPanel(rootElement, options) {
  return new LafeaTemplateParameterPanelController(rootElement, options).init();
}

export function normalizeLafeaTemplateParameterPanelOptions(value = {}) {
  requirePlainRecord(value, 'Template parameter panel options');
  rejectUnknownKeys(value, OPTION_KEYS, 'Template parameter panel options');
  for (const field of ['catalogModel', 'query']) {
    if (value[field] !== undefined && !Object.isFrozen(value[field])) {
      throw new TypeError(`${field} must be a frozen governed record when supplied.`);
    }
  }
  if (
    value.selectedTemplateId !== undefined
    && value.selectedTemplateId !== null
    && (
      typeof value.selectedTemplateId !== 'string'
      || !value.selectedTemplateId.trim()
      || value.selectedTemplateId !== value.selectedTemplateId.trim()
    )
  ) {
    throw new TypeError('selectedTemplateId must be canonical non-empty text.');
  }
  for (const field of ['onSelectionChange', 'onParameterValidation']) {
    if (
      value[field] !== undefined
      && value[field] !== null
      && typeof value[field] !== 'function'
    ) {
      throw new TypeError(`${field} must be a function, null or undefined.`);
    }
  }
  return Object.freeze({
    catalogModel: value.catalogModel ?? LAFEA_T6A_STANDALONE_CATALOG_MODEL,
    query: value.query ?? createEmptyLafeaTemplateCatalogQuery(),
    selectedTemplateId: value.selectedTemplateId ?? null,
    onSelectionChange: value.onSelectionChange ?? null,
    onParameterValidation: value.onParameterValidation ?? null,
  });
}

function valueInput(documentRef, descriptor, current) {
  if (descriptor.valueKind === 'JSON_RECORD') {
    const control = create(documentRef, 'textarea');
    control.value = current;
    return control;
  }
  if (descriptor.valueKind === 'BOOLEAN') {
    const control = create(documentRef, 'select');
    appendOption(documentRef, control, '', 'Not entered', current === '');
    appendOption(documentRef, control, 'true', 'true', current === 'true');
    appendOption(documentRef, control, 'false', 'false', current === 'false');
    return control;
  }
  if (descriptor.valueKind === 'ENUM') {
    const control = create(documentRef, 'select');
    appendOption(documentRef, control, '', 'Not entered', current === '');
    descriptor.enumValues.forEach((value) => {
      appendOption(documentRef, control, value, value, current === value);
    });
    return control;
  }
  const control = create(documentRef, 'input');
  control.type = 'text';
  control.value = current;
  return control;
}

function unitInput(documentRef, descriptor, current) {
  if (descriptor.allowedUnits.length > 0) {
    const control = create(documentRef, 'select');
    appendOption(documentRef, control, '', 'Not declared', current === null);
    descriptor.allowedUnits.forEach((value) => {
      appendOption(documentRef, control, value, value, current === value);
    });
    return control;
  }
  const control = create(documentRef, 'input');
  control.type = 'text';
  control.value = current ?? '';
  return control;
}

function appendOption(documentRef, select, value, label, selected) {
  const option = create(documentRef, 'option');
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  select.append(option);
}

function labelled(documentRef, labelText, control) {
  const label = create(documentRef, 'label');
  label.append(textNode(documentRef, 'span', null, labelText), control);
  return label;
}

function definitionList(documentRef, rows) {
  const list = create(documentRef, 'dl');
  rows.forEach(([term, description]) => {
    list.append(
      textNode(documentRef, 'dt', null, term),
      textNode(documentRef, 'dd', null, String(description)),
    );
  });
  return list;
}

function button(documentRef, label, callback) {
  const control = create(documentRef, 'button');
  control.type = 'button';
  control.textContent = label;
  control.addEventListener('click', callback);
  return control;
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

function requirePlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain record.`);
  }
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new TypeError(`${label} contains unknown keys: ${unknown.sort().join(', ')}.`);
  }
}
