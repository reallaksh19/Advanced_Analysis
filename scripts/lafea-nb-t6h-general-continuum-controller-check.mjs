#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_GENERAL_CONTINUUM_TEMPLATE_IDS,
  createGeneralContinuumExecutionRequest,
  createGeneralContinuumExecutionReceipt,
  validateGeneralContinuumExecutionRequest,
  validateGeneralContinuumExecutionReceipt,
} from '../src/workspace/lafea-general-continuum-execution-public.js';
import { executeGeneralLafeaContinuum } from '../src/workspace/lafea-general-continuum-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const controllerPath = path.join(ROOT, 'src/workspace/lafea-general-continuum-controller.js');
const contractPath = path.join(ROOT,
  'src/core/lafea-application-templates/general-continuum-execution-contract.js');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');
const contractSource = fs.readFileSync(contractPath, 'utf8');
const sha = (label) => `sha256:${Buffer.from(label).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const revision = 'fnv1a64:0123456789abcdef';
const accepted = [];

assert.deepEqual(LAFEA_GENERAL_CONTINUUM_TEMPLATE_IDS, [
  'C2D-BRACKET-GUSSET', 'C2D-CLAMP-EAR', 'C2D-LUG-PINHOLE',
  'C2D-NOZZLE-REPAD-SECTION', 'C2D-PIPE-PAD-SECTION',
]);
for (const templateId of LAFEA_GENERAL_CONTINUUM_TEMPLATE_IDS) {
  const request = createGeneralContinuumExecutionRequest(requestInput(templateId));
  assert.equal(validateGeneralContinuumExecutionRequest(request).ok, true);
  assert.equal(request.templateId, templateId);
  assert.equal(request.stageId, 'LAFEA.3');
  assert.equal(request.executionMode, 'CALLER_SUPPLIED_ANALYSIS_MESH');
  assert.equal(request.authority.registeredTemplateCallerMesh, true);
  assert.equal(request.authority.compilerGeneratedMesh, false);
  assert.equal(request.authority.arbitraryGeometryMesher, false);
  assert.equal(request.authority.shell, false);
  assert.equal(request.authority.code, false);
  assert.equal(request.authority.releaseQualified, false);
  assert.equal(Object.isFrozen(request), true);
  const receipt = createGeneralContinuumExecutionReceipt({
    receiptId: `NB-T6H-RECEIPT-${templateId}`,
    request,
    sourceAuthorityHash: sha(`${templateId}-AUTHORITY`),
    sourceHash: sha(`${templateId}-SOURCE`),
    executionHash: sha(`${templateId}-EXECUTION`),
    resultHash: sha(`${templateId}-RESULT`),
    recoveryHash: sha(`${templateId}-RECOVERY`),
    integrationPointResultHash: sha(`${templateId}-IP`),
    calculationAccepted: true,
    diagnostics: [],
  });
  assert.equal(validateGeneralContinuumExecutionReceipt(receipt).ok, true);
  assert.equal(receipt.status, 'ACCEPTED');
  assert.equal(receipt.resultReady, true);
  assert.equal(receipt.convergenceReady, false);
  assert.equal(receipt.codeReady, false);
  assert.equal(receipt.reportReady, false);
  assert.equal(receipt.releaseQualified, false);
  const repeated = createGeneralContinuumExecutionReceipt({
    receiptId: `NB-T6H-RECEIPT-${templateId}`,
    request,
    sourceAuthorityHash: sha(`${templateId}-AUTHORITY`),
    sourceHash: sha(`${templateId}-SOURCE`),
    executionHash: sha(`${templateId}-EXECUTION`),
    resultHash: sha(`${templateId}-RESULT`),
    recoveryHash: sha(`${templateId}-RECOVERY`),
    integrationPointResultHash: sha(`${templateId}-IP`),
    calculationAccepted: true,
    diagnostics: [],
  });
  assert.equal(repeated.semanticHash, receipt.semanticHash);
  assert.equal(repeated.evidenceHash, receipt.evidenceHash);
  accepted.push({ templateId, requestHash: request.semanticHash, receiptHash: receipt.evidenceHash });
}

const blockedReceipt = createGeneralContinuumExecutionReceipt({
  receiptId: 'NB-T6H-BLOCKED',
  request: createGeneralContinuumExecutionRequest(requestInput('C2D-BRACKET-GUSSET')),
  sourceAuthorityHash: sha('AUTHORITY'),
  sourceHash: sha('SOURCE'),
  executionHash: null,
  resultHash: null,
  recoveryHash: null,
  integrationPointResultHash: null,
  calculationAccepted: false,
  diagnostics: ['CALCULATION_NOT_ACCEPTED'],
});
assert.equal(blockedReceipt.status, 'BLOCKED');
assert.equal(blockedReceipt.resultReady, false);
assert.equal(blockedReceipt.convergenceReady, false);
assert.equal(blockedReceipt.releaseQualified, false);

assert.throws(() => createGeneralContinuumExecutionRequest({
  ...requestInput('C2D-BRACKET-GUSSET'), templateId: 'C2D-FLANGE-HUB',
}), /Unsupported registered continuum template/);
assert.throws(() => createGeneralContinuumExecutionRequest({
  ...requestInput('C2D-BRACKET-GUSSET'), elementTypes: ['T3'],
}), /Only T6 and Q8/);
assert.throws(() => createGeneralContinuumExecutionRequest({
  ...requestInput('C2D-BRACKET-GUSSET'),
  sourceAuthorityRequest: {
    ...requestInput('C2D-BRACKET-GUSSET').sourceAuthorityRequest,
    expectedDocumentRevisionDigest: 'fnv1a64:ffffffffffffffff',
  },
}), /stale or invalid/);
const tampered = structuredClone(
  createGeneralContinuumExecutionRequest(requestInput('C2D-BRACKET-GUSSET')),
);
tampered.meshHash = sha('TAMPERED');
Object.values(tampered).forEach((row) => {
  if (row && typeof row === 'object') Object.freeze(row);
});
Object.freeze(tampered);
assert.equal(validateGeneralContinuumExecutionRequest(tampered).ok, false);

const failClosed = executeGeneralLafeaContinuum({
  request: null, releaseRecord: null, compatibilityReceipt: null,
  document: null, meshEvidence: null,
});
assert.equal(failClosed.status, 'BLOCKED');
assert.equal(failClosed.accepted, false);
assert.equal(failClosed.authority.compilerGeneratedMesh, false);
assert.equal(failClosed.authority.arbitraryGeometryMesher, false);
assert.equal(failClosed.authority.shell, false);
assert.equal(failClosed.authority.code, false);
assert.equal(failClosed.authority.releaseQualified, false);

assert.doesNotMatch(controllerSource, /core\/local-continuum|executeLafeaStage/);
assert.match(controllerSource, /executeControlledContinuumStageRoute/);
assert.match(controllerSource, /registerLafeaAnalysisMeshEvidence/);
assert.match(controllerSource, /reconstructControlledContinuumResultHashes/);
assert.match(controllerSource, /INTEGRATION_POINT/);
assert.match(controllerSource, /convergenceReady !== false/);
assert.match(contractSource, /compilerGeneratedMesh: false/);
assert.match(contractSource, /arbitraryGeometryMesher: false/);
assert.match(contractSource, /releaseQualified: false/);

console.log(JSON.stringify({
  schema: 'lafea-nb-t6h-general-continuum-controller-check/v1',
  status: 'PASS',
  templateCount: accepted.length,
  accepted,
  negativeChecks: 5,
  authority: {
    registeredTemplateCallerMeshExecution: true,
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
}, null, 2));

function requestInput(templateId) {
  return {
    requestId: `NB-T6H-REQUEST-${templateId}`,
    templateId,
    releaseRecordHash: sha(`${templateId}-RELEASE`),
    compatibilityReceiptHash: sha(`${templateId}-COMPATIBILITY`),
    documentRevisionDigest: revision,
    sourceAuthorityRequest: {
      originRef: `NB-T6H/${templateId}`,
      expectedStageId: 'LAFEA.3',
      expectedDocumentRevisionDigest: revision,
      requestedRole: 'AUTHORITATIVE_EDITABLE_STAGE_SOURCE',
    },
    canonicalModelHash: sha(`${templateId}-MODEL`),
    analysisGeometryHash: sha(`${templateId}-GEOMETRY`),
    meshArtifactHash: sha(`${templateId}-MESH-ARTIFACT`),
    meshHash: sha(`${templateId}-MESH`),
    meshProfileHash: sha(`${templateId}-MESH-PROFILE`),
    elementTypes: ['T6'],
  };
}
