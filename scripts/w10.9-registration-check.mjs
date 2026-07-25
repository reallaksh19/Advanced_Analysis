import fs from 'node:fs';

const requiredFiles=[
  'docs/load-calculation-consumer/W10.9_LOAD_CALC_CONSUMER.md',
  'scripts/w10.9-load-calculation-contract-check.mjs',
  'scripts/w10.9-load-calculation-property-check.mjs',
  'scripts/w10.9-load-calculation-source-guard.mjs',
  'e2e/w10.9-load-calc-consumer.spec.js',
  'src/core/load-calculation-consumer/index.js',
  'src/workspace/load-calc-consumer-controller.js',
  'src/workspace/load-calc-consumer-view.js',
];
const errors=requiredFiles.filter((file)=>!fs.existsSync(file)).map((file)=>`Missing W10.9 release evidence: ${file}`);
const browser=fs.existsSync('e2e/w10.9-load-calc-consumer.spec.js')?fs.readFileSync('e2e/w10.9-load-calc-consumer.spec.js','utf8'):'';
[
  'getLoadCalculationReviewModel',
  'application-view-state/v2',
  'load-calculation-review-model/v1',
  'modelLoad:rebuildRequested',
  'supportLoadScreening:runRequested',
  'Topology-local tributary screening',
  'AnalysisWorkspace.destroy()',
].forEach((token)=>{if(!browser.includes(token))errors.push(`W10.9 browser evidence is missing ${token}.`);});
if(errors.length){errors.forEach((error)=>console.error(`❌ ${error}`));process.exit(1);}
console.log('✅ W10.9 release and browser registration evidence passed.');
