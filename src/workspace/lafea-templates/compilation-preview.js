import {
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import {
  validateTemplateBoundaryDefinition,
  validateTemplateGeometryResult,
  validateTemplateHandoff,
  validateTemplateLoadDefinition,
  validateTemplateMeshRequest,
  validateTemplateParameterSet,
} from '../../core/lafea-application-templates/contracts.js';
import {
  LAFEA_T3_COMPILED_TEMPLATE_IDS,
  compileLafeaApplicationTemplate,
} from '../../core/lafea-application-templates/t3-analytical.js';
import {
  LAFEA_T4_COMPILED_CONTINUUM_TEMPLATE_IDS,
  compileLafeaContinuumApplicationTemplate,
} from '../../core/lafea-application-templates/t4-continuum.js';
import {
  LAFEA_TEMPLATE_PARAMETER_DRAFT_VALIDATION_SCHEMA,
  createLafeaRawParametersFromDraft,
} from './parameter-draft.js';

export const LAFEA_TEMPLATE_COMPILATION_PREVIEW_SCHEMA =
  'lafea-template-compilation-preview/v1';
export const LAFEA_TEMPLATE_COMPILATION_PREVIEW_ATTEMPT_SCHEMA =
  'lafea-template-compilation-preview-attempt/v1';
export const LAFEA_TEMPLATE_COMPILATION_PREVIEW_STATUS =
  'READY_FOR_INSPECTION';
export const LAFEA_TEMPLATE_COMPILATION_PREVIEW_ATTEMPT_STATUSES =
  deepFreeze(['BLOCKED', 'READY']);

export const LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY = deepFreeze({
  liveUiComposition: true,
  templateSelection: true,
  selectionOnly: false,
  parameterEntry: true,
  parameterValidation: true,
  compilerInvocation: true,
  compilationInspection: true,
  handoffInspection: true,
  workbenchImport: false,
  engineExecution: false,
  lifecycleRegistration: false,
  releasePromotion: false,
});

const VALIDATION_KEYS = Object.freeze([
  'diagnostics',
  'draftSemanticHash',
  'parameterSchemaId',
  'parameterSet',
  'schema',
  'semanticHash',
  'status',
  'templateId',
]);
const ANALYTICAL_TEMPLATE_IDS = new Set(LAFEA_T3_COMPILED_TEMPLATE_IDS);
const CONTINUUM_TEMPLATE_IDS = new Set(LAFEA_T4_COMPILED_CONTINUUM_TEMPLATE_IDS);

export function createLafeaTemplateCompilationPreview(
  parameterSchema,
  draft,
  validation,
) {
  requireCurrentValidParameterSet(parameterSchema, draft, validation);
  const rawParameters = createLafeaRawParametersFromDraft(parameterSchema, draft);
  const compilation = compileTemplate(parameterSchema.templateId, rawParameters);
  assertCompilation(parameterSchema, validation, compilation);

  const base = {
    schema: LAFEA_TEMPLATE_COMPILATION_PREVIEW_SCHEMA,
    status: LAFEA_TEMPLATE_COMPILATION_PREVIEW_STATUS,
    authority: LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
    templateId: parameterSchema.templateId,
    parameterSchemaId: parameterSchema.parameterSchemaId,
    draftSemanticHash: draft.semanticHash,
    inputParameterSetHash: validation.parameterSet.semanticHash,
    compiledParameterSetHash: compilation.parameterSet.semanticHash,
    compilationSemanticHash: compilation.semanticHash,
    handoffSemanticHash: compilation.handoff.semanticHash,
    entryStageId: compilation.handoff.entryStageId,
    compilation,
    diagnostics: deepFreeze(sortedUnique([
      ...compilation.diagnostics,
      'COMPILATION_PREVIEW_ONLY',
      'HANDOFF_INSPECTION_ONLY',
      'WORKBENCH_IMPORT_NOT_AUTHORIZED',
      'ENGINE_NOT_EXECUTED',
    ])),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function attemptLafeaTemplateCompilationPreview(
  parameterSchema,
  draft,
  validation,
) {
  try {
    const preview = createLafeaTemplateCompilationPreview(
      parameterSchema,
      draft,
      validation,
    );
    return createAttempt({
      parameterSchema,
      draft,
      status: 'READY',
      preview,
      errorCode: null,
      diagnostics: [],
    });
  } catch (error) {
    return createAttempt({
      parameterSchema,
      draft,
      status: 'BLOCKED',
      preview: null,
      errorCode: errorCode(error),
      diagnostics: [errorMessage(error)],
    });
  }
}

function createAttempt({
  parameterSchema,
  draft,
  status,
  preview,
  errorCode,
  diagnostics,
}) {
  if (!LAFEA_TEMPLATE_COMPILATION_PREVIEW_ATTEMPT_STATUSES.includes(status)) {
    throw new TypeError(`Unsupported compilation preview attempt status: ${status}.`);
  }
  const base = {
    schema: LAFEA_TEMPLATE_COMPILATION_PREVIEW_ATTEMPT_SCHEMA,
    status,
    authority: LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
    templateId: parameterSchema?.templateId ?? null,
    parameterSchemaId: parameterSchema?.parameterSchemaId ?? null,
    draftSemanticHash: draft?.semanticHash ?? null,
    preview,
    errorCode,
    diagnostics: deepFreeze(sortedUnique(diagnostics)),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function requireCurrentValidParameterSet(parameterSchema, draft, validation) {
  if (!parameterSchema || typeof parameterSchema !== 'object' || Array.isArray(parameterSchema)) {
    throw previewError('T7B_PARAMETER_SCHEMA_REQUIRED');
  }
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw previewError('T7B_PARAMETER_DRAFT_REQUIRED');
  }
  requireExactKeys(validation, VALIDATION_KEYS, 'T7B parameter validation');
  if (validation.schema !== LAFEA_TEMPLATE_PARAMETER_DRAFT_VALIDATION_SCHEMA) {
    throw previewError('T7B_PARAMETER_VALIDATION_SCHEMA_INVALID');
  }
  if (!Object.isFrozen(validation) || !Object.isFrozen(validation.parameterSet)) {
    throw previewError('T7B_PARAMETER_VALIDATION_MUST_BE_FROZEN');
  }
  const { semanticHash: declaredValidationHash, ...validationBase } = validation;
  if (declaredValidationHash !== semanticHash(validationBase)) {
    throw previewError('T7B_PARAMETER_VALIDATION_HASH_INVALID');
  }
  if (!validateTemplateParameterSet(validation.parameterSet).ok) {
    throw previewError('T7B_PARAMETER_SET_CONTRACT_INVALID');
  }
  if (validation.status !== 'VALID' || validation.parameterSet.status !== 'VALID') {
    throw previewError('T7B_VALID_PARAMETER_SET_REQUIRED');
  }
  if (validation.status !== validation.parameterSet.status) {
    throw previewError('T7B_PARAMETER_VALIDATION_STATUS_MISMATCH');
  }
  if (
    validation.templateId !== parameterSchema.templateId
    || validation.parameterSchemaId !== parameterSchema.parameterSchemaId
    || validation.parameterSet.templateId !== parameterSchema.templateId
    || validation.parameterSet.parameterSchemaId !== parameterSchema.parameterSchemaId
  ) {
    throw previewError('T7B_PARAMETER_VALIDATION_IDENTITY_MISMATCH');
  }
  if (validation.draftSemanticHash !== draft.semanticHash) {
    throw previewError('T7B_PARAMETER_VALIDATION_STALE');
  }
}

function compileTemplate(templateId, rawParameters) {
  if (ANALYTICAL_TEMPLATE_IDS.has(templateId)) {
    return compileLafeaApplicationTemplate({ templateId, rawParameters });
  }
  if (CONTINUUM_TEMPLATE_IDS.has(templateId)) {
    return compileLafeaContinuumApplicationTemplate({ templateId, rawParameters });
  }
  throw previewError(`T7B_TEMPLATE_COMPILER_NOT_AVAILABLE:${templateId}`);
}

function assertCompilation(parameterSchema, validation, compilation) {
  if (!compilation || typeof compilation !== 'object' || Array.isArray(compilation)) {
    throw previewError('T7B_COMPILATION_RESULT_REQUIRED');
  }
  if (compilation.status !== 'READY') {
    throw previewError(`T7B_COMPILATION_NOT_READY:${compilation.status}`);
  }
  if (
    compilation.templateId !== parameterSchema.templateId
    || compilation.parameterSchemaId !== parameterSchema.parameterSchemaId
  ) {
    throw previewError('T7B_COMPILATION_IDENTITY_MISMATCH');
  }
  if (compilation.parameterSet?.status !== 'VALID') {
    throw previewError('T7B_COMPILED_PARAMETER_SET_NOT_VALID');
  }
  if (compilation.handoff?.status !== 'READY') {
    throw previewError('T7B_HANDOFF_NOT_READY');
  }
  if (compilation.handoff.templateId !== parameterSchema.templateId) {
    throw previewError('T7B_HANDOFF_TEMPLATE_MISMATCH');
  }
  if (compilation.handoff.parameterSetHash !== compilation.parameterSet.semanticHash) {
    throw previewError('T7B_HANDOFF_PARAMETER_SET_HASH_MISMATCH');
  }
  if (!compilation.handoff.diagnostics.includes('ENGINE_NOT_EXECUTED')) {
    throw previewError('T7B_HANDOFF_ENGINE_DIAGNOSTIC_MISSING');
  }
  if (!validateTemplateGeometryResult(compilation.geometry).ok) {
    throw previewError('T7B_GEOMETRY_ARTIFACT_INVALID');
  }
  if (!validateTemplateLoadDefinition(compilation.loadDefinition).ok) {
    throw previewError('T7B_LOAD_ARTIFACT_INVALID');
  }
  if (!validateTemplateBoundaryDefinition(compilation.boundaryDefinition).ok) {
    throw previewError('T7B_BOUNDARY_ARTIFACT_INVALID');
  }
  if (
    compilation.meshRequest !== null
    && !validateTemplateMeshRequest(compilation.meshRequest).ok
  ) {
    throw previewError('T7B_MESH_REQUEST_ARTIFACT_INVALID');
  }
  if (!validateTemplateHandoff(compilation.handoff).ok) {
    throw previewError('T7B_HANDOFF_ARTIFACT_INVALID');
  }
  if (!Object.isFrozen(compilation) || !Object.isFrozen(compilation.handoff)) {
    throw previewError('T7B_COMPILATION_MUST_BE_FROZEN');
  }
  if (
    validation.parameterSet.templateId !== compilation.parameterSet.templateId
    || validation.parameterSet.parameterSchemaId
      !== compilation.parameterSet.parameterSchemaId
  ) {
    throw previewError('T7B_COMPILED_PARAMETER_PARENT_MISMATCH');
  }
}

function requireExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw previewError('T7B_VALID_PARAMETER_SET_REQUIRED');
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw previewError(`${label.toUpperCase().replaceAll(' ', '_')}_KEYS_INVALID`);
  }
}

function previewError(code) {
  const error = new TypeError(code);
  error.code = String(code).split(':')[0];
  return error;
}

function errorCode(error) {
  if (typeof error?.code === 'string' && error.code) return error.code;
  const message = errorMessage(error);
  const token = message.split(':')[0];
  return token || 'T7B_COMPILATION_PREVIEW_FAILED';
}

function errorMessage(error) {
  if (typeof error?.message === 'string' && error.message) return error.message;
  return 'T7B_COMPILATION_PREVIEW_FAILED';
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))]
    .sort(asciiCompare);
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
