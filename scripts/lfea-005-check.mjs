import { spawnSync } from 'node:child_process';
const files=['lfea-005-contract-check.mjs','lfea-005-topology-check.mjs','lfea-005-assignment-check.mjs','lfea-005-solver-roundtrip-check.mjs','lfea-005-failure-check.mjs','lfea-005-determinism-check.mjs'];
for(const file of files){const result=spawnSync(process.execPath,[new URL(file,import.meta.url).pathname],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
console.log('LFEA-005 canonical geometry and mesh-package adapter qualification suite passed.');
