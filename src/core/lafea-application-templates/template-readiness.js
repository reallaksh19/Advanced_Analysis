import {
  deepFreeze,
  semanticHash,
} from '../shared-piping-model/index.js';
import {
  validateApplicationTemplate,
  validateTemplateBenchmarkManifest,
  validateTemplateParameterSchema,
  validateTemplateReleaseRecord,
  asciiCompare,
  assertExactKeys,
} from './contracts.js';
import {
  LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  requireLafeaComputationalBucket,
  requireLafeaStageDependencyEntry,
} from './bucket-registry.js';

export const LAFEA_TEMPLATE_READINESS_SCHEMA = 'lafea-template-readiness/v1';

const CONTEXT_KEYS = Object.freeze([
  'availableCompilerIds',
  'availableProfileIds',
  'benchmarkManifests',
  'currentRegistryHash',
  'parameterSchemas',
  'releaseRecords',
]);

const RESULT_KEYS = Object.freeze([
  'executable',
  'parentRegistryHash',
  'reasons',
  'schema',
  'semanticHash',
  'stageDependency',
  'status',
  'templateId',
  'templateSemanticHash',
]);

const STAGE_DEPENDENCY_KEYS = Object.freeze([
  'authority',
  'enginePackage',
  'engineState',
  'inputContractRole',
  'resultContractRole',
  'stageId',
]);

