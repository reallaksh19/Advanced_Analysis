import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createCanonicalFlangeHubGeometry } from '../src/core/bucket-b/flange-hub-geometry.js';
import {
  AXISYMMETRIC_ADOPTION_AUTHORITY_BOUNDARY,
  AXISYMMETRIC_ADOPTION_RECEIPT_SCHEMA,
  AXISYMMETRIC_ADOPTION_STATUS,
  createBb11FlangeHubApproval,
  validateAxisymmetricRegistrationAdoptionReceipt,
  validateBb11FlangeHubApproval,
} from '../src/core/bucket-b/flange-hub-authority.js';
import {
  createFlangeHubMesh,
  FLANGE_HUB_MESH_FAMILY_ID,
  FLANGE_HUB_MESH_LEVELS,
  FLANGE_HUB_MESH_V2_POLICY,
} from '../src/core/bucket-b/flange-hub-mesh-v2.js';

const HEAD_SHA = '1'.repeat(40);
const BASE_SHA = '2'.repeat(40);
const UPSTREAM_APPROVED_SHA = '3'.repeat(40);
const UPSTREAM_MERGED_SHA = '4'.repeat(40);
const BLOB_OID = '5'.repeat(40);
const HASH = 'sha256:'.concat('a'.repeat(64));
const OTHER_HASH = 'sha256:'.concat('b'.repeat(64));

function sealForTest(payload) {
  return { ...payload, semanticHash: semanticHash(payload) };
}

function createValidAdoptionReceipt() {
  const governedBb10PathList = ['src/core/bucket-b/axisymmetric-q8-kernel.js'];
  const manifest = [{
    path: governedBb10PathList[0],
    gitBlobOid: BLOB_OID,
    rawSha256: HASH,
    fileMode: '100644',
  }];
  const registrationCases = [
    'AXI-Q8-REG-001-A',
    'AXI-Q8-REG-001-B',
    'AXI-Q8-REG-001-C',
  ].map((caseId) => ({
    caseId,
    status: 'PASS',
    semanticEvidenceHash: HASH,
    rawEvidenceHash: OTHER_HASH,
  }));
  const currentChangedPaths = [{
    status: 'M',
    path: 'src/core/bucket-b/flange-hub-authority.js',
  }];
  const payload = {
    schema: AXISYMMETRIC_ADOPTION_RECEIPT_SCHEMA,
    moduleId: 'C2D-FLANGE-HUB',
    currentExactHeadSha: HEAD_SHA,
    currentBaseSha: BASE_SHA,
    currentMergeBaseSha: BASE_SHA,
    upstreamBb10ApprovedHeadSha: UPSTREAM_APPROVED_SHA,
    upstreamBb10MergedHeadSha: UPSTREAM_MERGED_SHA,
    upstreamBb10ApprovalSemanticHash: HASH,
    upstreamBb10ReportSemanticHash: OTHER_HASH,
    upstreamBb10ReportRawSha256: HASH,
    upstreamArtifactId: 'artifact-1',
    upstreamArtifactDigest: OTHER_HASH,
    ancestry: {
      upstreamApprovedHeadIsAncestor: true,
      upstreamMergedHeadIsAncestor: true,
    },
    governedBb10PathList,
    governedBb10PathListHash: semanticHash(governedBb10PathList),
    governedBb10BlobHashesAtApprovedHead: manifest,
    governedBb10BlobHashesAtCurrentHead: manifest,
    bb10SourceTreeIdentityStatus: 'BYTE_IDENTICAL',
    sameHeadBb10ReplayEvidenceHash: HASH,
    sameHeadIndependentOracleEvidenceHashes: [OTHER_HASH],
    sameHeadRegistrationCaseResults: registrationCases,
    currentChangedPaths,
    currentChangedPathsHash: semanticHash(currentChangedPaths),
    bb11AllowedWriteSetHash: HASH,
    stdoutHash: HASH,
    stderrHash: OTHER_HASH,
    deterministicReplayIdentity: HASH,
    status: AXISYMMETRIC_ADOPTION_STATUS,
    ...AXISYMMETRIC_ADOPTION_AUTHORITY_BOUNDARY,
  };
  return sealForTest(payload);
}

function rehash(value) {
  const payload = JSON.parse(JSON.stringify(value));
  delete payload.semanticHash;
  return sealForTest(payload);
}

