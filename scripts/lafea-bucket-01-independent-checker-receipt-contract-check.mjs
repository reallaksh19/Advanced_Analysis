#!/usr/bin/env node
import assert from 'node:assert/strict';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION,
} from '../src/workspace/lafea-bucket-01-independent-candidate-verification.js';
import {
  createLafeaBucket01IndependentCheckerReceipt,
} from '../src/workspace/lafea-bucket-01-independent-checker-receipt.js';
import {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
} from '../src/workspace/lafea-bucket-01-controlled-replay-result.js';

const verificationHead = 'a'.repeat(40);
const candidateHead = 'b'.repeat(40);
const designHash = hash({ design: 'V3' });
const candidatePackageHash = hash({ candidatePackage: 'V3' });
const intakeBase = {
  schema: 'lafea-bucket-01-probe-stable-candidate-intake-evidence/v2',
  producerRevision: 'B01-PROBE-STABLE-INTAKE.3',
  exactHeadSha: candidateHead,
  designHash,
  candidatePackageHash,
  topologyReportHash: hash({ topology: 1 }),
  candidateValidationEvidenceHash: hash({ candidateValidation: 1 }),
  topologyValidationEvidenceHash: hash({ topologyValidation: 1 }),
  expectedLocationCount: 7,
  minimumCandidateNaturalMargin: 0.05,
  levels: [],
  status: 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW',
  reasons: [],
  authority: {
    productionSwitchAuthorized: false,
    productionMeshAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  },
};
const intake = withHash(intakeBase);
const evidenceBase = {
  schema: LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA,
  producerRevision: LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION,
  exactHeadSha: verificationHead,
  candidateArtifactHeadSha: candidateHead,
  designHash,
  candidateIntakeEvidenceHash: intake.semanticHash,
  status: 'PASS',
  reasons: [],
  authority: {
    executedRecomputation: true,
    independentCheckerExecution: true,
    productionSwitchAuthorized: false,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  },
};
const evidence = withHash(evidenceBase);
const receipt = createLafeaBucket01IndependentCheckerReceipt({
  evidence,
  candidateIntakeEvidence: intake,
  routeId: 'PROBE_STABLE_T6_V3_CANDIDATE_REPLAY',
  relativePath:
    'reports/qualification-diagnostics/lafea-bucket-01-phase-3a-independent-verification.json',
  rawFileHash: hash({ rawFile: 'independent-evidence' }),
});

assert.equal(receipt.schema, LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA);
assert.equal(receipt.artifactKind, 'INDEPENDENT_CHECKER_EVIDENCE');
assert.equal(receipt.artifactScope, 'CANDIDATE_MESH_BOUND');
assert.equal(receipt.levelOrdinal, null);
assert.equal(receipt.exactHeadSha, verificationHead);
assert.equal(receipt.designHash, designHash);
assert.deepEqual(receipt.parentArtifactHashes, [
  candidatePackageHash,
  intake.semanticHash,
]);
assert.equal(receipt.semanticHash, evidence.semanticHash);
assert.equal(receipt.validationStatus, 'PASS');
assert.deepEqual(receipt.validationReasons, []);
assert.equal(receipt.derivedCheck, 'probeTopologyAudit');
assert.equal(Object.isFrozen(receipt), true);
assert.equal(Object.isFrozen(receipt.parentArtifactHashes), true);

const staleEvidence = withHash({
  ...evidenceBase,
  candidateIntakeEvidenceHash: hash({ stale: true }),
});
assert.throws(
  () => createLafeaBucket01IndependentCheckerReceipt({
    evidence: staleEvidence,
    candidateIntakeEvidence: intake,
    routeId: 'PROBE_STABLE_T6_V3_CANDIDATE_REPLAY',
    relativePath: 'reports/independent.json',
    rawFileHash: hash({ raw: 1 }),
  }),
  hasCode('LAFEA_B01_INDEPENDENT_RECEIPT_PARENT_CUSTODY_INVALID'),
);

const invalidPackage = withHash({
  ...intakeBase,
  candidatePackageHash: 'not-a-hash',
});
assert.throws(
  () => createLafeaBucket01IndependentCheckerReceipt({
    evidence,
    candidateIntakeEvidence: invalidPackage,
    routeId: 'PROBE_STABLE_T6_V3_CANDIDATE_REPLAY',
    relativePath: 'reports/independent.json',
    rawFileHash: hash({ raw: 2 }),
  }),
  hasCode('LAFEA_B01_INDEPENDENT_RECEIPT_INTAKE_INVALID'),
);

console.log(JSON.stringify({
  schema: 'lafea-bucket-01-independent-checker-receipt-contract-check/v1',
  status: 'PASS',
  replayContract: 'lafea-bucket-01-controlled-replay-result/v2',
  artifactKind: receipt.artifactKind,
  parentCustody: receipt.parentArtifactHashes,
  authority: evidence.authority,
}, null, 2));

function withHash(base) {
  return { ...base, semanticHash: canonicalLafeaSha256(base) };
}
function hash(value) {
  return canonicalLafeaSha256(value);
}
function hasCode(code) {
  return (error) => error?.code === code;
}
