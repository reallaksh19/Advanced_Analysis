#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA,
  createLafeaBucket01CodeBasis,
} from '../src/workspace/lafea-bucket-01-code-basis.js';
import {
  LAFEA_BUCKET_01_CODE_ASSESSMENT_INPUT_SCHEMA,
  evaluateLafeaBucket01CodeAssessment,
  validateLafeaBucket01CodeAssessment,
} from '../src/workspace/lafea-bucket-01-code-assessment.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const head = 'a'.repeat(40);
const requiredReportKeys = [
  'expectedValueDefinition', 'exactHeadReport', 'repairReport',
  'productionProjection', 'productionExecution', 'productionResponse',
  'kirschStress', 'productionLugStress', 'codeBasisPackage', 'codeAssessment',
];

const basis = createLafeaBucket01CodeBasis({
  schema: LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA,
  basisId: 'SYNTHETIC-PATCH-V2-REGRESSION',
  exactHeadSha: head,
  benchmarkId: 'C2D-LUG-PINHOLE-01',
  target: 'C2D-LUG-PINHOLE -> LAFEA.3',
  probeSpecHash: `sha256:${'b'.repeat(64)}`,
  governingCode: {
    organization: 'TEST', documentId: 'TEST', title: 'TEST', edition: 'TEST',
    addenda: null, jurisdiction: 'TEST', sourceDocumentHash: `sha256:${'c'.repeat(64)}`,
  },
  allowable: {
    allowableId: 'ENVELOPE-REGRESSION', value: 66, units: 'MPa',
    temperature: 20, temperatureUnits: 'degC', materialScope: 'TEST',
    sourceSection: 'TEST', sourceTable: null, interpolationPolicy: 'NONE',
  },
  stressClassification: {
    classificationId: 'TEST', method: 'FIXED_LOCATION_RICHARDSON_GCI_UPPER_BOUND',
    sourceSection: 'TEST', locationIds: ['P1'], stressQuantity: 'VON_MISES',
    extractionAuthority: 'RETAINED_DIRECT_T6_FIXED_PROBES_AND_PATHS',
    singularityTreatment: 'EXCLUDE_UNCLASSIFIED_SINGULAR_PEAKS',
  },
  loadCombination: {
    combinationId: 'TEST', sourceSection: 'TEST',
    terms: [{ loadCaseId: 'LC1', factor: 1, role: 'TEST' }],
  },
  authority: {
    approvalStatus: 'APPROVED', approvalId: 'TEST',
    authoritySource: 'EXTERNAL_ENGINEERING_AUTHORITY', issuer: 'TEST',
    approver: 'TEST', approverRole: 'TEST',
    approvedAt: '2026-08-03T00:00:00.000Z',
    approvalRecordHash: `sha256:${'d'.repeat(64)}`,
  },
});
const location = {
  probeId: 'P1', status: 'PASS', component: 'VON_MISES', units: 'MPa',
  governedLevelOrdinals: [1, 2, 3, 4],
  evaluatedLevelOrdinals: [2, 3, 4],
  governedObservations: [90, 80, 70, 65],
  observations: [80, 70, 65],
  locationDefinitionHash: `sha256:${'e'.repeat(64)}`,
  convergence: {
    status: 'PASS', richardsonExtrapolation: 60, fineGridGci: 0.05,
    semanticHash: `sha256:${'f'.repeat(64)}`,
  },
};
const stressBase = {
  schema: 'lafea-bucket-01-production-lug-fixed-probe-evidence/v2',
  exactHeadSha: head,
  governedLevelOrdinals: [1, 2, 3, 4],
  evaluatedLevelOrdinals: [2, 3, 4],
  status: 'PASS',
  standaloneProbeReceipts: [location],
  pathReceipts: [],
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
  assessmentId: 'SYNTHETIC-PATCH-V2-ASSESSMENT',
  exactHeadSha: head,
  codeBasisPackage: basis,
  productionLugStressEvidence: stress,
});
assert.equal(validateLafeaBucket01CodeAssessment(assessment).ok, true);
assert.equal(assessment.status, 'CODE_ASSESSMENT_BLOCKED');
assert.equal(assessment.authority.directElementPointRecoveryConsumed, true);
assert.equal(assessment.authority.integrationPointExtrapolationConsumed, false);
assert.equal(assessment.locationAssessments[0].fineGridStress, 65);
assert.equal(assessment.locationAssessments[0].richardsonStress, 60);
assert.equal(assessment.locationAssessments[0].stressEnvelopeReference, 65);
assert.equal(assessment.locationAssessments[0].numericalUncertainty, 3.25);
assert.equal(assessment.locationAssessments[0].boundedStress, 68.25);
assert.equal(assessment.locationAssessments[0].accepted, false);

