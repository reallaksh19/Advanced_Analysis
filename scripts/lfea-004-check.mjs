import { spawnSync } from 'node:child_process';
const files=['lfea-004-contract-check.mjs','lfea-004-numerical-check.mjs','lfea-004-failure-check.mjs','lfea-004-determinism-check.mjs','lfea-004-capacity-check.mjs'];
for(const file of files){const result=spawnSync(process.execPath,[new URL(file,import.meta.url).pathname],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
console.log('LFEA-004 deterministic sparse CSR/PCG qualification suite passed.');
