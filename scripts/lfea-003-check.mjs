import { spawnSync } from 'node:child_process';
const files=['lfea-003-contract-check.mjs','lfea-003-numerical-check.mjs','lfea-003-failure-check.mjs','lfea-003-determinism-check.mjs'];
for(const file of files){const result=spawnSync(process.execPath,[new URL(file,import.meta.url).pathname],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
console.log('LFEA-003 isolated qualification suite passed.');
