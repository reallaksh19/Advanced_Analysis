#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  MODULE_REGISTRY,
  createBb12CombinedApproval,
  createBb12CombinedEvidence,
  createBb12CombinedReport,
  validateBb06Report,
  validateBb07Report,
  validateBb08Report,
  validateBb09Report,
  validateBb10AxisymmetricRegistrationReport,
  validateBb11FlangeHubReport,
  validateBb12CombinedApproval,
  validateBb12CombinedEvidence,
  validateBb12CombinedReport,
  validateBucketBRegistryForBb12,
} from './index.js';
import { semanticHash } from '../shared-piping-model/index.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const ALLOWED_PATHS = Object.freeze([
  '.github/workflows/bucket-b-bb12-combined-adjudication.yml',
  'docs/Bucket_B_BB12_Combined_Adjudication_Record.md',
  'docs/LAFEA_BB12_Combined_Adjudication_Qualification_and_Work_Pack.md',
  'src/core/bucket-b/bb12-check.mjs',
  'src/core/bucket-b/bb12-combined-adjudication.js',
  'src/core/bucket-b/index.js',
  'tests/bucket-b-bb12-combined-adjudication.test.mjs',
]);
const RETAINED = Object.freeze({
  BB10: Object.freeze({
    artifactId: '8901921021',
    artifactDigest: 'sha256:317731aefd35b87bce2b7221704a1e34753aba97bb4513310001b407346b74b7',
    mergeSha: '1e7cbb13a9da66bad2d27da3fc31d7edebad5ed4',
  }),
  BB11: Object.freeze({
    finalArtifactId: '8954712183',
    finalArtifactDigest: 'sha256:7dc5619ab867bcb7a977a8169c814a158bad2fe63f92999e7985a78f6d555ed1',
    reportArtifactId: '8954711905',
    reportArtifactDigest: 'sha256:6d11e67172b7f09303ee52d007e5f2de11d929fc72b954b0b080f1ec316ed248',
    reportRawSha256: 'sha256:8c934ab946d212f8f9b5415f40f185c5eb7bf5f467a4211caf31a5d91c42e1fe',
    reportSemanticHash: 'fnv1a64:876c92b5c24ee1c6',
    mergeSha: '07ce017eb7113517cc032771f7717f88c0a93d4c',
  }),
});

if (process.argv.includes('--finalize')) finalize();
else adjudicate();

