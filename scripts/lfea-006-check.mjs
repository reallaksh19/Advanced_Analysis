import { spawnSync } from 'node:child_process';
const files=['lfea-006-contract-check.mjs','lfea-006-qualification-check.mjs','lfea-006-review-check.mjs','lfea-006-export-check.mjs','lfea-006-failure-check.mjs','lfea-006-determinism-check.mjs'];
for(const file of files){const result=spawnSync(process.execPath,[new URL(file,import.meta.url).pathname],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
console.log('LFEA-006 engineering review and deterministic evidence-export qualification suite passed.');
