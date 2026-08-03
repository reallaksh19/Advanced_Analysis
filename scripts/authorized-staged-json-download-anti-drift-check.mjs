import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/workspace/enrichment/authorized-staged-json-download.js', import.meta.url),
  'utf8',
);
for (const [token, label] of [
  ["from 'node:", 'Node-only production import'],
  ['addEventListener', 'automatic UI registration'],
  ['localStorage', 'browser persistence'],
  ['projectDataStore', 'Project Data dependency'],
  ['workspaceState', 'workspace mutation'],
  ['Date.now', 'hidden clock'],
  ['new Date()', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['showSaveFilePicker', 'unreviewed file-system authority'],
]) {
  assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /requireAuthorizedStagedJsonWriteArtifact/u);
assert.match(source, /new runtime\.BlobCtor/u);
assert.match(source, /documentRef\.createElement\('a'\)/u);
assert.match(source, /anchor\.click\(\)/u);
assert.match(source, /finally/u);
assert.match(source, /runtime\.revokeObjectURL/u);
assert.match(source, /downloadId/u);
assert.match(source, /triggeredAt/u);
assert.match(source, /writeReceiptSemanticHash/u);
assert.match(source, /AUTHORIZED_STAGED_JSON_DOWNLOAD_RECEIPT_SCHEMA/u);
console.log('PASS authorized stagedJson download anti-drift checks');
