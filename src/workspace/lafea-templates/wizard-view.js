import { requireT6AParameterSchema } from './wizard-model.js';

export class LafeaTemplateWizardView {
  constructor(rootElement) {
    if (!rootElement) throw new TypeError('Template wizard root element is required.');
    this.rootElement = rootElement;
    this.documentRef = rootElement.ownerDocument ?? globalThis.document;
    this.handlers = null;
  }

  init(handlers) {
    this.handlers = handlers;
    return this;
  }

  render(model, catalogModel) {
    if (!this.handlers) throw new TypeError('Template wizard view is not initialized.');
    const section = create(this.documentRef, 'section', 'lafea-template-wizard');
    section.dataset.role = 'lafea-template-wizard';
    section.append(
      this.header(model),
      this.filters(model, catalogModel),
      this.summary(model),
      this.cards(model, catalogModel),
      this.detail(model, catalogModel),
    );
    this.rootElement.replaceChildren(section);
  }

  destroy() {
    this.rootElement?.replaceChildren();
    this.handlers = null;
    this.rootElement = null;
  }

  header(model) {
    const header = create(this.documentRef, 'header', 'lafea-template-wizard__header');
    header.append(
      textNode(this.documentRef, 'span', 'panel-eyebrow', 'LAFEA application templates'),
      textNode(this.documentRef, 'h2', null, 'Read-only template selection wizard'),
      textNode(
        this.documentRef,
        'p',
        'lafea-template-wizard__notice',
        'Selection and evidence inspection only. Parameter entry, compilation, workbench import and engine execution are disabled.',
      ),
      textNode(
        this.documentRef,
        'p',
        null,
        `Live workbench insertion is blocked by ${model.integrationIssue.reference}.`,
      ),
    );
    return header;
  }

  filters(model, catalogModel) {
    const filters = create(this.documentRef, 'div', 'lafea-template-wizard__filters');
    const search = create(this.documentRef, 'input');
    search.type = 'search';
    search.value = model.query.text ?? '';
    search.dataset.role = 'lafea-template-search';
    search.addEventListener('change', () => this.handlers.onSearch(search.value));
    filters.append(filterField(this.documentRef, 'Search templates', search));

    const group = selectFilter(
      this.documentRef,
      'Application group',
      catalogModel.filterOptions.applicationGroups,
      model.query.applicationGroups[0] ?? '',
      (value) => this.handlers.onApplicationGroup(value),
    );
    group.control.dataset.role = 'lafea-template-application-group';
    filters.append(group.field);

    const stage = selectFilter(
      this.documentRef,
      'Entry stage',
      catalogModel.filterOptions.stageIds,
      model.query.stageIds[0] ?? '',
      (value) => this.handlers.onStage(value),
    );
    stage.control.dataset.role = 'lafea-template-entry-stage';
    filters.append(stage.field);
    return filters;
  }

  summary(model) {
    const summary = create(this.documentRef, 'div', 'lafea-template-wizard__summary');
    summary.dataset.role = 'lafea-template-summary';
    summary.append(
      textNode(this.documentRef, 'span', null, `Matches: ${model.summary.totalMatches}`),
      textNode(
        this.documentRef,
        'span',
        null,
        `T6A preparation candidates: ${model.summary.preparationCandidateMatches}`,
      ),
      textNode(
        this.documentRef,
        'span',
        null,
        `Executable matches: ${model.summary.executableMatches}`,
      ),
    );
    return summary;
  }

  cards(model, catalogModel) {
    const host = create(this.documentRef, 'div', 'lafea-template-wizard__cards');
    host.dataset.role = 'lafea-template-cards';
    const matched = new Set(model.matchedTemplateIds);
    const cards = catalogModel.cards.filter((card) => matched.has(card.templateId));
    if (cards.length === 0) {
      host.append(textNode(this.documentRef, 'p', null, 'No templates match the current filters.'));
      return host;
    }
    cards.forEach((card) => host.append(this.card(model, card)));
    return host;
  }

