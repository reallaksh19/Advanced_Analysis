import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const BASE_SHA='c49749f447880261eb2126b3dd6046faa67ce88f';
const W10_12_MERGED_SHA='1a64c89391ba0e4afead78de43e0ec7e82491a60';
const root=process.cwd();
ensureCommit(W10_12_MERGED_SHA);
const successorMode=read('src/core/workspace-consumers/constants.js').includes('workspace-consumer-registry/v10');
const scopeBase=successorMode?W10_12_MERGED_SHA:resolveScopeBase();
const changed=gitLines(['diff','--name-only',scopeBase,'HEAD']);
const added=new Set(gitLines(['diff','--name-only','--diff-filter=A',scopeBase,'HEAD']));
const errors=[];
const implementationAllowed=[
  /^src\/core\/qa-evidence\//,
  /^src\/core\/workspace-consumers\/(?:constants|event-contracts|index|readiness|registry|view-state)\.js$/,
  /^src\/workspace\/(?:application-shell-controller|bootstrap|event-topics|qa-evidence-controller|qa-evidence-view|workspace-layout)\.js$/,
  /^scripts\/w10\.12-[^/]+\.mjs$/,
  /^e2e\/w10\.12-[^/]+\.spec\.js$/,
  /^docs\/main-tab-recovery\/W10\.12_QA_EVIDENCE_CONSUMER\.md$/,
  /^\.github\/workflows\/w10-12-qa-evidence-certification\.yml$/,
  /^package\.json$/,
];
const successorQaAllowed=new Set(['src/core/qa-evidence/consumer-rows.js','src/core/qa-evidence/source.js','src/core/qa-evidence/validation.js']);
if(!successorMode){
  changed.forEach((file)=>{if(!implementationAllowed.some((rule)=>rule.test(file)))errors.push(`Disallowed W10.12 changed path: ${file}`);});
  for(const forbidden of ['package-lock.json','scripts/qa-check.mjs','.github/workflows/phase-u0-certification.yml','.github/workflows/release-candidate-certification.yml'])if(changed.includes(forbidden))errors.push(`${forbidden} must not change in W10.12.`);
  addedJavaScript().forEach(validateAddedJavaScript);
}else{
  changed.filter((file)=>file.startsWith('src/core/qa-evidence/')&&!successorQaAllowed.has(file)).forEach((file)=>errors.push(`Successor work changed protected W10.12 QA implementation path: ${file}`));
}
for(const file of productionFiles())validateProductionFile(file);
for(const file of coreFiles())validateCoreFile(file);
requireTokens('src/core/workspace-consumers/constants.js',['workspace-consumer-registry/v8','workspace-consumer-registry/v9','application-view-state/v8','application-view-state/v9'],'W10.12 closed predecessor contracts');
requireTokens('src/core/workspace-consumers/registry.js',['createWorkspaceConsumerRegistryV8','createWorkspaceConsumerRegistryV9','READ_ONLY_RUNTIME_EVIDENCE_ASSESSMENT_ONLY'],'W10.12 registry preservation');
requireTokens('src/core/workspace-consumers/view-state.js',['createApplicationViewStateV8','createApplicationViewStateV9','validateApplicationViewStateV9'],'W10.12 view-state preservation');
if(successorMode){
  requireTokens('src/core/workspace-consumers/constants.js',['workspace-consumer-registry/v10','application-view-state/v10'],'Successor contracts');
  requireTokens('src/core/workspace-consumers/registry.js',['createWorkspaceConsumerRegistryV10'],'Successor registry');
  requireTokens('src/workspace/application-shell-controller.js',['QaEvidenceController','createWorkspaceConsumerRegistryV10','getQaEvidenceSource','getQaReviewModel','qa-consumer-root'],'QA successor ownership and runtime root');
}else{
  requireTokens('src/workspace/application-shell-controller.js',['QaEvidenceController','createWorkspaceConsumerRegistryV9','getQaEvidenceSource','getQaReviewModel','qa-consumer-root'],'QA ownership and runtime root');
}
requireTokens('src/workspace/workspace-layout.js',['data-application-view="QA"'],'QA application view');
requireTokens('src/workspace/bootstrap.js',['getQaEvidenceSource','getQaReviewModel'],'Bounded public API');
requireTokens('src/core/qa-evidence/contract-rows.js',['validateConsumerContract','contractDatasetId','contractLinkError'],'Official validator reuse');
const layout=read('src/workspace/workspace-layout.js');
assert.equal((layout.match(/data-webgl-host/g)||[]).length,1,'W10.12 must retain exactly one viewport host.');
const packageJson=JSON.parse(read('package.json'));
const basePackage=JSON.parse(git(['show',`${scopeBase}:package.json`]));
assert.deepEqual(packageJson.dependencies,basePackage.dependencies,'W10.12 dependencies must remain unchanged.');
assert.deepEqual(packageJson.devDependencies,basePackage.devDependencies,'W10.12 devDependencies must remain unchanged.');
if(errors.length){console.error(`W10.12 source guard failed with ${errors.length} error(s):`);errors.forEach((error)=>console.error(` - ${error}`));process.exit(1);}
console.log(`✅ W10.12 source, ownership, runtime and dependency boundaries passed in ${successorMode?'successor':'implementation'} mode against ${scopeBase}.`);

