import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const BASE_SHA='b382a6f771d24adf33a31bcd62448a20973e58f0';
const root=process.cwd();
const ALLOWED=Object.freeze([
  /^src\/core\/element-fea\/(?:convergence-study|mesh-metrics|physical-probes|stress-projection|stress-trend|interpretation-result|interpretation-constants)\.js$/,
  /^src\/core\/element-fea\/index\.js$/,
  /^scripts\/lfea-003-[^/]+\.mjs$/,
  /^docs\/element-fea\/LFEA-003_IMPLEMENTATION\.md$/,
  /^\.github\/workflows\/lfea-003-certification\.yml$/,
]);
ensureBaseCommit();
const changed=gitLines(['diff','--name-only',BASE_SHA,'HEAD']);
const errors=[];
changed.forEach((file)=>{if(!ALLOWED.some((rule)=>rule.test(file)))errors.push(`Disallowed LFEA-003 changed path: ${file}`);});
changed.filter((file)=>/\.(?:js|mjs)$/.test(file)).forEach(validateJavaScript);
validateProductionImports();
validateContracts();
validateWorkflow();
assert.equal(changed.some((file)=>file.includes('w10.11')||/application-shell|workspace-consumers|view-state|registry/.test(file)),false,'LFEA-003 must not modify W10.11 or application-shell authority.');
if(errors.length){errors.forEach((error)=>console.error(` - ${error}`));process.exit(1);}
console.log(`LFEA-003 source guard passed for ${changed.length} changed file(s).`);

function validateJavaScript(file){
  const content=fs.readFileSync(path.join(root,file),'utf8');const lines=content.split(/\r?\n/).length-1;
  if(lines>=300)errors.push(`${file} has ${lines} lines; maximum is below 300.`);
  if(/export\s+default\b/.test(content))errors.push(`${file} contains a default export.`);
  if(file.startsWith('src/')&&/\b(?:Date\.now|new Date|Math\.random|randomUUID|crypto\.randomUUID|uuid)\b/.test(content))errors.push(`${file} contains nondeterministic identity logic.`);
  functionSpans(content).filter((span)=>span.lines>40).forEach((span)=>errors.push(`${file} function ${span.name} has ${span.lines} lines.`));
}
function validateProductionImports(){
  changed.filter((file)=>file.startsWith('src/core/element-fea/')).forEach((file)=>{
    const imports=[...fs.readFileSync(path.join(root,file),'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((row)=>row[1]);
    imports.forEach((specifier)=>{const shared=specifier==='../shared-piping-model/immutable.js'||specifier==='../shared-piping-model/canonical-json.js';if(!specifier.startsWith('./')&&!shared)errors.push(`${file} imports unauthorized authority: ${specifier}`);});
  });
}
function validateContracts(){
  requireTokens('src/core/element-fea/interpretation-constants.js',['fea-convergence-study/v1','fea-convergence-result/v1','fea-stress-projection/v1','NON_AUTHORITATIVE_REVIEW_PROJECTION']);
  requireTokens('src/core/element-fea/interpretation-result.js',["projectedStressForConvergence: 'PROHIBITED'","singularityProof: 'PROHIBITED'","gridConvergenceIndex: 'NOT_IMPLEMENTED'"]);
  requireTokens('src/core/element-fea/stress-projection.js',['Q4_GAUSS_TO_CORNER_MATRIX','contributorSpread','sourceIntegrationPointIds']);
  requireTokens('src/core/element-fea/convergence-study.js',['Characteristic mesh size must be strictly decreasing','Projected or non-authoritative stress cannot be used']);
}
function validateWorkflow(){
  const content=read('.github/workflows/lfea-003-certification.yml');
  requireText(content,'ref: ${{ github.event.pull_request.head.sha || github.sha }}','exact authorized-head checkout');
  ['lfea-001-contract-check.mjs','lfea-001-numerical-check.mjs','lfea-001-failure-check.mjs','lfea-001-determinism-check.mjs','lfea-002-contract-check.mjs','lfea-002-numerical-check.mjs','lfea-002-failure-check.mjs','lfea-002-determinism-check.mjs','node scripts/lfea-003-check.mjs','node scripts/lfea-003-source-guard.mjs'].forEach((token)=>requireText(content,token,'workflow evidence'));
  if(/lfea-00[12]-source-guard|w10\.11/i.test(content))errors.push('LFEA-003 workflow invokes prohibited predecessor or W10.11 path authority.');
}
function functionSpans(content){
  const lines=content.split(/\r?\n/),rows=[];
  for(let index=0;index<lines.length;index+=1){const match=lines[index].match(/^\s*(?:export\s+)?function\s+(\w+)\s*\(/);if(!match)continue;let depth=0,end=index;for(;end<lines.length;end+=1){depth+=(lines[end].match(/{/g)||[]).length;depth-=(lines[end].match(/}/g)||[]).length;if(depth===0&&end>index)break;}rows.push({name:match[1],lines:end-index+1});}
  return rows;
}
function requireTokens(file,tokens){const content=read(file);tokens.forEach((token)=>requireText(content,token,file));}
function requireText(content,token,label){if(!content.includes(token))errors.push(`${label} is missing ${token}.`);}
function ensureBaseCommit(){try{execFileSync('git',['cat-file','-e',`${BASE_SHA}^{commit}`],{cwd:root,stdio:'ignore'});}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',BASE_SHA],{cwd:root,stdio:'ignore'});}}
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function gitLines(args){return execFileSync('git',args,{cwd:root,encoding:'utf8'}).split(/\r?\n/).filter(Boolean);}