export function evaluateTemplateReadiness(template, context) {
  const templateValidation = validateApplicationTemplate(template);
  if (!templateValidation.ok) {
    throw new TypeError(templateValidation.errors.join(' '));
  }
  const normalized = normalizeContext(context);
  const reasons = [];
  let stale = false;

  if (template.parentRegistryHash !== normalized.currentRegistryHash) {
    reasons.push('STALE_TEMPLATE_REGISTRY_PARENT');
    stale = true;
  }

  const stage = requireLafeaStageDependencyEntry(template.entryStageId);
  const bucket = requireLafeaComputationalBucket(template.bucketId);

  if (bucket.parentRegistryHash !== normalized.currentRegistryHash) {
    reasons.push('STALE_BUCKET_REGISTRY_PARENT');
    stale = true;
  }

  if (stage.engineState !== template.requiredStageEngineState) {
    reasons.push(
      `ENGINE_STATE_MISMATCH:${template.requiredStageEngineState}:${stage.engineState}`,
    );
  }
  if (stage.engineState !== 'QUALIFIED_ROUTE_REGISTERED') {
    reasons.push(`ENTRY_STAGE_ROUTE_NOT_QUALIFIED:${stage.stageId}:${stage.engineState}`);
  }
  if (stage.enginePackage !== template.requiredEnginePackage) {
    reasons.push('ENGINE_PACKAGE_MISMATCH');
  }
  if (stage.authority !== template.requiredStageAuthority) {
    reasons.push('STAGE_AUTHORITY_MISMATCH');
  }
  if (stage.inputContractRole !== template.requiredInputContractRole) {
    reasons.push('INPUT_CONTRACT_ROLE_MISMATCH');
  }
  if (stage.resultContractRole !== template.requiredResultContractRole) {
    reasons.push('RESULT_CONTRACT_ROLE_MISMATCH');
  }

  if (
    template.bucketId === 'SURFACE_SHELL_FEA'
    && (
      template.requiredStageAuthority.includes('PENDING_AGENT_1')
      || stage.authority === 'CST_DKT_TRI3_THIN_SHELL_V1'
      || stage.authority === 'CALLER_AUTHORED_HOST_SHELL_FOOTPRINT_ONLY'
    )
  ) {
    reasons.push('PRODUCTION_SHELL_FORMULATION_NOT_REGISTERED');
  }
  if (stage.stageId === 'LAFEA.6' && stage.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    reasons.push('LAFEA6_ENGINE_NOT_IMPLEMENTED');
  }

  const parameterSchema = normalized.parameterSchemas
    .find((item) => item.parameterSchemaId === template.parameterSchemaId);
  if (!parameterSchema) {
    reasons.push('PARAMETER_SCHEMA_NOT_AVAILABLE');
  } else {
    const validation = validateTemplateParameterSchema(parameterSchema);
    if (!validation.ok) {
      reasons.push('PARAMETER_SCHEMA_INVALID');
    } else if (parameterSchema.templateId !== template.templateId) {
      reasons.push('PARAMETER_SCHEMA_TEMPLATE_MISMATCH');
    }
  }

  compilerRoles(template).forEach(([role, compilerId]) => {
    if (compilerId === null) {
      reasons.push(`COMPILER_ID_NOT_DECLARED:${role}`);
    } else if (!normalized.availableCompilerIds.includes(compilerId)) {
      reasons.push(`COMPILER_NOT_AVAILABLE:${role}:${compilerId}`);
    }
  });

  bucket.requiredProfileRoles.forEach((role) => {
    const profileId = template[role];
    if (profileId === null) {
      reasons.push(`PROFILE_ID_NOT_DECLARED:${role}`);
    } else if (!normalized.availableProfileIds.includes(profileId)) {
      reasons.push(`PROFILE_NOT_AVAILABLE:${role}:${profileId}`);
    }
  });

  template.assessmentProfileIds.forEach((profileId) => {
    if (!normalized.availableProfileIds.includes(profileId)) {
      reasons.push(`ASSESSMENT_PROFILE_NOT_AVAILABLE:${profileId}`);
    }
  });

  const manifest = normalized.benchmarkManifests
    .find((item) => item.benchmarkManifestId === template.benchmarkManifestId);
  if (!manifest) {
    reasons.push('BENCHMARK_MANIFEST_NOT_AVAILABLE');
  } else {
    const validation = validateTemplateBenchmarkManifest(manifest);
    if (!validation.ok) {
      reasons.push('BENCHMARK_MANIFEST_INVALID');
    } else {
      if (manifest.templateId !== template.templateId) {
        reasons.push('BENCHMARK_MANIFEST_TEMPLATE_MISMATCH');
      }
      if (manifest.parentRegistryHash !== normalized.currentRegistryHash) {
        reasons.push('STALE_BENCHMARK_REGISTRY_PARENT');
        stale = true;
      }
      if (manifest.qualificationStatus !== 'QUALIFIED') {
        reasons.push(`BENCHMARK_MANIFEST_NOT_QUALIFIED:${manifest.qualificationStatus}`);
      }
    }
  }

  const releaseRecord = normalized.releaseRecords
    .find((item) => item.templateId === template.templateId);
  if (!releaseRecord) {
    reasons.push('RELEASE_RECORD_NOT_AVAILABLE');
  } else {
    const validation = validateTemplateReleaseRecord(releaseRecord);
    if (!validation.ok) {
      reasons.push('RELEASE_RECORD_INVALID');
    } else {
      if (releaseRecord.parentRegistryHash !== normalized.currentRegistryHash) {
        reasons.push('STALE_RELEASE_REGISTRY_PARENT');
        stale = true;
      }
      if (releaseRecord.templateSemanticHash !== template.semanticHash) {
        reasons.push('STALE_RELEASE_TEMPLATE_PARENT');
        stale = true;
      }
      if (manifest && releaseRecord.benchmarkManifestHash !== manifest.semanticHash) {
        reasons.push('STALE_RELEASE_BENCHMARK_PARENT');
        stale = true;
      }
      if (!releaseRecord.executable) reasons.push('RELEASE_RECORD_NOT_EXECUTABLE');
    }
  }

  if (!['CONDITIONAL', 'QUALIFIED'].includes(template.releaseStatus)) {
    reasons.push(`TEMPLATE_RELEASE_NOT_EXECUTABLE:${template.releaseStatus}`);
  }

  const sortedReasons = [...new Set(reasons)].sort(asciiCompare);
  const executable = sortedReasons.length === 0;
  const status = stale ? 'STALE' : executable ? 'EXECUTABLE' : 'BLOCKED';
  return readinessResult({
    template,
    stage,
    status,
    executable,
    reasons: sortedReasons,
  });
}