function validateAddedJavaScript(file){const content=read(file),lines=content.split(/\r?\n/).length-1;if(lines>=300)errors.push(`${file} has ${lines} lines; maximum is below 300.`);if(/export\s+default\b/.test(content))errors.push(`${file} contains a default export.`);if(file.startsWith('src/'))validateFunctionSizes(file,content);}
function validateProductionFile(file){if(!fs.existsSync(path.join(root,file)))return;const content=read(file),imports=importClauses(content);if(/from\s+['"][^'"]*(?:react|react-dom|zustand|BenchmarksValidationTab|engineeringMockCatalog|src\/mocks|\/mocks\/)/i.test(imports))errors.push(`${file} imports a forbidden QA legacy or mock authority.`);if(/\b(?:Math\.random|Date\.now|performance\.now|new Date|randomUUID|crypto\.randomUUID)\b/.test(content))errors.push(`${file} contains nondeterministic identity logic.`);if(/\b(?:setInterval|setTimeout|requestAnimationFrame)\s*\(/.test(content))errors.push(`${file} contains timers or polling.`);if(/\.innerHTML\s*=/.test(content))errors.push(`${file} assigns source-derived content through innerHTML.`);if(/\b(?:npm|playwright|github actions|child_process|node:fs|node:path)\b/i.test(content))errors.push(`${file} references repository execution or Node runtime authority.`);}
function validateCoreFile(file){if(!fs.existsSync(path.join(root,file)))return;const content=read(file),imports=importClauses(content);if(/from\s+['"][^'"]*(?:workspace\/|components\/|store\/|mocks\/|react|zustand)/i.test(imports))errors.push(`${file} violates the framework-independent QA core boundary.`);if(/\b(?:window|document|localStorage|sessionStorage|Blob|URL)\b/.test(content))errors.push(`${file} references browser APIs.`);}
function resolveScopeBase(){try{execFileSync('git',['fetch','--no-tags','origin','main'],{cwd:root,stdio:'ignore'});return gitLines(['merge-base','HEAD','origin/main'])[0]||BASE_SHA;}catch{ensureCommit(BASE_SHA);return BASE_SHA;}}
function validateFunctionSizes(file,content){let ast;try{ast=parse(content,{sourceType:'module',plugins:['jsx']});}catch(error){errors.push(`${file} cannot be parsed for function-size review: ${error.message}`);return;}visit(ast,(node)=>{if(!['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ClassMethod','ObjectMethod'].includes(node.type))return;const lines=(node.loc?.end?.line||0)-(node.loc?.start?.line||0)+1;if(lines>45)errors.push(`${file} contains a ${lines}-line function; maximum practical allowance is 45.`);});}
function visit(node,callback){if(!node||typeof node!=='object')return;callback(node);Object.values(node).forEach((value)=>{if(Array.isArray(value))value.forEach((child)=>visit(child,callback));else if(value&&typeof value==='object'&&typeof value.type==='string')visit(value,callback);});}
function addedJavaScript(){return changed.filter((file)=>added.has(file)&&/\.(?:js|mjs)$/.test(file));}
function productionFiles(){return changed.filter((file)=>file.startsWith('src/core/qa-evidence/')||/^src\/workspace\/qa-evidence-/.test(file));}
function coreFiles(){return changed.filter((file)=>file.startsWith('src/core/qa-evidence/'));}
function importClauses(content){return[...content.matchAll(/import[\s\S]*?from\s+['"][^'"]+['"]/g)].map((row)=>row[0]).join('\n');}
function requireTokens(file,tokens,label){const content=read(file);tokens.forEach((token)=>{if(!content.includes(token))errors.push(`${label} token ${token} is missing.`);});}
function ensureCommit(sha){try{execFileSync('git',['cat-file','-e',`${sha}^{commit}`],{cwd:root,stdio:'ignore'});}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',sha],{cwd:root,stdio:'ignore'});}}
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function gitLines(args){return git(args).split(/\r?\n/).filter(Boolean);}
function git(args){return execFileSync('git',args,{cwd:root,encoding:'utf8'});}
