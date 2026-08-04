import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NON_FEA_BASELINE_SCHEMA,
  codeUnitCompare,
  nonFeaFailure,
} from './non-fea-baseline/contracts.mjs';
import {
  NON_FEA_PRODUCTION_ROUTE_INVENTORY,
  assertNonFeaRouteInventory,
} from './non-fea-baseline/production-route-inventory.mjs';
import { NON_FEA_P0_COMMANDS, runNonFeaP0Command } from './non-fea-baseline/command-ladder.mjs';
import { summarizeNonFeaStages } from './non-fea-baseline/statistics.mjs';
import { parseNonFeaBaselineArguments } from './non-fea-baseline/runner-options.mjs';
import { resolveNonFeaFixtureRoleBindings } from './non-fea-baseline/fixture-role-bindings.mjs';
import { nonFeaFixtureExecutionPaths } from './non-fea-baseline/fixture-authority-manifest.mjs';
import { executeNonFeaFixtureSample } from './non-fea-baseline/fixture-sample-runner.mjs';
import { createNonFeaEnvironmentEvidence } from './non-fea-baseline/environment-evidence.mjs';
import { requireNonFeaBaselineReport } from './non-fea-baseline/baseline-report-validator.mjs';
import {
  NON_FEA_BROWSER_STAGE_IDS,
  requireNonFeaBrowserEvidence,
} from './non-fea-baseline/browser-baseline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = parseNonFeaBaselineArguments(process.argv.slice(2));
const exactHeadSha = gitValue(['rev-parse', 'HEAD']);
const programmeBaseSha = currentMainMergeBase();
const dirtyStatus = gitValue(['status', '--short']);
const executionId = options.executionId || `p0-${exactHeadSha.slice(0, 12) || 'unknown'}`;
const failures = [];
const fixtureRuns = [];
const fixtureLedger = [];
assertNonFeaRouteInventory();

if (dirtyStatus) failures.push(nonFeaFailure({
  classification: 'UNRESOLVED_GATE',
  code: 'P0_WORKTREE_DIRTY',
  message: 'P0 exact-head execution requires a clean worktree before evidence publication.',
  details: { dirtyStatus },
}));

const fixturePaths = nonFeaFixtureExecutionPaths(options.fixtures, options.fixtureRoles);
for (const fixture of fixturePaths) {
  const fixturePath = path.resolve(ROOT, fixture);
  const repositoryPath = normalizePath(path.relative(ROOT, fixturePath));
  let metadata;
  try {
    const info = await stat(fixturePath);
    metadata = { path: repositoryPath, byteLength: info.size, status: 'PRESENT' };
  } catch {
    metadata = { path: repositoryPath, byteLength: null, status: 'MISSING' };
    failures.push(nonFeaFailure({
      classification: 'MISSING_AUTHORITY',
      code: 'P0_REQUIRED_FIXTURE_MISSING',
      message: `Required fixture is missing: ${repositoryPath}.`,
      details: { path: repositoryPath },
    }));
  }
  if (metadata.status !== 'PRESENT') {
    fixtureLedger.push({
      ...metadata,
      sourceSha256: null,
      declaredUse: [],
      realOrSimulated: 'UNRESOLVED',
      expectedIdentity: {},
      authorityNotes: ['P0 Owner adjudication required.'],
    });
    continue;
  }
  const cold = await executeNonFeaFixtureSample({
    fixturePath,
    fixture: repositoryPath,
    executionId,
    sampleKind: 'COLD',
    sampleIndex: 0,
  });
  fixtureRuns.push(cold.run);
  failures.push(...cold.run.failures);
  fixtureLedger.push({
    ...metadata,
    sourceSha256: cold.fixture.sourceSha256,
    declaredUse: [
      'normalization',
      'support-sites',
      'route-partition',
      'resolved-geometry',
      'render-model',
    ],
    realOrSimulated: 'REAL_REPOSITORY_OR_EXPLICIT_FIXTURE',
    expectedIdentity: cold.fixture.identity,
    authorityNotes: cold.fixture.authorityNotes,
  });
  for (let sampleIndex = 1; sampleIndex <= options.warmSamples; sampleIndex += 1) {
    const warm = await executeNonFeaFixtureSample({
      fixturePath,
      fixture: repositoryPath,
      executionId,
      sampleKind: 'WARM',
      sampleIndex,
    });
    fixtureRuns.push(warm.run);
    failures.push(...warm.run.failures);
  }
}

const roleResolution = resolveNonFeaFixtureRoleBindings(
  options.fixtureRoles,
  fixtureLedger,
  fixtureRuns,
);
failures.push(...roleResolution.failures);
const commandRuns = options.runCommands
  ? NON_FEA_P0_COMMANDS.map((row) => runNonFeaP0Command(row, ROOT))
  : [];
if (!options.runCommands) failures.push(nonFeaFailure({
  classification: 'UNRESOLVED_GATE',
  code: 'P0_COMMAND_LADDER_NOT_EXECUTED',
  message: 'The exact-head P0 command ladder has not been executed by this run.',
}));
for (const command of commandRuns.filter((row) => row.status !== 'PASS')) {
  failures.push(nonFeaFailure({
    classification: command.status === 'BLOCKED'
      ? 'INFRASTRUCTURE_BLOCKER'
      : 'PRE_EXISTING_CURRENT_MAIN_DEFECT',
    code: 'P0_COMMAND_FAILED',
    message: `${command.commandId} did not pass.`,
    details: { commandId: command.commandId, exitCode: command.exitCode },
  }));
}

