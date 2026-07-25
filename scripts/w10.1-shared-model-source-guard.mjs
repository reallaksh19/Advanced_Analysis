#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFiles = collectRuntimeFiles();
const guardFiles = [
  ...runtimeFiles,
  'src/workspace/staged-model-index.js',
  'src/workspace/dataset-adapter.js',
  'src/workspace/calculation-workspace-bridge.js',
];

console.log('\n--- W10.1 Shared Model Source Guards ---');
guardFiles.forEach(checkSourceFile);
checkCalculationBridge();
checkRequiredExports();
console.log(`✅ ${guardFiles.length} W10.1 source files pass size, export, dependency, and determinism guards.`);

function collectRuntimeFiles() {
  const core = walk('src/core/shared-piping-model');
  const workspace = walk('src/workspace').filter((file) => path.basename(file).startsWith('shared-model-'));
  return [...core, ...workspace].sort();
}

function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(relativeDir, entry.name).replaceAll('\\', '/');
    return entry.isDirectory() ? walk(relative) : entry.name.endsWith('.js') ? [relative] : [];
  });
}

function checkSourceFile(relativePath) {
  const source = read(relativePath);
  const lines = source.split(/\r?\n/);
  if (isNewModule(relativePath)) assert(lines.length < 300, `${relativePath} has ${lines.length} lines.`);
  assert.doesNotMatch(source, /export\s+default\b/, `${relativePath} uses a default export.`);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:react|zustand)/i, `${relativePath} imports React/Zustand.`);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:core\/solvers|\/solvers\/)/i, `${relativePath} imports a solver.`);
  assert.doesNotMatch(source, /\b(?:Date\.now|Math\.random|performance\.now)\s*\(/, `${relativePath} is nondeterministic.`);
  if (isNewModule(relativePath)) assertFunctionsBounded(relativePath, lines);
}

function checkCalculationBridge() {
  const source = read('src/workspace/calculation-workspace-bridge.js');
  assert.doesNotMatch(source, /normalizeCalculationWorkspacePackage/, 'Bridge still invokes raw package normalization.');
  assert.doesNotMatch(source, /sourceModel\.sourcePackage/, 'Bridge still traverses the preserved raw source package.');
  assert.match(source, /projectSharedPipingModelToCalculationWorkspace/, 'Bridge does not use the shared model projection.');
}

function checkRequiredExports() {
  const source = read('src/core/shared-piping-model/index.js');
  for (const symbol of [
    'createSourcePackageSnapshot',
    'buildSharedPipingModelFromWorkspaceDataset',
    'buildSharedPipingModelFromCanonicalGeometry',
    'projectSharedPipingModelToCanonicalGeometry',
    'projectSharedPipingModelToCalculationWorkspace',
  ]) assert(source.includes(symbol), `Shared model index does not export ${symbol}.`);
}

function assertFunctionsBounded(relativePath, lines) {
  functionRanges(lines).forEach(({ start, end, name }) => {
    const count = end - start + 1;
    assert(count <= 40, `${relativePath}:${start + 1} ${name} is ${count} lines.`);
  });
}

function functionRanges(lines) {
  const ranges = [];
  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(/);
    if (!match) return;
    ranges.push({ start: index, end: closingBraceLine(lines, index), name: match[1] });
  });
  return ranges;
}

function closingBraceLine(lines, start) {
  let depth = 0;
  let opened = false;
  for (let index = start; index < lines.length; index += 1) {
    for (const character of lines[index]) {
      if (character === '{') { depth += 1; opened = true; }
      if (character === '}') depth -= 1;
    }
    if (opened && depth === 0) return index;
  }
  throw new Error(`Unclosed function starting at line ${start + 1}.`);
}

function isNewModule(relativePath) {
  return relativePath.startsWith('src/core/shared-piping-model/')
    || path.basename(relativePath).startsWith('shared-model-');
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
