import { templateReleaseSha256 } from './release-record-v2-hash.js';
import { requireLafeaApplicationTemplate } from './template-registry.js';

export const LAFEA_GENERAL_CONTINUUM_REQUEST_SCHEMA = 'lafea-general-continuum-request/v1';
export const LAFEA_GENERAL_CONTINUUM_RECEIPT_SCHEMA = 'lafea-general-continuum-receipt/v1';
export const LAFEA_GENERAL_CONTINUUM_TEMPLATE_IDS = Object.freeze([
  'C2D-BRACKET-GUSSET', 'C2D-CLAMP-EAR', 'C2D-LUG-PINHOLE',
  'C2D-NOZZLE-REPAD-SECTION', 'C2D-PIPE-PAD-SECTION',
]);
const SHA = /^sha256:[0-9a-f]{64}$/u;
const REVISION = /^fnv1a64:[0-9a-f]{16}$/u;
const SOURCE_KEYS = Object.freeze([
  'originRef', 'expectedStageId', 'expectedDocumentRevisionDigest', 'requestedRole',
]);
const REQUEST_INPUT_KEYS = Object.freeze([
  'requestId', 'templateId', 'releaseRecordHash', 'compatibilityReceiptHash',
  'documentRevisionDigest', 'sourceAuthorityRequest', 'canonicalModelHash',
  'analysisGeometryHash', 'meshArtifactHash', 'meshHash', 'meshProfileHash',
  'elementTypes',
]);
const REQUEST_KEYS = Object.freeze([
  'schema', ...REQUEST_INPUT_KEYS, 'stageId', 'executionMode', 'authority', 'semanticHash',
]);
const RECEIPT_INPUT_KEYS = Object.freeze([
  'receiptId', 'request', 'sourceAuthorityHash', 'sourceHash', 'executionHash',
  'resultHash', 'recoveryHash', 'integrationPointResultHash', 'calculationAccepted',
  'diagnostics',
]);
const RECEIPT_KEYS = Object.freeze([
  'schema', ...RECEIPT_INPUT_KEYS, 'requestHash', 'recoveryReady', 'resultReady',
  'convergenceReady', 'assessmentReady', 'codeReady', 'reportReady',
  'releaseQualified', 'status', 'authority', 'semanticHash', 'evidenceHash',
]);

