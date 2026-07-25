import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DOFS } from '../src/core/local-shell/index.js';

const root = process.cwd();
const productionRoot = path.join(root, 'src/core/local-shell');
const productionFiles = fs.readdirSync(productionRoot)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(productionRoot, name));

assert.deepEqual(DOFS, ['UX', 'UY', 'UZ', 'R1', 'R2']);
for (const file of productionFiles) inspectProduction(file);
inspectScope();
console.log('LAFEA.4 source size, function span, exports, runtime boundaries and exact-baseline scope passed.');

function inspectProduction(file) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  const lines = source.split('\n');
  assert.ok(lines.length < 300, `${relative} has ${lines.length} lines`);
  assert.equal(/export\s+default/.test(source), false, `${relative} uses a default export`);
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    assert.ok(match[1].startsWith('./'), `${relative} imports outside local-shell: ${match[1]}`);
  }
  for (const token of forbiddenRuntimeTokens()) assert.equal(source.includes(token), false, `${relative} contains ${token}`);
  for (const target of ['local-continuum', 'element-fea', 'local-stress', 'local-attachment-screening']) {
    assert.equal(source.includes(target), false, `${relative} references forbidden ${target}`);
  }
  inspectFunctionSpans(lines, relative);
}

function inspectFunctionSpans(lines, relative) {
  for (let index = 0; index < lines.length; index += 1) {
    if (!/(?:export\s+)?function\s+[A-Za-z0-9_]+\s*\(/.test(lines[index])) continue;
    const end = functionEnd(lines, index);
    assert.ok(end - index + 1 <= 40, `${relative}:${index + 1} function exceeds 40 lines`);
  }
}

function functionEnd(lines, start) {
  let depth = 0;
  let opened = false;
  for (let index = start; index < lines.length; index += 1) {
    depth += count(lines[index], '{') - count(lines[index], '}');
    opened ||= lines[index].includes('{');
    if (opened && depth === 0) return index;
  }
  throw new Error(`Unclosed function at line ${start + 1}`);
}

function inspectScope() {
  const baseline = 'ae3158c36e9da055be921151f98dce06d03bd240';
  if (!gitObjectExists(baseline)) {
    inspectHarnessManifest();
    return;
  }
  const files = git(['diff', '--name-only', `${baseline}...HEAD`]).trim().split('\n').filter(Boolean);
  assert.ok(files.length > 0, 'No LAFEA.4 changes found');
  for (const file of files) assert.ok(isAllowed(file), `Unauthorized changed file ${file}`);
  inspectRegistrationDiff(baseline, 'package.json');
  inspectRegistrationDiff(baseline, 'scripts/qa-check.mjs');
}

function inspectHarnessManifest() {
  for (const file of productionFiles) assert.ok(isAllowed(path.relative(root, file)));
  for (const name of fs.readdirSync(path.join(root, 'scripts')).filter((value) => value.startsWith('lafea.4-'))) {
    assert.ok(isAllowed(`scripts/${name}`));
  }
}

function inspectRegistrationDiff(baseline, file) {
  const diff = git(['diff', '--unified=0', `${baseline}...HEAD`, '--', file]);
  const added = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  const removed = diff.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---'));
  assert.equal(added.length, 1, `${file} must contain exactly one added registration line`);
  assert.equal(removed.length, 0, `${file} must not remove lines`);
  assert.ok(added[0].includes('lafea.4'), `${file} registration must name lafea.4`);
}

function isAllowed(file) {
  return file.startsWith('src/core/local-shell/')
    || file.startsWith('scripts/lafea.4-')
    || file.startsWith('docs/local-shell/')
    || file === 'package.json'
    || file === 'scripts/qa-check.mjs';
}

function gitObjectExists(reference) {
  try {
    git(['cat-file', '-e', `${reference}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function forbiddenRuntimeTokens() {
  return [
    'Math.random', 'Date.now', 'new Date(', 'performance.now',
    'document.', 'window.', 'XMLHttpRequest', 'fetch(',
    "from 'node:fs'", "from 'node:child_process'", "from 'node:http'", "from 'node:https'",
  ];
}

function count(text, token) {
  return text.split(token).length - 1;
}
