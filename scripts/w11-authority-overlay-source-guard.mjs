#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const guardedFiles = [
  'src/workspace/analysis-authority-overlay/overlay-contract.js',
  'src/workspace/analysis-authority-overlay/branch-subset-contract.js',
  'src/workspace/analysis-authority-overlay/branch-extraction.js',
];
const source = Object.fromEntries(guardedFiles.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]));
const combined = Object.entries(source).map(([path, text]) => `\n/* ${path} */\n${text}`).join('\n');
const overlay = source[guardedFiles[0]];
const subset = source[guardedFiles[1]];
const branchExtraction = source[guardedFiles[2]];

function reject(pattern, message) { assert.equal(pattern.test(combined), false, message); }
for (const path of guardedFiles) assert.ok(source[path].length > 0, `missing required source file ${path}`);

reject(/\b(?:hashBytes|hashUtf8|TextEncoder)\b|Math\.imul/u, 'a second hash implementation is prohibited');
reject(/Object\.freeze\s*\(/u, 'local Object.freeze() is prohibited');
reject(/\{\s*value\s*[,}]\s*evidence\s*[,}]\s*approved\s*[,}]/u, 'evidence-value shape must not be reimplemented');
reject(/elasticModulus|massDensity|secondMoment|polarMoment|thermalExpansionCoefficient|outerDiameter|wallThickness/iu, 'engineering properties must not be embedded in the overlay');
assert.doesNotMatch(`${overlay}\n${subset}`, /connectedRoutes|toEdge|classifyAutoCarriers|branchEdges/u, 'branch extraction logic is prohibited in contract files');
reject(/from\s*['"][^'"]*(?:linear-fea-solver|linear-fea-model-compiler|linear-fea-material|linear-fea-section)[^'"]*['"]/u, 'analysis implementation imports are prohibited');
reject(/\.localeCompare\s*\(/u, 'localeCompare() is prohibited');
reject(/\bIntl\./u, 'Intl collation is prohibited');
reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');
reject(/governance\s*[:=][\s\S]{0,80}(?:\?\?|\|\|)/u, 'fixed governance must not receive silent defaults');
reject(/(?:continue|return)\s*;?\s*\/\/\s*(?:skip|ignore)/iu, 'a declaration must never be skipped silently');

for (const text of [overlay, subset]) {
  assert.match(text, /import\s*\{\s*semanticHash\s*\}\s*from\s*'\.\.\/\.\.\/core\/shared-piping-model\/canonical-json\.js'/u);
  assert.match(text, /import\s*\{[^}]*deepFreeze[^}]*\}\s*from\s*'\.\.\/\.\.\/core\/shared-piping-model\/immutable\.js'/u);
}
assert.match(overlay, /createEvidenceValue[^\n]*from\s*'\.\.\/project-data\/project-data-contract\.js'/u);
assert.match(branchExtraction, /import\s*\{\s*buildRoutePartitionModel\s*\}\s*from\s*'\.\.\/routes\/route-partition-model\.js'/u);
assert.match(branchExtraction, /buildRoutePartitionModel\s*\(/u, 'branch extraction must call the production route builder');
assert.match(branchExtraction, /sealBranchSubsetManifest/u, 'branch extraction must reuse the sealed subset contract');
assert.match(branchExtraction, /sealBranchSubsetManifest\s*\(/u, 'branch extraction must return a sealed subset manifest');
for (const code of [
  'AUTHORITY_OVERLAY_DATASET_STALE',
  'AUTHORITY_OVERLAY_SCOPE_UNSUPPORTED',
  'AUTHORITY_OVERLAY_RECORD_HASH_CONFLICT',
  'AUTHORITY_OVERLAY_PRECEDENCE_UNSUPPORTED',
  'AUTHORITY_OVERLAY_GOVERNANCE_UNSUPPORTED',
  'AUTHORITY_OVERLAY_ASSIGNMENT_ORPHANED',
  'AUTHORITY_OVERLAY_HASH_MISMATCH',
]) assert.match(combined, new RegExp(code, 'u'), `${code} must remain present`);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(packageJson.scripts['check:w11.1'], 'node scripts/w11.1-authority-overlay-contract-check.mjs && node scripts/w11-authority-overlay-source-guard.mjs');
assert.equal(packageJson.scripts['check:w11.2'], 'node scripts/w11.2-branch-subset-contract-check.mjs');
assert.equal(packageJson.scripts['check:w11.3'], 'node scripts/w11.3-branch-extraction-check.mjs');
const aggregate = packageJson.scripts['check:workspace-contracts'];
const w109 = aggregate.indexOf('w10.9');
const w111 = aggregate.indexOf('check:w11.1');
const w112 = aggregate.indexOf('check:w11.2');
const w113 = aggregate.indexOf('check:w11.3');
assert.ok(w109 >= 0 && w111 > w109 && w112 > w109, 'w11 checks must be registered after w10.9');
assert.ok(w113 > w112, 'check:w11.3 must be registered after check:w11.2');

console.log('W11 analysis-authority-overlay source guard PASS');
