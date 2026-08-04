import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { NON_FEA_STAGE_IDS } from '../scripts/non-fea-baseline/contracts.mjs';
import {
  NON_FEA_PRODUCTION_ROUTE_INVENTORY,
  assertNonFeaRouteInventory,
} from '../scripts/non-fea-baseline/production-route-inventory.mjs';

const REQUIRED_P0_FILES = [
  'docs/Nonfeaplan.md',
  'docs/non-fea-current-main-audit.md',
  'docs/non-fea-work-pack-map.md',
  'docs/non-fea-p1-agent-work-pack.md',
  'reports/non-fea-current-main-baseline.json',
  'scripts/run-non-fea-current-main-baseline.mjs',
  'scripts/non-fea-baseline/baseline-report-validator.mjs',
  'scripts/non-fea-baseline/browser-baseline.mjs',
  'scripts/non-fea-baseline/command-ladder.mjs',
  'scripts/non-fea-baseline/contracts.mjs',
  'scripts/non-fea-baseline/environment-evidence.mjs',
  'scripts/non-fea-baseline/fixture-authority-manifest.mjs',
  'scripts/non-fea-baseline/fixture-role-bindings.mjs',
  'scripts/non-fea-baseline/fixture-sample-runner.mjs',
  'scripts/non-fea-baseline/production-route-inventory.mjs',
  'scripts/non-fea-baseline/runner-options.mjs',
  'scripts/non-fea-baseline/stage-recorder.mjs',
  'scripts/non-fea-baseline/statistics.mjs',
  'tests/non-fea-p0-browser-evidence.test.mjs',
  'tests/non-fea-p0-report-validator.test.mjs',
  'tests/non-fea-p0-statistics.test.mjs',
];

test('P0 route inventory covers every required stage exactly once', () => {
  assert.doesNotThrow(() => assertNonFeaRouteInventory());
  assert.equal(
    NON_FEA_PRODUCTION_ROUTE_INVENTORY.stages.length,
    NON_FEA_STAGE_IDS.length,
  );
  assert.equal(
    new Set(NON_FEA_PRODUCTION_ROUTE_INVENTORY.stages.map((row) => row.stageId)).size,
    NON_FEA_STAGE_IDS.length,
  );
});

test('P0 route inventory freezes ownership and source non-mutation', () => {
  for (const row of NON_FEA_PRODUCTION_ROUTE_INVENTORY.stages) {
    assert.equal(row.sourceMutation, false, `${row.stageId} must not mutate source authority`);
    assert.ok(row.intendedOwner.length > 0, `${row.stageId} owner missing`);
    assert.ok(row.forbiddenParallelOwner.length > 0, `${row.stageId} forbidden owner missing`);
    assert.ok(row.presentDefectOrUncertainty.length > 0, `${row.stageId} uncertainty missing`);
  }
});

test('P0 deliverable set is present', async () => {
  await Promise.all(REQUIRED_P0_FILES.map((file) => access(file)));
});

test('P0 seed report is explicitly unexecuted and fail-closed', async () => {
  const report = JSON.parse(
    await readFile('reports/non-fea-current-main-baseline.json', 'utf8'),
  );
  assert.equal(report.schema, 'non-fea-current-main-baseline/v1');
  assert.equal(report.status, 'IMPLEMENTATION_READY_OWNER_EXECUTION_REQUIRED');
  assert.equal(report.completion.P0_ACCEPTED, false);
  assert.ok(report.failures.some((row) => row.classification === 'UNRESOLVED_GATE'));
  assert.equal(report.fixtureRoleBindings.length, 3);
  assert.deepEqual(
    Object.fromEntries(report.fixtureRoleBindings.map(({ role, status }) => [role, status])),
    {
      LARGE_MODEL_4884_ENTITY: 'UNBOUND',
      REAL_1885_SUPPORT_BRANCH: 'NOT_EXECUTED',
      TOPOLOGY_EDIT_20_OBJECT: 'NOT_EXECUTED',
    },
  );
});

test('P0 runner provides explicit exact fixture and browser evidence binding', async () => {
  const source = await readFile('scripts/non-fea-baseline/runner-options.mjs', 'utf8');
  assert.match(source, /--fixture-role/u);
  assert.match(source, /ROLE=repository\/path/u);
  assert.match(source, /Duplicate --fixture-role binding/u);
  assert.match(source, /NON_FEA_REQUIRED_FIXTURE_ROLES/u);
  assert.match(source, /--browser-evidence/u);
});
