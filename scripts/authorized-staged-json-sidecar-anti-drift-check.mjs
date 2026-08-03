import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/workspace/enrichment/authorized-staged-json-sidecar.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['writeFile', 'file write'],
  ['localStorage', 'browser persistence'],
  ['projectDataStore', 'Project Data mutation'],
  ["from '../dataset-adapter", 'dataset mutation dependency'],
  ["from '../topology", 'topology dependency'],
  ['Date.now', 'hidden clock'],
  ['new Date()', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['defaultValue', 'default value'],
  ['fallbackValue', 'fallback value'],
  ["|| 0", 'zero substitution'],
  ["?? 0", 'zero substitution'],
  ['localeCompare', 'locale-sensitive ordering'],
  ['executeConsumer', 'consumer execution'],
];
for (const [token, label] of forbidden) {
  assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /requireCommonEnrichedConsumerHandoff/u);
assert.match(source, /requireCommonEnrichedConsumerProjectionPayload/u);
assert.match(source, /handoff\.status !== 'AUTHORIZED'/u);
assert.match(source, /handoff\.consumer !== 'ENRICHED_STAGED_JSON_EXPORT'/u);
assert.match(source, /payload\.consumer !== 'ENRICHED_STAGED_JSON_EXPORT'/u);
assert.match(source, /handoff\.payload\.payloadSemanticHash !== payload\.semanticHash/u);
assert.match(source, /STAGED_JSON_SIDECAR_DUPLICATE_SOURCE_RECORD/u);
assert.match(source, /STAGED_JSON_SIDECAR_PROTECTED_FIELD/u);
assert.match(source, /PROTECTED_TOKENS/u);
assert.match(source, /projectionRecordSemanticHash/u);
assert.match(source, /computeAuthorizedStagedJsonSidecarSemanticHash/u);
console.log('PASS authorized stagedJson sidecar anti-drift checks');
