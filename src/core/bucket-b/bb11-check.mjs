#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BB11_REQUIRED_CHECK_IDS,
  FLANGE_HUB_SOLVER_POLICY,
  QUALIFICATION_STATES,
  advanceQualificationState,
  createAxisymmetricRegistrationAdoptionReceipt,
  createBb11FlangeHubApproval,
  createBb11FlangeHubReport,
  createBenchmarkRecord,
  runBb11FlangeHubCore,
  validateAxisymmetricRegistrationAdoptionReceipt,
  validateBb11FlangeHubApproval,
  validateBb11FlangeHubReport,
} from './index.js';
import { semanticHash } from '../shared-piping-model/index.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const SCRIPT = resolve(new URL(import.meta.url).pathname);
const CORE_CHILD_TIMEOUT_MS = 14 * 60 * 1000;
const GOVERNED_BB10_PATHS = Object.freeze([
  'src/core/bucket-b/q8-kernel.js',
  'src/core/bucket-b/axisymmetric-q8-kernel.js',
  'src/core/bucket-b/axisymmetric-edge-load.js',
  'src/core/bucket-b/axisymmetric-recovery.js',
  'src/core/bucket-b/axisymmetric-independent-oracle.js',
  'src/core/bucket-b/axisymmetric-bb10-patch.js',
  'src/core/bucket-b/axisymmetric-bb10-load-cases.js',
  'src/core/bucket-b/axisymmetric-bb10-lame.js',
  'src/core/bucket-b/axisymmetric-bb10-core.js',
  'src/core/bucket-b/axisymmetric-registration.js',
  'src/core/shared-piping-model/canonical-json.js',
  'src/core/shared-piping-model/immutable.js',
  'src/core/shared-piping-model/index.js',
]);
const BB11_ALLOWED_PATHS = Object.freeze([
  '.github/workflows/bucket-b-bb11-flange-hub.yml',
  'docs/Bucket_B_BB11_Flange_Hub_Qualification_Record.md',
  'src/core/bucket-b/bb11-check.mjs',
  'src/core/bucket-b/bb11-flange-hub.js',
  'src/core/bucket-b/bb11-shared-gate-replay.mjs',
  'src/core/bucket-b/flange-hub-authority.js',
  'src/core/bucket-b/flange-hub-convergence.js',
  'src/core/bucket-b/flange-hub-geometry.js',
  'src/core/bucket-b/flange-hub-independent-oracle.js',
  'src/core/bucket-b/flange-hub-loads.js',
  'src/core/bucket-b/flange-hub-mesh.js',
  'src/core/bucket-b/flange-hub-mesh-v2.js',
  'src/core/bucket-b/flange-hub-recovery.js',
  'src/core/bucket-b/flange-hub-reference.js',
  'src/core/bucket-b/flange-hub-solver.js',
  'src/core/bucket-b/index.js',
  'src/core/bucket-b/registry.js',
  'tests/bucket-b-bb11-flange-hub.test.mjs',
  'tests/bucket-b-bb11-independent-oracle-repair.test.mjs',
  'tests/bucket-b-bb11-production-mesh-v2.test.mjs',
  'docs/conceptcumroadmapLAFEA.md',
]);

if (process.argv.includes('--core')) {
  process.stdout.write(`${JSON.stringify(runBb11FlangeHubCore(), null, 2)}\n`);
} else if (process.argv.includes('--finalize')) {
  finalizeReport();
} else {
  createEvidenceAndApproval();
}

