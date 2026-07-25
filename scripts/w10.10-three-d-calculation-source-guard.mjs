import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE_SHA='d5116e48af0d5a2830aeda43e8abfd5cbeadb135';
const root=process.cwd();
const ALLOWED=Object.freeze([
  /^src\/core\/three-d-calculation-consumer\//,
  /^src\/workspace\/three-d-calc-consumer-[^/]+\.js$/,
  /^scripts\/w10\.10-[^/]+\.mjs$/,
  /^e2e\/w10\.10-[^/]+\.spec\.js$/,
  /^docs\/three-d-calculation-consumer\//,
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
console.log(`\n--- W10.10 source guard · ${selected} ---\n`);
if(selected==='all')Object.entries(checks).filter(([name])=>name!=='paths').forEach(([,check])=>check());else if(checks[selected])checks[selected]();else throw new TypeError(`Unknown W10.10 source-guard check: ${selected}.`);
if(errors.length){console.error(`W10.10 source guard ${selected} failed with ${errors.length} error(s):`);errors.forEach((error)=>console.error(` - ${error}`));process.exit(1);}
console.log(`✅ W10.10 source guard ${selected} passed; later-mission paths are outside historical scope.`);

function checkPaths(){changed.forEach((file)=>{if(!ALLOWED.some((rule)=>rule.test(file)))errors.push(`Disallowed W10.10 changed path: ${file}`);});if(changed.includes('package-lock.json'))errors.push('package-lock.json must not change.');}
function checkJavaScript(){addedJavaScript().forEach((file)=>{const content=read(file),lines=content.split(/\r?\n/).length-1;if(lines>=300)errors.push(`${file} has ${lines} lines; maximum is below 300.`);if(/export\s+default\b/.test(content))errors.push(`${file} contains a default export.`);if(file.startsWith('src/')&&nondeterministic(content))errors.push(`${file} contains nondeterministic identity logic.`);functionSpans(content).filter((span)=>span.lines>40).forEach((span)=>errors.push(`${file} function ${span.name} has ${span.lines} lines.`));});}
function checkImports(){productionFiles().forEach((file)=>{const imports=importClauses(read(file));if(/from\s+['"][^'"]*(?:react|zustand|3d-analysis|vertical-beam-solver|calc-workspace|src\/solvers|core\/solvers|\/solvers\/|three\.module|threejs|three)['"]/i.test(imports))errors.push(`${file} imports a forbidden runtime, solver or renderer.`);if(/\b(?:solveVerticalBeamModel|runVerticalBeamSolution|buildVerticalBeamModel|buildModelLoadFoundation|runTributarySupportLoadScreening)\b/.test(imports))errors.push(`${file} imports a calculation function.`);if(file.startsWith('src/core/three-d-calculation-consumer/')&&/from\s+['"][^'"]*workspace\//i.test(imports))errors.push(`${file} imports Workspace code into the core boundary.`);});}
function checkRuntime(){const controller=read('src/workspace/three-d-calc-consumer-controller.js');['SHARED_MODEL_EVENTS.EXPORT_REQUESTED','TOPOLOGY_EVENTS.REBUILD_EXACT_REQUESTED','TOPOLOGY_EVENTS.EXPORT_REQUESTED','SUPPORT_RESTRAINT_EVENTS.REBUILD_EVIDENCE_REQUESTED','SUPPORT_RESTRAINT_EVENTS.EXPORT_REQUESTED','VERTICAL_BEAM_EVENTS.REBUILD_REQUESTED','VERTICAL_BEAM_EVENTS.SOLVE_REQUESTED','VERTICAL_BEAM_EVENTS.EXPORT_REQUESTED'].forEach((token)=>requireToken(controller,token,'3D Calc action'));if(/REBUILD_TOLERANCE|REBUILD_PROJECTION|analysis:started|viewport|selection/i.test(controller))errors.push('3D Calc consumer contains a forbidden action boundary.');if(/\.publish\([^)]*(?:CHANGED|COMPLETED|FAILED)/.test(controller))errors.push('3D Calc consumer must not publish completion or failure events.');}
function checkDependencies(){const current=JSON.parse(read('package.json')),previous=JSON.parse(git(['show',`${BASE_SHA}:package.json`]));assertSame(previous.dependencies,current.dependencies,'dependencies');assertSame(previous.devDependencies,current.devDependencies,'devDependencies');}
function checkContracts(){const constants=read('src/core/workspace-consumers/constants.js'),registry=read('src/core/workspace-consumers/registry.js'),views=read('src/core/workspace-consumers/view-state.js');['workspace-consumer-registry/v1','workspace-consumer-registry/v2','workspace-consumer-registry/v3','application-view-state/v1','application-view-state/v2','application-view-state/v3'].forEach((token)=>{if(!`${constants}\n${registry}\n${views}`.includes(token))errors.push(`Versioned contract token ${token} is missing.`);});['createWorkspaceConsumerRegistryV3','validateWorkspaceConsumerRegistryV3','createApplicationViewStateV3','validateApplicationViewStateV3'].forEach((token)=>requireToken(`${registry}\n${views}`,token,'Version v3 proof'));}
function checkIntegration(){requireTokens('src/workspace/bootstrap.js',['getThreeDCalculationReviewModel','getLoadCalculationReviewModel'],'Bootstrap API');requireTokens('src/workspace/workspace-layout.js',['data-application-view="THREE_D_CALC"','data-role="three-d-calc-consumer-root"'],'3D Calc layout');requireTokens('src/workspace/application-shell-controller.js',['ThreeDCalcConsumerController','getThreeDCalculationReviewModel'],'Current application shell');requireTokens('e2e/w10.10-three-d-calc-consumer.spec.js',['aria-disabled','ArrowLeft','ArrowRight','Home','End','getThreeDCalculationReviewModel','verticalBeam:solveRequested','AnalysisWorkspace.destroy()'],'Browser proof');}
function addedJavaScript(){return changed.filter((file)=>added.has(file)&&isW10TenOwned(file)&&/\.(?:js|mjs)$/.test(file));}
function isW10TenOwned(file){return file.startsWith('src/core/three-d-calculation-consumer/')||/^src\/workspace\/three-d-calc-consumer-/.test(file)||/^scripts\/w10\.10-/.test(file)||/^e2e\/w10\.10-/.test(file);}
function productionFiles(){return changed.filter((file)=>file.startsWith('src/core/three-d-calculation-consumer/')||/^src\/workspace\/three-d-calc-consumer-/.test(file));}
function nondeterministic(content){return /\b(?:Date\.now|new Date|Math\.random|randomUUID|crypto\.randomUUID|uuid)\b/i.test(content);}
function importClauses(content){return [...content.matchAll(/import[\s\S]*?from\s+['"][^'"]+['"]/g)].map((row)=>row[0]).join('\n');}
function functionSpans(content){const lines=content.split(/\r?\n/),rows=[];for(let index=0;index<lines.length;index+=1){const match=lines[index].match(/^\s*(?:export\s+)?function\s+(\w+)\s*\(/);if(!match)continue;let depth=0,end=index;for(;end<lines.length;end+=1){depth+=(lines[end].match(/{/g)||[]).length;depth-=(lines[end].match(/}/g)||[]).length;if(depth===0&&end>index)break;}rows.push({name:match[1],lines:end-index+1});}return rows;}
function requireTokens(file,tokens,label){const content=read(file);tokens.forEach((token)=>requireToken(content,token,label));}
function requireToken(content,token,label){if(!content.includes(token))errors.push(`${label} ${token} is missing.`);}
function assertSame(left,right,label){if(JSON.stringify(left||{})!==JSON.stringify(right||{}))errors.push(`package.json ${label} changed.`);}
function ensureBaseCommit(){try{execFileSync('git',['cat-file','-e',`${BASE_SHA}^{commit}`],{cwd:root,stdio:'ignore'});}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',BASE_SHA],{cwd:root,stdio:'ignore'});}}
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function gitLines(args){return git(args).split(/\r?\n/).filter(Boolean);}
function git(args){return execFileSync('git',args,{cwd:root,encoding:'utf8'});}
