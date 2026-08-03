import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleSource = await readFile(
  new URL('../src/workspace/enrichment/authorized-enrichment-workspace-api.js', import.meta.url),
  'utf8',
);
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

for (const forbidden of [
  'addEventListener(', 'subscribe(', 'Date.now(', 'Math.random(',
  'localStorage', 'sessionStorage', 'projectDataStore', 'LFEA', 'lafea',
]) {
  assert.equal(moduleSource.includes(forbidden), false, `forbidden workspace API token: ${forbidden}`);
}

for (const required of [
  "import { AuthorizedEnrichmentConsumerController } from './workspace/enrichment/authorized-enrichment-consumer-controller.js';",
  "import { createAuthorizedEnrichmentWorkspaceApi } from './workspace/enrichment/authorized-enrichment-workspace-api.js';",
  "import { ENGINEERING_MODEL_EVENTS } from './workspace/engineering-model-controller.js';",
  "import { EventBus } from './workspace/event-bus.js';",
  "import { engineeringModelStore } from './workspace/engineering-model-store.js';",
  "import { masterDataController } from './workspace/master-data-controller.js';",
  'const authorizedEnrichmentController = new AuthorizedEnrichmentConsumerController({',
  'const authorizedEnrichmentApi = createAuthorizedEnrichmentWorkspaceApi({',
  'onEmpiricalChanged(distribution) {',
  'EventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, {',
  "reason: 'calculated',",
  'onEmpiricalFailed(error) {',
  'EventBus.publish(ENGINEERING_MODEL_EVENTS.FAILED, {',
  '...authorizedEnrichmentApi,',
]) {
  assert.ok(mainSource.includes(required), `main.js missing authorized notification wiring: ${required}`);
}

assert.equal(mainSource.includes('AUTHORIZED_CALCULATE_REQUESTED'), false);
assert.equal(mainSource.includes('addEventListener'), false);
console.log('PASS authorized enrichment workspace API notification anti-drift checks');
