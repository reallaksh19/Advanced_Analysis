#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFiles = [
  ...walk('src/core/piping-topology'),
  ...walk('src/workspace').filter((file) => path.basename(file).startsWith('topology-')),
].sort();

console.log('\n--- W10.2 Topology Source Guards ---');
runtimeFiles.forEach(checkSourceFile);
checkCoreIsolation();
checkSpatialAlgorithm();
checkRequiredExports();
console.log(`✅ ${runtimeFiles.length} W10.2 modules pass source, size, determinism, and algorithm guards.`);

function checkSourceFile(relativePath) {
  const source = read(relativePath);
  const lines = source.split(/\r?\n/);
  assert(lines.length < 300, `${relativePath} has ${lines.length} lines.`);
  assert.doesNotMatch(source, /export\s+default\b/, `${relativePath} uses a default export.`);
  assert.doesNotMatch(source, /\b(?:Date\.now|Math\.random|performance\.now)\s*\(/, `${relativePath} is nondeterministic.`);
  assertFunctionsBounded(relativePath, lines);
}

function checkCoreIsolation() {
  walk('src/core/piping-topology').forEach((relativePath) => {
    const source = read(relativePath);
    assert.doesNotMatch(source, /from\s+['"][^'"]*(?:react|zustand|three|src\/workspace|\.\.\/\.\.\/workspace|core\/solvers|\/solvers\/|reporting)/i, `${relativePath} violates core isolation.`);
    assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|Blob|URL\.createObjectURL)\b/, `${relativePath} imports browser behavior.`);
  });
}

function checkSpatialAlgorithm() {
  const tolerance = read('src/core/piping-topology/tolerance-stage.js');
  const spatial = read('src/core/piping-topology/spatial-hash.js');
  assert.match(tolerance, /buildSpatialHash/, 'Tolerance stage does not use the spatial hash.');
  assert.match(spatial, /dx\s*=\s*-1[\s\S]*dy\s*=\s*-1[\s\S]*dz\s*=\s*-1/, 'Spatial hash does not inspect 27 neighbouring cells.');
  const production = walk('src/core/piping-topology').map(read).join('\n');
  assert.doesNotMatch(production, /for\s*\([^)]*portA[^)]*of\s+ports[^)]*\)[\s\S]{0,200}for\s*\([^)]*portB[^)]*of\s+ports/i, 'All-pairs production loop detected.');
}

function checkRequiredExports() {
  const source = read('src/core/piping-topology/index.js');
  [
    'createExactTopologyProfile',
    'createToleranceTopologyProfile',
    'projectEngineeringPorts',
    'buildPipingPortTopologyGraph',
    'validateTopologyConnectionAudit',
  ].forEach((symbol) => assert(source.includes(symbol), `Topology index does not export ${symbol}.`));
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
    if (match) ranges.push({ start: index, end: closingBraceLine(lines, index), name: match[1] });
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

function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(relativeDir, entry.name).replaceAll('\\', '/');
    return entry.isDirectory() ? walk(relative) : entry.name.endsWith('.js') ? [relative] : [];
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
