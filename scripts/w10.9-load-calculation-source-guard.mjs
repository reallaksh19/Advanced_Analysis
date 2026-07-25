import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE_SHA='3675de0e8903eaad0cce935a725f69ea65ed4c8e';
const root=process.cwd();
const ALLOWED=Object.freeze([
  /^src\/core\/load-calculation-consumer\//,
  /^src\/workspace\/load-calc-consumer-[^/]+\.js$/,
  /^scripts\/w10\.9-[^/]+\.mjs$/,
  /^e2e\/w10\.9-[^/]+\.spec\.js$/,
  /^docs\/load-calculation-consumer\//,
  /^src\/core\/workspace-consumers\/(?:constants|registry|view-state|event-contracts|index)\.js$/,
  /^src\/workspace\/(?:application-shell-controller|bootstrap|workspace-layout|event-topics)\.js$/,
  /^src\/workspace\/workspace\.css$/,
  /^package\.json$/,
  /^\.github\/workflows\/(?:u0-certification|release-candidate)\.yml$/,
  /^scripts\/(?:qa-check|u7-browser-qa-check|release-candidate-check)\.mjs$/,
]);
ensureBaseCommit();
const changed=gitLines(['diff','--name-only',BASE_SHA,'HEAD']);
const added=new Set(gitLines(['diff','--name-only','--diff-filter=A',BASE_SHA,'HEAD']));
const errors=[];
const checks=Object.freeze({paths:checkPaths,javascript:checkJavaScript,imports:checkImports,runtime:checkRuntime,dependencies:checkDependencies,contracts:checkContracts,integration:checkIntegration});
const selected=process.argv[2]||'all';
console.log(`\n--- W10.9 source guard · ${selected} ---\n`);
if(selected==='all')Object.entries(checks).filter(([name])=>name!=='paths').forEach(([,check])=>check());else if(checks[selected])checks[selected]();else throw new TypeError(`Unknown W10.9 source-guard check: ${selected}.`);
if(errors.length){console.error(`W10.9 source guard ${selected} failed with ${errors.length} error(s):`);errors.forEach((error)=>console.error(` - ${error}`));process.exit(1);}
console.log(`✅ W10.9 source guard ${selected} passed; later-mission paths are outside historical scope.`);

