import {
  LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS,
} from '../../core/lafea-application-templates/index.js';
import {
  LAFEA_T3_ANALYTICAL_COMPILER_BINDINGS,
  LAFEA_T3_ANALYTICAL_PARAMETER_SCHEMAS,
  LAFEA_T3_COMPILED_TEMPLATE_IDS,
} from '../../core/lafea-application-templates/t3-analytical.js';
import {
  LAFEA_T4_COMPILED_CONTINUUM_TEMPLATE_IDS,
  LAFEA_T4_CONTINUUM_COMPILER_BINDINGS,
  LAFEA_T4_CONTINUUM_PARAMETER_SCHEMAS,
} from '../../core/lafea-application-templates/t4-continuum.js';
import {
  LAFEA_T5_QUALIFICATION_TEMPLATE_IDS,
  LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS,
} from '../../core/lafea-application-templates/t5-qualification.js';
import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  createLafeaTemplateCatalogModel,
  validateLafeaTemplateCatalogModel,
} from './catalog-model.js';
import {
  createEmptyLafeaTemplateCatalogQuery,
  filterLafeaTemplateCatalog,
  validateLafeaTemplateCatalogQuery,
  validateLafeaTemplateCatalogResult,
} from './catalog-query.js';
import {
  asciiCompare,
  canonicalStringify,
  deepFreeze,
  exact,
  frozen,
  hash,
  requireValid,
  strings,
  validation,
} from './catalog-utils.js';
import {
  LAFEA_TEMPLATE_WIZARD_ACTIONS,
  LAFEA_TEMPLATE_WIZARD_ACTION_AUTHORITY,
  LAFEA_TEMPLATE_WIZARD_COMPILER_ROUTES,
  LAFEA_TEMPLATE_WIZARD_COMPILER_STATUSES,
  LAFEA_TEMPLATE_WIZARD_INTEGRATION_STATUS,
  LAFEA_TEMPLATE_WIZARD_MODEL_KEYS,
  LAFEA_TEMPLATE_WIZARD_MODEL_SCHEMA,
  LAFEA_TEMPLATE_WIZARD_SELECTION_KEYS,
  LAFEA_TEMPLATE_WIZARD_SELECTION_SCHEMA,
} from './wizard-constants.js';

const INTEGRATION_ISSUE = deepFreeze({
  issueNumber: 61,
  reference: 'Advanced_Analysis#61',
  status: 'OPEN_REQUIRED',
});

const PARAMETER_SCHEMAS = Object.freeze([
  ...LAFEA_T3_ANALYTICAL_PARAMETER_SCHEMAS,
  ...LAFEA_T4_CONTINUUM_PARAMETER_SCHEMAS,
].sort((left, right) => asciiCompare(left.templateId, right.templateId)));

const COMPILER_BINDINGS = Object.freeze([
  ...LAFEA_T3_ANALYTICAL_COMPILER_BINDINGS,
  ...LAFEA_T4_CONTINUUM_COMPILER_BINDINGS,
].sort((left, right) => asciiCompare(left.templateId, right.templateId)));

const AVAILABLE_COMPILER_IDS = Object.freeze(strings(
  COMPILER_BINDINGS.flatMap((binding) => [
    binding.geometryCompilerId,
    binding.loadCompilerId,
    binding.boundaryCompilerId,
  ]),
  'available compiler IDs',
));

const CURRENT_MANIFESTS = Object.freeze(currentManifestSet());
const T3_IDS = new Set(LAFEA_T3_COMPILED_TEMPLATE_IDS);
const T4_IDS = new Set(LAFEA_T4_COMPILED_CONTINUUM_TEMPLATE_IDS);
const T5_IDS = new Set(LAFEA_T5_QUALIFICATION_TEMPLATE_IDS);

export const LAFEA_T6A_STANDALONE_CATALOG_MODEL = createLafeaTemplateCatalogModel({
  parameterSchemas: PARAMETER_SCHEMAS,
  benchmarkManifests: CURRENT_MANIFESTS,
  availableCompilerIds: AVAILABLE_COMPILER_IDS,
  availableProfileIds: [],
});

export const LAFEA_T6A_SELECTION_TEMPLATE_IDS = deepFreeze(
  [...LAFEA_T5_QUALIFICATION_TEMPLATE_IDS].sort(asciiCompare),
);

