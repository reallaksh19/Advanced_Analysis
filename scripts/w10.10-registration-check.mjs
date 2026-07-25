import fs from 'node:fs';

const requiredFiles=[
  'docs/three-d-calculation-consumer/W10.10_THREE_D_CALC_CONSUMER.md',
  'scripts/w10.10-three-d-calculation-contract-check.mjs',
  'scripts/w10.10-three-d-calculation-property-check.mjs',
  'scripts/w10.10-three-d-calculation-source-guard.mjs',
  'e2e/w10.10-three-d-calc-consumer.spec.js',
  'src/core/three-d-calculation-consumer/index.js',
  'src/workspace/three-d-calc-consumer-controller.js',
  'src/workspace/three-d-calc-consumer-view.js',
];
const errors=requiredFiles.filter((file)=>!fs.existsSync(file)).map((file)=>`Missing W10.10 release evidence: ${file}`);
const browser=read('e2e/w10.10-three-d-calc-consumer.spec.js');
[
  'getThreeDCalculationReviewModel',
  'application-view-state/v3',
  'three-d-calculation-review-model/v1',
  'sharedModel:exportRequested',
  'topology:rebuildExactRequested',
  'supportRestraint:rebuildEvidenceRequested',
  'verticalBeam:solveRequested',
  'Not a second 3D viewport',
  'AnalysisWorkspace.destroy()',
].forEach((token)=>{if(!browser.includes(token))errors.push(`W10.10 browser evidence is missing ${token}.`);});
const releaseWorkflow=read('.github/workflows/release-candidate.yml');
if(!releaseWorkflow.includes('npm run check:u7'))errors.push('Release Candidate Certification must retain npm run check:u7.');
if(errors.length){errors.forEach((error)=>console.error(`❌ ${error}`));process.exit(1);}
console.log('✅ W10.10 release and browser registration evidence passed.');
function read(file){return fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';}
