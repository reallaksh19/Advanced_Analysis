import { clonePlain, sealWithHash } from './contracts.js';

export const REAL_MODULE_NEGATIVE_CONTROL_IDS = Object.freeze([
  'SYNTHETIC_VERSION_REJECTED',
  'UNSIGNED_ARTIFACT_REJECTED',
  'INVALID_SIGNATURE_REJECTED',
  'PROVENANCE_MISSING_REJECTED',
  'SOURCE_TREE_MISMATCH_REJECTED',
  'SBOM_MISMATCH_REJECTED',
  'DEPENDENCY_LOCK_MISMATCH_REJECTED',
  'UNAPPROVED_DEPENDENCY_REJECTED',
  'IMPLICIT_MIGRATION_REJECTED',
  'FAILED_REFERENCE_REGRESSION_REJECTED',
  'RESOURCE_LIMIT_VIOLATION_REJECTED',
  'CRITICAL_SECURITY_FINDING_REJECTED',
  'SIMULATED_APPROVAL_REJECTED',
  'MISSING_TECHNICAL_APPROVAL_REJECTED',
  'MISSING_OWNER_APPROVAL_REJECTED',
  'MISSING_SECURITY_APPROVAL_REJECTED',
  'EXPIRED_APPROVAL_REJECTED',
  'REVOKED_APPROVAL_REJECTED',
  'CALLER_AUTHORITY_ESCALATION_REJECTED',
  'SYNTHETIC_RECEIPT_ONLY_REJECTED',
]);

export function createRealModuleNegativeControls(baseline) {
  const controls = [];
  const add = (id, mutate) => {
    const input = clonePlain(baseline);
    mutate(input);
    controls.push(Object.freeze({ id, input }));
  };
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[0], (x) => {
    const r = clonePlain(x.moduleRecord); delete r.moduleRecordHash; r.moduleVersion = '1.0.0-synthetic'; x.moduleRecord = sealWithHash(r, 'moduleRecordHash');
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[1], (x) => {
    const r = clonePlain(x.moduleRecord); delete r.moduleRecordHash; r.artifactSigned = false; x.moduleRecord = sealWithHash(r, 'moduleRecordHash');
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[2], (x) => {
    const r = clonePlain(x.moduleRecord); delete r.moduleRecordHash; r.signatureVerified = false; x.moduleRecord = sealWithHash(r, 'moduleRecordHash');
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[3], (x) => {
    const r = clonePlain(x.moduleRecord); delete r.moduleRecordHash; r.provenanceVerified = false; x.moduleRecord = sealWithHash(r, 'moduleRecordHash');
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[4], (x) => {
    const r = clonePlain(x.moduleRecord); delete r.moduleRecordHash; r.exactHeadSha = '1'.repeat(40); x.moduleRecord = sealWithHash(r, 'moduleRecordHash');
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[5], (x) => {
    const r = clonePlain(x.moduleRecord); delete r.moduleRecordHash; r.sbomVerified = false; x.moduleRecord = sealWithHash(r, 'moduleRecordHash');
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[6], (x) => {
    const r = clonePlain(x.moduleRecord); delete r.moduleRecordHash; r.dependencyLockVerified = false; x.moduleRecord = sealWithHash(r, 'moduleRecordHash');
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[7], (x) => { mutateMetric(x, 3, 'unapprovedDependencyCount', 1); });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[8], (x) => { mutateMetric(x, 4, 'implicitMigrationCount', 1); });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[9], (x) => { mutateMetric(x, 5, 'regressionFailureCount', 1); });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[10], (x) => { mutateMetric(x, 6, 'resourceLimitViolationCount', 1); });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[11], (x) => { mutateMetric(x, 6, 'criticalSecurityFindingCount', 1); });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[12], (x) => {
    const r = clonePlain(x.releaseApproval); delete r.releaseApprovalHash; r.simulatedApproval = true; x.releaseApproval = sealWithHash(r, 'releaseApprovalHash'); rebindEvidence(x);
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[13], (x) => {
    const r = clonePlain(x.releaseApproval); delete r.releaseApprovalHash; r.technicalReviewApproved = false; x.releaseApproval = sealWithHash(r, 'releaseApprovalHash'); rebindEvidence(x);
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[14], (x) => {
    const r = clonePlain(x.releaseApproval); delete r.releaseApprovalHash; r.ownerReleaseApproved = false; x.releaseApproval = sealWithHash(r, 'releaseApprovalHash'); rebindEvidence(x);
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[15], (x) => {
    const r = clonePlain(x.releaseApproval); delete r.releaseApprovalHash; r.securityReviewApproved = false; x.releaseApproval = sealWithHash(r, 'releaseApprovalHash'); rebindEvidence(x);
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[16], (x) => {
    const r = clonePlain(x.releaseApproval); delete r.releaseApprovalHash; r.approvalExpired = true; x.releaseApproval = sealWithHash(r, 'releaseApprovalHash'); rebindEvidence(x);
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[17], (x) => {
    const r = clonePlain(x.releaseApproval); delete r.releaseApprovalHash; r.approvalRevoked = true; x.releaseApproval = sealWithHash(r, 'releaseApprovalHash'); rebindEvidence(x);
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[18], (x) => {
    x.domainEvidence.push({ ...x.domainEvidence[0], id: 'CALLER_SUPPLIED_moduleQualified_TRUE', evidenceHash: x.domainEvidence[0].evidenceHash });
  });
  add(REAL_MODULE_NEGATIVE_CONTROL_IDS[19], (x) => { x.moduleRecord = null; });
  return Object.freeze(controls);
}

function mutateMetric(input, evidenceIndex, key, value) {
  const row = clonePlain(input.domainEvidence[evidenceIndex]);
  delete row.evidenceHash;
  row.metrics[key] = value;
  input.domainEvidence[evidenceIndex] = sealWithHash(row, 'evidenceHash');
}

function rebindEvidence(input) {
  input.domainEvidence = input.domainEvidence.map((row) => {
    const next = clonePlain(row);
    delete next.evidenceHash;
    next.releaseApprovalHash = input.releaseApproval.releaseApprovalHash;
    return sealWithHash(next, 'evidenceHash');
  });
}