test('BB-11 production mesh V2 is deterministic and conforming', () => {
  const geometry = createCanonicalFlangeHubGeometry();
  for (const { levelId } of FLANGE_HUB_MESH_LEVELS.slice(0, 2)) {
    const first = createFlangeHubMesh(levelId, geometry);
    const second = createFlangeHubMesh(levelId, geometry);
    assert.equal(first.meshFamilyId, FLANGE_HUB_MESH_FAMILY_ID);
    assert.equal(first.meshHash, second.meshHash);
    assert.equal(first.canonicalModelHash, second.canonicalModelHash);
    assert.equal(first.quality.accepted, true);
    assert.equal(first.duplicateInterfaceNodes.length, 0);
    assert.equal(first.meshV2Metadata.interfaceEvidence.allConforming, true);
    assert.equal(first.meshV2Metadata.interfaceEvidence.hangingNodeCount, 0);
    assert.equal(first.meshV2Metadata.probeEvidence.positiveZOwnershipVerified, true);
  }
  assert.equal(
    FLANGE_HUB_MESH_V2_POLICY.authority,
    'GOVERNED_PRODUCTION_MESH_PENDING_EXACT_HEAD',
  );
  assert.equal(FLANGE_HUB_MESH_V2_POLICY.grantsMergeAuthority, false);
  assert.equal(FLANGE_HUB_MESH_V2_POLICY.grantsBb12Authority, false);
});

test('BB-11 adoption boundary is explicit, complete and immutable', () => {
  assert.deepEqual(AXISYMMETRIC_ADOPTION_AUTHORITY_BOUNDARY, {
    axisymmetricFormulationQualified: true,
    bb11Authorized: true,
    flangeHubApplicationProcedureQualified: false,
    flangeHubNumericalOutputQualified: false,
    bb12Authorized: false,
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
    bucket01Qualified: 'UNCHANGED',
  });
  assert.equal(Object.isFrozen(AXISYMMETRIC_ADOPTION_AUTHORITY_BOUNDARY), true);
  assert.throws(() => {
    AXISYMMETRIC_ADOPTION_AUTHORITY_BOUNDARY.bb12Authorized = true;
  }, TypeError);
});

test('BB-11 adoption receipt validates only with explicit withheld authority', () => {
  const receipt = createValidAdoptionReceipt();
  assert.equal(
    validateAxisymmetricRegistrationAdoptionReceipt(receipt, {
      expectedHeadSha: HEAD_SHA,
      expectedBaseSha: BASE_SHA,
    }),
    true,
  );
  for (const field of [
    'flangeHubApplicationProcedureQualified',
    'flangeHubNumericalOutputQualified',
    'bb12Authorized',
  ]) {
    assert.throws(
      () => validateAxisymmetricRegistrationAdoptionReceipt(rehash({
        ...receipt,
        [field]: true,
      })),
      /ADOPTION_APPLICATION_AUTHORITY_FORBIDDEN/,
    );
  }
  const missing = { ...receipt };
  delete missing.flangeHubApplicationProcedureQualified;
  assert.throws(
    () => validateAxisymmetricRegistrationAdoptionReceipt(rehash(missing)),
    /ADOPTION_APPLICATION_AUTHORITY_FORBIDDEN/,
  );
  assert.throws(
    () => validateAxisymmetricRegistrationAdoptionReceipt({
      ...receipt,
      bb12Authorized: true,
    }),
    /SCHEMA_OR_SEMANTIC_HASH_INVALID/,
  );
});

test('BB-11 approval is the first creator permitted to grant application authority', () => {
  const adoptionReceipt = createValidAdoptionReceipt();
  const approval = createBb11FlangeHubApproval({
    exactHeadSha: HEAD_SHA,
    baseSha: BASE_SHA,
    adoptionReceipt,
    geometryEvidenceHash: HASH,
    meshEvidenceHash: HASH,
    coreEvidenceHash: HASH,
    outputEvidenceHash: HASH,
    independentCheckerEvidenceHash: OTHER_HASH,
    sourceArtifactHashes: [HASH],
    rawEvidenceHashes: [HASH],
    semanticEvidenceHashes: [OTHER_HASH],
    changedPaths: [{
      status: 'M',
      path: 'src/core/bucket-b/flange-hub-authority.js',
    }],
    checkResults: [{
      checkId: 'BB11_AUTHORITY_BOUNDARY_REGRESSION',
      status: 'PASS',
      evidenceHash: HASH,
    }],
    applicationProcedureAccepted: true,
    numericalOutputAccepted: true,
  });
  assert.equal(approval.flangeHubApplicationProcedureQualified, true);
  assert.equal(approval.flangeHubNumericalOutputQualified, true);
  assert.equal(approval.bb12Authorized, true);
  assert.equal(approval.codeAssessmentQualified, false);
  assert.equal(approval.moduleQualified, false);
  assert.equal(approval.applicationModulePromoted, false);
  assert.equal(approval.productionSwitchAuthorized, false);
  assert.equal(approval.bucket01Qualified, 'UNCHANGED');
  assert.equal(
    validateBb11FlangeHubApproval(approval, {
      expectedHeadSha: HEAD_SHA,
      expectedBaseSha: BASE_SHA,
    }),
    true,
  );
  assert.throws(
    () => validateBb11FlangeHubApproval(rehash({
      ...approval,
      moduleQualified: true,
    })),
    /FORBIDDEN_AUTHORITY_SET/,
  );
});
