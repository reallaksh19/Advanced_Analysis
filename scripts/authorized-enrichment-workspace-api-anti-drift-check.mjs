import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleSource = await readFile(new URL('../src/workspace/enrichment/authorized-enrichment-workspace-api.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
for (const forbidden of [
  'addEventListener(', 'subscribe(', 'Date.now(', 'Math.random(',
  'localStorage', 'sessionStorage', 'projectDataStore', 'LFEA', 'lafea',
]) assert.equal(moduleSource.includes(forbidden), false, `forbidden workspace API token: ${forbidden}`);
for (const required of [
  'configureAuthorizedEmpiricalLoads',
  'executeAuthorizedEmpiricalLoads',
  'getAuthorizedEmpiricalLoadState',
  'onEmpiricalAuthorizationChanged',
  'onEmpiricalChanged',
  'onEmpiricalFailed',
]) assert.ok(moduleSource.includes(required), `workspace API missing: ${required}`);
for (const required of [
  "import { authorizedEnrichmentConsumerController } from './workspace/enrichment/authorized-enrichment-runtime.js';",
  'controller: authorizedEnrichmentConsumerController',
  'onEmpiricalAuthorizationChanged(state)',
  "reason: 'authorization-changed'",
  'onEmpiricalChanged(execution)',
  'distribution: execution.distribution',
  '...authorizedEnrichmentApi,',
]) assert.ok(mainSource.includes(required), `main.js missing authorized wiring: ${required}`);
assert.equal(mainSource.includes('new AuthorizedEnrichmentConsumerController'), false,
  'main.js created a second empirical consumer controller');
console.log('PASS authorized enrichment workspace API anti-drift checks');
