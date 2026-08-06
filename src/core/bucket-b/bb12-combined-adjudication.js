import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';

export const BB12_COMBINED_EVIDENCE_SCHEMA =
  'bucket-b-bb12-combined-adjudication-evidence/v1';
export const BB12_COMBINED_APPROVAL_SCHEMA =
  'bucket-b-bb12-combined-adjudication-approval/v1';
export const BB12_COMBINED_REPORT_SCHEMA =
  'bucket-b-bb12-combined-adjudication-report/v1';
export const BB12_QUALIFIED_STATUS =
  'BB12_BUCKET_B_PROGRAMME_ADJUDICATED';

export const BB12_REQUIRED_PACKAGE_IDS = Object.freeze([
  'BB00-BB05',
  'BB06',
  'BB07',
  'BB08',
  'BB09',
  'BB10',
  'BB11',
]);

export const BB12_GOVERNED_PATHS = Object.freeze([
  '.github/workflows/bucket-b-bb12-combined-adjudication.yml',
  'docs/Bucket_B_BB12_Combined_Adjudication_Record.md',
  'docs/LAFEA_BB12_Combined_Adjudication_Qualification_and_Work_Pack.md',
  'src/core/bucket-b/bb12-check.mjs',
  'src/core/bucket-b/bb12-combined-adjudication.js',
  'src/core/bucket-b/index.js',
  'tests/bucket-b-bb12-combined-adjudication.test.mjs',
]);

export const BB12_REQUIRED_MODULE_IDS = Object.freeze([
  'C2D-LUG-PINHOLE',
  'C2D-CLAMP-EAR',
  'C2D-BRACKET-GUSSET',
  'C2D-PIPE-PAD-SECTION',
  'C2D-NOZZLE-REPAD-SECTION',
  'C2D-FLANGE-HUB',
]);

export const BB12_WITHHELD_AUTHORITY_BOUNDARY = deepFreeze({
  codeAssessmentQualified: false,
  moduleQualified: false,
  applicationModulePromoted: false,
  productionSwitchAuthorized: false,
  bucket01Qualified: 'UNCHANGED',
});

const EXPECTED_MODULE_PROFILES = deepFreeze({
  'C2D-LUG-PINHOLE': ['PLANE_STRESS', 'Q8_FULL_3X3'],
  'C2D-CLAMP-EAR': ['PLANE_STRESS', 'Q8_FULL_3X3'],
  'C2D-BRACKET-GUSSET': ['PLANE_STRESS', 'Q8_FULL_3X3'],
  'C2D-PIPE-PAD-SECTION': ['PLANE_STRAIN', 'Q8_FULL_3X3'],
  'C2D-NOZZLE-REPAD-SECTION': ['PLANE_STRAIN', 'Q8_FULL_3X3'],
  'C2D-FLANGE-HUB': ['AXISYMMETRIC', 'AXI_Q8_FULL_3X3'],
});

export function validateBucketBRegistryForBb12(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new TypeError('BB12_REGISTRY_REQUIRED');
  }
  const observed = Object.keys(registry).sort();
  const expected = [...BB12_REQUIRED_MODULE_IDS].sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new TypeError('BB12_REGISTRY_MODULE_SET_MISMATCH');
  }
  expected.forEach((moduleId) => {
    const row = registry[moduleId];
    const [formulationProfile, elementProfile] = EXPECTED_MODULE_PROFILES[moduleId];
    if (row?.moduleId !== moduleId
      || row.formulationProfile !== formulationProfile
      || row.elementProfile !== elementProfile) {
      throw new TypeError(`BB12_REGISTRY_PROFILE_MISMATCH:${moduleId}`);
    }
    if (!Array.isArray(row.requiredRecords) || row.requiredRecords.length !== 3) {
      throw new TypeError(`BB12_REGISTRY_RECORD_SET_INVALID:${moduleId}`);
    }
  });
  return true;
}

