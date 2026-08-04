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
  ['engineeringModelStore.calculate(', 'legacy empirical execution'],
  ['LFEA', 'LFEA coupling'],
  ['solver', 'solver coupling'],
]) assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
for (const required of [
  'requireAuthorizedEmpiricalRuntimePackage',
  'configureAuthorizedEmpiricalPackage',
  'executeConfiguredAuthorized',
  'refreshAuthorizedEmpiricalPackage',
  'getEmpiricalAuthorizationState',
  'requireAuthorizedStagedJsonSidecar',
  'writeAuthorizedStagedJson',
  'createAuthorizedStagedJsonDownloadArtifact',
  'triggerAuthorizedStagedJsonDownload',
]) assert.ok(source.includes(required), `missing authorized seam: ${required}`);
console.log('PASS authorized enrichment consumer controller anti-drift checks');
