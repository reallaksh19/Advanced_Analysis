#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
if (baseIndex < 0 || !process.argv[baseIndex + 1]) {
  throw new Error('Usage: node scripts/lafea-template-t5-source-guard.mjs --base <BASE_SHA>');
}
const base = process.argv[baseIndex + 1];
const allowed = new Set([
  'scripts/lafea-template-t5-anti-drift-check.mjs',
  'scripts/lafea-template-t5-compiler-golden-check.mjs',
  'scripts/lafea-template-t5-source-guard.mjs',
  'src/core/lafea-application-templates/benchmark-fixtures/t5-controlled-reference.js',
  'src/core/lafea-application-templates/benchmark-manifests/t5-compiler-golden.js',
  'src/core/lafea-application-templates/t5-qualification.js',
]);

const rows = git(['diff', '--name-status', `${base}...HEAD`])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...pathParts] = line.split('\t');
    return { status, path: pathParts.at(-1) };
  });
assert.equal(rows.length, allowed.size, `Expected ${allowed.size} additive T5 files.`);
rows.forEach(({ status, path }) => {
  assert.equal(status, 'A', `T5 must be additive; found ${status} ${path}.`);
  assert.equal(allowed.has(path), true, `Unexpected T5 path: ${path}.`);
});

for (const path of [
  'package.json',
  '.github/workflows',
  'src/workspace',
  'src/core/lafea-stage',
  'src/core/local-stress',
  'src/core/local-attachment-screening',
  'src/core/local-continuum',
  'src/core/lafea-application-templates/template-registry.js',
  'src/core/lafea-application-templates/template-readiness.js',
]) {
  assert.equal(
    rows.some((row) => row.path === path || row.path.startsWith(`${path}/`)),
    false,
    `T5 cannot modify ${path}.`,
  );
}

const corePaths = [...allowed].filter((path) => path.startsWith('src/'));
const coreSource = corePaths.map((path) => readFileSync(path, 'utf8')).join('\n');
for (const forbidden of [
  'calculateLocalAttachmentFoundation',
  'calculateLocalAttachmentScreening',
  'calculateLocalContinuum',
  'executeLafeaStage',
  'document.',
  'window.',
  'meshConfig',
  'Date.now',
  'Math.random',
  'crypto.randomUUID',
  'createTemplateReleaseRecord',
  'releaseStatus: \'QUALIFIED\'',
  'executable: true',
]) {
  assert.equal(coreSource.includes(forbidden), false, `Forbidden T5 core token: ${forbidden}.`);
}
assert.equal(
  coreSource.includes('compileLafeaApplicationTemplate')
    || coreSource.includes('compileLafeaContinuumApplicationTemplate'),
  false,
  'Controlled-reference and manifest core files must not import production compilers.',
);

const oracleSource = readFileSync(
  'src/core/lafea-application-templates/benchmark-fixtures/t5-controlled-reference.js',
  'utf8',
);
assert.ok(oracleSource.includes('CONTROLLED_REFERENCE_DATASET'));
assert.ok(oracleSource.includes('EXPECTED_PROJECTION_AUTHORED_WITHOUT_IMPORTING_PRODUCTION_COMPILER'));
assert.ok(oracleSource.includes('T5_REFERENCE_HASH_DRIFT'));
assert.equal((oracleSource.match(/fnv1a64:[0-9a-f]{16}/gu) ?? []).length, 30);

const manifestSource = readFileSync(
  'src/core/lafea-application-templates/benchmark-manifests/t5-compiler-golden.js',
  'utf8',
);
assert.ok(manifestSource.includes("status: 'NOT_RUN'"));
assert.ok(manifestSource.includes("status: 'BLOCKED'"));
assert.ok(manifestSource.includes("qualificationStatus: 'NOT_QUALIFIED'"));
assert.ok(manifestSource.includes('GOLDEN-E2E-01'));
assert.ok(manifestSource.includes('No template release, readiness or executable status is promoted'));

const checkSource = readFileSync(
  'scripts/lafea-template-t5-compiler-golden-check.mjs',
  'utf8',
);
assert.ok(checkSource.includes("endToEndGoldenStatus: 'BLOCKED'"));
assert.ok(checkSource.includes('qualifiedManifestCount: 0'));
assert.ok(checkSource.includes('engineExecutionPaths: 0'));
assert.ok(checkSource.includes('meshGenerationPaths: 0'));

console.log(JSON.stringify({
  check: 'lafea-template-t5-source-guard',
  status: 'PASS',
  additiveFileCount: rows.length,
  controlledReferenceHashCount: 30,
  candidateManifestCount: 4,
  qualifiedManifestCount: 0,
  executableTemplateCount: 0,
}, null, 2));

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