export function createBb12CombinedEvidence({
  exactHeadSha,
  baseSha,
  packageReceipts,
  moduleReceipts,
  retainedArtifactCustody,
  registrySnapshotHash,
  roadmapAssertions,
  checkResults,
  registry,
} = {}) {
  requireGitSha(exactHeadSha, 'exactHeadSha');
  requireGitSha(baseSha, 'baseSha');
  validateBucketBRegistryForBb12(registry);
  requireHash(registrySnapshotHash, 'registrySnapshotHash');
  if (registrySnapshotHash !== semanticHash(registry)) {
    throw new TypeError('BB12_REGISTRY_SNAPSHOT_HASH_MISMATCH');
  }
  const packages = requirePackageReceipts(packageReceipts);
  const modules = requireModuleReceipts(moduleReceipts);
  const custody = requireRetainedArtifactCustody(retainedArtifactCustody);
  const roadmap = requireRoadmapAssertions(roadmapAssertions);
  const checks = requirePassChecks(checkResults);
  validateIntakeCrossLinks(packages, modules, custody);

  const payload = {
    schema: BB12_COMBINED_EVIDENCE_SCHEMA,
    exactHeadSha,
    baseSha,
    requiredPackageIds: [...BB12_REQUIRED_PACKAGE_IDS],
    requiredModuleIds: [...BB12_REQUIRED_MODULE_IDS],
    packageReceipts: packages,
    moduleReceipts: modules,
    retainedArtifactCustody: custody,
    registrySnapshotHash,
    roadmapAssertions: roadmap,
    checkResults: checks,
    status: 'BB12_COMBINED_EVIDENCE_VALIDATED',
    bucketBProgrammeEvidenceComplete: true,
    bb12CombinedAdjudicationQualified: false,
    ...BB12_WITHHELD_AUTHORITY_BOUNDARY,
  };
  return seal(payload);
}

export function validateBb12CombinedEvidence(value, {
  expectedHeadSha,
  expectedBaseSha,
} = {}) {
  requireSchemaAndHash(value, BB12_COMBINED_EVIDENCE_SCHEMA);
  requireGitSha(value.exactHeadSha, 'exactHeadSha');
  requireGitSha(value.baseSha, 'baseSha');
  if (expectedHeadSha && value.exactHeadSha !== expectedHeadSha) {
    throw new TypeError('BB12_EVIDENCE_STALE_HEAD');
  }
  if (expectedBaseSha && value.baseSha !== expectedBaseSha) {
    throw new TypeError('BB12_EVIDENCE_WRONG_BASE');
  }
  const packages = requirePackageReceipts(value.packageReceipts);
  const modules = requireModuleReceipts(value.moduleReceipts);
  if (JSON.stringify(value.requiredPackageIds) !== JSON.stringify(BB12_REQUIRED_PACKAGE_IDS)
    || JSON.stringify(value.requiredModuleIds) !== JSON.stringify(BB12_REQUIRED_MODULE_IDS)) {
    throw new TypeError('BB12_REQUIRED_INTAKE_SET_MISMATCH');
  }
  const custody = requireRetainedArtifactCustody(value.retainedArtifactCustody);
  requireHash(value.registrySnapshotHash, 'registrySnapshotHash');
  requireRoadmapAssertions(value.roadmapAssertions);
  requirePassChecks(value.checkResults);
  validateIntakeCrossLinks(packages, modules, custody);
  if (value.status !== 'BB12_COMBINED_EVIDENCE_VALIDATED'
    || value.bucketBProgrammeEvidenceComplete !== true
    || value.bb12CombinedAdjudicationQualified !== false) {
    throw new TypeError('BB12_EVIDENCE_AUTHORITY_INVALID');
  }
  validateWithheldAuthority(value);
  return true;
}

