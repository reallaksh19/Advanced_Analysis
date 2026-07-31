#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKS = Object.freeze([
  'scripts/lafea-u1-stage-registry-check.mjs',
  'scripts/lafea-u1b-registry-consumer-check.mjs',
  'scripts/lafea-u2a-input-command-check.mjs',
  'scripts/lafea-u2b-editor-store-check.mjs',
  'scripts/lafea-u3a-lifecycle-check.mjs',
  'scripts/lafea-u3a-public-surface-check.mjs',
  'scripts/lafea-u3b-live-lifecycle-check.mjs',
  'scripts/lafea-u4a-source-engineering-scene-check.mjs',
  'scripts/lafea-u4a-public-surface-check.mjs',
  'scripts/lafea-u4b-live-source-viewport-check.mjs',
  'scripts/lafea-u4c-render-packet-v2-check.mjs',
  'scripts/lafea-u4c-render-packet-v2-topology-guard.mjs',
  'scripts/lafea-u4d-render-evidence-intake-check.mjs',
  'scripts/lafea-u4e-v2-renderer-adapter-check.mjs',
  'scripts/lafea-u4e-result-viewport-guard.mjs',
  'scripts/lafea-u4e-renderer-state-guard.mjs',
  'scripts/lafea-u4f-hybrid-result-model-check.mjs',
  'scripts/lafea-u4f-hybrid-result-viewport-check.mjs',
  'scripts/lafea-u4f-public-facade-check.mjs',
  'scripts/lafea-u4g-live-workbench-viewport-check.mjs',
  'scripts/lafea-u4g-controller-render-evidence-check.mjs',
  'scripts/lafea-u4g-source-guard.mjs',
  'scripts/lafea-accessory-panel-contract-check.mjs',
  'scripts/lafea-accessory-panel-integration-check.mjs',
  'scripts/lafea-accessory-panel-controller-lifecycle-check.mjs',
  'scripts/lafea-accessory-panel-source-guard.mjs',
  'scripts/lafea-canvas-contract-check.mjs',
  'scripts/lafea-workbench-check.mjs',
  'scripts/lafea-template-t1-contract-check.mjs',
  'scripts/lafea-template-t2-catalog-check.mjs',
  'scripts/lafea-template-t3-analytical-compiler-check.mjs',
]);

const failures = [];
const packageAudit = auditPackageScriptKeys();
if (packageAudit.duplicateKeys.length) {
  failures.push({
    check: 'package-script-key-uniqueness',
    code: 'DUPLICATE_PACKAGE_SCRIPT_KEYS',
    details: packageAudit.duplicateKeys,
  });
}

for (const relativePath of CHECKS) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push({ check: relativePath, code: 'CHECK_SCRIPT_MISSING' });
    continue;
  }
  const result = spawnSync(process.execPath, [absolutePath], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) {
    failures.push({ check: relativePath, code: 'CHECK_SPAWN_FAILED', message: result.error.message });
  } else if (result.status !== 0) {
    failures.push({ check: relativePath, code: 'CHECK_FAILED', status: result.status });
  }
}

const report = Object.freeze({
  check: 'lafea-agent1-stack-certification',
  status: failures.length ? 'FAIL' : 'PASS',
  executedChecks: CHECKS,
  packageScriptKeyCount: packageAudit.keyCount,
  duplicatePackageScriptKeys: packageAudit.duplicateKeys,
  failures,
  numericalAuthorityChanged: false,
  shellAuthorityChanged: false,
  lafea6Enabled: false,
});

console.log(JSON.stringify(report));
if (failures.length) process.exit(1);

function auditPackageScriptKeys() {
  const text = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const marker = '"scripts"';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error('package.json has no scripts object.');
  const objectStart = text.indexOf('{', markerIndex + marker.length);
  if (objectStart < 0) throw new Error('package.json scripts object is malformed.');
  const objectEnd = matchingBrace(text, objectStart);
  const scriptsText = text.slice(objectStart + 1, objectEnd);
  const counts = new Map();
  for (const match of scriptsText.matchAll(/^\s*"([^"]+)"\s*:/gmu)) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return {
    keyCount: [...counts.values()].reduce((sum, count) => sum + count, 0),
    duplicateKeys: [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key, count]) => Object.freeze({ key, count }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function matchingBrace(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('package.json scripts object is not closed.');
}
