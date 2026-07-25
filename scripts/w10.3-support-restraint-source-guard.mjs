#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedEvidenceFiles = ['src/core/shared-piping-model/support-evidence.js'];
const runtimeFiles = [
  ...walk('src/core/support-restraints'),
  ...sharedEvidenceFiles,
  ...walk('src/workspace').filter((file) => path.basename(file).startsWith('support-restraint-')),
];
const missionFiles = [
  ...runtimeFiles,
  ...walk('scripts').filter((file) => path.basename(file).startsWith('w10.3-')),
  ...walk('e2e').filter((file) => path.basename(file).startsWith('w10.3-')),
];

console.log('\n--- W10.3 Support/Restraint Source Guards ---');
missionFiles.forEach(checkSizeAndExports);
runtimeFiles.forEach(checkDeterminism);
walk('src/core/support-restraints').forEach(checkCoreBoundary);
checkSharedModelDependencyDirection();
checkSpatialAlgorithm();
checkRequiredExports();
checkChangedPaths();
checkDependencyParity();
console.log(`✅ ${missionFiles.length} W10.3 files pass scope, size, dependency, and determinism guards.`);

function walk(relativeDir) {
  const absolute = path.join(root, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(relativeDir, entry.name).replaceAll('\\', '/');
    return entry.isDirectory() ? walk(relative) : /\.(?:js|mjs)$/.test(entry.name) ? [relative] : [];
  });
}

function checkSizeAndExports(relativePath) {
  const source = read(relativePath);
  const lines = source.split(/\r?\n/);
  assert(lines.length < 300, `${relativePath} has ${lines.length} lines.`);
  assert.doesNotMatch(source, /export\s+default\b/, `${relativePath} uses a default export.`);
  assertFunctionsBounded(relativePath, lines);
}

function checkDeterminism(relativePath) {
  const source = read(relativePath);
  assert.doesNotMatch(source, /\b(?:Date\.now|Math\.random|performance\.now)\s*\(/, `${relativePath} is nondeterministic.`);
  assert.doesNotMatch(source, /DEFAULT_(?:TOLERANCE|GAP|STIFFNESS|FRICTION|CAPABILITY)/, `${relativePath} introduces a hidden engineering default.`);
}

function checkCoreBoundary(relativePath) {
  const source = read(relativePath);
  assert.doesNotMatch(
    source,
    /from\s+['"][^'"]*(?:\/workspace\/|\/calc-workspace\/|\/solvers?\/|\/reporting\/|(?:react|zustand|three)(?:\/|['"]))/i,
    `${relativePath} crosses the core boundary.`,
  );
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|Blob|URL\.createObjectURL)\b/, `${relativePath} contains browser APIs.`);
  assert.doesNotMatch(source, /sourceSnapshot\s*\.\s*sourcePackage/, `${relativePath} traverses raw source snapshots.`);
}

function checkSharedModelDependencyDirection() {
  const adapter = read('src/core/shared-piping-model/adapters/workspace-dataset-to-shared.js');
  const collector = read('src/core/shared-piping-model/support-evidence.js');
  assert.doesNotMatch(adapter, /support-restraints\//, 'Shared-model adapter imports a downstream support-restraints module.');
  assert.doesNotMatch(collector, /support-restraints\//, 'Shared-model evidence collector imports a downstream support-restraints module.');
}

function checkSpatialAlgorithm() {
  const source = read('src/core/support-restraints/attachment-resolver.js');
  assert.match(source, /spatialIndex\.query/, 'Geometric projection does not use the spatial index.');
  assert.doesNotMatch(source, /for\s*\([^)]*support[^)]*\)[\s\S]{0,500}for\s*\([^)]*target/i, 'Production code contains an all-supports × all-targets loop.');
  const indexSource = read('src/core/support-restraints/target-spatial-index.js');
  assert.match(indexSource, /for \(let dx = -1; dx <= 1;/, 'Spatial query does not inspect neighbour cells.');
  assert.match(indexSource, /for \(let dy = -1; dy <= 1;/, 'Spatial query does not inspect neighbour cells.');
  assert.match(indexSource, /for \(let dz = -1; dz <= 1;/, 'Spatial query does not inspect neighbour cells.');
}

function checkRequiredExports() {
  const source = read('src/core/support-restraints/index.js');
  [
    'createEvidenceOnlyAttachmentProfile',
    'projectEngineeringSupports',
    'buildSupportAttachmentModel',
    'validateSupportAttachmentAudit',
    'createDefaultRestraintClassificationProfile',
    'buildRestraintCapabilityModel',
    'validateRestraintCapabilityAudit',
  ].forEach((symbol) => assert(source.includes(symbol), `Missing W10.3 export ${symbol}.`));
}

function checkChangedPaths() {
  const changed = changedFiles();
  if (!changed.length) return;
  const allowedExact = new Set([
    'src/core/shared-piping-model/property-specs.js',
    'src/core/shared-piping-model/support-evidence.js',
    'src/core/shared-piping-model/adapters/workspace-dataset-to-shared.js',
    'src/core/shared-piping-model/index.js',
    'src/core/piping-topology/index.js',
    'src/workspace/bootstrap.js',
    'src/workspace/workspace-layout.js',
    'src/workspace/event-topics.js',
    'src/workspace/workspace.css',
    'package.json',
    '.github/workflows/u0-certification.yml',
    '.github/workflows/release-candidate.yml',
    'scripts/qa-check.mjs',
    'scripts/u7-browser-qa-check.mjs',
    'scripts/release-candidate-check.mjs',
  ]);
  const allowedPrefixes = [
    'src/core/support-restraints/',
    'src/workspace/support-restraint-',
    'scripts/w10.3-',
    'e2e/w10.3-',
    'docs/support-restraints/',
  ];
  changed.forEach((file) => {
    const allowed = allowedExact.has(file) || allowedPrefixes.some((prefix) => file.startsWith(prefix));
    assert(allowed, `W10.3 changed forbidden or unapproved file: ${file}`);
  });
  assert(!changed.includes('package-lock.json'), 'W10.3 changed package-lock.json.');
}

function checkDependencyParity() {
  const previous = previousPackageJson();
  if (!previous) return;
  const current = JSON.parse(read('package.json'));
  assert.deepEqual(current.dependencies, previous.dependencies, 'W10.3 changed dependencies.');
  assert.deepEqual(current.devDependencies, previous.devDependencies, 'W10.3 changed devDependencies.');
}

function changedFiles() {
  try {
    return execSync('git diff --name-only HEAD^ HEAD', { cwd: root, encoding: 'utf8' })
      .trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function previousPackageJson() {
  try {
    return JSON.parse(execSync('git show HEAD^:package.json', { cwd: root, encoding: 'utf8' }));
  } catch {
    return null;
  }
}

function assertFunctionsBounded(relativePath, lines) {
  functionRanges(lines).forEach(({ start, end, name }) => {
    assert(end - start + 1 <= 40, `${relativePath}:${start + 1} ${name} exceeds 40 lines.`);
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
  throw new Error(`Unclosed function at line ${start + 1}.`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
