import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const execution = await readFile(
  new URL('../src/workspace/engineering-loads/authorized-empirical-load-execution.js', import.meta.url),
  'utf8',
);
const supportStore = await readFile(
  new URL('../src/workspace/engineering-loads/engineering-support-load-store.js', import.meta.url),
  'utf8',
);
const modelStore = await readFile(
  new URL('../src/workspace/engineering-model-store.js', import.meta.url),
  'utf8',
);

for (const [token, label] of [
  ['projectDataStore', 'Project Data persistence'],
  ['replaceProjectDataValue', 'persistent Project Data update'],
  ['localStorage', 'browser persistence'],
  ['Date.now', 'hidden clock'],
  ['new Date()', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['defaultValue', 'default engineering value'],
  ['fallbackValue', 'fallback engineering value'],
  ["|| 0", 'zero substitution'],
  ["?? 0", 'zero substitution'],
  ['localeCompare', 'locale-sensitive ordering'],
]) {
  assert.equal(execution.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(execution, /requireAuthorizedEmpiricalLoadInput/u);
assert.match(execution, /createEvidenceValue/u);
assert.match(execution, /validateProjectDataProfile/u);
assert.match(execution, /calculateSupportLoadDistribution/u);
assert.match(execution, /AUTHORIZED_EMPIRICAL_LOAD_INPUT/u);
assert.match(execution, /EMPIRICAL_EXECUTION_PROFILE_BLOCKED/u);
assert.match(execution, /distributionSemanticHash/u);
assert.match(supportStore, /calculateAuthorizedEmpiricalLoadExecution/u);
assert.match(supportStore, /getAuthorizedExecution/u);
assert.match(modelStore, /calculateAuthorized/u);
assert.match(modelStore, /AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA/u);
assert.match(modelStore, /calculate\(masterData\)/u, 'legacy explicit calculation seam was removed');
console.log('PASS authorized empirical-load execution anti-drift checks');