function checkPaths(){changed.forEach((file)=>{if(!ALLOWED.some((rule)=>rule.test(file)))errors.push(`Disallowed W10.9 changed path: ${file}`);});if(changed.includes('package-lock.json'))errors.push('package-lock.json must not change.');}
function checkJavaScript(){addedJavaScript().forEach((file)=>{const content=read(file),lines=content.split(/\r?\n/).length-1;if(lines>=300)errors.push(`${file} has ${lines} lines; maximum is below 300.`);if(/export\s+default\b/.test(content))errors.push(`${file} contains a default export.`);if(file.startsWith('src/')&&nondeterministic(content))errors.push(`${file} contains nondeterministic identity logic.`);});}
function checkImports(){productionFiles().forEach((file)=>{const content=read(file),imports=importClauses(content);if(/from\s+['"][^'"]*(?:react|zustand|calc-workspace|calc-extended|src\/reporting|\/reporting\/)/i.test(imports))errors.push(`${file} imports a forbidden legacy runtime.`);if(/\b(?:buildModelLoadFoundation|buildTributarySupportLoadScreening|runTributarySupportLoadScreening|solveVerticalBeamModel|runVerticalBeamSolution)\b/.test(imports))errors.push(`${file} imports a calculation engine.`);if(file.startsWith('src/core/load-calculation-consumer/')&&/from\s+['"][^'"]*workspace\//i.test(imports))errors.push(`${file} imports Workspace code into the core boundary.`);});}
function checkRuntime(){const controller=read('src/workspace/load-calc-consumer-controller.js');['MODEL_LOAD_EVENTS.REBUILD_REQUESTED','MODEL_LOAD_EVENTS.EXPORT_REQUESTED','SUPPORT_LOAD_SCREENING_EVENTS.REBUILD_PATHS_REQUESTED','SUPPORT_LOAD_SCREENING_EVENTS.RUN_REQUESTED','SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_REQUESTED'].forEach((token)=>requireToken(controller,token,'Load Calc action'));if(/analysis:started|verticalBeam:solveRequested|modelCalculation:createRequested/.test(controller))errors.push('Load Calc consumer contains a forbidden action topic.');if(/\.publish\([^)]*(?:CHANGED|COMPLETED|FAILED)/.test(controller))errors.push('Load Calc consumer must not publish completion or failure events.');}
function checkDependencies(){const current=JSON.parse(read('package.json')),previous=JSON.parse(git(['show',`${BASE_SHA}:package.json`]));assertSame(previous.dependencies,current.dependencies,'dependencies');assertSame(previous.devDependencies,current.devDependencies,'devDependencies');}
function checkContracts(){const constants=read('src/core/workspace-consumers/constants.js'),registry=read('src/core/workspace-consumers/registry.js'),views=read('src/core/workspace-consumers/view-state.js');['workspace-consumer-registry/v1','workspace-consumer-registry/v2','application-view-state/v1','application-view-state/v2'].forEach((token)=>{if(!`${constants}\n${registry}\n${views}`.includes(token))errors.push(`Versioned contract token ${token} is missing.`);});['createWorkspaceConsumerRegistry() { return canonicalRegistry(1); }','createWorkspaceConsumerRegistryV2() { return canonicalRegistry(2); }','createApplicationViewStateV2','validateApplicationViewStateV2'].forEach((token)=>{if(!`${registry}\n${views}`.includes(token))errors.push(`Version compatibility proof ${token} is missing.`);});}
function checkIntegration(){requireTokens('src/workspace/bootstrap.js',['getLoadCalculationReviewModel','getWorkspaceConsumerReadiness','listWorkspaceConsumers'],'Bootstrap API');requireTokens('src/workspace/workspace-layout.js',['data-application-view="LOAD_CALC"','data-role="load-calc-consumer-root"'],'Load Calc layout');requireTokens('src/workspace/application-shell-controller.js',['LoadCalcConsumerController','getLoadCalculationReviewModel'],'Current application shell');requireTokens('e2e/w10.9-load-calc-consumer.spec.js',['aria-disabled','ArrowLeft','ArrowRight','Home','End','getLoadCalculationReviewModel','modelLoad:rebuildRequested','supportLoadScreening:runRequested','AnalysisWorkspace.destroy()'],'Browser proof');}
function addedJavaScript(){return changed.filter((file)=>added.has(file)&&isW10NineOwned(file)&&/\.(?:js|mjs)$/.test(file));}
function isW10NineOwned(file){return file.startsWith('src/core/load-calculation-consumer/')||/^src\/workspace\/load-calc-consumer-/.test(file)||/^scripts\/w10\.9-/.test(file)||/^e2e\/w10\.9-/.test(file);}
function productionFiles(){return changed.filter((file)=>file.startsWith('src/core/load-calculation-consumer/')||/^src\/workspace\/load-calc-consumer-/.test(file));}
function nondeterministic(content){return /\b(?:Date\.now|new Date|Math\.random|randomUUID|crypto\.randomUUID|uuid)\b/i.test(content);}
function importClauses(content){return [...content.matchAll(/import[\s\S]*?from\s+['"][^'"]+['"]/g)].map((row)=>row[0]).join('\n');}
function requireTokens(file,tokens,label){const content=read(file);tokens.forEach((token)=>requireToken(content,token,label));}
function requireToken(content,token,label){if(!content.includes(token))errors.push(`${label} ${token} is missing.`);}
function assertSame(left,right,label){if(JSON.stringify(left||{})!==JSON.stringify(right||{}))errors.push(`package.json ${label} changed.`);}
function ensureBaseCommit(){try{execFileSync('git',['cat-file','-e',`${BASE_SHA}^{commit}`],{cwd:root,stdio:'ignore'});}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',BASE_SHA],{cwd:root,stdio:'ignore'});}}
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function gitLines(args){return git(args).split(/\r?\n/).filter(Boolean);}
function git(args){return execFileSync('git',args,{cwd:root,encoding:'utf8'});}
