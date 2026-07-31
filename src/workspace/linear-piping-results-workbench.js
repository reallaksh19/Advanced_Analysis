import {
  compileLinearPipingPresentation,
  createLinearPipingAuditJsonExport,
  createQualifiedLinearPipingEngineeringExports,
} from '../core/linear-piping-presentation/index.js';
import { requireLinearPipingQualifiedApplicationResult } from '../core/linear-piping-code-application/index.js';
import { renderLinearPipingResultsView } from './linear-piping-results-view.js';

export const LINEAR_PIPING_WORKSPACE_PACKAGE_SCHEMA = 'linear-piping-workspace-result-package/v1';
export const LINEAR_PIPING_WORKSPACE_PACKAGE_KEYS = Object.freeze([
  'schema',
  'applicationResult',
  'analysisResults',
  'interfaceSet',
  'interfaceRecoveries',
  'nozzleAssessments',
  'b31Application',
]);

/**
 * Mounts the current-only piping result surface in the active WORKSPACE view.
 *
 * The controller consumes sealed Phase 4/5 records. It does not compile a
 * mechanical model, solve, recover reactions, transform interface actions,
 * assess code stress or calculate nozzle utilization.
 */
export function mountLinearPipingResultsWorkbench(applicationRoot, options = {}) {
  if (!applicationRoot || typeof applicationRoot.querySelector !== 'function') {
    throw new TypeError('Linear piping results integration requires the application root.');
  }
  const panelContainer = applicationRoot.querySelector(
    '[data-panel="properties"] .panel-collapsible-content',
  );
  if (!panelContainer) {
    throw new TypeError('Linear piping results integration could not find the properties panel.');
  }
  const documentRef = options.documentRef ?? applicationRoot.ownerDocument ?? document;
  const urlApi = options.urlApi ?? documentRef.defaultView?.URL ?? globalThis.URL;
  const controller = new LinearPipingResultsWorkbenchController(
    panelContainer,
    documentRef,
    urlApi,
  );
  controller.init();
  return controller;
}

export class LinearPipingResultsWorkbenchController {
  constructor(panelContainer, documentRef, urlApi) {
    if (!panelContainer || typeof panelContainer.append !== 'function') {
      throw new TypeError('Linear piping results panel container is required.');
    }
    if (!documentRef || typeof documentRef.createElement !== 'function') {
      throw new TypeError('Linear piping results document is required.');
    }
    this.panelContainer = panelContainer;
    this.documentRef = documentRef;
    this.urlApi = urlApi;
    this.applicationResult = null;
    this.presentation = null;
    this.elements = null;
    this.message = 'Import a sealed linear piping result package.';
    this.error = '';
    this.initialized = false;
  }

  init() {
    if (this.initialized) return this;
    this.elements = createWorkbenchSection(this.documentRef);
    this.panelContainer.append(this.elements.section);
    this.elements.importButton.addEventListener('click', () => this.elements.fileInput.click());
    this.elements.fileInput.addEventListener('change', () => this.importSelectedFile());
    this.elements.clearButton.addEventListener('click', () => this.clear());
    this.elements.auditButton.addEventListener('click', () => this.downloadAuditExport());
    this.elements.engineeringButton.addEventListener('click', () => this.downloadEngineeringExports());
    this.initialized = true;
    this.render();
    return this;
  }

  loadPackage(value) {
    try {
      const accepted = requireWorkspacePackage(value);
      const applicationResult = requireLinearPipingQualifiedApplicationResult(
        accepted.applicationResult,
      );
      const presentation = compileLinearPipingPresentation({
        applicationResult,
        analysisResults: accepted.analysisResults,
        interfaceSet: accepted.interfaceSet,
        interfaceRecoveries: accepted.interfaceRecoveries,
        nozzleAssessments: accepted.nozzleAssessments,
        b31Application: accepted.b31Application,
      });
      this.applicationResult = applicationResult;
      this.presentation = presentation;
      this.error = '';
      this.message = [
        `Loaded ${presentation.applicationId}.`,
        `Status ${presentation.status}.`,
        `Export ${presentation.exportEligibility}.`,
      ].join(' ');
      this.render();
      return presentation;
    } catch (error) {
      this.applicationResult = null;
      this.presentation = null;
      this.message = 'No current linear piping result package is loaded.';
      this.error = errorMessage(error);
      this.render();
      throw error;
    }
  }