export function createBb12CombinedApproval({
  evidence,
  changedPaths,
  sourceArtifactHashes,
  rawEvidenceHashes,
  semanticEvidenceHashes,
  checkResults,
} = {}) {
  validateBb12CombinedEvidence(evidence);
  const paths = requireChangedPaths(changedPaths);
  const sourceHashes = requireHashArray(sourceArtifactHashes, 'sourceArtifactHashes');
  if (sourceHashes.length !== paths.length) {
    throw new TypeError('BB12_SOURCE_ARTIFACT_HASH_COUNT_MISMATCH');
  }
  const rawHashes = requireHashArray(rawEvidenceHashes, 'rawEvidenceHashes');
  const semanticHashes = requireHashArray(
    semanticEvidenceHashes,
    'semanticEvidenceHashes',
  );
  const checks = requirePassChecks(checkResults);
  const payload = {
    schema: BB12_COMBINED_APPROVAL_SCHEMA,
    exactHeadSha: evidence.exactHeadSha,
    baseSha: evidence.baseSha,
    evidenceHash: evidence.semanticHash,
    changedPaths: paths,
    changedPathsHash: semanticHash(paths),
    sourceArtifactHashes: sourceHashes,
    rawEvidenceHashes: rawHashes,
    semanticEvidenceHashes: semanticHashes,
    checkResults: checks,
    status: BB12_QUALIFIED_STATUS,
    bucketBProgrammeEvidenceComplete: true,
    bucketBCombinedAdjudicationQualified: true,
    bucketBProgrammeCompletionRecorded: true,
    ...BB12_WITHHELD_AUTHORITY_BOUNDARY,
  };
  return seal(payload);
}

export function validateBb12CombinedApproval(value, {
  expectedHeadSha,
  expectedBaseSha,
} = {}) {
  requireSchemaAndHash(value, BB12_COMBINED_APPROVAL_SCHEMA);
  requireGitSha(value.exactHeadSha, 'exactHeadSha');
  requireGitSha(value.baseSha, 'baseSha');
  if (expectedHeadSha && value.exactHeadSha !== expectedHeadSha) {
    throw new TypeError('BB12_APPROVAL_STALE_HEAD');
  }
  if (expectedBaseSha && value.baseSha !== expectedBaseSha) {
    throw new TypeError('BB12_APPROVAL_WRONG_BASE');
  }
  requireHash(value.evidenceHash, 'evidenceHash');
  const paths = requireChangedPaths(value.changedPaths);
  if (value.changedPathsHash !== semanticHash(paths)) {
    throw new TypeError('BB12_CHANGED_PATH_HASH_MISMATCH');
  }
  const sourceHashes = requireHashArray(value.sourceArtifactHashes, 'sourceArtifactHashes');
  if (sourceHashes.length !== paths.length) {
    throw new TypeError('BB12_SOURCE_ARTIFACT_HASH_COUNT_MISMATCH');
  }
  requireHashArray(value.rawEvidenceHashes, 'rawEvidenceHashes');
  requireHashArray(value.semanticEvidenceHashes, 'semanticEvidenceHashes');
  requirePassChecks(value.checkResults);
  if (value.status !== BB12_QUALIFIED_STATUS
    || value.bucketBProgrammeEvidenceComplete !== true
    || value.bucketBCombinedAdjudicationQualified !== true
    || value.bucketBProgrammeCompletionRecorded !== true) {
    throw new TypeError('BB12_APPROVAL_NOT_QUALIFIED');
  }
  validateWithheldAuthority(value);
  return true;
}

