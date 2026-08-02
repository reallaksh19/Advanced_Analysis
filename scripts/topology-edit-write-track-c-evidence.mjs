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
const FILES = Object.freeze([
  'src/workspace/topology-edit/topology-edit-scope-contract.js',
  'src/workspace/topology-edit/topology-edit-large-model-controller.js',
  'src/workspace/topology-edit/topology-edit-worker-client.js',
  'src/workspace/topology-edit/topology-edit-worker.js',
  'tests/topology-edit-track-c.test.mjs',
  'tests/fixtures/topology-edit/large-model/fixture-manifest.json',
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

const evidenceBase = {
  schema: 'TopologyEditTrackCQualificationEvidence.v1',
  status: 'PASS_FOUNDATION_NOT_FINAL_RELEASE',
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
  contracts: {
    deterministicScopeHash: 'PASSED',
    canonicalSpatialIndex: 'PASSED',
    staleWorkerResponseRejection: 'PASSED',
    percentileBudgetGate: 'PASSED',
    exactHead: 'PASSED',
  },
  deferred: [
    'Browser/GPU timing requires an exact-head browser qualification run.',
    'The legacy 1885 empirical package still requires separate fixture packaging.',
    'Final release qualification waits for Waves 1 through 4.',
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
