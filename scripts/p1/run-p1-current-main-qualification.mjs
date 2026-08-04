#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { requireNonFeaBaselineReport } from '../non-fea-baseline/baseline-report-validator.mjs';
import {
  P0_OWNER_ACCEPTANCE_SCHEMA,
  P1_BROWSER_EVIDENCE_SCHEMA,
  P1_QUALIFICATION_SCHEMA,
  P1_THRESHOLDS,
  p1Failure,
  requireExactKeys,
  requireSha1,
  requireSha256,
  requireString,
  requireTimestamp,
} from './p1-contracts.mjs';
import { requireP1BrowserRunEvidence } from './p1-browser-run-validator.mjs';
import { evaluateP1QualificationEvidence } from './p1-qualification-evaluator.mjs';
import { buildP1ProtectedManifest } from './p1-protected-manifest.mjs';
import { requireP1BrowserEvidence, requireP1QualificationReport } from './p1-report-validator.mjs';
import {
  P1_Q0_ALLOWED_EVIDENCE_PATHS,
  deduplicateFailures,
  git,
  parseP1Arguments,
  resolveP1ScopeBase,
  sha256,
  writeCanonicalJson,
  zeroSha256,
} from './p1-runner-support.mjs';

const ACCEPTANCE_KEYS = [
  'schema', 'status', 'exactHeadSha', 'reportSha256', 'acceptedAt', 'acceptedBy',
];
const options = parseP1Arguments(process.argv.slice(2));
const executionId = options.executionId
  || `p1-q0-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}`;
const failures = [];
const exactHeadSha = await git(['rev-parse', 'HEAD']);
let p0Report = null;
let p0ReportValid = false;
let p0ReportStatus = null;
let p0ReportSha256 = zeroSha256();
let baseCommitSha = exactHeadSha;
let scopeBaseResolved = false;
let p0Accepted = false;
let acceptanceStatus = null;
let fixtureBinding = null;
let browserEvidence = null;
let protectedManifest = null;
let invalidationEvidence = null;

try {
  const bytes = await readFile(options.p0Report);
  p0ReportSha256 = sha256(bytes);
  const candidate = JSON.parse(bytes.toString('utf8'));
  p0ReportStatus = candidate?.status ?? null;
  requireNonFeaBaselineReport(candidate);
  p0Report = candidate;
  p0ReportValid = true;
  await validateP0Ancestry(candidate.exactHeadSha, failures);
} catch (error) {
  failures.push(failureFrom(error, 'P1_P0_REPORT_INVALID', { path: options.p0Report }));
}

try {
  baseCommitSha = await resolveP1ScopeBase({
    explicitBase: options.baseCommit,
    exactHeadSha,
  });
  requireSha1(baseCommitSha, 'baseCommitSha');
  scopeBaseResolved = true;
} catch (error) {
  failures.push(failureFrom(error, 'P1_SCOPE_BASE_INVALID', {
    explicitBase: options.baseCommit,
  }));
}
if (scopeBaseResolved) await validateEvidenceOnlyScope(baseCommitSha, failures);

if (options.p0Acceptance) {
  try {
    if (!p0ReportValid) throw new Error('P0_OWNER_ACCEPTANCE_REQUIRES_VALID_REPORT');
    const acceptance = JSON.parse(await readFile(options.p0Acceptance, 'utf8'));
    requireExactKeys(acceptance, ACCEPTANCE_KEYS, 'p0OwnerAcceptance');
    if (acceptance.schema !== P0_OWNER_ACCEPTANCE_SCHEMA) {
      throw new Error('P0_OWNER_ACCEPTANCE_SCHEMA_INVALID');
    }
    if (acceptance.status !== 'ACCEPTED') throw new Error('P0_OWNER_ACCEPTANCE_STATUS_INVALID');
    requireSha1(acceptance.exactHeadSha, 'p0OwnerAcceptance.exactHeadSha');
    requireSha256(acceptance.reportSha256, 'p0OwnerAcceptance.reportSha256');
    requireTimestamp(acceptance.acceptedAt, 'p0OwnerAcceptance.acceptedAt');
    requireString(acceptance.acceptedBy, 'p0OwnerAcceptance.acceptedBy');
    if (acceptance.exactHeadSha !== p0Report.exactHeadSha) {
      throw new Error('P0_OWNER_ACCEPTANCE_HEAD_MISMATCH');
    }
    if (acceptance.reportSha256 !== p0ReportSha256) {
      throw new Error('P0_OWNER_ACCEPTANCE_REPORT_SHA_MISMATCH');
    }
    if (p0Report.status !== 'PASS') throw new Error('P0_OWNER_ACCEPTANCE_REPORT_NOT_PASS');
    acceptanceStatus = acceptance.status;
    p0Accepted = true;
  } catch (error) {
    failures.push(failureFrom(error, 'P1_P0_ACCEPTANCE_INVALID', {
      path: options.p0Acceptance,
    }));
  }
} else {
  failures.push(p1Failure(
    'P1_P0_ACCEPTANCE_MISSING',
    'Explicit content-addressed P0 Owner acceptance is required before P1 authorization.',
    null,
  ));
}

if (p0ReportValid) {
  fixtureBinding = p0Report.fixtureRoleBindings.find((row) => (
    row.role === options.fixtureRole
  )) || null;
  if (!fixtureBinding) {
    failures.push(p1Failure('P1_FIXTURE_ROLE_MISSING',
      'Required fixture role is absent from the P0 report.', { role: options.fixtureRole }));
  } else if (fixtureBinding.status !== 'VERIFIED') {
    failures.push(p1Failure('P1_FIXTURE_AUTHORITY_NOT_VERIFIED',
      'P1 fixture authority is not VERIFIED.', {
        role: options.fixtureRole,
        status: fixtureBinding.status,
      }));
  }
}

