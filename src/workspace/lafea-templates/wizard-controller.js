import {
  createEmptyLafeaTemplateCatalogQuery,
  createLafeaTemplateCatalogQuery,
} from './catalog-query.js';
import {
  LAFEA_T6A_STANDALONE_CATALOG_MODEL,
  createLafeaTemplateWizardModel,
} from './wizard-model.js';
import {
  LAFEA_TEMPLATE_WIZARD_STYLES,
} from './wizard-constants.js';
import { LafeaTemplateWizardView } from './wizard-view.js';

export class LafeaTemplateWizardController {
  constructor(rootElement, options = {}) {
    if (!rootElement) throw new TypeError('Template wizard root element is required.');
    if (options !== null && (typeof options !== 'object' || Array.isArray(options))) {
      throw new TypeError('Template wizard options must be a record.');
    }
    this.rootElement = rootElement;
    this.documentRef = rootElement.ownerDocument ?? globalThis.document;
    this.catalogModel = options.catalogModel ?? LAFEA_T6A_STANDALONE_CATALOG_MODEL;
    this.query = options.query ?? createEmptyLafeaTemplateCatalogQuery();
    this.selectedTemplateId = options.selectedTemplateId ?? null;
    this.onSelectionChange = options.onSelectionChange ?? null;
    if (this.onSelectionChange !== null && typeof this.onSelectionChange !== 'function') {
      throw new TypeError('onSelectionChange must be a function or null.');
    }
    this.view = new LafeaTemplateWizardView(rootElement);
    this.model = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return this;
    installStyles(this.documentRef);
    this.view.init({
      onSearch: (value) => this.setFilter('text', value.trim() || null),
      onApplicationGroup: (value) => this.setFilter(
        'applicationGroups',
        value ? [value] : [],
      ),
      onStage: (value) => this.setFilter('stageIds', value ? [value] : []),
      onSelect: (templateId) => this.selectTemplate(templateId),
      onClearSelection: () => this.clearSelection(),
    });
    this.initialized = true;
    this.refresh(false);
    return this;
  }

  setQuery(query) {
    this.query = query;
    this.refresh(true);
    return this.model;
  }

  selectTemplate(templateId) {
    this.selectedTemplateId = templateId;
    this.refresh(true);
    return this.model.selection;
  }

  clearSelection() {
    this.selectedTemplateId = null;
    this.refresh(true);
    return this.model;
  }

  getModel() {
    return this.model;
  }

  destroy() {
    this.view.destroy();
    this.model = null;
    this.initialized = false;
    this.rootElement = null;
  }

  setFilter(field, value) {
    const input = queryInput(this.query);
    input[field] = value;
    this.query = createLafeaTemplateCatalogQuery(input);
    if (this.selectedTemplateId !== null) {
      const probe = createLafeaTemplateWizardModel({
        catalogModel: this.catalogModel,
        query: this.query,
        selectedTemplateId: null,
      });
      if (!probe.matchedTemplateIds.includes(this.selectedTemplateId)) {
        this.selectedTemplateId = null;
      }
    }
    this.refresh(true);
  }

  refresh(notify) {
    this.model = createLafeaTemplateWizardModel({
      catalogModel: this.catalogModel,
      query: this.query,
      selectedTemplateId: this.selectedTemplateId,
    });
    this.view.render(this.model, this.catalogModel);
    if (notify && this.onSelectionChange) {
      this.onSelectionChange(this.model.selection, this.model);
    }
  }
}

function queryInput(query) {
  return {
    text: query.text,
    applicationFamilies: [...query.applicationFamilies],
    applicationGroups: [...query.applicationGroups],
    bucketIds: [...query.bucketIds],
    stageIds: [...query.stageIds],
    engineStates: [...query.engineStates],
    readinessStatuses: [...query.readinessStatuses],
    releaseStatuses: [...query.releaseStatuses],
    geometryClasses: [...query.geometryClasses],
    benchmarkQualificationStatuses: [...query.benchmarkQualificationStatuses],
    assessmentProfileIds: [...query.assessmentProfileIds],
    executable: query.executable,
  };
}

function installStyles(documentRef) {
  if (!documentRef || documentRef.querySelector?.('[data-lafea-template-wizard-styles]')) return;
  const style = documentRef.createElement('style');
  style.dataset.lafeaTemplateWizardStyles = 'true';
  style.textContent = LAFEA_TEMPLATE_WIZARD_STYLES;
  documentRef.head?.append(style);
}
