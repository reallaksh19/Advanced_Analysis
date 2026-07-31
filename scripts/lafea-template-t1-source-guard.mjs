#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_APPLICATION_TEMPLATE_REGISTRY,
  LAFEA_COMPUTATIONAL_BUCKET_REGISTRY,
  LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS,
} from '../src/core/lafea-application-templates/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_ROOT = path.join(ROOT, 'src', 'core', 'lafea-application-templates');
const STAGE_REGISTRY = path.join(ROOT, 'src', 'workspace', 'lafea-stage-registry.js');

const EXPECTED_PACKAGE_FILES = Object.freeze([
  'benchmark-manifests/initial-manifests.js',
  'benchmark-manifests/schemas.js',
  'bucket-registry.js',
  'contracts.js',
  'index.js',
  'parameter-validator.js',
  'template-readiness.js',
  'template-registry.js',
]);

const ALLOWED_CHANGED_PATHS = Object.freeze([
  /^scripts\/lafea-template-t1-contract-check\.mjs$/u,
  /^scripts\/lafea-template-t1-source-guard\.mjs$/u,
  /^src\/core\/lafea-application-templates\/.+\.js$/u,
]);

const packageFiles = listJavaScriptFiles(PACKAGE_ROOT)
  .map((file) => path.relative(PACKAGE_ROOT, file).replaceAll(path.sep, '/'))
  .sort(asciiCompare);
assert.deepEqual(packageFiles, EXPECTED_PACKAGE_FILES);

const packageSources = new Map(
  packageFiles.map((relativePath) => [
    relativePath,
    fs.readFileSync(path.join(PACKAGE_ROOT, relativePath), 'utf8'),
  ]),
);

const stageRegistrySource = fs.readFileSync(STAGE_REGISTRY, 'utf8');
assert.doesNotMatch(
  stageRegistrySource,
  /lafea-application-templates/u,
  'Agent 1 stage registry must not import or mention the Agent 2 template layer.',
);

