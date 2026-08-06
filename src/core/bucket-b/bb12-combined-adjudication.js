import { semanticHash } from '../shared-piping-model/index.js';
import { BB06_MODULES, validateBb06Report } from './bb06-lug-clamp.js';
import { BB07_MODULE, validateBb07Report } from './bb07-bracket-gusset.js';
import { BB08_MODULE, validateBb08Report } from './bb08-pipe-pad.js';
import { BB09_MODULE, validateBb09Report } from './bb09-nozzle-repad.js';
import { validateBb11FlangeHubReport } from './flange-hub-authority.js';

export const BB12_REPORT_SCHEMA =
  'bucket-b-bb12-combined-adjudication-report/v1';
export const BB12_QUALIFIED_STATUS =
  'BB12_BUCKET_B_PROGRAMME_QUALIFIED';
export const BB12_PROJECTION_STATUS =
  'APPLICATION_QUALIFIED_RECEIPT_BOUND';

export const BB12_BB11_EXECUTABLE_PATHS = Object.freeze([
  'src/core/bucket-b/bb11-check.mjs',
  'src/core/bucket-b/bb11-flange-hub.js',
  'src/core/bucket-b/bb11-shared-gate-replay.mjs',
  'src/core/bucket-b/flange-hub-authority.js',
  'src/core/bucket-b/flange-hub-convergence.js',
  'src/core/bucket-b/flange-hub-geometry.js',
  'src/core/bucket-b/flange-hub-independent-oracle.js',
  'src/core/bucket-b/flange-hub-loads.js',
  'src/core/bucket-b/flange-hub-mesh-v2.js',
  'src/core/bucket-b/flange-hub-mesh.js',
  'src/core/bucket-b/flange-hub-recovery.js',
  'src/core/bucket-b/flange-hub-reference.js',
  'src/core/bucket-b/flange-hub-solver.js',
  'src/core/bucket-b/registry.js',
]);

const RETAINED_FALSE_AUTHORITY = Object.freeze({
  codeAssessmentQualified: false,
  moduleQualified: false,
  applicationModulePromoted: false,
  applicationExecutionAuthorized: false,
  productionSwitchAuthorized: false,
  bucket01Qualified: 'UNCHANGED',
});