function adjudicate() {
  const exactHeadSha = resolveExactHead();
  const baseSha = resolveBaseSha();
  const currentMainSha = resolveCurrentMain();
  assert.equal(baseSha, currentMainSha, 'BB-12 candidate is not based on live current main.');
  assertGitAncestor(baseSha, exactHeadSha);
  assertGitAncestor(RETAINED.BB10.mergeSha, exactHeadSha);
  assertGitAncestor(RETAINED.BB11.mergeSha, exactHeadSha);

  const outputDir = resolve(process.env.BB12_OUTPUT_DIR ?? 'reports/bb12/run');
  mkdirSync(outputDir, { recursive: true });
  const changedPaths = readChangedPaths(baseSha, exactHeadSha);
  assert.deepEqual(
    changedPaths.map((row) => row.path),
    [...ALLOWED_PATHS].sort(),
    'BB-12 changed-path set is not the governed seven-path boundary.',
  );

  const paths = {
    bb00Bb05: requiredPath('BB12_BB00_BB05_REPORT_PATH'),
    bb06: requiredPath('BB12_BB06_REPORT_PATH'),
    bb07: requiredPath('BB12_BB07_REPORT_PATH'),
    bb08: requiredPath('BB12_BB08_REPORT_PATH'),
    bb09: requiredPath('BB12_BB09_REPORT_PATH'),
    retainedBb10: requiredPath('BB12_RETAINED_BB10_REPORT_PATH'),
    retainedBb11: requiredPath('BB12_RETAINED_BB11_REPORT_PATH'),
    sameHeadBb10A: requiredPath('BB12_SAME_HEAD_BB10_RUN_A_PATH'),
    sameHeadBb10B: requiredPath('BB12_SAME_HEAD_BB10_RUN_B_PATH'),
    sameHeadBb10StderrA: requiredPath('BB12_SAME_HEAD_BB10_STDERR_A_PATH'),
    sameHeadBb10StderrB: requiredPath('BB12_SAME_HEAD_BB10_STDERR_B_PATH'),
    sameHeadBb11A: requiredPath('BB12_SAME_HEAD_BB11_RUN_A_PATH'),
    sameHeadBb11B: requiredPath('BB12_SAME_HEAD_BB11_RUN_B_PATH'),
    sameHeadBb11StderrA: requiredPath('BB12_SAME_HEAD_BB11_STDERR_A_PATH'),
    sameHeadBb11StderrB: requiredPath('BB12_SAME_HEAD_BB11_STDERR_B_PATH'),
    roadmap: resolve(process.env.BB12_ROADMAP_PATH ?? 'docs/conceptcumroadmapLAFEA.md'),
  };
  const bytes = Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [key, readFileSync(path)]),
  );
  const reports = Object.fromEntries(
    Object.entries(paths)
      .filter(([key]) => key !== 'roadmap' && !key.includes('Stderr'))
      .map(([key]) => [key, JSON.parse(bytes[key].toString('utf8'))]),
  );

  validateBb00Bb05(reports.bb00Bb05, exactHeadSha);
  validateBb06Report(reports.bb06);
  validateBb07Report(reports.bb07);
  validateBb08Report(reports.bb08);
  validateBb09Report(reports.bb09);
  [reports.bb06, reports.bb07, reports.bb08, reports.bb09].forEach((report) => {
    assert.equal(report.exactHeadSha, exactHeadSha, `${report.schema} is stale.`);
  });

  validateBb10AxisymmetricRegistrationReport(reports.retainedBb10);
  const sameHeadBb10Replay = validateSameHeadBb10CoreReplay({
    runA: reports.sameHeadBb10A,
    runB: reports.sameHeadBb10B,
    stdoutA: bytes.sameHeadBb10A,
    stdoutB: bytes.sameHeadBb10B,
    stderrA: bytes.sameHeadBb10StderrA,
    stderrB: bytes.sameHeadBb10StderrB,
    exactHeadSha,
    baseSha,
  });
  validateBb11FlangeHubReport(reports.retainedBb11);
  const sameHeadBb11Replay = validateSameHeadBb11CoreReplay({
    runA: reports.sameHeadBb11A,
    runB: reports.sameHeadBb11B,
    stdoutA: bytes.sameHeadBb11A,
    stdoutB: bytes.sameHeadBb11B,
    stderrA: bytes.sameHeadBb11StderrA,
    stderrB: bytes.sameHeadBb11StderrB,
    exactHeadSha,
    baseSha,
  });
  assert.equal(sha256(bytes.retainedBb11), RETAINED.BB11.reportRawSha256);
  assert.equal(reports.retainedBb11.semanticHash, RETAINED.BB11.reportSemanticHash);
  assert.equal(String(reports.retainedBb11.artifactId), RETAINED.BB11.reportArtifactId);
  assert.equal(reports.retainedBb11.artifactDigest, RETAINED.BB11.reportArtifactDigest);
  assert.equal(reports.retainedBb11.bb12Authorized, true);

  validateBucketBRegistryForBb12(MODULE_REGISTRY);
  const registrySnapshotHash = semanticHash(MODULE_REGISTRY);
  const roadmapAssertions = validateRoadmap(bytes.roadmap);
  const checks = [];
  const addCheck = (checkId, evidence) => checks.push({
    checkId,
    status: 'PASS',
    evidenceHash: sha256Json(evidence),
  });
  addCheck('BB12_EXACT_HEAD_AND_CURRENT_MAIN', { exactHeadSha, baseSha, currentMainSha });
  addCheck('BB12_GOVERNED_CHANGED_PATHS', { changedPaths, allowlistHash: semanticHash(ALLOWED_PATHS) });
  addCheck('BB12_BB00_BB05_SAME_HEAD_VALID', reports.bb00Bb05.semanticHash);
  addCheck('BB12_BB06_BB09_SAME_HEAD_VALID', [reports.bb06, reports.bb07, reports.bb08, reports.bb09].map((row) => row.semanticHash));
  addCheck('BB12_BB10_RETAINED_AND_SAME_HEAD_VALID', { retained: reports.retainedBb10.semanticHash, replay: sameHeadBb10Replay.semanticHash });
  addCheck('BB12_BB11_RETAINED_AND_SAME_HEAD_VALID', { retained: reports.retainedBb11.semanticHash, replay: sameHeadBb11Replay.semanticHash });
  addCheck('BB12_REGISTRY_RECONCILED', { registrySnapshotHash, moduleIds: Object.keys(MODULE_REGISTRY).sort() });
  addCheck('BB12_ROADMAP_RECONCILED', roadmapAssertions);
  addCheck('BB12_FORBIDDEN_AUTHORITIES_WITHHELD', authorityVector(reports.retainedBb11));

  const packageReceipts = [
    packageReceipt('BB00-BB05', reports.bb00Bb05, bytes.bb00Bb05, exactHeadSha, 'SAME_HEAD_REPLAY'),
    packageReceipt('BB06', reports.bb06, bytes.bb06, exactHeadSha, 'SAME_HEAD_REPLAY'),
    packageReceipt('BB07', reports.bb07, bytes.bb07, exactHeadSha, 'SAME_HEAD_REPLAY'),
    packageReceipt('BB08', reports.bb08, bytes.bb08, exactHeadSha, 'SAME_HEAD_REPLAY'),
    packageReceipt('BB09', reports.bb09, bytes.bb09, exactHeadSha, 'SAME_HEAD_REPLAY'),
    packageReceipt('BB10', reports.retainedBb10, bytes.retainedBb10, reports.retainedBb10.exactHeadSha, 'RETAINED_PLUS_SAME_HEAD_REPLAY', sameHeadBb10Replay.semanticHash),
    packageReceipt('BB11', reports.retainedBb11, bytes.retainedBb11, reports.retainedBb11.exactHeadSha, 'RETAINED_PLUS_SAME_HEAD_REPLAY', sameHeadBb11Replay.semanticHash),
  ];
  const moduleReceipts = [
    moduleReceipt('C2D-LUG-PINHOLE', 'BB06', reports.bb06),
    moduleReceipt('C2D-CLAMP-EAR', 'BB06', reports.bb06),
    moduleReceipt('C2D-BRACKET-GUSSET', 'BB07', reports.bb07),
    moduleReceipt('C2D-PIPE-PAD-SECTION', 'BB08', reports.bb08),
    moduleReceipt('C2D-NOZZLE-REPAD-SECTION', 'BB09', reports.bb09),
    moduleReceipt('C2D-FLANGE-HUB', 'BB11', reports.retainedBb11),
  ];
  assert.equal(process.env.BB12_BB10_ARTIFACT_ID ?? RETAINED.BB10.artifactId, RETAINED.BB10.artifactId);
  assert.equal(process.env.BB12_BB10_ARTIFACT_DIGEST ?? RETAINED.BB10.artifactDigest, RETAINED.BB10.artifactDigest);
  assert.equal(process.env.BB12_BB11_FINAL_ARTIFACT_ID ?? RETAINED.BB11.finalArtifactId, RETAINED.BB11.finalArtifactId);
  assert.equal(process.env.BB12_BB11_FINAL_ARTIFACT_DIGEST ?? RETAINED.BB11.finalArtifactDigest, RETAINED.BB11.finalArtifactDigest);
  const retainedArtifactCustody = {
    BB10: {
      artifactId: process.env.BB12_BB10_ARTIFACT_ID ?? RETAINED.BB10.artifactId,
      artifactDigest: process.env.BB12_BB10_ARTIFACT_DIGEST ?? RETAINED.BB10.artifactDigest,
      reportRawSha256: sha256(bytes.retainedBb10),
      reportSemanticHash: reports.retainedBb10.semanticHash,
      mergeSha: RETAINED.BB10.mergeSha,
    },
    BB11: {
      artifactId: process.env.BB12_BB11_FINAL_ARTIFACT_ID ?? RETAINED.BB11.finalArtifactId,
      artifactDigest: process.env.BB12_BB11_FINAL_ARTIFACT_DIGEST ?? RETAINED.BB11.finalArtifactDigest,
      reportRawSha256: sha256(bytes.retainedBb11),
      reportSemanticHash: reports.retainedBb11.semanticHash,
      mergeSha: RETAINED.BB11.mergeSha,
    },
  };

  const evidence = createBb12CombinedEvidence({
    exactHeadSha,
    baseSha,
    packageReceipts,
    moduleReceipts,
    retainedArtifactCustody,
    registrySnapshotHash,
    roadmapAssertions,
    checkResults: checks,
    registry: MODULE_REGISTRY,
  });
  validateBb12CombinedEvidence(evidence, { expectedHeadSha: exactHeadSha, expectedBaseSha: baseSha });

  const rawEvidenceHashes = Object.keys(bytes).sort().map((key) => sha256(bytes[key]));
  const semanticEvidenceHashes = [
    ...packageReceipts.map((row) => row.sourceReportSemanticHash),
    ...moduleReceipts.map((row) => row.sourceReportSemanticHash),
    registrySnapshotHash,
    evidence.semanticHash,
  ];
  const sourceArtifactHashes = changedPaths.map((row) => sha256(readFileSync(resolve(ROOT, row.path))));
  const approval = createBb12CombinedApproval({
    evidence,
    changedPaths,
    sourceArtifactHashes,
    rawEvidenceHashes,
    semanticEvidenceHashes,
    checkResults: [
      ...checks,
      { checkId: 'BB12_COMBINED_EVIDENCE_CONTRACT_VALID', status: 'PASS', evidenceHash: evidence.semanticHash },
    ],
  });
  validateBb12CombinedApproval(approval, { expectedHeadSha: exactHeadSha, expectedBaseSha: baseSha });
  assert.throws(
    () => validateBb12CombinedApproval({ ...approval, productionSwitchAuthorized: true }),
    /HASH|AUTHORITY/,
  );

  const custodyPayload = {
    schema: 'bucket-b-bb12-finalization-custody/v1',
    exactHeadSha,
    baseSha,
    currentMainSha,
    changedPaths,
    packageReceipts,
    moduleReceipts,
    retainedArtifactCustody,
    registrySnapshotHash,
    roadmapAssertions,
    sameHeadCoreReplayEvidence: { BB10: sameHeadBb10Replay, BB11: sameHeadBb11Replay },
    evidenceHash: evidence.semanticHash,
    approvalHash: approval.semanticHash,
    checkResults: [
      ...approval.checkResults,
      { checkId: 'BB12_APPROVAL_CONTRACT_VALID', status: 'PASS', evidenceHash: approval.semanticHash },
    ],
    limitations: limitations(),
  };
  const custody = seal(custodyPayload);
  writeJson(outputDir, 'bucket-b-bb12-package-ledger.json', seal({
    schema: 'bucket-b-bb12-package-ledger/v1',
    exactHeadSha,
    packageReceipts,
    moduleReceipts,
    sameHeadCoreReplayEvidence: { BB10: sameHeadBb10Replay, BB11: sameHeadBb11Replay },
  }));
  writeJson(outputDir, 'bucket-b-bb12-evidence.json', evidence);
  writeJson(outputDir, 'bucket-b-bb12-approval.json', approval);
  writeJson(outputDir, 'bucket-b-bb12-custody.json', custody);
  process.stdout.write(`${JSON.stringify({
    status: 'BB12_EVIDENCE_AND_APPROVAL_CREATED',
    exactHeadSha,
    baseSha,
    evidenceHash: evidence.semanticHash,
    approvalHash: approval.semanticHash,
    custodyHash: custody.semanticHash,
  }, null, 2)}\n`);
}

