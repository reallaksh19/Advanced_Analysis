import {
  canonicalStringify,
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../shared-piping-model/index.js';
import {
  LAFEA_TEMPLATE_BENCHMARK_CASE_CATEGORIES,
  LAFEA_TEMPLATE_BENCHMARK_CASE_STATUSES,
  LAFEA_TEMPLATE_BENCHMARK_EVIDENCE_BASES,
  LAFEA_TEMPLATE_BENCHMARK_MANIFEST_SCHEMA,
  LAFEA_TEMPLATE_BENCHMARK_QUALIFICATION_STATUSES,
} from './benchmark-manifests/schemas.js';

export const LAFEA_APPLICATION_TEMPLATE_SCHEMA = 'lafea-application-template/v1';
export const LAFEA_TEMPLATE_PARAMETER_SCHEMA = 'lafea-template-parameter-schema/v1';
export const LAFEA_TEMPLATE_PARAMETER_SET_SCHEMA = 'lafea-template-parameter-set/v1';
export const LAFEA_TEMPLATE_GEOMETRY_RESULT_SCHEMA = 'lafea-template-geometry-result/v1';
export const LAFEA_TEMPLATE_LOAD_DEFINITION_SCHEMA = 'lafea-template-load-definition/v1';
export const LAFEA_TEMPLATE_BOUNDARY_DEFINITION_SCHEMA = 'lafea-template-boundary-definition/v1';
export const LAFEA_TEMPLATE_MESH_REQUEST_SCHEMA = 'lafea-template-mesh-request/v1';
export const LAFEA_TEMPLATE_HANDOFF_SCHEMA = 'lafea-template-handoff/v1';
export { LAFEA_TEMPLATE_BENCHMARK_MANIFEST_SCHEMA };
export const LAFEA_TEMPLATE_RELEASE_RECORD_SCHEMA = 'lafea-template-release-record/v1';

export const LAFEA_TEMPLATE_RELEASE_STATUSES = Object.freeze([
  'BLOCKED',
  'CONCEPT',
  'CONDITIONAL',
  'DEMONSTRATION',
  'DRAFT',
  'QUALIFIED',
  'STALE',
]);

export const LAFEA_TEMPLATE_PARAMETER_VALUE_KINDS = Object.freeze([
  'BOOLEAN',
  'ENUM',
  'FINITE_NUMBER',
  'JSON_RECORD',
  'TEXT',
]);

export const LAFEA_TEMPLATE_PARAMETER_VALUE_STATES = Object.freeze([
  'EMPTY_TEXT',
  'EXPLICIT_ZERO',
  'INVALID',
  'MISSING',
  'PRESENT_NULL',
  'VALUE',
]);

export const LAFEA_TEMPLATE_SOURCE_STATUSES = Object.freeze([
  'ASSUMED',
  'DECLARED',
  'IMPORTED',
  'UNRESOLVED',
  'VERIFIED',
]);

export const LAFEA_TEMPLATE_ARTIFACT_STATUSES = Object.freeze([
  'BLOCKED',
  'READY',
]);

export const LAFEA_TEMPLATE_PARAMETER_SET_STATUSES = Object.freeze([
  'BLOCKED',
  'VALID',
]);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const TEMPLATE_ID_PATTERN = /^(ALG|C2D|SHL|REC)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const STAGE_ID_PATTERN = /^LAFEA\.[1-6]$/u;

const APPLICATION_TEMPLATE_INPUT_KEYS = Object.freeze([
  'applicationFamily',
  'assessmentProfileIds',
  'benchmarkManifestId',
  'boundaryCompilerId',
  'bucketId',
  'compatibleStageIds',
  'entryStageId',
  'formulationProfileId',
  'geometryCompilerId',
  'label',
  'limitations',
  'loadCompilerId',
  'meshProfileId',
  'parameterSchemaId',
  'parentRegistryHash',
  'recoveryProfileId',
  'releaseStatus',
  'requiredEnginePackage',
  'requiredInputContractRole',
  'requiredResultContractRole',
  'requiredStageAuthority',
  'requiredStageEngineState',
  'solverProfileId',
  'templateId',
  'templateRevision',
]);

const PARAMETER_SCHEMA_INPUT_KEYS = Object.freeze([
  'limitations',
  'parameterSchemaId',
  'parameters',
  'templateId',
]);

const PARAMETER_DESCRIPTOR_KEYS = Object.freeze([
  'allowedUnits',
  'canonicalUnit',
  'dependencies',
  'enumValues',
  'label',
  'maximum',
  'minimum',
  'nullable',
  'parameterId',
  'required',
  'sourceRequired',
  'valueKind',
]);

const PARAMETER_SET_INPUT_KEYS = Object.freeze([
  'diagnostics',
  'parameterSchemaId',
  'status',
  'templateId',
  'values',
]);

const PARAMETER_VALUE_KEYS = Object.freeze([
  'parameterId',
  'sourceRef',
  'sourceStatus',
  'state',
  'unit',
  'value',
]);

const GEOMETRY_RESULT_INPUT_KEYS = Object.freeze([
  'ancestry',
  'compilerId',
  'compilerVersion',
  'coordinateSystem',
  'diagnostics',
  'features',
  'localFrames',
  'parameterSetHash',
  'parentRegistryHash',
  'status',
  'templateId',
  'templateSemanticHash',
  'units',
]);

const FEATURE_KEYS = Object.freeze([
  'featureId',
  'geometry',
  'kind',
  'sourceRefs',
  'status',
]);

const FRAME_KEYS = Object.freeze([
  'axes',
  'frameId',
  'handedness',
  'origin',
  'sourceRef',
  'status',
]);

const UNIT_KEYS = Object.freeze([
  'dimension',
  'unit',
]);

const LOAD_DEFINITION_INPUT_KEYS = Object.freeze([
  'compilerId',
  'diagnostics',
  'loadCases',
  'parameterSetHash',
  'parentGeometryHash',
  'status',
  'templateId',
  'templateSemanticHash',
]);

const LOAD_CASE_KEYS = Object.freeze([
  'caseId',
  'primitives',
  'sourceRefs',
  'status',
]);

const LOAD_PRIMITIVE_KEYS = Object.freeze([
  'basis',
  'entityId',
  'kind',
  'loadId',
  'referencePoint',
  'sourceRef',
  'status',
  'units',
  'values',
]);

const BOUNDARY_DEFINITION_INPUT_KEYS = Object.freeze([
  'boundaryConditions',
  'compilerId',
  'diagnostics',
  'parameterSetHash',
  'parentGeometryHash',
  'status',
  'templateId',
  'templateSemanticHash',
]);

const BOUNDARY_KEYS = Object.freeze([
  'basis',
  'boundaryId',
  'entityId',
  'kind',
  'sourceRef',
  'status',
  'units',
  'values',
]);

const MESH_REQUEST_INPUT_KEYS = Object.freeze([
  'bucketId',
  'diagnostics',
  'entryStageId',
  'featureSizing',
  'formulationProfileId',
  'meshProfileId',
  'parentGeometryHash',
  'qualityProfileId',
  'status',
  'templateId',
  'templateSemanticHash',
]);

const FEATURE_SIZING_KEYS = Object.freeze([
  'featureId',
  'sourceRef',
  'status',
  'targetSize',
  'unit',
]);

const HANDOFF_INPUT_KEYS = Object.freeze([
  'boundaryDefinitionHash',
  'diagnostics',
  'entryStageId',
  'geometryHash',
  'loadDefinitionHash',
  'meshRequestHash',
  'parameterSetHash',
  'parentRegistryHash',
  'requiredEnginePackage',
  'requiredInputContractRole',
  'stageSource',
  'status',
  'templateId',
  'templateSemanticHash',
]);

const BENCHMARK_MANIFEST_INPUT_KEYS = Object.freeze([
  'benchmarkManifestId',
  'benchmarks',
  'bucketBenchmarkManifestId',
  'bucketId',
  'limitations',
  'parentRegistryHash',
  'qualificationStatus',
  'revision',
  'templateId',
]);

const BENCHMARK_CASE_KEYS = Object.freeze([
  'benchmarkId',
  'category',
  'evidenceBasis',
  'expectedResultHash',
  'sourceRef',
  'status',
  'toleranceProfileId',
]);

const RELEASE_RECORD_INPUT_KEYS = Object.freeze([
  'benchmarkManifestHash',
  'benchmarkQualificationStatus',
  'diagnostics',
  'exactHeadSha',
  'executable',
  'limitations',
  'parentRegistryHash',
  'releaseStatus',
  'templateId',
  'templateSemanticHash',
]);

export function createApplicationTemplate(value) {
  assertInput(value, APPLICATION_TEMPLATE_INPUT_KEYS, 'Application template input');
  const normalized = {
    templateId: templateId(value.templateId),
    templateRevision: positiveInteger(value.templateRevision, 'templateRevision'),
    label: requiredText(value.label, 'label'),
    applicationFamily: requiredText(value.applicationFamily, 'applicationFamily'),
    bucketId: requiredText(value.bucketId, 'bucketId'),
    entryStageId: stageId(value.entryStageId, 'entryStageId'),
    compatibleStageIds: stageIds(value.compatibleStageIds, 'compatibleStageIds'),
    requiredStageEngineState: requiredText(
      value.requiredStageEngineState,
      'requiredStageEngineState',
    ),
    requiredEnginePackage: nullableText(value.requiredEnginePackage, 'requiredEnginePackage'),
    requiredStageAuthority: requiredText(value.requiredStageAuthority, 'requiredStageAuthority'),
    requiredInputContractRole: requiredText(
      value.requiredInputContractRole,
      'requiredInputContractRole',
    ),
    requiredResultContractRole: nullableText(
      value.requiredResultContractRole,
      'requiredResultContractRole',
    ),
    parameterSchemaId: requiredText(value.parameterSchemaId, 'parameterSchemaId'),
    geometryCompilerId: nullableText(value.geometryCompilerId, 'geometryCompilerId'),
    loadCompilerId: nullableText(value.loadCompilerId, 'loadCompilerId'),
    boundaryCompilerId: nullableText(value.boundaryCompilerId, 'boundaryCompilerId'),
    formulationProfileId: nullableText(value.formulationProfileId, 'formulationProfileId'),
    meshProfileId: nullableText(value.meshProfileId, 'meshProfileId'),
    solverProfileId: nullableText(value.solverProfileId, 'solverProfileId'),
    recoveryProfileId: nullableText(value.recoveryProfileId, 'recoveryProfileId'),
    assessmentProfileIds: stringArray(
      value.assessmentProfileIds,
      'assessmentProfileIds',
    ),
    benchmarkManifestId: requiredText(value.benchmarkManifestId, 'benchmarkManifestId'),
    parentRegistryHash: requiredHash(value.parentRegistryHash, 'parentRegistryHash'),
    releaseStatus: oneOf(value.releaseStatus, LAFEA_TEMPLATE_RELEASE_STATUSES, 'releaseStatus'),
    limitations: nonEmptyStringArray(value.limitations, 'limitations'),
  };
  if (!normalized.compatibleStageIds.includes(normalized.entryStageId)) {
    throw new TypeError('compatibleStageIds must include entryStageId.');
  }
  if (
    ['DRAFT', 'CONDITIONAL', 'QUALIFIED'].includes(normalized.releaseStatus)
    && [normalized.geometryCompilerId, normalized.loadCompilerId, normalized.boundaryCompilerId]
      .some((item) => item === null)
  ) {
    throw new TypeError('DRAFT or later templates require all three compiler identities.');
  }
  return finalize(LAFEA_APPLICATION_TEMPLATE_SCHEMA, normalized);
}

export function validateApplicationTemplate(value) {
  return validateCreated(
    value,
    LAFEA_APPLICATION_TEMPLATE_SCHEMA,
    APPLICATION_TEMPLATE_INPUT_KEYS,
    createApplicationTemplate,
    'Application template',
  );
}

export function createTemplateParameterSchema(value) {
  assertInput(value, PARAMETER_SCHEMA_INPUT_KEYS, 'Template parameter schema input');
  const parameters = arrayOf(value.parameters, parameterDescriptor, 'parameters')
    .sort((left, right) => asciiCompare(left.parameterId, right.parameterId));
  assertUnique(parameters.map((item) => item.parameterId), 'parameterId');
  const knownIds = new Set(parameters.map((item) => item.parameterId));
  parameters.forEach((item) => {
    item.dependencies.forEach((dependency) => {
      if (!knownIds.has(dependency)) {
        throw new TypeError(`Parameter ${item.parameterId} has unknown dependency ${dependency}.`);
      }
      if (dependency === item.parameterId) {
        throw new TypeError(`Parameter ${item.parameterId} cannot depend on itself.`);
      }
    });
  });
  return finalize(LAFEA_TEMPLATE_PARAMETER_SCHEMA, {
    parameterSchemaId: requiredText(value.parameterSchemaId, 'parameterSchemaId'),
    templateId: templateId(value.templateId),
    parameters,
    limitations: stringArray(value.limitations, 'limitations'),
  });
}

export function validateTemplateParameterSchema(value) {
  return validateCreated(
    value,
    LAFEA_TEMPLATE_PARAMETER_SCHEMA,
    PARAMETER_SCHEMA_INPUT_KEYS,
    createTemplateParameterSchema,
    'Template parameter schema',
  );
}

export function createTemplateParameterSet(value) {
  assertInput(value, PARAMETER_SET_INPUT_KEYS, 'Template parameter set input');
  const values = arrayOf(value.values, parameterValue, 'values')
    .sort((left, right) => asciiCompare(left.parameterId, right.parameterId));
  assertUnique(values.map((item) => item.parameterId), 'parameter value identity');
  const status = oneOf(value.status, LAFEA_TEMPLATE_PARAMETER_SET_STATUSES, 'status');
  if (
    status === 'VALID'
    && values.some((item) => ['EMPTY_TEXT', 'INVALID'].includes(item.state))
  ) {
    throw new TypeError('A VALID parameter set cannot contain empty or invalid values.');
  }
  return finalize(LAFEA_TEMPLATE_PARAMETER_SET_SCHEMA, {
    parameterSchemaId: requiredText(value.parameterSchemaId, 'parameterSchemaId'),
    templateId: templateId(value.templateId),
    values,
    status,
    diagnostics: stringArray(value.diagnostics, 'diagnostics'),
  });
}

export function validateTemplateParameterSet(value) {
  return validateCreated(
    value,
    LAFEA_TEMPLATE_PARAMETER_SET_SCHEMA,
    PARAMETER_SET_INPUT_KEYS,
    createTemplateParameterSet,
    'Template parameter set',
  );
}

export function createTemplateGeometryResult(value) {
  assertInput(value, GEOMETRY_RESULT_INPUT_KEYS, 'Template geometry result input');
  const status = artifactStatus(value.status);
  return finalize(LAFEA_TEMPLATE_GEOMETRY_RESULT_SCHEMA, {
    templateId: templateId(value.templateId),
    templateSemanticHash: requiredHash(value.templateSemanticHash, 'templateSemanticHash'),
    parameterSetHash: requiredHash(value.parameterSetHash, 'parameterSetHash'),
    parentRegistryHash: requiredHash(value.parentRegistryHash, 'parentRegistryHash'),
    compilerId: requiredText(value.compilerId, 'compilerId'),
    compilerVersion: requiredText(value.compilerVersion, 'compilerVersion'),
    coordinateSystem: coordinateSystem(value.coordinateSystem),
    units: arrayOf(value.units, unitRecord, 'units')
      .sort((left, right) => asciiCompare(left.dimension, right.dimension)),
    features: arrayOf(value.features, feature, 'features')
      .sort((left, right) => asciiCompare(left.featureId, right.featureId)),
    localFrames: arrayOf(value.localFrames, localFrame, 'localFrames')
      .sort((left, right) => asciiCompare(left.frameId, right.frameId)),
    ancestry: plainRecord(value.ancestry, 'ancestry'),
    status,
    diagnostics: stringArray(value.diagnostics, 'diagnostics'),
  });
}

export function validateTemplateGeometryResult(value) {
  return validateCreated(
    value,
    LAFEA_TEMPLATE_GEOMETRY_RESULT_SCHEMA,
    GEOMETRY_RESULT_INPUT_KEYS,
    createTemplateGeometryResult,
    'Template geometry result',
  );
}

export function createTemplateLoadDefinition(value) {
  assertInput(value, LOAD_DEFINITION_INPUT_KEYS, 'Template load definition input');
  return finalize(LAFEA_TEMPLATE_LOAD_DEFINITION_SCHEMA, {
    templateId: templateId(value.templateId),
    templateSemanticHash: requiredHash(value.templateSemanticHash, 'templateSemanticHash'),
    parameterSetHash: requiredHash(value.parameterSetHash, 'parameterSetHash'),
    parentGeometryHash: requiredHash(value.parentGeometryHash, 'parentGeometryHash'),
    compilerId: requiredText(value.compilerId, 'compilerId'),
    loadCases: arrayOf(value.loadCases, loadCase, 'loadCases')
      .sort((left, right) => asciiCompare(left.caseId, right.caseId)),
    status: artifactStatus(value.status),
    diagnostics: stringArray(value.diagnostics, 'diagnostics'),
  });
}

export function validateTemplateLoadDefinition(value) {
  return validateCreated(
    value,
    LAFEA_TEMPLATE_LOAD_DEFINITION_SCHEMA,
    LOAD_DEFINITION_INPUT_KEYS,
    createTemplateLoadDefinition,
    'Template load definition',
  );
}

export function createTemplateBoundaryDefinition(value) {
  assertInput(value, BOUNDARY_DEFINITION_INPUT_KEYS, 'Template boundary definition input');
  return finalize(LAFEA_TEMPLATE_BOUNDARY_DEFINITION_SCHEMA, {
    templateId: templateId(value.templateId),
    templateSemanticHash: requiredHash(value.templateSemanticHash, 'templateSemanticHash'),
    parameterSetHash: requiredHash(value.parameterSetHash, 'parameterSetHash'),
    parentGeometryHash: requiredHash(value.parentGeometryHash, 'parentGeometryHash'),
    compilerId: requiredText(value.compilerId, 'compilerId'),
    boundaryConditions: arrayOf(
      value.boundaryConditions,
      boundaryCondition,
      'boundaryConditions',
    ).sort((left, right) => asciiCompare(left.boundaryId, right.boundaryId)),
    status: artifactStatus(value.status),
    diagnostics: stringArray(value.diagnostics, 'diagnostics'),
  });
}

export function validateTemplateBoundaryDefinition(value) {
  return validateCreated(
    value,
    LAFEA_TEMPLATE_BOUNDARY_DEFINITION_SCHEMA,
    BOUNDARY_DEFINITION_INPUT_KEYS,
    createTemplateBoundaryDefinition,
    'Template boundary definition',
  );
}

export function createTemplateMeshRequest(value) {
  assertInput(value, MESH_REQUEST_INPUT_KEYS, 'Template mesh request input');
  return finalize(LAFEA_TEMPLATE_MESH_REQUEST_SCHEMA, {
    templateId: templateId(value.templateId),
    templateSemanticHash: requiredHash(value.templateSemanticHash, 'templateSemanticHash'),
    parentGeometryHash: requiredHash(value.parentGeometryHash, 'parentGeometryHash'),
    bucketId: requiredText(value.bucketId, 'bucketId'),
    entryStageId: stageId(value.entryStageId, 'entryStageId'),
    formulationProfileId: requiredText(value.formulationProfileId, 'formulationProfileId'),
    meshProfileId: requiredText(value.meshProfileId, 'meshProfileId'),
    qualityProfileId: requiredText(value.qualityProfileId, 'qualityProfileId'),
    featureSizing: arrayOf(value.featureSizing, featureSizing, 'featureSizing')
      .sort((left, right) => asciiCompare(left.featureId, right.featureId)),
    status: artifactStatus(value.status),
    diagnostics: stringArray(value.diagnostics, 'diagnostics'),
  });
}

export function validateTemplateMeshRequest(value) {
  return validateCreated(
    value,
    LAFEA_TEMPLATE_MESH_REQUEST_SCHEMA,
    MESH_REQUEST_INPUT_KEYS,
    createTemplateMeshRequest,
    'Template mesh request',
  );
}

export function createTemplateHandoff(value) {
  assertInput(value, HANDOFF_INPUT_KEYS, 'Template handoff input');
  return finalize(LAFEA_TEMPLATE_HANDOFF_SCHEMA, {
    templateId: templateId(value.templateId),
    templateSemanticHash: requiredHash(value.templateSemanticHash, 'templateSemanticHash'),
    parentRegistryHash: requiredHash(value.parentRegistryHash, 'parentRegistryHash'),
    entryStageId: stageId(value.entryStageId, 'entryStageId'),
    requiredEnginePackage: nullableText(value.requiredEnginePackage, 'requiredEnginePackage'),
    requiredInputContractRole: requiredText(
      value.requiredInputContractRole,
      'requiredInputContractRole',
    ),
    parameterSetHash: requiredHash(value.parameterSetHash, 'parameterSetHash'),
    geometryHash: requiredHash(value.geometryHash, 'geometryHash'),
    loadDefinitionHash: requiredHash(value.loadDefinitionHash, 'loadDefinitionHash'),
    boundaryDefinitionHash: requiredHash(
      value.boundaryDefinitionHash,
      'boundaryDefinitionHash',
    ),
    meshRequestHash: nullableHash(value.meshRequestHash, 'meshRequestHash'),
    stageSource: plainRecord(value.stageSource, 'stageSource'),
    status: artifactStatus(value.status),
    diagnostics: stringArray(value.diagnostics, 'diagnostics'),
  });
}

export function validateTemplateHandoff(value) {
  return validateCreated(
    value,
    LAFEA_TEMPLATE_HANDOFF_SCHEMA,
    HANDOFF_INPUT_KEYS,
    createTemplateHandoff,
    'Template handoff',
  );
}

export function assertCurrentTemplateHandoff(value, parents) {
  const validation = validateTemplateHandoff(value);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  assertExactKeys(
    parents,
    ['parentRegistryHash', 'templateSemanticHash'],
    'Template handoff current-parent input',
  );
  if (value.parentRegistryHash !== parents.parentRegistryHash) {
    throw staleError('STALE_TEMPLATE_REGISTRY_PARENT');
  }
  if (value.templateSemanticHash !== parents.templateSemanticHash) {
    throw staleError('STALE_TEMPLATE_PARENT');
  }
  return value;
}

export function createTemplateBenchmarkManifest(value) {
  assertInput(value, BENCHMARK_MANIFEST_INPUT_KEYS, 'Template benchmark manifest input');
  const benchmarks = arrayOf(value.benchmarks, benchmarkCase, 'benchmarks')
    .sort((left, right) => asciiCompare(left.benchmarkId, right.benchmarkId));
  assertUnique(benchmarks.map((item) => item.benchmarkId), 'benchmarkId');
  const qualificationStatus = oneOf(
    value.qualificationStatus,
    LAFEA_TEMPLATE_BENCHMARK_QUALIFICATION_STATUSES,
    'qualificationStatus',
  );
  if (
    qualificationStatus === 'QUALIFIED'
    && benchmarks.some((item) => item.status !== 'PASS' || item.expectedResultHash === null)
  ) {
    throw new TypeError('A QUALIFIED manifest requires every benchmark to PASS with expected evidence.');
  }
  return finalize(LAFEA_TEMPLATE_BENCHMARK_MANIFEST_SCHEMA, {
    benchmarkManifestId: requiredText(value.benchmarkManifestId, 'benchmarkManifestId'),
    templateId: templateId(value.templateId),
    bucketId: requiredText(value.bucketId, 'bucketId'),
    revision: positiveInteger(value.revision, 'revision'),
    parentRegistryHash: requiredHash(value.parentRegistryHash, 'parentRegistryHash'),
    bucketBenchmarkManifestId: requiredText(
      value.bucketBenchmarkManifestId,
      'bucketBenchmarkManifestId',
    ),
    benchmarks,
    qualificationStatus,
    limitations: stringArray(value.limitations, 'limitations'),
  });
}

export function validateTemplateBenchmarkManifest(value) {
  return validateCreated(
    value,
    LAFEA_TEMPLATE_BENCHMARK_MANIFEST_SCHEMA,
    BENCHMARK_MANIFEST_INPUT_KEYS,
    createTemplateBenchmarkManifest,
    'Template benchmark manifest',
  );
}

export function createTemplateReleaseRecord(value) {
  assertInput(value, RELEASE_RECORD_INPUT_KEYS, 'Template release record input');
  const releaseStatus = oneOf(
    value.releaseStatus,
    LAFEA_TEMPLATE_RELEASE_STATUSES,
    'releaseStatus',
  );
  const benchmarkQualificationStatus = oneOf(
    value.benchmarkQualificationStatus,
    LAFEA_TEMPLATE_BENCHMARK_QUALIFICATION_STATUSES,
    'benchmarkQualificationStatus',
  );
  const exactHeadSha = nullableCommit(value.exactHeadSha);
  const executable = booleanValue(value.executable, 'executable');
  const limitations = stringArray(value.limitations, 'limitations');
  if (executable) {
    if (!['CONDITIONAL', 'QUALIFIED'].includes(releaseStatus)) {
      throw new TypeError('An executable release must be CONDITIONAL or QUALIFIED.');
    }
    if (benchmarkQualificationStatus !== 'QUALIFIED') {
      throw new TypeError('An executable release requires a QUALIFIED benchmark manifest.');
    }
    if (exactHeadSha === null) {
      throw new TypeError('An executable release requires exactHeadSha.');
    }
    if (releaseStatus === 'CONDITIONAL' && limitations.length === 0) {
      throw new TypeError('A CONDITIONAL executable release requires explicit limitations.');
    }
  }
  return finalize(LAFEA_TEMPLATE_RELEASE_RECORD_SCHEMA, {
    templateId: templateId(value.templateId),
    templateSemanticHash: requiredHash(value.templateSemanticHash, 'templateSemanticHash'),
    parentRegistryHash: requiredHash(value.parentRegistryHash, 'parentRegistryHash'),
    benchmarkManifestHash: requiredHash(
      value.benchmarkManifestHash,
      'benchmarkManifestHash',
    ),
    benchmarkQualificationStatus,
    exactHeadSha,
    releaseStatus,
    executable,
    limitations,
    diagnostics: stringArray(value.diagnostics, 'diagnostics'),
  });
}

export function validateTemplateReleaseRecord(value) {
  return validateCreated(
    value,
    LAFEA_TEMPLATE_RELEASE_RECORD_SCHEMA,
    RELEASE_RECORD_INPUT_KEYS,
    createTemplateReleaseRecord,
    'Template release record',
  );
}

export function assertCurrentTemplateReleaseRecord(value, parents) {
  const validation = validateTemplateReleaseRecord(value);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  assertExactKeys(
    parents,
    ['benchmarkManifestHash', 'parentRegistryHash', 'templateSemanticHash'],
    'Template release current-parent input',
  );
  if (value.parentRegistryHash !== parents.parentRegistryHash) {
    throw staleError('STALE_TEMPLATE_REGISTRY_PARENT');
  }
  if (value.templateSemanticHash !== parents.templateSemanticHash) {
    throw staleError('STALE_TEMPLATE_PARENT');
  }
  if (value.benchmarkManifestHash !== parents.benchmarkManifestHash) {
    throw staleError('STALE_TEMPLATE_BENCHMARK_PARENT');
  }
  return value;
}

export function assertExactKeys(value, expectedKeys, label = 'Object') {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object.`);
  const actual = Object.keys(value).sort(asciiCompare);
  const expected = [...expectedKeys].sort(asciiCompare);
  if (canonicalStringify(actual) !== canonicalStringify(expected)) {
    throw new TypeError(`${label} keys are invalid.`);
  }
}

export function asciiCompare(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function parameterDescriptor(value, index) {
  assertExactKeys(value, PARAMETER_DESCRIPTOR_KEYS, `parameters[${index}]`);
  const kind = oneOf(value.valueKind, LAFEA_TEMPLATE_PARAMETER_VALUE_KINDS, 'valueKind');
  const canonicalUnit = nullableText(value.canonicalUnit, 'canonicalUnit');
  const allowedUnits = stringArray(value.allowedUnits, 'allowedUnits');
  if (canonicalUnit !== null && !allowedUnits.includes(canonicalUnit)) {
    throw new TypeError('allowedUnits must include canonicalUnit.');
  }
  if (canonicalUnit === null && allowedUnits.length > 0) {
    throw new TypeError('Unitless parameters cannot declare allowedUnits.');
  }
  const enumValues = stringArray(value.enumValues, 'enumValues');
  if (kind === 'ENUM' && enumValues.length === 0) {
    throw new TypeError('ENUM parameters require enumValues.');
  }
  if (kind !== 'ENUM' && enumValues.length > 0) {
    throw new TypeError('Only ENUM parameters may declare enumValues.');
  }
  const minimum = nullableFinite(value.minimum, 'minimum');
  const maximum = nullableFinite(value.maximum, 'maximum');
  if (minimum !== null && maximum !== null && minimum > maximum) {
    throw new TypeError('minimum cannot exceed maximum.');
  }
  return deepFreeze({
    parameterId: requiredText(value.parameterId, 'parameterId'),
    label: requiredText(value.label, 'label'),
    valueKind: kind,
    required: booleanValue(value.required, 'required'),
    nullable: booleanValue(value.nullable, 'nullable'),
    canonicalUnit,
    allowedUnits,
    minimum,
    maximum,
    enumValues,
    sourceRequired: booleanValue(value.sourceRequired, 'sourceRequired'),
    dependencies: stringArray(value.dependencies, 'dependencies'),
  });
}

function parameterValue(value, index) {
  assertExactKeys(value, PARAMETER_VALUE_KEYS, `values[${index}]`);
  const state = oneOf(value.state, LAFEA_TEMPLATE_PARAMETER_VALUE_STATES, 'state');
  const sourceStatus = nullableOneOf(
    value.sourceStatus,
    LAFEA_TEMPLATE_SOURCE_STATUSES,
    'sourceStatus',
  );
  const unit = nullableText(value.unit, 'unit');
  const sourceRef = nullableRecord(value.sourceRef, 'sourceRef');
  if (['MISSING', 'EMPTY_TEXT', 'INVALID', 'PRESENT_NULL'].includes(state) && value.value !== null) {
    throw new TypeError(`${state} parameter values must retain value=null.`);
  }
  if (state === 'EXPLICIT_ZERO' && value.value !== 0) {
    throw new TypeError('EXPLICIT_ZERO parameter value must equal numeric zero.');
  }
  if (state === 'VALUE' && value.value === null) {
    throw new TypeError('VALUE parameter state requires a non-null value.');
  }
  return deepFreeze({
    parameterId: requiredText(value.parameterId, 'parameterId'),
    state,
    value: jsonValue(value.value, 'value'),
    unit,
    sourceRef,
    sourceStatus,
  });
}

function coordinateSystem(value) {
  const keys = ['axes', 'handedness', 'identity', 'origin', 'sourceRef', 'status'];
  assertExactKeys(value, keys, 'coordinateSystem');
  return deepFreeze({
    identity: requiredText(value.identity, 'coordinateSystem.identity'),
    origin: finiteArray(value.origin, 3, 'coordinateSystem.origin'),
    axes: matrix3(value.axes, 'coordinateSystem.axes'),
    handedness: oneOf(value.handedness, ['RIGHT_HANDED'], 'coordinateSystem.handedness'),
    sourceRef: nullableRecord(value.sourceRef, 'coordinateSystem.sourceRef'),
    status: oneOf(value.status, LAFEA_TEMPLATE_SOURCE_STATUSES, 'coordinateSystem.status'),
  });
}

function unitRecord(value, index) {
  assertExactKeys(value, UNIT_KEYS, `units[${index}]`);
  return deepFreeze({
    dimension: requiredText(value.dimension, 'dimension'),
    unit: requiredText(value.unit, 'unit'),
  });
}

function feature(value, index) {
  assertExactKeys(value, FEATURE_KEYS, `features[${index}]`);
  return deepFreeze({
    featureId: requiredText(value.featureId, 'featureId'),
    kind: requiredText(value.kind, 'kind'),
    geometry: plainRecord(value.geometry, 'geometry'),
    sourceRefs: recordArray(value.sourceRefs, 'sourceRefs'),
    status: oneOf(value.status, LAFEA_TEMPLATE_SOURCE_STATUSES, 'status'),
  });
}

function localFrame(value, index) {
  assertExactKeys(value, FRAME_KEYS, `localFrames[${index}]`);
  return deepFreeze({
    frameId: requiredText(value.frameId, 'frameId'),
    origin: finiteArray(value.origin, 3, 'origin'),
    axes: matrix3(value.axes, 'axes'),
    handedness: oneOf(value.handedness, ['RIGHT_HANDED'], 'handedness'),
    sourceRef: nullableRecord(value.sourceRef, 'sourceRef'),
    status: oneOf(value.status, LAFEA_TEMPLATE_SOURCE_STATUSES, 'status'),
  });
}

function loadCase(value, index) {
  assertExactKeys(value, LOAD_CASE_KEYS, `loadCases[${index}]`);
  const primitives = arrayOf(value.primitives, loadPrimitive, 'primitives')
    .sort((left, right) => asciiCompare(left.loadId, right.loadId));
  assertUnique(primitives.map((item) => item.loadId), 'loadId');
  return deepFreeze({
    caseId: requiredText(value.caseId, 'caseId'),
    primitives,
    sourceRefs: recordArray(value.sourceRefs, 'sourceRefs'),
    status: oneOf(value.status, LAFEA_TEMPLATE_SOURCE_STATUSES, 'status'),
  });
}

function loadPrimitive(value, index) {
  assertExactKeys(value, LOAD_PRIMITIVE_KEYS, `primitives[${index}]`);
  return deepFreeze({
    loadId: requiredText(value.loadId, 'loadId'),
    kind: requiredText(value.kind, 'kind'),
    entityId: requiredText(value.entityId, 'entityId'),
    basis: requiredText(value.basis, 'basis'),
    referencePoint: nullableFiniteArray(value.referencePoint, 3, 'referencePoint'),
    values: plainRecord(value.values, 'values'),
    units: recordArray(value.units, 'units'),
    sourceRef: nullableRecord(value.sourceRef, 'sourceRef'),
    status: oneOf(value.status, LAFEA_TEMPLATE_SOURCE_STATUSES, 'status'),
  });
}

function boundaryCondition(value, index) {
  assertExactKeys(value, BOUNDARY_KEYS, `boundaryConditions[${index}]`);
  return deepFreeze({
    boundaryId: requiredText(value.boundaryId, 'boundaryId'),
    kind: requiredText(value.kind, 'kind'),
    entityId: requiredText(value.entityId, 'entityId'),
    basis: requiredText(value.basis, 'basis'),
    values: plainRecord(value.values, 'values'),
    units: recordArray(value.units, 'units'),
    sourceRef: nullableRecord(value.sourceRef, 'sourceRef'),
    status: oneOf(value.status, LAFEA_TEMPLATE_SOURCE_STATUSES, 'status'),
  });
}

function featureSizing(value, index) {
  assertExactKeys(value, FEATURE_SIZING_KEYS, `featureSizing[${index}]`);
  return deepFreeze({
    featureId: requiredText(value.featureId, 'featureId'),
    targetSize: positiveFinite(value.targetSize, 'targetSize'),
    unit: requiredText(value.unit, 'unit'),
    sourceRef: nullableRecord(value.sourceRef, 'sourceRef'),
    status: oneOf(value.status, LAFEA_TEMPLATE_SOURCE_STATUSES, 'status'),
  });
}

function benchmarkCase(value, index) {
  assertExactKeys(value, BENCHMARK_CASE_KEYS, `benchmarks[${index}]`);
  const status = oneOf(
    value.status,
    LAFEA_TEMPLATE_BENCHMARK_CASE_STATUSES,
    'benchmark status',
  );
  const evidenceBasis = oneOf(
    value.evidenceBasis,
    LAFEA_TEMPLATE_BENCHMARK_EVIDENCE_BASES,
    'evidenceBasis',
  );
  const expectedResultHash = nullableHash(value.expectedResultHash, 'expectedResultHash');
  if (status === 'PASS' && (expectedResultHash === null || evidenceBasis === 'UNRESOLVED')) {
    throw new TypeError('PASS benchmark cases require independent expected-result evidence.');
  }
  return deepFreeze({
    benchmarkId: requiredText(value.benchmarkId, 'benchmarkId'),
    category: oneOf(
      value.category,
      LAFEA_TEMPLATE_BENCHMARK_CASE_CATEGORIES,
      'category',
    ),
    evidenceBasis,
    expectedResultHash,
    sourceRef: nullableRecord(value.sourceRef, 'sourceRef'),
    toleranceProfileId: nullableText(value.toleranceProfileId, 'toleranceProfileId'),
    status,
  });
}

function validateCreated(value, schema, inputKeys, creator, label) {
  const errors = [];
  try {
    assertExactKeys(value, [...inputKeys, 'schema', 'semanticHash'], label);
    if (value.schema !== schema) throw new TypeError(`${label} schema is invalid.`);
    const { schema: ignoredSchema, semanticHash: declaredHash, ...input } = value;
    void ignoredSchema;
    const expected = creator(input);
    if (
      declaredHash !== expected.semanticHash
      || canonicalStringify(value) !== canonicalStringify(expected)
    ) {
      throw new TypeError(`${label} semantic content is invalid.`);
    }
    if (!isDeepFrozen(value)) throw new TypeError(`${label} must be deeply frozen.`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function finalize(schema, normalized) {
  const base = { schema, ...normalized };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function assertInput(value, keys, label) {
  assertExactKeys(value, keys, label);
}

function templateId(value) {
  const result = requiredText(value, 'templateId');
  if (!TEMPLATE_ID_PATTERN.test(result)) throw new TypeError('templateId is invalid.');
  return result;
}

function stageId(value, field) {
  const result = requiredText(value, field);
  if (!STAGE_ID_PATTERN.test(result)) throw new TypeError(`${field} is invalid.`);
  return result;
}

function stageIds(value, field) {
  const result = arrayOf(value, (item) => stageId(item, field), field)
    .sort(asciiCompare);
  assertUnique(result, field);
  if (result.length === 0) throw new TypeError(`${field} must not be empty.`);
  return result;
}

function artifactStatus(value) {
  return oneOf(value, LAFEA_TEMPLATE_ARTIFACT_STATUSES, 'status');
}

function requiredText(value, field) {
  const result = stringValue(value);
  if (!result) throw new TypeError(`${field} must be a non-empty string.`);
  if (/[^\x20-\x7e]/u.test(result)) throw new TypeError(`${field} must contain printable ASCII only.`);
  return result;
}

function nullableText(value, field) {
  return value === null ? null : requiredText(value, field);
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw new TypeError(`${field} is invalid.`);
  return value;
}

function nullableOneOf(value, allowed, field) {
  return value === null ? null : oneOf(value, allowed, field);
}

function booleanValue(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer.`);
  }
  return value;
}

