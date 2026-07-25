import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE_SHA = 'ebe7fa526712ba945a1fa8e7fd7c6fe06c73c07a';
const W10_R3_MERGED_SHA = 'e88d58137a1614c437c175b167300416d05fd4ba';
const root = process.cwd();
const successorMode = isAncestor(W10_R3_MERGED_SHA, 'HEAD');
const scopeBase = successorMode ? W10_R3_MERGED_SHA : resolveScopeBase();
const changed = gitLines(['diff', '--name-only', scopeBase, 'HEAD']);
const added = new Set(gitLines(['diff', '--name-only', '--diff-filter=A', scopeBase, 'HEAD']));
const allowed = [
  /^src\/core\/settings-authority\//,
  /^src\/core\/workspace-consumers\/(?:constants|event-contracts|index|readiness|registry|view-state)\.js$/,
  /^src\/core\/workspace-home\/source\.js$/,
  /^src\/workspace\/(?:application-shell-controller|bootstrap|event-topics|model-calculation-controller|settings-controller|settings-persistence-adapter|settings-view|workspace-layout)\.js$/,
  /^scripts\/w10\.r3-[^/]+\.mjs$/,
  /^scripts\/w10\.r2-pcf-intake-source-guard\.mjs$/,
  /^scripts\/lafea\.2-source-guard\.mjs$/,
  /^e2e\/w10\.r3-[^/]+\.spec\.js$/,
  /^e2e\/w10\.(?:8-workspace-consumers|9-load-calc-consumer|10-three-d-calc-consumer|11-pipe-solver-consumer)\.spec\.js$/,
  /^docs\/main-tab-recovery\/W10\.R3_SETTINGS_AUTHORITY\.md$/,
  /^\.github\/workflows\/w10-r3-certification\.yml$/,
  /^package\.json$/,
];
const errors = [];

if (!successorMode) {
  changed.forEach((file) => { if (!allowed.some((rule) => rule.test(file))) errors.push(`Disallowed W10.R3 changed path: ${file}`); });
  if (changed.includes('package-lock.json')) errors.push('package-lock.json must not change in W10.R3.');
  addedJavaScript().forEach(validateAddedJavaScript);
} else {
  const protectedChanges = changed.filter((file) => file.startsWith('src/core/settings-authority/') || /^src\/workspace\/settings-/.test(file) || file === 'src/workspace/model-calculation-controller.js');
  protectedChanges.forEach((file) => errors.push(`Successor work changed W10.R3-owned Settings implementation path: ${file}`));
}

