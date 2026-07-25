import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE_SHA = 'c13c7cdaa313fe5ef7cb78a527be69b602210f20';
const root = process.cwd();
const ALLOWED = Object.freeze([
  /^src\/core\/workspace-consumers\//,
  /^src\/workspace\/(?:application-shell|workspace-consumer|reports-consumer)-[^/]+\.js$/,
  /^scripts\/w10\.8-[^/]+\.mjs$/, /^e2e\/w10\.8-[^/]+\.spec\.js$/,
  /^docs\/workspace-consumers\//, /^src\/workspace\/(?:bootstrap|workspace-layout|event-topics)\.js$/,
  /^src\/workspace\/workspace\.css$/, /^package\.json$/,
  /^\.github\/workflows\/(?:u0-certification|release-candidate)\.yml$/,
  /^scripts\/(?:qa-check|u7-browser-qa-check|release-candidate-check)\.mjs$/,
]);
ensureBaseCommit();
const changed = gitLines(['diff','--name-only',BASE_SHA,'HEAD']);
const added = new Set(gitLines(['diff','--name-only','--diff-filter=A',BASE_SHA,'HEAD']));
const errors = [];
const checks = Object.freeze({ paths:checkChangedPaths, javascript:checkJavaScriptStandards, imports:checkImportBoundaries, runtime:checkProductionBoundaries, dependencies:checkDependencies, integration:checkRequiredIntegration });
const selected = process.argv[2] || 'all';
console.log(`\n--- W10.8 source guard · ${selected} ---\n`);
if (selected === 'all') Object.values(checks).forEach((check)=>check()); else if (checks[selected]) checks[selected](); else throw new TypeError(`Unknown W10.8 source-guard check: ${selected}.`);
if (errors.length) { console.error(`W10.8 source guard ${selected} failed with ${errors.length} error(s):`); errors.forEach((error)=>console.error(` - ${error}`)); process.exit(1); }
console.log(`✅ W10.8 source guard ${selected} passed for ${changed.length} changed file(s).`);

function checkChangedPaths() { changed.forEach((file)=>{ if(!ALLOWED.some((rule)=>rule.test(file))) errors.push(`Disallowed W10.8 changed path: ${file}`); if(file==='package-lock.json') errors.push('package-lock.json must not change.'); }); }
function checkJavaScriptStandards() {
  addedJavaScript().forEach((file)=>{
    const content=read(file), lines=content.split(/\r?\n/).length-1;
    if(lines>=300) errors.push(`${file} has ${lines} lines; maximum is below 300.`);
    if(/export\s+default\b/.test(content)) errors.push(`${file} contains a default export.`);
    if(file.startsWith('src/')&&hasNondeterministicIdentity(content)) errors.push(`${file} contains nondeterministic identity logic.`);
  });
}
function checkImportBoundaries() {
  addedJavaScript().forEach((file)=>{
    const content=read(file);
    if(forbiddenRuntimeImport(content)) errors.push(`${file} imports a forbidden runtime or reporting path.`);
    if(forbiddenExecutionImport(content)) errors.push(`${file} imports solver or screening execution.`);
    if(coreImportsWorkspace(file,content)) errors.push(`${file} imports Workspace code into the core contract boundary.`);
  });
}
function checkProductionBoundaries() {
  productionFiles().forEach((file)=>{
    const content=read(file);
    if(/\b(?:analysis:started|supportLoadScreening:runRequested|verticalBeam:solveRequested)\b/.test(content)) errors.push(`${file} emits a forbidden calculation event.`);
    if(/\b(?:CREATE_REQUESTED|RUN_REQUESTED|SOLVE_REQUESTED)\b/.test(content)) errors.push(`${file} invokes automatic calculation or package creation.`);
  });
}
function checkDependencies() {
  const current=JSON.parse(read('package.json')), previous=JSON.parse(git(['show',`${BASE_SHA}:package.json`]));
  assertSame(previous.dependencies,current.dependencies,'dependencies'); assertSame(previous.devDependencies,current.devDependencies,'devDependencies');
}
function checkRequiredIntegration() {
  requireTokens('src/workspace/bootstrap.js',['getWorkspaceConsumerContext','listWorkspaceConsumers','getWorkspaceConsumerReadiness','getApplicationViewState','activateApplicationView'],'Bootstrap API');
  requireTokens('src/workspace/workspace-layout.js',['data-application-view="WORKSPACE"','data-application-view="REPORTS"','data-role="application-navigation"'],'Application shell token');
  requireTokens('src/workspace/event-topics.js',['APPLICATION_EVENTS','applicationView:changeRequested','applicationView:changed','applicationView:changeFailed','workspaceConsumerContext:changed','validateApplicationViewChangeRequested','validateWorkspaceConsumerContextChanged'],'Authoritative event contract');
  ['src/workspace/application-shell-controller.js','src/workspace/workspace-consumer-controller.js','src/workspace/reports-consumer-controller.js'].forEach((file)=>{
    const content=read(file);
    if(!content.includes("from './event-topics.js'")) errors.push(`${file} does not import the authoritative event namespace.`);
    if(/const\s+(?:APPLICATION_SHELL_EVENTS|WORKSPACE_CONSUMER_EVENTS)\s*=/.test(content)) errors.push(`${file} duplicates W10.8 event names.`);
  });
  requireTokens('e2e/w10.8-workspace-consumers.spec.js',['aria-disabled','applicationView:changeFailed','ArrowLeft','ArrowRight','Home','End','AnalysisWorkspace.destroy()'],'Accessibility and lifecycle evidence');
}
function addedJavaScript() { return changed.filter((file)=>added.has(file)&&/\.(?:js|mjs)$/.test(file)); }
function productionFiles() { return changed.filter((file)=>file.startsWith('src/core/workspace-consumers/')||/^src\/workspace\/(?:application-shell|workspace-consumer|reports-consumer)-/.test(file)); }
function hasNondeterministicIdentity(content) { return /\b(?:Date\.now|new Date|Math\.random|randomUUID|crypto\.randomUUID|uuid)\b/i.test(content); }
function forbiddenRuntimeImport(content) { return /from\s+['"][^'"]*(?:react|zustand|src\/reporting|\/reporting\/|components\/|store\/appStore)/i.test(content); }
function forbiddenExecutionImport(content) { return /\b(?:solveVerticalBeamModel|runVerticalBeamSolution|runTributarySupportLoadScreening|buildTributarySupportLoadScreening)\b/.test(importClauses(content)); }
function coreImportsWorkspace(file,content) { return file.startsWith('src/core/workspace-consumers/')&&/from\s+['"][^'"]*workspace\//i.test(content); }
function requireTokens(file,tokens,label) { const content=read(file); tokens.forEach((token)=>{ if(!content.includes(token)) errors.push(`${label} ${token} is missing.`); }); }
function assertSame(left,right,label) { if(JSON.stringify(left||{})!==JSON.stringify(right||{})) errors.push(`package.json ${label} changed.`); }
function ensureBaseCommit() { try{execFileSync('git',['cat-file','-e',`${BASE_SHA}^{commit}`],{cwd:root,stdio:'ignore'});}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',BASE_SHA],{cwd:root,stdio:'ignore'});} }
function importClauses(content) { return [...content.matchAll(/import[\s\S]*?from\s+['"][^'"]+['"]/g)].map((row)=>row[0]).join('\n'); }
function read(file) { return fs.readFileSync(path.join(root,file),'utf8'); }
function gitLines(args) { return git(args).split(/\r?\n/).filter(Boolean); }
function git(args) { return execFileSync('git',args,{cwd:root,encoding:'utf8'}); }