export function evaluateTemplateRegistryReadiness(templates, context) {
  if (!Array.isArray(templates)) throw new TypeError('Templates must be an array.');
  return deepFreeze(
    templates.map((template) => evaluateTemplateReadiness(template, context))
      .sort((left, right) => asciiCompare(left.templateId, right.templateId)),
  );
}

export function validateTemplateReadiness(value) {
  const errors = [];
  try {
    assertExactKeys(value, RESULT_KEYS, 'Template readiness');
    if (value.schema !== LAFEA_TEMPLATE_READINESS_SCHEMA) {
      throw new TypeError('Template readiness schema is invalid.');
    }
    assertExactKeys(value.stageDependency, STAGE_DEPENDENCY_KEYS, 'stageDependency');
    const base = {
      schema: value.schema,
      templateId: value.templateId,
      templateSemanticHash: value.templateSemanticHash,
      parentRegistryHash: value.parentRegistryHash,
      status: value.status,
      executable: value.executable,
      reasons: value.reasons,
      stageDependency: value.stageDependency,
    };
    if (value.semanticHash !== semanticHash(base)) {
      throw new TypeError('Template readiness semantic hash is invalid.');
    }
    if (!Object.isFrozen(value)) throw new TypeError('Template readiness must be frozen.');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function createInitialTemplateReadinessContext({
  benchmarkManifests = [],
} = {}) {
  return deepFreeze({
    currentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
    parameterSchemas: [],
    benchmarkManifests: [...benchmarkManifests],
    releaseRecords: [],
    availableCompilerIds: [],
    availableProfileIds: [],
  });
}

function normalizeContext(context) {
  assertExactKeys(context, CONTEXT_KEYS, 'Template readiness context');
  const currentRegistryHash = hash(context.currentRegistryHash, 'currentRegistryHash');
  return deepFreeze({
    currentRegistryHash,
    parameterSchemas: objectArray(context.parameterSchemas, 'parameterSchemas'),
    benchmarkManifests: objectArray(
      context.benchmarkManifests,
      'benchmarkManifests',
    ),
    releaseRecords: objectArray(context.releaseRecords, 'releaseRecords'),
    availableCompilerIds: stringArray(
      context.availableCompilerIds,
      'availableCompilerIds',
    ),
    availableProfileIds: stringArray(
      context.availableProfileIds,
      'availableProfileIds',
    ),
  });
}

function compilerRoles(template) {
  return [
    ['geometryCompilerId', template.geometryCompilerId],
    ['loadCompilerId', template.loadCompilerId],
    ['boundaryCompilerId', template.boundaryCompilerId],
  ];
}

function readinessResult({
  template,
  stage,
  status,
  executable,
  reasons,
}) {
  const base = {
    schema: LAFEA_TEMPLATE_READINESS_SCHEMA,
    templateId: template.templateId,
    templateSemanticHash: template.semanticHash,
    parentRegistryHash: template.parentRegistryHash,
    status,
    executable,
    reasons,
    stageDependency: deepFreeze({
      stageId: stage.stageId,
      engineState: stage.engineState,
      enginePackage: stage.enginePackage,
      authority: stage.authority,
      inputContractRole: stage.inputContractRole,
      resultContractRole: stage.resultContractRole,
    }),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function objectArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object')) {
    throw new TypeError(`${field} must be an array of objects.`);
  }
  return value;
}

function stringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new TypeError(`${field} must be an array of non-empty strings.`);
  }
  const result = [...value].sort(asciiCompare);
  if (new Set(result).size !== result.length) {
    throw new TypeError(`${field} values must be unique.`);
  }
  return result;
}

function hash(value, field) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${field} must be a semantic hash.`);
  }
  return value;
}
