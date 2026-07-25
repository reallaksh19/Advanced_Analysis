import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'e3311b77701fb8ce3ca92555aad1d7deef3edcb3';
const root = process.cwd();
ensureBaseCommit();
const changed = lines(git('diff', '--name-only', BASE, 'HEAD'));
const selected = process.argv[2] || 'all';
const checks = Object.freeze({
  paths: checkChangedPaths,
  dependencies: checkDependencies,
  sizes: checkJavaScriptSizes,
  runtime: checkRuntimeFiles,
  aliases: checkPropertyAliases,
});
console.log(`\n--- W10.6 Source Boundary Guards · ${selected} ---\n`);
if (selected === 'all') Object.values(checks).forEach((check) => check());
else if (checks[selected]) checks[selected]();
else throw new TypeError(`Unknown W10.6 source-boundary check: ${selected}`);
console.log(`✅ W10.6 source boundary ${selected} check passed.\n`);

function checkChangedPaths() {
  assert.ok(changed.length > 0, 'W10.6 guard requires changed files.');
  changed.forEach((file) => assert.equal(allowed(file), true, `Forbidden W10.6 path changed: ${file}`));
  assert.equal(changed.includes('package-lock.json'), false, 'package-lock.json must not change.');
}

function checkJavaScriptSizes() {
  changed.filter((file) => /\.(?:js|mjs)$/.test(file) && fs.existsSync(path.join(root, file))).forEach((file) => {
    const lineCount = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/).length - 1;
    assert.ok(lineCount < 300, `${file} has ${lineCount} lines.`);
  });
}

function checkRuntimeFiles() {
  const files = walk(path.join(root, 'src/core/vertical-beam-solver'))
    .concat(walk(path.join(root, 'src/workspace')).filter((file) => path.basename(file).startsWith('vertical-beam-')));
  files.forEach((file) => {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const source = fs.readFileSync(file, 'utf8');
    const lineCount = source.split(/\r?\n/).length - 1;
    assert.ok(lineCount < 300, `${relative} has ${lineCount} lines.`);
    assert.equal(/export\s+default\b/.test(source), false, `${relative} uses a default export.`);
    assert.equal(/Date\.now\s*\(|Math\.random\s*\(/.test(source), false, `${relative} uses nondeterministic identity.`);
    assert.equal(/\b(?:200|210)(?:e9|000000000)\b/i.test(source), false, `${relative} hard-codes a steel modulus.`);
    checkFunctions(relative, source);
    if (relative.startsWith('src/core/vertical-beam-solver/')) checkCoreImports(relative, source);
  });
  const profile = readSource('src/core/vertical-beam-solver/profile.js');
  assert.match(profile, /penaltyStiffness:\s*false/);
  assert.equal(/penalty(?:Factor|Value|Coefficient)\s*[:=]/i.test(profile), false);
  assert.doesNotMatch(readSource('src/core/vertical-beam-solver/load-projection.js'), /blockAllPaths/);
  assert.doesNotMatch(readSource('src/core/vertical-beam-solver/beam-model.js'), /\.blockAllPaths/);
  const store = readSource('src/workspace/vertical-beam-store.js');
  ['profileSemanticHash', 'flexuralProjectionSemanticHash', 'solutionSemanticHash']
    .forEach((field) => assert.match(store, new RegExp(field)));
}

function checkCoreImports(relative, source) {
  const forbidden = [
    /from\s+['"][^'"]*workspace/i, /react/i, /zustand/i, /three/i,
    /calculation-workspace/i, /model-support-load/i, /from\s+['"][^'"]*solvers\//i,
    /from\s+['"][^'"]*reporting/i,
  ];
  forbidden.forEach((pattern) => assert.equal(pattern.test(source), false, `${relative} crosses a forbidden core boundary: ${pattern}`));
}

function checkFunctions(relative, source) {
  functionRanges(source).forEach((row) => {
    assert.ok(row.lines <= 40, `${relative}:${row.line} function ${row.name} has ${row.lines} lines.`);
  });
}

function checkPropertyAliases() {
  const source = fs.readFileSync(path.join(root, 'src/core/shared-piping-model/property-specs.js'), 'utf8');
  ['ELASTIC_MODULUS_MPA', 'YOUNGS_MODULUS_MPA', 'YOUNG_MODULUS_MPA', 'MODULUS_OF_ELASTICITY_MPA',
    'SECOND_MOMENT_AREA_MM4', 'AREA_MOMENT_OF_INERTIA_MM4', 'FLEXURAL_RIGIDITY_N_M2', 'EI_N_M2']
    .forEach((value) => assert.match(source, new RegExp(`['"]${value}['"]`)));
  ['E', 'I', 'MODULUS', 'INERTIA'].forEach((value) => assert.equal(new RegExp(`['"]${value}['"]`).test(source), false));
}

function checkDependencies() {
  const before = JSON.parse(git('show', `${BASE}:package.json`));
  const after = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(after.dependencies, before.dependencies);
  assert.deepEqual(after.devDependencies, before.devDependencies);
}

function allowed(file) {
  const newRoots = [
    'src/core/vertical-beam-solver/', 'src/workspace/vertical-beam-', 'scripts/w10.6-',
    'e2e/w10.6-', 'docs/vertical-beam-solver/',
  ];
  const existing = new Set([
    'src/core/shared-piping-model/property-specs.js', 'src/workspace/bootstrap.js',
    'src/workspace/workspace-layout.js', 'src/workspace/event-topics.js', 'src/workspace/workspace.css',
    'package.json', '.github/workflows/u0-certification.yml', '.github/workflows/release-candidate.yml',
    'scripts/qa-check.mjs', 'scripts/u7-browser-qa-check.mjs', 'scripts/release-candidate-check.mjs',
  ]);
  return newRoots.some((prefix) => file.startsWith(prefix)) || existing.has(file);
}

function ensureBaseCommit() {
  try {
    execFileSync('git', ['cat-file', '-e', `${BASE}^{commit}`], { cwd: root, stdio: 'ignore' });
  } catch {
    execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', BASE], { cwd: root, stdio: 'ignore' });
  }
}
function functionRanges(source) {
  const rows = source.split(/\r?\n/), result = [];
  rows.forEach((line, index) => {
    const match = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
    if (!match) return;
    let depth = 0, started = false;
    for (let end = index; end < rows.length; end += 1) {
      depth += count(rows[end], '{') - count(rows[end], '}');
      started ||= rows[end].includes('{');
      if (started && depth === 0) { result.push({ name: match[1], line: index + 1, lines: end - index + 1 }); break; }
    }
  });
  return result;
}
function readSource(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function count(value, character) { return [...value].filter((item) => item === character).length; }
function walk(directory) { if (!fs.existsSync(directory)) return []; return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : entry.name.endsWith('.js') ? [path.join(directory, entry.name)] : []); }
function git(...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); }
function lines(value) { return value.trim().split(/\r?\n/).filter(Boolean); }
