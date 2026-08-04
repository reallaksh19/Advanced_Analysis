#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import { LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA, createLafeaBucket01CodeBasis } from '../src/workspace/lafea-bucket-01-code-basis.js';
import { LAFEA_BUCKET_01_CODE_ASSESSMENT_INPUT_SCHEMA, evaluateLafeaBucket01CodeAssessment, validateLafeaBucket01CodeAssessment } from '../src/workspace/lafea-bucket-01-code-assessment.js';

const head = 'a'.repeat(40);
const basis = createLafeaBucket01CodeBasis({
  schema: LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA,
  basisId: 'SYNTHETIC-FINAL-ADJUDICATION-CONTRACT', exactHeadSha: head,
  benchmarkId: 'C2D-LUG-PINHOLE-01', target: 'C2D-LUG-PINHOLE -> LAFEA.3',
  probeSpecHash: `sha256:${'b'.repeat(64)}`,
  governingCode: { organization: 'TEST', documentId: 'TEST', title: 'TEST', edition: 'TEST', addenda: null, jurisdiction: 'TEST', sourceDocumentHash: `sha256:${'c'.repeat(64)}` },
  allowable: { allowableId: 'TEST', value: 100, units: 'MPa', temperature: 20, temperatureUnits: 'degC', materialScope: 'TEST', sourceSection: 'TEST', sourceTable: null, interpolationPolicy: 'NONE' },
  stressClassification: { classificationId: 'TEST', method: 'FIXED_LOCATION_RICHARDSON_GCI_UPPER_BOUND', sourceSection: 'TEST', locationIds: ['P1'], stressQuantity: 'VON_MISES', extractionAuthority: 'RETAINED_DIRECT_T6_FIXED_PROBES_AND_PATHS', singularityTreatment: 'EXCLUDE_UNCLASSIFIED_SINGULAR_PEAKS' },
  loadCombination: { combinationId: 'TEST', sourceSection: 'TEST', terms: [{ loadCaseId: 'LC1', factor: 1, role: 'TEST' }] },
  authority: { approvalStatus: 'APPROVED', approvalId: 'TEST', authoritySource: 'EXTERNAL_ENGINEERING_AUTHORITY', issuer: 'TEST', approver: 'TEST', approverRole: 'TEST', approvedAt: '2026-08-03T00:00:00.000Z', approvalRecordHash: `sha256:${'d'.repeat(64)}` },
});
const location = {
  probeId: 'P1', status: 'PASS', component: 'VON_MISES', units: 'MPa',
  governedLevelOrdinals: [1, 2, 3, 4], evaluatedLevelOrdinals: [2, 3, 4],
  governedObservations: [90, 80, 70, 65], observations: [80, 70, 65],
  locationDefinitionHash: `sha256:${'e'.repeat(64)}`,
  convergence: { status: 'PASS', richardsonExtrapolation: 60, fineGridGci: 0.05, semanticHash: `sha256:${'f'.repeat(64)}` },
};
const stressBase = {
  schema: 'lafea-bucket-01-production-lug-fixed-probe-evidence/v2', exactHeadSha: head,
  status: 'PASS', standaloneProbeReceipts: [location], pathReceipts: [],
  authority: {
    directElementPointRecovery: true,
    retainedNodalDisplacementAuthority: true,
    retainedConstitutiveMatrixAuthority: true,
    integrationPointExtrapolationUsed: false,
    movingMaximumUsed: false,
    nodalProjectionUsed: false,
    crossElementAveragingUsed: false,
  },
};
const stress = { ...stressBase, evidenceHash: canonicalLafeaSha256(stressBase) };
const assessment = evaluateLafeaBucket01CodeAssessment({
  schema: LAFEA_BUCKET_01_CODE_ASSESSMENT_INPUT_SCHEMA,
  assessmentId: 'SYNTHETIC-ASSESSMENT', exactHeadSha: head,
  codeBasisPackage: basis, productionLugStressEvidence: stress,
});
assert.equal(assessment.status, 'CODE_ASSESSMENT_PASS');
assert.equal(assessment.authority.directElementPointRecoveryConsumed, true);
assert.equal(assessment.authority.integrationPointExtrapolationConsumed, false);
assert.equal(validateLafeaBucket01CodeAssessment(assessment).ok, true);
const blockedBasis = createLafeaBucket01CodeBasis({
  schema: LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA,
  basisId: 'SYNTHETIC-BLOCKED', exactHeadSha: head, benchmarkId: basis.benchmarkId,
  target: basis.target, probeSpecHash: basis.probeSpecHash, governingCode: basis.governingCode,
  allowable: { ...basis.allowable, allowableId: 'LOW', value: 10 },
  stressClassification: basis.stressClassification, loadCombination: basis.loadCombination, authority: basis.authority,
});
assert.equal(evaluateLafeaBucket01CodeAssessment({
  schema: LAFEA_BUCKET_01_CODE_ASSESSMENT_INPUT_SCHEMA,
  assessmentId: 'SYNTHETIC-BLOCKED-ASSESSMENT', exactHeadSha: head,
  codeBasisPackage: blockedBasis, productionLugStressEvidence: stress,
}).status, 'CODE_ASSESSMENT_BLOCKED');
const finalSource = fs.readFileSync(new URL('./lafea-bucket-01-final-qualification-check.mjs', import.meta.url), 'utf8');
const replaySource = fs.readFileSync(new URL('./lafea-bucket-01-final-replay-receipt.mjs', import.meta.url), 'utf8');
for (const token of ['codeAssessment', 'productionLugStress', 'EXACT_HEAD_REPAIR_EVIDENCE_PASS', 'BUCKET_01_QUALIFIED']) assert.ok(finalSource.includes(token));
for (const token of ['codeAssessment', 'FINAL_THREE_REPLAY_CUSTODY_PASS', 'replays.length, 3']) assert.ok(replaySource.includes(token));
console.log('PASS LAFEA Bucket-01 final adjudication contract checks');
