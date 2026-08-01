import {
  LafeaT7bCompilationPreviewPanelController,
} from './compilation-preview-panel.js';
import {
  LAFEA_TEMPLATE_WORKBENCH_IMPORT_AUTHORITY,
  attemptLafeaTemplateWorkbenchImport,
} from './workbench-import.js';
import { mountLafeaT7cImportWizard } from './workbench-import-wizard.js';

export const LAFEA_T7C_IMPORT_PANEL_SCHEMA =
  'lafea-t7c-import-panel/v1';
export const LAFEA_T7C_IMPORT_PANEL_STATUS =
  'CURRENT_HANDOFF_IMPORT_ONLY';

const IMPORT_DOCUMENT_FACADES = new WeakMap();
const T7B_PARAMETER_NOTICE =
  'Parameter envelopes must validate before compilation. Compilation and handoff inspection are enabled; workbench import and engine execution remain disabled.';
const T7C_PARAMETER_NOTICE =
  'Parameters must validate before compilation. Current handoff import is enabled; engine execution, lifecycle authority, result binding and release promotion remain disabled.';
const T7B_COMPILATION_NOTICE =
  'Compilation preview is non-executable. The generated handoff is retained for inspection only and is not imported into the workbench.';
const T7C_COMPILATION_NOTICE =
  'Compilation preview remains non-executable. Its current governed handoff may be imported into the workbench for editing only.';

