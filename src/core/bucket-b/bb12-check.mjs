import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { semanticHash } from '../shared-piping-model/index.js';
import {
  BB12_BB11_EXECUTABLE_PATHS,
  BB12_PROJECTION_STATUS,
  createBb12CombinedAdjudicationReport,
  validateBb12CombinedAdjudicationReport,
} from './bb12-combined-adjudication.js';
import { validateBb06Report } from './bb06-lug-clamp.js';
import { validateBb07Report } from './bb07-bracket-gusset.js';
import { validateBb08Report } from './bb08-pipe-pad.js';
import { validateBb09Report } from './bb09-nozzle-repad.js';
import { validateBb11FlangeHubReport } from './flange-hub-authority.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const exactHeadSha = git(['rev-parse', 'HEAD']);
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA ?? exactHeadSha;
const expectedBaseSha = process.env.EXPECTED_BASE_SHA;
const reportPath = resolve(
  ROOT,
  process.env.BB12_REPORT_PATH
    ?? 'reports/bucket-b-bb12-combined-adjudication-report.json',
);
const diagnosticPath = resolve(
  ROOT,
  process.env.BB12_DIAGNOSTIC_PATH
    ?? 'reports/bucket-b-bb12-combined-adjudication-diagnostic.json',
);
const paths = {
  bb06: resolve(ROOT, process.env.BB06_REPORT_PATH
    ?? 'reports/bucket-b-bb06-lug-clamp-report.json'),
  bb07: resolve(ROOT, process.env.BB07_REPORT_PATH
    ?? 'reports/bucket-b-bb07-bracket-gusset-report.json'),
  bb08: resolve(ROOT, process.env.BB08_REPORT_PATH
    ?? 'reports/bucket-b-bb08-pipe-pad-report.json'),
  bb09: resolve(ROOT, process.env.BB09_REPORT_PATH
    ?? 'reports/bucket-b-bb09-nozzle-repad-report.json'),
  bb11: resolve(ROOT, process.env.BB11_REPORT_PATH
    ?? 'reports/bucket-b-bb11-report.json'),
};
const reports = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [
    key,
    JSON.parse(readFileSync(path, 'utf8')),
  ]),
);
const checks = [];

try {
  run();
} catch (error) {
  writeDiagnostic({
    status: 'BB12_COMBINED_ADJUDICATION_FAILED',
    error: {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
    },
  });
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}

