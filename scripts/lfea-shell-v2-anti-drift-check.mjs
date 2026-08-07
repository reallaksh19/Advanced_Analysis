#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL_ROOT = path.join(ROOT, 'src', 'workspace', 'lfea-shell-v2');
const TOKEN_ROOT = path.join(ROOT, 'src', 'workspace', 'design-tokens');
const shellFiles = javascriptFiles(SHELL_ROOT);
const tokenFiles = javascriptFiles(TOKEN_ROOT).filter((file) => file.endsWith('lfea-tokens.js'));
const extraModules = [
  path.join(ROOT, 'scripts', 'lfea-shell-v2-store-fidelity-check.mjs'),
  path.join(ROOT, 'scripts', 'lfea-shell-v2-baseline-hash-check.mjs'),
  path.join(ROOT, 'e2e', 'lfea-shell-v2.spec.js'),
  path.join(ROOT, 'e2e', 'fixtures', 'ui1-embedded-shell-entry.js'),
  path.join(ROOT, 'vite.lfea.config.js'),
  path.join(ROOT, 'vite.lfea-ui1-test.config.js'),
  path.join(ROOT, 'playwright.lfea-ui1.config.js'),
];

for (const file of [...shellFiles, ...tokenFiles, ...extraModules]) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/u).length;
  assert.ok(lines < 300, `${relative(file)} has ${lines} physical lines; limit is <300`);
}

for (const file of shellFiles) {
  const text = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(
    text,
    /from\s+['"][^'"]*\/core\//u,
    `Presentation module must not import core implementation directly: ${relative(file)}`,
  );
  assert.doesNotMatch(
    implementationText(text),
    /\b(?:solveContinuumModel|adaptMeshPackage|createEngineeringReview|createEvidenceExport|semanticHash)\s*\(/u,
    `Presentation module must not implement or invoke engineering authority: ${relative(file)}`,
  );
  assert.doesNotMatch(
    implementationText(text),
    /(?:\.toFixed|\.toPrecision|Math\.round)\s*\(/u,
    `Shell V2 must not introduce local numerical rounding/formatting: ${relative(file)}`,
  );
}

const controller = source('src/workspace/lfea-workbench-controller.js');
assert.match(controller, /LfeaShellV2View/u);
assert.doesNotMatch(controller, /new LfeaWorkbenchView/u);
assert.match(controller, /createLfeaWorkbenchStore/u);
assert.match(controller, /workerClient\?\.cancel\('MODEL_CHANGED'\)/u);

const standalone = source('src/workspace/lfea-shell-v2/standalone-entry.js');
assert.match(standalone, /LfeaWorkbenchController/u);
assert.match(standalone, /new LfeaWorkbenchController\(root, undefined\)\.init\(\)/u);
assert.doesNotMatch(
  standalone,
  /from\s+['"]\.\.\/lfea-workbench\.js['"]|createLfeaWorkbenchStore|executeLfeaWorkbench/u,
  'Standalone entry must use the narrow controller graph, not the broad workbench barrel.',
);

const vite = source('vite.config.js');
assert.match(vite, /lfea:\s*fileURLToPath\(new URL\('\.\/lfea\.html'/u);
const standaloneVite = source('vite.lfea.config.js');
assert.match(standaloneVite, /lfea:\s*fileURLToPath\(new URL\('\.\/lfea\.html'/u);
assert.match(standaloneVite, /outDir:\s*'dist-lfea'/u);
const html = source('lfea.html');
assert.match(html, /lfea-shell-v2\/standalone-entry\.js/u);

const testVite = source('vite.lfea-ui1-test.config.js');
assert.match(testVite, /ui1-embedded-layout-harness/u);
assert.match(testVite, /ui1-embedded-shell-entry\.js/u);
const embeddedHarness = source('e2e/fixtures/ui1-embedded-shell-entry.js');
assert.match(embeddedHarness, /renderWorkspaceLayout/u);
assert.match(embeddedHarness, /LfeaWorkbenchController/u);
assert.match(embeddedHarness, /data-application-view=\\"LFEA\\"/u);
assert.doesNotMatch(
  embeddedHarness,
  /linear-piping-run-analysis|src\/core\//u,
  'Embedded UI-1 browser harness must use only the real layout/controller boundary.',
);

const navigator = source('src/workspace/lfea-shell-v2/analysis-navigator.js');
assert.match(navigator, /LFEA_ENRICHED_SJSON_PIPING_ADAPTER_NOT_WIRED/u);
assert.match(navigator, /Blocked/u);

const layout = source('src/workspace/workspace-layout.js');
assert.equal(occurrences(layout, 'data-role="lfea-consumer-root"'), 1,
  'embedded shell must retain exactly one LFEA consumer root');

const forbiddenRoots = [
  path.join(ROOT, 'src', 'core', 'geometry', 'adapters'),
  path.join(ROOT, 'src', 'core', 'linear-piping-analysis-consumer'),
];
for (const directory of forbiddenRoots) {
  for (const file of javascriptFiles(directory)) {
    assert.doesNotMatch(
      fs.readFileSync(file, 'utf8'),
      /EnrichedSjson/u,
      `UI-1 must not wire EnrichedSjson into piping FEA: ${relative(file)}`,
    );
  }
}

console.log(JSON.stringify({
  check: 'lfea-shell-v2-anti-drift',
  status: 'PASS',
  shellModules: shellFiles.length,
  tokenModules: tokenFiles.length,
  physicalLineLimit: 299,
  localNumericalFormatting: false,
  standaloneEntry: true,
  standaloneProductionBuildConfig: true,
  embeddedEntryRetained: true,
  browserHarness: 'REAL_WORKSPACE_LAYOUT_AND_LFEA_CONTROLLER',
  enrichedSjsonPipingAdapter: false,
}));

function javascriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(target);
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
  });
}

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function implementationText(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:])\/\/.*$/gmu, '$1');
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}
