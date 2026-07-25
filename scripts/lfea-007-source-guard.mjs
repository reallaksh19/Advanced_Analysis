import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASELINE='f38f9c0bc7b3f23ab5eac281224dbcc0febe3dfe';
const RETIRED=Object.freeze([
  '.github/workflows/w10-r2-certification.yml',
  '.github/workflows/w10-r3-certification.yml',
  '.github/workflows/w10-r4-certification.yml',
  '.github/workflows/u0-certification.yml',
  'scripts/w10.r3-registration-check.mjs',
  'scripts/w10.r4-registration-check.mjs',
]);
const authorized=[
  /^src\/core\/lfea-consumer\//,
  /^src\/core\/workspace-consumers\/(constants|event-contracts|index|registry|view-state)\.js$/,
  /^src\/core\/qa-evidence\/(consumer-rows|source|validation)\.js$/,
  /^src\/workspace\/lfea-consumer-.*\.js$/,
  /^src\/workspace\/(application-shell-controller|bootstrap|event-topics|workspace-layout)\.js$/,
  /^scripts\/lfea-007-.*\.mjs$/,
  /^scripts\/w10\.12-qa-evidence-source-guard\.mjs$/,
  /^scripts\/(qa-check|w10\.11-registration-check|w10\.r3-registration-check|w10\.r4-registration-check)\.mjs$/,
  /^docs\/element-fea\/LFEA-007_APPLICATION_CONSUMER\.md$/,
  /^e2e\/(lfea-007-local-fea-consumer|w10\.8-workspace-consumers|w10\.9-load-calc-consumer|w10\.10-three-d-calc-consumer|w10\.12-qa-evidence-consumer)\.spec\.js$/,
  /^\.github\/workflows\/lfea-007-certification\.yml$/,
  /^\.github\/workflows\/(w10-r2-certification|w10-r3-certification|w10-r4-certification|u0-certification)\.yml$/,
  /^package\.json$/,
];
const changed=changedFiles();
const unauthorized=changed.filter((file)=>!authorized.some((rule)=>rule.test(file)));
assert.deepEqual(unauthorized,[],`Unauthorized LFEA-007 or gate-removal paths: ${unauthorized.join(', ')}`);
assert(!changed.includes('package-lock.json'),'package-lock.json must remain unchanged.');
assert(!changed.some((file)=>/^src\/core\/(element-fea|local-shell|local-stress|shared-piping-model|sketcher-draft|settings-authority)\//.test(file)),'Protected engineering core changed.');
assert(!changed.some((file)=>/^src\/workspace\/(workspace-state|dataset-controller|analysis-|pipe-solver-)/.test(file)),'Protected Workspace/solver ownership changed.');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const before=JSON.parse(baselineText('package.json'));
assert.deepEqual(pkg.dependencies,before.dependencies,'Runtime dependencies changed.');
assert.deepEqual(pkg.devDependencies,before.devDependencies,'Development dependencies changed.');
for(const key of ['check:w10.r3:contracts','check:w10.r3:properties','check:w10.r3:source','check:w10.r3:browser','check:w10.r3','check:w10.r4:contracts','check:w10.r4:commands','check:w10.r4:properties','check:w10.r4:source','check:w10.r4:browser','check:w10.r4','check:u0','ci:u0'])assert.equal(pkg.scripts[key],undefined,`Retired gate script remains: ${key}`);
for(const retiredPath of RETIRED)assert.equal(fs.existsSync(retiredPath),false,`Retired gate file remains: ${retiredPath}`);
assert(pkg.scripts['check:lfea.007:static']==='node scripts/lfea-007-check.mjs');
assert(pkg.scripts['check:lfea.007:browser']==='playwright test e2e/lfea-007-local-fea-consumer.spec.js');
assert(pkg.scripts['check:workspace-browser'].includes('e2e/lfea-007-local-fea-consumer.spec.js'));
assert(pkg.scripts['check:workspace-browser'].includes('e2e/w10.12-qa-evidence-consumer.spec.js'));
assert(!pkg.scripts['check:workspace-browser'].includes('w10.r3-settings-authority.spec.js'));
assert(!pkg.scripts['check:workspace-browser'].includes('w10.r4-sketcher-recovery.spec.js'));
const qa=fs.readFileSync('scripts/qa-check.mjs','utf8');
assert.equal((qa.match(/LFEA-007 Read-Only Local FEA Consumer Static Check/g)||[]).length,1,'LFEA-007 QA registration must occur exactly once.');
for(const file of changed.filter((row)=>/\.(?:js|mjs)$/.test(row))){
  if(!fs.existsSync(file))continue;
  const text=fs.readFileSync(file,'utf8');
  if(file.includes('lfea-consumer')){
    assert(!/from ['"](?:react|zustand|three|@react-three)/.test(text),`${file} imports an unauthorized framework.`);
    assert(!/<canvas|createElement\(['"]canvas|WebGLRenderer/.test(text),`${file} creates Canvas or WebGL.`);
  }
  assert(text.split(/\r?\n/).length<=400,`${file} exceeds the bounded JavaScript source guard.`);
}
const layout=fs.readFileSync('src/workspace/workspace-layout.js','utf8');
assert.equal((layout.match(/data-webgl-host/g)||[]).length,1,'Application must retain exactly one WebGL host.');
assert.equal((layout.match(/data-application-view="LOCAL_FEA"/g)||[]).length,1,'Local FEA view must be registered exactly once.');
console.log(`LFEA-007 source boundary passed for ${changed.length} changed paths; retired W10.R2-R4 and Phase U0 gates remain absent.`);
function changedFiles(){return execFileSync('git',['diff','--name-only',BASELINE,'HEAD'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);}
function baselineText(file){return execFileSync('git',['show',`${BASELINE}:${file}`],{encoding:'utf8'});}
