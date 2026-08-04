import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const controller = await readFile(new URL('../src/workspace/load-calc-consumer-controller.js', import.meta.url), 'utf8');
const view = await readFile(new URL('../src/workspace/load-calc-consumer-view.js', import.meta.url), 'utf8');
assert.match(controller, /getEmpiricalAuthorizationState\(\)/u);
assert.match(controller, /authorization\.calculationEligible/u);
assert.match(controller, /CALCULATE_REQUESTED/u);
assert.equal(controller.includes('engineeringModelStore.calculate('), false);
for (const required of [
  'AUTHORIZED_HANDOFF', 'EXECUTED_CURRENT',
  'baselineSemanticHash', 'handoffSemanticHash', 'projectionPayloadSemanticHash',
  'distributionSemanticHash', 'data-empirical-authority', 'HISTORICAL',
]) assert.ok(view.includes(required), `view missing evidence token: ${required}`);
assert.equal(view.includes('LEGACY_PROJECT_DATA'), false);
for (const forbidden of [
  'calculateAuthorized(', 'executeAuthorizedEmpiricalLoads(', 'localStorage',
  'sessionStorage', 'Date.now(', 'Math.random(', 'LFEA', 'lafea',
]) assert.equal(view.includes(forbidden), false, `view contains forbidden token: ${forbidden}`);
console.log('PASS authorized empirical execution view anti-drift checks');
