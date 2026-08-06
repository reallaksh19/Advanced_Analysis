import { diagnoseInputXmlLoad } from '../core/geometry/adapters/inputxml-load-diagnostics.js';
import { createAnalyzeLayout, renderLoadedBar, renderReport } from './analyze-view.js';

const PREFEA_AUTHORIZATION_REQUIRED = 'PREFEA_AUTHORIZATION_REQUIRED';

export class AnalyzeController {
  constructor(applicationRoot, documentRef) {
    if (!applicationRoot || typeof applicationRoot.append !== 'function') {
      throw new TypeError('AnalyzeController requires an application root element.');
    }
    this.applicationRoot = applicationRoot;
    this.documentRef = documentRef ?? applicationRoot.ownerDocument ?? document;
    this.fileName = null;
    this.report = null;
    this.error = null;
    this.sectionState = { restraints: true, topology: false, diagnostics: false, config: false };
    this.elements = null;
  }

  init() {
    this.elements = createAnalyzeLayout(this.documentRef);
    const subtitle = this.elements.root.querySelector('.ixa__subtitle');
    if (subtitle) {
      subtitle.textContent = 'Load a CAESAR II InputXML file to inspect parsed topology, restraint classification, load-time diagnostics, and governed pre-FEA readiness.';
    }
    this.applicationRoot.append(this.elements.root);
    this.wireDropzone();
    this.render();
    return this;
  }

  wireDropzone() {
    const { dropzone, fileInput } = this.elements;
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.loadFile(file);
      fileInput.value = '';
    });
    for (const eventName of ['dragenter', 'dragover']) {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.dataset.active = 'true';
      });
    }
    for (const eventName of ['dragleave', 'drop']) {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.dataset.active = 'false';
      });
    }
    dropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) this.loadFile(file);
    });
  }

  async loadFile(file) {
    this.error = null;
    try {
      const text = await file.text();
      this.report = diagnoseInputXmlLoad(text, { fileName: file.name });
      this.fileName = file.name;
      this.sectionState = { restraints: true, topology: false, diagnostics: false, config: false };
    } catch (error) {
      this.report = null;
      this.fileName = file.name;
      this.error = describeError(error, file.name);
    }
    this.render();
  }

  clear() {
    this.report = null;
    this.fileName = null;
    this.error = null;
    this.render();
  }

  toggleSection(key) {
    if (!(key in this.sectionState)) return;
    this.sectionState[key] = !this.sectionState[key];
    this.render();
  }

  render() {
    const { loadedBar, error, reportRoot } = this.elements;
    if (this.fileName) {
      renderLoadedBar(this.documentRef, loadedBar, {
        fileName: this.fileName,
        onReload: () => this.elements.fileInput.click(),
        onClear: () => this.clear(),
      });
    } else {
      loadedBar.hidden = true;
    }

    error.hidden = !this.error;
    error.textContent = this.error ?? '';

    reportRoot.replaceChildren();
    if (this.report) {
      renderReport(this.documentRef, reportRoot, this.report, this.sectionState, {
        solveState: Object.freeze({ status: 'idle' }),
        onSolve: failClosedAnalyzeSolve,
      });
      replaceResultantsWithAuthorizationNotice(this.documentRef, reportRoot);
      for (const section of reportRoot.querySelectorAll('[data-section-key]')) {
        const header = section.querySelector('.ixa__section-header');
        header.addEventListener('click', () => this.toggleSection(section.dataset.sectionKey));
      }
    }
  }
}

export function mountAnalyzePage(applicationRoot, documentRef) {
  return new AnalyzeController(applicationRoot, documentRef).init();
}

function replaceResultantsWithAuthorizationNotice(documentRef, reportRoot) {
  const resultants = [...reportRoot.querySelectorAll('.ixa__section')].find(
    (section) => section.querySelector('.ixa__section-title')?.textContent?.trim() === 'Resultants',
  );
  if (!resultants) {
    throw new Error('ANALYZE_RESULTANTS_SECTION_NOT_FOUND');
  }

  const header = documentRef.createElement('div');
  header.className = 'ixa__section-header';
  header.style.cursor = 'default';
  const title = documentRef.createElement('h2');
  title.className = 'ixa__section-title';
  title.textContent = 'Solve authorization';
  header.append(title);

  const body = documentRef.createElement('div');
  body.className = 'ixa__section-body';
  const notice = documentRef.createElement('p');
  notice.className = 'ixa__dropzone-hint';
  notice.textContent = `${PREFEA_AUTHORIZATION_REQUIRED}: Raw InputXML execution is disabled. This page is diagnostics-only until a prepared source, sealed authorization, and explicit solver executor are supplied through the governed gateway.`;
  body.append(notice);

  resultants.replaceChildren(header, body);
}

function failClosedAnalyzeSolve() {
  const error = new Error('Raw InputXML analysis requires governed pre-FEA authorization and an explicit executor.');
  error.code = PREFEA_AUTHORIZATION_REQUIRED;
  throw error;
}

function describeError(error, fileName) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('requires options.unit')) {
    return `${fileName}: this file has no <UNITS><LENGTH> declaration and no unit was supplied. Real CAESAR InputXML exports normally declare units; this file may not be a valid InputXML export, or its unit block was stripped.`;
  }
  return `${fileName}: ${message}`;
}