productionFiles().forEach((file) => {
  const content = read(file);
  const imports = importClauses(content);
  if (/from\s+['"][^'"]*(?:react|react-dom|zustand|SettingsTab|appStore)/i.test(imports)) errors.push(`${file} imports the forbidden legacy settings runtime.`);
  if (file.startsWith('src/core/settings-authority/') && /from\s+['"][^'"]*workspace\//i.test(imports)) errors.push(`${file} imports Workspace code into the settings core boundary.`);
});

for (const file of ['src/workspace/settings-view.js','src/workspace/settings-controller.js']) {
  if (/\.innerHTML\s*=/.test(read(file))) errors.push(`${file} assigns source-derived settings content through innerHTML.`);
}
if (/\b(?:localStorage|sessionStorage)\b/.test(read('src/core/settings-authority/authority.js'))) errors.push('Core settings authority must not read persistence directly.');
if (/\b(?:React|ReactDOM|useAppStore|zustand)\b/.test(read('src/workspace/bootstrap.js'))) errors.push('Shipped Workspace bootstrap references the legacy settings runtime.');

requireTokens('src/core/workspace-consumers/constants.js', ['workspace-consumer-registry/v6','workspace-consumer-registry/v7','application-view-state/v6','application-view-state/v7'], 'Versioned contracts');
requireTokens('src/core/workspace-consumers/registry.js', ['createWorkspaceConsumerRegistryV6','createWorkspaceConsumerRegistryV7','EXPLICIT_TRANSACTIONAL_SETTINGS_AUTHORITY_ONLY'], 'Registry evolution');
requireTokens('src/core/workspace-consumers/view-state.js', ['createApplicationViewStateV6','createApplicationViewStateV7','validateApplicationViewStateV7'], 'View-state evolution');
requireTokens('src/workspace/settings-controller.js', ['SETTINGS_EVENTS.CHANGED','SETTINGS_EVENTS.APPLY_FAILED','SettingsPersistenceAdapter'], 'Settings ownership');
requireTokens('src/core/settings-authority/constants.js', ['simplified-analysis:engineering-settings:v1'], 'Persistence key definition');
requireTokens('src/workspace/settings-persistence-adapter.js', ['ENGINEERING_SETTINGS_PERSISTENCE_KEY','REJECTED'], 'Persistence adapter boundary');
requireTokens('src/workspace/workspace-layout.js', ['data-application-view="SETTINGS"','data-role="settings-consumer-root"'], 'Settings layout');
requireTokens('src/workspace/bootstrap.js', ['getEngineeringSettingsProfile','getEngineeringSettingsAudit','getSettingsReviewModel'], 'Bounded public evidence');
requireTokens('src/workspace/model-calculation-controller.js', ['applyReportTimestampPolicy','settingsProfileProvider'], 'Verified Reports consumer');

const layout = read('src/workspace/workspace-layout.js');
assert.equal((layout.match(/data-webgl-host/g) || []).length, 1, 'W10.R3 must retain one viewport host.');
const packageJson = JSON.parse(read('package.json'));
const basePackage = JSON.parse(git(['show', `${scopeBase}:package.json`]));
assert.deepEqual(packageJson.dependencies, basePackage.dependencies, 'W10.R3 dependencies must remain unchanged.');
assert.deepEqual(packageJson.devDependencies, basePackage.devDependencies, 'W10.R3 devDependencies must remain unchanged.');

if (errors.length) {
  console.error(`W10.R3 source guard failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(` - ${error}`));
  process.exit(1);
}
console.log(`✅ W10.R3 source, ownership, runtime and dependency boundaries passed in ${successorMode ? 'successor' : 'implementation'} mode against ${scopeBase}.`);

function validateAddedJavaScript(file) {
  const content = read(file);
  const lines = content.split(/\r?\n/).length - 1;
  if (lines >= 300) errors.push(`${file} has ${lines} lines; maximum is below 300.`);
  if (/export\s+default\b/.test(content)) errors.push(`${file} contains a default export.`);
}
function isAncestor(ancestor, descendant) { try { execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root, stdio: 'ignore' }); return true; } catch { return false; } }
function resolveScopeBase() { try { fetchMainHistory(); return gitLines(['merge-base', 'HEAD', 'origin/main'])[0] || BASE_SHA; } catch { ensureCommit(BASE_SHA); return BASE_SHA; } }
function fetchMainHistory() { const shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true'; if (shallow) execFileSync('git', ['fetch', '--no-tags', '--unshallow', 'origin'], { cwd: root, stdio: 'ignore' }); execFileSync('git', ['fetch', '--no-tags', 'origin', 'main'], { cwd: root, stdio: 'ignore' }); }
function addedJavaScript() { return changed.filter((file) => added.has(file) && /\.(?:js|mjs)$/.test(file)); }
function productionFiles() { return successorMode ? [...gitLines(['ls-files', 'src/core/settings-authority']), ...gitLines(['ls-files', 'src/workspace/settings-controller.js', 'src/workspace/settings-persistence-adapter.js', 'src/workspace/settings-view.js', 'src/workspace/model-calculation-controller.js'])] : changed.filter((file) => file.startsWith('src/core/settings-authority/') || /^src\/workspace\/(?:settings-|bootstrap|application-shell-controller|model-calculation-controller)/.test(file)); }
function importClauses(content) { return [...content.matchAll(/import[\s\S]*?from\s+['"][^'"]+['"]/g)].map((row) => row[0]).join('\n'); }
function requireTokens(file, tokens, label) { const content = read(file); tokens.forEach((token) => { if (!content.includes(token)) errors.push(`${label} token ${token} is missing.`); }); }
function ensureCommit(sha) { try { execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root, stdio: 'ignore' }); } catch { execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', sha], { cwd: root, stdio: 'ignore' }); } }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function gitLines(args) { return git(args).split(/\r?\n/).filter(Boolean); }
function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); }