export function createBb12CombinedReport({
  exactHeadSha,
  baseSha,
  mergeBaseSha,
  currentMainSha,
  commitsBehindMain,
  approval,
  artifactId,
  artifactDigest,
  checkResults,
  replay,
  limitations,
} = {}) {
  validateBb12CombinedApproval(approval, {
    expectedHeadSha: exactHeadSha,
    expectedBaseSha: baseSha,
  });
  requireGitSha(mergeBaseSha, 'mergeBaseSha');
  requireGitSha(currentMainSha, 'currentMainSha');
  if (baseSha !== mergeBaseSha || baseSha !== currentMainSha) {
    throw new TypeError('BB12_REPORT_BASE_NOT_CURRENT_MAIN');
  }
  if (commitsBehindMain !== 0) {
    throw new TypeError('BB12_REPORT_BRANCH_BEHIND_MAIN');
  }
  requireText(artifactId, 'artifactId');
  requireHash(artifactDigest, 'artifactDigest');
  const checks = requirePassChecks(checkResults);
  const replayEvidence = requireReplay(replay);
  const retainedLimitations = requireLimitations(limitations);
  const payload = {
    schema: BB12_COMBINED_REPORT_SCHEMA,
    exactHeadSha,
    baseSha,
    mergeBaseSha,
    currentMainSha,
    commitsBehindMain: 0,
    approvalHash: approval.semanticHash,
    artifactId,
    artifactDigest,
    checkResults: checks,
    replay: replayEvidence,
    limitations: retainedLimitations,
    status: BB12_QUALIFIED_STATUS,
    bucketBProgrammeEvidenceComplete: true,
    bucketBCombinedAdjudicationQualified: true,
    bucketBProgrammeCompletionRecorded: true,
    ...BB12_WITHHELD_AUTHORITY_BOUNDARY,
  };
  return seal(payload);
}

export function validateBb12CombinedReport(value, {
  expectedHeadSha,
  expectedBaseSha,
} = {}) {
  requireSchemaAndHash(value, BB12_COMBINED_REPORT_SCHEMA);
  requireGitSha(value.exactHeadSha, 'exactHeadSha');
  requireGitSha(value.baseSha, 'baseSha');
  requireGitSha(value.mergeBaseSha, 'mergeBaseSha');
  requireGitSha(value.currentMainSha, 'currentMainSha');
  if (expectedHeadSha && value.exactHeadSha !== expectedHeadSha) {
    throw new TypeError('BB12_REPORT_STALE_HEAD');
  }
  if (expectedBaseSha && value.baseSha !== expectedBaseSha) {
    throw new TypeError('BB12_REPORT_WRONG_BASE');
  }
  if (value.baseSha !== value.mergeBaseSha
    || value.baseSha !== value.currentMainSha
    || value.commitsBehindMain !== 0) {
    throw new TypeError('BB12_REPORT_BASE_CUSTODY_INVALID');
  }
  requireHash(value.approvalHash, 'approvalHash');
  requireText(value.artifactId, 'artifactId');
  requireHash(value.artifactDigest, 'artifactDigest');
  requirePassChecks(value.checkResults);
  requireReplay(value.replay);
  requireLimitations(value.limitations);
  if (value.status !== BB12_QUALIFIED_STATUS
    || value.bucketBProgrammeEvidenceComplete !== true
    || value.bucketBCombinedAdjudicationQualified !== true
    || value.bucketBProgrammeCompletionRecorded !== true) {
    throw new TypeError('BB12_REPORT_NOT_QUALIFIED');
  }
  validateWithheldAuthority(value);
  return true;
}

