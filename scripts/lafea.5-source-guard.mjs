import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const production=path.join(root,'src/core/local-trunnion-footprint');
const files=fs.readdirSync(production).filter((name)=>name.endsWith('.js')).sort();
assert.ok(files.length>0);
for(const file of files){
  const full=path.join(production,file);const text=fs.readFileSync(full,'utf8');const lines=text.split('\n').length;
  assert.ok(lines<=300,`${file} has ${lines} lines`);
  assert.doesNotMatch(text,/\b(?:document|window|fetch|XMLHttpRequest|WebSocket|Date\.now|performance\.now|Math\.random)\b/,file);
  assert.doesNotMatch(text,/src\/core\/element-fea|local-stress\/(?!index\.js)|local-shell\/(?!index\.js)/,file);
  assert.doesNotMatch(text,/regulari[sz]ation|weak spring|diagonal shift|pseudoinverse fallback|tolerance relaxation|hidden load redistribution/i,file);
  for(const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)){
    const spec=match[1];
    if(spec.includes('local-stress'))assert.equal(spec,'../local-stress/index.js');
    if(spec.includes('local-shell'))assert.equal(spec,'../local-shell/index.js');
  }
  const exports=[...text.matchAll(/export\s+(?:const|function|class)\s+([A-Za-z0-9_]+)/g)].map((match)=>match[1]);
  assert.equal(new Set(exports).size,exports.length,`${file} duplicate named exports`);
}
if(fs.existsSync(path.join(root,'.git'))){
  const baseline='7e12954f2923c2df574bf94cb0d94811c813d463';
  assert.doesNotThrow(
    ()=>execFileSync('git',['cat-file','-e',`${baseline}^{commit}`],{stdio:'ignore'}),
    `Accepted baseline ${baseline} is unavailable; exact-baseline containment cannot be certified.`,
  );
  const changed=execFileSync('git',['diff','--name-only',`${baseline}...HEAD`],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const allowed=(file)=>file.startsWith('src/core/local-trunnion-footprint/')||file.startsWith('scripts/lafea.5-')||file.startsWith('docs/local-trunnion-footprint/')||file==='package.json'||file==='scripts/qa-check.mjs';
  assert.ok(changed.every(allowed),`Out-of-scope paths: ${changed.filter((file)=>!allowed(file)).join(', ')}`);
}
console.log('LAFEA.5 source size, public dependency, runtime hygiene and allowlist checks passed.');
