#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function runNode(script) {
  const execution = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  process.stdout.write(execution.stdout ?? '');
  process.stderr.write(execution.stderr ?? '');
  return execution.status ?? 1;
}

console.log('\n--- BM4 component 20010 mechanism diagnostic ---');
assert.equal(runNode('scripts/lfea-bm4-mechanism-diagnostic.mjs'), 0);

console.log('\n--- BM4 non-friction CASE 19/20/21 benchmark ---');
const referenceResponse = await fetch(
  'https://api.github.com/repos/reallaksh19/Advanced_Analysis/git/blobs/5be0cc70f0d608b0afdfb9878e4085982192bc72',
  {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  },
);
assert.equal(referenceResponse.ok, true, `BM4 reference download failed: ${referenceResponse.status}`);
writeFileSync('benchmarks/LFEA/BM4/Output_BM4.xml', await referenceResponse.text(), 'utf8');

runNode('scripts/lfea-bm4-case19-21-benchmark.mjs');
const report = JSON.parse(readFileSync('reports/bm4-case19-21-benchmark.json', 'utf8'));
console.log('BM4_CASE19_21_REPORT_BEGIN');
console.log(JSON.stringify(report, null, 2));
console.log('BM4_CASE19_21_REPORT_END');
assert.deepEqual(report.scope.selectedCaseNumbers, [19, 20, 21]);
assert.equal(report.scope.frictionCasesIncluded, false);
console.log(`BM4_CASE19_21_DISPOSITION: ${report.disposition}`);