const validInput = replayInput();
const positive = runReplay(validInput);
assert.equal(positive.status, 0, positive.stderr || positive.stdout);
const positiveReport = JSON.parse(fs.readFileSync(positive.outputPath, 'utf8'));
assert.equal(positiveReport.schema, 'lafea-bucket-01-final-replay-custody/v2');
assert.equal(positiveReport.producerRevision, 'B01-FINAL-REPLAY.2');
assert.deepEqual(
  Object.keys(positiveReport.deterministicReportHashes).sort(),
  [...requiredReportKeys].sort(),
);

const omissionDefinition = structuredClone(validInput);
delete omissionDefinition.replays[0].reportHashes.expectedValueDefinition;
assertBlocked(omissionDefinition, 'expected-value definition omission');

const omissionKirsch = structuredClone(validInput);
delete omissionKirsch.replays[0].reportHashes.kirschStress;
assertBlocked(omissionKirsch, 'Kirsch stress omission');

const substitutionDefinition = structuredClone(validInput);
substitutionDefinition.replays[0].reportHashes.expectedValueReport =
  substitutionDefinition.replays[0].reportHashes.expectedValueDefinition;
delete substitutionDefinition.replays[0].reportHashes.expectedValueDefinition;
assertBlocked(substitutionDefinition, 'expected-value definition substitution');

const substitutionKirsch = structuredClone(validInput);
substitutionKirsch.replays[0].reportHashes.kirschReport =
  substitutionKirsch.replays[0].reportHashes.kirschStress;
delete substitutionKirsch.replays[0].reportHashes.kirschStress;
assertBlocked(substitutionKirsch, 'Kirsch stress substitution');

const mutationDefinition = structuredClone(validInput);
mutationDefinition.replays[0].reportHashes.expectedValueDefinition = `sha256:${'1'.repeat(64)}`;
mutationDefinition.replays[0].evidenceSetHash = evidenceSetHash(mutationDefinition.replays[0]);
assertBlocked(mutationDefinition, 'expected-value definition mutation');

const mutationKirsch = structuredClone(validInput);
mutationKirsch.replays[0].reportHashes.kirschStress = `sha256:${'2'.repeat(64)}`;
mutationKirsch.replays[0].evidenceSetHash = evidenceSetHash(mutationKirsch.replays[0]);
assertBlocked(mutationKirsch, 'Kirsch stress mutation');

const hashMismatchDefinition = structuredClone(validInput);
hashMismatchDefinition.replays[0].reportHashes.expectedValueDefinition = `sha256:${'3'.repeat(64)}`;
assertBlocked(hashMismatchDefinition, 'expected-value definition hash mismatch');

const hashMismatchKirsch = structuredClone(validInput);
hashMismatchKirsch.replays[0].reportHashes.kirschStress = `sha256:${'4'.repeat(64)}`;
assertBlocked(hashMismatchKirsch, 'Kirsch stress hash mismatch');

