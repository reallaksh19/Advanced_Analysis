import { spawnSync } from 'node:child_process';
const checks=['lfea-007-contract-check.mjs','lfea-007-source-intake-check.mjs','lfea-007-view-model-check.mjs','lfea-007-controller-check.mjs','lfea-007-failure-check.mjs','lfea-007-determinism-check.mjs','lfea-007-registration-check.mjs','lfea-007-source-guard.mjs'];
for(const script of checks){const result=spawnSync(process.execPath,[`scripts/${script}`],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('Complete LFEA-007 static qualification passed.');