function createEvidenceAndApproval() {
  const exactHeadSha = resolveExactHead();
  const baseSha = resolveBaseSha();
  const currentMainSha = resolveCurrentMain();
  assert.equal(baseSha, currentMainSha, 'BB-11 branch must be zero commits behind current main.');
  assertGitAncestor(baseSha, exactHeadSha);
  const outputDir = resolve(process.env.BB11_OUTPUT_DIR ?? 'reports/bb11');
  mkdirSync(outputDir, { recursive: true });

  const coreA = runChild(['--core'], 'core-a', outputDir);
  assertChildSuccess(coreA, 'BB-11 core A');
  const coreB = runChild(['--core'], 'core-b', outputDir);
  assertChildSuccess(coreB, 'BB-11 core B');
  assert.equal(coreA.stdout, coreB.stdout, 'BB-11 core stdout replay is not byte-identical.');
  assert.equal(coreA.stderr, coreB.stderr, 'BB-11 core stderr replay is not byte-identical.');
  const core = JSON.parse(coreA.stdout);
  assert.equal(core.semanticHash, semanticHash(withoutHash(core)));

  const bb10A = runBb10Core();
  const bb10B = runBb10Core();
  assert.equal(bb10A.status, 0, bb10A.stderr);
  assert.equal(bb10B.status, 0, bb10B.stderr);
  assert.equal(bb10A.stdout, bb10B.stdout, 'Same-head BB-10 replay is not byte-identical.');
  assert.equal(bb10A.stderr, bb10B.stderr, 'Same-head BB-10 stderr replay is not byte-identical.');
  const bb10Core = JSON.parse(bb10A.stdout);
  assert.equal(bb10Core.semanticHash, semanticHash(withoutHash(bb10Core)));

  const upstreamReportPath = requiredPath('BB11_UPSTREAM_BB10_REPORT_PATH');
  const upstreamReportBytes = readFileSync(upstreamReportPath);
  const upstreamReport = JSON.parse(upstreamReportBytes.toString('utf8'));
  const upstreamApprovedHead = upstreamReport.exactHeadSha;
  const upstreamMergedHead = process.env.BB11_UPSTREAM_BB10_MERGED_HEAD_SHA
    ?? '1e7cbb13a9da66bad2d27da3fc31d7edebad5ed4';
  assertGitAncestor(upstreamApprovedHead, exactHeadSha);
  assertGitAncestor(upstreamMergedHead, exactHeadSha);

  const approvedManifest = blobManifest(upstreamApprovedHead, GOVERNED_BB10_PATHS);
  const currentManifest = blobManifest(exactHeadSha, GOVERNED_BB10_PATHS);
  assert.deepEqual(approvedManifest, currentManifest, 'Governed BB-10 source blobs changed.');
  const changedPaths = gitChangedPaths(baseSha, exactHeadSha);
  changedPaths.forEach((row) => assert.ok(BB11_ALLOWED_PATHS.includes(row.path), `BB11_CHANGED_PATH_OUTSIDE_ALLOWLIST:${row.path}`));

  const sameHeadReplayPayload = {
    schema: 'bucket-b-bb10-same-head-registration-replay-evidence/v1',
    currentExactHeadSha: exactHeadSha,
    currentBaseSha: baseSha,
    upstreamApprovedHeadSha: upstreamApprovedHead,
    upstreamApprovalSemanticHash: upstreamReport.approvalReceipt.semanticHash,
    upstreamReportSemanticHash: upstreamReport.semanticHash,
    registrationCases: bb10Core.cases,
    productionReplayEvidenceHashes: [sha256(bb10A.stdout), sha256(bb10B.stdout)],
    independentOracleEvidenceHashes: [
      bb10Core.oracleDescriptor.semanticHash,
      ...bb10Core.independentComparisons.map((row) => row.evidenceHash),
    ],
    status: 'PASS',
  };
  const sameHeadReplay = seal(sameHeadReplayPayload);
  const replay = {
    identityHash: semanticHash({ exactHeadSha, baseSha, node: process.version, platform: process.platform, arch: process.arch }),
    runAArtifactManifestHash: sha256(coreA.stdout),
    runBArtifactManifestHash: sha256(coreB.stdout),
    stdoutHashA: sha256(coreA.stdout),
    stdoutHashB: sha256(coreB.stdout),
    stderrHashA: sha256(coreA.stderr),
    stderrHashB: sha256(coreB.stderr),
    byteIdentical: true,
  };

  const custodyChecks = [];
  const addCheck = (checkId, evidence) => custodyChecks.push({ checkId, status: 'PASS', evidenceHash: sha256Json(evidence) });
  addCheck('BB11_CURRENT_MAIN_ANCESTRY', { exactHeadSha, baseSha, currentMainSha });
  addCheck('BB11_CHANGED_PATH_AUDIT', { changedPaths, allowedPathHash: semanticHash(BB11_ALLOWED_PATHS) });
  addCheck('BB11_BB10_UPSTREAM_APPROVAL_VALID', { reportHash: upstreamReport.semanticHash, approvalHash: upstreamReport.approvalReceipt.semanticHash });
  addCheck('BB11_BB10_SOURCE_BLOB_IDENTITY', { approvedManifest, currentManifest });
  addCheck('BB11_BB10_SAME_HEAD_REPLAY', sameHeadReplay);

  const adoption = createAxisymmetricRegistrationAdoptionReceipt({
    currentExactHeadSha: exactHeadSha,
    currentBaseSha: baseSha,
    currentMergeBaseSha: baseSha,
    upstreamBb10Report: upstreamReport,
    upstreamBb10ReportRawSha256: sha256(upstreamReportBytes),
    upstreamArtifactId: process.env.BB11_UPSTREAM_ARTIFACT_ID ?? '8901921021',
    upstreamArtifactDigest: process.env.BB11_UPSTREAM_ARTIFACT_DIGEST ?? 'sha256:317731aefd35b87bce2b7221704a1e34753aba97bb4513310001b407346b74b7',
    governedBb10PathList: GOVERNED_BB10_PATHS,
    governedBb10BlobHashesAtApprovedHead: approvedManifest,
    governedBb10BlobHashesAtCurrentHead: currentManifest,
    sameHeadBb10ReplayEvidence: sameHeadReplay,
    sameHeadIndependentOracleEvidenceHashes: sameHeadReplay.independentOracleEvidenceHashes,
    currentChangedPaths: changedPaths,
    bb11AllowedWriteSetHash: semanticHash(BB11_ALLOWED_PATHS),
    stdoutHash: sha256(bb10A.stdout),
    stderrHash: sha256(bb10A.stderr),
    deterministicReplayIdentity: replay.identityHash,
    ancestry: {
      upstreamApprovedHeadIsAncestor: true,
      upstreamMergedHeadIsAncestor: true,
      upstreamMergedHeadSha: upstreamMergedHead,
    },
  });
  validateAxisymmetricRegistrationAdoptionReceipt(adoption, { expectedHeadSha: exactHeadSha, expectedBaseSha: baseSha });
  addCheck('BB11_BB10_ADOPTION_RECEIPT_VALID', adoption);

  assert.throws(() => validateAxisymmetricRegistrationAdoptionReceipt(adoption, { expectedHeadSha: alternateSha(exactHeadSha) }), /STALE_HEAD/);
  addCheck('BB11_STALE_RECEIPT_REJECTED', { staleReceiptRejected: true });
  assert.throws(() => validateAxisymmetricRegistrationAdoptionReceipt({ ...adoption, status: 'PASS' }), /HASH|SEMANTIC/);
  addCheck('BB11_TAMPERED_RECEIPT_REJECTED', { tamperedReceiptRejected: true });
  assert.throws(() => validateAxisymmetricRegistrationAdoptionReceipt({ ...adoption, codeAssessmentQualified: true }), /HASH|AUTHORITY/);
  addCheck('BB11_ADOPTION_FORBIDDEN_AUTHORITY_REJECTED', { forbiddenAuthorityRejected: true });

  const bindings = benchmarkBindings({ exactHeadSha, baseSha, core, stdoutHash: sha256(coreA.stdout), stderrHash: sha256(coreA.stderr) });
  const records = ['MESH', 'CORE', 'OUT'].map((recordKind) => {
    let record = createBenchmarkRecord({ moduleId: 'C2D-FLANGE-HUB', recordKind, bindings });
    record = advanceQualificationState(record, QUALIFICATION_STATES.FORMULATION_QUALIFIED, {
      axisymmetricRegistrationAdoptionReceipt: adoption,
    });
    record = advanceQualificationState(record, QUALIFICATION_STATES.APPLICATION_PROCEDURE_QUALIFIED, {
      applicationProcedureEvidenceHash: core.coreEvidence.semanticHash,
    });
    if (recordKind === 'OUT') {
      record = advanceQualificationState(record, QUALIFICATION_STATES.NUMERICAL_OUTPUT_QUALIFIED, {
        numericalOutputEvidenceHash: core.outputEvidence.semanticHash,
        independentCheckerEvidenceHash: core.independentEvidence.semanticHash,
      });
    }
    return record;
  });
  assert.throws(() => createBenchmarkRecord({ moduleId: 'C2D-FLANGE-HUB', recordKind: 'CORE', state: 'FORMULATION_QUALIFIED' }), /state.*authority/i);
  addCheck('BB11_REGISTRY_CALLER_STATE_REJECTED', { callerStateRejected: true });

  const allChecks = [...core.checkResults, ...custodyChecks];
  const approval = createBb11FlangeHubApproval({
    exactHeadSha,
    baseSha,
    adoptionReceipt: adoption,
    geometryEvidenceHash: core.geometryEvidence.semanticHash,
    meshEvidenceHash: core.meshEvidence.semanticHash,
    coreEvidenceHash: core.coreEvidence.semanticHash,
    outputEvidenceHash: core.outputEvidence.semanticHash,
    independentCheckerEvidenceHash: core.independentEvidence.semanticHash,
    sourceArtifactHashes: changedPaths.map((row) => sha256(readFileSync(resolve(ROOT, row.path)))),
    rawEvidenceHashes: [sha256(coreA.stdout), sha256(coreA.stderr), sha256(bb10A.stdout), sha256(bb10A.stderr), sha256(upstreamReportBytes)],
    semanticEvidenceHashes: [core.semanticHash, core.geometryEvidence.semanticHash, core.meshEvidence.semanticHash, core.coreEvidence.semanticHash, core.outputEvidence.semanticHash, core.independentEvidence.semanticHash, sameHeadReplay.semanticHash, adoption.semanticHash],
    changedPaths,
    checkResults: allChecks,
    applicationProcedureAccepted: core.applicationProcedureAccepted,
    numericalOutputAccepted: core.numericalOutputAccepted,
  });
  validateBb11FlangeHubApproval(approval, { expectedHeadSha: exactHeadSha, expectedBaseSha: baseSha });
  assert.throws(() => validateBb11FlangeHubApproval({ ...approval, moduleQualified: true }), /HASH|AUTHORITY/);

  const prerequisiteReportHashes = prerequisiteHashes({ sameHeadReplay, adoption });
  const custody = seal({
    schema: 'bucket-b-bb11-finalization-custody/v1',
    exactHeadSha,
    baseSha,
    currentMainSha,
    changedPaths,
    records,
    approvalHash: approval.semanticHash,
    prerequisiteReportHashes,
    checkResults: [...allChecks, { checkId: 'BB11_DETERMINISTIC_REPORT_REPLAY', status: 'PASS', evidenceHash: sha256Json(replay) }],
    replay,
    limitations: limitations(),
  });

  writeJson(outputDir, 'bucket-b-bb10-same-head-regression.json', sameHeadReplay);
  writeJson(outputDir, 'bucket-b-axisymmetric-adoption-receipt.json', adoption);
  writeJson(outputDir, 'bucket-b-bb11-geometry-evidence.json', core.geometryEvidence);
  writeJson(outputDir, 'bucket-b-bb11-mesh-evidence.json', core.meshEvidence);
  writeJson(outputDir, 'bucket-b-bb11-core-evidence.json', core.coreEvidence);
  writeJson(outputDir, 'bucket-b-bb11-output-evidence.json', core.outputEvidence);
  writeJson(outputDir, 'bucket-b-bb11-independent-evidence.json', core.independentEvidence);
  writeJson(outputDir, 'bucket-b-bb11-approval.json', approval);
  writeJson(outputDir, 'bucket-b-bb11-custody.json', custody);
  writeFileSync(resolve(outputDir, 'bucket-b-bb11-stdout.json'), coreA.stdout);
  writeFileSync(resolve(outputDir, 'bucket-b-bb11-stdout-replay.json'), coreB.stdout);
  writeFileSync(resolve(outputDir, 'bucket-b-bb11-stderr.log'), coreA.stderr);
  writeFileSync(resolve(outputDir, 'bucket-b-bb11-stderr-replay.log'), coreB.stderr);
  process.stdout.write(`${JSON.stringify({ status: 'BB11_EVIDENCE_AND_APPROVAL_CREATED', exactHeadSha, baseSha, approvalHash: approval.semanticHash, adoptionHash: adoption.semanticHash, custodyHash: custody.semanticHash }, null, 2)}\n`);
}