  clear() {
    this.applicationResult = null;
    this.presentation = null;
    this.error = '';
    this.message = 'Linear piping result package cleared.';
    if (this.elements) this.elements.fileInput.value = '';
    this.render();
  }

  getSnapshot() {
    return Object.freeze({
      status: this.presentation ? 'CURRENT' : 'EMPTY',
      applicationId: this.presentation?.applicationId ?? null,
      applicationResultSemanticHash: this.presentation?.applicationResultSemanticHash ?? null,
      presentationSemanticHash: this.presentation?.semanticHash ?? null,
      presentationEvidenceHash: this.presentation?.evidenceHash ?? null,
      qualificationStatus: this.presentation?.status ?? null,
      exportEligibility: this.presentation?.exportEligibility ?? null,
      message: this.message,
      error: this.error || null,
    });
  }

  getPresentation() {
    return this.presentation;
  }

  createAuditExport() {
    this.requireCurrent();
    return createLinearPipingAuditJsonExport(this.presentation, this.applicationResult);
  }

  createEngineeringExports() {
    this.requireCurrent();
    return createQualifiedLinearPipingEngineeringExports(
      this.presentation,
      this.applicationResult,
    );
  }

  downloadAuditExport() {
    this.attempt(() => {
      const record = this.createAuditExport();
      downloadRecord(this.documentRef, this.urlApi, record);
      this.message = `Downloaded ${record.fileName}.`;
    });
  }

  downloadEngineeringExports() {
    this.attempt(() => {
      const records = this.createEngineeringExports();
      for (const record of records) downloadRecord(this.documentRef, this.urlApi, record);
      this.message = `Downloaded ${records.length} qualified engineering exports.`;
    });
  }

  async importSelectedFile() {
    const file = this.elements?.fileInput.files?.[0];
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      this.loadPackage(value);
    } catch (error) {
      this.applicationResult = null;
      this.presentation = null;
      this.message = 'Imported package was rejected; prior results were cleared.';
      this.error = errorMessage(error);
      this.render();
    } finally {
      if (this.elements) this.elements.fileInput.value = '';
    }
  }

  render() {
    if (!this.elements) return;
    this.elements.status.textContent = this.message;
    this.elements.error.hidden = !this.error;
    this.elements.error.textContent = this.error;
    const hasCurrent = Boolean(this.presentation && this.applicationResult);
    this.elements.clearButton.disabled = !hasCurrent;
    this.elements.auditButton.disabled = !hasCurrent;
    this.elements.engineeringButton.disabled = !hasCurrent
      || this.presentation.exportEligibility !== 'ENGINEERING_EXPORT_ALLOWED';
    this.elements.section.dataset.current = hasCurrent ? 'true' : 'false';
    this.elements.section.dataset.qualificationStatus = this.presentation?.status ?? 'EMPTY';
    if (hasCurrent) {
      renderLinearPipingResultsView(
        this.elements.resultsRoot,
        this.presentation,
        this.applicationResult,
      );
      return;
    }
    const empty = this.documentRef.createElement('p');
    empty.className = 'linear-piping-results-workbench__empty';
    empty.textContent = 'No CURRENT sealed piping application result is loaded.';
    this.elements.resultsRoot.replaceChildren(empty);
  }

  attempt(action) {
    try {
      action();
      this.error = '';
    } catch (error) {
      this.error = errorMessage(error);
    }
    this.render();
  }

  requireCurrent() {
    if (!this.presentation || !this.applicationResult) {
      const error = new TypeError('A CURRENT sealed linear piping result package is required.');
      error.code = 'PIPING_WORKSPACE_RESULT_REQUIRED';
      throw error;
    }
  }

  destroy() {
    this.applicationResult = null;
    this.presentation = null;
    this.error = '';
    this.message = '';
    this.elements?.section.remove();
    this.elements = null;
    this.initialized = false;
  }
}

function requireWorkspacePackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failPackage('Result package must be a record.', 'PIPING_WORKSPACE_PACKAGE_RECORD_REQUIRED');
  }
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...LINEAR_PIPING_WORKSPACE_PACKAGE_KEYS].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failPackage('Result package keys are invalid.', 'PIPING_WORKSPACE_PACKAGE_KEYS_INVALID');
  }
  if (value.schema !== LINEAR_PIPING_WORKSPACE_PACKAGE_SCHEMA) {
    failPackage('Result package schema is invalid.', 'PIPING_WORKSPACE_PACKAGE_SCHEMA_INVALID');
  }
  return Object.freeze({ ...value });
}

function createWorkbenchSection(doc) {
  const section = doc.createElement('section');
  section.className = 'properties-accordion-section linear-piping-results-workbench';
  section.dataset.sectionId = 'linear-piping-results';
  section.dataset.role = 'linear-piping-results-workbench';

  const header = doc.createElement('header');
  header.className = 'accordion-section-header';
  const title = doc.createElement('span');
  title.className = 'accordion-section-title';
  title.textContent = 'Linear Piping FEA Results';
  const headerActions = doc.createElement('div');
  headerActions.className = 'accordion-header-actions';
  const toggle = doc.createElement('span');
  toggle.className = 'accordion-toggle-icon';
  toggle.textContent = '▼';
  headerActions.append(toggle);
  header.append(title, headerActions);

  const body = doc.createElement('div');
  body.className = 'accordion-section-body';
  const toolbar = doc.createElement('div');
  toolbar.className = 'linear-piping-results-workbench__toolbar';
  const importButton = button(doc, 'Import Sealed Result Package');
  importButton.dataset.action = 'import-linear-piping-results';
  const clearButton = button(doc, 'Clear');
  clearButton.dataset.action = 'clear-linear-piping-results';
  const auditButton = button(doc, 'Download Audit JSON');
  auditButton.dataset.action = 'download-linear-piping-audit';
  const engineeringButton = button(doc, 'Download Engineering CSVs');
  engineeringButton.dataset.action = 'download-linear-piping-engineering';
  const fileInput = doc.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  fileInput.dataset.role = 'linear-piping-result-package-file';
  toolbar.append(importButton, clearButton, auditButton, engineeringButton, fileInput);

  const status = doc.createElement('output');
  status.className = 'linear-piping-results-workbench__status';
  status.dataset.role = 'linear-piping-results-status';
  status.setAttribute('aria-live', 'polite');
  const error = doc.createElement('p');
  error.className = 'linear-piping-results-workbench__error';
  error.dataset.role = 'linear-piping-results-error';
  error.hidden = true;
  const resultsRoot = doc.createElement('div');
  resultsRoot.className = 'linear-piping-results-workbench__results';
  resultsRoot.dataset.role = 'linear-piping-results-root';
  body.append(toolbar, status, error, resultsRoot);
  section.append(header, body);
  return {
    section,
    importButton,
    clearButton,
    auditButton,
    engineeringButton,
    fileInput,
    status,
    error,
    resultsRoot,
  };
}

function button(doc, label) {
  const value = doc.createElement('button');
  value.type = 'button';
  value.textContent = label;
  return value;
}

function downloadRecord(doc, urlApi, record) {
  if (!urlApi || typeof urlApi.createObjectURL !== 'function'
    || typeof urlApi.revokeObjectURL !== 'function') {
    const error = new TypeError('Browser object URL API is unavailable.');
    error.code = 'PIPING_WORKSPACE_DOWNLOAD_API_UNAVAILABLE';
    throw error;
  }
  const blob = new Blob([record.content], { type: `${record.mediaType};charset=utf-8` });
  const href = urlApi.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = href;
  anchor.download = record.fileName;
  anchor.hidden = true;
  const parent = doc.body ?? doc.documentElement;
  parent.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    urlApi.revokeObjectURL(href);
  }
}

function failPackage(message, code) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function errorMessage(error) {
  const prefix = error?.code ? `${error.code}: ` : '';
  return `${prefix}${error?.message ?? String(error)}`;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
