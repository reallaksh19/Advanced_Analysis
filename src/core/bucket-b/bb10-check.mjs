#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { QUALIFICATION_STATES, advanceQualificationState, createBenchmarkRecord } from './registry.js';
import { validateSharedGateQualificationReceipt } from './qualification-receipt.js';
import { validateBb06Report } from './bb06-lug-clamp.js';
import { validateBb07Report } from './bb07-bracket-gusset.js';
import {
  AXISYMMETRIC_INDEPENDENT_ORACLE_DESCRIPTOR,
} from './axisymmetric-independent-oracle.js';
import {
  createAxisymmetricIndependentCheckerEvidence,
  createAxisymmetricRegistrationApproval,
  createBb10AxisymmetricRegistrationReport,
  validateAxisymmetricRegistrationApprovalReceipt,
  validateBb10AxisymmetricRegistrationReport,
} from './axisymmetric-registration.js';
import { runCoreQualification } from './axisymmetric-bb10-core.js';
import { semanticHash } from '../shared-piping-model/index.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const REQUIRED_SOURCE_PATHS = Object.freeze([
  'src/core/bucket-b/axisymmetric-q8-kernel.js',
  'src/core/bucket-b/axisymmetric-edge-load.js',
  'src/core/bucket-b/axisymmetric-recovery.js',
  'src/core/bucket-b/axisymmetric-independent-oracle.js',
  'src/core/bucket-b/axisymmetric-registration.js',
  'src/core/bucket-b/axisymmetric-bb10-patch.js',
  'src/core/bucket-b/axisymmetric-bb10-load-cases.js',
  'src/core/bucket-b/axisymmetric-bb10-lame.js',
  'src/core/bucket-b/axisymmetric-bb10-core.js',
  'src/core/bucket-b/bb10-check.mjs',
  'src/core/bucket-b/registry.js',
  'src/core/bucket-b/index.js',
  '.github/workflows/bucket-b-bb10-axisymmetric-registration.yml',
]);

if (process.argv.includes('--core')) {
  process.stdout.write(`${JSON.stringify(runCoreQualification(), null, 2)}\n`);
} else {
  runAuthoritativeParent();
}