export function createBb12CombinedAdjudicationReport({
  exactHeadSha,
  baseSha,
  mergeBaseSha,
  currentMainSha,
  commitsBehindMain,
  bb06Report,
  bb07Report,
  bb08Report,
  bb09Report,
  bb11Report,
  bb11AdoptionEvidence,
  checkResults,
} = {}) {
  requireGitSha(exactHeadSha, 'exactHeadSha');
  requireGitSha(baseSha, 'baseSha');
  requireGitSha(mergeBaseSha, 'mergeBaseSha');
  requireGitSha(currentMainSha, 'currentMainSha');
  if (baseSha !== mergeBaseSha || baseSha !== currentMainSha) {
    throw new TypeError('BB12_BASE_NOT_CURRENT_MAIN');
  }
  if (commitsBehindMain !== 0) {
    throw new TypeError('BB12_BRANCH_BEHIND_MAIN');
  }

  validateBb06Report(bb06Report);
  validateBb07Report(bb07Report);
  validateBb08Report(bb08Report);
  validateBb09Report(bb09Report);
  validateBb11FlangeHubReport(bb11Report);
  [bb06Report, bb07Report, bb08Report, bb09Report].forEach((report) => {
    if (report.exactHeadSha !== exactHeadSha) {
      throw new TypeError('BB12_PLANAR_REPORT_STALE_HEAD');
    }
    if (!report.applicationProcedureQualified || !report.numericalOutputQualified) {
      throw new TypeError('BB12_PLANAR_REPORT_NOT_QUALIFIED');
    }
  });
  if (!bb09Report.bb12PlanarIntakeAuthorized) {
    throw new TypeError('BB12_PLANAR_INTAKE_NOT_AUTHORIZED');
  }
  if (
    bb11Report.flangeHubApplicationProcedureQualified !== true
    || bb11Report.flangeHubNumericalOutputQualified !== true
    || bb11Report.bb12Authorized !== true
  ) {
    throw new TypeError('BB12_AXISYMMETRIC_INTAKE_NOT_AUTHORIZED');
  }
  requireBb11AdoptionEvidence(bb11AdoptionEvidence, {
    currentHeadSha: exactHeadSha,
    qualifiedHeadSha: bb11Report.exactHeadSha,
  });
  const checks = requirePassChecks(checkResults);

  const sourceReports = Object.freeze({
    bb06: bb06Report.semanticHash,
    bb07: bb07Report.semanticHash,
    bb08: bb08Report.semanticHash,
    bb09: bb09Report.semanticHash,
    bb11: bb11Report.semanticHash,
  });
  const applicationTemplateProjection = createProjection({
    exactHeadSha,
    sourceReports,
    bb11Limitations: bb11Report.limitations,
  });
  const payload = {
    schema: BB12_REPORT_SCHEMA,
    exactHeadSha,
    baseSha,
    mergeBaseSha,
    currentMainSha,
    commitsBehindMain: 0,
    status: BB12_QUALIFIED_STATUS,
    sourceReports,
    bb11AdoptionEvidence,
    checkCount: checks.length,
    checkResults: checks,
    bucketBProgrammeQualified: true,
    applicationProcedurePortfolioQualified: true,
    numericalOutputPortfolioQualified: true,
    applicationTemplateProjectionQualified: true,
    qualifiedApplicationProcedureCount: applicationTemplateProjection.length,
    applicationTemplateProjection,
    ...RETAINED_FALSE_AUTHORITY,
  };
  return seal(payload);
}

export function validateBb12CombinedAdjudicationReport(report, {
  expectedHeadSha,
  expectedBaseSha,
} = {}) {
  requireSchemaAndHash(report, BB12_REPORT_SCHEMA);
  if (expectedHeadSha && report.exactHeadSha !== expectedHeadSha) {
    throw new TypeError('BB12_REPORT_STALE_HEAD');
  }
  if (expectedBaseSha && report.baseSha !== expectedBaseSha) {
    throw new TypeError('BB12_REPORT_WRONG_BASE');
  }
  requireGitSha(report.exactHeadSha, 'exactHeadSha');
  requireGitSha(report.baseSha, 'baseSha');
  requireGitSha(report.mergeBaseSha, 'mergeBaseSha');
  requireGitSha(report.currentMainSha, 'currentMainSha');
  if (
    report.baseSha !== report.mergeBaseSha
    || report.baseSha !== report.currentMainSha
    || report.commitsBehindMain !== 0
  ) {
    throw new TypeError('BB12_REPORT_NOT_ZERO_BEHIND_CURRENT_MAIN');
  }
  if (
    report.status !== BB12_QUALIFIED_STATUS
    || report.bucketBProgrammeQualified !== true
    || report.applicationProcedurePortfolioQualified !== true
    || report.numericalOutputPortfolioQualified !== true
    || report.applicationTemplateProjectionQualified !== true
  ) {
    throw new TypeError('BB12_REPORT_NOT_QUALIFIED');
  }
  requireHashRecord(report.sourceReports, [
    'bb06',
    'bb07',
    'bb08',
    'bb09',
    'bb11',
  ]);
  requireBb11AdoptionEvidence(report.bb11AdoptionEvidence, {
    currentHeadSha: report.exactHeadSha,
  });
  const checks = requirePassChecks(report.checkResults);
  if (checks.length !== report.checkCount) {
    throw new TypeError('BB12_REPORT_CHECK_COUNT_MISMATCH');
  }
  requireProjection(report.applicationTemplateProjection, {
    exactHeadSha: report.exactHeadSha,
    sourceReports: report.sourceReports,
  });
  if (
    report.qualifiedApplicationProcedureCount
      !== report.applicationTemplateProjection.length
  ) {
    throw new TypeError('BB12_REPORT_PROJECTION_COUNT_MISMATCH');
  }
  validateRetainedAuthority(report);
  return true;
}