export class LafeaT7cWorkbenchImportPanelController
  extends LafeaT7bCompilationPreviewPanelController {
  constructor(rootElement, options = {}, importDocument) {
    super(rootElement, options);
    if (typeof importDocument !== 'function') {
      throw new TypeError('T7C importDocument facade method is required.');
    }
    IMPORT_DOCUMENT_FACADES.set(this, importDocument);
    this.importAttempts = new Map();
  }

  init() {
    if (this.destroyed) throw new TypeError('T7C_IMPORT_PANEL_DESTROYED');
    if (this.wizard) return this;
    const shell = create(this.documentRef, 'section', 'lafea-template-import-panel');
    shell.dataset.role = 'lafea-template-import-panel';
    shell.dataset.schema = LAFEA_T7C_IMPORT_PANEL_SCHEMA;

    this.catalogHost = create(this.documentRef, 'div', 'lafea-template-import-panel__catalog');
    this.catalogHost.dataset.role = 'lafea-template-import-catalog';
    this.parameterHost = create(this.documentRef, 'div', 'lafea-template-import-panel__editor');
    this.parameterHost.dataset.role = 'lafea-template-import-editor';
    shell.append(this.catalogHost, this.parameterHost);
    this.rootElement.replaceChildren(shell);

    this.wizard = mountLafeaT7cImportWizard(this.catalogHost, {
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
      schema: LAFEA_T7C_IMPORT_PANEL_SCHEMA,
      status: LAFEA_T7C_IMPORT_PANEL_STATUS,
      authority: LAFEA_TEMPLATE_WORKBENCH_IMPORT_AUTHORITY,
      workbenchImportAttempt:
        templateId === null ? null : this.importAttempts.get(templateId) ?? null,
    });
  }

  getWorkbenchImportReceipt() {
    return this.getState().workbenchImportAttempt?.receipt ?? null;
  }

  updateField(parameterId, patch) {
    this.invalidateCurrentImport();
    super.updateField(parameterId, patch);
  }

  clearCurrentDraft() {
    this.invalidateCurrentImport();
    super.clearCurrentDraft();
  }

  compileCurrentPreview() {
    this.invalidateCurrentImport();
    return super.compileCurrentPreview();
  }

  importCurrentPreview() {
    if (!this.selection?.selectionAllowed) return null;
    const templateId = this.selection.templateId;
    const draft = this.drafts.get(templateId) ?? null;
    const retainedCompilationAttempt = this.compilationAttempts.get(templateId) ?? null;
    const importDocument = IMPORT_DOCUMENT_FACADES.get(this);
    if (typeof importDocument !== 'function') {
      throw new TypeError('T7C_IMPORT_DOCUMENT_FACADE_UNAVAILABLE');
    }
    const attempt = attemptLafeaTemplateWorkbenchImport({
      compilationAttempt: retainedCompilationAttempt,
      retainedCompilationAttempt: retainedCompilationAttempt,
      currentDraftSemanticHash: draft?.semanticHash ?? null,
      importDocument,
    });
    this.importAttempts.set(templateId, attempt);
    this.renderParameterEditor();
    return attempt;
  }

  renderParameterEditor() {
    super.renderParameterEditor();
    if (!this.parameterHost) return;
    replaceExactText(this.parameterHost, T7B_PARAMETER_NOTICE, T7C_PARAMETER_NOTICE);
    replaceExactText(this.parameterHost, T7B_COMPILATION_NOTICE, T7C_COMPILATION_NOTICE);
    if (!this.selection?.selectionAllowed) return;

    const templateId = this.selection.templateId;
    const draft = this.drafts.get(templateId) ?? null;
    const compilationAttempt = this.compilationAttempts.get(templateId) ?? null;
    const importAttempt = this.importAttempts.get(templateId) ?? null;
    const previewCurrent = Boolean(
      draft
      && compilationAttempt?.status === 'READY'
      && compilationAttempt.draftSemanticHash === draft.semanticHash
      && compilationAttempt.preview?.draftSemanticHash === draft.semanticHash,
    );

    const section = create(this.documentRef, 'section', 'lafea-template-workbench-import');
    section.dataset.role = 'lafea-template-workbench-import';
    section.append(
      textNode(this.documentRef, 'h2', null, 'Controlled workbench import'),
      textNode(
        this.documentRef,
        'p',
        'lafea-template-workbench-import__notice',
        'Only the current compiler-produced stage source is imported. No source hash is supplied, no engine is run, no lifecycle evidence is registered and no result display is bound.',
      ),
    );

    const action = button(
      this.documentRef,
      'Import current handoff',
      () => this.importCurrentPreview(),
    );
    action.dataset.role = 'lafea-template-workbench-import-run';
    action.disabled = !previewCurrent;
    section.append(action);

    if (!importAttempt) {
      section.append(textNode(
        this.documentRef,
        'p',
        null,
        previewCurrent
          ? 'A current compilation preview is ready for controlled import.'
          : 'Compile a current VALID parameter draft before importing its handoff.',
      ));
      this.parameterHost.append(section);
      return;
    }

    section.append(definitionList(this.documentRef, [
      ['Import attempt', importAttempt.status],
      ['Template', importAttempt.templateId],
      ['Current draft hash', importAttempt.currentDraftSemanticHash],
      ['Preview hash', importAttempt.previewSemanticHash ?? 'NONE'],
      ['Error code', importAttempt.errorCode ?? 'NONE'],
    ]));

    if (importAttempt.status === 'READY') {
      const receipt = importAttempt.receipt;
      section.append(definitionList(this.documentRef, [
        ['Receipt status', receipt.status],
        ['Imported stage', receipt.entryStageId],
        ['Imported document hash', receipt.importedDocumentSemanticHash],
        ['Handoff hash', receipt.handoffSemanticHash],
        ['Workbench status', receipt.workbenchStatus],
        ['Workbench state identity', receipt.workbenchStateIdentityHash],
        ['Execution present', receipt.executionPresent],
        ['Lifecycle initialized', receipt.lifecycleInitialized],
        ['Lifecycle binding status', receipt.lifecycleBindingStatus],
      ]));
      const diagnostics = create(this.documentRef, 'ul');
      receipt.diagnostics.forEach((item) => {
        diagnostics.append(textNode(this.documentRef, 'li', null, item));
      });
      section.append(diagnostics);
    } else {
      const diagnostics = create(this.documentRef, 'ul');
      importAttempt.diagnostics.forEach((item) => {
        diagnostics.append(textNode(this.documentRef, 'li', null, item));
      });
      section.append(diagnostics);
    }
    this.parameterHost.append(section);
  }

  destroy() {
    if (this.destroyed) return;
    this.importAttempts.clear();
    IMPORT_DOCUMENT_FACADES.delete(this);
    super.destroy();
  }

  invalidateCurrentImport() {
    const templateId = this.selection?.templateId ?? null;
    if (templateId !== null) this.importAttempts.delete(templateId);
  }
}

export function mountLafeaT7cWorkbenchImportPanel(
  rootElement,
  options,
  importDocument,
) {
  return new LafeaT7cWorkbenchImportPanelController(
    rootElement,
    options,
    importDocument,
  ).init();
}

function replaceExactText(node, before, after) {
  if (node.textContent === before) node.textContent = after;
  for (const child of node.children ?? []) replaceExactText(child, before, after);
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
