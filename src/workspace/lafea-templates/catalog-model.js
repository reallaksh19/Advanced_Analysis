import {
  LAFEA_APPLICATION_TEMPLATE_REGISTRY,
  LAFEA_COMPUTATIONAL_BUCKET_REGISTRY,
  LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS,
  LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  evaluateTemplateRegistryReadiness,
  validateApplicationTemplate,
  validateLafeaComputationalBucketRegistry,
  validateTemplateBenchmarkManifest,
  validateTemplateParameterSchema,
  validateTemplateReleaseRecord,
} from '../../core/lafea-application-templates/index.js';
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  LAFEA_TEMPLATE_CATALOG_MODEL_SCHEMA,
  MODEL_KEYS,
} from './catalog-constants.js';
import {
  createCatalogCard,
  createCatalogSummary,
  createFilterOptions,
  validateCatalogCard,
} from './catalog-card.js';
import {
  asciiCompare,
  by,
  exact,
  frozen,
  hash,
  records,
  requireOne,
  requireValid,
  strings,
  validation,
} from './catalog-utils.js';

export function createLafeaTemplateCatalogModel({
  templates = LAFEA_APPLICATION_TEMPLATE_REGISTRY,
  buckets = LAFEA_COMPUTATIONAL_BUCKET_REGISTRY,
  parameterSchemas = [],
  benchmarkManifests = LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS,
  releaseRecords = [],
  availableCompilerIds = [],
  availableProfileIds = [],
  currentRegistryHash = LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
} = {}) {
  const sortedTemplates = records(templates, 'templates').sort(by('templateId'));
  const sortedBuckets = records(buckets, 'buckets').sort(by('bucketId'));
  const schemas = records(parameterSchemas, 'parameterSchemas').sort(by('parameterSchemaId'));
  const manifests = records(benchmarkManifests, 'benchmarkManifests').sort(by('benchmarkManifestId'));
  const releases = records(releaseRecords, 'releaseRecords').sort(by('templateId'));
  const compilers = strings(availableCompilerIds, 'availableCompilerIds');
  const profiles = strings(availableProfileIds, 'availableProfileIds');
  hash(currentRegistryHash, 'currentRegistryHash');
  sortedTemplates.forEach((item) => requireValid(validateApplicationTemplate(item), item.templateId));
  requireValid(validateLafeaComputationalBucketRegistry(sortedBuckets), 'bucket registry');
  schemas.forEach((item) => requireValid(validateTemplateParameterSchema(item), item.parameterSchemaId));
  manifests.forEach((item) => requireValid(validateTemplateBenchmarkManifest(item), item.benchmarkManifestId));
  releases.forEach((item) => requireValid(validateTemplateReleaseRecord(item), item.templateId));

  const readiness = evaluateTemplateRegistryReadiness(sortedTemplates, {
    currentRegistryHash,
    parameterSchemas: schemas,
    benchmarkManifests: manifests,
    releaseRecords: releases,
    availableCompilerIds: compilers,
    availableProfileIds: profiles,
  });
  const cards = sortedTemplates.map((template) => createCatalogCard({
    template,
    bucket: requireOne(sortedBuckets, 'bucketId', template.bucketId),
    readiness: requireOne(readiness, 'templateId', template.templateId),
    parameterSchema: schemas.find((item) => item.parameterSchemaId === template.parameterSchemaId) ?? null,
    manifest: manifests.find((item) => item.benchmarkManifestId === template.benchmarkManifestId) ?? null,
    release: releases.find((item) => item.templateId === template.templateId) ?? null,
    availableProfileIds: profiles,
  })).sort(by('templateId'));
  const base = {
    schema: LAFEA_TEMPLATE_CATALOG_MODEL_SCHEMA,
    parentRegistryHash: currentRegistryHash,
    templateRegistryHash: semanticHash(sortedTemplates.map((item) => item.semanticHash)),
    bucketRegistryHash: semanticHash(sortedBuckets.map((item) => item.semanticHash)),
    parameterSchemaSetHash: semanticHash(schemas.map((item) => item.semanticHash)),
    benchmarkManifestSetHash: semanticHash(manifests.map((item) => item.semanticHash)),
    releaseRecordSetHash: semanticHash(releases.map((item) => item.semanticHash)),
    profileAvailabilityHash: semanticHash({ compilers, profiles }),
    cards,
    filterOptions: createFilterOptions(cards, profiles),
    summary: createCatalogSummary(cards),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export const LAFEA_TEMPLATE_CATALOG_MODEL = createLafeaTemplateCatalogModel();

export function validateLafeaTemplateCatalogModel(value) {
  return validation(() => {
    exact(value, MODEL_KEYS, 'Catalog model');
    if (value.schema !== LAFEA_TEMPLATE_CATALOG_MODEL_SCHEMA) {
      throw new TypeError('Catalog model schema is invalid.');
    }
    hash(value.parentRegistryHash, 'parentRegistryHash');
    [
      'templateRegistryHash', 'bucketRegistryHash', 'parameterSchemaSetHash',
      'benchmarkManifestSetHash', 'releaseRecordSetHash', 'profileAvailabilityHash',
    ].forEach((field) => hash(value[field], field));
    if (!Array.isArray(value.cards)) throw new TypeError('cards must be an array.');
    const ids = value.cards.map((item) => item.templateId);
    if (JSON.stringify(ids) !== JSON.stringify([...ids].sort(asciiCompare))) {
      throw new TypeError('cards must be ASCII ordered.');
    }
    value.cards.forEach(validateCatalogCard);
    const { semanticHash: declared, ...base } = value;
    if (declared !== semanticHash(base)) throw new TypeError('Catalog model semantic hash is invalid.');
    frozen(value, 'Catalog model');
  });
}
