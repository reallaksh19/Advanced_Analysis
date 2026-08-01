#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoRoot = path.join(root, 'public/demo-only/lfea-phase6h');
const files = Object.freeze({
  module: path.join(demoRoot, 'demo.js'),
  page: path.join(demoRoot, 'index.html'),
  sample: path.join(demoRoot, 'sample.json'),
});
for (const [name, filePath] of Object.entries(files)) {
  assert.ok(fs.existsSync(filePath), `Missing demo ${name}: ${filePath}`);
}
const source = Object.fromEntries(
  Object.entries(files).map(([name, filePath]) => [name, fs.readFileSync(filePath, 'utf8')]),
);
const sample = JSON.parse(source.sample);

for (const literal of [
  '617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54',
  'release/lfea-piping-phase6i-617f7c2',
  'INELIGIBLE_FOR_PROJECT_EVIDENCE',
  'BLOCKED_INPUT_REQUIRED',
  'NOT_READY',
  'NOT_SIGNED',
  'SAMPLE-G8-RUN-001',
  'SAMPLE-G9-RUN-001',
]) {
  assert.ok(source.sample.includes(literal), `Sample misses boundary literal: ${literal}`);
}
assert.match(source.page, /DEMO ONLY — INELIGIBLE FOR PROJECT EVIDENCE — WP-3 REMAINS BLOCKED/u);
assert.match(source.page, /<script type="module" src="\.\/demo\.js"><\/script>/u);
assert.match(source.module, /fetchImpl\(url, \{ cache: 'no-store' \}\)/u);
assert.equal(sample.records.length, 7);
assert.equal(sample.records.at(-1).state, 'NOT_SIGNED');
assert.equal(sample.workflowRun, null);
assert.equal(sample.workflowJob, null);
assert.equal(sample.artifactId, null);

for (const pattern of [
  /lfea-piping-external-evidence-materializer/u,
  /compileLinearPipingExternalQualificationPackage/u,
  /sealReleaseReviewDisposition/u,
  /materializeExternalQualificationEvidence/u,
  /from ['"][^'"]*src\//u,
  /from ['"][^'"]*core\//u,
  /from ['"][^'"]*workspace\//u,
]) {
  assert.doesNotMatch(source.module, pattern, `Demo crosses non-release boundary: ${pattern}`);
}
assert.ok(source.module.split(/\r?\n/u).length <= 300, 'Demo module exceeds 300 physical lines.');
assert.ok(source.page.split(/\r?\n/u).length <= 300, 'Demo page exceeds 300 physical lines.');

console.log(JSON.stringify({
  check: 'lfea-phase6h-demo-only',
  status: 'PASS',
  files: Object.keys(files),
  sampleSchema: sample.schema,
  records: sample.records.length,
  exactHead: sample.exactHead,
  eligibility: sample.eligibility,
  productionMaterializerInvoked: false,
  releaseAuthorityChanged: false,
}));