function createProjection({ exactHeadSha, sourceReports, bb11Limitations }) {
  const rows = [
    projectionRow('C2D-CLAMP-EAR', 'bb06', BB06_MODULES['C2D-CLAMP-EAR']),
    projectionRow('C2D-LUG-PINHOLE', 'bb06', BB06_MODULES['C2D-LUG-PINHOLE']),
    projectionRow('C2D-BRACKET-GUSSET', 'bb07', BB07_MODULE),
    projectionRow('C2D-PIPE-PAD-SECTION', 'bb08', BB08_MODULE),
    projectionRow('C2D-NOZZLE-REPAD-SECTION', 'bb09', BB09_MODULE),
    {
      templateId: 'C2D-FLANGE-HUB',
      sourceReportKey: 'bb11',
      formulationProfileId: 'AXISYMMETRIC',
      elementProfile: 'AXI_Q8_FULL_3X3',
      geometryProfileId: 'BKT-B-FLANGE-GEOMETRY-V1',
      limitations: [...bb11Limitations],
    },
  ].map((row) => ({
    ...row,
    exactHeadSha,
    sourceReportHash: sourceReports[row.sourceReportKey],
    releaseStatus: BB12_PROJECTION_STATUS,
    codeAssessmentQualified: false,
    ordinaryProductionExecutionAuthorized: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
  }));
  return deepFreeze(rows.sort((left, right) => (
    left.templateId < right.templateId ? -1 : 1
  )));
}

function projectionRow(templateId, sourceReportKey, module) {
  return {
    templateId,
    sourceReportKey,
    formulationProfileId: module.formulationProfile,
    elementProfile: module.elementProfile,
    geometryProfileId: module.geometryProfileId,
    limitations: [...module.limitations],
  };
}

function requireProjection(rows, { exactHeadSha, sourceReports }) {
  if (!Array.isArray(rows) || rows.length !== 6) {
    throw new TypeError('BB12_PROJECTION_REQUIRES_SIX_APPLICATIONS');
  }
  const expected = [
    'C2D-BRACKET-GUSSET',
    'C2D-CLAMP-EAR',
    'C2D-FLANGE-HUB',
    'C2D-LUG-PINHOLE',
    'C2D-NOZZLE-REPAD-SECTION',
    'C2D-PIPE-PAD-SECTION',
  ];
  if (JSON.stringify(rows.map((row) => row.templateId)) !== JSON.stringify(expected)) {
    throw new TypeError('BB12_PROJECTION_TEMPLATE_SET_INVALID');
  }
  rows.forEach((row) => {
    if (
      row.exactHeadSha !== exactHeadSha
      || row.sourceReportHash !== sourceReports[row.sourceReportKey]
      || row.releaseStatus !== BB12_PROJECTION_STATUS
      || !Array.isArray(row.limitations)
      || row.limitations.length === 0
      || row.codeAssessmentQualified !== false
      || row.ordinaryProductionExecutionAuthorized !== false
      || row.applicationModulePromoted !== false
      || row.productionSwitchAuthorized !== false
    ) {
      throw new TypeError('BB12_PROJECTION_AUTHORITY_INVALID');
    }
  });
}

