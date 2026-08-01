#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_APPLICATION_TEMPLATE_REGISTRY,
  LAFEA_COMPUTATIONAL_BUCKET_REGISTRY,
  LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS,
  LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  createTemplateParameterSchema,
  createTemplateReleaseRecord,
} from '../src/core/lafea-application-templates/index.js';
import {
  LAFEA_TEMPLATE_CATALOG_MODEL,
  createEmptyLafeaTemplateCatalogQuery,
  createLafeaTemplateCatalogModel,
  createLafeaTemplateCatalogQuery,
  filterLafeaTemplateCatalog,
  validateLafeaTemplateCatalogModel,
  validateLafeaTemplateCatalogQuery,
  validateLafeaTemplateCatalogResult,
} from '../src/workspace/lafea-templates/index.js';

assert.equal(validateLafeaTemplateCatalogModel(LAFEA_TEMPLATE_CATALOG_MODEL).ok, true);
assert.deepEqual(
  LAFEA_TEMPLATE_CATALOG_MODEL.cards.map((card) => card.templateId),
  [...LAFEA_TEMPLATE_CATALOG_MODEL.cards.map((card) => card.templateId)].sort(asciiCompare),
);
assert.equal(LAFEA_TEMPLATE_CATALOG_MODEL.cards.length, 27);
assert.equal(LAFEA_TEMPLATE_CATALOG_MODEL.summary.totalTemplates, 27);
assert.equal(LAFEA_TEMPLATE_CATALOG_MODEL.summary.executableCount, 0);
assert.equal(LAFEA_TEMPLATE_CATALOG_MODEL.summary.blockedReadinessCount, 27);
assert.equal(LAFEA_TEMPLATE_CATALOG_MODEL.summary.conceptReleaseCount, 9);
assert.equal(LAFEA_TEMPLATE_CATALOG_MODEL.summary.blockedReleaseCount, 18);
assert.equal(LAFEA_TEMPLATE_CATALOG_MODEL.summary.qualifiedBenchmarkCount, 0);
assert.ok(LAFEA_TEMPLATE_CATALOG_MODEL.cards.every((card) => card.schematic.authority === 'DISPLAY_ONLY'));
assert.ok(LAFEA_TEMPLATE_CATALOG_MODEL.cards.every((card) => card.schematic.status === 'NOT_PROVIDED'));
assert.ok(LAFEA_TEMPLATE_CATALOG_MODEL.cards.every((card) => card.inputs.availability === 'UNAVAILABLE'));
assert.ok(LAFEA_TEMPLATE_CATALOG_MODEL.cards.every((card) => card.qualification.executable === false));
assert.ok(LAFEA_TEMPLATE_CATALOG_MODEL.cards.every((card) => card.code.availability !== 'AVAILABLE'));

for (const card of LAFEA_TEMPLATE_CATALOG_MODEL.cards.filter((row) => row.computation.bucketId === 'SURFACE_SHELL_FEA')) {
  assert.equal(card.qualification.templateReleaseStatus, 'BLOCKED');
  assert.ok(card.qualification.readinessReasons.includes('PRODUCTION_SHELL_FORMULATION_NOT_REGISTERED'));
}
for (const card of LAFEA_TEMPLATE_CATALOG_MODEL.cards.filter((row) => row.templateId.startsWith('ALG-WELD-GROUP-'))) {
  assert.equal(card.computation.engineState, 'ENGINE_NOT_IMPLEMENTED');
  assert.ok(card.qualification.readinessReasons.includes('LAFEA6_ENGINE_NOT_IMPLEMENTED'));
}
const codeCard = card('REC-VIII2-ESA');
assert.deepEqual(codeCard.code.assessmentProfileIds, ['ASME_VIII2_ESA_PROFILE_PENDING']);
assert.equal(codeCard.code.availability, 'UNAVAILABLE');
assert.equal(codeCard.qualification.exactReleaseHead, null);

const emptyQuery = createEmptyLafeaTemplateCatalogQuery();
assert.equal(validateLafeaTemplateCatalogQuery(emptyQuery).ok, true);
const allResult = filterLafeaTemplateCatalog(LAFEA_TEMPLATE_CATALOG_MODEL, emptyQuery);
assert.equal(validateLafeaTemplateCatalogResult(allResult).ok, true);
assert.equal(allResult.summary.totalMatches, 27);

assert.equal(filterBy({ bucketIds: ['ANALYTICAL_MECHANICS'] }).summary.totalMatches, 6);
assert.equal(filterBy({ bucketIds: ['CONTINUUM_2D_FEA'] }).summary.totalMatches, 6);
assert.equal(filterBy({ bucketIds: ['SURFACE_SHELL_FEA'] }).summary.totalMatches, 10);
assert.equal(filterBy({ bucketIds: ['RECOVERY_ASSESSMENT'] }).summary.totalMatches, 5);
assert.equal(filterBy({ stageIds: ['LAFEA.4'] }).summary.totalMatches, 8);
assert.equal(filterBy({ engineStates: ['ENGINE_NOT_IMPLEMENTED'] }).summary.totalMatches, 2);
assert.equal(filterBy({ releaseStatuses: ['BLOCKED'] }).summary.totalMatches, 18);
assert.equal(filterBy({ benchmarkQualificationStatuses: ['BLOCKED'] }).summary.totalMatches, 18);
assert.equal(filterBy({ benchmarkQualificationStatuses: ['NOT_QUALIFIED'] }).summary.totalMatches, 9);
assert.equal(filterBy({ assessmentProfileIds: ['ASME_VIII2_ESA_PROFILE_PENDING'] }).summary.totalMatches, 1);
assert.equal(filterBy({ text: 'trunnion' }).summary.totalMatches, 4);
assert.equal(filterBy({ executable: true }).summary.totalMatches, 0);
assert.equal(filterBy({ applicationGroups: ['ASSESSMENT'] }).summary.totalMatches, 5);
assert.equal(filterBy({ geometryClasses: ['SHELL_MIDSURFACE'] }).summary.totalMatches, 10);