let stageRegistryImportCount = 0;
for (const [relativePath, source] of packageSources) {
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/gu)]
    .map((match) => match[1]);

  imports.forEach((specifier) => {
    if (specifier.includes('lafea-stage-registry.js')) {
      stageRegistryImportCount += 1;
      assert.equal(
        relativePath,
        'bucket-registry.js',
        'Only bucket-registry.js may read the Agent 1 registry directly.',
      );
      assert.equal(
        specifier,
        '../../workspace/lafea-stage-registry.js',
        'Stage registry dependency must use the frozen read-only seam.',
      );
    }

    assert.doesNotMatch(
      specifier,
      /(?:^|\/)(?:local-stress|local-attachment-screening|local-continuum|local-shell|local-trunnion-footprint)(?:\/|$)/u,
      `${relativePath} must not import a numerical core engine.`,
    );
    assert.doesNotMatch(
      specifier,
      /lafea-(?:workbench-model|workbench-view|workbench-controller|result-presenters|stage-preview)/u,
      `${relativePath} must not import Agent 1 consumers.`,
    );
  });

  assert.doesNotMatch(source, /\bDate\.now\s*\(/u, `${relativePath} contains Date.now.`);
  assert.doesNotMatch(source, /\bnew\s+Date\s*\(/u, `${relativePath} contains new Date.`);
  assert.doesNotMatch(source, /\bMath\.random\s*\(/u, `${relativePath} contains Math.random.`);
  assert.doesNotMatch(source, /\brandomUUID\s*\(/u, `${relativePath} contains randomUUID.`);
  assert.doesNotMatch(source, /\bdefaultValue\b/u, `${relativePath} contains a hidden defaultValue field.`);
  assert.doesNotMatch(source, /\bmeshConfig\b/u, `${relativePath} must not consume UI meshConfig.`);
  assert.doesNotMatch(
    source,
    /export\s+function\s+(?:calculate|solve|assemble|recover|present)[A-Z0-9_]/u,
    `${relativePath} must not expose numerical or presenter execution.`,
  );
}
assert.equal(stageRegistryImportCount, 1);

assert.equal(LAFEA_COMPUTATIONAL_BUCKET_REGISTRY.length, 4);
assert.equal(LAFEA_APPLICATION_TEMPLATE_REGISTRY.length, 27);
assert.equal(LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS.length, 27);
assert.ok(
  LAFEA_APPLICATION_TEMPLATE_REGISTRY.every(
    (template) => !['QUALIFIED', 'CONDITIONAL', 'DEMONSTRATION'].includes(template.releaseStatus),
  ),
);
assert.ok(
  LAFEA_APPLICATION_TEMPLATE_REGISTRY
    .filter((template) => template.bucketId === 'SURFACE_SHELL_FEA')
    .every((template) => template.releaseStatus === 'BLOCKED'),
);
assert.ok(
  LAFEA_APPLICATION_TEMPLATE_REGISTRY
    .filter((template) => template.bucketId === 'RECOVERY_ASSESSMENT')
    .every((template) => template.releaseStatus === 'BLOCKED'),
);
assert.ok(
  LAFEA_APPLICATION_TEMPLATE_REGISTRY
    .filter((template) => template.entryStageId === 'LAFEA.6')
    .every((template) => template.releaseStatus === 'BLOCKED'),
);
assert.equal(
  LAFEA_APPLICATION_TEMPLATE_REGISTRY
    .find((template) => template.templateId === 'C2D-FLANGE-HUB')
    ?.releaseStatus,
  'BLOCKED',
);
assert.ok(
  LAFEA_APPLICATION_TEMPLATE_REGISTRY.every(
    (template) => template.geometryCompilerId === null
      && template.loadCompilerId === null
      && template.boundaryCompilerId === null,
  ),
);
assert.ok(
  LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS.every(
    (manifest) => manifest.qualificationStatus !== 'QUALIFIED',
  ),
);
assert.ok(
  LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS.every(
    (manifest) => manifest.benchmarks.every(
      (benchmark) => benchmark.expectedResultHash === null
        && benchmark.evidenceBasis === 'UNRESOLVED',
    ),
  ),
);

const base = commandLineValue('--base') ?? process.env.LAFEA_T1_BASE_SHA ?? null;
if (base !== null) {
  const diff = git(['diff', '--name-status', `${base}...HEAD`]);
  const rows = diff.split(/\r?\n/u).filter(Boolean).map((line) => line.split('\t'));
  assert.ok(rows.length > 0, 'T1 source guard expected an additive diff.');
  rows.forEach(([status, changedPath]) => {
    assert.equal(status, 'A', `T1 path must be newly added: ${changedPath}.`);
    assert.ok(
      ALLOWED_CHANGED_PATHS.some((pattern) => pattern.test(changedPath)),
      `T1 changed path is outside the authorized write set: ${changedPath}.`,
    );
  });
  assert.ok(
    rows.every(([, changedPath]) => changedPath !== 'package.json'),
    'package.json is not authorized in T1.',
  );
  assert.ok(
    rows.every(([, changedPath]) => !changedPath.startsWith('src/workspace/')),
    'Agent 1 workspace files are not authorized in T1.',
  );
}

console.log(JSON.stringify({
  check: 'lafea-template-t1-source-guard',
  status: 'PASS',
  packageFileCount: packageFiles.length,
  stageRegistryImportCount,
  templateCount: LAFEA_APPLICATION_TEMPLATE_REGISTRY.length,
  qualifiedTemplateCount: LAFEA_APPLICATION_TEMPLATE_REGISTRY
    .filter((template) => template.releaseStatus === 'QUALIFIED').length,
  qualifiedManifestCount: LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS
    .filter((manifest) => manifest.qualificationStatus === 'QUALIFIED').length,
  diffBase: base,
}));

function listJavaScriptFiles(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) listJavaScriptFiles(fullPath, result);
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(fullPath);
  }
  return result;
}

function commandLineValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value) throw new TypeError(`${flag} requires a value.`);
  return value;
}

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