function run() {
  assert.match(expectedHeadSha, /^[0-9a-f]{40}$/i);
  assert.match(expectedBaseSha ?? '', /^[0-9a-f]{40}$/i);
  assert.equal(exactHeadSha, expectedHeadSha, 'BB-12 exact-head mismatch.');

  const custody = check('BB12_EXACT_CURRENT_MAIN_CUSTODY', () => {
    git(['fetch', '--no-tags', 'origin', 'main']);
    const currentMainSha = git(['rev-parse', 'origin/main']);
    const mergeBaseSha = git(['merge-base', exactHeadSha, currentMainSha]);
    const commitsBehindMain = Number(git([
      'rev-list',
      '--count',
      `${exactHeadSha}..${currentMainSha}`,
    ]));
    assert.equal(currentMainSha, expectedBaseSha);
    assert.equal(mergeBaseSha, expectedBaseSha);
    assert.equal(commitsBehindMain, 0);
    return Object.freeze({
      exactHeadSha,
      baseSha: expectedBaseSha,
      mergeBaseSha,
      currentMainSha,
      commitsBehindMain,
    });
  });

  check('BB12_CHANGED_PATH_AUDIT', () => {
    const allowed = Object.freeze([
      '.github/workflows/bucket-b-bb12-combined-adjudication.yml',
      'docs/LAFEA_BB12_Combined_Adjudication_Record.md',
      'docs/conceptcumroadmapLAFEA.md',
      'src/core/bucket-b/bb12-check.mjs',
      'src/core/bucket-b/bb12-combined-adjudication.js',
      'src/core/bucket-b/index.js',
    ]);
    const changedPaths = git([
      'diff',
      '--name-only',
      `${expectedBaseSha}...${exactHeadSha}`,
    ]).split('\n').filter(Boolean).sort();
    changedPaths.forEach((path) => {
      assert.ok(allowed.includes(path), `BB-12 changed path is not allowed: ${path}`);
    });
    assert.ok(changedPaths.length >= 5 && changedPaths.length <= allowed.length);
    return { changedPaths, allowedWriteSetHash: semanticHash(allowed) };
  });

  check('BB12_SAME_HEAD_PLANAR_PORTFOLIO', () => {
    validateBb06Report(reports.bb06);
    validateBb07Report(reports.bb07);
    validateBb08Report(reports.bb08);
    validateBb09Report(reports.bb09);
    [reports.bb06, reports.bb07, reports.bb08, reports.bb09]
      .forEach((report) => {
        assert.equal(report.exactHeadSha, exactHeadSha);
        assert.equal(report.applicationProcedureQualified, true);
        assert.equal(report.numericalOutputQualified, true);
        assert.equal(report.codeAssessmentQualified, false);
        assert.equal(report.moduleQualified, false);
      });
    assert.equal(reports.bb09.bb12PlanarIntakeAuthorized, true);
    return {
      bb06: reports.bb06.semanticHash,
      bb07: reports.bb07.semanticHash,
      bb08: reports.bb08.semanticHash,
      bb09: reports.bb09.semanticHash,
    };
  });

  check('BB12_RETAINED_BB11_REPORT_VALID', () => {
    validateBb11FlangeHubReport(reports.bb11);
    assert.equal(reports.bb11.exactHeadSha, '235ab47685beddecac7ff2b41d40eb20212dc943');
    assert.equal(reports.bb11.status, 'BB11_FLANGE_HUB_QUALIFIED');
    assert.equal(reports.bb11.bb12Authorized, true);
    assert.equal(reports.bb11.codeAssessmentQualified, false);
    assert.equal(reports.bb11.moduleQualified, false);
    assert.equal(reports.bb11.applicationModulePromoted, false);
    assert.equal(reports.bb11.productionSwitchAuthorized, false);
    assert.equal(
      fileSha256(paths.bb11),
      'sha256:8c934ab946d212f8f9b5415f40f185c5eb7bf5f467a4211caf31a5d91c42e1fe',
    );
    return {
      exactHeadSha: reports.bb11.exactHeadSha,
      reportSemanticHash: reports.bb11.semanticHash,
      reportRawSha256: fileSha256(paths.bb11),
    };
  });

  const bb11AdoptionEvidence = check(
    'BB12_BB11_ANCESTRY_AND_SOURCE_IDENTITY',
    () => createBb11AdoptionEvidence(reports.bb11),
  );

  const input = {
    ...custody,
    bb06Report: reports.bb06,
    bb07Report: reports.bb07,
    bb08Report: reports.bb08,
    bb09Report: reports.bb09,
    bb11Report: reports.bb11,
    bb11AdoptionEvidence,
  };

  const provisional = createBb12CombinedAdjudicationReport({
    ...input,
    checkResults: [...checks],
  });

  check('BB12_RECEIPT_BOUND_TEMPLATE_PROJECTION', () => {
    assert.equal(provisional.applicationTemplateProjection.length, 6);
    provisional.applicationTemplateProjection.forEach((row) => {
      assert.equal(row.exactHeadSha, exactHeadSha);
      assert.equal(row.releaseStatus, BB12_PROJECTION_STATUS);
      assert.equal(row.codeAssessmentQualified, false);
      assert.equal(row.ordinaryProductionExecutionAuthorized, false);
      assert.equal(row.applicationModulePromoted, false);
      assert.equal(row.productionSwitchAuthorized, false);
      assert.ok(row.limitations.length > 0);
    });
    return provisional.applicationTemplateProjection;
  });

  check('BB12_RETAINED_AUTHORITY_AND_TAMPER_REJECTION', () => {
    assert.equal(provisional.bucketBProgrammeQualified, true);
    assert.equal(provisional.codeAssessmentQualified, false);
    assert.equal(provisional.moduleQualified, false);
    assert.equal(provisional.applicationModulePromoted, false);
    assert.equal(provisional.applicationExecutionAuthorized, false);
    assert.equal(provisional.productionSwitchAuthorized, false);
    assert.equal(provisional.bucket01Qualified, 'UNCHANGED');
    assert.throws(
      () => validateBb12CombinedAdjudicationReport({
        ...provisional,
        productionSwitchAuthorized: true,
      }),
      /authority|hash/i,
    );
    assert.throws(
      () => validateBb12CombinedAdjudicationReport({
        ...provisional,
        applicationTemplateProjection: provisional.applicationTemplateProjection
          .map((row, index) => index === 0
            ? { ...row, releaseStatus: 'PRODUCTION_AUTHORIZED' }
            : row),
      }),
      /projection|hash/i,
    );
    assert.throws(
      () => createBb12CombinedAdjudicationReport({
        ...input,
        bb11AdoptionEvidence: {
          ...bb11AdoptionEvidence,
          pathRows: bb11AdoptionEvidence.pathRows.map((row, index) => (
            index === 0 ? { ...row, currentBlobSha: '0'.repeat(40) } : row
          )),
        },
        checkResults: [...checks],
      }),
      /drift|hash/i,
    );
    return { rejected: true };
  });

  const report = createBb12CombinedAdjudicationReport({
    ...input,
    checkResults: [...checks],
  });
  validateBb12CombinedAdjudicationReport(report, {
    expectedHeadSha: exactHeadSha,
    expectedBaseSha,
  });
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeDiagnostic({
    status: report.status,
    reportSemanticHash: report.semanticHash,
    qualifiedApplicationProcedureCount:
      report.qualifiedApplicationProcedureCount,
  });
  console.log(JSON.stringify(report, null, 2));
}

