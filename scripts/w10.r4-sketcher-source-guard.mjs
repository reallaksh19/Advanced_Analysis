import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const AUTHORIZED_BASE = 'e88d58137a1614c437c175b167300416d05fd4ba';
const root = process.cwd();
const scopeBase = resolveScopeBase();
const changed = gitLines(['diff','--name-only',scopeBase,'HEAD']);
const added = new Set(gitLines(['diff','--name-only','--diff-filter=A',scopeBase,'HEAD']));
const errors = [];
const allowed = [
  /^src\/core\/sketcher-draft\//,
  /^src\/core\/workspace-consumers\/(?:constants|event-contracts|index|readiness|registry|view-state)\.js$/,
  /^src\/workspace\/(?:application-shell-controller|bootstrap|event-topics|sketcher-controller|sketcher-view|sketcher-workspace-adapter|workspace-layout)\.js$/,
  /^scripts\/w10\.r4-[^/]+\.mjs$/,
  /^scripts\/w10\.r3-settings-source-guard\.mjs$/,
  /^e2e\/w10\.r4-[^/]+\.spec\.js$/,
  /^docs\/main-tab-recovery\/W10\.R4_SKETCHER_RECOVERY\.md$/,
  /^\.github\/workflows\/w10-r4-certification\.yml$/,
  /^package\.json$/,
];

changed.forEach((file) => { if (!allowed.some((rule) => rule.test(file))) errors.push(`Disallowed W10.R4 changed path: ${file}`); });
if (changed.includes('package-lock.json')) errors.push('package-lock.json must not change in W10.R4.');
addedJavaScript().forEach(validateAddedJavaScript);
sketcherProductionFiles().forEach(validateSketcherProduction);

