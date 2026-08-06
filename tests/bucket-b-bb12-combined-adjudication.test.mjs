import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  BB12_REQUIRED_MODULE_IDS,
  BB12_REQUIRED_PACKAGE_IDS,
  BB12_WITHHELD_AUTHORITY_BOUNDARY,
  createBb12CombinedApproval,
  createBb12CombinedEvidence,
  createBb12CombinedReport,
  validateBb12CombinedApproval,
  validateBb12CombinedEvidence,
  validateBb12CombinedReport,
  validateBucketBRegistryForBb12,
} from '../src/core/bucket-b/bb12-combined-adjudication.js';

const HEAD = '1'.repeat(40);
const BASE = '2'.repeat(40);
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const FNV = `fnv1a64:${'d'.repeat(16)}`;

const profiles = {
  'C2D-LUG-PINHOLE': ['PLANE_STRESS', 'Q8_FULL_3X3', 'BB06'],
  'C2D-CLAMP-EAR': ['PLANE_STRESS', 'Q8_FULL_3X3', 'BB06'],
  'C2D-BRACKET-GUSSET': ['PLANE_STRESS', 'Q8_FULL_3X3', 'BB07'],
  'C2D-PIPE-PAD-SECTION': ['PLANE_STRAIN', 'Q8_FULL_3X3', 'BB08'],
  'C2D-NOZZLE-REPAD-SECTION': ['PLANE_STRAIN', 'Q8_FULL_3X3', 'BB09'],
  'C2D-FLANGE-HUB': ['AXISYMMETRIC', 'AXI_Q8_FULL_3X3', 'BB11'],
};

const MOCK_REGISTRY = Object.freeze(Object.fromEntries(
  Object.entries(profiles).map(([moduleId, [formulationProfile, elementProfile]]) => [
    moduleId,
    Object.freeze({
      moduleId,
      formulationProfile,
      elementProfile,
      requiredRecords: Object.freeze(['MESH', 'CORE', 'OUT']),
    }),
  ]),
));

function packageReceipts() {
  return BB12_REQUIRED_PACKAGE_IDS.map((packageId) => ({
    packageId,
    sourceReportSchema: `test-${packageId.toLowerCase()}-report/v1`,
    sourceReportSemanticHash: FNV,
    sourceReportRawSha256: HASH_A,
    sourceHeadSha: HEAD,
    custodyKind: packageId === 'BB10' || packageId === 'BB11'
      ? 'RETAINED_PLUS_SAME_HEAD_REPLAY'
      : 'SAME_HEAD_REPLAY',
    replayEvidenceHash: HASH_B,
    status: 'PASS',
  }));
}

function moduleReceipts() {
  return BB12_REQUIRED_MODULE_IDS.map((moduleId) => {
    const [formulationProfile, elementProfile, sourcePackageId] = profiles[moduleId];
    return {
      moduleId,
      formulationProfile,
      elementProfile,
      sourcePackageId,
      sourceReportSemanticHash: FNV,
      applicationProcedureQualified: true,
      numericalOutputQualified: true,
    };
  });
}

function retainedArtifactCustody() {
  return {
    BB10: {
      artifactId: '10',
      artifactDigest: HASH_A,
      reportRawSha256: HASH_A,
      reportSemanticHash: FNV,
      mergeSha: '3'.repeat(40),
    },
    BB11: {
      artifactId: '11',
      artifactDigest: HASH_B,
      reportRawSha256: HASH_A,
      reportSemanticHash: FNV,
      mergeSha: '4'.repeat(40),
    },
  };
}

function checks() {
  return [
    { checkId: 'BB12_TEST_CONTRACT', status: 'PASS', evidenceHash: HASH_A },
    { checkId: 'BB12_TEST_CUSTODY', status: 'PASS', evidenceHash: HASH_B },
  ];
}

function createEvidence() {
  return createBb12CombinedEvidence({
    exactHeadSha: HEAD,
    baseSha: BASE,
    packageReceipts: packageReceipts(),
    moduleReceipts: moduleReceipts(),
    retainedArtifactCustody: retainedArtifactCustody(),
    registrySnapshotHash: semanticHash(MOCK_REGISTRY),
    roadmapAssertions: {
      bb12Required: true,
      noAutomaticProductionAuthority: true,
      noCodeAssessmentAuthority: true,
      bucket01Unchanged: true,
      roadmapRawSha256: HASH_C,
    },
    checkResults: checks(),
    registry: MOCK_REGISTRY,
  });
}

function createApproval() {
  return createBb12CombinedApproval({
    evidence: createEvidence(),
    changedPaths: [
      { status: 'A', path: '.github/workflows/bucket-b-bb12-combined-adjudication.yml' },
      { status: 'A', path: 'docs/Bucket_B_BB12_Combined_Adjudication_Record.md' },
      { status: 'A', path: 'docs/LAFEA_BB12_Combined_Adjudication_Qualification_and_Work_Pack.md' },
      { status: 'A', path: 'src/core/bucket-b/bb12-check.mjs' },
      { status: 'A', path: 'src/core/bucket-b/bb12-combined-adjudication.js' },
      { status: 'M', path: 'src/core/bucket-b/index.js' },
      { status: 'A', path: 'tests/bucket-b-bb12-combined-adjudication.test.mjs' },
    ],
    sourceArtifactHashes: [HASH_A, HASH_B, HASH_C, FNV, HASH_A, HASH_B, HASH_C],
    rawEvidenceHashes: [HASH_A, HASH_B, HASH_C],
    semanticEvidenceHashes: [FNV],
    checkResults: checks(),
  });
}

