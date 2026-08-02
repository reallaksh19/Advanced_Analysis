import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createTopologyEditWave5ReleaseReceipt,
} from '../scripts/topology-edit-wave5-contract.mjs';

const prerequisiteUrl = new URL(
  './fixtures/topology-edit/1885s/prerequisite-manifest.json',
  import.meta.url,
);

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('Track B prerequisite manifest binds every completed wave', async () => {
  const manifest = JSON.parse(await readFile(prerequisiteUrl, 'utf8'));
  assert.equal(manifest.schema, 'TopologyEditWave5PrerequisiteManifest.v2');
  assert.deepEqual(manifest.prerequisites.map((row) => row.waveId), [
    'WAVE_0', 'WAVE_1', 'WAVE_2', 'WAVE_3', 'WAVE_4',
  ]);
  assert.equal(manifest.prerequisites.every((row) => row.status === 'PASS_MERGED'), true);
  assert.equal(
    manifest.prerequisites.find((row) => row.waveId === 'WAVE_3').mergeCommit,
    '4dc7e7ca0ec7677d7616dd2e128fe63cfe3432d6',
  );
  assert.equal(
    manifest.prerequisites.find((row) => row.waveId === 'WAVE_4').mergeCommit,
    'cbd5b29aa3f131a6072f9d6bdb5e308f007b5691',
  );
});

test('complete Track B evidence can issue PASS_RELEASE', async () => {
  const manifest = JSON.parse(await readFile(prerequisiteUrl, 'utf8'));
  const receipt = createTopologyEditWave5ReleaseReceipt({
    candidateHead: 'exact-head',
    expectedHead: 'exact-head',
    prerequisites: manifest.prerequisites.map((row) => ({ ...row, status: 'PASS' })),
    performanceEvidence: { status: 'PASS' },
    browserEvidence: { status: 'PASS' },
    fixtureEvidence: { status: 'PASS' },
    driftEvidence: { status: 'PASS' },
  });
  assert.equal(receipt.status, 'PASS_RELEASE');
  assert.deepEqual(receipt.blockers, []);
  assert.deepEqual(receipt.failures, []);
});

test('production controller consumes checker, autofix, persistence, export, and commit authority', async () => {
  const controller = await source('src/workspace/topology-edit-3d-view-controller.js');
  const core = await source('src/workspace/topology-edit-3d-view-controller-core.js');
  const lifecycle = await source('src/workspace/topology-edit/topology-edit-lifecycle-controller.js');
  const commit = await source('src/workspace/topology-edit/topology-edit-commit-service.js');
  assert.match(core, /checkCanonicalTopology/);
  assert.match(core, /previewAutofix/);
  assert.match(controller, /saveDraft/);
  assert.match(controller, /reloadDraft/);
  assert.match(controller, /exportDraft/);
  assert.match(controller, /commitDraft/);
  assert.match(lifecycle, /createTopologyEditDraftPackage/);
  assert.match(lifecycle, /prepareTopologyEditExport/);
  assert.match(lifecycle, /commitPreparedTopologyEditExport/);
  assert.match(commit, /read-back hash mismatch/);
  assert.match(commit, /ROLLED_BACK/);
});

test('Wave 5 evidence writer is deterministic and no longer hard-blocked', async () => {
  const writer = await source('scripts/topology-edit-write-wave5-evidence.mjs');
  assert.match(writer, /assert\.equal\(releaseReceipt\.status, 'PASS_RELEASE'/);
  assert.match(writer, /fixtureEvidence/);
  assert.doesNotMatch(writer, /fixtureEidence/);
  assert.doesNotMatch(writer, /generatedAt/);
  assert.doesNotMatch(writer, /new Date/);
  assert.doesNotMatch(writer, /BLOCKED_INCOMPLETE_OPERATIONS/);
});
