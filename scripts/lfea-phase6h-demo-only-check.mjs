#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoPath = path.join(root, 'public/demo-only/lfea-phase6h/index.html');
const source = fs.readFileSync(demoPath, 'utf8');

const requiredLiterals = Object.freeze([
  '617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54',
  'release/lfea-piping-phase6i-617f7c2',
  'DEMO ONLY — INELIGIBLE FOR PROJECT EVIDENCE',
  'BLOCKED_INPUT_REQUIRED',
  'Phase 6H',
  'NOT READY',
  'application-result.json',
  'presentation.json',
  'real-model-reconciliation.json',
  'commercial-corroboration.json',
  'performance-evidence.json',
  'rollback-evidence.json',
  'signed-disposition.json',
  'NOT_SIGNED',
]);

for (const literal of requiredLiterals) {
  assert.ok(source.includes(literal), `Demo page misses required boundary literal: ${literal}`);
}

const forbiddenPatterns = Object.freeze([
  /lfea-piping-external-evidence-materializer/u,
  /compileLinearPipingExternalQualificationPackage/u,
  /sealReleaseReviewDisposition/u,
  /materializeExternalQualificationEvidence/u,
  /<script[^>]+src=/iu,
  /\bimport\s+[^;]+from\s+/u,
]);

for (const pattern of forbiddenPatterns) {
  assert.doesNotMatch(source, pattern, `Demo page crosses the non-release boundary: ${pattern}`);
}

const recordNames = source.match(/record\('[^']+\.json'/gu) ?? [];
assert.equal(recordNames.length, 7, 'Demo page must expose exactly seven source records.');
assert.match(source, /G8 evidence owner[\s\S]+SAMPLE-G8-RUN-001/u);
assert.match(source, /G9 evidence owner[\s\S]+SAMPLE-G9-RUN-001/u);
assert.doesNotMatch(source, /workflowRun:\s*['"`][^'"`]+/u);
assert.doesNotMatch(source, /artifactId:\s*['"`][^'"`]+/u);

console.log(JSON.stringify({
  check: 'lfea-phase6h-demo-only',
  status: 'PASS',
  path: 'public/demo-only/lfea-phase6h/index.html',
  exactHead: '617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54',
  eligibility: 'INELIGIBLE_FOR_PROJECT_EVIDENCE',
  productionMaterializerInvoked: false,
  releaseAuthorityChanged: false,
}));