const orderInvariant = createLafeaTemplateCatalogModel({
  templates: [...LAFEA_APPLICATION_TEMPLATE_REGISTRY].reverse(),
  buckets: [...LAFEA_COMPUTATIONAL_BUCKET_REGISTRY].reverse(),
  benchmarkManifests: [...LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS].reverse(),
  availableCompilerIds: [],
  availableProfileIds: [],
});
assert.equal(orderInvariant.semanticHash, LAFEA_TEMPLATE_CATALOG_MODEL.semanticHash);

const parameterSchema = createTemplateParameterSchema({
  parameterSchemaId: 'alg-load-reference-transfer-parameters/v1',
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  parameters: [
    descriptor('force', true, true, 'FINITE_NUMBER', 'N'),
    descriptor('note', false, false, 'TEXT', null),
    descriptor('offset', true, false, 'FINITE_NUMBER', 'mm'),
  ],
  limitations: [],
});
const withSchema = createLafeaTemplateCatalogModel({ parameterSchemas: [parameterSchema] });
const inputCard = withSchema.cards.find((row) => row.templateId === 'ALG-LOAD-REFERENCE-TRANSFER');
assert.equal(inputCard.inputs.availability, 'AVAILABLE');
assert.equal(inputCard.inputs.requiredCount, 2);
assert.equal(inputCard.inputs.optionalCount, 1);
assert.equal(inputCard.inputs.sourceRequiredCount, 1);
assert.deepEqual(inputCard.inputs.canonicalUnits, ['N', 'mm']);
assert.deepEqual(inputCard.inputs.valueKinds, ['FINITE_NUMBER', 'TEXT']);

const template = LAFEA_APPLICATION_TEMPLATE_REGISTRY.find((row) => row.templateId === 'ALG-LOAD-REFERENCE-TRANSFER');
const manifest = LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS.find((row) => row.templateId === template.templateId);
const releaseRecord = createTemplateReleaseRecord({
  templateId: template.templateId,
  templateSemanticHash: template.semanticHash,
  parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  benchmarkManifestHash: manifest.semanticHash,
  benchmarkQualificationStatus: manifest.qualificationStatus,
  exactHeadSha: null,
  releaseStatus: 'CONCEPT',
  executable: false,
  limitations: ['Not qualified.'],
  diagnostics: [],
});
const withRelease = createLafeaTemplateCatalogModel({ releaseRecords: [releaseRecord] });
const releaseCard = withRelease.cards.find((row) => row.templateId === template.templateId);
assert.equal(releaseCard.qualification.releaseRecordAvailability, 'AVAILABLE');
assert.equal(releaseCard.qualification.releaseRecordStatus, 'CONCEPT');
assert.equal(releaseCard.qualification.exactReleaseHead, null);
assert.equal(releaseCard.qualification.executable, false);

const stale = createLafeaTemplateCatalogModel({
  currentRegistryHash: 'fnv1a64:2222222222222222',
});
assert.equal(stale.summary.staleReadinessCount, 27);
assert.ok(stale.cards.every((row) => row.qualification.readinessStatus === 'STALE'));
assert.ok(stale.cards.every((row) => row.qualification.executable === false));

assert.throws(() => {
  LAFEA_TEMPLATE_CATALOG_MODEL.cards[0].label = 'mutated';
}, TypeError);
assert.throws(
  () => createLafeaTemplateCatalogQuery({ ...queryInput(), unexpected: true }),
  /keys are invalid/u,
);

console.log(JSON.stringify({
  status: 'PASS',
  schema: LAFEA_TEMPLATE_CATALOG_MODEL.schema,
  semanticHash: LAFEA_TEMPLATE_CATALOG_MODEL.semanticHash,
  templateCount: LAFEA_TEMPLATE_CATALOG_MODEL.cards.length,
  executableCount: LAFEA_TEMPLATE_CATALOG_MODEL.summary.executableCount,
  blockedReleaseCount: LAFEA_TEMPLATE_CATALOG_MODEL.summary.blockedReleaseCount,
  filterOptionCounts: {
    applicationFamilies: LAFEA_TEMPLATE_CATALOG_MODEL.filterOptions.applicationFamilies.length,
    applicationGroups: LAFEA_TEMPLATE_CATALOG_MODEL.filterOptions.applicationGroups.length,
    bucketIds: LAFEA_TEMPLATE_CATALOG_MODEL.filterOptions.bucketIds.length,
    geometryClasses: LAFEA_TEMPLATE_CATALOG_MODEL.filterOptions.geometryClasses.length,
  },
}, null, 2));

function filterBy(overrides) {
  return filterLafeaTemplateCatalog(
    LAFEA_TEMPLATE_CATALOG_MODEL,
    createLafeaTemplateCatalogQuery(queryInput(overrides)),
  );
}

function queryInput(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function descriptor(parameterId, required, sourceRequired, valueKind, canonicalUnit) {
  return {
    parameterId,
    label: parameterId,
    valueKind,
    required,
    nullable: false,
    canonicalUnit,
    allowedUnits: canonicalUnit === null ? [] : [canonicalUnit],
    minimum: null,
    maximum: null,
    enumValues: [],
    sourceRequired,
    dependencies: [],
  };
}

function card(templateId) {
  const result = LAFEA_TEMPLATE_CATALOG_MODEL.cards.find((row) => row.templateId === templateId);
  assert.ok(result, templateId);
  return result;
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
