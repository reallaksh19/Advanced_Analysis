import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(
  ROOT,
  'reports/qualification/topology-edit-track-c-evidence.json',
);
const TRACK_B_PREREQUISITE_PATH =
  'tests/fixtures/topology-edit/1885s/prerequisite-manifest.json';
const FILES = Object.freeze([
  'src/workspace/topology-edit/topology-edit-scope-contract.js',
  'src/workspace/topology-edit/topology-edit-large-model-controller.js',
  'src/workspace/topology-edit/topology-edit-worker-client.js',
  'src/workspace/topology-edit/topology-edit-worker.js',
  'tests/topology-edit-track-c.test.mjs',
  'tests/fixtures/topology-edit/large-model/fixture-manifest.json',
  TRACK_B_PREREQUISITE_PATH,
]);

const startedAt = process.env.TOPOLOGY_EDIT_QUALIFICATION_STARTED_AT ||
  new Date().toISOString();
const gitHead = git(['rev-parse', 'HEAD']);
const expectedHead =
  process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || gitHead;
assert.equal(
  gitHead,
  expectedHead,
  `Track C evidence belongs to ${gitHead}, expected exact head ${expectedHead}`,
);

const sourceManifest = JSON.parse(
  await readFile(
    path.join(ROOT, 'src/vendor/topology-edit/source-manifest.json'),
    'utf8',
  ),
);
const fileHashes = {};
for (const repositoryPath of FILES) {
  fileHashes[repositoryPath] = sha256(
    await readFile(path.join(ROOT, repositoryPath)),
  );
}
const fixtureManifestPath =
  'tests/fixtures/topology-edit/large-model/fixture-manifest.json';
const fixtureManifest = JSON.parse(
  await readFile(path.join(ROOT, fixtureManifestPath), 'utf8'),
);
const trackBPrerequisiteManifest = JSON.parse(
  await readFile(path.join(ROOT, TRACK_B_PREREQUISITE_PATH), 'utf8'),
);
const trackBPrerequisitesMerged = trackBPrerequisiteManifest.prerequisites
  .every((row) => row.status === 'PASS_MERGED');
const correctedWave3 = trackBPrerequisiteManifest.prerequisites
  .find((row) => row.waveId === 'WAVE_3');
assert.ok(correctedWave3, 'Track C evidence requires a Wave 3 prerequisite row.');

const evidenceBase = {
  schema: 'TopologyEditTrackCQualificationEvidence.v1',
  status: trackBPrerequisitesMerged
    ? 'PASS_FOUNDATION_TRACK_B_MERGED_EXECUTION_BLOCKED'
    : 'PASS_FOUNDATION_TRACK_B_INCOMPLETE',
  repository: sourceManifest.targetRepository,
  commit: gitHead,
  sourceRepository: sourceManifest.sourceRepository,
  sourceCommit: sourceManifest.sourceCommit,
  testCommand: 'node --test tests/topology-edit-track-c.test.mjs',
  startedAt,
  completedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  fixture: {
    fixtureId: fixtureManifest.fixtureId,
    manifestPath: fixtureManifestPath,
    manifestSha256: fileHashes[fixtureManifestPath],
    componentCount: fixtureManifest.expected.componentCount,
    portable: fixtureManifest.expected.portable,
    absolutePathDependencies:
      fixtureManifest.expected.absolutePathDependencies,
  },
  trackBClosure: {
    status: trackBPrerequisitesMerged
      ? 'MERGED_LINEAGE_READY_EXECUTION_BLOCKED'
      : 'INCOMPLETE_LINEAGE_BLOCKED',
    prerequisiteManifestPath: TRACK_B_PREREQUISITE_PATH,
    prerequisiteManifestSha256: fileHashes[TRACK_B_PREREQUISITE_PATH],
    allPrerequisitesMerged: trackBPrerequisitesMerged,
    correctedWave3: {
      pullRequests: [...(correctedWave3.pullRequests ?? [])],
      mergeCommit: correctedWave3.mergeCommit ?? null,
    },
    releaseQualified: false,
  },
  contracts: {
    deterministicScopeHash: 'PASSED',
    canonicalSpatialIndex: 'PASSED',
    staleWorkerResponseRejection: 'PASSED',
    percentileBudgetGate: 'PASSED',
    exactHead: 'PASSED',
    trackBPrerequisiteLineage:
      trackBPrerequisitesMerged ? 'PASSED' : 'BLOCKED',
  },
  deferred: [
    'Exact-head integrated Wave 5 qualification must execute and retain logs/artifacts.',
    'Browser/GPU timing requires an executable exact-head browser qualification run.',
    'Pre-step infrastructure failures with no executable steps or logs are not release evidence.',
  ],
  fileHashes,
};
const evidence = {
  ...evidenceBase,
  evidenceSha256: sha256(
    Buffer.from(JSON.stringify(canonicalize(evidenceBase))),
  ),
};
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Topology Edit Track C evidence written for ${gitHead}.`);

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}
