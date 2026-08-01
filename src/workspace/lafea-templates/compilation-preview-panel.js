import {
  LafeaT7aParameterPanelController,
} from './parameter-entry-live-panel.js';
import { requireT6AParameterSchema } from './wizard-model.js';
import {
  LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
  attemptLafeaTemplateCompilationPreview,
} from './compilation-preview.js';
import { mountLafeaT7bCompilationWizard } from './compilation-preview-wizard.js';

export const LAFEA_T7B_COMPILATION_PANEL_SCHEMA =
  'lafea-t7b-compilation-panel/v1';
export const LAFEA_T7B_COMPILATION_PANEL_STATUS =
  'COMPILATION_PREVIEW_ONLY';

const T7A_PARAMETER_NOTICE =
  'Parameter envelopes are validated only. Compilation, workbench import and engine execution remain disabled.';
const T7B_PARAMETER_NOTICE =
  'Parameter envelopes must validate before compilation. Compilation and handoff inspection are enabled; workbench import and engine execution remain disabled.';

export class LafeaT7bCompilationPreviewPanelController
  extends LafeaT7aParameterPanelController {
  constructor(rootElement, options = {}) {
    super(rootElement, options);
    this.compilationAttempts = new Map();
  }

  init() {
    if (this.destroyed) throw new TypeError('T7B_COMPILATION_PANEL_DESTROYED');
    if (this.wizard) return this;
    const shell = create(this.documentRef, 'section', 'lafea-template-compilation-panel');
    shell.dataset.role = 'lafea-template-compilation-panel';
    shell.dataset.schema = LAFEA_T7B_COMPILATION_PANEL_SCHEMA;

    this.catalogHost = create(this.documentRef, 'div', 'lafea-template-compilation-panel__catalog');
    this.catalogHost.dataset.role = 'lafea-template-compilation-catalog';
    this.parameterHost = create(this.documentRef, 'div', 'lafea-template-compilation-panel__editor');
    this.parameterHost.dataset.role = 'lafea-template-compilation-editor';
    shell.append(this.catalogHost, this.parameterHost);
    this.rootElement.replaceChildren(shell);

    this.wizard = mountLafeaT7bCompilationWizard(this.catalogHost, {
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
    const base = super.getState();
    const templateId = this.selection?.templateId ?? null;
    return Object.freeze({
      ...base,
      schema: LAFEA_T7B_COMPILATION_PANEL_SCHEMA,
      status: LAFEA_T7B_COMPILATION_PANEL_STATUS,
      authority: LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
      compilationAttempt:
        templateId === null ? null : this.compilationAttempts.get(templateId) ?? null,
    });
  }

  getCompilationPreview() {
    return this.getState().compilationAttempt?.preview ?? null;
  }

  updateField(parameterId, patch) {
    this.invalidateCurrentPreview();
    super.updateField(parameterId, patch);
  }

  clearCurrentDraft() {
    this.invalidateCurrentPreview();
    super.clearCurrentDraft();
  }

  compileCurrentPreview() {
    if (!this.selection?.selectionAllowed) return null;
    const templateId = this.selection.templateId;
    const parameterSchema = requireT6AParameterSchema(templateId);
    const draft = this.drafts.get(templateId);
    const validation = this.validations.get(templateId) ?? null;
    const attempt = attemptLafeaTemplateCompilationPreview(
      parameterSchema,
      draft,
      validation,
    );
    this.compilationAttempts.set(templateId, attempt);
    this.renderParameterEditor();
    return attempt;
  }

  renderParameterEditor() {
    super.renderParameterEditor();
    if (!this.parameterHost) return;
    replaceExactText(this.parameterHost, T7A_PARAMETER_NOTICE, T7B_PARAMETER_NOTICE);
    if (!this.selection?.selectionAllowed) return;

    const templateId = this.selection.templateId;
    const validation = this.validations.get(templateId) ?? null;
    const draft = this.drafts.get(templateId) ?? null;
    const attempt = this.compilationAttempts.get(templateId) ?? null;
    const validationCurrent = Boolean(
      validation
      && draft
      && validation.status === 'VALID'
      && validation.draftSemanticHash === draft.semanticHash,
    );

    const section = create(
      this.documentRef,
      'section',
      'lafea-template-compilation-preview',
    );
    section.dataset.role = 'lafea-template-compilation-preview';
    section.append(
      textNode(this.documentRef, 'h2', null, 'Compilation and handoff inspection'),
      textNode(
        this.documentRef,
        'p',
        'lafea-template-compilation-preview__notice',
        'Compilation preview is non-executable. The generated handoff is retained for inspection only and is not imported into the workbench.',
      ),
    );

    const action = button(
      this.documentRef,
      'Compile preview',
      () => this.compileCurrentPreview(),
    );
    action.dataset.role = 'lafea-template-compilation-run';
    action.disabled = !validationCurrent;
    section.append(action);

    if (!attempt) {
      section.append(textNode(
        this.documentRef,
        'p',
        null,
        validationCurrent
          ? 'Parameters are valid. Compilation preview has not been run.'
          : 'Validate the current parameter draft successfully before compilation.',
      ));
      this.parameterHost.append(section);
      return;
    }

    section.append(definitionList(this.documentRef, [
      ['Attempt status', attempt.status],
      ['Template', attempt.templateId],
      ['Draft hash', attempt.draftSemanticHash],
      ['Error code', attempt.errorCode ?? 'NONE'],
    ]));

    if (attempt.status === 'READY') {
      const preview = attempt.preview;
      section.append(definitionList(this.documentRef, [
        ['Preview status', preview.status],
        ['Entry stage', preview.entryStageId],
        ['Compilation hash', preview.compilationSemanticHash],
        ['Handoff hash', preview.handoffSemanticHash],
        ['Compiled parameter-set hash', preview.compiledParameterSetHash],
        ['Handoff status', preview.compilation.handoff.status],
      ]));
      const diagnostics = create(this.documentRef, 'ul');
      preview.diagnostics.forEach((item) => {
        diagnostics.append(textNode(this.documentRef, 'li', null, item));
      });
      section.append(diagnostics);
    } else {
      const diagnostics = create(this.documentRef, 'ul');
      attempt.diagnostics.forEach((item) => {
        diagnostics.append(textNode(this.documentRef, 'li', null, item));
      });
      section.append(diagnostics);
    }
    this.parameterHost.append(section);
  }

  destroy() {
    if (this.destroyed) return;
    this.compilationAttempts.clear();
    super.destroy();
  }

  invalidateCurrentPreview() {
    const templateId = this.selection?.templateId ?? null;
    if (templateId !== null) this.compilationAttempts.delete(templateId);
  }
}

export function mountLafeaT7bCompilationPreviewPanel(rootElement, options) {
  return new LafeaT7bCompilationPreviewPanelController(rootElement, options).init();
}

function replaceExactText(node, before, after) {
  if (node.textContent === before) node.textContent = after;
  for (const child of node.children ?? []) {
    replaceExactText(child, before, after);
  }
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