  card(model, card) {
    const article = create(this.documentRef, 'article', 'lafea-template-wizard__card');
    article.dataset.templateId = card.templateId;
    article.setAttribute('aria-current', card.templateId === model.selectedTemplateId ? 'true' : 'false');
    const button = create(this.documentRef, 'button');
    button.type = 'button';
    button.textContent = card.templateId === model.selectedTemplateId ? 'Selected for inspection' : 'Inspect template';
    button.addEventListener('click', () => this.handlers.onSelect(card.templateId));
    article.append(
      textNode(this.documentRef, 'h3', null, card.label),
      textNode(this.documentRef, 'code', null, card.templateId),
      definitionList(this.documentRef, [
        ['Application', card.applicationGroup],
        ['Bucket', card.computation.bucketLabel],
        ['Entry stage', card.computation.entryStageId],
        ['Release', card.qualification.templateReleaseStatus],
        ['Benchmark', card.qualification.benchmarkQualificationStatus],
        ['Readiness', card.qualification.readinessStatus],
      ]),
      textNode(this.documentRef, 'p', null, card.typicalUse),
      button,
    );
    return article;
  }

  detail(model, catalogModel) {
    const detail = create(this.documentRef, 'section', 'lafea-template-wizard__detail');
    detail.dataset.role = 'lafea-template-detail';
    if (model.selection === null) {
      detail.append(textNode(this.documentRef, 'p', null, 'Select a template to inspect its governed input contract.'));
      return detail;
    }
    const selection = model.selection;
    const card = catalogModel.cards.find((item) => item.templateId === selection.templateId);
    detail.append(
      textNode(this.documentRef, 'h3', null, `Selected template — ${card?.label ?? selection.templateId}`),
      definitionList(this.documentRef, [
        ['Template', selection.templateId],
        ['Compiler route', selection.compilerRoute],
        ['Compiler status', selection.compilerStatus],
        ['Selection authority', selection.actionAuthority],
        ['Workbench integration', selection.integrationStatus],
        ['Preparation allowed', selection.selectionAllowed ? 'YES' : 'NO'],
        ['Executable', 'NO'],
      ]),
    );
    const schema = optionalParameterSchema(selection.templateId);
    if (schema) {
      detail.append(textNode(this.documentRef, 'h4', null, 'Parameter contract'));
      const list = create(this.documentRef, 'ul');
      schema.parameters.forEach((parameter) => {
        list.append(textNode(
          this.documentRef,
          'li',
          null,
          `${parameter.parameterId} — ${parameter.label} (${parameter.valueKind}; source ${parameter.sourceRequired ? 'required' : 'optional'})`,
        ));
      });
      detail.append(list);
    }
    detail.append(textNode(this.documentRef, 'h4', null, 'Retained limitations'));
    const limitations = create(this.documentRef, 'ul');
    selection.limitations.forEach((item) => limitations.append(textNode(this.documentRef, 'li', null, item)));
    detail.append(limitations);
    const clear = create(this.documentRef, 'button');
    clear.type = 'button';
    clear.textContent = 'Clear selection';
    clear.addEventListener('click', this.handlers.onClearSelection);
    detail.append(clear);
    return detail;
  }
}

function optionalParameterSchema(templateId) {
  try {
    return requireT6AParameterSchema(templateId);
  } catch {
    return null;
  }
}

function filterField(documentRef, labelText, control) {
  const label = create(documentRef, 'label', 'lafea-template-wizard__filter');
  label.append(textNode(documentRef, 'span', null, labelText), control);
  return label;
}

function selectFilter(documentRef, label, values, selected, onChange) {
  const control = create(documentRef, 'select');
  const all = create(documentRef, 'option');
  all.value = '';
  all.textContent = 'All';
  control.append(all);
  values.forEach((value) => {
    const option = create(documentRef, 'option');
    option.value = value;
    option.textContent = value;
    option.selected = value === selected;
    control.append(option);
  });
  control.addEventListener('change', () => onChange(control.value));
  return { field: filterField(documentRef, label, control), control };
}

function definitionList(documentRef, rows) {
  const list = create(documentRef, 'dl', 'lafea-template-wizard__meta');
  rows.forEach(([term, description]) => {
    list.append(
      textNode(documentRef, 'dt', null, term),
      textNode(documentRef, 'dd', null, String(description)),
    );
  });
  return list;
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