function requirePackageReceipts(rows) {
  if (!Array.isArray(rows) || rows.length !== BB12_REQUIRED_PACKAGE_IDS.length) {
    throw new TypeError('BB12_PACKAGE_RECEIPTS_INCOMPLETE');
  }
  const normalized = rows.map((row) => {
    requireText(row?.packageId, 'packageId');
    if (!BB12_REQUIRED_PACKAGE_IDS.includes(row.packageId)) {
      throw new TypeError(`BB12_PACKAGE_UNGOVERNED:${row.packageId}`);
    }
    if (row.status !== 'PASS') {
      throw new TypeError(`BB12_PACKAGE_NOT_PASS:${row.packageId}`);
    }
    requireText(row.sourceReportSchema, 'sourceReportSchema');
    requireHash(row.sourceReportSemanticHash, 'sourceReportSemanticHash');
    requireHash(row.sourceReportRawSha256, 'sourceReportRawSha256');
    requireGitSha(row.sourceHeadSha, 'sourceHeadSha');
    requireText(row.custodyKind, 'custodyKind');
    const retainedPackage = row.packageId === 'BB10' || row.packageId === 'BB11';
    const expectedCustodyKind = retainedPackage
      ? 'RETAINED_PLUS_SAME_HEAD_REPLAY'
      : 'SAME_HEAD_REPLAY';
    if (row.custodyKind !== expectedCustodyKind) {
      throw new TypeError(`BB12_PACKAGE_CUSTODY_KIND_INVALID:${row.packageId}`);
    }
    if (retainedPackage) requireHash(row.replayEvidenceHash, 'replayEvidenceHash');
    else if (row.replayEvidenceHash !== undefined) requireHash(row.replayEvidenceHash, 'replayEvidenceHash');
    return {
      packageId: row.packageId,
      sourceReportSchema: row.sourceReportSchema,
      sourceReportSemanticHash: row.sourceReportSemanticHash,
      sourceReportRawSha256: row.sourceReportRawSha256,
      sourceHeadSha: row.sourceHeadSha,
      custodyKind: row.custodyKind,
      ...(row.replayEvidenceHash
        ? { replayEvidenceHash: row.replayEvidenceHash }
        : {}),
      status: 'PASS',
    };
  }).sort((a, b) => a.packageId.localeCompare(b.packageId));
  if (new Set(normalized.map((row) => row.packageId)).size !== normalized.length) {
    throw new TypeError('BB12_PACKAGE_RECEIPT_DUPLICATE');
  }
  const expected = [...BB12_REQUIRED_PACKAGE_IDS].sort();
  if (JSON.stringify(normalized.map((row) => row.packageId)) !== JSON.stringify(expected)) {
    throw new TypeError('BB12_PACKAGE_RECEIPT_SET_MISMATCH');
  }
  return normalized;
}

function requireModuleReceipts(rows) {
  if (!Array.isArray(rows) || rows.length !== BB12_REQUIRED_MODULE_IDS.length) {
    throw new TypeError('BB12_MODULE_RECEIPTS_INCOMPLETE');
  }
  const normalized = rows.map((row) => {
    requireText(row?.moduleId, 'moduleId');
    if (!BB12_REQUIRED_MODULE_IDS.includes(row.moduleId)) {
      throw new TypeError(`BB12_MODULE_UNGOVERNED:${row.moduleId}`);
    }
    const [formulationProfile, elementProfile] =
      EXPECTED_MODULE_PROFILES[row.moduleId];
    if (row.formulationProfile !== formulationProfile
      || row.elementProfile !== elementProfile) {
      throw new TypeError(`BB12_MODULE_PROFILE_INVALID:${row.moduleId}`);
    }
    if (row.applicationProcedureQualified !== true
      || row.numericalOutputQualified !== true) {
      throw new TypeError(`BB12_MODULE_NOT_QUALIFIED:${row.moduleId}`);
    }
    requireText(row.sourcePackageId, 'sourcePackageId');
    if (row.sourcePackageId !== expectedSourcePackage(row.moduleId)) {
      throw new TypeError(`BB12_MODULE_SOURCE_PACKAGE_INVALID:${row.moduleId}`);
    }
    requireHash(row.sourceReportSemanticHash, 'sourceReportSemanticHash');
    return {
      moduleId: row.moduleId,
      formulationProfile,
      elementProfile,
      sourcePackageId: row.sourcePackageId,
      sourceReportSemanticHash: row.sourceReportSemanticHash,
      applicationProcedureQualified: true,
      numericalOutputQualified: true,
    };
  }).sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  if (new Set(normalized.map((row) => row.moduleId)).size !== normalized.length) {
    throw new TypeError('BB12_MODULE_RECEIPT_DUPLICATE');
  }
  const expected = [...BB12_REQUIRED_MODULE_IDS].sort();
  if (JSON.stringify(normalized.map((row) => row.moduleId)) !== JSON.stringify(expected)) {
    throw new TypeError('BB12_MODULE_RECEIPT_SET_MISMATCH');
  }
  return normalized;
}

