import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { validateBb10AxisymmetricRegistrationReport } from './axisymmetric-registration.js';

export const AXISYMMETRIC_ADOPTION_RECEIPT_SCHEMA =
  'bucket-b-axisymmetric-registration-adoption-receipt/v1';
export const BB11_FLANGE_HUB_APPROVAL_SCHEMA =
  'bucket-b-bb11-flange-hub-approval/v1';
export const BB11_FLANGE_HUB_REPORT_SCHEMA =
  'bucket-b-bb11-flange-hub-report/v1';
export const AXISYMMETRIC_ADOPTION_STATUS = 'AXISYMMETRIC_REGISTRATION_ADOPTED';
export const BB11_QUALIFIED_STATUS = 'BB11_FLANGE_HUB_QUALIFIED';

export const AXISYMMETRIC_ADOPTION_AUTHORITY_BOUNDARY = deepFreeze({
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

const REQUIRED_REGISTRATION_CASES = Object.freeze([
  'AXI-Q8-REG-001-A',
  'AXI-Q8-REG-001-B',
  'AXI-Q8-REG-001-C',
]);

export function createAxisymmetricRegistrationAdoptionReceipt({
  currentExactHeadSha,
  currentBaseSha,
  currentMergeBaseSha,
  upstreamBb10Report,
  upstreamBb10ReportRawSha256,
  upstreamArtifactId,
  upstreamArtifactDigest,
  governedBb10PathList,
  governedBb10BlobHashesAtApprovedHead,
  governedBb10BlobHashesAtCurrentHead,
  sameHeadBb10ReplayEvidence,
  sameHeadIndependentOracleEvidenceHashes,
  currentChangedPaths,
  bb11AllowedWriteSetHash,
  stdoutHash,
  stderrHash,
  deterministicReplayIdentity,
  ancestry,
} = {}) {
  requireGitSha(currentExactHeadSha, 'currentExactHeadSha');
  requireGitSha(currentBaseSha, 'currentBaseSha');
  requireGitSha(currentMergeBaseSha, 'currentMergeBaseSha');
  if (currentBaseSha !== currentMergeBaseSha) throw new TypeError('BB11_ADOPTION_LIVE_BASE_MISMATCH');
  validateBb10AxisymmetricRegistrationReport(upstreamBb10Report);
  validateRetainedBb10Authority(upstreamBb10Report);
  requireHash(upstreamBb10ReportRawSha256, 'upstreamBb10ReportRawSha256');
  requireText(upstreamArtifactId, 'upstreamArtifactId');
  requireHash(upstreamArtifactDigest, 'upstreamArtifactDigest');
  const paths = requireSortedUniquePaths(governedBb10PathList, 'governedBb10PathList');
  const approvedManifest = requireBlobManifest(governedBb10BlobHashesAtApprovedHead, paths);
  const currentManifest = requireBlobManifest(governedBb10BlobHashesAtCurrentHead, paths);
  requireByteIdenticalManifests(approvedManifest, currentManifest);
  const replay = requireSameHeadReplay(sameHeadBb10ReplayEvidence, currentExactHeadSha, currentBaseSha);
  const oracleHashes = requireHashArray(sameHeadIndependentOracleEvidenceHashes, 'sameHeadIndependentOracleEvidenceHashes');
  const changedPaths = requireChangedPaths(currentChangedPaths);
  requireHash(bb11AllowedWriteSetHash, 'bb11AllowedWriteSetHash');
  requireHash(stdoutHash, 'stdoutHash');
  requireHash(stderrHash, 'stderrHash');
  requireHash(deterministicReplayIdentity, 'deterministicReplayIdentity');
  requireAncestry(ancestry);

  const payload = {
    schema: AXISYMMETRIC_ADOPTION_RECEIPT_SCHEMA,
    moduleId: 'C2D-FLANGE-HUB',
    currentExactHeadSha,
    currentBaseSha,
    currentMergeBaseSha,
    upstreamBb10ApprovedHeadSha: upstreamBb10Report.exactHeadSha,
    upstreamBb10MergedHeadSha: ancestry.upstreamMergedHeadSha,
    upstreamBb10ApprovalSemanticHash: upstreamBb10Report.approvalReceipt.semanticHash,
    upstreamBb10ReportSemanticHash: upstreamBb10Report.semanticHash,
    upstreamBb10ReportRawSha256,
    upstreamArtifactId,
    upstreamArtifactDigest,
    ancestry: {
      upstreamApprovedHeadIsAncestor: true,
      upstreamMergedHeadIsAncestor: true,
    },
    governedBb10PathList: paths,
    governedBb10PathListHash: semanticHash(paths),
    governedBb10BlobHashesAtApprovedHead: approvedManifest,
    governedBb10BlobHashesAtCurrentHead: currentManifest,
    bb10SourceTreeIdentityStatus: 'BYTE_IDENTICAL',
    sameHeadBb10ReplayEvidenceHash: replay.semanticHash,
    sameHeadIndependentOracleEvidenceHashes: oracleHashes,
    sameHeadRegistrationCaseResults: replay.registrationCases,
    currentChangedPaths: changedPaths,
    currentChangedPathsHash: semanticHash(changedPaths),
    bb11AllowedWriteSetHash,
    stdoutHash,
    stderrHash,
    deterministicReplayIdentity,
    status: AXISYMMETRIC_ADOPTION_STATUS,
    ...AXISYMMETRIC_ADOPTION_AUTHORITY_BOUNDARY,
  };
  return seal(payload);
}

export function validateAxisymmetricRegistrationAdoptionReceipt(value, {
  expectedModuleId = 'C2D-FLANGE-HUB',
  expectedHeadSha,
  expectedBaseSha,
} = {}) {
  requireSchemaAndHash(value, AXISYMMETRIC_ADOPTION_RECEIPT_SCHEMA);
  if (value.moduleId !== expectedModuleId || expectedModuleId !== 'C2D-FLANGE-HUB') {
    throw new TypeError('BB11_ADOPTION_MODULE_AUTHORITY_INVALID');
  }
  requireGitSha(value.currentExactHeadSha, 'currentExactHeadSha');
  requireGitSha(value.currentBaseSha, 'currentBaseSha');
  requireGitSha(value.currentMergeBaseSha, 'currentMergeBaseSha');
  if (expectedHeadSha && value.currentExactHeadSha !== expectedHeadSha) throw new TypeError('BB11_ADOPTION_STALE_HEAD');
  if (expectedBaseSha && value.currentBaseSha !== expectedBaseSha) throw new TypeError('BB11_ADOPTION_WRONG_BASE');
  if (value.currentBaseSha !== value.currentMergeBaseSha) throw new TypeError('BB11_ADOPTION_MERGE_BASE_MISMATCH');
  requireGitSha(value.upstreamBb10ApprovedHeadSha, 'upstreamBb10ApprovedHeadSha');
  requireGitSha(value.upstreamBb10MergedHeadSha, 'upstreamBb10MergedHeadSha');
  requireHash(value.upstreamBb10ApprovalSemanticHash, 'upstreamBb10ApprovalSemanticHash');
  requireHash(value.upstreamBb10ReportSemanticHash, 'upstreamBb10ReportSemanticHash');
  requireHash(value.upstreamBb10ReportRawSha256, 'upstreamBb10ReportRawSha256');
  requireText(value.upstreamArtifactId, 'upstreamArtifactId');
  requireHash(value.upstreamArtifactDigest, 'upstreamArtifactDigest');
  const paths = requireSortedUniquePaths(value.governedBb10PathList, 'governedBb10PathList');
  if (value.governedBb10PathListHash !== semanticHash(paths)) throw new TypeError('BB11_ADOPTION_PATH_LIST_HASH_MISMATCH');
  const approved = requireBlobManifest(value.governedBb10BlobHashesAtApprovedHead, paths);
  const current = requireBlobManifest(value.governedBb10BlobHashesAtCurrentHead, paths);
  requireByteIdenticalManifests(approved, current);
  if (value.bb10SourceTreeIdentityStatus !== 'BYTE_IDENTICAL') throw new TypeError('BB11_ADOPTION_BB10_SOURCE_DRIFT');
  requireHash(value.sameHeadBb10ReplayEvidenceHash, 'sameHeadBb10ReplayEvidenceHash');
  requireHashArray(value.sameHeadIndependentOracleEvidenceHashes, 'sameHeadIndependentOracleEvidenceHashes');
  requireRegistrationCases(value.sameHeadRegistrationCaseResults);
  const changedPaths = requireChangedPaths(value.currentChangedPaths);
  if (value.currentChangedPathsHash !== semanticHash(changedPaths)) throw new TypeError('BB11_ADOPTION_CHANGED_PATH_HASH_MISMATCH');
  requireHash(value.bb11AllowedWriteSetHash, 'bb11AllowedWriteSetHash');
  requireHash(value.stdoutHash, 'stdoutHash');
  requireHash(value.stderrHash, 'stderrHash');
  requireHash(value.deterministicReplayIdentity, 'deterministicReplayIdentity');
  if (value.ancestry?.upstreamApprovedHeadIsAncestor !== true
    || value.ancestry?.upstreamMergedHeadIsAncestor !== true) throw new TypeError('BB11_ADOPTION_ANCESTRY_INVALID');
  if (value.status !== AXISYMMETRIC_ADOPTION_STATUS
    || value.axisymmetricFormulationQualified !== true
    || value.bb11Authorized !== true) throw new TypeError('BB11_ADOPTION_NOT_QUALIFIED');
  validateFalseAuthority(value);
  return true;
}

export function createBb11FlangeHubApproval({
  exactHeadSha,
  baseSha,
  adoptionReceipt,
  geometryEvidenceHash,
  meshEvidenceHash,
  coreEvidenceHash,
  outputEvidenceHash,
  independentCheckerEvidenceHash,
  sourceArtifactHashes,
  rawEvidenceHashes,
  semanticEvidenceHashes,
  changedPaths,
  checkResults,
  applicationProcedureAccepted,
  numericalOutputAccepted,
} = {}) {
  requireGitSha(exactHeadSha, 'exactHeadSha');
  requireGitSha(baseSha, 'baseSha');
  validateAxisymmetricRegistrationAdoptionReceipt(adoptionReceipt, {
    expectedHeadSha: exactHeadSha,
    expectedBaseSha: baseSha,
  });
  [geometryEvidenceHash, meshEvidenceHash, coreEvidenceHash, outputEvidenceHash, independentCheckerEvidenceHash]
    .forEach((value, index) => requireHash(value, `evidenceHash${index}`));
  const sources = requireHashArray(sourceArtifactHashes, 'sourceArtifactHashes');
  const raw = requireHashArray(rawEvidenceHashes, 'rawEvidenceHashes');
  const semantic = requireHashArray(semanticEvidenceHashes, 'semanticEvidenceHashes');
  const paths = requireChangedPaths(changedPaths);
  const checks = requirePassChecks(checkResults);
  if (applicationProcedureAccepted !== true || numericalOutputAccepted !== true) {
    throw new TypeError('BB11_APPROVAL_QUALIFICATION_EVIDENCE_NOT_ACCEPTED');
  }
  const payload = {
    schema: BB11_FLANGE_HUB_APPROVAL_SCHEMA,
    moduleId: 'C2D-FLANGE-HUB',
    exactHeadSha,
    baseSha,
    formulationProfile: 'AXISYMMETRIC',
    elementProfile: 'AXI_Q8_FULL_3X3',
    recoveryProfileId: 'AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1',
    loadIntegrationProfileId: 'AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1',
    adoptionReceiptHash: adoptionReceipt.semanticHash,
    geometryEvidenceHash,
    meshEvidenceHash,
    coreEvidenceHash,
    outputEvidenceHash,
    independentCheckerEvidenceHash,
    sourceArtifactHashes: sources,
    rawEvidenceHashes: raw,
    semanticEvidenceHashes: semantic,
    changedPaths: paths,
    checkResults: checks,
    status: BB11_QUALIFIED_STATUS,
    flangeHubApplicationProcedureQualified: true,
    flangeHubNumericalOutputQualified: true,
    bb12Authorized: true,
    ...retainedFalseAuthority(),
  };
  return seal(payload);
}

export function validateBb11FlangeHubApproval(value, { expectedHeadSha, expectedBaseSha } = {}) {
  requireSchemaAndHash(value, BB11_FLANGE_HUB_APPROVAL_SCHEMA);
  if (value.moduleId !== 'C2D-FLANGE-HUB') throw new TypeError('BB11_APPROVAL_MODULE_INVALID');
  if (expectedHeadSha && value.exactHeadSha !== expectedHeadSha) throw new TypeError('BB11_APPROVAL_STALE_HEAD');
  if (expectedBaseSha && value.baseSha !== expectedBaseSha) throw new TypeError('BB11_APPROVAL_WRONG_BASE');
  requireGitSha(value.exactHeadSha, 'exactHeadSha');
  requireGitSha(value.baseSha, 'baseSha');
  if (value.formulationProfile !== 'AXISYMMETRIC'
    || value.elementProfile !== 'AXI_Q8_FULL_3X3'
    || value.recoveryProfileId !== 'AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1'
    || value.loadIntegrationProfileId !== 'AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1') {
    throw new TypeError('BB11_APPROVAL_PROFILE_INVALID');
  }
  ['adoptionReceiptHash', 'geometryEvidenceHash', 'meshEvidenceHash', 'coreEvidenceHash', 'outputEvidenceHash', 'independentCheckerEvidenceHash']
    .forEach((key) => requireHash(value[key], key));
  requireHashArray(value.sourceArtifactHashes, 'sourceArtifactHashes');
  requireHashArray(value.rawEvidenceHashes, 'rawEvidenceHashes');
  requireHashArray(value.semanticEvidenceHashes, 'semanticEvidenceHashes');
  requireChangedPaths(value.changedPaths);
  requirePassChecks(value.checkResults);
  if (value.status !== BB11_QUALIFIED_STATUS
    || value.flangeHubApplicationProcedureQualified !== true
    || value.flangeHubNumericalOutputQualified !== true
    || value.bb12Authorized !== true) throw new TypeError('BB11_APPROVAL_NOT_QUALIFIED');
  validateFalseAuthority(value);
  return true;
}

export function createBb11FlangeHubReport({
  exactHeadSha,
  baseSha,
  mergeBaseSha,
  currentMainSha,
  commitsBehindMain,
  approval,
  prerequisiteReportHashes,
  artifactId,
  artifactDigest,
  checkResults,
  limitations,
  replay,
} = {}) {
  validateBb11FlangeHubApproval(approval, { expectedHeadSha: exactHeadSha, expectedBaseSha: baseSha });
  requireGitSha(mergeBaseSha, 'mergeBaseSha');
  requireGitSha(currentMainSha, 'currentMainSha');
  if (baseSha !== mergeBaseSha || baseSha !== currentMainSha) throw new TypeError('BB11_REPORT_BASE_NOT_CURRENT_MAIN');
  if (commitsBehindMain !== 0) throw new TypeError('BB11_REPORT_BRANCH_BEHIND_MAIN');
  const prerequisites = requireHashRecord(prerequisiteReportHashes, 'prerequisiteReportHashes');
  requireText(artifactId, 'artifactId');
  requireHash(artifactDigest, 'artifactDigest');
  const checks = requirePassChecks(checkResults);
  if (!Array.isArray(limitations) || limitations.length === 0 || limitations.some((row) => typeof row !== 'string' || !row)) {
    throw new TypeError('BB11_REPORT_LIMITATIONS_REQUIRED');
  }
  requireReplay(replay);
  const payload = {
    schema: BB11_FLANGE_HUB_REPORT_SCHEMA,
    moduleId: 'C2D-FLANGE-HUB',
    exactHeadSha,
    baseSha,
    mergeBaseSha,
    currentMainSha,
    commitsBehindMain: 0,
    approvalHash: approval.semanticHash,
    prerequisiteReportHashes: prerequisites,
    artifactId,
    artifactDigest,
    checkResults: checks,
    replay,
    status: BB11_QUALIFIED_STATUS,
    flangeHubApplicationProcedureQualified: true,
    flangeHubNumericalOutputQualified: true,
    bb12Authorized: true,
    ...retainedFalseAuthority(),
    limitations: [...limitations],
  };
  return seal(payload);
}

export function validateBb11FlangeHubReport(value, { expectedHeadSha, expectedBaseSha } = {}) {
  requireSchemaAndHash(value, BB11_FLANGE_HUB_REPORT_SCHEMA);
  if (value.moduleId !== 'C2D-FLANGE-HUB') throw new TypeError('BB11_REPORT_MODULE_INVALID');
  if (expectedHeadSha && value.exactHeadSha !== expectedHeadSha) throw new TypeError('BB11_REPORT_STALE_HEAD');
  if (expectedBaseSha && value.baseSha !== expectedBaseSha) throw new TypeError('BB11_REPORT_WRONG_BASE');
  requireGitSha(value.exactHeadSha, 'exactHeadSha');
  requireGitSha(value.baseSha, 'baseSha');
  requireGitSha(value.mergeBaseSha, 'mergeBaseSha');
  requireGitSha(value.currentMainSha, 'currentMainSha');
  if (value.baseSha !== value.mergeBaseSha || value.baseSha !== value.currentMainSha || value.commitsBehindMain !== 0) {
    throw new TypeError('BB11_REPORT_BASE_CUSTODY_INVALID');
  }
  requireHash(value.approvalHash, 'approvalHash');
  requireHashRecord(value.prerequisiteReportHashes, 'prerequisiteReportHashes');
  requireText(value.artifactId, 'artifactId');
  requireHash(value.artifactDigest, 'artifactDigest');
  requirePassChecks(value.checkResults);
  requireReplay(value.replay);
  if (!Array.isArray(value.limitations) || value.limitations.length === 0) throw new TypeError('BB11_REPORT_LIMITATIONS_REQUIRED');
  if (value.status !== BB11_QUALIFIED_STATUS
    || value.flangeHubApplicationProcedureQualified !== true
    || value.flangeHubNumericalOutputQualified !== true
    || value.bb12Authorized !== true) throw new TypeError('BB11_REPORT_NOT_QUALIFIED');
  validateFalseAuthority(value);
  return true;
}

function requireSameHeadReplay(value, head, base) {
  if (!value || value.schema !== 'bucket-b-bb10-same-head-registration-replay-evidence/v1') {
    throw new TypeError('BB11_SAME_HEAD_BB10_REPLAY_REQUIRED');
  }
  requireSchemaAndHash(value, value.schema);
  if (value.currentExactHeadSha !== head) throw new TypeError('BB11_SAME_HEAD_REPLAY_STALE_HEAD');
  if (value.currentBaseSha !== base) throw new TypeError('BB11_SAME_HEAD_REPLAY_WRONG_BASE');
  requireRegistrationCases(value.registrationCases);
  requireHashArray(value.productionReplayEvidenceHashes, 'productionReplayEvidenceHashes');
  requireHashArray(value.independentOracleEvidenceHashes, 'independentOracleEvidenceHashes');
  if (value.status !== 'PASS') throw new TypeError('BB11_SAME_HEAD_REPLAY_NOT_PASS');
  return value;
}
function requireRegistrationCases(rows) {
  if (!Array.isArray(rows) || rows.length !== REQUIRED_REGISTRATION_CASES.length) throw new TypeError('BB11_REGISTRATION_CASES_REQUIRED');
  const byId = new Map(rows.map((row) => [row?.caseId, row]));
  REQUIRED_REGISTRATION_CASES.forEach((caseId) => {
    const row = byId.get(caseId);
    if (!row || row.status !== 'PASS' || !isHash(row.semanticEvidenceHash) || !isHash(row.rawEvidenceHash)) {
      throw new TypeError(`BB11_REGISTRATION_CASE_INVALID:${caseId}`);
    }
  });
  return rows;
}
function validateRetainedBb10Authority(report) {
  if (report.bb11Authorized !== true
    || report.flangeHubApplicationQualified !== false
    || report.flangeHubNumericalOutputQualified !== false
    || report.codeAssessmentQualified !== false
    || report.moduleQualified !== false
    || report.applicationModulePromoted !== false
    || report.productionSwitchAuthorized !== false
    || report.bucket01Qualified !== 'UNCHANGED') {
    throw new TypeError('BB11_UPSTREAM_BB10_AUTHORITY_INVALID');
  }
}
function retainedFalseAuthority() {
  return {
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
    bucket01Qualified: 'UNCHANGED',
  };
}
function validateFalseAuthority(value) {
  if (value.codeAssessmentQualified !== false
    || value.moduleQualified !== false
    || value.applicationModulePromoted !== false
    || value.productionSwitchAuthorized !== false
    || value.bucket01Qualified !== 'UNCHANGED') {
    throw new TypeError('BB11_FORBIDDEN_AUTHORITY_SET');
  }
  if (value.schema === AXISYMMETRIC_ADOPTION_RECEIPT_SCHEMA
    && (value.flangeHubApplicationProcedureQualified !== false
      || value.flangeHubNumericalOutputQualified !== false
      || value.bb12Authorized !== false)) {
    throw new TypeError('BB11_ADOPTION_APPLICATION_AUTHORITY_FORBIDDEN');
  }
}
function requireBlobManifest(rows, expectedPaths) {
  if (!Array.isArray(rows) || rows.length !== expectedPaths.length) throw new TypeError('BB11_BLOB_MANIFEST_INCOMPLETE');
  const normalized = [...rows].map((row) => {
    requireText(row?.path, 'blob.path');
    if (!expectedPaths.includes(row.path)) throw new TypeError(`BB11_BLOB_PATH_UNGOVERNED:${row.path}`);
    requireGitObjectId(row.gitBlobOid, 'gitBlobOid');
    requireHash(row.rawSha256, 'rawSha256');
    if (!['100644', '100755'].includes(String(row.fileMode))) throw new TypeError('BB11_BLOB_FILE_MODE_INVALID');
    return { path: row.path, gitBlobOid: row.gitBlobOid, rawSha256: row.rawSha256, fileMode: String(row.fileMode) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(normalized.map((row) => row.path)).size !== normalized.length) throw new TypeError('BB11_BLOB_MANIFEST_DUPLICATE_PATH');
  expectedPaths.forEach((path, index) => { if (normalized[index].path !== path) throw new TypeError('BB11_BLOB_MANIFEST_PATH_ORDER_INVALID'); });
  return normalized;
}
function requireByteIdenticalManifests(left, right) {
  if (left.length !== right.length) throw new TypeError('BB11_BB10_BLOB_COUNT_MISMATCH');
  left.forEach((row, index) => {
    const other = right[index];
    if (row.path !== other.path || row.gitBlobOid !== other.gitBlobOid
      || row.rawSha256 !== other.rawSha256 || row.fileMode !== other.fileMode) {
      throw new TypeError(`BB11_BB10_SOURCE_BLOB_DRIFT:${row.path}`);
    }
  });
}
function requireAncestry(value) {
  if (value?.upstreamApprovedHeadIsAncestor !== true || value?.upstreamMergedHeadIsAncestor !== true) {
    throw new TypeError('BB11_UPSTREAM_ANCESTRY_REQUIRED');
  }
  requireGitSha(value.upstreamMergedHeadSha, 'upstreamMergedHeadSha');
}
function requireChangedPaths(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new TypeError('BB11_CHANGED_PATHS_REQUIRED');
  const normalized = rows.map((row) => {
    requireText(row?.path, 'changedPath.path');
    if (!['A', 'M', 'D', 'R'].includes(row.status)) throw new TypeError('BB11_CHANGED_PATH_STATUS_INVALID');
    return row.status === 'R'
      ? { status: 'R', oldPath: requireText(row.oldPath, 'changedPath.oldPath'), path: row.path }
      : { status: row.status, path: row.path };
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(normalized.map((row) => row.path)).size !== normalized.length) throw new TypeError('BB11_CHANGED_PATH_DUPLICATE');
  return normalized;
}
function requirePassChecks(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new TypeError('BB11_CHECK_RESULTS_REQUIRED');
  const normalized = rows.map((row) => {
    requireText(row?.checkId, 'checkId');
    if (row.status !== 'PASS') throw new TypeError(`BB11_CHECK_NOT_PASS:${row.checkId}`);
    requireHash(row.evidenceHash, 'evidenceHash');
    return { checkId: row.checkId, status: 'PASS', evidenceHash: row.evidenceHash };
  }).sort((a, b) => a.checkId.localeCompare(b.checkId));
  if (new Set(normalized.map((row) => row.checkId)).size !== normalized.length) throw new TypeError('BB11_DUPLICATE_CHECK_ID');
  return normalized;
}
function requireReplay(value) {
  if (!value || value.byteIdentical !== true) throw new TypeError('BB11_BYTE_IDENTICAL_REPLAY_REQUIRED');
  ['identityHash', 'runAArtifactManifestHash', 'runBArtifactManifestHash', 'stdoutHashA', 'stdoutHashB', 'stderrHashA', 'stderrHashB']
    .forEach((key) => requireHash(value[key], key));
  if (value.runAArtifactManifestHash !== value.runBArtifactManifestHash
    || value.stdoutHashA !== value.stdoutHashB || value.stderrHashA !== value.stderrHashB) {
    throw new TypeError('BB11_REPLAY_HASH_MISMATCH');
  }
}
function requireHashRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) throw new TypeError(`BB11_${label.toUpperCase()}_REQUIRED`);
  const result = {};
  Object.keys(value).sort().forEach((key) => { requireHash(value[key], `${label}.${key}`); result[key] = value[key]; });
  return result;
}
function requireSortedUniquePaths(rows, label) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => typeof row !== 'string' || !row)) throw new TypeError(`BB11_${label.toUpperCase()}_REQUIRED`);
  const sorted = [...rows].sort();
  if (new Set(sorted).size !== sorted.length) throw new TypeError(`BB11_${label.toUpperCase()}_DUPLICATE`);
  return sorted;
}
function requireHashArray(rows, label) { if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => !isHash(row))) throw new TypeError(`BB11_${label.toUpperCase()}_INVALID`); return [...rows]; }
function requireSchemaAndHash(value, schema) { if (!value || value.schema !== schema || value.semanticHash !== semanticHash(withoutHash(value))) throw new TypeError('BB11_SCHEMA_OR_SEMANTIC_HASH_INVALID'); }
function seal(payload) { const clean = clone(payload); delete clean.semanticHash; return deepFreeze({ ...clean, semanticHash: semanticHash(clean) }); }
function withoutHash(value) { const clean = clone(value); delete clean.semanticHash; return clean; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function requireGitSha(value, label) { if (typeof value !== 'string' || !/^[0-9a-f]{40}$/iu.test(value)) throw new TypeError(`BB11_INVALID_${label.toUpperCase()}`); }
function requireGitObjectId(value, label) { requireGitSha(value, label); }
function requireHash(value, label) { if (!isHash(value)) throw new TypeError(`BB11_INVALID_${label.toUpperCase()}`); }
function isHash(value) { return typeof value === 'string' && /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/iu.test(value); }
function requireText(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`BB11_INVALID_${label.toUpperCase()}`); return value; }
