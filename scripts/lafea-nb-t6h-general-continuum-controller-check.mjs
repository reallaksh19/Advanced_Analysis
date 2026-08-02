#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_GENERAL_CONTINUUM_TEMPLATE_IDS,
  createGeneralContinuumExecutionRequest,
  createGeneralContinuumExecutionReceipt,
  executeGeneralLafeaContinuum,
  validateGeneralContinuumExecutionRequest,
  validateGeneralContinuumExecutionReceipt,
} from '../src/workspace/lafea-general-continuum-execution-public.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const controllerPath = path.join(
  ROOT, 'src/workspace/lafea-general-continuum-controller.js');
const publicPath = path.join(
  ROOT, 'src/workspace/lafea-general-continuum-execution-public.js');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');
const publicSource = fs.readFileSync(publicPath, 'utf8');
const contractSource = fs.readFileSync(path.join(
  ROOT, 'src/core/lafea-application-templates/general-continuum-execution-contract.js'), 'utf8');
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
  assert.deepEqual(request.elementTypes, ['T6']);
  assert.equal(request.authority.registeredTemplateCallerMesh, true);
  assert.equal(request.authority.b6BoundMappingRequired, true);
  assert.equal(request.materialRegionEvidence.qualification, 'PASS');
  assert.equal(request.loadEdgeEvidence.qualification, 'PASS');
  assert.equal(request.boundaryEdgeEvidence.qualification, 'PASS');
  assert.equal(request.authority.compilerGeneratedMesh, false);
  assert.equal(request.authority.arbitraryGeometryMesher, false);
  assert.equal(request.authority.shell, false);
  assert.equal(request.authority.code, false);
  assert.equal(request.authority.releaseQualified, false);
  assert.equal(Object.isFrozen(request), true);
  const receiptInput = {
    receiptId: `NB-T6H-RECEIPT-${templateId}`,
    request,
    sourceAuthorityHash: sha(`${templateId}-AUTHORITY`),
    sourceHash: sha(`${templateId}-SOURCE`),
    callerMeshBindingHash: sha(`${templateId}-B6-BINDING`),
    executionHash: sha(`${templateId}-EXECUTION`),
    resultHash: sha(`${templateId}-RESULT`),
    recoveryHash: sha(`${templateId}-RECOVERY`),
    integrationPointResultHash: sha(`${templateId}-IP`),
    calculationAccepted: true,
    diagnostics: [],
  };
  const receipt = createGeneralContinuumExecutionReceipt(receiptInput);
  assert.equal(validateGeneralContinuumExecutionReceipt(receipt).ok, true);
  assert.equal(receipt.status, 'ACCEPTED');
  assert.equal(receipt.resultReady, true);
  assert.equal(receipt.convergenceReady, false);
  assert.equal(receipt.codeReady, false);
  assert.equal(receipt.reportReady, false);
  assert.equal(receipt.releaseQualified, false);
  const repeated = createGeneralContinuumExecutionReceipt(receiptInput);
  assert.equal(repeated.semanticHash, receipt.semanticHash);
  assert.equal(repeated.evidenceHash, receipt.evidenceHash);
  accepted.push({ templateId, requestHash: request.semanticHash, receiptHash: receipt.evidenceHash });
}

const blockedReceipt = createGeneralContinuumExecutionReceipt({
  receiptId: 'NB-T6H-BLOCKED',
  request: createGeneralContinuumExecutionRequest(requestInput('C2D-BRACKET-GUSSET')),
  sourceAuthorityHash: sha('AUTHORITY'),
  sourceHash: sha('SOURCE'),
  callerMeshBindingHash: sha('B6-BINDING'),
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
}), /governed T6/);
assert.throws(() => createGeneralContinuumExecutionRequest({
  ...requestInput('C2D-BRACKET-GUSSET'), elementTypes: ['Q8'],
}), /governed T6/);
assert.throws(() => createGeneralContinuumExecutionRequest({
  ...requestInput('C2D-BRACKET-GUSSET'),
  materialRegionEvidence: {
    applicability: 'REQUIRED', evidenceHash: sha('MATERIAL-PENDING'), qualification: 'PENDING',
  },
}), /must be REQUIRED and PASS/);
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
tampered.compilationHash = sha('TAMPERED-COMPILATION');
deepFreeze(tampered);
assert.equal(validateGeneralContinuumExecutionRequest(tampered).ok, false);

