import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NON_FEA_FIXTURE_AUTHORITIES,
  nonFeaFixtureExecutionPaths,
} from '../scripts/non-fea-baseline/fixture-authority-manifest.mjs';
import { resolveNonFeaFixtureRoleBindings } from '../scripts/non-fea-baseline/fixture-role-bindings.mjs';

const SHA = /^[0-9a-f]{64}$/u;

test('P0 fixture authority defines every required role exactly once', () => {
  assert.deepEqual(NON_FEA_FIXTURE_AUTHORITIES.map((row) => row.role), [
    'LARGE_MODEL_4884_ENTITY',
    'REAL_1885_SUPPORT_BRANCH',
    'TOPOLOGY_EDIT_20_OBJECT',
  ]);
  for (const row of NON_FEA_FIXTURE_AUTHORITIES) {
    assert.equal(Object.isFrozen(row), true);
    if (row.expectedSourceSha256 !== null) assert.match(row.expectedSourceSha256, SHA);
    if (row.defaultPath) {
      assert.equal(row.defaultPath.startsWith('/'), false);
      assert.equal(row.defaultPath.split('/').includes('..'), false);
    }
  }
});

test('P0 executes repository defaults and explicit external bindings once', () => {
  const paths = nonFeaFixtureExecutionPaths(
    ['benchmarks/Sjson.json'],
    { LARGE_MODEL_4884_ENTITY: 'private-cache/real-project.json' },
  );
  assert.deepEqual(paths, [
    'benchmarks/Sjson.json',
    'private-cache/real-project.json',
    'public/fixtures/topology-edit-20-element-demo.staged.json',
  ]);
});

test('P0 fixture authority verifies exact SHA and identity and rejects drift', () => {
  const ledger = [
    {
      path: 'benchmarks/Sjson.json', status: 'PRESENT',
      sourceSha256: '6b2c8b01ab0ba6ec8e9e7c42eb4a719668ffd2dc4dbe4790d27cf426a1f60288',
    },
  ];
  const identity = {
    entityCount: 279,
    supportSourceRecordCount: 139,
    supportAssemblyCount: 38,
    supportPhysicalLocationCount: 37,
    routeCount: 13,
    renderableCount: 150,
  };
  const runs = [{ fixturePath: 'benchmarks/Sjson.json', sampleKind: 'COLD', identity }];
  const verified = resolveNonFeaFixtureRoleBindings({}, ledger, runs);
  assert.equal(verified.bindings.find((row) => row.role === 'REAL_1885_SUPPORT_BRANCH').status, 'VERIFIED');

  const drifted = resolveNonFeaFixtureRoleBindings({}, ledger, [
    { fixturePath: 'benchmarks/Sjson.json', sampleKind: 'COLD', identity: { ...identity, routeCount: 12 } },
  ]);
  assert.equal(drifted.failures.some((row) => row.code === 'P0_FIXTURE_AUTHORITY_IDENTITY_MISMATCH'), true);
});

test('P0 retains unresolved gates for unaccepted or external source bytes', () => {
  const twentyPath = 'public/fixtures/topology-edit-20-element-demo.staged.json';
  const ledger = [{ path: twentyPath, status: 'PRESENT', sourceSha256: 'a'.repeat(64) }];
  const runs = [{
    fixturePath: twentyPath,
    sampleKind: 'COLD',
    identity: { entityCount: 20, pipeCount: 15, supportCount: 5 },
  }];
  const result = resolveNonFeaFixtureRoleBindings({}, ledger, runs);
  assert.equal(result.bindings.find((row) => row.role === 'TOPOLOGY_EDIT_20_OBJECT').status,
    'CAPTURED_PENDING_OWNER_ACCEPTANCE');
  assert.equal(result.bindings.find((row) => row.role === 'LARGE_MODEL_4884_ENTITY').status, 'UNBOUND');
  assert.equal(result.failures.some((row) => row.code === 'P0_FIXTURE_SHA_EXPECTATION_MISSING'), true);
  assert.equal(result.failures.some((row) => row.code === 'P0_FIXTURE_AUTHORITY_UNBOUND'), true);
});
