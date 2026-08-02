import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isAbsoluteFixturePath,
  validateTopologyEditFixtureManifest,
} from './topology-edit-wave5-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = 'tests/fixtures/topology-edit/1885s/fixture-manifest.json';
const RETAINED_EVIDENCE_PATH = 'public/qualification/1885s-webgl-load-benchmark.json';
const OUTPUT = path.join(ROOT, 'reports/qualification/topology-edit-wave5-fixtures.json');
const ACTIVE_PATH_FILES = Object.freeze([
  'scripts/1885s-empirical-qualification.mjs',
  MANIFEST_PATH,
]);

const rawManifest = JSON.parse(await readFile(path.join(ROOT, MANIFEST_PATH), 'utf8'));
const manifest = validateTopologyEditFixtureManifest(rawManifest);
const retainedEvidenceBytes = await readFile(path.join(ROOT, RETAINED_EVIDENCE_PATH));
const retainedEvidence = JSON.parse(retainedEvidenceBytes.toString('utf8'));
const cacheRoot = process.env.TOPOLOGY_EDIT_FIXTURE_CACHE
  ? path.resolve(process.env.TOPOLOGY_EDIT_FIXTURE_CACHE)
  : null;
const requireMaterialized = process.argv.includes('--require-materialized');
const sources = [];

for (const source of manifest.sources) {
  if (source.repositoryPath) {
    const bytes = await readFile(path.join(ROOT, source.repositoryPath));
    assert.equal(sha256(bytes), source.sha256, `${source.sourceId} repository fixture hash mismatch.`);
    sources.push({ ...source, status: 'REPOSITORY_OWNED_VERIFIED' });
    continue;
  }
  const cachePath = cacheRoot ? path.join(cacheRoot, 'sha256', source.sha256) : null;
  if (cachePath) {
    try {
      const bytes = await readFile(cachePath);
      assert.equal(sha256(bytes), source.sha256, `${source.sourceId} cache hash mismatch.`);
      sources.push({ ...source, status: 'CONTENT_ADDRESSED_VERIFIED' });
      continue;
    } catch (error) {
      if (requireMaterialized && source.required) throw error;
    }
  } else if (requireMaterialized && source.required) {
    throw new Error(`${source.sourceId} requires TOPOLOGY_EDIT_FIXTURE_CACHE materialization.`);
  }

  const retainedHash = retainedEvidence.sources?.[source.sourceId]?.sha256;
  assert.equal(
    retainedHash,
    source.sha256,
    `${source.sourceId} retained empirical evidence hash mismatch.`,
  );
  sources.push({
    ...source,
    status: 'CONTENT_ADDRESSED_RETAINED_EVIDENCE_VERIFIED',
    retainedEvidencePath: RETAINED_EVIDENCE_PATH,
  });
}

const absolutePathFindings = [];
for (const repositoryPath of ACTIVE_PATH_FILES) {
  const text = await readFile(path.join(ROOT, repositoryPath), 'utf8');
  const candidates = text.match(/(?:[A-Za-z]:[\\/][^"'\s]+|\\\\[^"'\s]+|\/(?:tmp|home|Users|mnt)\/[^"'\s]+)/gu) ?? [];
  candidates.filter(isAbsoluteFixturePath).forEach((value) => {
    absolutePathFindings.push({ repositoryPath, value });
  });
}
assert.deepEqual(absolutePathFindings, [], 'Active fixture contracts contain absolute paths.');

const qualifiedStatuses = new Set([
  'REPOSITORY_OWNED_VERIFIED',
  'CONTENT_ADDRESSED_VERIFIED',
  'CONTENT_ADDRESSED_RETAINED_EVIDENCE_VERIFIED',
]);
const qualified = sources.every((source) => qualifiedStatuses.has(source.status));
const evidence = {
  schema: 'TopologyEditWave5FixtureEvidence.v2',
  status: qualified ? 'PASS' : 'FAIL',
  manifestPath: MANIFEST_PATH,
  manifestSha256: sha256(await readFile(path.join(ROOT, MANIFEST_PATH))),
  retainedEvidencePath: RETAINED_EVIDENCE_PATH,
  retainedEvidenceSha256: sha256(retainedEvidenceBytes),
  portable: true,
  rawAssetsMaterialized: sources.every((source) => (
    source.status === 'REPOSITORY_OWNED_VERIFIED'
      || source.status === 'CONTENT_ADDRESSED_VERIFIED'
  )),
  absolutePathFindings,
  sources,
};
assert.equal(evidence.status, 'PASS');
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Topology Edit Wave 5 fixture evidence: ${evidence.status}.`);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
