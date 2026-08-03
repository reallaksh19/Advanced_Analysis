import { execFileSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
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
import { executeNonFeaFixtureSample } from './non-fea-baseline/fixture-sample-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = parseNonFeaBaselineArguments(process.argv.slice(2));
const exactHeadSha = gitValue(['rev-parse', 'HEAD']);
const programmeBaseSha = gitValue(['merge-base', 'HEAD', 'main']) || '7a6cfadb2c898ddac8cb2dba09b7d400ff800696';
const executionId = options.executionId || `p0-${exactHeadSha.slice(0, 12) || 'unknown'}`;
const failures = [];
const fixtureRuns = [];
const fixtureLedger = [];
assertNonFeaRouteInventory();

for (const fixture of options.fixtures) {
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
    fixtureLedger.push({ ...metadata, sourceSha256: null, declaredUse: [], realOrSimulated: 'UNRESOLVED', expectedIdentity: {}, authorityNotes: ['P0 Owner adjudication required.'] });
    continue;
  }
  const cold = await executeNonFeaFixtureSample({ fixturePath, fixture: repositoryPath, executionId, sampleKind: 'COLD', sampleIndex: 0 });
  fixtureRuns.push(cold.run);
  failures.push(...cold.run.failures);
  fixtureLedger.push({
    ...metadata,
    sourceSha256: cold.fixture.sourceSha256,
    declaredUse: ['normalization', 'support-sites', 'route-partition', 'resolved-geometry', 'render-model'],
    realOrSimulated: 'REAL_REPOSITORY_FIXTURE',
    expectedIdentity: cold.fixture.identity,
    authorityNotes: cold.fixture.authorityNotes,
  });
  for (let sampleIndex = 1; sampleIndex <= options.warmSamples; sampleIndex += 1) {
    const warm = await executeNonFeaFixtureSample({ fixturePath, fixture: repositoryPath, executionId, sampleKind: 'WARM', sampleIndex });
    fixtureRuns.push(warm.run);
    failures.push(...warm.run.failures);
  }
}

const roleResolution = resolveNonFeaFixtureRoleBindings(options.fixtureRoles, fixtureLedger);
failures.push(...roleResolution.failures);
const commandRuns = options.runCommands ? NON_FEA_P0_COMMANDS.map((row) => runNonFeaP0Command(row, ROOT)) : [];
if (!options.runCommands) failures.push(nonFeaFailure({
  classification: 'UNRESOLVED_GATE',
  code: 'P0_COMMAND_LADDER_NOT_EXECUTED',
  message: 'The exact-head P0 command ladder has not been executed by this run.',
}));
for (const command of commandRuns.filter((row) => row.status !== 'PASS')) failures.push(nonFeaFailure({
  classification: command.status === 'BLOCKED' ? 'INFRASTRUCTURE_BLOCKER' : 'PRE_EXISTING_CURRENT_MAIN_DEFECT',
  code: 'P0_COMMAND_FAILED',
  message: `${command.commandId} did not pass.`,
  details: { commandId: command.commandId, exitCode: command.exitCode },
}));

const browserPassed = commandRuns.some((row) => row.commandId === 'three-viewport-navigation-browser' && row.status === 'PASS');
for (const stageId of ['THREE_MATERIALIZATION', 'GPU_SCENE_INSTALL', 'FIT', 'FIRST_MEANINGFUL_FRAME', 'SELECTION', 'ORBIT_PAN']) {
  if (!browserPassed) failures.push(nonFeaFailure({
    classification: 'INFRASTRUCTURE_BLOCKER',
    code: 'P0_BROWSER_STAGE_NOT_MEASURED',
    message: `${stageId} requires browser evidence and is not measured by the Node runner.`,
    stageId,
  }));
}

const report = {
  schema: NON_FEA_BASELINE_SCHEMA,
  status: failures.length === 0 ? 'PASS' : 'UNRESOLVED_GATE',
  planPreparationBaseSha: '0bad5b4200a8e24a358e76b1ea8372da33485c87',
  programmeBaseSha,
  exactHeadSha: exactHeadSha || null,
  dirtyStatus: gitValue(['status', '--short']),
  executionId,
  generatedAt: new Date().toISOString(),
  routeInventory: NON_FEA_PRODUCTION_ROUTE_INVENTORY,
  fixtureLedger: fixtureLedger.sort((left, right) => codeUnitCompare(left.path, right.path)),
  fixtureRoleBindings: roleResolution.bindings,
  fixtureRuns,
  stageStatistics: summarizeNonFeaStages(fixtureRuns),
  commandRuns,
  failures,
  observabilityGaps: [
    'SOURCE_SNAPSHOT, SOURCE_INDEX, entity normalization, and SHARED_MODEL are currently measured only inside composite NORMALIZATION.',
    'Browser-only Three materialization, GPU install, fit, first meaningful frame, first pick, orbit/pan, and long tasks require the Playwright ledger.',
    'Canonical topology/checker/edit transactions are exercised by registered tests, not reconstructed from the normalization runner.',
  ],
  sourceMutationDisposition: failures.some((row) => row.code === 'P0_SOURCE_MUTATED') ? 'FAIL' : 'NO_MUTATION_OBSERVED_IN_COMPLETED_SAMPLES',
};

await mkdir(path.dirname(path.resolve(ROOT, options.output)), { recursive: true });
await writeFile(path.resolve(ROOT, options.output), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  exactHeadSha: report.exactHeadSha,
  executionId: report.executionId,
  fixtureCount: report.fixtureLedger.length,
  boundFixtureRoleCount: report.fixtureRoleBindings.filter((row) => row.status === 'BOUND').length,
  runCount: report.fixtureRuns.length,
  failureCount: report.failures.length,
  output: options.output,
}, null, 2));
if (options.failOnGate && report.status !== 'PASS') process.exitCode = 1;

function gitValue(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}
function normalizePath(value) { return value.split(path.sep).join('/'); }