const productionReplaySource = fs.readFileSync(
  path.join(ROOT, 'scripts/lafea-bucket-01-production-replay.mjs'),
  'utf8',
);
for (const token of [
  '[64, 256, 1024, 4096]',
  'energyConvergenceElementCounts, [256, 1024, 4096]',
  'governedLevelOrdinals, [1, 2, 3, 4]',
  'evaluatedLevelOrdinals, [2, 3, 4]',
  'directElementPointRecovery',
  'integrationPointExtrapolationUsed',
]) {
  assert.ok(productionReplaySource.includes(token), `production replay missing ${token}`);
}

console.log(JSON.stringify({
  schema: 'lafea-bucket-01-patch-v2-regression/v2',
  status: 'PASS',
  conservativeAssessment: {
    fineGridStress: 65,
    richardsonStress: 60,
    fineGridGci: 0.05,
    allowable: 66,
    boundedDemand: 68.25,
    disposition: 'BLOCK',
  },
  governedReplayContract: {
    governedElementCounts: [64, 256, 1024, 4096],
    evaluatedElementCounts: [256, 1024, 4096],
    directPointStressRequired: true,
    integrationPointExtrapolationAccepted: false,
  },
  replayCustodyV2: {
    positiveReceiptAccepted: true,
    expectedValueDefinitionOmissionBlocked: true,
    kirschStressOmissionBlocked: true,
    expectedValueDefinitionSubstitutionBlocked: true,
    kirschStressSubstitutionBlocked: true,
    expectedValueDefinitionMutationBlocked: true,
    kirschStressMutationBlocked: true,
    expectedValueDefinitionHashMismatchBlocked: true,
    kirschStressHashMismatchBlocked: true,
  },
}, null, 2));

function replayInput() {
  const reportHashes = Object.fromEntries(requiredReportKeys.map((key, index) => [
    key,
    `sha256:${index.toString(16).padStart(64, '0')}`,
  ]));
  const replays = ['R1', 'R2', 'R3'].map((replayId) => {
    const row = {
      replayId,
      exactHeadSha: head,
      exitCode: 0,
      trackedTreeClean: true,
      exactHeadReportStatus: 'EXACT_HEAD_REPAIR_EVIDENCE_PASS',
      reportHashes: structuredClone(reportHashes),
      stdoutHash: `sha256:${'6'.repeat(64)}`,
      stderrHash: `sha256:${'7'.repeat(64)}`,
    };
    return { ...row, evidenceSetHash: evidenceSetHash(row) };
  });
  return {
    schema: 'lafea-bucket-01-final-replay-input/v2',
    custodyId: 'SYNTHETIC-PATCH-V2-CUSTODY',
    exactHeadSha: head,
    definitionSetHash: `sha256:${'8'.repeat(64)}`,
    replays,
  };
}

function evidenceSetHash(row) {
  return canonicalLafeaSha256({
    schema: 'lafea-bucket-01-final-replay-evidence-set/v2',
    exactHeadSha: row.exactHeadSha,
    exitCode: row.exitCode,
    trackedTreeClean: row.trackedTreeClean,
    exactHeadReportStatus: row.exactHeadReportStatus,
    reportHashes: row.reportHashes,
    stdoutHash: row.stdoutHash,
    stderrHash: row.stderrHash,
  });
}

function assertBlocked(input, label) {
  const result = runReplay(input);
  assert.notEqual(result.status, 0, `${label} unexpectedly accepted`);
}

function runReplay(input) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lafea-b01-patch-v2-'));
  const inputPath = path.join(temp, 'input.json');
  const outputPath = path.join(temp, 'output.json');
  fs.writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
  const result = spawnSync(process.execPath, [
    'scripts/lafea-bucket-01-final-replay-receipt.mjs',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPECTED_HEAD_SHA: head,
      LAFEA_BUCKET_01_FINAL_REPLAY_INPUT_PATH: inputPath,
      LAFEA_BUCKET_01_FINAL_REPLAY_REPORT_PATH: outputPath,
    },
  });
  return { ...result, outputPath };
}