const layout = read('src/workspace/workspace-layout.js');
assert.equal((layout.match(/data-webgl-host/g) || []).length, 1, 'W10.R4 must retain exactly one data-webgl-host.');
if (!layout.includes('data-role="sketcher-consumer-root"')) errors.push('Sketcher layout root is missing.');
if (/<canvas\b/i.test(layout)) errors.push('W10.R4 layout creates a second canvas.');
const sketcherRuntime = sketcherProductionFiles().map(read).join('\n');
if (/createElement(?:NS)?\s*\(\s*['"]canvas['"]/i.test(sketcherRuntime) || /WebGLRenderer|data-webgl-host/.test(sketcherRuntime)) errors.push('Sketcher runtime creates a canvas or WebGL host.');
if (/\bWorkspaceState\b/.test(sketcherRuntime)) errors.push('Sketcher runtime mutates or imports WorkspaceState directly.');

requireTokens('src/core/workspace-consumers/constants.js', ['workspace-consumer-registry/v7','workspace-consumer-registry/v8','application-view-state/v7','application-view-state/v8'], 'Versioned contract evolution');
requireTokens('src/core/workspace-consumers/registry.js', ['createWorkspaceConsumerRegistryV7','createWorkspaceConsumerRegistryV8','DRAFT_GEOMETRY_AND_EXPLICIT_WORKSPACE_ADOPTION_ONLY'], 'Registry evolution');
requireTokens('src/core/workspace-consumers/view-state.js', ['createApplicationViewStateV7','createApplicationViewStateV8','validateApplicationViewStateV8'], 'View-state evolution');
requireTokens('src/workspace/sketcher-controller.js', ['DATASET_LOAD_REQUESTED','qualifySketcherWorkspaceAdoption','SketcherDraftAuthority'], 'Sketcher ownership and adoption boundary');
requireTokens('src/workspace/bootstrap.js', ['getSketcherDraftDocument','getSketcherDraftAudit','getSketcherReviewModel','getSketcherWorkspaceAdoption'], 'Read-only Sketcher public evidence');
requireTokens('scripts/w10.r3-settings-source-guard.mjs', ['successorMode','W10_R3_MERGED_SHA'], 'W10.R3 successor compatibility');

const packageJson = JSON.parse(read('package.json'));
const basePackage = JSON.parse(git(['show',`${scopeBase}:package.json`]));
assert.deepEqual(packageJson.dependencies, basePackage.dependencies, 'W10.R4 dependencies must remain unchanged.');
assert.deepEqual(packageJson.devDependencies, basePackage.devDependencies, 'W10.R4 devDependencies must remain unchanged.');

if (errors.length) {
  console.error(`W10.R4 source guard failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(` - ${error}`));
  process.exit(1);
}
console.log(`✅ W10.R4 source, ownership, runtime, size, dependency and scope boundaries passed for ${changed.length} changed file(s) against ${scopeBase}.`);

function validateAddedJavaScript(file) {
  const content = read(file), lines = content.split(/\r?\n/).length - 1;
  if (lines >= 300) errors.push(`${file} has ${lines} lines; maximum is below 300.`);
  if (/export\s+default\b/.test(content)) errors.push(`${file} contains a default export.`);
  try { validateFunctionSpans(file, content); } catch (error) { errors.push(`${file} could not be parsed for function-size evidence: ${error.message}`); }
}
function validateFunctionSpans(file, content) {
  const ast = parse(content, { sourceType:'module', plugins:['classPrivateMethods','classPrivateProperties'] });
  walk(ast, (node) => {
    if (!['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ObjectMethod','ClassMethod','ClassPrivateMethod'].includes(node.type)) return;
    const span = node.loc.end.line - node.loc.start.line + 1;
    if (span > 45) errors.push(`${file} contains a ${span}-line function; W10.R4 maximum is 45 lines.`);
  });
}
function validateSketcherProduction(file) {
  const content = read(file), imports = importClauses(content);
  if (/from\s+['"][^'"]*(?:react|react-dom|zustand|@react-three\/fiber|@react-three\/drei|three|SketcherStore|SketcherTab|appStore|useAnalysisStore)/i.test(imports)) errors.push(`${file} imports a forbidden legacy Sketcher runtime.`);
  if (file.startsWith('src/core/sketcher-draft/') && /from\s+['"][^'"]*(?:workspace|components|store|sketcher)\//i.test(imports)) errors.push(`${file} imports outside the framework-neutral Sketcher core boundary.`);
  if (/\b(?:Date\.now|new Date|performance\.now|Math\.random|randomUUID|crypto\.randomUUID)\b/.test(content)) errors.push(`${file} contains a forbidden nondeterministic API.`);
  if (/\.innerHTML\s*=/.test(content)) errors.push(`${file} assigns content through innerHTML.`);
}
function resolveScopeBase() { try { fetchMainHistory(); const base=gitLines(['merge-base','HEAD','origin/main'])[0]; if(base)return base; } catch { /* fall through */ } ensureCommit(AUTHORIZED_BASE); return AUTHORIZED_BASE; }
function fetchMainHistory() { const shallow=git(['rev-parse','--is-shallow-repository']).trim()==='true'; if(shallow)execFileSync('git',['fetch','--no-tags','--unshallow','origin'],{cwd:root,stdio:'ignore'}); execFileSync('git',['fetch','--no-tags','origin','main'],{cwd:root,stdio:'ignore'}); }
function ensureCommit(sha) { try { execFileSync('git',['cat-file','-e',`${sha}^{commit}`],{cwd:root,stdio:'ignore'}); } catch { execFileSync('git',['fetch','--no-tags','--depth=1','origin',sha],{cwd:root,stdio:'ignore'}); } }
function addedJavaScript() { return changed.filter((file) => added.has(file) && /\.(?:js|mjs)$/.test(file)); }
function sketcherProductionFiles() { return changed.filter((file) => file.startsWith('src/core/sketcher-draft/') || /^src\/workspace\/sketcher-/.test(file)); }
function importClauses(content) { return [...content.matchAll(/import[\s\S]*?from\s+['"][^'"]+['"]/g)].map((row) => row[0]).join('\n'); }
function requireTokens(file,tokens,label){const content=read(file);tokens.forEach((token)=>{if(!content.includes(token))errors.push(`${label} token ${token} is missing.`);});}
function walk(value, visit) { if (!value || typeof value !== 'object') return; if (typeof value.type === 'string') visit(value); Object.values(value).forEach((child) => { if (Array.isArray(child)) child.forEach((row) => walk(row, visit)); else walk(child, visit); }); }
function read(file) { return fs.readFileSync(path.join(root,file),'utf8'); }
function gitLines(args) { return git(args).split(/\r?\n/).filter(Boolean); }
function git(args) { return execFileSync('git',args,{cwd:root,encoding:'utf8'}); }
