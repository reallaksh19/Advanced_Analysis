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
  const wave3 = manifest.prerequisites.find((row) => row.waveId === 'WAVE_3');
  assert.deepEqual(wave3.pullRequests, [267, 271, 272, 277]);
  assert.equal(
    wave3.mergeCommit,
    '2d4fc3596a5bc0057740945c769c71be1efec296',
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

test('production controller consumes checker, autofix, lifecycle, interaction, and professional authority', async () => {
  const controller = await source('src/workspace/topology-edit-3d-view-controller.js');
  const core = await source('src/workspace/topology-edit-3d-view-controller-core.js');
  const professional = await source('src/workspace/topology-edit-3d-professional-controller.js');
  const loadCalc = await source('src/workspace/load-calc-consumer-controller.js');
  const lifecycle = await source('src/workspace/topology-edit/topology-edit-lifecycle-controller.js');
  const commit = await source('src/workspace/topology-edit/topology-edit-commit-service.js');
  assert.match(core, /checkCanonicalTopology/);
  assert.match(core, /previewAutofix/);
  assert.match(controller, /saveDraft/);
  assert.match(controller, /reloadDraft/);
  assert.match(controller, /exportDraft/);
  assert.match(controller, /commitDraft/);
  assert.match(professional, /topology-edit-3d-interaction-controller\.js/);
  assert.match(professional, /TopologyEditProfessionalOperationRuntime/);
  assert.match(loadCalc, /topology-edit-3d-professional-controller\.js/);
  assert.match(lifecycle, /createTopologyEditDraftPackage/);
  assert.match(lifecycle, /prepareTopologyEditExport/);
  assert.match(lifecycle, /commitPreparedTopologyEditExport/);
  assert.match(commit, /read-back hash mismatch/);
  assert.match(commit, /ROLLED_BACK/);
});

test('Wave 5 evidence writer requires exact professional integration evidence', async () => {
  const writer = await source('scripts/topology-edit-write-wave5-evidence.mjs');
  assert.match(writer, /assert\.equal\(releaseReceipt\.status, 'PASS_RELEASE'/);
  assert.match(writer, /TopologyEditWave5QualificationEvidence\.v5/);
  assert.match(writer, /PASS_TRACK_A_VISIBLE_INTERACTION/);
  assert.match(writer, /PASS_PROFESSIONAL_3D_INTEGRATION/);
  assert.match(writer, /professionalEvidence/);
  assert.match(writer, /transactionHash/);
  assert.match(writer, /persistenceRestored/);
  assert.match(writer, /fixtureEvidence/);
  assert.doesNotMatch(writer, /fixtureEidence/);
  assert.doesNotMatch(writer, /generatedAt/);
  assert.doesNotMatch(writer, /new Date/);
  assert.doesNotMatch(writer, /BLOCKED_INCOMPLETE_OPERATIONS/);
});

test('original-plan audit requires professional exact-head closure', async () => {
  const audit = await source('scripts/topology-edit-original-plan-audit.mjs');
  assert.match(audit, /TopologyEditOriginalPlanAudit\.v2/);
  assert.match(audit, /PROFESSIONAL_3D_EDIT_INTEGRATION/);
  assert.match(audit, /PASS_EXECUTED_EXACT_HEAD/);
  assert.match(audit, /ATOMIC_CERTIFIED_COMMAND_GROUP/);
  assert.match(audit, /CANCELLABLE_MODULE_WORKER/);
  assert.match(audit, /productionBehaviorChanged: true/);
});

test('content-addressed fixture fallback requires exact retained evidence hashes', async () => {
  const checker = await source('scripts/topology-edit-wave5-fixture-check.mjs');
  assert.match(checker, /CONTENT_ADDRESSED_RETAINED_EVIDENCE_VERIFIED/);
  assert.match(checker, /retained empirical evidence hash mismatch/);
  assert.match(checker, /retainedEvidenceSha256/);
  assert.match(checker, /rawAssetsMaterialized/);
  assert.doesNotMatch(checker, /CONTENT_ADDRESSED_NOT_MATERIALIZED/);
});
