import {
  validateTemplateBenchmarkManifest,
  validateTemplateParameterSchema,
  validateTemplateReleaseRecord,
} from '../../core/lafea-application-templates/index.js';
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  CARD_KEYS,
  FAMILY_METADATA,
  LAFEA_TEMPLATE_CATALOG_CARD_SCHEMA,
} from './catalog-constants.js';
import { exact, frozen, strings } from './catalog-utils.js';

export function createCatalogCard({
  template,
  bucket,
  readiness,
  parameterSchema,
  manifest,
  release,
  availableProfileIds,
}) {
  const family = FAMILY_METADATA[template.applicationFamily];
  if (!family) throw new TypeError(`Catalog metadata missing for ${template.applicationFamily}.`);
  const parameterState = state(parameterSchema, validateTemplateParameterSchema);
  const manifestState = manifest === null
    ? 'UNAVAILABLE'
    : validateTemplateBenchmarkManifest(manifest).ok
      ? manifest.qualificationStatus
      : 'INVALID';
  const releaseState = state(release, validateTemplateReleaseRecord);
  const base = {
    schema: LAFEA_TEMPLATE_CATALOG_CARD_SCHEMA,
    templateId: template.templateId,
    templateRevision: template.templateRevision,
    label: template.label,
    applicationFamily: template.applicationFamily,
    applicationGroup: family[0],
    geometryClass: family[1],
    typicalUse: family[2],
    schematic: { authority: 'DISPLAY_ONLY', kind: family[1], status: 'NOT_PROVIDED' },
    computation: {
      architectureOrder: bucket.architectureOrder,
      bucketId: bucket.bucketId,
      bucketKind: bucket.kind,
      bucketLabel: bucket.label,
      enginePackage: readiness.stageDependency.enginePackage,
      engineState: readiness.stageDependency.engineState,
      entryStageId: template.entryStageId,
      formulationProfileId: template.formulationProfileId,
      meshProfileId: template.meshProfileId,
      recoveryProfileId: template.recoveryProfileId,
      solverProfileId: template.solverProfileId,
      stageAuthority: readiness.stageDependency.authority,
    },
    inputs: inputSummary(template, parameterSchema, parameterState),
    outputs: {
      authoritativeOutputs: bucket.authoritativeOutputs,
      reportSections: reportSections(bucket.bucketId),
    },
    limitations: template.limitations,
    qualification: {
      benchmarkManifestHash: manifest?.semanticHash ?? null,
      benchmarkManifestId: template.benchmarkManifestId,
      benchmarkQualificationStatus: manifestState,
      exactReleaseHead: releaseState === 'AVAILABLE' ? release.exactHeadSha : null,
      executable: readiness.executable,
      readinessReasons: readiness.reasons,
      readinessStatus: readiness.status,
      releaseRecordAvailability: releaseState,
      releaseRecordStatus: releaseState === 'AVAILABLE' ? release.releaseStatus : null,
      templateReleaseStatus: template.releaseStatus,
    },
    code: {
      assessmentProfileIds: template.assessmentProfileIds,
      availability: codeAvailability(template, readiness, availableProfileIds),
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateCatalogCard(value) {
  exact(value, CARD_KEYS, `Catalog card ${value?.templateId ?? 'UNKNOWN'}`);
  if (value.schema !== LAFEA_TEMPLATE_CATALOG_CARD_SCHEMA) {
    throw new TypeError('Catalog card schema is invalid.');
  }
  if (value.schematic.authority !== 'DISPLAY_ONLY' || value.schematic.status !== 'NOT_PROVIDED') {
    throw new TypeError('Catalog schematic authority is invalid.');
  }
  if (value.qualification.executable && value.qualification.readinessStatus !== 'EXECUTABLE') {
    throw new TypeError('Catalog executability is inconsistent.');
  }
  if (value.code.availability === 'AVAILABLE' && !value.qualification.executable) {
    throw new TypeError('Code cannot be available for a blocked template.');
  }
  const { semanticHash: declared, ...base } = value;
  if (declared !== semanticHash(base)) {
    throw new TypeError(`Catalog card ${value.templateId} semantic hash is invalid.`);
  }
  frozen(value, `Catalog card ${value.templateId}`);
}

export function createFilterOptions(cards, profiles) {
  const assessmentIds = strings(cards.flatMap((item) => item.code.assessmentProfileIds), 'assessmentProfileIds');
  return deepFreeze({
    applicationFamilies: values(cards, (item) => item.applicationFamily),
    applicationGroups: values(cards, (item) => item.applicationGroup),
    assessmentProfiles: assessmentIds.map((profileId) => deepFreeze({
      availability: profiles.includes(profileId) ? 'AVAILABLE' : 'UNAVAILABLE',
      profileId,
    })),
    benchmarkQualificationStatuses: values(cards, (item) => item.qualification.benchmarkQualificationStatus),
    bucketIds: values(cards, (item) => item.computation.bucketId),
    engineStates: values(cards, (item) => item.computation.engineState),
    geometryClasses: values(cards, (item) => item.geometryClass),
    readinessStatuses: values(cards, (item) => item.qualification.readinessStatus),
    releaseStatuses: values(cards, (item) => item.qualification.templateReleaseStatus),
    stageIds: values(cards, (item) => item.computation.entryStageId),
  });
}

export function createCatalogSummary(cards) {
  return deepFreeze({
    blockedReadinessCount: cards.filter((item) => item.qualification.readinessStatus === 'BLOCKED').length,
    blockedReleaseCount: cards.filter((item) => item.qualification.templateReleaseStatus === 'BLOCKED').length,
    conceptReleaseCount: cards.filter((item) => item.qualification.templateReleaseStatus === 'CONCEPT').length,
    executableCount: cards.filter((item) => item.qualification.executable).length,
    qualifiedBenchmarkCount: cards.filter((item) => item.qualification.benchmarkQualificationStatus === 'QUALIFIED').length,
    staleReadinessCount: cards.filter((item) => item.qualification.readinessStatus === 'STALE').length,
    totalTemplates: cards.length,
  });
}

export function searchableText(item) {
  return [
    item.templateId,
    item.label,
    item.applicationFamily,
    item.applicationGroup,
    item.geometryClass,
    item.typicalUse,
    ...item.limitations,
  ].join(' ').toLowerCase();
}

function state(value, validator) {
  if (value === null) return 'UNAVAILABLE';
  return validator(value).ok ? 'AVAILABLE' : 'INVALID';
}

function inputSummary(template, schema, availability) {
  if (availability !== 'AVAILABLE') {
    return {
      availability,
      canonicalUnits: [],
      optionalCount: null,
      parameterSchemaId: template.parameterSchemaId,
      requiredCount: null,
      sourceRequiredCount: null,
      valueKinds: [],
    };
  }
  return {
    availability,
    canonicalUnits: strings(schema.parameters.map((item) => item.canonicalUnit).filter(Boolean), 'canonicalUnits'),
    optionalCount: schema.parameters.filter((item) => !item.required).length,
    parameterSchemaId: template.parameterSchemaId,
    requiredCount: schema.parameters.filter((item) => item.required).length,
    sourceRequiredCount: schema.parameters.filter((item) => item.sourceRequired).length,
    valueKinds: strings(schema.parameters.map((item) => item.valueKind), 'valueKinds'),
  };
}

function codeAvailability(template, readiness, profiles) {
  if (template.assessmentProfileIds.length === 0) return 'NOT_APPLICABLE';
  return readiness.executable && template.assessmentProfileIds.every((id) => profiles.includes(id))
    ? 'AVAILABLE'
    : 'UNAVAILABLE';
}

function reportSections(bucketId) {
  if (bucketId === 'ANALYTICAL_MECHANICS') {
    return strings(['BENCHMARK_RELEASE', 'EXECUTION', 'INPUT_EVIDENCE', 'LOADS_BOUNDARIES', 'TEMPLATE_BASIS'], 'reportSections');
  }
  if (bucketId === 'RECOVERY_ASSESSMENT') {
    return strings(['ASSESSMENT', 'BENCHMARK_RELEASE', 'CONVERGENCE', 'INPUT_EVIDENCE', 'RECOVERY', 'TEMPLATE_BASIS'], 'reportSections');
  }
  return strings(['BENCHMARK_RELEASE', 'CONVERGENCE', 'EXECUTION', 'GEOMETRY_MODEL', 'INPUT_EVIDENCE', 'LOADS_BOUNDARIES', 'MESH', 'RECOVERY', 'TEMPLATE_BASIS'], 'reportSections');
}

function values(items, selector) {
  return strings(items.map(selector), 'filter values');
}