export function createLafeaTemplateWizardModel({
  catalogModel = LAFEA_T6A_STANDALONE_CATALOG_MODEL,
  query = createEmptyLafeaTemplateCatalogQuery(),
  selectedTemplateId = null,
} = {}) {
  requireValid(validateLafeaTemplateCatalogModel(catalogModel), 'catalog model');
  requireValid(validateLafeaTemplateCatalogQuery(query), 'catalog query');
  if (selectedTemplateId !== null && (
    typeof selectedTemplateId !== 'string' || !selectedTemplateId.trim()
  )) {
    throw new TypeError('selectedTemplateId must be non-empty text or null.');
  }

  const result = filterLafeaTemplateCatalog(catalogModel, query);
  requireValid(validateLafeaTemplateCatalogResult(result), 'catalog result');
  const selectedCard = selectedTemplateId === null
    ? null
    : result.cards.find((card) => card.templateId === selectedTemplateId) ?? null;
  if (selectedTemplateId !== null && selectedCard === null) {
    throw new TypeError(`SELECTED_TEMPLATE_NOT_IN_QUERY_RESULT:${selectedTemplateId}`);
  }
  const selection = selectedCard === null ? null : createSelection(selectedCard);
  const base = {
    schema: LAFEA_TEMPLATE_WIZARD_MODEL_SCHEMA,
    catalogSemanticHash: catalogModel.semanticHash,
    query,
    queryResultSemanticHash: result.semanticHash,
    matchedTemplateIds: result.matchedTemplateIds,
    selectedTemplateId,
    selection,
    summary: deepFreeze({
      ...result.summary,
      preparationCandidateMatches: result.cards.filter(
        (card) => T5_IDS.has(card.templateId),
      ).length,
    }),
    actions: LAFEA_TEMPLATE_WIZARD_ACTIONS,
    integrationIssue: INTEGRATION_ISSUE,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateLafeaTemplateWizardModel(value) {
  return validation(() => {
    exact(value, LAFEA_TEMPLATE_WIZARD_MODEL_KEYS, 'Template wizard model');
    if (value.schema !== LAFEA_TEMPLATE_WIZARD_MODEL_SCHEMA) {
      throw new TypeError('Template wizard model schema is invalid.');
    }
    hash(value.catalogSemanticHash, 'catalogSemanticHash');
    hash(value.queryResultSemanticHash, 'queryResultSemanticHash');
    requireValid(validateLafeaTemplateCatalogQuery(value.query), 'catalog query');
    if (!Array.isArray(value.matchedTemplateIds)) {
      throw new TypeError('matchedTemplateIds must be an array.');
    }
    if (value.selectedTemplateId === null) {
      if (value.selection !== null) {
        throw new TypeError('A null selectedTemplateId requires a null selection.');
      }
    } else {
      if (!value.matchedTemplateIds.includes(value.selectedTemplateId)) {
        throw new TypeError('selectedTemplateId must be present in matchedTemplateIds.');
      }
      requireValid(validateLafeaTemplateWizardSelection(value.selection), 'wizard selection');
      if (value.selection.templateId !== value.selectedTemplateId) {
        throw new TypeError('Wizard selection template identity is inconsistent.');
      }
    }
    if (canonicalStringify(value.actions) !== canonicalStringify(LAFEA_TEMPLATE_WIZARD_ACTIONS)) {
      throw new TypeError('Wizard action authority is invalid.');
    }
    if (canonicalStringify(value.integrationIssue) !== canonicalStringify(INTEGRATION_ISSUE)) {
      throw new TypeError('Wizard integration issue identity is invalid.');
    }
    const { semanticHash: declared, ...base } = value;
    if (declared !== semanticHash(base)) {
      throw new TypeError('Template wizard model semantic hash is invalid.');
    }
    frozen(value, 'Template wizard model');
  });
}

export function validateLafeaTemplateWizardSelection(value) {
  return validation(() => {
    exact(value, LAFEA_TEMPLATE_WIZARD_SELECTION_KEYS, 'Template wizard selection');
    if (value.schema !== LAFEA_TEMPLATE_WIZARD_SELECTION_SCHEMA) {
      throw new TypeError('Template wizard selection schema is invalid.');
    }
    hash(value.cardSemanticHash, 'cardSemanticHash');
    if (!LAFEA_TEMPLATE_WIZARD_COMPILER_ROUTES.includes(value.compilerRoute)) {
      throw new TypeError('Template wizard compiler route is invalid.');
    }
    if (!LAFEA_TEMPLATE_WIZARD_COMPILER_STATUSES.includes(value.compilerStatus)) {
      throw new TypeError('Template wizard compiler status is invalid.');
    }
    if (value.actionAuthority !== LAFEA_TEMPLATE_WIZARD_ACTION_AUTHORITY) {
      throw new TypeError('Template wizard action authority is invalid.');
    }
    if (value.integrationStatus !== LAFEA_TEMPLATE_WIZARD_INTEGRATION_STATUS) {
      throw new TypeError('Template wizard integration status is invalid.');
    }
    if (value.executable !== false) {
      throw new TypeError('T6A wizard selections cannot be executable.');
    }
    if (value.selectionAllowed !== T5_IDS.has(value.templateId)) {
      throw new TypeError('Template wizard selection allowance is inconsistent.');
    }
    if (!Array.isArray(value.limitations) || value.limitations.length === 0) {
      throw new TypeError('Template wizard selection limitations are required.');
    }
    const { semanticHash: declared, ...base } = value;
    if (declared !== semanticHash(base)) {
      throw new TypeError('Template wizard selection semantic hash is invalid.');
    }
    frozen(value, 'Template wizard selection');
  });
}

export function requireT6AParameterSchema(templateId) {
  const result = PARAMETER_SCHEMAS.find((schema) => schema.templateId === templateId);
  if (!result) throw new TypeError(`T6A parameter schema unavailable: ${templateId}.`);
  return result;
}

function createSelection(card) {
  const binding = COMPILER_BINDINGS.find((item) => item.templateId === card.templateId) ?? null;
  const parameterSchema = PARAMETER_SCHEMAS.find(
    (item) => item.templateId === card.templateId,
  ) ?? null;
  const route = compilerRoute(card.templateId);
  const selectionAllowed = T5_IDS.has(card.templateId);
  const compilerStatus = binding === null
    ? 'COMPILER_NOT_AVAILABLE'
    : selectionAllowed
      ? 'DRAFT_COMPILER_AVAILABLE'
      : 'COMPILER_OUTSIDE_T6A_RELEASE_SET';
  const base = {
    schema: LAFEA_TEMPLATE_WIZARD_SELECTION_SCHEMA,
    templateId: card.templateId,
    cardSemanticHash: card.semanticHash,
    bucketId: card.computation.bucketId,
    entryStageId: card.computation.entryStageId,
    parameterSchemaId: card.inputs.parameterSchemaId,
    parameterSchemaSemanticHash: parameterSchema?.semanticHash ?? null,
    compilerRoute: route,
    compilerStatus,
    benchmarkQualificationStatus: card.qualification.benchmarkQualificationStatus,
    readinessStatus: card.qualification.readinessStatus,
    releaseStatus: card.qualification.templateReleaseStatus,
    executable: false,
    selectionAllowed,
    actionAuthority: LAFEA_TEMPLATE_WIZARD_ACTION_AUTHORITY,
    integrationStatus: LAFEA_TEMPLATE_WIZARD_INTEGRATION_STATUS,
    limitations: strings([
      ...card.limitations,
      ...(binding?.limitations ?? []),
      'T6A is selection-only and does not collect parameter values.',
      'T6A does not invoke a compiler, import a workbench document or execute an engine.',
      'Live workbench insertion remains blocked until Advanced_Analysis#61 is resolved.',
    ], 'wizard selection limitations'),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function compilerRoute(templateId) {
  if (T3_IDS.has(templateId)) return 'ANALYTICAL_T3';
  if (T4_IDS.has(templateId)) return 'CONTINUUM_T4';
  return 'UNAVAILABLE';
}

function currentManifestSet() {
  const replacements = new Map(
    LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS.map((manifest) => [
      manifest.benchmarkManifestId,
      manifest,
    ]),
  );
  return LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS.map(
    (manifest) => replacements.get(manifest.benchmarkManifestId) ?? manifest,
  ).sort((left, right) => asciiCompare(left.benchmarkManifestId, right.benchmarkManifestId));
}
