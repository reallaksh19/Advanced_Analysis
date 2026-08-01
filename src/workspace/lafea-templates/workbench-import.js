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
import { normalizeLafeaStageDocument } from '../lafea-workbench-model.js';
import {
  LAFEA_TEMPLATE_COMPILATION_PREVIEW_ATTEMPT_SCHEMA,
  LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
  LAFEA_TEMPLATE_COMPILATION_PREVIEW_SCHEMA,
  LAFEA_TEMPLATE_COMPILATION_PREVIEW_STATUS,
} from './compilation-preview.js';

export const LAFEA_TEMPLATE_WORKBENCH_IMPORT_RECEIPT_SCHEMA =
  'lafea-template-workbench-import-receipt/v1';
export const LAFEA_TEMPLATE_WORKBENCH_IMPORT_ATTEMPT_SCHEMA =
  'lafea-template-workbench-import-attempt/v1';
export const LAFEA_TEMPLATE_WORKBENCH_IMPORT_RECEIPT_STATUS =
  'IMPORTED_FOR_EDITING';
export const LAFEA_TEMPLATE_WORKBENCH_IMPORT_ATTEMPT_STATUSES =
  deepFreeze(['BLOCKED', 'READY']);

export const LAFEA_TEMPLATE_WORKBENCH_IMPORT_AUTHORITY = deepFreeze({
  liveUiComposition: true,
  templateSelection: true,
  selectionOnly: false,
  parameterEntry: true,
  parameterValidation: true,
  compilerInvocation: true,
  compilationInspection: true,
  handoffInspection: true,
  workbenchImport: true,
  engineExecution: false,
  lifecycleInitialization: false,
  lifecycleRegistration: false,
  resultDisplayBinding: false,
  releasePromotion: false,
});

const LAFEA_WORKBENCH_STATE_SCHEMA = 'lafea-workbench-state/v2';
const LAFEA_LIFECYCLE_BINDING_SCHEMA = 'lafea-lifecycle-binding/v1';
const LAFEA_LIFECYCLE_BINDING_STATUSES = Object.freeze(new Set([
  'UNINITIALIZED',
  'CURRENT',
  'STALE_DOCUMENT_REVISION',
  'REVALIDATION_REQUIRED',
]));
const T7B_ATTEMPT_KEYS = Object.freeze([
  'authority',
  'diagnostics',
  'draftSemanticHash',
  'errorCode',
  'parameterSchemaId',
  'preview',
  'schema',
  'semanticHash',
  'status',
  'templateId',
]);
const T7B_PREVIEW_KEYS = Object.freeze([
  'authority',
  'compilation',
  'compilationSemanticHash',
  'compiledParameterSetHash',
  'diagnostics',
  'draftSemanticHash',
  'entryStageId',
  'handoffSemanticHash',
  'inputParameterSetHash',
  'parameterSchemaId',
  'schema',
  'semanticHash',
  'status',
  'templateId',
]);
const COMPILATION_KEYS = Object.freeze([
  'boundaryDefinition',
  'compilerBindingHash',
  'diagnostics',
  'geometry',
  'handoff',
  'loadDefinition',
  'meshRequest',
  'parameterSchemaId',
  'parameterSet',
  'schema',
  'semanticHash',
  'status',
  'templateId',
  'templateSemanticHash',
]);