function runAuthoritativeParent() {
  const exactHeadSha = resolveExactHead();
  const baseSha = resolveBaseSha();
  const first = runCoreChild();
  const second = runCoreChild();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout, 'BB-10 core replay is not byte-identical.');
  assert.equal(first.stderr, second.stderr, 'BB-10 core stderr replay is not byte-identical.');
  const coreEvidence = JSON.parse(first.stdout);
  assert.equal(coreEvidence.semanticHash, semanticHash(withoutHash(coreEvidence)));
  writeEvidenceFile(process.env.BB10_CORE_STDOUT_PATH, first.stdout);
  writeEvidenceFile(process.env.BB10_CORE_STDERR_PATH, first.stderr);

  const sharedReport = readJson(requiredEnvPath('BB10_SHARED_REPORT_PATH'));
  validateSharedGateQualificationReceipt(sharedReport.qualificationReceipt);
  assert.equal(sharedReport.qualificationReceipt.exactHeadSha, exactHeadSha);
  const bb06Report = readJson(requiredEnvPath('BB06_REPORT_PATH'));
  const bb07Report = readJson(requiredEnvPath('BB07_REPORT_PATH'));
  validateBb06Report(bb06Report);
  validateBb07Report(bb07Report);
  assert.equal(bb06Report.exactHeadSha, exactHeadSha);
  assert.equal(bb07Report.exactHeadSha, exactHeadSha);

  const changedPaths = gitLines(['diff', '--name-only', `${baseSha}...${exactHeadSha}`]);
  assert.deepEqual([...changedPaths].sort(), [...new Set(changedPaths)].sort());
  REQUIRED_SOURCE_PATHS.forEach((path) => assert.ok(changedPaths.includes(path), `Missing governed changed path ${path}`));
  const sourceArtifactHashes = changedPaths.map((path) => sha256(readFileSync(resolve(ROOT, path))));
  const rawEvidenceHashes = [
    sha256(first.stdout), sha256(first.stderr),
    sha256(readFileSync(requiredEnvPath('BB10_SHARED_REPORT_PATH'))),
    sha256(readFileSync(requiredEnvPath('BB06_REPORT_PATH'))),
    sha256(readFileSync(requiredEnvPath('BB07_REPORT_PATH'))),
  ];
  const semanticEvidenceHashes = [
    coreEvidence.semanticHash,
    sharedReport.qualificationReceipt.semanticHash,
    bb06Report.semanticHash,
    bb07Report.semanticHash,
    AXISYMMETRIC_INDEPENDENT_ORACLE_DESCRIPTOR.semanticHash,
    ...coreEvidence.cases.map((row) => row.semanticEvidenceHash),
  ];
  const parentChecks = [];
  const addParentCheck = (checkId, evidence) => {
    const row = { checkId, status: 'PASS', evidenceHash: sha256Json(evidence) };
    parentChecks.push(row);
    return row;
  };
  addParentCheck('BB10_SHARED_GATE_RECEIPT_VALID', {
    exactHeadSha,
    receiptHash: sharedReport.qualificationReceipt.semanticHash,
    status: sharedReport.qualificationReceipt.status,
  });
  addParentCheck('BB10_PLANAR_REGRESSION_CHAIN_PASS', {
    bb06ReportHash: bb06Report.semanticHash,
    bb07ReportHash: bb07Report.semanticHash,
    bb06Status: bb06Report.status,
    bb07Status: bb07Report.status,
  });
  addParentCheck('BB10_DETERMINISTIC_REPORT_REPLAY', {
    coreStdoutHash: sha256(first.stdout),
    coreStderrHash: sha256(first.stderr),
    byteIdentical: true,
  });

  const independentCheckerEvidence = createAxisymmetricIndependentCheckerEvidence({
    exactHeadSha,
    baseSha,
    oracleId: AXISYMMETRIC_INDEPENDENT_ORACLE_DESCRIPTOR.oracleId,
    oracleSemanticHash: AXISYMMETRIC_INDEPENDENT_ORACLE_DESCRIPTOR.semanticHash,
    sourceArtifactHashes,
    rawEvidenceHashes,
    semanticEvidenceHashes,
    comparisons: coreEvidence.independentComparisons,
    checks: coreEvidence.checkResults,
  });

  const approval = createAxisymmetricRegistrationApproval({
    exactHeadSha,
    baseSha,
    sourceArtifactHashes,
    rawEvidenceHashes,
    semanticEvidenceHashes,
    changedPaths,
    checkResults: [parentChecks[0], ...coreEvidence.checkResults],
    independentCheckerEvidence,
    stdoutHash: sha256(first.stdout),
    stderrHash: sha256(first.stderr),
    caseEvidence: coreEvidence.cases,
  });
  validateAxisymmetricRegistrationApprovalReceipt(approval, { expectedHeadSha: exactHeadSha, expectedBaseSha: baseSha });

  const fakeApprovalEvidence = (() => {
    const record = createBenchmarkRecord({
      moduleId: 'C2D-FLANGE-HUB',
      recordKind: 'CORE',
      bindings: { exactHeadSha },
    });
    assert.throws(
      () => advanceQualificationState(record, QUALIFICATION_STATES.FORMULATION_QUALIFIED, {
        axisymmetricRegistrationApprovalHash: sha256('arbitrary'),
      }),
      /receipt|approval|axisymmetric/i,
    );
    const advanced = advanceQualificationState(record, QUALIFICATION_STATES.FORMULATION_QUALIFIED, {
      axisymmetricRegistrationApprovalReceipt: approval,
    });
    assert.equal(advanced.state, QUALIFICATION_STATES.FORMULATION_QUALIFIED);
    assert.equal(advanced.bindings.axisymmetricRegistrationApprovalHash, approval.semanticHash);
    return { arbitraryHashRejected: true, validatedReceiptAccepted: true, advancedRecordHash: advanced.semanticHash };
  })();
  addParentCheck('BB10_FAKE_APPROVAL_HASH_REJECTED', fakeApprovalEvidence);

  assert.throws(
    () => validateAxisymmetricRegistrationApprovalReceipt(approval, {
      expectedHeadSha: alternateSha(exactHeadSha), expectedBaseSha: baseSha,
    }),
    /STALE_HEAD/,
  );
  addParentCheck('BB10_STALE_HEAD_RECEIPT_REJECTED', { staleHeadRejected: true });

  const callerFabrication = {
    schema: approval.schema,
    exactHeadSha,
    baseSha,
    status: 'AXI_Q8_REGISTRATION_QUALIFIED',
    checkResults: [{ checkId: 'CALLER_PASS', status: 'PASS', evidenceHash: sha256('caller') }],
    semanticHash: sha256('caller'),
  };
  assert.throws(() => validateAxisymmetricRegistrationApprovalReceipt(callerFabrication), /HASH|SCHEMA|PROFILE|CASE/);
  addParentCheck('BB10_CALLER_STATUS_TAMPER_REJECTED', { callerCreatedPassMapRejected: true });

  const reportChecks = [
    parentChecks[0], parentChecks[1],
    ...coreEvidence.checkResults,
    ...parentChecks.slice(3),
    { checkId: 'BB10_REPORT_TAMPER_REJECTED', status: 'PASS', evidenceHash: sha256Json({ tamperedReportRejected: true }) },
    parentChecks[2],
  ];
  const report = createBb10AxisymmetricRegistrationReport({
    exactHeadSha,
    baseSha,
    sharedGateReceiptHash: sharedReport.qualificationReceipt.semanticHash,
    planarRegressionReportHashes: [bb06Report.semanticHash, bb07Report.semanticHash],
    approvalReceipt: approval,
    checkResults: dedupeChecks(reportChecks),
    limitations: [
      'ELEMENTS_TOUCHING_OR_CROSSING_THE_SYMMETRY_AXIS_ARE_NOT_QUALIFIED',
      'SMALL_STRAIN_LINEAR_ISOTROPIC_ELASTICITY_ONLY',
      'FULL_INTEGRATION_EIGHT_NODE_SERENDIPITY_QUADRILATERALS_ONLY',
      'LONG_CYLINDER_LAME_REFERENCE_USES_EXPLICIT_EPSILON_Z_ZERO_CONSTRAINT',
      'FLANGE_HUB_APPLICATION_GEOMETRY_AND_NUMERICAL_OUTPUT_REMAIN_UNQUALIFIED',
      'NO_ASME_OR_OTHER_CODE_ASSESSMENT_AUTHORITY',
    ],
  });
  validateBb10AxisymmetricRegistrationReport(report, { expectedHeadSha: exactHeadSha, expectedBaseSha: baseSha });
  const tampered = JSON.parse(JSON.stringify(report));
  tampered.bb11Authorized = false;
  assert.throws(() => validateBb10AxisymmetricRegistrationReport(tampered), /HASH|AUTHORITY/);

  const reportPath = resolve(ROOT, process.env.BB10_REPORT_PATH ?? 'reports/bucket-b-bb10-axisymmetric-registration-report.json');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