function positiveFinite(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive finite number.`);
  }
  return value;
}

function nullableFinite(value, field) {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new TypeError(`${field} must be null or finite.`);
  return Object.is(value, -0) ? 0 : value;
}

function requiredHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a semantic hash.`);
  }
  return value;
}

function nullableHash(value, field) {
  return value === null ? null : requiredHash(value, field);
}

function nullableCommit(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !COMMIT_PATTERN.test(value)) {
    throw new TypeError('exactHeadSha must be null or a 40-character lowercase commit SHA.');
  }
  return value;
}

function stringArray(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array.`);
  const result = value.map((item) => requiredText(item, field)).sort(asciiCompare);
  assertUnique(result, field);
  return result;
}

function nonEmptyStringArray(value, field) {
  const result = stringArray(value, field);
  if (result.length === 0) throw new TypeError(`${field} must not be empty.`);
  return result;
}

function arrayOf(value, normalize, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array.`);
  return value.map((item, index) => normalize(item, index));
}

function recordArray(value, field) {
  return arrayOf(value, (item, index) => plainRecord(item, `${field}[${index}]`), field);
}

function plainRecord(value, field) {
  if (!isPlainRecord(value)) throw new TypeError(`${field} must be a plain object.`);
  canonicalStringify(value);
  return value;
}

function nullableRecord(value, field) {
  return value === null ? null : plainRecord(value, field);
}

function jsonValue(value, field) {
  canonicalStringify(value);
  return value;
}

function finiteArray(value, length, field) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${field} must contain exactly ${length} values.`);
  }
  return value.map((item, index) => {
    if (!Number.isFinite(item)) throw new TypeError(`${field}[${index}] must be finite.`);
    return Object.is(item, -0) ? 0 : item;
  });
}

function nullableFiniteArray(value, length, field) {
  return value === null ? null : finiteArray(value, length, field);
}

function matrix3(value, field) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${field} must contain three axes.`);
  }
  return value.map((axis, index) => finiteArray(axis, 3, `${field}[${index}]`));
}

function assertUnique(values, field) {
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${field} values must be unique.`);
  }
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => isDeepFrozen(child, seen));
}

function staleError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
