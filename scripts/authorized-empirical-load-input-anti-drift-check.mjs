import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/workspace/engineering-loads/authorized-empirical-load-input.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ["from '../project-data", 'Project Data dependency'],
  ["from './support-load-distribution-v3", 'calculation execution dependency'],
  ['engineeringSupportLoadStore', 'calculation store dependency'],
  ['projectDataStore', 'Project Data mutation dependency'],
  ['localStorage', 'browser persistence'],
  ['Date.now', 'hidden clock'],
  ['new Date()', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['defaultValue', 'default engineering value'],
  ['fallbackValue', 'fallback engineering value'],
  ["|| 0", 'zero substitution'],
  ["?? 0", 'zero substitution'],
  ['localeCompare', 'locale-sensitive ordering'],
];
for (const [token, label] of forbidden) {
  assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /requireCommonEnrichedConsumerHandoff/u);
assert.match(source, /requireCommonEnrichedConsumerProjectionPayload/u);
assert.match(source, /handoff\.status !== 'AUTHORIZED'/u);
assert.match(source, /handoff\.consumer !== 'EMPIRICAL_LOADS'/u);
assert.match(source, /payload\.consumer !== 'EMPIRICAL_LOADS'/u);
assert.match(source, /handoff\.payload\.payloadSemanticHash !== payload\.semanticHash/u);
assert.match(source, /EMPIRICAL_INPUT_DUPLICATE_LINE_KEY/u);
assert.match(source, /EMPIRICAL_INPUT_MATERIAL_DENSITY_CONFLICT/u);
assert.match(source, /EMPIRICAL_INPUT_INSULATION_DENSITY_CONFLICT/u);
assert.match(source, /EMPIRICAL_INPUT_COMPONENT_WEIGHT_CONFLICT/u);
assert.match(source, /loadCalculationOverlay/u);
assert.match(source, /overlaySemanticHash/u);
console.log('PASS authorized empirical-load input adapter anti-drift checks');