function runCoreChild() {
  return spawnSync(process.execPath, ['src/core/bucket-b/bb10-check.mjs', '--core'], { cwd: ROOT, encoding: 'utf8' });
}
function resolveExactHead() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const expected = process.env.EXPECTED_HEAD_SHA?.trim() || head;
  assert.match(expected, /^[0-9a-f]{40}$/i);
  assert.equal(head, expected);
  return head;
}
function resolveBaseSha() {
  const value = process.env.EXPECTED_BASE_SHA?.trim();
  assert.match(value ?? '', /^[0-9a-f]{40}$/i);
  execFileSync('git', ['merge-base', '--is-ancestor', value, resolveExactHead()], { cwd: ROOT });
  return value;
}
function gitLines(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim().split(/\r?\n/u).filter(Boolean); }
function requiredEnvPath(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new TypeError(`${name} is required.`);
  return resolve(ROOT, value);
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function writeEvidenceFile(value, content) {
  if (!value) return;
  const path = resolve(ROOT, value);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function sha256Json(value) { return sha256(JSON.stringify(value)); }
function alternateSha(value) { return `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`; }
function withoutHash(value) { const copy = JSON.parse(JSON.stringify(value)); delete copy.semanticHash; return copy; }
function dedupeChecks(rows) { const map = new Map(); rows.forEach((row) => map.set(row.checkId, row)); return [...map.values()]; }
