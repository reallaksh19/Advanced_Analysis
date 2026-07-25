import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE_SHA = 'dca37fd61a70bdfc81fafa3bc666beb31256fece';
const W10_R2_MERGED_SHA = 'ebe7fa526712ba945a1fa8e7fd7c6fe06c73c07a';
const root = process.cwd();
const successorMode = isAncestor(W10_R2_MERGED_SHA, 'HEAD');
const scopeBase = successorMode ? W10_R2_MERGED_SHA : resolveScopeBase();
const changed = gitLines(['diff', '--name-only', scopeBase, 'HEAD']);
const added = new Set(gitLines(['diff', '--name-only', '--diff-filter=A', scopeBase, 'HEAD']));
const errors = [];

const allowed = Object.freeze([
  /^src\/core\/pcf-intake\//,
  /^src\/core\/workspace-consumers\/(?:constants|event-contracts|index|registry|view-state)\.js$/,
  /^src\/core\/workspace-home\/(?:source|review-model)\.js$/,
  /^src\/workspace\/(?:application-shell-controller|pcf-consumer-controller|pcf-consumer-view|workspace-layout)\.js$/,
  /^docs\/main-tab-recovery\/W10\.R2_PCF_INTAKE_REVIEW\.md$/,
  /^scripts\/w10\.r2-[^/]+\.mjs$/,
  /^scripts\/w10\.(?:9-load-calculation|10-three-d-calculation|11-pipe-solver)-source-guard\.mjs$/,
  /^scripts\/lafea\.1-source-guard\.mjs$/,
  /^e2e\/w10\.r2-[^/]+\.spec\.js$/,
  /^e2e\/(?:phase1-analysis-workspace|phase8-engineering-geometry)\.spec\.js$/,
  /^e2e\/w10\.(?:8-workspace-consumers|9-load-calc-consumer|10-three-d-calc-consumer|11-pipe-solver-consumer)\.spec\.js$/,
  /^\.github\/workflows\/w10-r2-certification\.yml$/,
]);

if (!successorMode) {
  changed.forEach((file) => {
    if (!allowed.some((rule) => rule.test(file))) errors.push(`Disallowed W10.R2 changed path: ${file}`);
  });
  if (changed.includes('package-lock.json')) errors.push('package-lock.json must not change in W10.R2.');
  addedJavaScript().forEach((file) => {
    const content = read(file);
    const lines = content.split(/\r?\n/).length - 1;
    if (lines >= 300) errors.push(`${file} has ${lines} lines; maximum is below 300.`);
    if (/export\s+default\b/.test(content)) errors.push(`${file} contains a default export.`);
    if (file.startsWith('src/') && /\b(?:Date\.now|new Date|Math\.random|randomUUID|crypto\.randomUUID|uuid)\b/i.test(content)) errors.push(`${file} contains nondeterministic identity logic.`);
  });
  productionFiles().forEach((file) => validatePcfImports(file));
} else {
  const protectedChanges = changed.filter((file) => /^src\/core\/pcf-intake\//.test(file) || /^src\/workspace\/pcf-consumer-/.test(file));
  protectedChanges.forEach((file) => errors.push(`Successor work changed W10.R2-owned PCF implementation path: ${file}`));
  allPcfProductionFiles().forEach((file) => validatePcfImports(file));
}

requireTokens('src/core/workspace-consumers/constants.js', [
  'workspace-consumer-registry/v5', 'workspace-consumer-registry/v6',
  'application-view-state/v5', 'application-view-state/v6', "PCF:'PCF'",
], 'Versioned consumer constants');
requireTokens('src/core/workspace-consumers/registry.js', [
  'createWorkspaceConsumerRegistryV5', 'createWorkspaceConsumerRegistryV6',
  'SOURCE_INTAKE_AND_EXPLICIT_WORKSPACE_ADOPTION_ONLY',
], 'Registry evolution');
requireTokens('src/core/workspace-consumers/view-state.js', [
  'createApplicationViewStateV5', 'createApplicationViewStateV6',
  'validateApplicationViewStateV5', 'validateApplicationViewStateV6',
], 'View-state evolution');
requireTokens('src/workspace/pcf-consumer-controller.js', [
  'DATASET_LOAD_REQUESTED', 'createPcfWorkspacePackage', 'PCF_STAGED_SOURCE_STALE',
], 'PCF adoption boundary');
requireTokens('src/workspace/workspace-layout.js', [
  'data-application-view="PCF"', 'data-role="pcf-consumer-root"',
], 'PCF layout');

const layout = read('src/workspace/workspace-layout.js');
assert.equal((layout.match(/data-webgl-host/g) || []).length, 1, 'W10.R2 must retain one viewport host.');
const packageJson = JSON.parse(read('package.json'));
const basePackage = JSON.parse(git(['show', `${scopeBase}:package.json`]));
assert.deepEqual(packageJson.dependencies, basePackage.dependencies, 'W10.R2 dependencies must remain unchanged.');
assert.deepEqual(packageJson.devDependencies, basePackage.devDependencies, 'W10.R2 devDependencies must remain unchanged.');

if (errors.length) {
  console.error(`W10.R2 source guard failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(` - ${error}`));
  process.exit(1);
}
console.log(`✅ W10.R2 source, ownership, version and dependency boundaries passed in ${successorMode ? 'successor' : 'implementation'} mode against ${scopeBase}.`);

function validatePcfImports(file) {
  const imports = importClauses(read(file));
  if (/from\s+['"][^'"]*(?:react|react-dom|zustand|App\.jsx|TopNav|DataTableTab)/i.test(imports)) errors.push(`${file} imports the forbidden legacy runtime.`);
  if (file.startsWith('src/core/pcf-intake/') && /from\s+['"][^'"]*workspace\//i.test(imports)) errors.push(`${file} imports Workspace code into the PCF core boundary.`);
}
function isAncestor(ancestor, descendant) {
  try { execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root, stdio: 'ignore' }); return true; }
  catch { return false; }
}
function resolveScopeBase() {
  try {
    execFileSync('git', ['fetch', '--no-tags', 'origin', 'main'], { cwd: root, stdio: 'ignore' });
    const mergeBase = gitLines(['merge-base', 'HEAD', 'origin/main'])[0];
    if (mergeBase) return mergeBase;
  } catch { /* fall through */ }
  ensureCommit(BASE_SHA);
  return BASE_SHA;
}
function addedJavaScript() { return changed.filter((file) => added.has(file) && /\.(?:js|mjs)$/.test(file)); }
function productionFiles() { return changed.filter((file) => file.startsWith('src/core/pcf-intake/') || /^src\/workspace\/pcf-consumer-/.test(file)); }
function allPcfProductionFiles() { return [...gitLines(['ls-files', 'src/core/pcf-intake']), ...gitLines(['ls-files', 'src/workspace/pcf-consumer-controller.js', 'src/workspace/pcf-consumer-view.js'])]; }
function importClauses(content) { return [...content.matchAll(/import[\s\S]*?from\s+['"][^'"]+['"]/g)].map((row) => row[0]).join('\n'); }
function requireTokens(file, tokens, label) { const content = read(file); tokens.forEach((token) => { if (!content.includes(token)) errors.push(`${label} token ${token} is missing.`); }); }
function ensureCommit(sha) { try { execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root, stdio: 'ignore' }); } catch { execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', sha], { cwd: root, stdio: 'ignore' }); } }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function gitLines(args) { return git(args).split(/\r?\n/).filter(Boolean); }
function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); }