const browserEvidence = await loadBrowserEvidence({
  evidencePath: options.browserEvidence,
  executionId,
  exactHeadSha,
  roleResolution,
  failures,
});
if (!browserEvidence) {
  for (const stageId of NON_FEA_BROWSER_STAGE_IDS) failures.push(nonFeaFailure({
    classification: 'INFRASTRUCTURE_BLOCKER',
    code: 'P0_BROWSER_STAGE_NOT_MEASURED',
    message: `${stageId} requires an ingested exact-head browser ledger.`,
    stageId,
  }));
}

const report = requireNonFeaBaselineReport({
  schema: NON_FEA_BASELINE_SCHEMA,
  status: failures.length === 0 ? 'PASS' : 'UNRESOLVED_GATE',
  planPreparationBaseSha: '0bad5b4200a8e24a358e76b1ea8372da33485c87',
  programmeBaseSha,
  exactHeadSha,
  dirtyStatus,
  executionId,
  generatedAt: new Date().toISOString(),
  environment: createNonFeaEnvironmentEvidence(),
  routeInventory: NON_FEA_PRODUCTION_ROUTE_INVENTORY,
  fixtureLedger: fixtureLedger.sort((left, right) => codeUnitCompare(left.path, right.path)),
  fixtureRoleBindings: roleResolution.bindings,
  fixtureRuns,
  stageStatistics: summarizeNonFeaStages(fixtureRuns),
  browserEvidence,
  commandRuns,
  failures: dedupeFailures(failures),
  observabilityGaps: [
    'SOURCE_SNAPSHOT, SOURCE_INDEX, entity normalization, and SHARED_MODEL are currently measured only inside composite NORMALIZATION.',
    'Canonical topology/checker/edit transactions are exercised by registered tests, not reconstructed from the normalization runner.',
  ],
  sourceMutationDisposition: failures.some((row) => row.code === 'P0_SOURCE_MUTATED')
    ? 'FAIL'
    : 'NO_MUTATION_OBSERVED_IN_COMPLETED_SAMPLES',
});

await mkdir(path.dirname(path.resolve(ROOT, options.output)), { recursive: true });
await writeFile(path.resolve(ROOT, options.output), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  exactHeadSha: report.exactHeadSha,
  programmeBaseSha: report.programmeBaseSha,
  executionId: report.executionId,
  fixtureCount: report.fixtureLedger.length,
  verifiedFixtureRoleCount: report.fixtureRoleBindings
    .filter((row) => row.status === 'VERIFIED').length,
  runCount: report.fixtureRuns.length,
  browserEvidencePresent: Boolean(report.browserEvidence),
  failureCount: report.failures.length,
  output: options.output,
}, null, 2));
if (options.failOnGate && report.status !== 'PASS') process.exitCode = 1;

async function loadBrowserEvidence({
  evidencePath,
  executionId: expectedExecutionId,
  exactHeadSha: expectedHeadSha,
  roleResolution,
  failures: failureRows,
}) {
  if (!evidencePath) {
    failureRows.push(nonFeaFailure({
      classification: 'UNRESOLVED_GATE',
      code: 'P0_BROWSER_LEDGER_NOT_PROVIDED',
      message: 'Bind an exact-head browser evidence JSON file with --browser-evidence.',
    }));
    return null;
  }
  try {
    const value = JSON.parse(await readFile(path.resolve(ROOT, evidencePath), 'utf8'));
    const evidence = requireNonFeaBrowserEvidence(value, {
      executionId: expectedExecutionId,
      exactHeadSha: expectedHeadSha,
      fixtureRole: 'LARGE_MODEL_4884_ENTITY',
    });
    const binding = roleResolution.bindings.find(
      (row) => row.role === 'LARGE_MODEL_4884_ENTITY',
    );
    if (!binding || binding.status !== 'VERIFIED'
        || binding.path !== evidence.fixturePath
        || binding.sourceSha256 !== evidence.sourceSha256) {
      throw namedError(
        'P0_BROWSER_FIXTURE_AUTHORITY_MISMATCH',
        'Browser evidence does not bind the verified 4,884-entity fixture authority.',
      );
    }
    return evidence;
  } catch (error) {
    failureRows.push(nonFeaFailure({
      classification: error?.code === 'ENOENT'
        ? 'INFRASTRUCTURE_BLOCKER'
        : 'UNRESOLVED_GATE',
      code: error?.code || 'P0_BROWSER_LEDGER_INVALID',
      message: error instanceof Error ? error.message : String(error),
      details: { evidencePath },
    }));
    return null;
  }
}

function currentMainMergeBase() {
  for (const ref of ['origin/main', 'main']) {
    const value = gitValue(['merge-base', 'HEAD', ref]);
    if (value) return value;
  }
  return '';
}
function gitValue(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}
function namedError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}
function normalizePath(value) { return value.split(path.sep).join('/'); }
function dedupeFailures(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
