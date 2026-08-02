import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TOPOLOGY_EDIT_PICKING_MODES,
  createTopologyEditColorIdRegistry,
  createTopologyEditWave5ReleaseReceipt,
  decodeTopologyEditColorId,
  encodeTopologyEditColorId,
  isAbsoluteFixturePath,
  selectTopologyEditPickingMode,
  validateTopologyEditFixtureManifest,
} from '../scripts/topology-edit-wave5-contract.mjs';

test('GPU color IDs round-trip across the full 24-bit range', () => {
  for (const id of [1, 2, 255, 256, 65_535, 65_536, 16_777_215]) {
    const encoded = encodeTopologyEditColorId(id);
    assert.equal(decodeTopologyEditColorId(encoded), id);
    assert.equal(decodeTopologyEditColorId([encoded.r, encoded.g, encoded.b]), id);
  }
});

test('GPU color registry is deterministic and preserves distinct canonical identity', () => {
  const targets = [
    { objectId: 'component-B', objectKind: 'component', canonicalId: 'component-B' },
    { objectId: 'component-A', objectKind: 'component', canonicalId: 'component-A' },
    { objectId: 'support-A:r2', objectKind: 'restraint', canonicalId: 'support-A' },
  ];
  const first = createTopologyEditColorIdRegistry(targets);
  const second = createTopologyEditColorIdRegistry([...targets].reverse());
  assert.deepEqual(first.registryHashInput, second.registryHashInput);
  assert.deepEqual(first.entries.map((entry) => entry.objectId), [
    'component-A',
    'component-B',
    'support-A:r2',
  ]);
  assert.equal(new Set(first.entries.map((entry) => entry.colorId)).size, 3);
});

test('GPU picking is enabled only when measured scale and latency justify it', () => {
  const common = {
    componentCount: 25_600,
    gpuThreshold: 5_000,
    pickBudgetMs: 100,
    cpuEvidence: { sampleCount: 100, p95Ms: 160, identityErrorCount: 0 },
  };
  assert.equal(
    selectTopologyEditPickingMode(common).mode,
    TOPOLOGY_EDIT_PICKING_MODES.RAYCAST,
  );
  const qualified = selectTopologyEditPickingMode({
    ...common,
    gpuEvidence: { sampleCount: 100, p95Ms: 25, identityErrorCount: 0 },
  });
  assert.equal(qualified.mode, TOPOLOGY_EDIT_PICKING_MODES.GPU_COLOR_ID);
  assert.equal(qualified.reason, 'MEASURED_SCALE_JUSTIFIES_GPU_PICKING');

  const cpuWithinBudget = selectTopologyEditPickingMode({
    ...common,
    cpuEvidence: { sampleCount: 100, p95Ms: 40, identityErrorCount: 0 },
    gpuEvidence: { sampleCount: 100, p95Ms: 10, identityErrorCount: 0 },
  });
  assert.equal(cpuWithinBudget.mode, TOPOLOGY_EDIT_PICKING_MODES.RAYCAST);
  assert.equal(cpuWithinBudget.reason, 'CPU_RAYCAST_WITHIN_RELEASE_BUDGET');
});

test('portable 1885S fixture manifest has no absolute developer paths', async () => {
  const manifest = JSON.parse(await readFile(
    new URL('./fixtures/topology-edit/1885s/fixture-manifest.json', import.meta.url),
    'utf8',
  ));
  const validated = validateTopologyEditFixtureManifest(manifest);
  assert.equal(validated.portable, true);
  assert.equal(validated.sources.length, 4);
  validated.sources.forEach((source) => {
    assert.equal(isAbsoluteFixturePath(source.repositoryPath), false);
    assert.equal(isAbsoluteFixturePath(source.contentAddress), false);
  });
});

test('fixture path guard rejects Windows, UNC, and Unix absolute paths', () => {
  assert.equal(isAbsoluteFixturePath('F:/fixture.json'), true);
  assert.equal(isAbsoluteFixturePath('D:\\fixture.xlsx'), true);
  assert.equal(isAbsoluteFixturePath('\\\\server\\share\\fixture.xlsx'), true);
  assert.equal(isAbsoluteFixturePath('/tmp/fixture.json'), true);
  assert.equal(isAbsoluteFixturePath('benchmarks/Sjson.json'), false);
  assert.equal(isAbsoluteFixturePath('sha256:abc'), false);
});

test('Wave 5 release receipt stays blocked until Waves 3 and 4 and final evidence pass', () => {
  const blocked = createTopologyEditWave5ReleaseReceipt({
    candidateHead: 'head-1',
    expectedHead: 'head-1',
    prerequisites: [
      { waveId: 'WAVE_0', status: 'PASS' },
      { waveId: 'WAVE_1', status: 'PASS' },
      { waveId: 'WAVE_2', status: 'PASS' },
      { waveId: 'WAVE_3', status: 'BLOCKED' },
      { waveId: 'WAVE_4', status: 'BLOCKED' },
    ],
    performanceEvidence: { status: 'BLOCKED' },
    browserEvidence: { status: 'PASS' },
    fixtureEvidence: { status: 'PASS' },
    driftEvidence: { status: 'PASS' },
  });
  assert.equal(blocked.status, 'BLOCKED_PREREQUISITES');
  assert.ok(blocked.blockers.includes('WAVE_3_BLOCKED'));
  assert.ok(blocked.blockers.includes('WAVE_4_BLOCKED'));

  const passed = createTopologyEditWave5ReleaseReceipt({
    candidateHead: 'head-1',
    expectedHead: 'head-1',
    prerequisites: [
      { waveId: 'WAVE_0', status: 'PASS' },
      { waveId: 'WAVE_1', status: 'PASS' },
      { waveId: 'WAVE_2', status: 'PASS' },
      { waveId: 'WAVE_3', status: 'PASS' },
      { waveId: 'WAVE_4', status: 'PASS' },
    ],
    performanceEvidence: { status: 'PASS' },
    browserEvidence: { status: 'PASS' },
    fixtureEvidence: { status: 'PASS' },
    driftEvidence: { status: 'PASS' },
  });
  assert.equal(passed.status, 'PASS_RELEASE');
});

test('exact-head mismatch is a hard Wave 5 failure', () => {
  const receipt = createTopologyEditWave5ReleaseReceipt({
    candidateHead: 'head-a',
    expectedHead: 'head-b',
    prerequisites: [],
    performanceEvidence: { status: 'BLOCKED' },
    browserEvidence: { status: 'BLOCKED' },
    fixtureEvidence: { status: 'BLOCKED' },
    driftEvidence: { status: 'BLOCKED' },
  });
  assert.equal(receipt.status, 'FAIL');
  assert.ok(receipt.failures.includes('EXACT_HEAD_MISMATCH'));
});
