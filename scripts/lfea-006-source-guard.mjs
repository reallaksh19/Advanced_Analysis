import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const ORIGINAL_BASE_SHA='e12adc701ea9b189a3d703dc218c227a854aef29';
const CORRECTION_BASE_SHA='e69547e84221011e2b814d8beb764a198afe56c7';
const root=new URL('../',import.meta.url).pathname;
const core=join(root,'src/core/element-fea');
const correctionMode=isAncestor(CORRECTION_BASE_SHA,'HEAD');
const baseSha=correctionMode?CORRECTION_BASE_SHA:ORIGINAL_BASE_SHA;
const originalAllowed=[/^src\/core\/element-fea\//,/^scripts\/lfea-006-[^/]+\.mjs$/,/^docs\/element-fea\/LFEA-006_IMPLEMENTATION\.md$/,/^\.github\/workflows\/lfea-006-certification\.yml$/];
const correctionAllowed=[/^src\/core\/element-fea\/review-contract\.js$/,/^scripts\/lfea-006-contract-check\.mjs$/,/^scripts\/lfea-006-source-guard\.mjs$/,/^scripts\/qa-check\.mjs$/];

ensureBase(baseSha);
const changed=gitLines(['diff','--name-only',baseSha,'HEAD']);
const allowed=correctionMode?correctionAllowed:originalAllowed;
const errors=[];
changed.forEach((file)=>{if(!allowed.some((rule)=>rule.test(file)))errors.push(`Disallowed LFEA-006 changed path: ${file}`);});
assert.ok(!changed.includes('.github/workflows/lfea-006-bootstrap.yml'),'Temporary LFEA-006 bootstrap workflow is prohibited from the final tree.');
if(correctionMode)validateCorrection();else validateOriginal(changed);
validateCore(changed);
validateWorkflow();
if(errors.length)throw new Error(errors.join('\n'));
console.log(`LFEA-006 ${correctionMode?'post-merge correction':'exact-baseline'} source boundary passed for ${changed.length} changed files.`);

function validateOriginal(changedFiles){
  assert.ok(!changedFiles.some((file)=>/lafea|pcf|settings-authority|application-shell|workspace|view-state|registry|canvas|three|package(?:-lock)?\.json/i.test(file)),'LFEA-006 changed a prohibited authority path.');
  assert.ok(!changedFiles.some((file)=>/^\.github\/workflows\/(?!lfea-006-certification\.yml$)/.test(file)),'LFEA-006 changed a predecessor or aggregate workflow.');
  assert.deepEqual(gitLines(['diff','--name-only',ORIGINAL_BASE_SHA,'HEAD','--','scripts/lfea-001-*','scripts/lfea-002-*','scripts/lfea-003-*','scripts/lfea-004-*','scripts/lfea-005-*']),[],'Predecessor LFEA suites or guards changed.');
  assert.ok(!changedFiles.includes('scripts/qa-check.mjs'),'LFEA-006 changed aggregate QA without authority.');
}
function validateCorrection(){
  const text=readFileSync(join(root,'scripts/qa-check.mjs'),'utf8');
  for(const token of ['npm run check:w10.3:static','npm run check:w10.5:static','npm run check:lafea.3'])assert.ok(text.includes(token),`Aggregate QA is missing restored governed gate ${token}.`);
  for(const token of ['W10.3 Support/Restraint Behavioral Static Check','W10.5 Support Load Screening Behavioral Static Check','LAFEA.3 Deterministic 2D Continuum Behavioral Static Check'])assert.equal(text.includes(token),false,`Aggregate QA still contains unauthorized replacement ${token}.`);
}
function validateCore(changedFiles){
  const changedCore=changedFiles.filter((file)=>file.startsWith('src/core/element-fea/'));
  const permitted=correctionMode?new Set(['src/core/element-fea/review-contract.js']):null;
  assert.ok(changedCore.every((file)=>correctionMode?permitted.has(file):file==='src/core/element-fea/index.js'||/\/review-[^/]+\.js$/.test(file)),`LFEA-006 changed an unauthorized existing core module: ${changedCore.join(', ')}`);
  const newCore=walk(core).filter((file)=>/review-.*\.js$/.test(file));
  for(const file of newCore){const text=readFileSync(file,'utf8');assert.ok(!/export\s+default/.test(text),`${basename(file)} uses a default export.`);for(const specifier of [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((row)=>row[1]))assert.ok(specifier.startsWith('.')||specifier.startsWith('node:'),`${basename(file)} imports external dependency ${specifier}.`);assert.ok(text.split(/\r?\n/).length<=300,`${basename(file)} exceeds 300 lines.`);}
}
function validateWorkflow(){const file=join(root,'.github/workflows/lfea-006-certification.yml');const text=readFileSync(file,'utf8');for(const token of ['Checkout exact authorized implementation head','node scripts/lfea-001-contract-check.mjs','node scripts/lfea-002-contract-check.mjs','node scripts/lfea-003-contract-check.mjs','node scripts/lfea-004-check.mjs','node scripts/lfea-005-check.mjs','node scripts/lfea-006-check.mjs','node scripts/lfea-006-source-guard.mjs'])assert.ok(text.includes(token),`LFEA-006 workflow is missing ${token}.`);for(const token of ['lfea-001-source-guard','lfea-002-source-guard','lfea-003-source-guard','lfea-004-source-guard','lfea-005-source-guard','w10','LAFEA','application-shell','playwright'])assert.equal(text.includes(token),false,`LFEA-006 workflow invokes prohibited authority: ${token}`);}
function ensureBase(sha){try{execFileSync('git',['cat-file','-e',`${sha}^{commit}`],{cwd:root,stdio:'ignore'});}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',sha],{cwd:root,stdio:'ignore'});}assert.equal(execFileSync('git',['rev-parse',sha],{cwd:root,encoding:'utf8'}).trim(),sha,'Required LFEA-006 source-guard baseline is unavailable.');execFileSync('git',['merge-base','--is-ancestor',sha,'HEAD'],{cwd:root});}
function isAncestor(sha,head){try{execFileSync('git',['merge-base','--is-ancestor',sha,head],{cwd:root,stdio:'ignore'});return true;}catch{return false;}}
function gitLines(args){const text=execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();return text?text.split(/\r?\n/).sort():[];}
function walk(directory){return readdirSync(directory).flatMap((name)=>{const path=join(directory,name);return statSync(path).isDirectory()?walk(path):[path];});}
