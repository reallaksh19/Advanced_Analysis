#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = Object.freeze([
  Object.freeze({ scope: 'NB-T0', path: 'scripts/lafea-nonbucket-scope-guard.mjs' }),
  Object.freeze({ scope: 'NB-T1', path: 'scripts/lafea-nonbucket-lifecycle-profiles-check.mjs' }),
  Object.freeze({ scope: 'U1', path: 'scripts/lafea-u1-stage-registry-check.mjs' }),
  Object.freeze({ scope: 'U1', path: 'scripts/lafea-u1b-registry-consumer-check.mjs' }),
  Object.freeze({ scope: 'U2', path: 'scripts/lafea-u2a-input-command-check.mjs' }),
  Object.freeze({ scope: 'U2', path: 'scripts/lafea-u2b-editor-store-check.mjs' }),
  Object.freeze({ scope: 'U3', path: 'scripts/lafea-u3a-lifecycle-check.mjs' }),
  Object.freeze({ scope: 'U3', path: 'scripts/lafea-u3a-public-surface-check.mjs' }),
  Object.freeze({ scope: 'U3', path: 'scripts/lafea-u3b-live-lifecycle-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4a-source-engineering-scene-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4a-public-surface-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4b-live-source-viewport-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4c-render-packet-v2-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4c-render-packet-v2-topology-guard.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4d-render-evidence-intake-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4e-v2-renderer-adapter-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4e-result-viewport-guard.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4e-renderer-state-guard.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4f-hybrid-result-model-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4f-hybrid-result-viewport-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4f-public-facade-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4g-live-workbench-viewport-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4g-controller-render-evidence-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4g-source-guard.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4h-browser-source-guard.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4i-primitive-picker-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4i-result-selection-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4i-source-guard.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4j-diagnostic-field-check.mjs' }),
  Object.freeze({ scope: 'U4', path: 'scripts/lafea-u4j-source-guard.mjs' }),
  Object.freeze({ scope: 'WORKBENCH', path: 'scripts/lafea-canvas-contract-check.mjs' }),
  Object.freeze({ scope: 'U0_WORKBENCH', path: 'scripts/lafea-workbench-check.mjs' }),
]);

const FORBIDDEN_CHECK_PATHS = Object.freeze([
  /lafea-template-/u,
  /sequential-sketcher/u,
  /first-cut/u,
  /accessory-panel/u,
  /(?:^|\/)lfea-/u,
]);

const failures = [];
const packageAudit = auditPackageScriptKeys();
if (packageAudit.duplicateKeys.length) {
  failures.push({
    scope: 'PACKAGE',
    check: 'package-script-key-uniqueness',
    code: 'DUPLICATE_PACKAGE_SCRIPT_KEYS',
    details: packageAudit.duplicateKeys,
  });
}

for (const row of CHECKS) {
  if (FORBIDDEN_CHECK_PATHS.some((pattern) => pattern.test(row.path))) {
    failures.push({
      scope: row.scope,
      check: row.path,
      code: 'NON_BUCKET_SCOPE_CONTAMINATION',
    });
    continue;
  }

  const absolutePath = path.join(ROOT, row.path);
  if (!fs.existsSync(absolutePath)) {
    failures.push({ scope: row.scope, check: row.path, code: 'CHECK_SCRIPT_MISSING' });
    continue;
  }

  const result = spawnSync(process.execPath, [absolutePath], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) {
    failures.push({
      scope: row.scope,
      check: row.path,
      code: 'CHECK_SPAWN_FAILED',
      message: result.error.message,
    });
  } else if (result.status !== 0) {
    failures.push({
      scope: row.scope,
      check: row.path,
      code: 'CHECK_FAILED',
      status: result.status,
    });
  }
}

const report = Object.freeze({
  schema: 'lafea-nonbucket-stack-report/v1',
  check: 'lafea-nonbucket-stack-certification',
  status: failures.length ? 'FAIL' : 'PASS',
  exactHead: gitHead(),
  executedChecks: CHECKS,
  packageScriptKeyCount: packageAudit.keyCount,
  duplicatePackageScriptKeys: packageAudit.duplicateKeys,
  failures,
  scopeBoundary: Object.freeze({
    nonBucketLafea: true,
    agent2TemplateBucket: false,
    lfeaPiping: false,
    sequentialSketcher: false,
    firstCut: false,
    accessoryPanels: false,
  }),
  numericalAuthorityChanged: false,
  lifecycleSemanticsChanged: false,
  shellAuthorityChanged: false,
  lafea6Enabled: false,
});

console.log(JSON.stringify(report));
if (failures.length) process.exit(1);

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

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
