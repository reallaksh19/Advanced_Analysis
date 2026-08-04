import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { requireNonFeaBaselineReport } from '../scripts/non-fea-baseline/baseline-report-validator.mjs';
import { runNonFeaP0Command } from '../scripts/non-fea-baseline/command-ladder.mjs';
import { NON_FEA_BASELINE_SCHEMA } from '../scripts/non-fea-baseline/contracts.mjs';
import { createNonFeaEnvironmentEvidence } from '../scripts/non-fea-baseline/environment-evidence.mjs';
import { NON_FEA_FIXTURE_AUTHORITIES } from '../scripts/non-fea-baseline/fixture-authority-manifest.mjs';
import { NON_FEA_PRODUCTION_ROUTE_INVENTORY } from '../scripts/non-fea-baseline/production-route-inventory.mjs';

const SHA1 = 'a'.repeat(40);

function unresolvedFailures() {
  return [
    {
      classification: 'UNRESOLVED_GATE',
      code: 'P0_COMMAND_LADDER_NOT_EXECUTED',
      message: 'Command ladder remains open.',
      stageId: null,
      details: null,
    },
    {
      classification: 'UNRESOLVED_GATE',
      code: 'P0_BROWSER_LEDGER_NOT_PROVIDED',
      message: 'Browser ledger remains open.',
      stageId: null,
      details: null,
    },
  ];
}

function unresolvedBindings() {
  return NON_FEA_FIXTURE_AUTHORITIES.map((row) => ({
    role: row.role,
    sourceKind: row.sourceKind,
    path: row.defaultPath,
    bindingSource: row.defaultPath ? 'AUTHORITY_DEFAULT' : 'UNBOUND',
    status: 'UNBOUND',
    sourceSha256: null,
    expectedSourceSha256: row.expectedSourceSha256,
    actualIdentity: {},
    expectedIdentity: row.expectedIdentity,
    authoritySource: row.authoritySource,
  }));
}

function report(overrides = {}) {
  return {
    schema: NON_FEA_BASELINE_SCHEMA,
    status: 'UNRESOLVED_GATE',
    planPreparationBaseSha: SHA1,
    programmeBaseSha: SHA1,
    exactHeadSha: SHA1,
    dirtyStatus: '',
    executionId: 'p0-contract-test',
    generatedAt: '2026-08-04T00:00:00.000Z',
    environment: createNonFeaEnvironmentEvidence({}),
    routeInventory: NON_FEA_PRODUCTION_ROUTE_INVENTORY,
    fixtureLedger: [],
    fixtureRoleBindings: unresolvedBindings(),
    fixtureRuns: [],
    stageStatistics: [],
    browserEvidence: null,
    commandRuns: [],
    failures: unresolvedFailures(),
    observabilityGaps: ['Browser evidence is not part of this contract fixture.'],
    sourceMutationDisposition: 'NO_MUTATION_OBSERVED_IN_COMPLETED_SAMPLES',
    ...overrides,
  };
}

function blockedCommand(overrides = {}) {
  return {
    commandId: 'blocked',
    command: 'missing command',
    status: 'BLOCKED',
    exitCode: null,
    durationMs: 1,
    outputSha256: 'b'.repeat(64),
    outputTail: ['blocked'],
    error: 'blocked',
    ...overrides,
  };
}

test('P0 report validator accepts a structurally complete unresolved report', () => {
  const value = requireNonFeaBaselineReport(report());
  assert.equal(value.status, 'UNRESOLVED_GATE');
  assert.ok(Object.isFrozen(value));
});

test('P0 report validator rejects missing or duplicate route coverage', () => {
  const routeInventory = {
    ...NON_FEA_PRODUCTION_ROUTE_INVENTORY,
    stages: [
      ...NON_FEA_PRODUCTION_ROUTE_INVENTORY.stages,
      NON_FEA_PRODUCTION_ROUTE_INVENTORY.stages[0],
    ],
  };
  assert.throws(
    () => requireNonFeaBaselineReport(report({ routeInventory })),
    /P0_REPORT_ROUTE_HASH_MISMATCH|P0_REPORT_ROUTE_COUNT_INVALID/u,
  );
});

test('P0 report validator rejects route semantic-hash drift', () => {
  const routeInventory = {
    ...NON_FEA_PRODUCTION_ROUTE_INVENTORY,
    programme: 'DRIFTED',
  };
  assert.throws(
    () => requireNonFeaBaselineReport(report({ routeInventory })),
    /P0_REPORT_ROUTE_HASH_MISMATCH/u,
  );
});

test('P0 report validator rejects status that contradicts failures', () => {
  assert.throws(
    () => requireNonFeaBaselineReport(report({ status: 'PASS' })),
    /P0_REPORT_STATUS_FAILURE_MISMATCH/u,
  );
});

test('blocked command evidence remains content addressed', () => {
  const row = runNonFeaP0Command(
    ['missing-command', ['definitely-not-a-real-command-p0', []]],
    process.cwd(),
  );
  assert.notEqual(row.status, 'PASS');
  assert.match(row.outputSha256, /^[0-9a-f]{64}$/u);
  assert.ok(row.outputTail.length > 0);
});

test('command runner retains dotted command IDs and complete raw output', () => {
  const directory = mkdtempSync(path.join(process.cwd(), '.tmp-non-fea-p0-command-'));
  try {
    const relativeDirectory = path.relative(process.cwd(), directory);
    const row = runNonFeaP0Command(
      ['raw.output', [process.execPath, ['-e', "process.stdout.write('alpha\\nbeta\\n')"]]],
      process.cwd(),
      { rawOutputDirectory: relativeDirectory },
    );
    assert.equal(row.status, 'PASS');
    assert.equal(
      readFileSync(path.join(directory, 'raw__output.log'), 'utf8'),
      'alpha\nbeta\n',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('command hash validation rejects absent evidence', () => {
  assert.throws(() => requireNonFeaBaselineReport(report({
    commandRuns: [blockedCommand({ outputSha256: null })],
  })), /P0_REPORT_COMMAND_OUTPUT_SHA256_INVALID/u);
});

test('non-empty partial command evidence is rejected', () => {
  assert.throws(() => requireNonFeaBaselineReport(report({
    commandRuns: [blockedCommand()],
  })), /P0_REPORT_COMMAND_COVERAGE_INVALID/u);
});

test('fixture binding rows require complete authority evidence', () => {
  assert.throws(() => requireNonFeaBaselineReport(report({
    fixtureRoleBindings: NON_FEA_FIXTURE_AUTHORITIES.map((row) => ({ role: row.role })),
  })), /keys do not match the contract/u);
});

test('browser absence requires an explicit failure', () => {
  assert.throws(() => requireNonFeaBaselineReport(report({
    failures: unresolvedFailures().filter((row) => row.code !== 'P0_BROWSER_LEDGER_NOT_PROVIDED'),
  })), /P0_REPORT_BROWSER_LEDGER_FAILURE_MISSING/u);
});

test('invalid timestamps fail with the named report code', () => {
  assert.throws(
    () => requireNonFeaBaselineReport(report({ generatedAt: 'not-a-date' })),
    /P0_REPORT_TIMESTAMP_INVALID/u,
  );
});