function createBb11AdoptionEvidence(bb11Report) {
  const qualifiedHeadSha = bb11Report.exactHeadSha;
  const mergedHeadSha = '07ce017eb7113517cc032771f7717f88c0a93d4c';
  git(['cat-file', '-e', `${qualifiedHeadSha}^{commit}`]);
  git(['cat-file', '-e', `${mergedHeadSha}^{commit}`]);
  const qualifiedHeadIsAncestor = isAncestor(qualifiedHeadSha, exactHeadSha);
  const mergedHeadIsAncestor = isAncestor(mergedHeadSha, exactHeadSha);
  assert.equal(qualifiedHeadIsAncestor, true);
  assert.equal(mergedHeadIsAncestor, true);
  const pathRows = BB12_BB11_EXECUTABLE_PATHS.map((path) => {
    const qualifiedBlobSha = git(['rev-parse', `${qualifiedHeadSha}:${path}`]);
    const currentBlobSha = git(['rev-parse', `${exactHeadSha}:${path}`]);
    assert.equal(currentBlobSha, qualifiedBlobSha, `BB-11 source drift: ${path}`);
    return Object.freeze({
      path,
      qualifiedBlobSha,
      currentBlobSha,
      byteIdentical: true,
    });
  });
  const payload = {
    currentHeadSha: exactHeadSha,
    qualifiedHeadSha,
    mergedHeadSha,
    qualifiedHeadIsAncestor,
    mergedHeadIsAncestor,
    artifactId: '8954712183',
    artifactDigest:
      'sha256:7dc5619ab867bcb7a977a8169c814a158bad2fe63f92999e7985a78f6d555ed1',
    sourceTreeIdentityStatus: 'BYTE_IDENTICAL',
    pathRows,
  };
  return Object.freeze({ ...payload, semanticHash: semanticHash(payload) });
}

function check(checkId, operation) {
  const evidence = operation();
  checks.push(Object.freeze({
    checkId,
    status: 'PASS',
    evidenceHash: sha256(JSON.stringify(evidence ?? true)),
  }));
  return evidence;
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

function fileSha256(path) {
  return `sha256:${createHash('sha256')
    .update(readFileSync(path))
    .digest('hex')}`;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function writeDiagnostic(extra) {
  mkdirSync(dirname(diagnosticPath), { recursive: true });
  writeFileSync(
    diagnosticPath,
    `${JSON.stringify({
      schema: 'bucket-b-bb12-combined-adjudication-diagnostic/v1',
      exactHeadSha,
      expectedBaseSha,
      checks,
      ...extra,
    }, null, 2)}\n`,
  );
}
