import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  ENGINEERING_FIELDS,
  FIXTURE_GENERATOR_VERSION,
  FIXTURE_MANIFESTS,
  PINNED_TIMESTAMP,
} from './enrichment-ui-phase0-fixtures.mjs';

const REPOSITORY_ROOT = process.env.ENRICHMENT_UI_PHASE0_CHECK_ROOT
  ? path.resolve(process.env.ENRICHMENT_UI_PHASE0_CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const phase0Entries = [
  'scripts/enrichment-ui-phase0-fixtures.mjs',
  'scripts/enrichment-ui-phase0-fixture-schema.mjs',
  'scripts/enrichment-ui-phase0-fixture-codec.mjs',
  'scripts/enrichment-ui-phase0-fixture-build.mjs',
  'scripts/enrichment-ui-phase0-fixture-records.mjs',
  'scripts/enrichment-ui-phase0-indexes.mjs',
  'scripts/enrichment-ui-phase0-index-core.mjs',
  'scripts/enrichment-ui-phase0-index-query.mjs',
  'scripts/enrichment-ui-phase0-index-viewport.mjs',
  'scripts/enrichment-ui-phase0-qualification-helpers.mjs',
  'scripts/enrichment-ui-phase0-fixture-hash-worker.mjs',
  'scripts/enrichment-ui-phase0-import-guard-loader.mjs',
  'scripts/check-enrichment-ui-phase0-fixtures.mjs',
  'scripts/check-enrichment-ui-phase0-containment.mjs',
  'scripts/check-enrichment-ui-phase0-antidrift.mjs',
  'scripts/benchmark-enrichment-ui-phase0.mjs',
  'scripts/run-enrichment-ui-phase0-checks.mjs',
];

const requiredDocs = [
  'docs/enrichment-ui-phase0-inventory.md',
  'docs/enrichment-ui-phase1-acceptance-checklist.md',
  'docs/enrichment-ui-phase0-evidence.md',
];

for (const relativePath of phase0Entries) {
  assert(fs.existsSync(path.join(REPOSITORY_ROOT, relativePath)), `E_QF_REQUIRED_FILE_MISSING: ${relativePath}`);
}
for (const relativePath of requiredDocs) {
  assert(fs.existsSync(path.join(REPOSITORY_ROOT, relativePath)), `E_QF_REQUIRED_FILE_MISSING: ${relativePath}`);
}

const importEdges = [];
for (const relativePath of phase0Entries) {
  const source = read(relativePath);
  for (const specifier of extractImportSpecifiers(source)) {
    importEdges.push({ from: relativePath, specifier });
    assert(!isForbiddenImport(specifier), `E_QF_FORBIDDEN_IMPORT: ${relativePath} -> ${specifier}`);
  }
}

const fixtureSource = [
  'scripts/enrichment-ui-phase0-fixtures.mjs',
  'scripts/enrichment-ui-phase0-fixture-schema.mjs',
  'scripts/enrichment-ui-phase0-fixture-codec.mjs',
  'scripts/enrichment-ui-phase0-fixture-build.mjs',
  'scripts/enrichment-ui-phase0-fixture-records.mjs',
].map(read).join('\n');
for (const token of ['Date.now', 'Math.random', 'randomUUID', 'performance.now', 'localStorage', 'sessionStorage', 'document.', 'window.']) {
  assert(!fixtureSource.includes(token), `E_QF_NONDETERMINISTIC_GENERATOR_IMPORT: ${token}`);
}
const indexSource = [
  'scripts/enrichment-ui-phase0-indexes.mjs',
  'scripts/enrichment-ui-phase0-index-core.mjs',
  'scripts/enrichment-ui-phase0-index-query.mjs',
  'scripts/enrichment-ui-phase0-index-viewport.mjs',
].map(read).join('\n');
for (const token of ['localStorage', 'sessionStorage', 'document.', 'window.', 'createElement(', 'innerHTML']) {
  assert(!indexSource.includes(token), `E_QF_INDEX_SIDE_EFFECT_DRIFT: ${token}`);
}
for (const token of ['default-zero', 'config-default', 'standard-wall', 'generic density', 'stagedJson export', 'solver authorization']) {
  assert(!`${fixtureSource}\n${indexSource}`.includes(token), `E_QF_SCOPE_DRIFT: ${token}`);
}

assert.equal(FIXTURE_GENERATOR_VERSION, '1.0.0', 'E_QF_MANIFEST_DRIFT');
assert.equal(PINNED_TIMESTAMP, '2026-08-02T00:00:00.000Z', 'E_QF_MANIFEST_DRIFT');
assert.equal(ENGINEERING_FIELDS.length, 40, 'E_QF_FIELD_SCHEMA_DRIFT');
assert.deepEqual(Object.fromEntries(Object.entries(FIXTURE_MANIFESTS).map(([name, manifest]) => [name, {
  lineCount: manifest.lineCount,
  componentCount: manifest.componentCount,
  duplicateKeyGroups: manifest.duplicateKeyGroups,
  duplicateKeyTargetCount: manifest.duplicateKeyTargetCount,
  missingMasterTargetCount: manifest.missingMasterTargetCount,
  ambiguousContainmentTargetCount: manifest.ambiguousContainmentTargetCount,
  staleSourceTargetCount: manifest.staleSourceTargetCount,
  blockedFieldTargetCount: manifest.blockedFieldTargetCount,
}])), {
  small: {
    lineCount: 128,
    componentCount: 1024,
    duplicateKeyGroups: 8,
    duplicateKeyTargetCount: 16,
    missingMasterTargetCount: 6,
    ambiguousContainmentTargetCount: 4,
    staleSourceTargetCount: 4,
    blockedFieldTargetCount: 8,
  },
  medium: {
    lineCount: 10_000,
    componentCount: 100_000,
    duplicateKeyGroups: 500,
    duplicateKeyTargetCount: 1_000,
    missingMasterTargetCount: 200,
    ambiguousContainmentTargetCount: 100,
    staleSourceTargetCount: 100,
    blockedFieldTargetCount: 300,
  },
  large: {
    lineCount: 100_000,
    componentCount: 1_000_000,
    duplicateKeyGroups: 5_000,
    duplicateKeyTargetCount: 10_000,
    missingMasterTargetCount: 2_000,
    ambiguousContainmentTargetCount: 1_000,
    staleSourceTargetCount: 1_000,
    blockedFieldTargetCount: 3_000,
  },
}, 'E_QF_MANIFEST_DRIFT');

const srcRoot = path.join(REPOSITORY_ROOT, 'src');
const productionImports = [];
if (fs.existsSync(srcRoot)) {
  for (const absolutePath of walkFiles(srcRoot, (name) => /\.(?:js|mjs)$/u.test(name))) {
    const source = fs.readFileSync(absolutePath, 'utf8');
    for (const specifier of extractImportSpecifiers(source)) {
      if (specifier.includes('enrichment-ui-phase0')) {
        productionImports.push({
          from: path.relative(REPOSITORY_ROOT, absolutePath),
          specifier,
        });
      }
    }
  }
}
assert.equal(productionImports.length, 0, `E_QF_PRODUCTION_FIXTURE_IMPORT: ${JSON.stringify(productionImports)}`);


const loaderPath = path.join(REPOSITORY_ROOT, 'scripts/enrichment-ui-phase0-import-guard-loader.mjs');
const workerPath = path.join(REPOSITORY_ROOT, 'scripts/enrichment-ui-phase0-fixture-hash-worker.mjs');
const loaderUrl = pathToFileURL(loaderPath).href;
const validRuntimeImport = spawnSync(process.execPath, ['--loader', loaderUrl, workerPath, 'small'], {
  cwd: REPOSITORY_ROOT,
  env: {
    ...process.env,
    ENRICHMENT_UI_PHASE0_RUNTIME_GUARD: '1',
    ENRICHMENT_UI_PHASE0_IMPORT_ROOT: REPOSITORY_ROOT,
  },
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
assert.equal(validRuntimeImport.status, 0, `E_QF_RUNTIME_IMPORT_GUARD_FAILED: ${validRuntimeImport.stderr}`);

const negativeImportSource = ['im', 'port', "('./src/workspace/lfea-preflight-ui.js')"].join('');
const negativeRuntimeImport = spawnSync(process.execPath, [
  '--loader',
  loaderUrl,
  '--input-type=module',
  '--eval',
  negativeImportSource,
], {
  cwd: REPOSITORY_ROOT,
  env: {
    ...process.env,
    ENRICHMENT_UI_PHASE0_RUNTIME_GUARD: '1',
    ENRICHMENT_UI_PHASE0_IMPORT_ROOT: REPOSITORY_ROOT,
  },
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
assert.notEqual(negativeRuntimeImport.status, 0, 'E_QF_FORBIDDEN_IMPORT: runtime negative import was not rejected');
assert.match(`${negativeRuntimeImport.stdout}
${negativeRuntimeImport.stderr}`, /E_QF_FORBIDDEN_IMPORT/u,
  'E_QF_UNEXPECTED_FAILURE_CODE: runtime import guard');

const currentUiPath = 'src/workspace/lfea-preflight-ui.js';
const currentUiRisk = fs.existsSync(path.join(REPOSITORY_ROOT, currentUiPath))
  ? analyzeCurrentPreflightRenderRisk(read(currentUiPath))
  : null;
if (currentUiRisk) {
  assert.equal(currentUiRisk.singleValueMapOverwriteRisk, true, 'E_QF_CURRENT_RISK_INVENTORY_DRIFT');
  assert.equal(currentUiRisk.firstFoundContainmentRisk, true, 'E_QF_CURRENT_RISK_INVENTORY_DRIFT');
  assert.equal(currentUiRisk.renderAllComponentRowsRisk, true, 'E_QF_CURRENT_RISK_INVENTORY_DRIFT');
  assert.equal(currentUiRisk.fullInnerHtmlAssignmentRisk, true, 'E_QF_CURRENT_RISK_INVENTORY_DRIFT');
}

for (const [relativePath, requiredTokens] of Object.entries({
  'docs/enrichment-ui-phase0-inventory.md': ['RETAIN', 'REPLACE', 'RELOCATE', 'RETIRE', 'localStorage', 'Project Data', 'topology'],
  'docs/enrichment-ui-phase1-acceptance-checklist.md': ['virtualization', 'stable target', 'duplicate', 'BLOCKED_AMBIGUOUS', 'DOM'],
  'docs/enrichment-ui-phase0-evidence.md': ['run-enrichment-ui-phase0-checks.mjs', 'syntax:strict', 'check:imports', 'check:master-data-containment'],
})) {
  const source = read(relativePath);
  for (const token of requiredTokens) assert(source.includes(token), `E_QF_DOC_DRIFT: ${relativePath} missing ${token}`);
}

console.log(JSON.stringify({
  check: 'enrichment-ui-phase0-antidrift',
  status: 'PASS',
  repositoryRoot: REPOSITORY_ROOT,
  importEdgeCount: importEdges.length,
  productionFixtureImports: productionImports.length,
  manifestNames: Object.keys(FIXTURE_MANIFESTS),
  engineeringColumnCount: ENGINEERING_FIELDS.length,
  currentUiRisk,
  runtimeImportGuard: true,
  runtimeNegativeImportRejected: true,
}));

export function analyzeCurrentPreflightRenderRisk(source) {
  const implementation = stripComments(source);
  return Object.freeze({
    singleValueMapOverwriteRisk: /new Map\(\)[\s\S]*?\.set\([^,]+,\s*[^)]+\)/u.test(implementation)
      || /lineRowMap\.set\(/u.test(implementation),
    firstFoundContainmentRisk: /includes\([^)]*\)[\s\S]{0,300}?break\s*;/u.test(implementation),
    renderAllComponentRowsRisk: /for\s*\([^)]*of\s+[^)]*items[^)]*\)[\s\S]{0,600}?preflight-leaf/u.test(implementation),
    fullInnerHtmlAssignmentRisk: /container\.innerHTML\s*=\s*html/u.test(implementation),
    demonstrationDatasetRisk: /if\s*\([^)]*!elements[^)]*length[^)]*\)[\s\S]{0,500}?elements\s*=\s*\[/u.test(implementation),
    topologyEventRisk: /topology:|viewport:render-autofix-overlays/u.test(implementation),
    sharedModelMutationRisk: /sharedModel\s*=|\.supports\s*=/u.test(implementation),
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
}

function extractImportSpecifiers(source) {
  const values = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gu,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) values.push(match[1]);
  }
  return values;
}

function isForbiddenImport(specifier) {
  return specifier.startsWith('../src/')
    || specifier.startsWith('../../src/')
    || specifier.includes('/workspace/')
    || specifier.includes('common-enriched-properties')
    || specifier.includes('empirical')
    || specifier.includes('solver')
    || specifier.includes('staged-json')
    || specifier.includes('stagedJson')
    || specifier.includes('topology-autofix');
}

function walkFiles(root, predicate) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(absolutePath, predicate));
    else if (predicate(entry.name)) result.push(absolutePath);
  }
  return result;
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:])\/\/.*$/gmu, '$1');
}