function reseal(value) {
  const copy = JSON.parse(JSON.stringify(value));
  delete copy.semanticHash;
  return { ...copy, semanticHash: semanticHash(copy) };
}

test('BB-12 registry and authority boundaries are explicit and immutable', () => {
  assert.equal(validateBucketBRegistryForBb12(MOCK_REGISTRY), true);
  assert.equal(Object.isFrozen(BB12_WITHHELD_AUTHORITY_BOUNDARY), true);
  assert.deepEqual(BB12_WITHHELD_AUTHORITY_BOUNDARY, {
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
    bucket01Qualified: 'UNCHANGED',
  });
});

test('BB-12 evidence, approval and report round-trip', () => {
  const evidence = createEvidence();
  assert.equal(validateBb12CombinedEvidence(evidence, {
    expectedHeadSha: HEAD,
    expectedBaseSha: BASE,
  }), true);
  assert.equal(Object.isFrozen(evidence), true);

  const approval = createApproval();
  assert.equal(validateBb12CombinedApproval(approval, {
    expectedHeadSha: HEAD,
    expectedBaseSha: BASE,
  }), true);

  const report = createBb12CombinedReport({
    exactHeadSha: HEAD,
    baseSha: BASE,
    mergeBaseSha: BASE,
    currentMainSha: BASE,
    commitsBehindMain: 0,
    approval,
    artifactId: '100',
    artifactDigest: HASH_A,
    checkResults: checks(),
    replay: {
      byteIdentical: true,
      identityHash: HASH_C,
      runAArtifactManifestHash: HASH_A,
      runBArtifactManifestHash: HASH_A,
      stdoutHashA: HASH_B,
      stdoutHashB: HASH_B,
      stderrHashA: HASH_C,
      stderrHashB: HASH_C,
    },
    limitations: [
      'NO_CODE_ASSESSMENT_AUTHORITY',
      'NO_PRODUCTION_SWITCH_AUTHORITY',
    ],
  });
  assert.equal(validateBb12CombinedReport(report, {
    expectedHeadSha: HEAD,
    expectedBaseSha: BASE,
  }), true);
  assert.equal(report.bucketBCombinedAdjudicationQualified, true);
  assert.equal(report.productionSwitchAuthorized, false);
});

test('BB-12 rejects incomplete package intake', () => {
  assert.throws(() => createBb12CombinedEvidence({
    exactHeadSha: HEAD,
    baseSha: BASE,
    packageReceipts: packageReceipts().slice(1),
    moduleReceipts: moduleReceipts(),
    retainedArtifactCustody: retainedArtifactCustody(),
    registrySnapshotHash: semanticHash(MOCK_REGISTRY),
    roadmapAssertions: {
      bb12Required: true,
      noAutomaticProductionAuthority: true,
      noCodeAssessmentAuthority: true,
      bucket01Unchanged: true,
      roadmapRawSha256: HASH_C,
    },
    checkResults: checks(),
    registry: MOCK_REGISTRY,
  }), /PACKAGE_RECEIPTS_INCOMPLETE/);
});

test('BB-12 rejects recomputed forbidden authority', () => {
  const approval = createApproval();
  const tampered = reseal({
    ...approval,
    productionSwitchAuthorized: true,
  });
  assert.throws(
    () => validateBb12CombinedApproval(tampered),
    /FORBIDDEN_AUTHORITY_SET/,
  );
});

test('BB-12 rejects stale semantic hashes and non-identical replay', () => {
  const approval = createApproval();
  const stale = JSON.parse(JSON.stringify(approval));
  stale.bucketBProgrammeCompletionRecorded = false;
  assert.throws(
    () => validateBb12CombinedApproval(stale),
    /SCHEMA_OR_SEMANTIC_HASH_INVALID/,
  );

  assert.throws(() => createBb12CombinedReport({
    exactHeadSha: HEAD,
    baseSha: BASE,
    mergeBaseSha: BASE,
    currentMainSha: BASE,
    commitsBehindMain: 0,
    approval,
    artifactId: '100',
    artifactDigest: HASH_A,
    checkResults: checks(),
    replay: {
      byteIdentical: true,
      identityHash: HASH_C,
      runAArtifactManifestHash: HASH_A,
      runBArtifactManifestHash: HASH_B,
      stdoutHashA: HASH_B,
      stdoutHashB: HASH_B,
      stderrHashA: HASH_C,
      stderrHashB: HASH_C,
    },
    limitations: ['NO_PRODUCTION_SWITCH_AUTHORITY'],
  }), /REPLAY_HASH_MISMATCH/);
});

test('BB-12 rejects omitted explicit false authority', () => {
  const approval = createApproval();
  const omitted = JSON.parse(JSON.stringify(approval));
  delete omitted.codeAssessmentQualified;
  const resealed = reseal(omitted);
  assert.throws(
    () => validateBb12CombinedApproval(resealed),
    /FORBIDDEN_AUTHORITY_SET/,
  );
});