const failClosed = executeGeneralLafeaContinuum({
  request: null,
  releaseRecord: null,
  compatibilityReceipt: null,
  compilation: null,
  document: null,
  meshEvidence: null,
});
assert.equal(failClosed.status, 'BLOCKED');
assert.equal(failClosed.accepted, false);
assert.equal(failClosed.diagnostics.includes('LAFEA_NB_T6H_COMPILATION_IDENTITY_INVALID'), true);
assert.equal(failClosed.authority.b6BoundMapping, false);
assert.equal(failClosed.authority.compilerGeneratedMesh, false);
assert.equal(failClosed.authority.arbitraryGeometryMesher, false);
assert.equal(failClosed.authority.shell, false);
assert.equal(failClosed.authority.code, false);
assert.equal(failClosed.authority.releaseQualified, false);

assert.doesNotMatch(controllerSource, /core\/local-continuum|executeLafeaStage/);
assert.match(controllerSource, /executeControlledContinuumStageRoute/);
assert.match(controllerSource, /bindLafeaContinuumTemplateCallerMesh/);
assert.match(controllerSource, /B6_CALLER_MESH_BINDING_INVALID/);
assert.match(controllerSource, /callerMeshBindingHash/);
assert.match(controllerSource, /registerLafeaAnalysisMeshEvidence/);
assert.match(controllerSource, /reconstructControlledContinuumResultHashes/);
assert.match(controllerSource, /INTEGRATION_POINT/);
assert.match(controllerSource, /convergenceReady !== false/);
assert.match(publicSource, /LAFEA_TEMPLATE_COMPILATION_SCHEMA/);
assert.match(publicSource, /validateTemplateGeometryResult/);
assert.match(publicSource, /DOCUMENT_NOT_COMPILED_HANDOFF/);
assert.match(contractSource, /compilationHash/);
assert.match(contractSource, /materialRegionEvidence/);
assert.match(contractSource, /loadEdgeEvidence/);
assert.match(contractSource, /boundaryEdgeEvidence/);
assert.match(contractSource, /b6BoundMappingRequired: true/);
assert.match(contractSource, /compilerGeneratedMesh: false/);
assert.match(contractSource, /arbitraryGeometryMesher: false/);
assert.match(contractSource, /releaseQualified: false/);
assert.doesNotMatch(contractSource, /workspace\//);
assertNoControllerBypass();

console.log(JSON.stringify({
  schema: 'lafea-nb-t6h-general-continuum-controller-check/v1',
  status: 'PASS',
  templateCount: accepted.length,
  accepted,
  negativeChecks: 8,
  authority: {
    registeredTemplateCallerMeshExecution: true,
    b6BoundMappingRequired: true,
    elementType: 'T6',
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

function assertNoControllerBypass() {
  const sourceFiles = listJavaScriptFiles(path.join(ROOT, 'src'));
  const rawImport = /(?:from\s+|import\s*\()['"][^'"]*lafea-general-continuum-controller\.js['"]/u;
  const publicImport = /(?:from\s+|import\s*\()['"][^'"]*lafea-general-continuum-execution-public\.js['"]/u;
  const rawConsumers = sourceFiles.filter((filePath) =>
    rawImport.test(fs.readFileSync(filePath, 'utf8')));
  assert.deepEqual(rawConsumers.map(relative).sort(), [relative(publicPath)]);
  const publicConsumers = sourceFiles.filter((filePath) =>
    filePath !== publicPath && publicImport.test(fs.readFileSync(filePath, 'utf8')));
  assert.deepEqual(publicConsumers.map(relative).sort(), []);
}
function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(target);
    return /\.(?:js|mjs)$/u.test(entry.name) ? [target] : [];
  });
}
function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}
function requestInput(templateId) {
  return {
    requestId: `NB-T6H-REQUEST-${templateId}`,
    templateId,
    releaseRecordHash: sha(`${templateId}-RELEASE`),
    compatibilityReceiptHash: sha(`${templateId}-COMPATIBILITY`),
    compilationHash: sha(`${templateId}-COMPILATION`),
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
    materialRegionEvidence: mapping(`${templateId}-MATERIAL`),
    loadEdgeEvidence: mapping(`${templateId}-LOAD`),
    boundaryEdgeEvidence: mapping(`${templateId}-BOUNDARY`),
  };
}
function mapping(label) {
  return { applicability: 'REQUIRED', evidenceHash: sha(label), qualification: 'PASS' };
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