export function createLafeaTemplateWorkbenchImportReceipt({
  compilationAttempt,
  retainedCompilationAttempt,
  currentDraftSemanticHash,
  importDocument,
}) {
  const preview = requireCurrentCompilationPreview(
    compilationAttempt,
    retainedCompilationAttempt,
    currentDraftSemanticHash,
  );
  if (typeof importDocument !== 'function') {
    throw importError('T7C_IMPORT_DOCUMENT_FACADE_REQUIRED');
  }

  const handoff = preview.compilation.handoff;
  const expectedDocument = normalizeLafeaStageDocument(
    handoff.entryStageId,
    handoff.stageSource,
  );
  const expectedDocumentSemanticHash = semanticHash(expectedDocument);

  const returnedState = importDocument(
    handoff.stageSource,
    handoff.entryStageId,
  );
  const imported = requireSuccessfulImportState(
    returnedState,
    handoff.entryStageId,
    expectedDocumentSemanticHash,
  );

  const base = {
    schema: LAFEA_TEMPLATE_WORKBENCH_IMPORT_RECEIPT_SCHEMA,
    status: LAFEA_TEMPLATE_WORKBENCH_IMPORT_RECEIPT_STATUS,
    authority: LAFEA_TEMPLATE_WORKBENCH_IMPORT_AUTHORITY,
    templateId: preview.templateId,
    parameterSchemaId: preview.parameterSchemaId,
    draftSemanticHash: preview.draftSemanticHash,
    compilationAttemptSemanticHash: compilationAttempt.semanticHash,
    previewSemanticHash: preview.semanticHash,
    compilationSemanticHash: preview.compilationSemanticHash,
    handoffSemanticHash: preview.handoffSemanticHash,
    entryStageId: preview.entryStageId,
    importedDocumentSemanticHash: imported.documentSemanticHash,
    workbenchStateSchema: returnedState.schema,
    workbenchStatus: returnedState.status,
    workbenchStateIdentityHash: imported.stateIdentityHash,
    lifecycleInitialized: imported.lifecycleInitialized,
    lifecycleBindingStatus: imported.lifecycleBindingStatus,
    executionPresent: false,
    diagnostics: deepFreeze([
      'CURRENT_COMPILATION_HANDOFF_IMPORTED',
      'ENGINE_NOT_EXECUTED',
      'LIFECYCLE_METHODS_NOT_INVOKED_BY_T7C',
      'OBSERVED_LIFECYCLE_BINDING_RECORDED',
      'RESULT_DISPLAY_NOT_BOUND',
      'RELEASE_NOT_PROMOTED',
    ]),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function attemptLafeaTemplateWorkbenchImport(input) {
  try {
    const receipt = createLafeaTemplateWorkbenchImportReceipt(input);
    return createAttempt({
      compilationAttempt: input.compilationAttempt,
      currentDraftSemanticHash: input.currentDraftSemanticHash,
      status: 'READY',
      receipt,
      errorCode: null,
      diagnostics: [],
    });
  } catch (error) {
    return createAttempt({
      compilationAttempt: input?.compilationAttempt ?? null,
      currentDraftSemanticHash: input?.currentDraftSemanticHash ?? null,
      status: 'BLOCKED',
      receipt: null,
      errorCode: errorCode(error),
      diagnostics: [errorMessage(error)],
    });
  }
}

function createAttempt({
  compilationAttempt,
  currentDraftSemanticHash,
  status,
  receipt,
  errorCode: code,
  diagnostics,
}) {
  if (!LAFEA_TEMPLATE_WORKBENCH_IMPORT_ATTEMPT_STATUSES.includes(status)) {
    throw importError(`T7C_IMPORT_ATTEMPT_STATUS_INVALID:${status}`);
  }
  const preview = compilationAttempt?.preview ?? null;
  const base = {
    schema: LAFEA_TEMPLATE_WORKBENCH_IMPORT_ATTEMPT_SCHEMA,
    status,
    authority: LAFEA_TEMPLATE_WORKBENCH_IMPORT_AUTHORITY,
    templateId: compilationAttempt?.templateId ?? null,
    parameterSchemaId: compilationAttempt?.parameterSchemaId ?? null,
    currentDraftSemanticHash,
    compilationAttemptSemanticHash: compilationAttempt?.semanticHash ?? null,
    previewSemanticHash: preview?.semanticHash ?? null,
    receipt,
    errorCode: code,
    diagnostics: deepFreeze(sortedUnique(diagnostics)),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function requireCurrentCompilationPreview(
  compilationAttempt,
  retainedCompilationAttempt,
  currentDraftSemanticHash,
) {
  if (compilationAttempt !== retainedCompilationAttempt) {
    throw importError('T7C_RETAINED_COMPILATION_ATTEMPT_IDENTITY_MISMATCH');
  }
  requireExactKeys(compilationAttempt, T7B_ATTEMPT_KEYS, 'T7C_T7B_ATTEMPT_KEYS_INVALID');
  if (compilationAttempt.schema !== LAFEA_TEMPLATE_COMPILATION_PREVIEW_ATTEMPT_SCHEMA) {
    throw importError('T7C_T7B_ATTEMPT_SCHEMA_INVALID');
  }
  if (!Object.isFrozen(compilationAttempt)) {
    throw importError('T7C_T7B_ATTEMPT_MUST_BE_FROZEN');
  }
  verifySemanticHash(compilationAttempt, 'T7C_T7B_ATTEMPT_HASH_INVALID');
  if (compilationAttempt.authority !== LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY) {
    throw importError('T7C_T7B_ATTEMPT_AUTHORITY_INVALID');
  }
  if (compilationAttempt.status !== 'READY' || compilationAttempt.preview === null) {
    throw importError('T7C_READY_COMPILATION_ATTEMPT_REQUIRED');
  }
  if (
    typeof currentDraftSemanticHash !== 'string'
    || !currentDraftSemanticHash
    || compilationAttempt.draftSemanticHash !== currentDraftSemanticHash
  ) {
    throw importError('T7C_COMPILATION_ATTEMPT_STALE');
  }

  const preview = compilationAttempt.preview;
  requireExactKeys(preview, T7B_PREVIEW_KEYS, 'T7C_T7B_PREVIEW_KEYS_INVALID');
  if (preview.schema !== LAFEA_TEMPLATE_COMPILATION_PREVIEW_SCHEMA) {
    throw importError('T7C_T7B_PREVIEW_SCHEMA_INVALID');
  }
  if (!Object.isFrozen(preview) || !Object.isFrozen(preview.compilation)) {
    throw importError('T7C_T7B_PREVIEW_MUST_BE_FROZEN');
  }
  verifySemanticHash(preview, 'T7C_T7B_PREVIEW_HASH_INVALID');
  if (
    preview.status !== LAFEA_TEMPLATE_COMPILATION_PREVIEW_STATUS
    || preview.authority !== LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY
  ) {
    throw importError('T7C_T7B_PREVIEW_AUTHORITY_INVALID');
  }
  if (
    preview.templateId !== compilationAttempt.templateId
    || preview.parameterSchemaId !== compilationAttempt.parameterSchemaId
    || preview.draftSemanticHash !== currentDraftSemanticHash
  ) {
    throw importError('T7C_T7B_PREVIEW_PARENT_MISMATCH');
  }
  assertCompilation(preview);
  return preview;
}

function assertCompilation(preview) {
  const compilation = preview.compilation;
  requireExactKeys(compilation, COMPILATION_KEYS, 'T7C_COMPILATION_KEYS_INVALID');
  verifySemanticHash(compilation, 'T7C_COMPILATION_HASH_INVALID');
  if (compilation.status !== 'READY') {
    throw importError('T7C_COMPILATION_NOT_READY');
  }
  if (
    compilation.templateId !== preview.templateId
    || compilation.parameterSchemaId !== preview.parameterSchemaId
    || compilation.semanticHash !== preview.compilationSemanticHash
    || compilation.parameterSet?.semanticHash !== preview.compiledParameterSetHash
  ) {
    throw importError('T7C_COMPILATION_IDENTITY_MISMATCH');
  }
  if (!validateTemplateParameterSet(compilation.parameterSet).ok) {
    throw importError('T7C_COMPILED_PARAMETER_SET_INVALID');
  }
  if (!validateTemplateGeometryResult(compilation.geometry).ok) {
    throw importError('T7C_GEOMETRY_ARTIFACT_INVALID');
  }
  if (!validateTemplateLoadDefinition(compilation.loadDefinition).ok) {
    throw importError('T7C_LOAD_ARTIFACT_INVALID');
  }
  if (!validateTemplateBoundaryDefinition(compilation.boundaryDefinition).ok) {
    throw importError('T7C_BOUNDARY_ARTIFACT_INVALID');
  }
  if (
    compilation.meshRequest !== null
    && !validateTemplateMeshRequest(compilation.meshRequest).ok
  ) {
    throw importError('T7C_MESH_REQUEST_ARTIFACT_INVALID');
  }
  const handoff = compilation.handoff;
  if (!validateTemplateHandoff(handoff).ok || !Object.isFrozen(handoff)) {
    throw importError('T7C_HANDOFF_ARTIFACT_INVALID');
  }
  if (
    handoff.status !== 'READY'
    || handoff.templateId !== preview.templateId
    || handoff.semanticHash !== preview.handoffSemanticHash
    || handoff.entryStageId !== preview.entryStageId
    || handoff.parameterSetHash !== compilation.parameterSet.semanticHash
  ) {
    throw importError('T7C_HANDOFF_IDENTITY_MISMATCH');
  }
  if (!handoff.diagnostics.includes('ENGINE_NOT_EXECUTED')) {
    throw importError('T7C_HANDOFF_ENGINE_DIAGNOSTIC_MISSING');
  }
}

function requireSuccessfulImportState(state, entryStageId, expectedDocumentSemanticHash) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw importError('T7C_WORKBENCH_STATE_REQUIRED');
  }
  if (state.schema !== LAFEA_WORKBENCH_STATE_SCHEMA) {
    throw importError('T7C_WORKBENCH_STATE_SCHEMA_INVALID');
  }
  if (!Object.isFrozen(state) || state.status !== 'READY') {
    throw importError(`T7C_WORKBENCH_IMPORT_NOT_READY:${state?.status ?? 'MISSING'}`);
  }
  if (state.activeStageId !== entryStageId) {
    throw importError('T7C_WORKBENCH_ACTIVE_STAGE_MISMATCH');
  }
  const stage = state.stages?.[entryStageId];
  if (!stage || typeof stage !== 'object' || !Object.isFrozen(stage)) {
    throw importError('T7C_WORKBENCH_STAGE_STATE_REQUIRED');
  }
  if (stage.execution !== null) {
    throw importError('T7C_WORKBENCH_EXECUTION_MUST_BE_NULL');
  }
  if (!stage.document || !Object.isFrozen(stage.document)) {
    throw importError('T7C_IMPORTED_DOCUMENT_REQUIRED');
  }
  const documentSemanticHash = semanticHash(stage.document);
  if (documentSemanticHash !== expectedDocumentSemanticHash) {
    throw importError('T7C_IMPORTED_DOCUMENT_HASH_MISMATCH');
  }
  const binding = stage.lifecycleBinding;
  if (
    !binding
    || typeof binding !== 'object'
    || !Object.isFrozen(binding)
    || binding.schema !== LAFEA_LIFECYCLE_BINDING_SCHEMA
  ) {
    throw importError('T7C_WORKBENCH_LIFECYCLE_BINDING_REQUIRED');
  }
  if (!LAFEA_LIFECYCLE_BINDING_STATUSES.has(binding.status)) {
    throw importError('T7C_WORKBENCH_LIFECYCLE_BINDING_STATUS_INVALID');
  }
  const lifecycleInitialized = stage.lifecycle !== null && stage.lifecycle !== undefined;
  if (
    (!lifecycleInitialized && binding.status !== 'UNINITIALIZED')
    || (lifecycleInitialized && binding.status === 'UNINITIALIZED')
  ) {
    throw importError('T7C_WORKBENCH_LIFECYCLE_BINDING_INCONSISTENT');
  }
  const stateIdentityBase = {
    schema: state.schema,
    status: state.status,
    activeStageId: state.activeStageId,
    entryStageId,
    importedDocumentSemanticHash: documentSemanticHash,
    executionPresent: false,
    lifecycleInitialized,
    lifecycleBindingStatus: binding.status,
  };
  return {
    documentSemanticHash,
    lifecycleInitialized,
    lifecycleBindingStatus: binding.status,
    stateIdentityHash: semanticHash(stateIdentityBase),
  };
}

function verifySemanticHash(value, code) {
  const { semanticHash: declared, ...base } = value;
  if (declared !== semanticHash(base)) throw importError(code);
}

function requireExactKeys(value, expectedKeys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw importError(code);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw importError(code);
  }
}

function importError(code) {
  const error = new TypeError(code);
  error.code = String(code).split(':')[0];
  return error;
}

function errorCode(error) {
  if (typeof error?.code === 'string' && error.code) return error.code;
  return errorMessage(error).split(':')[0] || 'T7C_WORKBENCH_IMPORT_FAILED';
}

function errorMessage(error) {
  return typeof error?.message === 'string' && error.message
    ? error.message
    : 'T7C_WORKBENCH_IMPORT_FAILED';
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