function requireRetainedArtifactCustody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('BB12_RETAINED_ARTIFACT_CUSTODY_REQUIRED');
  }
  const result = {};
  ['BB10', 'BB11'].forEach((packageId) => {
    const row = value[packageId];
    requireText(row?.artifactId, `${packageId}.artifactId`);
    requireHash(row.artifactDigest, `${packageId}.artifactDigest`);
    requireHash(row.reportRawSha256, `${packageId}.reportRawSha256`);
    requireHash(row.reportSemanticHash, `${packageId}.reportSemanticHash`);
    requireGitSha(row.mergeSha, `${packageId}.mergeSha`);
    result[packageId] = {
      artifactId: row.artifactId,
      artifactDigest: row.artifactDigest,
      reportRawSha256: row.reportRawSha256,
      reportSemanticHash: row.reportSemanticHash,
      mergeSha: row.mergeSha,
    };
  });
  return result;
}

function requireRoadmapAssertions(value) {
  if (!value || value.bb12Required !== true
    || value.noAutomaticProductionAuthority !== true
    || value.noCodeAssessmentAuthority !== true
    || value.bucket01Unchanged !== true) {
    throw new TypeError('BB12_ROADMAP_ASSERTIONS_INVALID');
  }
  requireHash(value.roadmapRawSha256, 'roadmapRawSha256');
  return {
    bb12Required: true,
    noAutomaticProductionAuthority: true,
    noCodeAssessmentAuthority: true,
    bucket01Unchanged: true,
    roadmapRawSha256: value.roadmapRawSha256,
  };
}

function requireChangedPaths(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('BB12_CHANGED_PATHS_REQUIRED');
  }
  const normalized = rows.map((row) => {
    requireText(row?.path, 'changedPath.path');
    if (!['A', 'M', 'D', 'R'].includes(row.status)) {
      throw new TypeError('BB12_CHANGED_PATH_STATUS_INVALID');
    }
    return row.status === 'R'
      ? {
        status: 'R',
        oldPath: requireText(row.oldPath, 'changedPath.oldPath'),
        path: row.path,
      }
      : { status: row.status, path: row.path };
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(normalized.map((row) => row.path)).size !== normalized.length) {
    throw new TypeError('BB12_CHANGED_PATH_DUPLICATE');
  }
  if (JSON.stringify(normalized.map((row) => row.path))
    !== JSON.stringify([...BB12_GOVERNED_PATHS].sort())) {
    throw new TypeError('BB12_CHANGED_PATH_SET_MISMATCH');
  }
  return normalized;
}

function requirePassChecks(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('BB12_CHECK_RESULTS_REQUIRED');
  }
  const normalized = rows.map((row) => {
    requireText(row?.checkId, 'checkId');
    if (row.status !== 'PASS') {
      throw new TypeError(`BB12_CHECK_NOT_PASS:${row.checkId}`);
    }
    requireHash(row.evidenceHash, 'evidenceHash');
    return {
      checkId: row.checkId,
      status: 'PASS',
      evidenceHash: row.evidenceHash,
    };
  }).sort((a, b) => a.checkId.localeCompare(b.checkId));
  if (new Set(normalized.map((row) => row.checkId)).size !== normalized.length) {
    throw new TypeError('BB12_CHECK_ID_DUPLICATE');
  }
  return normalized;
}

