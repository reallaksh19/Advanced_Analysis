import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const controller = await readFile(new URL('../src/workspace/load-calc-consumer-controller.js', import.meta.url), 'utf8');
const view = await readFile(new URL('../src/workspace/load-calc-consumer-view.js', import.meta.url), 'utf8');

assert.match(controller, /authorizedExecution: engineeringModelStore\.getAuthorizedExecution\(\)/u);
assert.match(controller, /engineeringModelStore\.getAuthorizedExecution\(\),\n\s*\);/u);
assert.match(view, /AUTHORIZED_HANDOFF/u);
assert.match(view, /LEGACY_PROJECT_DATA/u);
assert.match(view, /baselineSemanticHash/u);
assert.match(view, /handoffSemanticHash/u);
assert.match(view, /projectionPayloadSemanticHash/u);
assert.match(view, /distributionSemanticHash/u);
assert.match(view, /data-empirical-authority/u);

for (const forbidden of [
  'calculateAuthorized(', 'executeAuthorizedEmpiricalLoads(', 'localStorage',
  'sessionStorage', 'Date.now(', 'Math.random(', 'LFEA', 'lafea',
]) assert.equal(view.includes(forbidden), false, `view contains forbidden token: ${forbidden}`);

console.log('PASS authorized empirical execution view anti-drift checks');
