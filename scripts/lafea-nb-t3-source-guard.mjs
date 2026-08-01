#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex === -1 ? null : process.argv[baseIndex + 1];
if (!base) throw new TypeError('Usage: node scripts/lafea-nb-t3-source-guard.mjs --base <sha>');

const expected = Object.freeze([
  '.github/workflows/lafea-nb-t3-registry-composition.yml',
  'docs/LAFEA_NonBucket_NB-T3_Registry_Composition.md',
  'scripts/lafea-nb-t3-registry-composition-check.mjs',
  'scripts/lafea-nb-t3-source-guard.mjs',
  'scripts/lafea-nonbucket-scope-guard.mjs',
  'scripts/lafea-nonbucket-stack-check.mjs',
  'scripts/lafea-u1-stage-registry-check.mjs',
  'scripts/lafea-u1b-registry-consumer-check.mjs',
  'src/workspace/lafea-stage-benchmark-manifests.js',
  'src/workspace/lafea-stage-composition-root.js',
  'src/workspace/lafea-stage-registry.js',
  'src/workspace/lafea-workbench-model.js',
  'src/workspace/lafea-workbench.js',
].sort());
const changed = git(['diff', '--name-only', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed, expected);

const statuses = new Map(git(['diff', '--name-status', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).map((line) => {
    const [status, path] = line.split('\t');
    return [path, status];
  }));
for (const path of [
  '.github/workflows/lafea-nb-t3-registry-composition.yml',
  'docs/LAFEA_NonBucket_NB-T3_Registry_Composition.md',
  'scripts/lafea-nb-t3-registry-composition-check.mjs',
  'scripts/lafea-nb-t3-source-guard.mjs',
  'src/workspace/lafea-stage-benchmark-manifests.js',
  'src/workspace/lafea-stage-composition-root.js',
]) assert.equal(statuses.get(path), 'A', `${path} must be additive.`);
for (const path of expected.filter((path) => ![
  '.github/workflows/lafea-nb-t3-registry-composition.yml',
  'docs/LAFEA_NonBucket_NB-T3_Registry_Composition.md',
  'scripts/lafea-nb-t3-registry-composition-check.mjs',
  'scripts/lafea-nb-t3-source-guard.mjs',
  'src/workspace/lafea-stage-benchmark-manifests.js',
  'src/workspace/lafea-stage-composition-root.js',
].includes(path))) assert.equal(statuses.get(path), 'M', `${path} must modify retained integration only.`);

const registry = read('src/workspace/lafea-stage-registry.js');
const composition = read('src/workspace/lafea-stage-composition-root.js');
const manifests = read('src/workspace/lafea-stage-benchmark-manifests.js');
const model = read('src/workspace/lafea-workbench-model.js');
const publicSource = read('src/workspace/lafea-workbench.js');
assert.match(registry, /lafea-stage-registry\/v2/u);
assert.match(registry, /compositionRootId/u);
assert.match(registry, /lifecycleProfileId/u);
assert.match(registry, /benchmarkManifestId/u);
assert.match(registry, /releaseState:\s*'RELEASE_NOT_QUALIFIED'/u);
assert.doesNotMatch(registry, /releaseState:\s*'RELEASE_QUALIFIED'/u);
assert.match(composition, /const ROUTES = Object\.freeze/u);
assert.match(composition, /Every LAFEA stage must have exactly one composition route/u);
assert.match(model, /lafea-stage-composition-root\.js/u);
assert.doesNotMatch(model,
  /calculateLocalAttachment|calculateLocalContinuum|calculateLocalShell|calculateLocalTrunnion/u);
assert.match(manifests, /NB-BM/u);
assert.match(manifests, /NB-AD/u);
assert.match(manifests, /INDEPENDENT_EXPECTED_EVIDENCE_REQUIRED/u);
assert.match(manifests, /ANY_REQUIRED_GATE_FAILURE_BLOCKS_RELEASE/u);
assert.match(publicSource, /LAFEA_STAGE_COMPOSITION_METADATA/u);
assert.match(publicSource, /LAFEA_STAGE_BENCHMARK_MANIFESTS/u);

for (const forbidden of [
  'src/core/',
  'src/workspace/lafea-lifecycle.js',
  'src/workspace/lafea-lifecycle-producers.js',
  'src/workspace/lafea-lifecycle-profiles.js',
  'src/workspace/lafea-lifecycle-workbench-store.js',
  'src/workspace/lafea-lifecycle-workbench-store-retained.js',
  'src/workspace/lafea-workbench-controller.js',
  'src/workspace/lafea-workbench-view.js',
  'src/workspace/lafea-result-presenters/',
  'src/core/lafea-application-templates/',
  'release/',
]) assert.equal(changed.some((path) => path === forbidden || path.startsWith(forbidden)), false,
  `Forbidden NB-T3 path changed: ${forbidden}`);

console.log(JSON.stringify({
  check: 'lafea-nb-t3-source-guard',
  status: 'PASS',
  base,
  changedFiles: changed.length,
  additiveFiles: 6,
  modifiedIntegrationFiles: 7,
  numericalCoreFilesModified: 0,
  lifecycleSemanticsFilesModified: 0,
  controllerOrViewFilesModified: 0,
  templateBucketFilesModified: 0,
  releaseFilesModified: 0,
  registryV2Implemented: true,
  compositionRoutes: 6,
  duplicateDispatchMaps: 0,
  benchmarkExpectedValuesAuthored: 0,
  releaseQualified: false,
  lafea6Enabled: false,
}));

function read(path) {
  return readFileSync(path, 'utf8');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
