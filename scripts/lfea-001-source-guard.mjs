import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const BASE_SHA = 'ce719a719a740d5228b5a404a6848af878954609';
const root = new URL('../', import.meta.url).pathname;
const core = join(root, 'src/core/element-fea');
const scripts = join(root, 'scripts');
const files = [...walk(core), ...walk(scripts).filter(isLfeaScript)];
const allowedPaths = Object.freeze([
  /^src\/core\/element-fea\//,
  /^scripts\/lfea-001-[^/]+\.mjs$/,
  /^docs\/element-fea\/LFEA-001_IMPLEMENTATION\.md$/,
  /^\.github\/workflows\/lfea-001-certification\.yml$/,
]);

ensureBaseCommit();
validateChangedPaths();
files.forEach(validateFile);
validateProductionImports();
validateScopeBoundary();
validateDependencies();
validateCertification();
console.log(`LFEA-001 exact-base source and certification guards passed for ${files.length} files.`);

function validateChangedPaths() {
  const changed = gitLines(['diff', '--name-only', BASE_SHA, 'HEAD']);
  const rejected = changed.filter((file) => !allowedPaths.some((rule) => rule.test(file)));
  assert.deepEqual(rejected, [], `Disallowed LFEA-001 changed paths: ${rejected.join(', ')}`);
  assert.equal(changed.includes('package-lock.json'), false, 'package-lock.json must remain unchanged.');
  assert.equal(changed.includes('scripts/w10.11-pipe-solver-source-guard.mjs'), false,
    'Historical W10.11 source guard must remain byte-for-byte unchanged.');
}

function validateFile(file) {
  const text = readFileSync(file, 'utf8');
  const name = relative(root, file);
  const lineCount = text.split(/\r?\n/).length - 1;
  assert.ok(lineCount < 300, `${name} exceeds 299 lines.`);
  assert.ok(!/export\s+default/.test(text), `${name} uses a default export.`);
  assert.ok(!/\beval\s*\(|new\s+Function\s*\(/.test(text), `${name} uses dynamic code execution.`);
  if (name.startsWith('src/')) {
    assert.ok(!/\b(?:Date\.now|new Date|Math\.random|randomUUID|crypto\.randomUUID|uuid)\b/i.test(text),
      `${name} contains nondeterministic identity logic.`);
  }
  functionSpans(text).filter((row) => row.lines > 40).forEach((row) => {
    throw new Error(`${name} function ${row.name} has ${row.lines} lines; maximum is 40.`);
  });
}

function validateProductionImports() {
  walk(core).forEach((file) => {
    const imports = [...readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map((match) => match[1]);
    imports.forEach((specifier) => {
      const shared = specifier === '../shared-piping-model/immutable.js'
        || specifier === '../shared-piping-model/canonical-json.js';
      assert.ok(specifier.startsWith('./') || shared,
        `${relative(root, file)} imports unauthorized authority: ${specifier}`);
    });
  });
}

function validateScopeBoundary() {
  const production = walk(core).map((file) => readFileSync(file, 'utf8')).join('\n');
  const forbidden = [
    'workspace-consumer-registry', 'application-view-state', 'PIPE_SOLVER', 'W11',
    'canvas', 'viewport', 'piping-code', 'weak spring', 'weakSpring', 'pivot clamp',
    'diagonal repair', 'stiffness repair', 'fallback axis',
  ];
  forbidden.forEach((token) => {
    assert.equal(production.includes(token), false, `Production core crosses excluded boundary: ${token}`);
  });
  const geometry = readFileSync(join(core, 't3-geometry.js'), 'utf8');
  assert.equal(geometry.includes('Math.abs'), false,
    'T3 signed area must not be repaired with an absolute value.');
  const model = readFileSync(join(core, 'model.js'), 'utf8');
  assert.equal(/\.reverse\s*\(\)/.test(model), false,
    'Element connectivity must not be silently reversed.');
}

function validateDependencies() {
  const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const previous = JSON.parse(git(['show', `${BASE_SHA}:package.json`]));
  assert.deepEqual(current.dependencies, previous.dependencies, 'dependencies must remain unchanged.');
  assert.deepEqual(current.devDependencies, previous.devDependencies, 'devDependencies must remain unchanged.');
}

function validateCertification() {
  const workflow = readFileSync(join(root, '.github/workflows/lfea-001-certification.yml'), 'utf8');
  requireTokens(workflow, [
    'name: LFEA-001 Core Certification',
    'node scripts/lfea-001-check.mjs',
    'node scripts/lfea-001-source-guard.mjs',
    "'src/core/element-fea/**'",
    "'scripts/lfea-001-*.mjs'",
  ], 'dedicated LFEA workflow');
  assert.equal(workflow.includes('w10.11'), false,
    'Dedicated LFEA workflow must not invoke W10.11 authority.');
}

function functionSpans(content) {
  const lines = content.split(/\r?\n/);
  const spans = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:export\s+)?function\s+(\w+)\s*\(/);
    if (!match) continue;
    let depth = 0;
    let end = index;
    for (; end < lines.length; end += 1) {
      depth += (lines[end].match(/{/g) || []).length;
      depth -= (lines[end].match(/}/g) || []).length;
      if (depth === 0 && end > index) break;
    }
    spans.push({ name: match[1], lines: end - index + 1 });
  }
  return spans;
}

function requireTokens(content, tokens, label) {
  tokens.forEach((token) => assert.ok(content.includes(token), `${label} missing ${token}.`));
}
function isLfeaScript(file) { return basename(file).startsWith('lfea-001-'); }
function ensureBaseCommit() {
  try { git(['cat-file', '-e', `${BASE_SHA}^{commit}`]); }
  catch { execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', BASE_SHA], { cwd: root }); }
}
function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
function gitLines(args) { return git(args).split(/\r?\n/).filter(Boolean); }
function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); }
