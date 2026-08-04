#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalFiles = [
  'scripts/lafea-bucket-01-replay-artifact-registry.mjs',
  'scripts/lafea-bucket-01-controlled-replay-support.mjs',
  'scripts/lafea-bucket-01-controlled-replay-runner.mjs',
  'scripts/lafea-bucket-01-uniform-reference-controlled-replay.mjs',
  'scripts/lafea-bucket-01-probe-stable-v3-controlled-replay.mjs',
  'scripts/lafea-bucket-01-candidate-replay-adjudication-runner.mjs',
  'scripts/lafea-bucket-01-probe-stable-v3-direct-point-receipt.mjs',
  'src/workspace/lafea-bucket-01-replay-artifact-policy.js',
  'src/workspace/lafea-bucket-01-controlled-replay-result.js',
  'src/workspace/lafea-bucket-01-candidate-replay-adjudication.js',
];
for (const relative of canonicalFiles) {
  const absolute = path.resolve(ROOT, relative);
  assert.ok(fs.existsSync(absolute), `Missing controlled replay file: ${relative}`);
  const result = spawnSync(process.execPath, ['--check', relative], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `${relative} syntax failed: ${result.stderr || result.error?.message}`,
  );
}
assert.equal(
  fs.existsSync(path.resolve(
    ROOT,
    'scripts/lafea-bucket-01-probe-stable-v3-stress-receipt.mjs',
  )),
  false,
  'Superseded candidate stress receipt must not exist.',
);
const proposal = fs.readFileSync(path.resolve(
  ROOT,
  'src/workspace/lafea-bucket-01-controlled-candidate-replay-proposal.js',
), 'utf8');
assert.match(
  proposal,
  /scripts\/lafea-bucket-01-probe-stable-v3-controlled-replay\.mjs/u,
);
const resultSource = fs.readFileSync(path.resolve(
  ROOT,
  'src/workspace/lafea-bucket-01-controlled-replay-result.js',
), 'utf8');
assert.match(resultSource, /ARTIFACT_NOT_REGISTRY_VERIFIED/u);
assert.match(resultSource, /RESULT_NOT_RUNTIME_REVALIDATED/u);
const registry = fs.readFileSync(path.resolve(
  ROOT,
  'scripts/lafea-bucket-01-replay-artifact-registry.mjs',
), 'utf8');
assert.match(registry, /revalidateRegisteredControlledReplayResult/u);
assert.match(registry, /ARTIFACT_REVALIDATION_MISMATCH/u);
console.log('PASS LAFEA Bucket-01 controlled replay entrypoint and anti-drift checks');
