import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  '../src/workspace/enrichment/authorized-staged-json-writer.js',
  '../src/workspace/enrichment/authorized-staged-json-write-contract.js',
  '../src/workspace/enrichment/authorized-staged-json-write-tree.js',
];
const source = (await Promise.all(files.map((path) => readFile(new URL(path, import.meta.url), 'utf8')))).join('\n');
for (const [token, label] of [
  ["from 'node:", 'Node-only production import'],
  ['writeFile', 'file-system write'],
  ['showSaveFilePicker', 'browser file-system write'],
  ['URL.createObjectURL', 'implicit download'],
  ['localStorage', 'browser persistence'],
  ['projectDataStore', 'Project Data dependency'],
  ['workspaceState', 'workspace mutation'],
  ['Date.now', 'hidden clock'],
  ['new Date()', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['defaultValue', 'default engineering value'],
  ['fallbackValue', 'fallback engineering value'],
  ['localeCompare', 'locale-sensitive ordering'],
]) {
  assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /requireAuthorizedStagedJsonSidecar/u);
assert.match(source, /globalThis\.crypto\?\.subtle/u);
assert.match(source, /STAGED_JSON_WRITE_SOURCE_HASH_MISMATCH/u);
assert.match(source, /STAGED_JSON_WRITE_DUPLICATE_SOURCE_RECORD/u);
assert.match(source, /STAGED_JSON_WRITE_SOURCE_RECORD_MISSING/u);
assert.match(source, /STAGED_JSON_WRITE_EXISTING_VALUE_CONFLICT/u);
assert.match(source, /STAGED_JSON_WRITE_TARGET_MISMATCH/u);
assert.match(source, /STAGED_JSON_WRITE_LINE_MISMATCH/u);
assert.match(source, /retainedExactAttributeCount/u);
assert.match(source, /outputArtifact/u);
console.log('PASS authorized stagedJson writer anti-drift checks');
