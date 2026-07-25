import assert from 'node:assert/strict';
import {
  REQUEST_TYPES, calculateLocalAttachmentFoundation, createCanonicalLocalAttachmentFoundationModel,
  reconstructResultHashes,
} from '../src/core/local-stress/index.js';
import { calculateLocalTrunnionFootprint } from '../src/core/local-trunnion-footprint/index.js';
import { attachmentSource, clone, refreshAncestry, workflowSource } from './lafea.5-fixtures.mjs';

assert.equal(calculateLocalTrunnionFootprint(workflowSource()).qualification.state, 'ACCEPTED');

const rejected = clone(workflowSource());
rejected.attachmentEvidence.result.qualification.state = 'REJECTED_MODEL';
rejected.attachmentEvidence.result.semanticHashes = reconstructResultHashes(rejected.attachmentEvidence.result);
refreshAncestry(rejected);
assert.equal(calculateLocalTrunnionFootprint(rejected).diagnostics[0].code, 'ATTACHMENT_RESULT_NOT_ACCEPTED');

const forged = clone(workflowSource()); forged.attachmentEvidence.result.semanticHashes.resultPayloadSemanticHash = 'fnv1a64:0000000000000000'; refreshAncestry(forged);
assert.equal(calculateLocalTrunnionFootprint(forged).diagnostics[0].code, 'ATTACHMENT_RESULT_HASH_MISMATCH');

const selfConsistentForgery = clone(workflowSource());
selfConsistentForgery.attachmentEvidence.result.transformedLoadCases[0].canonicalForceGlobal[0] += 1;
selfConsistentForgery.attachmentEvidence.result.semanticHashes = reconstructResultHashes(selfConsistentForgery.attachmentEvidence.result);
refreshAncestry(selfConsistentForgery);
assert.equal(calculateLocalTrunnionFootprint(selfConsistentForgery).diagnostics[0].code, 'ATTACHMENT_RESULT_FORGED');

const stale = clone(workflowSource()); stale.sourceAncestry.attachmentCanonicalModelSemanticHash = 'stale';
assert.equal(calculateLocalTrunnionFootprint(stale).diagnostics[0].code, 'SOURCE_ANCESTRY_MODEL_MISMATCH');

const staleResultAncestry = clone(workflowSource());
staleResultAncestry.sourceAncestry.attachmentResultPayloadSemanticHash = 'stale';
assert.equal(calculateLocalTrunnionFootprint(staleResultAncestry).diagnostics[0].code, 'SOURCE_ANCESTRY_RESULT_MISMATCH');

const staleShell = clone(workflowSource());
staleShell.shellTemplate.modelVersion = '2';
assert.equal(calculateLocalTrunnionFootprint(staleShell).diagnostics[0].code, 'SOURCE_ANCESTRY_SHELL_TEMPLATE_MISMATCH');

const mixed = clone(workflowSource());
mixed.attachmentEvidence.result.sourceAncestry = { ...mixed.attachmentEvidence.result.sourceAncestry, sourceSemanticHash: 'other' };
mixed.attachmentEvidence.result.semanticHashes = reconstructResultHashes(mixed.attachmentEvidence.result); refreshAncestry(mixed);
assert.equal(calculateLocalTrunnionFootprint(mixed).diagnostics[0].code, 'ATTACHMENT_ANCESTRY_MISMATCH');

const units = clone(workflowSource());
units.shellTemplate.units.length = 'm';
const unitRejected = calculateLocalTrunnionFootprint(units);
assert.notEqual(unitRejected.qualification.state, 'ACCEPTED');
assert.equal(unitRejected.diagnostics[0].code, 'SHELL_TEMPLATE_INVALID');

const pressureOnly = clone(workflowSource());
const pressureSource = attachmentSource();
pressureSource.resultRequests.requestedAnalyses = [REQUEST_TYPES.PRESSURE_STRESS];
pressureSource.resultRequests.transformedLoadCaseIdentities = [];
pressureSource.resultRequests.pressure = [{
  identity: 'PR-ONLY', pressureDefinitionIdentity: 'P-CLOSED',
  requestedRadii: [
    { value: 9, sourceRef: 'ATTACHMENT-SOURCE@1#requests.PR-ONLY.inner' },
    { value: 10, sourceRef: 'ATTACHMENT-SOURCE@1#requests.PR-ONLY.outer' },
  ],
  includeAxialPressureStress: true, includeThinWallComparison: false,
}];
const pressureModel = createCanonicalLocalAttachmentFoundationModel(pressureSource);
pressureOnly.attachmentEvidence = { model: pressureModel, result: calculateLocalAttachmentFoundation(pressureModel) };
pressureOnly.loadCaseMappings = [];
refreshAncestry(pressureOnly);
const pressureRejected = calculateLocalTrunnionFootprint(pressureOnly);
assert.equal(pressureRejected.qualification.state, 'UNSUPPORTED_REQUEST');
assert.equal(pressureRejected.diagnostics[0].code, 'PRESSURE_ONLY_REQUEST_UNSUPPORTED');
console.log('LAFEA.5 accepted/rejected/stale/forged source, ancestry, units and pressure-only rejection passed.');