function finalize() {
  const runADir = requiredPath('BB12_RUN_A_DIR');
  const runBDir = requiredPath('BB12_RUN_B_DIR');
  const outputDir = resolve(process.env.BB12_OUTPUT_DIR ?? 'reports/bb12/final');
  mkdirSync(outputDir, { recursive: true });
  const approvalABytes = readFileSync(resolve(runADir, 'bucket-b-bb12-approval.json'));
  const approvalBBytes = readFileSync(resolve(runBDir, 'bucket-b-bb12-approval.json'));
  assert.equal(Buffer.compare(approvalABytes, approvalBBytes), 0, 'BB-12 approvals differ between runs.');
  const custodyABytes = readFileSync(resolve(runADir, 'bucket-b-bb12-custody.json'));
  const custodyBBytes = readFileSync(resolve(runBDir, 'bucket-b-bb12-custody.json'));
  assert.equal(Buffer.compare(custodyABytes, custodyBBytes), 0, 'BB-12 custody differs between runs.');
  const approval = JSON.parse(approvalABytes.toString('utf8'));
  const custody = JSON.parse(custodyABytes.toString('utf8'));
  validateBb12CombinedApproval(approval, { expectedHeadSha: custody.exactHeadSha, expectedBaseSha: custody.baseSha });

  const stdoutA = readFileSync(requiredPath('BB12_RUN_A_STDOUT_PATH'));
  const stdoutB = readFileSync(requiredPath('BB12_RUN_B_STDOUT_PATH'));
  const stderrA = readFileSync(requiredPath('BB12_RUN_A_STDERR_PATH'));
  const stderrB = readFileSync(requiredPath('BB12_RUN_B_STDERR_PATH'));
  assert.equal(Buffer.compare(stdoutA, stdoutB), 0, 'BB-12 stdout differs between runs.');
  assert.equal(Buffer.compare(stderrA, stderrB), 0, 'BB-12 stderr differs between runs.');
  const manifestA = directoryManifest(runADir);
  const manifestB = directoryManifest(runBDir);
  assert.deepEqual(manifestA, manifestB, 'BB-12 artifact manifests differ between runs.');
  const replay = {
    byteIdentical: true,
    identityHash: semanticHash({
      exactHeadSha: custody.exactHeadSha,
      baseSha: custody.baseSha,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    }),
    runAArtifactManifestHash: semanticHash(manifestA),
    runBArtifactManifestHash: semanticHash(manifestB),
    stdoutHashA: sha256(stdoutA),
    stdoutHashB: sha256(stdoutB),
    stderrHashA: sha256(stderrA),
    stderrHashB: sha256(stderrB),
  };
  const report = createBb12CombinedReport({
    exactHeadSha: custody.exactHeadSha,
    baseSha: custody.baseSha,
    mergeBaseSha: custody.baseSha,
    currentMainSha: custody.currentMainSha,
    commitsBehindMain: 0,
    approval,
    artifactId: requiredTextEnv('BB12_ARTIFACT_ID'),
    artifactDigest: requiredTextEnv('BB12_ARTIFACT_DIGEST'),
    checkResults: [
      ...custody.checkResults,
      { checkId: 'BB12_BYTE_IDENTICAL_DOUBLE_EXECUTION', status: 'PASS', evidenceHash: semanticHash(replay) },
    ],
    replay,
    limitations: custody.limitations,
  });
  validateBb12CombinedReport(report, { expectedHeadSha: custody.exactHeadSha, expectedBaseSha: custody.baseSha });
  assert.throws(
    () => validateBb12CombinedReport({ ...report, moduleQualified: true }),
    /HASH|AUTHORITY/,
  );
  writeJson(outputDir, 'bucket-b-bb12-report.json', report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function validateBb00Bb05(report, exactHeadSha) {
  assert.equal(report?.schema, 'bucket-b-bb00-bb05-same-head-regression/v1');
  assert.equal(report.exactHeadSha, exactHeadSha);
  assert.equal(report.status, 'BB00_BB05_SAME_HEAD_REGRESSION_PASS');
  assert.ok(Array.isArray(report.checkResults) && report.checkResults.length > 0);
  assert.ok(report.checkResults.every((row) => row?.status === 'PASS'));
  assert.equal(report.authority?.applicationExecutionAuthorized, false);
  assert.equal(report.authority?.axisymmetricAuthorized, false);
  assert.equal(report.authority?.moduleQualified, false);
  assert.equal(report.authority?.productionSwitchAuthorized, false);
  assert.equal(report.authority?.bucket01Qualified, 'UNCHANGED');
  assert.equal(report.semanticHash, semanticHash(withoutHash(report)));
}

function validateSameHeadBb10CoreReplay({ runA, runB, stdoutA, stdoutB, stderrA, stderrB, exactHeadSha, baseSha }) {
  assert.equal(Buffer.compare(stdoutA, stdoutB), 0, 'Same-head BB-10 stdout is not byte-identical.');
  assert.equal(Buffer.compare(stderrA, stderrB), 0, 'Same-head BB-10 stderr is not byte-identical.');
  assert.deepEqual(runA, runB);
  assert.equal(runA.semanticHash, semanticHash(withoutHash(runA)));
  assert.ok(Array.isArray(runA.checkResults) && runA.checkResults.length > 0);
  assert.ok(runA.checkResults.every((row) => row?.status === 'PASS'));
  assert.ok(Array.isArray(runA.cases) && runA.cases.length === 3);
  assert.ok(runA.cases.every((row) => row?.status === 'PASS'));
  return seal({
    schema: 'bucket-b-bb12-bb10-same-head-core-replay/v1',
    exactHeadSha,
    baseSha,
    coreSemanticHash: runA.semanticHash,
    stdoutHashA: sha256(stdoutA),
    stdoutHashB: sha256(stdoutB),
    stderrHashA: sha256(stderrA),
    stderrHashB: sha256(stderrB),
    status: 'PASS',
  });
}

function validateSameHeadBb11CoreReplay({ runA, runB, stdoutA, stdoutB, stderrA, stderrB, exactHeadSha, baseSha }) {
  assert.equal(Buffer.compare(stdoutA, stdoutB), 0, 'Same-head BB-11 stdout is not byte-identical.');
  assert.equal(Buffer.compare(stderrA, stderrB), 0, 'Same-head BB-11 stderr is not byte-identical.');
  assert.deepEqual(runA, runB);
  assert.equal(runA.semanticHash, semanticHash(withoutHash(runA)));
  assert.equal(runA.applicationProcedureAccepted, true);
  assert.equal(runA.numericalOutputAccepted, true);
  assert.ok(Array.isArray(runA.checkResults) && runA.checkResults.length > 0);
  assert.ok(runA.checkResults.every((row) => row?.status === 'PASS'));
  return seal({
    schema: 'bucket-b-bb12-bb11-same-head-core-replay/v1',
    exactHeadSha,
    baseSha,
    coreSemanticHash: runA.semanticHash,
    geometryEvidenceHash: runA.geometryEvidence.semanticHash,
    meshEvidenceHash: runA.meshEvidence.semanticHash,
    coreEvidenceHash: runA.coreEvidence.semanticHash,
    outputEvidenceHash: runA.outputEvidence.semanticHash,
    independentEvidenceHash: runA.independentEvidence.semanticHash,
    stdoutHashA: sha256(stdoutA),
    stdoutHashB: sha256(stdoutB),
    stderrHashA: sha256(stderrA),
    stderrHashB: sha256(stderrB),
    status: 'PASS',
  });
}

function validateRoadmap(roadmapBytes) {
  const text = roadmapBytes.toString('utf8');
  assert.match(text, /final combined adjudication package, BB-12/i);
  assert.match(text, /BB-12 may begin only when[\s\S]{0,240}BB12_AUTHORIZED/i);
  assert.match(text, /No Bucket B package currently grants automatic production execution or code compliance/i);
  assert.match(text, /Bucket-01|BUCKET_01/i);
  return {
    bb12Required: true,
    noAutomaticProductionAuthority: true,
    noCodeAssessmentAuthority: true,
    bucket01Unchanged: true,
    roadmapRawSha256: sha256(roadmapBytes),
  };
}

function packageReceipt(packageId, report, reportBytes, sourceHeadSha, custodyKind, replayEvidenceHash) {
  return {
    packageId,
    sourceReportSchema: report.schema,
    sourceReportSemanticHash: report.semanticHash,
    sourceReportRawSha256: sha256(reportBytes),
    sourceHeadSha,
    custodyKind,
    ...(replayEvidenceHash ? { replayEvidenceHash } : {}),
    status: 'PASS',
  };
}

function moduleReceipt(moduleId, sourcePackageId, report) {
  const row = MODULE_REGISTRY[moduleId];
  return {
    moduleId,
    formulationProfile: row.formulationProfile,
    elementProfile: row.elementProfile,
    sourcePackageId,
    sourceReportSemanticHash: report.semanticHash,
    applicationProcedureQualified: true,
    numericalOutputQualified: true,
  };
}

function authorityVector(report) {
  return {
    flangeHubApplicationProcedureQualified: report.flangeHubApplicationProcedureQualified,
    flangeHubNumericalOutputQualified: report.flangeHubNumericalOutputQualified,
    bb12Authorized: report.bb12Authorized,
    codeAssessmentQualified: report.codeAssessmentQualified,
    moduleQualified: report.moduleQualified,
    applicationModulePromoted: report.applicationModulePromoted,
    productionSwitchAuthorized: report.productionSwitchAuthorized,
    bucket01Qualified: report.bucket01Qualified,
  };
}

function limitations() {
  return [
    'BUCKET_B_COMPLETION_IS_EVIDENCE_ADJUDICATION_ONLY',
    'NO_CODE_ASSESSMENT_AUTHORITY',
    'NO_MODULE_QUALIFICATION_AUTHORITY',
    'NO_APPLICATION_MODULE_PROMOTION_AUTHORITY',
    'NO_PRODUCTION_SWITCH_AUTHORITY',
    'BUCKET_01_AUTHORITY_UNCHANGED',
    'NO_NEW_NUMERICAL_MECHANICS_OR_TOLERANCE_CHANGES',
  ];
}

function readChangedPaths(baseSha, headSha) {
  const provided = process.env.BB12_CHANGED_PATHS_PATH;
  if (provided) {
    const rows = JSON.parse(readFileSync(resolve(provided), 'utf8'));
    return [...rows].sort((a, b) => a.path.localeCompare(b.path));
  }
  return git(['diff', '--name-status', `${baseSha}...${headSha}`])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const fields = line.split('\t');
      return fields[0].startsWith('R')
        ? { status: 'R', oldPath: fields[1], path: fields[2] }
        : { status: fields[0], path: fields[1] };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function directoryManifest(directory) {
  const root = resolve(directory);
  const files = walk(root).sort();
  return files.map((path) => ({
    path: relative(root, path).replaceAll('\\', '/'),
    rawSha256: sha256(readFileSync(path)),
    bytes: statSync(path).size,
  }));
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function resolveExactHead() {
  const head = git(['rev-parse', 'HEAD']);
  const expected = process.env.EXPECTED_HEAD_SHA ?? head;
  assert.match(expected, /^[0-9a-f]{40}$/u);
  assert.equal(head, expected);
  return head;
}
function resolveBaseSha() {
  const value = process.env.EXPECTED_BASE_SHA ?? git(['merge-base', 'origin/main', 'HEAD']);
  assert.match(value, /^[0-9a-f]{40}$/u);
  return value;
}
function resolveCurrentMain() {
  const value = process.env.CURRENT_MAIN_SHA ?? git(['rev-parse', 'origin/main']);
  assert.match(value, /^[0-9a-f]{40}$/u);
  return value;
}
function assertGitAncestor(ancestor, descendant) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: ROOT });
  assert.equal(result.status, 0, `${ancestor} is not an ancestor of ${descendant}`);
}
function requiredPath(name) {
  const value = process.env[name];
  if (!value) throw new TypeError(`${name} is required.`);
  return resolve(value);
}
function requiredTextEnv(name) {
  const value = process.env[name];
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
}
function writeJson(directory, name, value) {
  const path = resolve(directory, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function seal(value) {
  return { ...value, semanticHash: semanticHash(value) };
}
function withoutHash(value) {
  const copy = JSON.parse(JSON.stringify(value));
  delete copy.semanticHash;
  return copy;
}
function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
function sha256Json(value) {
  return sha256(JSON.stringify(value));
}
function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 ** 3,
  }).trim();
}
