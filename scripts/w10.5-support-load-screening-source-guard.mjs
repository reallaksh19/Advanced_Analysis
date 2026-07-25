import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const coreDir = path.join(repoRoot, 'src/core/support-load-screening');
const workspaceDir = path.join(repoRoot, 'src/workspace');
const coreFiles = jsFiles(coreDir).map((name) => path.join(coreDir, name));
const workspaceFiles = jsFiles(workspaceDir).filter((name) => name.startsWith('support-load-screening-'))
  .map((name) => path.join(workspaceDir, name));
const allowedCoreImports = new Set([
  '../shared-piping-model/index.js',
  '../piping-topology/index.js',
  '../support-restraints/index.js',
  '../model-loads/index.js',
]);

assert(coreFiles.length >= 13, 'Expected W10.5 core modules.');
for (const file of [...coreFiles, ...workspaceFiles]) checkModule(file, coreFiles.includes(file));
checkDomainEvidence();
checkChangedPaths();
await import('./w10.5-owner-regression-check.mjs');
console.log(`✅ W10.5 source guards passed for ${coreFiles.length} core and ${workspaceFiles.length} Workspace modules.`);

function checkModule(file, core) {
  const relative = path.relative(repoRoot, file).replaceAll('\\', '/');
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  assert(lines.length < 300, `${relative} exceeds 300 lines.`);
  assert(!/export\s+default\b/.test(source), `${relative} uses a default export.`);
  assert(!/\b(Date\.now|Math\.random|new Date\s*\(|performance\.now)\b/.test(source), `${relative} uses nondeterministic time or identity.`);
  if (core) checkCoreBoundary(relative, source);
  practicalFunctionLengths(source).forEach(({ name, count }) => {
    assert(count <= 40, `${relative} function ${name} spans ${count} lines.`);
  });
}

function checkCoreBoundary(relative, source) {
  assert(!/\b(React|Zustand|Three|document|window|Blob|URL\.createObjectURL)\b/.test(source), `${relative} uses UI/runtime APIs.`);
  assert(!/calc-workspace|model-support-load|core\/solvers|src\/solvers|reporting/.test(source), `${relative} crosses a forbidden domain boundary.`);
  importedPaths(source).forEach((specifier) => {
    if (!specifier.startsWith('.')) return;
    assert(specifier.startsWith('./') || allowedCoreImports.has(specifier), `${relative} imports forbidden module ${specifier}.`);
  });
  assert(!/\breaction\s*:/.test(source), `${relative} defines a generic reaction field.`);
  assert(!/\b(routeId|chainage|globalChainage|legacyChainage)\s*:/.test(source), `${relative} defines route/global-chainage state.`);
  assert(!/\b(stiffness|displacement|rotation|thermalForce|guideForce|lineStopForce|horizontalForce)\s*:/.test(source), `${relative} defines out-of-scope solver state.`);
}

function checkDomainEvidence() {
  const profile = readCore('profile.js');
  assert(profile.includes('SIMPLE_CHAIN_TRIBUTARY_VERTICAL_V1') || readCore('constants.js').includes('SIMPLE_CHAIN_TRIBUTARY_VERTICAL_V1'));
  for (const policy of ['branchPolicy', 'cyclePolicy', 'overhangPolicy', 'gapPolicy', 'springPolicy']) {
    assert(profile.includes(policy), `Profile does not expose ${policy}.`);
  }
  const formulas = readCore('formulas.js');
  assert(formulas.includes('SIMPLE_SPAN_POINT_LOAD_REACTION_V1') || readCore('constants.js').includes('SIMPLE_SPAN_POINT_LOAD_REACTION_V1'));
  assert(formulas.includes('screenedVerticalForceN'));
  assert(formulas.includes('SUPPORT_FORCE_EQUILIBRIUM_CHECK_V1') || readCore('constants.js').includes('SUPPORT_FORCE_EQUILIBRIUM_CHECK_V1'));
  const engine = readCore('screening-engine.js');
  assert(engine.includes('OVERHANG_LOAD_UNSUPPORTED'));
  assert(engine.includes('EXPLICIT_POINT_MOMENT') || engine.includes('PRIMITIVE_TYPES.MOMENT'));
  const projection = readCore('primitive-projection.js');
  assert(
    projection.indexOf('const interval = intervals.get(primitive.componentKey)')
      < projection.indexOf('profile.eligiblePrimitiveTypes.includes(primitive.primitiveType)'),
    'Primitive validation must occur only after path membership is established.',
  );
  const foundation = readCore('foundation.js');
  assert(foundation.includes('Primitive set does not match vertical load paths.'));
  assert(foundation.includes('Screening profile does not match vertical load paths.'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert(packageJson.devDependencies?.['@eslint/js'], 'W10.5 must not remove the existing @eslint/js dependency.');
}

function checkChangedPaths() {
  let files;
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD^1'], { cwd: repoRoot, stdio: 'ignore' });
    files = execFileSync('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' })
      .trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return;
  }
  const allowedExact = new Set([
    'src/core/piping-topology/index.js', 'src/core/support-restraints/index.js', 'src/core/model-loads/index.js',
    'src/workspace/bootstrap.js', 'src/workspace/workspace-layout.js', 'src/workspace/event-topics.js', 'src/workspace/workspace.css',
    'package.json', '.github/workflows/u0-certification.yml', '.github/workflows/release-candidate.yml',
    'scripts/qa-check.mjs', 'scripts/u7-browser-qa-check.mjs', 'scripts/release-candidate-check.mjs',
  ]);
  const allowedPrefixes = [
    'src/core/support-load-screening/', 'src/workspace/support-load-screening-', 'scripts/w10.5-',
    'e2e/w10.5-', 'docs/support-load-screening/',
  ];
  files.forEach((file) => assert(allowedExact.has(file) || allowedPrefixes.some((prefix) => file.startsWith(prefix)), `Forbidden W10.5 changed path: ${file}`));
  assert(!files.includes('package-lock.json'), 'W10.5 must not change package-lock.json.');
}

function jsFiles(directory) { return fs.readdirSync(directory).filter((name) => name.endsWith('.js')).sort(); }
function readCore(name) { return fs.readFileSync(path.join(coreDir, name), 'utf8'); }
function importedPaths(source) { return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]); }
function practicalFunctionLengths(source) {
  const lines = source.split(/\r?\n/), results = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/);
    if (!match) return;
    results.push({ name: match[1], count: functionEnd(lines, index) - index + 1 });
  });
  return results;
}
function functionEnd(lines, start) {
  let depth = 0, opened = false;
  for (let index = start; index < lines.length; index += 1) {
    for (const char of lines[index]) { if (char === '{') { depth += 1; opened = true; } if (char === '}') depth -= 1; }
    if (opened && depth === 0) return index;
  }
  return lines.length - 1;
}
