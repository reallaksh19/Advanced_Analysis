#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const allowedPaths = Object.freeze([
  'scripts/lafea-template-t2-catalog-check.mjs',
  'scripts/lafea-template-t2-source-guard.mjs',
  'src/workspace/lafea-templates/catalog-card.js',
  'src/workspace/lafea-templates/catalog-constants.js',
  'src/workspace/lafea-templates/catalog-model.js',
  'src/workspace/lafea-templates/catalog-query.js',
  'src/workspace/lafea-templates/catalog-utils.js',
  'src/workspace/lafea-templates/index.js',
]);
const sourcePaths = Object.freeze(allowedPaths.filter((item) => item.startsWith('src/')));
const errors = [];
const base = optionValue('--base');

for (const relativePath of allowedPaths) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    errors.push(`Required T2 file is missing: ${relativePath}.`);
  }
}

const catalogPath = path.join(root, 'src/workspace/lafea-templates/catalog-model.js');
const indexPath = path.join(root, 'src/workspace/lafea-templates/index.js');
const catalog = readIfPresent(catalogPath);
const index = readIfPresent(indexPath);
const combinedSource = sourcePaths
  .map((relativePath) => readIfPresent(path.join(root, relativePath)))
  .join('\n');

requirePattern(
  catalog,
  /from ['"]\.\.\/\.\.\/core\/lafea-application-templates\/index\.js['"]/u,
  'Catalog model must read the governed Agent 2 template-layer public surface.',
);
requirePattern(
  catalog,
  /from ['"]\.\.\/\.\.\/core\/shared-piping-model\/index\.js['"]/u,
  'Catalog model must reuse canonical immutable/hash utilities.',
);
requirePattern(
  index,
  /from ['"]\.\/catalog-model\.js['"]/u,
  'Catalog index must re-export the read-only catalog model.',
);
requirePattern(
  combinedSource,
  /authority:\s*'DISPLAY_ONLY'/u,
  'Template schematic authority must remain DISPLAY_ONLY.',
);
requirePattern(
  combinedSource,
  /status:\s*'NOT_PROVIDED'/u,
  'T2 must not fabricate a schematic or geometry asset.',
);
requirePattern(
  catalog,
  /evaluateTemplateRegistryReadiness/u,
  'Catalog readiness must consume the governed T1 readiness evaluator.',
);
requirePattern(
  catalog,
  /Object\.freeze|deepFreeze/u,
  'Catalog records must be immutable.',
);

const imports = [...combinedSource.matchAll(/(?:import|export)\s+[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/gu)]
  .map((match) => match[1]);
const allowedSourceImports = new Set([
  '../../core/lafea-application-templates/index.js',
  '../../core/shared-piping-model/index.js',
  './catalog-card.js',
  './catalog-constants.js',
  './catalog-model.js',
  './catalog-query.js',
  './catalog-utils.js',
]);
for (const importPath of imports) {
  if (!allowedSourceImports.has(importPath)) {
    errors.push(`Unauthorized T2 catalog dependency: ${importPath}.`);
  }
}

const forbiddenPatterns = [
  [/lafea-stage-registry\.js/u, 'Catalog must not import the Agent 1 stage registry directly.'],
  [/lafea-workbench(?:-model|-view)?\.js/u, 'Catalog must not integrate the workbench in T2.'],
  [/lafea-result-presenters/u, 'Catalog must not import or duplicate presenter authority.'],
  [/local-(?:stress|attachment-screening|continuum|shell|trunnion-footprint)/u,
    'Catalog must not dispatch or import numerical core engines.'],
  [/\b(?:window|document|HTMLElement|customElements|innerHTML|addEventListener)\b/u,
    'T2 catalog model must remain UI-framework and DOM independent.'],
  [/\b(?:Date\.now|new\s+Date|Math\.random|randomUUID)\b/u,
    'Time or random identity is prohibited in semantic catalog data.'],
  [/\b(?:calculate|solve|assemble|factorize|dispatch)\w*\s*\(/u,
    'T2 catalog code must not calculate, solve, assemble, factorize, or dispatch an engine.'],
  [/executable\s*:\s*true/u,
    'T2 source must not hard-code an executable template.'],
  [/<(?:svg|canvas|mesh|path|polygon)\b/iu,
    'T2 must not embed visual or mesh geometry as catalog evidence.'],
  [/\b(?:allowable|utilization|stress)\s*=\s*[0-9]/iu,
    'T2 must not embed engineering result or allowable values.'],
];
for (const [pattern, message] of forbiddenPatterns) {
  if (pattern.test(combinedSource)) errors.push(message);
}

const stageRegistryPath = path.join(root, 'src/workspace/lafea-stage-registry.js');
if (!fs.existsSync(stageRegistryPath)) {
  errors.push('Agent 1 stage registry is unavailable for reverse-dependency verification.');
} else {
  const stageRegistry = fs.readFileSync(stageRegistryPath, 'utf8');
  if (/lafea-(?:application-templates|templates\/catalog-model)/u.test(stageRegistry)) {
    errors.push('Agent 1 stage registry must not import the Agent 2 template or catalog layer.');
  }
}

if (base !== null) verifyGitPerimeter(base);

if (errors.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL', errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  workPackage: 'T2_READ_ONLY_TEMPLATE_CATALOG',
  checkedPaths: allowedPaths,
  base,
  sourceDependencies: [...new Set(imports)].sort(asciiCompare),
}, null, 2));

function verifyGitPerimeter(baseRef) {
  let output;
  try {
    output = git(['diff', '--name-status', `${baseRef}...HEAD`]);
  } catch (error) {
    errors.push(`Unable to inspect T2 Git perimeter: ${message(error)}`);
    return;
  }
  const rows = output.split(/\r?\n/u).filter(Boolean).map((line) => line.split('\t'));
  const changedPaths = rows.map((row) => row.at(-1)).sort(asciiCompare);
  const expectedPaths = [...allowedPaths].sort(asciiCompare);
  if (JSON.stringify(changedPaths) !== JSON.stringify(expectedPaths)) {
    errors.push(
      `T2 changed-path set is invalid. Expected ${expectedPaths.join(', ')}; received ${changedPaths.join(', ')}.`,
    );
  }
  for (const [status, ...pathParts] of rows) {
    const changedPath = pathParts.at(-1);
    if (status !== 'A') {
      errors.push(`T2 path must be additive only: ${status} ${changedPath}.`);
    }
    if (!allowedPaths.includes(changedPath)) {
      errors.push(`Unauthorized T2 changed path: ${changedPath}.`);
    }
  }
  try {
    git(['diff', '--check', `${baseRef}...HEAD`]);
  } catch (error) {
    errors.push(`git diff --check failed: ${message(error)}`);
  }
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} requires a value.`);
    process.exit(2);
  }
  return value;
}

function readIfPresent(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function requirePattern(value, pattern, errorMessage) {
  if (!pattern.test(value)) errors.push(errorMessage);
}

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function message(error) {
  if (error && typeof error === 'object' && 'stderr' in error && error.stderr) {
    return String(error.stderr).trim();
  }
  return error instanceof Error ? error.message : String(error);
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