function finalizeReport() {
  const outputDir = resolve(process.env.BB11_OUTPUT_DIR ?? 'reports/bb11');
  const approval = JSON.parse(readFileSync(resolve(outputDir, 'bucket-b-bb11-approval.json'), 'utf8'));
  const custody = JSON.parse(readFileSync(resolve(outputDir, 'bucket-b-bb11-custody.json'), 'utf8'));
  const artifactId = requiredTextEnv('BB11_ARTIFACT_ID');
  const artifactDigest = requiredTextEnv('BB11_ARTIFACT_DIGEST');
  const report = createBb11FlangeHubReport({
    exactHeadSha: custody.exactHeadSha,
    baseSha: custody.baseSha,
    mergeBaseSha: custody.baseSha,
    currentMainSha: custody.currentMainSha,
    commitsBehindMain: 0,
    approval,
    prerequisiteReportHashes: custody.prerequisiteReportHashes,
    artifactId,
    artifactDigest,
    checkResults: custody.checkResults,
    limitations: custody.limitations,
    replay: custody.replay,
  });
  validateBb11FlangeHubReport(report, { expectedHeadSha: custody.exactHeadSha, expectedBaseSha: custody.baseSha });
  assert.throws(() => validateBb11FlangeHubReport({ ...report, productionSwitchAuthorized: true }), /HASH|AUTHORITY/);
  writeJson(outputDir, 'bucket-b-bb11-report.json', report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function benchmarkBindings({ exactHeadSha, baseSha, core, stdoutHash, stderrHash }) {
  return {
    exactHeadSha,
    currentBaseSha: baseSha,
    geometryHash: core.geometryEvidence.semanticHash,
    meshProfileHash: semanticHash({ meshFamilyId: core.meshEvidence.meshFamilyId }),
    meshHashesByLevel: core.meshEvidence.meshHashesByLevel,
    canonicalModelHashesByLevel: core.meshEvidence.canonicalModelHashesByLevel,
    solverPolicyHash: semanticHash(FLANGE_HUB_SOLVER_POLICY),
    loadIntegrationProfileHash: semanticHash('AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1'),
    recoveryProfileHash: semanticHash('AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1'),
    pathDefinitionHash: core.coreEvidence.pathDefinitionHash,
    referenceAuthorityHash: core.independentEvidence.referenceRegistry.semanticHash,
    observedEvidenceHashes: [core.geometryEvidence.semanticHash, core.meshEvidence.semanticHash, core.coreEvidence.semanticHash, core.outputEvidence.semanticHash, core.independentEvidence.semanticHash],
    stdoutHash,
    stderrHash,
  };
}

function prerequisiteHashes({ sameHeadReplay, adoption }) {
  const result = {
    bb10SameHead: sameHeadReplay.semanticHash,
    axisymmetricAdoption: adoption.semanticHash,
  };
  const envPaths = {
    bb00Bb05: process.env.BB11_BB00_BB05_REPORT_PATH,
    bb06: process.env.BB11_BB06_REPORT_PATH,
    bb07: process.env.BB11_BB07_REPORT_PATH,
    bb08: process.env.BB11_BB08_REPORT_PATH,
    bb09: process.env.BB11_BB09_REPORT_PATH,
  };
  Object.entries(envPaths).forEach(([key, path]) => {
    if (path) result[key] = sha256(readFileSync(resolve(path)));
  });
  return result;
}
function limitations() {
  return [
    'NO_ASME_OR_OTHER_CODE_ASSESSMENT',
    'NO_BOLTS_GASKET_CONTACT_SEPARATION_OR_LEAK_TIGHTNESS',
    'NO_PLASTICITY_FATIGUE_BUCKLING_THERMAL_RATCHETING_OR_THREE_DIMENSIONAL_EFFECTS',
    'SMALL_STRAIN_LINEAR_HOMOGENEOUS_ISOTROPIC_ELASTICITY_ONLY',
    'ELEMENTS_TOUCHING_OR_CROSSING_R_ZERO_EXCLUDED',
    'QUALIFICATION_LIMITED_TO_BKT-B-FLANGE-GEOMETRY-V1_AND_REGISTERED_LOAD_CASES',
  ];
}
function blobManifest(commitSha, paths) {
  return [...paths].sort().map((path) => {
    const gitBlobOid = git(['rev-parse', `${commitSha}:${path}`]);
    const bytes = execFileSync('git', ['show', `${commitSha}:${path}`], { cwd: ROOT, maxBuffer: 1024 ** 3 });
    const treeRow = git(['ls-tree', commitSha, '--', path]);
    const fileMode = treeRow.split(/\s+/u)[0];
    return { path, gitBlobOid, rawSha256: sha256(bytes), fileMode };
  });
}
function gitChangedPaths(baseSha, headSha) {
  const lines = git(['diff', '--name-status', `${baseSha}...${headSha}`]).split('\n').filter(Boolean);
  return lines.map((line) => {
    const fields = line.split('\t');
    if (fields[0].startsWith('R')) return { status: 'R', oldPath: fields[1], path: fields[2] };
    return { status: fields[0], path: fields[1] };
  }).sort((a, b) => a.path.localeCompare(b.path));
}
function runChild(args, label, outputDir) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 ** 3,
    timeout: CORE_CHILD_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    env: { ...process.env, BB11_DIAGNOSTICS: '1' },
  });
  writeFileSync(resolve(outputDir, `bucket-b-bb11-${label}-partial-stdout.log`), result.stdout ?? '');
  writeFileSync(resolve(outputDir, `bucket-b-bb11-${label}-partial-stderr.log`), result.stderr ?? '');
  writeJson(outputDir, `bucket-b-bb11-${label}-termination.json`, {
    status: result.status,
    signal: result.signal,
    errorCode: result.error?.code ?? null,
    errorMessage: result.error?.message ?? null,
    timeoutMs: CORE_CHILD_TIMEOUT_MS,
  });
  return result;
}
function assertChildSuccess(result, label) {
  assert.equal(
    result.error,
    undefined,
    `${label} process error: ${result.error?.code ?? 'UNKNOWN'}: ${result.error?.message ?? ''}\n${result.stderr ?? ''}`,
  );
  assert.equal(result.status, 0, `${label} failed with signal ${result.signal ?? 'none'}:\n${result.stderr ?? ''}`);
}
function runBb10Core() { return spawnSync(process.execPath, [resolve(ROOT, 'src/core/bucket-b/bb10-check.mjs'), '--core'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 ** 3, env: { ...process.env } }); }
function resolveExactHead() { const head = git(['rev-parse', 'HEAD']); const expected = process.env.EXPECTED_HEAD_SHA ?? head; assert.equal(head, expected); return head; }
function resolveBaseSha() { const value = process.env.EXPECTED_BASE_SHA ?? git(['merge-base', 'origin/main', 'HEAD']); assert.match(value, /^[0-9a-f]{40}$/u); return value; }
function resolveCurrentMain() { const value = process.env.CURRENT_MAIN_SHA ?? git(['rev-parse', 'origin/main']); assert.match(value, /^[0-9a-f]{40}$/u); return value; }
function assertGitAncestor(ancestor, descendant) { const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: ROOT }); assert.equal(result.status, 0, `${ancestor} is not ancestor of ${descendant}`); }
function requiredPath(name) { const value = process.env[name]; if (!value) throw new TypeError(`${name} is required.`); return resolve(value); }
function requiredTextEnv(name) { const value = process.env[name]; if (!value) throw new TypeError(`${name} is required.`); return value; }
function writeJson(directory, name, value) { writeFileSync(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`); }
function seal(value) { return { ...value, semanticHash: semanticHash(value) }; }
function withoutHash(value) { const copy = JSON.parse(JSON.stringify(value)); delete copy.semanticHash; return copy; }
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function sha256Json(value) { return sha256(JSON.stringify(value)); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 ** 3 }).trim(); }
function alternateSha(value) { return `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`; }
