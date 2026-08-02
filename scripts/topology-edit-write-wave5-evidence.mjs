import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTopologyEditWave5ReleaseReceipt } from './topology-edit-wave5-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'reports/qualification/topology-edit-wave5-evidence.json');
const BROWSER_PATH = path.join(ROOT, 'reports/qualification/topology-edit-wave5-browser.json');
const FIXTURE_PATH = path.join(ROOT, 'reports/qualification/topology-edit-wave5-fixtures.json');
const PREREQUISITE_PATH = path.join(
  ROOT,
  'tests/fixtures/topology-edit/1885s/prerequisite-manifest.json',
);
const QUALIFIED_FILES = Object.freeze([
  '.github/workflows/topology-edit-wave5.yml',
  'scripts/1885s-empirical-qualification.mjs',
  'scripts/topology-edit-wave5-contract.mjs',
  'scripts/topology-edit-wave5-fixture-check.mjs',
  'scripts/topology-edit-write-wave5-evidence.mjs',
  'tests/topology-edit-wave5.test.mjs',
  'tests/topology-edit-wave5-browser-harness.js',
  'tests/topology-edit-wave5-browser.spec.mjs',
  'tests/fixtures/topology-edit/1885s/fixture-manifest.json',
  'tests/fixtures/topology-edit/1885s/prerequisite-manifest.json',
]);

const candidateHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || candidateHead;
assert.equal(candidateHead, expectedHead, 'Wave 5 evidence must bind to the exact candidate head.');

const prerequisiteManifest = JSON.parse(await readFile(PREREQUISITE_PATH, 'utf8'));
const prerequisites = prerequisiteManifest.prerequisites.map((row) => {
  if (!row.mergeCommit) return row;
  const ancestor = gitStatus(['merge-base', '--is-ancestor', row.mergeCommit, candidateHead]);
  return {
    ...row,
    status: ancestor ? 'PASS' : 'FAIL',
    reason: ancestor ? null : `Merge commit ${row.mergeCommit} is not an ancestor of ${candidateHead}.`,
  };
});
const browserEvidence = await readJsonOrBlocked(BROWSER_PATH, 'BROWSER_EVIDENCE_NOT_RUN');
const fixtureEvidence = await readJsonOrBlocked(FIXTURE_PATH, 'FIXTURE_EVIDENCE_NOT_RUN');
const performanceEvidence = {
  status: 'BLOCKED_INCOMPLETE_OPERATIONS',
  reason: 'Wave 3 checker/ghost operations and Wave 4 save, commit, reload, and rollback operations are not available for final latency qualification.',
  browserMetrics: browserEvidence.status?.startsWith('PASS') ? {
    firstValidFrameMs: browserEvidence.firstValidFrameMs,
    pickP95Ms: browserEvidence.pick?.p95 ?? null,
    frameP95Ms: browserEvidence.navigationFrame?.p95 ?? null,
  } : null,
};
const driftEvidence = {
  status: process.env.TOPOLOGY_EDIT_WAVE5_DRIFT_STATUS || 'BLOCKED_NOT_RUN',
};
const releaseReceipt = createTopologyEditWave5ReleaseReceipt({
  candidateHead,
  expectedHead,
  prerequisites,
  performanceEvidence,
  browserEvidence,
  fixtureEvidence,
  driftEvidence,
});
assert.notEqual(releaseReceipt.status, 'PASS_RELEASE', 'Wave 5 must not pass before Waves 3 and 4 close.');
assert.notEqual(releaseReceipt.status, 'FAIL', JSON.stringify(releaseReceipt, null, 2));

const fileHashes = {};
for (const repositoryPath of QUALIFIED_FILES) {
  fileHashes[repositoryPath] = sha256(await readFile(path.join(ROOT, repositoryPath)));
}
const evidenceBase = {
  schema: 'TopologyEditWave5QualificationEvidence.v1',
  status: 'PASS_INFRASTRUCTURE_BLOCKED_FINAL_RELEASE',
  candidateHead,
  expectedHead,
  generatedAt: new Date().toISOString(),
  releaseReceipt,
  browserEvidence,
  fixtureEidence,
  performanceEvidence,
  driftEvidence,
  fileHashes,
};
const evidence = {
  ...evidenceBase,
  evidenceSha256: sha256(Buffer.from(JSON.stringify(canonicalize(evidenceBase)))),
};
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Topology Edit Wave 5 evidence written for ${candidateHead}: ${evidence.status}.`);

async function readJsonOrBlocked(filePath, reason) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return { status: `BLOCKED_${reason}` };
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function gitStatus(args) {
  try {
    execFileSync('git', args, { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
