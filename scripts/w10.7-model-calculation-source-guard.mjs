import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = '756df1909fdf22f9c334f6c62fa72770a5b62b40';
const root = process.cwd();
ensureBaseCommit();
const changed = lines(git('diff', '--name-only', BASE, 'HEAD'));
const selected = process.argv[2] || 'all';
const checks = Object.freeze({
  paths: checkChangedPaths,
  dependencies: checkDependencies,
  sizes: checkJavaScriptSizes,
  runtime: checkRuntimeBoundaries,
  contracts: checkContractSurfaces,
});
console.log(`\n--- W10.7 Source Boundary Guards · ${selected} ---\n`);
if (selected === 'all') Object.values(checks).forEach((check) => check());
else if (checks[selected]) checks[selected]();
else throw new TypeError(`Unknown W10.7 source-boundary check: ${selected}`);
console.log(`✅ W10.7 source boundary ${selected} check passed.\n`);

function checkChangedPaths() {
  assert.ok(changed.length > 0, 'W10.7 guard requires changed files.');
  changed.forEach((file) => assert.equal(allowed(file), true, `Forbidden W10.7 path changed: ${file}`));
  assert.equal(changed.includes('package-lock.json'), false, 'package-lock.json must not change.');
}
function checkDependencies() {
  const before = JSON.parse(git('show', `${BASE}:package.json`));
  const after = JSON.parse(readSource('package.json'));
  assert.deepEqual(after.dependencies, before.dependencies);
  assert.deepEqual(after.devDependencies, before.devDependencies);
}
function checkJavaScriptSizes() {
  changed.filter((file) => isNewW107File(file) && /\.(?:js|mjs)$/.test(file) && fs.existsSync(path.join(root, file))).forEach((file) => {
    const count = readSource(file).split(/\r?\n/).length - 1;
    assert.ok(count < 300, `${file} has ${count} lines.`);
  });
}
function checkRuntimeBoundaries() {
  const files = walk(path.join(root, 'src/core/model-calculation-package'))
    .concat(walk(path.join(root, 'src/workspace')).filter((file) => path.basename(file).startsWith('model-calculation-')));
  files.forEach((file) => checkRuntimeFile(file));
  const controller = readSource('src/workspace/model-calculation-controller.js');
  ['analysis:started', 'supportLoadScreening:runRequested', 'verticalBeam:solveRequested']
    .forEach((value) => assert.doesNotMatch(controller, new RegExp(value)));
  assert.doesNotMatch(controller, /runTributarySupportLoadScreening|runVerticalBeamSolution|solveVerticalBeamModel/);
}
function checkRuntimeFile(file) {
  const relative = path.relative(root, file).replaceAll('\\', '/'), source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /export\s+default\b/, `${relative} uses a default export.`);
  assert.doesNotMatch(source, /Date\.now\s*\(|Math\.random\s*\(|new Date\s*\(/, `${relative} uses nondeterministic identity.`);
  functionRanges(source).forEach((row) => assert.ok(row.lines <= 40, `${relative}:${row.line} function ${row.name} has ${row.lines} lines.`));
  if (relative.startsWith('src/core/')) checkCoreImports(relative, source);
}
function checkCoreImports(relative, source) {
  const forbidden = [
    /from\s+['"][^'"]*workspace/i, /\breact\b/i, /\bzustand\b/i, /\bthree(?:\.js)?\b/i,
    /calculation-workspace/i, /from\s+['"][^'"]*reporting/i, /from\s+['"][^'"]*solvers\//i,
    /runTributarySupportLoadScreening|buildTributarySupportLoadScreening|runVerticalBeamSolution|solveVerticalBeamModel/,
    /\bBlob\b|\bdocument\b|\bwindow\b|createObjectURL/,
  ];
  forbidden.forEach((pattern) => assert.equal(pattern.test(source), false, `${relative} crosses a forbidden core boundary: ${pattern}`));
}
function checkContractSurfaces() {
  const constants = readSource('src/core/model-calculation-package/constants.js');
  const index = readSource('src/core/model-calculation-package/index.js');
  ['model-calculation-package/v1', 'model-calculation-ledger/v1', 'model-calculation-ledger-entry/v1',
    'model-calculation-report/v1', 'model-calculation-export-artifact/v1']
    .forEach((schema) => assert.match(constants, new RegExp(schema.replaceAll('/', '\\/'))));
  ['createModelCalculationPackage', 'createModelCalculationLedger', 'createModelCalculationReport', 'createModelCalculationExportArtifact']
    .forEach((name) => assert.match(index, new RegExp(name)));
  const bootstrap = readSource('src/workspace/bootstrap.js');
  ['getModelCalculationLedger', 'getActiveModelCalculationPackage', 'getActiveModelCalculationReport']
    .forEach((name) => assert.match(bootstrap, new RegExp(name)));
  const view = readSource('src/workspace/model-calculation-view.js');
  ['Create Calculation Package', 'Select Archived Package', 'Export Package JSON',
    'Export Report CSV', 'Export Report Markdown', 'Clear Calculation History']
    .forEach((label) => assert.match(view, new RegExp(label)));
}
function isNewW107File(file) {
  return ['src/core/model-calculation-package/', 'src/workspace/model-calculation-', 'scripts/w10.7-', 'e2e/w10.7-'].some((prefix) => file.startsWith(prefix));
}
function allowed(file) {
  const roots = ['src/core/model-calculation-package/', 'src/workspace/model-calculation-', 'scripts/w10.7-', 'e2e/w10.7-', 'docs/model-calculation-package/'];
  const existing = new Set([
    'src/workspace/bootstrap.js', 'src/workspace/workspace-layout.js', 'src/workspace/event-topics.js',
    'src/workspace/workspace.css', 'package.json', '.github/workflows/u0-certification.yml',
    '.github/workflows/release-candidate.yml', 'scripts/qa-check.mjs',
    'scripts/u7-browser-qa-check.mjs', 'scripts/release-candidate-check.mjs',
  ]);
  return roots.some((prefix) => file.startsWith(prefix)) || existing.has(file);
}
function ensureBaseCommit() {
  try { execFileSync('git', ['cat-file', '-e', `${BASE}^{commit}`], { cwd: root, stdio: 'ignore' }); }
  catch { execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', BASE], { cwd: root, stdio: 'ignore' }); }
}
function functionRanges(source) {
  const rows = source.split(/\r?\n/), result = [];
  rows.forEach((line, index) => {
    const match = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
    if (!match) return;
    let depth = 0, started = false;
    for (let end = index; end < rows.length; end += 1) {
      depth += count(rows[end], '{') - count(rows[end], '}'); started ||= rows[end].includes('{');
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