function requireReplay(value) {
  if (!value || value.byteIdentical !== true) {
    throw new TypeError('BB12_BYTE_IDENTICAL_REPLAY_REQUIRED');
  }
  [
    'identityHash',
    'runAArtifactManifestHash',
    'runBArtifactManifestHash',
    'stdoutHashA',
    'stdoutHashB',
    'stderrHashA',
    'stderrHashB',
  ].forEach((key) => requireHash(value[key], key));
  if (value.runAArtifactManifestHash !== value.runBArtifactManifestHash
    || value.stdoutHashA !== value.stdoutHashB
    || value.stderrHashA !== value.stderrHashB) {
    throw new TypeError('BB12_REPLAY_HASH_MISMATCH');
  }
  return {
    byteIdentical: true,
    identityHash: value.identityHash,
    runAArtifactManifestHash: value.runAArtifactManifestHash,
    runBArtifactManifestHash: value.runBArtifactManifestHash,
    stdoutHashA: value.stdoutHashA,
    stdoutHashB: value.stdoutHashB,
    stderrHashA: value.stderrHashA,
    stderrHashB: value.stderrHashB,
  };
}

function requireLimitations(rows) {
  if (!Array.isArray(rows) || rows.length === 0
    || rows.some((row) => typeof row !== 'string' || !row.trim())) {
    throw new TypeError('BB12_LIMITATIONS_REQUIRED');
  }
  return [...rows];
}

function validateIntakeCrossLinks(packages, modules, custody) {
  const packageById = new Map(packages.map((row) => [row.packageId, row]));
  modules.forEach((row) => {
    const source = packageById.get(row.sourcePackageId);
    if (!source || source.sourceReportSemanticHash !== row.sourceReportSemanticHash) {
      throw new TypeError(`BB12_MODULE_PACKAGE_HASH_MISMATCH:${row.moduleId}`);
    }
  });
  ['BB10', 'BB11'].forEach((packageId) => {
    const source = packageById.get(packageId);
    const retained = custody[packageId];
    if (source.sourceReportSemanticHash !== retained.reportSemanticHash
      || source.sourceReportRawSha256 !== retained.reportRawSha256) {
      throw new TypeError(`BB12_RETAINED_PACKAGE_CUSTODY_MISMATCH:${packageId}`);
    }
  });
}

function expectedSourcePackage(moduleId) {
  if (moduleId === 'C2D-LUG-PINHOLE' || moduleId === 'C2D-CLAMP-EAR') return 'BB06';
  if (moduleId === 'C2D-BRACKET-GUSSET') return 'BB07';
  if (moduleId === 'C2D-PIPE-PAD-SECTION') return 'BB08';
  if (moduleId === 'C2D-NOZZLE-REPAD-SECTION') return 'BB09';
  if (moduleId === 'C2D-FLANGE-HUB') return 'BB11';
  throw new TypeError(`BB12_MODULE_UNGOVERNED:${moduleId}`);
}

function validateWithheldAuthority(value) {
  if (value.codeAssessmentQualified !== false
    || value.moduleQualified !== false
    || value.applicationModulePromoted !== false
    || value.productionSwitchAuthorized !== false
    || value.bucket01Qualified !== 'UNCHANGED') {
    throw new TypeError('BB12_FORBIDDEN_AUTHORITY_SET');
  }
}

function requireSchemaAndHash(value, schema) {
  if (!value || value.schema !== schema
    || value.semanticHash !== semanticHash(withoutHash(value))) {
    throw new TypeError('BB12_SCHEMA_OR_SEMANTIC_HASH_INVALID');
  }
}

function seal(payload) {
  const clean = clone(payload);
  delete clean.semanticHash;
  return deepFreeze({ ...clean, semanticHash: semanticHash(clean) });
}

function withoutHash(value) {
  const clean = clone(value);
  delete clean.semanticHash;
  return clean;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireHashArray(rows, label) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => !isHash(row))) {
    throw new TypeError(`BB12_INVALID_${label.toUpperCase()}`);
  }
  return [...rows];
}

function requireGitSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/iu.test(value)) {
    throw new TypeError(`BB12_INVALID_${label.toUpperCase()}`);
  }
}

function requireHash(value, label) {
  if (!isHash(value)) {
    throw new TypeError(`BB12_INVALID_${label.toUpperCase()}`);
  }
}

function isHash(value) {
  return typeof value === 'string'
    && /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/iu.test(value);
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`BB12_INVALID_${label.toUpperCase()}`);
  }
  return value;
}
