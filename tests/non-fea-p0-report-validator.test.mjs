import assert from 'node:assert/strict';
import test from 'node:test';
import { requireNonFeaBaselineReport } from '../scripts/non-fea-baseline/baseline-report-validator.mjs';
import { runNonFeaP0Command } from '../scripts/non-fea-baseline/command-ladder.mjs';
import { NON_FEA_BASELINE_SCHEMA } from '../scripts/non-fea-baseline/contracts.mjs';
import { createNonFeaEnvironmentEvidence } from '../scripts/non-fea-baseline/environment-evidence.mjs';
import { NON_FEA_FIXTURE_AUTHORITIES } from '../scripts/non-fea-baseline/fixture-authority-manifest.mjs';
import { NON_FEA_PRODUCTION_ROUTE_INVENTORY } from '../scripts/non-fea-baseline/production-route-inventory.mjs';

const SHA1 = 'a'.repeat(40);
const SHA256 = 'b'.repeat(64);

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
    fixtureRoleBindings: NON_FEA_FIXTURE_AUTHORITIES.map((row) => ({ role: row.role })),
    fixtureRuns: [],
    stageStatistics: [],
    commandRuns: [],
    failures: [{ classification: 'UNRESOLVED_GATE', code: 'TEST_GATE', message: 'Qualification gate remains open.', stageId: null, details: null }],
    observabilityGaps: ['Browser evidence is not part of this contract fixture.'],
    sourceMutationDisposition: 'NO_MUTATION_OBSERVED_IN_COMPLETED_SAMPLES',
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
    stages: [...NON_FEA_PRODUCTION_ROUTE_INVENTORY.stages, NON_FEA_PRODUCTION_ROUTE_INVENTORY.stages[0]],
  };
  assert.throws(() => requireNonFeaBaselineReport(report({ routeInventory })), /P0_REPORT_ROUTE_COUNT_INVALID/u);
});

test('P0 report validator rejects status that contradicts failures', () => {
  assert.throws(() => requireNonFeaBaselineReport(report({ status: 'PASS' })), /P0_REPORT_STATUS_FAILURE_MISMATCH/u);
});

test('blocked command evidence remains content addressed', () => {
  const row = runNonFeaP0Command(['missing-command', ['definitely-not-a-real-command-p0', []]], process.cwd());
  assert.notEqual(row.status, 'PASS');
  assert.match(row.outputSha256, /^[0-9a-f]{64}$/u);
  assert.ok(row.outputTail.length > 0);
});

test('command hash validation rejects absent evidence', () => {
  assert.throws(() => requireNonFeaBaselineReport(report({
    commandRuns: [{ commandId: 'blocked', status: 'BLOCKED', outputSha256: null }],
  })), /P0_REPORT_COMMAND_OUTPUT_SHA256_INVALID/u);
});

void SHA256;
