#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const samplePath = path.join(root, 'public/demo-only/lfea-phase6h/sample.json');
const loaderPath = path.join(root, 'public/demo-only/lfea-phase6h/demo.js');
const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
const {
  DEMO_ELIGIBILITY,
  loadPhase6hDemo,
  requirePhase6hDemo,
  validatePhase6hDemo,
} = await import(pathToFileURL(loaderPath));

const valid = requirePhase6hDemo(sample);
assert.equal(valid.eligibility, DEMO_ELIGIBILITY);
assert.ok(Object.isFrozen(valid));
assert.ok(Object.isFrozen(valid.records));
assert.equal(valid.records.length, 7);

const fetched = await loadPhase6hDemo(
  'memory:sample',
  async () => ({ ok: true, status: 200, json: async () => sample }),
);
assert.equal(fetched.model.modelId, 'SAMPLE-LINE-1001');

await assert.rejects(
  loadPhase6hDemo(
    'memory:missing',
    async () => ({ ok: false, status: 404, json: async () => ({}) }),
  ),
  /DEMO_SAMPLE_FETCH_FAILED:404/u,
);

await assert.rejects(
  loadPhase6hDemo(
    'memory:malformed',
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }),
  ),
  /bad json/u,
);

const wrongCandidate = structuredClone(sample);
wrongCandidate.exactHead = 'wrong';
assert.deepEqual(validatePhase6hDemo(wrongCandidate), ['CANDIDATE']);
assert.throws(() => requirePhase6hDemo(wrongCandidate), /DEMO_SAMPLE_INVALID:CANDIDATE/u);

const signedDisposition = structuredClone(sample);
signedDisposition.records.at(-1).state = 'RELEASE_APPROVED';
assert.ok(validatePhase6hDemo(signedDisposition).includes('DISPOSITION_NOT_UNSIGNED'));
assert.ok(validatePhase6hDemo(signedDisposition).includes('FORBIDDEN_RELEASE_CLAIM'));

const missingRecord = structuredClone(sample);
missingRecord.records.pop();
assert.deepEqual(validatePhase6hDemo(missingRecord), ['RECORD_COUNT']);

const recordEligibilityDrift = structuredClone(sample);
recordEligibilityDrift.records[0].eligibility = 'ELIGIBLE_FOR_PROJECT_EVIDENCE';
assert.deepEqual(validatePhase6hDemo(recordEligibilityDrift), ['RECORD_ELIGIBILITY']);

console.log(JSON.stringify({
  check: 'lfea-phase6h-demo-loader',
  status: 'PASS',
  validSample: true,
  malformedInputRejected: true,
  wrongCandidateRejected: true,
  signedDispositionRejected: true,
  missingRecordRejected: true,
  fallbackUsed: false,
}));
