#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_ANALYTICAL_EXECUTION_CONTROLLER_BOUNDARY,
  LAFEA_ANALYTICAL_EXECUTION_PILOTS,
  createTemplateExecutionReceipt,
  createTemplateExecutionRequest,
  validateTemplateExecutionReceipt,
  validateTemplateExecutionRequest,
} from '../src/core/lafea-application-templates/analytical-execution-contract.js';

const SHA = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const FNV = 'fnv1a64:0123456789abcdef';
let negativeCount = 0;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(
  path.join(ROOT, 'src/core/lafea-application-templates/analytical-execution-contract.js'),
  'utf8',
);
assert.doesNotMatch(source, /from ['"][^'"]*workspace[^'"]*['"]/u);
for (const pattern of [
  /\bexecuteLafeaStage\s*\(/u,
  /\bissueLafeaSourceAuthority\s*\(/u,
  /\bcreateLafeaLifecycleProducerBatch\s*\(/u,
  /\bregisterLafeaLifecycle\w*\s*\(/u,
  /\bcreateLafeaAnalyticalProductBatch\s*\(/u,
  /\bcalculateLocal(?:Attachment|Continuum|Shell)\w*\s*\(/u,
]) assert.doesNotMatch(source, pattern);

assert.equal(
  LAFEA_ANALYTICAL_EXECUTION_CONTROLLER_BOUNDARY.authority,
  'B3_CONTRACT_ONLY_IMPLEMENTATION_WITHHELD',
);
assert.equal(
  LAFEA_ANALYTICAL_EXECUTION_CONTROLLER_BOUNDARY.uiMustNot
    .includes('CALL_EXECUTE_LAFEA_STAGE'),
  true,
);
assert.deepEqual(
  Object.keys(LAFEA_ANALYTICAL_EXECUTION_PILOTS).sort(),
  ['ALG-LOAD-REFERENCE-TRANSFER', 'ALG-PIPE-SECTION-COMBINED'],
);

for (const templateId of Object.keys(LAFEA_ANALYTICAL_EXECUTION_PILOTS)) {
  const request = requestFor(templateId);
  assert.equal(validateTemplateExecutionRequest(request).ok, true);
  assert.equal(Object.hasOwn(request.sourceAuthorityRequest, 'sourceHash'), false);
  const accepted = acceptedReceiptFor(templateId);
  assert.equal(validateTemplateExecutionReceipt(accepted).ok, true);
  assert.equal(accepted.releaseQualified, false);
  assert.equal(accepted.codeReady, false);
}

const blocked = createTemplateExecutionReceipt({
  ...receiptInputFor('ALG-PIPE-SECTION-COMBINED'),
  sourceAuthorityHash: null,
  exactSourceHash: null,
  stageExecutionEvidenceHash: null,
  lifecycleProducerBatchHash: null,
  lifecycleStateHash: null,
  resultEvidenceHash: null,
  productEvidenceHash: null,
  calculationAccepted: false,
  resultReady: false,
  assessmentReady: false,
  status: 'BLOCKED',
  diagnostics: ['SOURCE_AUTHORITY_REQUIRED'],
});
assert.equal(validateTemplateExecutionReceipt(blocked).ok, true);

negative('unauthorized template', () => createTemplateExecutionRequest({
  ...requestInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  templateId: 'ALG-NOZZLE-NECK-SECTION',
}));
negative('caller source hash', () => createTemplateExecutionRequest({
  ...requestInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  sourceHash: SHA,
}));
negative('wrong target stage', () => createTemplateExecutionRequest({
  ...requestInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  targetStageId: 'LAFEA.2',
}));
negative('wrong composition', () => createTemplateExecutionRequest({
  ...requestInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  targetCompositionRootId: 'WRONG',
}));
negative('wrong lifecycle', () => createTemplateExecutionRequest({
  ...requestInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  targetLifecycleProfileId: 'WRONG',
}));
negative('wrong product adapter', () => createTemplateExecutionRequest({
  ...requestInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  expectedProductAdapterId: 'WRONG',
}));
negative('missing benchmark binding', () => createTemplateExecutionRequest({
  ...requestInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  expectedBenchmarkManifestIds: [],
}));
negative('stale source request revision', () => createTemplateExecutionRequest({
  ...requestInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  sourceAuthorityRequest: {
    ...requestInputFor('ALG-LOAD-REFERENCE-TRANSFER').sourceAuthorityRequest,
    expectedDocumentRevisionDigest: 'fnv1a64:1111111111111111',
  },
}));
negative('accepted without source authority', () => createTemplateExecutionReceipt({
  ...receiptInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  sourceAuthorityHash: null,
}));
negative('accepted without result readiness', () => createTemplateExecutionReceipt({
  ...receiptInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  resultReady: false,
}));
negative('foundation assessment ready', () => createTemplateExecutionReceipt({
  ...receiptInputFor('ALG-LOAD-REFERENCE-TRANSFER'),
  assessmentReady: true,
}));
negative('screening assessment missing', () => createTemplateExecutionReceipt({
  ...receiptInputFor('ALG-PIPE-SECTION-COMBINED'),
  assessmentReady: false,
}));
negative('code ready promotion', () => createTemplateExecutionReceipt({
  ...receiptInputFor('ALG-PIPE-SECTION-COMBINED'),
  codeReady: true,
}));
negative('release qualification promotion', () => createTemplateExecutionReceipt({
  ...receiptInputFor('ALG-PIPE-SECTION-COMBINED'),
  releaseQualified: true,
}));
negative('tampered request hash', () => validateRequestOrThrow({
  ...requestFor('ALG-LOAD-REFERENCE-TRANSFER'),
  semanticHash: SHA,
}));
negative('tampered receipt hash', () => validateReceiptOrThrow({
  ...acceptedReceiptFor('ALG-LOAD-REFERENCE-TRANSFER'),
  semanticHash: SHA,
}));
negative('mutable request', () => validateRequestOrThrow(
  structuredClone(requestFor('ALG-LOAD-REFERENCE-TRANSFER')),
));
negative('mutable receipt', () => validateReceiptOrThrow(
  structuredClone(acceptedReceiptFor('ALG-LOAD-REFERENCE-TRANSFER')),
));

console.log(JSON.stringify({
  schema: 'lafea-template-b3-analytical-execution-contract-check/v1',
  status: 'PASS',
  pilotTemplates: Object.keys(LAFEA_ANALYTICAL_EXECUTION_PILOTS).sort(),
  negativeTestCount: negativeCount,
  controllerAuthority: LAFEA_ANALYTICAL_EXECUTION_CONTROLLER_BOUNDARY.authority,
  authority: {
    controllerImplemented: false,
    sourceIssuance: false,
    engineExecution: false,
    lifecycleRegistration: false,
    productEvidenceCreation: false,
    resultBinding: false,
    releasePromotion: false,
    t7dAuthorized: false,
  },
}));

function requestFor(templateId) {
  return createTemplateExecutionRequest(requestInputFor(templateId));
}

function requestInputFor(templateId) {
  const pilot = LAFEA_ANALYTICAL_EXECUTION_PILOTS[templateId];
  return {
    requestId: `REQUEST-${templateId}`,
    executionMode: 'CONTROLLED_TEMPLATE_PILOT',
    templateId,
    releaseRecordHash: SHA,
    parameterSetHash: FNV,
    compilationHash: FNV,
    handoffHash: FNV,
    compatibilityReceiptHash: SHA,
    targetStageId: pilot.stageId,
    targetCompositionRootId: pilot.compositionRootId,
    targetLifecycleProfileId: pilot.lifecycleProfileId,
    expectedProductAdapterId: pilot.productAdapterId,
    expectedBenchmarkManifestIds: ['BENCHMARK-1'],
    importedDocumentRevisionDigest: FNV,
    sourceAuthorityRequest: {
      originRef: 'B3-CONTRACT-CHECK',
      expectedStageId: pilot.stageId,
      expectedDocumentRevisionDigest: FNV,
    },
  };
}

function acceptedReceiptFor(templateId) {
  return createTemplateExecutionReceipt(receiptInputFor(templateId));
}

function receiptInputFor(templateId) {
  const pilot = LAFEA_ANALYTICAL_EXECUTION_PILOTS[templateId];
  return {
    receiptId: `RECEIPT-${templateId}`,
    requestHash: SHA,
    templateId,
    targetStageId: pilot.stageId,
    targetCompositionRootHash: SHA,
    targetLifecycleProfileHash: SHA,
    compatibilityReceiptHash: SHA,
    sourceAuthorityHash: SHA,
    exactSourceHash: SHA,
    importedDocumentRevisionDigest: FNV,
    stageExecutionEvidenceHash: SHA,
    lifecycleProducerBatchHash: SHA,
    lifecycleStateHash: SHA,
    resultEvidenceHash: SHA,
    productEvidenceHash: SHA,
    benchmarkManifestIds: ['BENCHMARK-1'],
    calculationAccepted: true,
    resultReady: true,
    assessmentApplicability: pilot.assessmentApplicability,
    assessmentReady: pilot.assessmentApplicability === 'APPLICABLE',
    codeReady: false,
    status: 'ACCEPTED',
    releaseQualified: false,
    diagnostics: [],
  };
}

function validateRequestOrThrow(value) {
  const result = validateTemplateExecutionRequest(value);
  if (!result.ok) throw new Error(result.errors.join(' '));
}

function validateReceiptOrThrow(value) {
  const result = validateTemplateExecutionReceipt(value);
  if (!result.ok) throw new Error(result.errors.join(' '));
}

function negative(label, callback) {
  assert.throws(callback, undefined, label);
  negativeCount += 1;
}
