import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  LAFEA_TEMPLATE_CATALOG_QUERY_SCHEMA,
  LAFEA_TEMPLATE_CATALOG_RESULT_SCHEMA,
  QUERY_KEYS,
  RESULT_KEYS,
} from './catalog-constants.js';
import { searchableText } from './catalog-card.js';
import { validateLafeaTemplateCatalogModel } from './catalog-model.js';
import {
  exact,
  frozen,
  hash,
  requireValid,
  strings,
  text,
  validation,
} from './catalog-utils.js';

export function createEmptyLafeaTemplateCatalogQuery() {
  return createLafeaTemplateCatalogQuery({
    text: null,
    applicationFamilies: [],
    applicationGroups: [],
    bucketIds: [],
    stageIds: [],
    engineStates: [],
    readinessStatuses: [],
    releaseStatuses: [],
    geometryClasses: [],
    benchmarkQualificationStatuses: [],
    assessmentProfileIds: [],
    executable: null,
  });
}

export function createLafeaTemplateCatalogQuery(input) {
  exact(input, QUERY_KEYS, 'Catalog query input');
  const normalized = {
    text: input.text === null ? null : text(input.text, 'text'),
    applicationFamilies: strings(input.applicationFamilies, 'applicationFamilies'),
    applicationGroups: strings(input.applicationGroups, 'applicationGroups'),
    bucketIds: strings(input.bucketIds, 'bucketIds'),
    stageIds: strings(input.stageIds, 'stageIds'),
    engineStates: strings(input.engineStates, 'engineStates'),
    readinessStatuses: strings(input.readinessStatuses, 'readinessStatuses'),
    releaseStatuses: strings(input.releaseStatuses, 'releaseStatuses'),
    geometryClasses: strings(input.geometryClasses, 'geometryClasses'),
    benchmarkQualificationStatuses: strings(input.benchmarkQualificationStatuses, 'benchmarkQualificationStatuses'),
    assessmentProfileIds: strings(input.assessmentProfileIds, 'assessmentProfileIds'),
    executable: input.executable,
  };
  if (normalized.executable !== null && typeof normalized.executable !== 'boolean') {
    throw new TypeError('executable must be boolean or null.');
  }
  const base = { schema: LAFEA_TEMPLATE_CATALOG_QUERY_SCHEMA, ...normalized };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function filterLafeaTemplateCatalog(model, query) {
  requireValid(validateLafeaTemplateCatalogModel(model), 'catalog model');
  requireValid(validateLafeaTemplateCatalogQuery(query), 'catalog query');
  const needle = query.text?.toLowerCase() ?? null;
  const cards = model.cards.filter((item) =>
    include(query.applicationFamilies, item.applicationFamily)
    && include(query.applicationGroups, item.applicationGroup)
    && include(query.bucketIds, item.computation.bucketId)
    && include(query.stageIds, item.computation.entryStageId)
    && include(query.engineStates, item.computation.engineState)
    && include(query.readinessStatuses, item.qualification.readinessStatus)
    && include(query.releaseStatuses, item.qualification.templateReleaseStatus)
    && include(query.geometryClasses, item.geometryClass)
    && include(query.benchmarkQualificationStatuses, item.qualification.benchmarkQualificationStatus)
    && (query.assessmentProfileIds.length === 0 || query.assessmentProfileIds.some((id) => item.code.assessmentProfileIds.includes(id)))
    && (query.executable === null || item.qualification.executable === query.executable)
    && (needle === null || searchableText(item).includes(needle))
  );
  const base = {
    schema: LAFEA_TEMPLATE_CATALOG_RESULT_SCHEMA,
    catalogSemanticHash: model.semanticHash,
    query,
    matchedTemplateIds: cards.map((item) => item.templateId),
    cards,
    summary: {
      totalMatches: cards.length,
      executableMatches: cards.filter((item) => item.qualification.executable).length,
      blockedMatches: cards.filter((item) => item.qualification.readinessStatus === 'BLOCKED').length,
      staleMatches: cards.filter((item) => item.qualification.readinessStatus === 'STALE').length,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateLafeaTemplateCatalogQuery(value) {
  return validation(() => {
    exact(value, [...QUERY_KEYS, 'schema', 'semanticHash'], 'Catalog query');
    if (value.schema !== LAFEA_TEMPLATE_CATALOG_QUERY_SCHEMA) {
      throw new TypeError('Catalog query schema is invalid.');
    }
    const { schema, semanticHash: declared, ...input } = value;
    const expected = createLafeaTemplateCatalogQuery(input);
    if (declared !== expected.semanticHash || JSON.stringify(value) !== JSON.stringify(expected)) {
      throw new TypeError('Catalog query content is invalid.');
    }
    void schema;
  });
}

export function validateLafeaTemplateCatalogResult(value) {
  return validation(() => {
    exact(value, RESULT_KEYS, 'Catalog result');
    if (value.schema !== LAFEA_TEMPLATE_CATALOG_RESULT_SCHEMA) {
      throw new TypeError('Catalog result schema is invalid.');
    }
    hash(value.catalogSemanticHash, 'catalogSemanticHash');
    requireValid(validateLafeaTemplateCatalogQuery(value.query), 'catalog query');
    const { semanticHash: declared, ...base } = value;
    if (declared !== semanticHash(base)) throw new TypeError('Catalog result semantic hash is invalid.');
    frozen(value, 'Catalog result');
  });
}

function include(filter, candidate) {
  return filter.length === 0 || filter.includes(candidate);
}
