import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/workspace/enrichment/authorized-enrichment-consumer-controller.js', import.meta.url),
  'utf8',
);
for (const [token, label] of [
  ["from 'node:", 'Node-only production import'],
  ['addEventListener', 'automatic listener'],
  ['subscribe(', 'automatic event subscription'],
  ['localStorage', 'browser persistence'],
  ['projectDataStore', 'Project Data dependency'],
  ['workspaceState', 'workspace mutation'],
  ['Date.now', 'hidden clock'],
  ['new Date()', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['LFEA', 'LFEA coupling'],
  ['solver', 'solver coupling'],
]) assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
assert.match(source, /requireAuthorizedEmpiricalLoadInput/u);
assert.match(source, /calculateAuthorized/u);
assert.match(source, /getMasterData/u);
assert.match(source, /requireAuthorizedStagedJsonSidecar/u);
assert.match(source, /writeAuthorizedStagedJson/u);
assert.match(source, /createAuthorizedStagedJsonDownloadArtifact/u);
assert.match(source, /triggerAuthorizedStagedJsonDownload/u);
assert.match(source, /operationId/u);
assert.match(source, /downloadReceiptSemanticHash/u);
console.log('PASS authorized enrichment consumer controller anti-drift checks');