export function createGeneralContinuumExecutionRequest(input) {
  exact(input, REQUEST_INPUT_KEYS, 'general continuum request input');
  requireText(input.requestId, 'requestId');
  const template = requireGeneralContinuumTemplate(input.templateId);
  [
    'releaseRecordHash', 'compatibilityReceiptHash', 'canonicalModelHash',
    'analysisGeometryHash', 'meshArtifactHash', 'meshHash', 'meshProfileHash',
  ].forEach((key) => requireSha(input[key], key));
  if (!REVISION.test(input.documentRevisionDigest)) {
    throw new TypeError('documentRevisionDigest must be FNV-1a 64.');
  }
  const sourceAuthorityRequest = normalizeSourceRequest(
    input.sourceAuthorityRequest, input.documentRevisionDigest,
  );
  const elementTypes = normalizeElementTypes(input.elementTypes);
  const base = {
    schema: LAFEA_GENERAL_CONTINUUM_REQUEST_SCHEMA,
    requestId: input.requestId,
    templateId: template.templateId,
    releaseRecordHash: input.releaseRecordHash,
    compatibilityReceiptHash: input.compatibilityReceiptHash,
    documentRevisionDigest: input.documentRevisionDigest,
    sourceAuthorityRequest,
    canonicalModelHash: input.canonicalModelHash,
    analysisGeometryHash: input.analysisGeometryHash,
    meshArtifactHash: input.meshArtifactHash,
    meshHash: input.meshHash,
    meshProfileHash: input.meshProfileHash,
    elementTypes,
    stageId: 'LAFEA.3',
    executionMode: 'CALLER_SUPPLIED_ANALYSIS_MESH',
    authority: authority(elementTypes),
  };
  return freeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

export function validateGeneralContinuumExecutionRequest(value) {
  return validateRebuild(value, REQUEST_KEYS, REQUEST_INPUT_KEYS,
    createGeneralContinuumExecutionRequest, 'general continuum request');
}

export function createGeneralContinuumExecutionReceipt(input) {
  exact(input, RECEIPT_INPUT_KEYS, 'general continuum receipt input');
  requireValid(validateGeneralContinuumExecutionRequest(input.request), 'request is invalid');
  requireText(input.receiptId, 'receiptId');
  ['sourceAuthorityHash', 'sourceHash'].forEach((key) => requireSha(input[key], key));
  ['executionHash', 'resultHash', 'recoveryHash', 'integrationPointResultHash']
    .forEach((key) => nullableSha(input[key], key));
  if (typeof input.calculationAccepted !== 'boolean') {
    throw new TypeError('calculationAccepted must be boolean.');
  }
  const diagnostics = normalizeDiagnostics(input.diagnostics);
  const calculationAccepted = input.calculationAccepted
    && input.executionHash !== null && input.resultHash !== null;
  const recoveryReady = calculationAccepted
    && input.recoveryHash !== null && input.integrationPointResultHash !== null;
  const resultReady = calculationAccepted && recoveryReady;
  const base = {
    schema: LAFEA_GENERAL_CONTINUUM_RECEIPT_SCHEMA,
    receiptId: input.receiptId,
    request: input.request,
    requestHash: input.request.semanticHash,
    sourceAuthorityHash: input.sourceAuthorityHash,
    sourceHash: input.sourceHash,
    executionHash: input.executionHash,
    resultHash: input.resultHash,
    recoveryHash: input.recoveryHash,
    integrationPointResultHash: input.integrationPointResultHash,
    calculationAccepted,
    recoveryReady,
    resultReady,
    convergenceReady: false,
    assessmentReady: false,
    codeReady: false,
    reportReady: false,
    releaseQualified: false,
    status: resultReady ? 'ACCEPTED' : 'BLOCKED',
    diagnostics,
    authority: authority(input.request.elementTypes),
  };
  const semanticBasis = { ...base };
  delete semanticBasis.diagnostics;
  const semanticHash = templateReleaseSha256(semanticBasis);
  const evidenceHash = templateReleaseSha256({ semanticHash, diagnostics });
  return freeze({ ...base, semanticHash, evidenceHash });
}

export function validateGeneralContinuumExecutionReceipt(value) {
  return validateRebuild(value, RECEIPT_KEYS, RECEIPT_INPUT_KEYS,
    createGeneralContinuumExecutionReceipt, 'general continuum receipt');
}

export function requireGeneralContinuumTemplate(templateId) {
  if (!LAFEA_GENERAL_CONTINUUM_TEMPLATE_IDS.includes(templateId)) {
    throw new TypeError(`Unsupported registered continuum template: ${templateId}.`);
  }
  const template = requireLafeaApplicationTemplate(templateId);
  if (template.bucketId !== 'CONTINUUM_2D_FEA' || template.entryStageId !== 'LAFEA.3'
    || template.releaseStatus === 'BLOCKED') {
    throw new TypeError(`Template is not eligible for LAFEA.3 caller-mesh execution: ${templateId}.`);
  }
  return template;
}

function normalizeSourceRequest(value, revision) {
  exact(value, SOURCE_KEYS, 'sourceAuthorityRequest');
  requireText(value.originRef, 'originRef');
  if (value.expectedStageId !== 'LAFEA.3'
    || value.expectedDocumentRevisionDigest !== revision
    || value.requestedRole !== 'AUTHORITATIVE_EDITABLE_STAGE_SOURCE') {
    throw new TypeError('sourceAuthorityRequest is stale or invalid.');
  }
  return freeze({ ...value });
}
function normalizeElementTypes(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('elementTypes required.');
  const result = [...new Set(value)].sort();
  if (result.some((row) => !['T6', 'Q8'].includes(row))) {
    throw new TypeError('Only T6 and Q8 are authorized.');
  }
  return freeze(result);
}
function normalizeDiagnostics(value) {
  if (!Array.isArray(value) || value.some((row) => typeof row !== 'string' || !row)) {
    throw new TypeError('diagnostics must be an array of non-empty strings.');
  }
  return freeze([...new Set(value)].sort());
}
function authority(elementTypes) {
  return freeze({
    registeredTemplateCallerMesh: true,
    elementTypes,
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
  });
}
function validateRebuild(value, keys, inputKeys, creator, label) {
  const errors = [];
  try {
    exact(value, keys, label);
    const input = Object.fromEntries(inputKeys.map((key) => [key, value[key]]));
    if (JSON.stringify(creator(input)) !== JSON.stringify(value)) {
      throw new TypeError(`${label} rebuild mismatch.`);
    }
    if (!isFrozen(value)) throw new TypeError(`${label} must be deeply frozen.`);
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return freeze({ ok: errors.length === 0, errors });
}
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}
function requireValid(validation, message) { if (!validation.ok) throw new TypeError(`${message}: ${validation.errors.join(' ')}`); }
function requireText(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required.`); }
function requireSha(value, label) { if (typeof value !== 'string' || !SHA.test(value)) throw new TypeError(`${label} must be SHA-256.`); }
function nullableSha(value, label) { if (value !== null) requireSha(value, label); }
function isFrozen(value) { return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(isFrozen)); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
