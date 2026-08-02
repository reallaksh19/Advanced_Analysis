/** Non-UI public surface for registered-template caller-mesh LAFEA.3 execution. */
import { semanticHash } from '../core/shared-piping-model/index.js';
import { LAFEA_TEMPLATE_COMPILATION_SCHEMA } from '../core/lafea-application-templates/compilers/analytical/common.js';
import {
  validateTemplateBoundaryDefinition,
  validateTemplateGeometryResult,
  validateTemplateHandoff,
  validateTemplateLoadDefinition,
  validateTemplateMeshRequest,
} from '../core/lafea-application-templates/contracts.js';
import {
  LAFEA_GENERAL_CONTINUUM_REQUEST_SCHEMA,
  LAFEA_GENERAL_CONTINUUM_RECEIPT_SCHEMA,
  LAFEA_GENERAL_CONTINUUM_TEMPLATE_IDS,
  createGeneralContinuumExecutionRequest,
  createGeneralContinuumExecutionReceipt,
  requireGeneralContinuumTemplate,
  validateGeneralContinuumExecutionRequest,
  validateGeneralContinuumExecutionReceipt,
} from '../core/lafea-application-templates/general-continuum-execution-contract.js';
import {
  LAFEA_GENERAL_CONTINUUM_CONTROLLER_SCHEMA,
  executeGeneralLafeaContinuum as executeController,
} from './lafea-general-continuum-controller.js';
import {
  normalizeControlledContinuumStageSource,
} from './lafea-controlled-continuum-stage-route.js';

export {
  LAFEA_GENERAL_CONTINUUM_REQUEST_SCHEMA,
  LAFEA_GENERAL_CONTINUUM_RECEIPT_SCHEMA,
  LAFEA_GENERAL_CONTINUUM_TEMPLATE_IDS,
  LAFEA_GENERAL_CONTINUUM_CONTROLLER_SCHEMA,
  createGeneralContinuumExecutionRequest,
  createGeneralContinuumExecutionReceipt,
  requireGeneralContinuumTemplate,
  validateGeneralContinuumExecutionRequest,
  validateGeneralContinuumExecutionReceipt,
};

const INPUT_KEYS = Object.freeze([
  'request', 'releaseRecord', 'compatibilityReceipt', 'compilation',
  'document', 'meshEvidence',
]);

export function executeGeneralLafeaContinuum(options) {
  try {
    exact(options, INPUT_KEYS, 'NB-T6H public execution options');
    validateCompilation(options);
    return executeController({
      request: options.request,
      releaseRecord: options.releaseRecord,
      compatibilityReceipt: options.compatibilityReceipt,
      document: options.document,
      meshEvidence: options.meshEvidence,
    });
  } catch (error) {
    return blocked(options?.request ?? null,
      typeof error?.code === 'string' ? error.code : 'LAFEA_NB_T6H_COMPILATION_GATE_BLOCKED');
  }
}

function validateCompilation(options) {
  const { compilation, request, releaseRecord, document } = options;
  if (!compilation || typeof compilation !== 'object' || Array.isArray(compilation)
    || compilation.schema !== LAFEA_TEMPLATE_COMPILATION_SCHEMA
    || compilation.templateId !== request?.templateId
    || compilation.status !== 'READY'
    || compilation.semanticHash !== request?.compilationHash
    || releaseRecord?.handoff?.compilationHash !== compilation.semanticHash) {
    throw gateError('LAFEA_NB_T6H_COMPILATION_IDENTITY_INVALID');
  }
  const { semanticHash: observed, ...basis } = compilation;
  if (semanticHash(basis) !== observed) {
    throw gateError('LAFEA_NB_T6H_COMPILATION_HASH_INVALID');
  }
  const validations = [
    validateTemplateGeometryResult(compilation.geometry),
    validateTemplateLoadDefinition(compilation.loadDefinition),
    validateTemplateBoundaryDefinition(compilation.boundaryDefinition),
    validateTemplateMeshRequest(compilation.meshRequest),
    validateTemplateHandoff(compilation.handoff),
  ];
  if (validations.some((row) => row.ok !== true)
    || compilation.handoff.entryStageId !== 'LAFEA.3'
    || compilation.handoff.geometryHash !== compilation.geometry.semanticHash
    || compilation.handoff.loadDefinitionHash !== compilation.loadDefinition.semanticHash
    || compilation.handoff.boundaryDefinitionHash !== compilation.boundaryDefinition.semanticHash
    || compilation.handoff.meshRequestHash !== compilation.meshRequest.semanticHash) {
    throw gateError('LAFEA_NB_T6H_COMPILATION_ARTIFACT_INVALID');
  }
  const compiledSource = normalizeControlledContinuumStageSource(
    compilation.handoff.stageSource,
  );
  const suppliedSource = normalizeControlledContinuumStageSource(document);
  if (JSON.stringify(compiledSource) !== JSON.stringify(suppliedSource)) {
    throw gateError('LAFEA_NB_T6H_DOCUMENT_NOT_COMPILED_HANDOFF');
  }
}

function blocked(request, diagnostic) {
  return deepFreeze({
    schema: LAFEA_GENERAL_CONTINUUM_CONTROLLER_SCHEMA,
    status: 'BLOCKED',
    accepted: false,
    templateId: request?.templateId ?? null,
    stageId: 'LAFEA.3',
    request,
    sourceAuthority: null,
    meshEvidence: null,
    execution: null,
    receipt: null,
    lifecycle: null,
    readiness: null,
    diagnostics: [diagnostic],
    authority: {
      registeredTemplateCallerMeshExecution: false,
      compilerGeneratedMesh: false,
      arbitraryGeometryMesher: false,
      axisymmetricContinuum: false,
      shell: false,
      scl: false,
      structuralStress: false,
      convergence: false,
      assessment: false,
      code: false,
      report: false,
      lafea6: false,
      releaseQualified: false,
    },
  });
}
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw gateError('LAFEA_NB_T6H_PUBLIC_INPUT_INVALID', `${label} exact-key contract mismatch.`);
  }
}
function gateError(code, message = code) { const error = new TypeError(message); error.code = code; return error; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
