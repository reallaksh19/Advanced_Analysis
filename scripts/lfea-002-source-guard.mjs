import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const BASE_SHA = 'a2adcffb7b10534daba740d2a488faaba21e7a2e';
const root = process.cwd();
const ALLOWED = Object.freeze([
  /^src\/core\/element-fea\//,
  /^scripts\/lfea-002-[^/]+\.mjs$/,
  /^docs\/element-fea\/LFEA-002_IMPLEMENTATION\.md$/,
  /^\.github\/workflows\/lfea-002-certification\.yml$/,
]);
ensureBaseCommit();
const changed = gitLines(['diff','--name-only',BASE_SHA,'HEAD']);
const added = new Set(gitLines(['diff','--name-only','--diff-filter=A',BASE_SHA,'HEAD']));
const errors = [];
changed.forEach((file) => { if (!ALLOWED.some((rule) => rule.test(file))) errors.push(`Disallowed LFEA-002 changed path: ${file}`); });
changed.filter((file)=>/\.(?:js|mjs)$/.test(file)).forEach(validateJavaScript);
assert.ok(!changed.some((file)=>file.includes('w10.11') || /application-shell|workspace-consumers|view-state|registry/.test(file)), 'LFEA-002 must not modify W10.11 or application-shell authority.');
requireTokens('src/core/element-fea/constants.js',['fea-continuum-result/v2','Q4_GAUSS_2X2_FULL_V1','Q4_CCW_N1_NEG_NEG_N2_POS_NEG_N3_POS_POS_N4_NEG_POS_V1']);
requireTokens('src/core/element-fea/q4-element.js',['EDGE_GAUSS_POINTS','recoverQ4Result','equivalentQ4EdgeLoad']);
requireTokens('.github/workflows/lfea-002-certification.yml',['node scripts/lfea-001-contract-check.mjs','node scripts/lfea-001-numerical-check.mjs','node scripts/lfea-001-failure-check.mjs','node scripts/lfea-001-determinism-check.mjs','node scripts/lfea-002-check.mjs']);
if (errors.length) { errors.forEach((error)=>console.error(` - ${error}`)); process.exit(1); }
console.log(`LFEA-002 source guard passed for ${changed.length} changed file(s).`);
function validateJavaScript(file) {
  const content = fs.readFileSync(path.join(root,file),'utf8'); const lines = content.split(/\r?\n/).length - 1;
  if (lines >= 300) errors.push(`${file} has ${lines} lines; maximum is below 300.`);
  if (/export\s+default\b/.test(content)) errors.push(`${file} contains a default export.`);
  if (file.startsWith('src/') && /\b(?:Date\.now|new Date|Math\.random|randomUUID|crypto\.randomUUID|uuid)\b/.test(content)) errors.push(`${file} contains nondeterministic identity logic.`);
  functionSpans(content).filter((span)=>span.lines>40).forEach((span)=>errors.push(`${file} function ${span.name} has ${span.lines} lines.`));
  if (added.has(file) && /hourglass|selective integration|incompatible mode/i.test(content) && !file.includes('failure-check') && !file.includes('source-guard')) errors.push(`${file} introduces a prohibited Q4 formulation path.`);
}
function functionSpans(content) {
  const lines=content.split(/\r?\n/), rows=[];
  for(let index=0;index<lines.length;index+=1){const match=lines[index].match(/^\s*(?:export\s+)?function\s+(\w+)\s*\(/);if(!match)continue;let depth=0,end=index;for(;end<lines.length;end+=1){depth+=(lines[end].match(/{/g)||[]).length;depth-=(lines[end].match(/}/g)||[]).length;if(depth===0&&end>index)break;}rows.push({name:match[1],lines:end-index+1});}
  return rows;
}
function requireTokens(file,tokens){const content=fs.readFileSync(path.join(root,file),'utf8');tokens.forEach((token)=>{if(!content.includes(token))errors.push(`${file} is missing ${token}.`);});}
function ensureBaseCommit(){try{execFileSync('git',['cat-file','-e',`${BASE_SHA}^{commit}`],{cwd:root,stdio:'ignore'});}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',BASE_SHA],{cwd:root,stdio:'ignore'});}}
function gitLines(args){return execFileSync('git',args,{cwd:root,encoding:'utf8'}).split(/\r?\n/).filter(Boolean);}