function requireBb11AdoptionEvidence(value, {
  currentHeadSha,
  qualifiedHeadSha,
} = {}) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('BB12_BB11_ADOPTION_EVIDENCE_REQUIRED');
  }
  requireGitSha(value.currentHeadSha, 'bb11Adoption.currentHeadSha');
  requireGitSha(value.qualifiedHeadSha, 'bb11Adoption.qualifiedHeadSha');
  requireGitSha(value.mergedHeadSha, 'bb11Adoption.mergedHeadSha');
  if (currentHeadSha && value.currentHeadSha !== currentHeadSha) {
    throw new TypeError('BB12_BB11_ADOPTION_STALE_CURRENT_HEAD');
  }
  if (qualifiedHeadSha && value.qualifiedHeadSha !== qualifiedHeadSha) {
    throw new TypeError('BB12_BB11_ADOPTION_WRONG_QUALIFIED_HEAD');
  }
  if (
    value.qualifiedHeadIsAncestor !== true
    || value.mergedHeadIsAncestor !== true
    || value.sourceTreeIdentityStatus !== 'BYTE_IDENTICAL'
  ) {
    throw new TypeError('BB12_BB11_ADOPTION_ANCESTRY_OR_IDENTITY_INVALID');
  }
  if (
    value.artifactId !== '8954712183'
    || value.artifactDigest
      !== 'sha256:7dc5619ab867bcb7a977a8169c814a158bad2fe63f92999e7985a78f6d555ed1'
  ) {
    throw new TypeError('BB12_BB11_ADOPTION_ARTIFACT_INVALID');
  }
  if (
    !Array.isArray(value.pathRows)
    || value.pathRows.length !== BB12_BB11_EXECUTABLE_PATHS.length
  ) {
    throw new TypeError('BB12_BB11_ADOPTION_PATH_MANIFEST_INVALID');
  }
  value.pathRows.forEach((row, index) => {
    if (
      row.path !== BB12_BB11_EXECUTABLE_PATHS[index]
      || !/^[0-9a-f]{40}$/i.test(row.qualifiedBlobSha ?? '')
      || !/^[0-9a-f]{40}$/i.test(row.currentBlobSha ?? '')
      || row.qualifiedBlobSha !== row.currentBlobSha
      || row.byteIdentical !== true
    ) {
      throw new TypeError('BB12_BB11_ADOPTION_SOURCE_DRIFT');
    }
  });
  requireHash(value.semanticHash, 'bb11Adoption.semanticHash');
  const { semanticHash: retained, ...payload } = value;
  if (retained !== semanticHash(payload)) {
    throw new TypeError('BB12_BB11_ADOPTION_HASH_MISMATCH');
  }
}

function validateRetainedAuthority(report) {
  if (
    report.codeAssessmentQualified !== false
    || report.moduleQualified !== false
    || report.applicationModulePromoted !== false
    || report.applicationExecutionAuthorized !== false
    || report.productionSwitchAuthorized !== false
    || report.bucket01Qualified !== 'UNCHANGED'
  ) {
    throw new TypeError('BB12_REPORT_RETAINED_AUTHORITY_INVALID');
  }
}

function requirePassChecks(value) {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((row) => (
      typeof row?.checkId !== 'string'
      || row.status !== 'PASS'
      || !/^(sha256|fnv1a64):[0-9a-f]+$/i.test(row.evidenceHash ?? '')
    ))
  ) {
    throw new TypeError('BB12_PASS_CHECKS_REQUIRED');
  }
  return value.map((row) => ({ ...row }));
}

function requireHashRecord(value, keys) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('BB12_SOURCE_REPORT_HASHES_REQUIRED');
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new TypeError('BB12_SOURCE_REPORT_HASH_SET_INVALID');
  }
  keys.forEach((key) => requireHash(value[key], `sourceReports.${key}`));
}

function requireSchemaAndHash(value, schema) {
  if (value?.schema !== schema) throw new TypeError('BB12_REPORT_SCHEMA_INVALID');
  requireHash(value.semanticHash, 'semanticHash');
  const { semanticHash: retained, ...payload } = value;
  if (retained !== semanticHash(payload)) {
    throw new TypeError('BB12_REPORT_HASH_MISMATCH');
  }
}

function requireGitSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new TypeError(`${label} must be a 40-character Git SHA.`);
  }
}

function requireHash(value, label) {
  if (typeof value !== 'string' || !/^(sha256|fnv1a64):[0-9a-f]+$/i.test(value)) {
    throw new TypeError(`${label} must be a retained semantic or SHA-256 hash.`);
  }
}

function seal(payload) {
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