const fixturePath = options.fixture || fixtureBinding?.path || null;
const sourceSha256 = fixtureBinding?.sourceSha256 || null;
if (!fixturePath || !sourceSha256) {
  failures.push(p1Failure('P1_FIXTURE_CUSTODY_INCOMPLETE',
    'P1 requires an exact fixture path and verified source SHA-256.', {
      fixturePath,
      sourceSha256,
    }));
} else {
  try {
    protectedManifest = await buildP1ProtectedManifest({
      fixturePath,
      fixtureRole: options.fixtureRole,
      exactHeadSha,
      executionId,
    });
    if (protectedManifest.sourceSha256 !== sourceSha256) {
      throw new Error('P1_PROTECTED_MANIFEST_FIXTURE_SHA_MISMATCH');
    }
    await writeCanonicalJson(options.manifestOutput, protectedManifest);
  } catch (error) {
    failures.push(failureFrom(error, 'P1_PROTECTED_MANIFEST_FAILED', { fixturePath }));
  }
}

if (options.browserEvidence) {
  try {
    browserEvidence = JSON.parse(await readFile(options.browserEvidence, 'utf8'));
    requireP1BrowserEvidence(browserEvidence);
    requireP1BrowserRunEvidence(browserEvidence);
    if (browserEvidence.schema !== P1_BROWSER_EVIDENCE_SCHEMA) {
      throw new Error('P1_BROWSER_SCHEMA_INVALID');
    }
    assertBrowserCustody({
      browserEvidence,
      exactHeadSha,
      executionId,
      fixtureRole: options.fixtureRole,
      fixturePath,
      sourceSha256,
    });
    invalidationEvidence = browserEvidence.invalidationEvidence;
  } catch (error) {
    failures.push(failureFrom(error, 'P1_BROWSER_EVIDENCE_INVALID', {
      path: options.browserEvidence,
    }));
  }
} else {
  failures.push(p1Failure('P1_BROWSER_EVIDENCE_MISSING',
    'P1 requires exact-head browser timing and invalidation evidence.', null));
}

const stageStatistics = p0ReportValid && fixturePath
  ? p0Report.stageStatistics.filter((row) => row.fixturePath === fixturePath)
  : [];
const evaluation = evaluateP1QualificationEvidence({
  p0Report,
  stageStatistics,
  browserEvidence,
  invalidationEvidence,
});
failures.push(...evaluation.failures);
const finalFailures = deduplicateFailures(failures);
const status = finalFailures.length
  ? 'BLOCKED'
  : evaluation.violations.length
    ? 'QUALIFIED_FOR_FIX'
    : 'NO_THRESHOLD_VIOLATION';

const report = {
  schema: P1_QUALIFICATION_SCHEMA,
  status,
  exactHeadSha,
  baseCommitSha,
  executionId,
  generatedAt: new Date().toISOString(),
  p0Evidence: {
    reportPath: options.p0Report,
    reportSha256: p0ReportSha256,
    reportStatus: p0ReportStatus,
    exactHeadSha: p0Report?.exactHeadSha || null,
    accepted: p0Accepted,
    acceptancePath: options.p0Acceptance,
    acceptanceStatus,
  },
  fixture: {
    role: options.fixtureRole,
    path: fixturePath,
    sourceSha256,
    authorityStatus: fixtureBinding?.status || 'UNRESOLVED',
  },
  thresholds: { ...P1_THRESHOLDS },
  stageStatistics,
  browserEvidence,
  invalidationEvidence,
  protectedManifest,
  violations: evaluation.violations,
  recommendedFixes: evaluation.recommendedFixes,
  failures: finalFailures,
};
requireP1QualificationReport(report);
await writeCanonicalJson(options.output, report);
process.stdout.write(`${report.status}: ${options.output}\n`);
if (options.failOnGate && report.status === 'BLOCKED') process.exitCode = 2;

async function validateP0Ancestry(p0HeadSha, rows) {
  try { await git(['merge-base', '--is-ancestor', p0HeadSha, 'HEAD']); }
  catch {
    rows.push(p1Failure(
      'P1_P0_HEAD_NOT_ANCESTOR',
      'Accepted P0 execution head is not an ancestor of the P1 qualification head.',
      { p0HeadSha, exactHeadSha },
    ));
  }
}
async function validateEvidenceOnlyScope(baseSha, rows) {
  try {
    const changedPaths = (await git(['diff', '--name-only', `${baseSha}...HEAD`]))
      .split(/\r?\n/u)
      .filter(Boolean);
    const forbidden = changedPaths.filter((file) => !P1_Q0_ALLOWED_EVIDENCE_PATHS.includes(file));
    if (forbidden.length) rows.push(p1Failure(
      'P1_Q0_PRODUCTION_WRITE_SET_VIOLATION',
      'P1-Q0 may change only the exact governed evidence files.',
      { baseSha, forbidden },
    ));
  } catch (error) {
    rows.push(failureFrom(error, 'P1_Q0_SCOPE_CHECK_FAILED', { baseSha }));
  }
}
function assertBrowserCustody(expected) {
  for (const key of ['exactHeadSha', 'executionId', 'fixtureRole', 'fixturePath', 'sourceSha256']) {
    if (expected.browserEvidence[key] !== expected[key]) {
      throw new Error(`P1_BROWSER_${key.replaceAll(/([A-Z])/gu, '_$1').toUpperCase()}_MISMATCH`);
    }
  }
}
function failureFrom(error, fallbackCode, details) {
  return p1Failure(
    error?.code || fallbackCode,
    error instanceof Error ? error.message : String(error),
    error?.details ? { ...(details || {}), ...error.details } : details,
  );
}
