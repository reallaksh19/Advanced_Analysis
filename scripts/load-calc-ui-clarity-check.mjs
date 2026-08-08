import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(
  new URL('../src/workspace/load-calc-consumer-view.js', import.meta.url),
  'utf8',
);
const scenario = await readFile(
  new URL('../src/workspace/engineering-loads/empirical-load-calc-scenario-view.js', import.meta.url),
  'utf8',
);

assert.match(shell, /Calculate — Authorized Gravity/u);
assert.match(shell, /data-engineering-load-calculate/u);
assert.match(shell, /Calculation state/u);
assert.match(shell, /Input seal:/u);
assert.match(shell, /Authorization:/u);
assert.match(shell, /Result:/u);

for (const group of ['Setup', 'Scenario', 'Output', 'Diagnostics', 'Model']) {
  assert.match(shell, new RegExp(`tabGroup\\('${group}'`, 'u'));
}

assert.match(scenario, /Calculate — Configured Scenario/u);
assert.match(scenario, /data-empirical-calculate/u);
assert.match(scenario, /Authorize scenario/u);

assert.doesNotMatch(
  shell,
  /data-empirical-calculate/u,
  'The header must not silently take ownership of configured-scenario execution.',
);
assert.doesNotMatch(
  scenario,
  /data-engineering-load-calculate/u,
  'The Methods surface must not silently take ownership of authorized-gravity execution.',
);

console.log('load-calc-ui-clarity-check: PASS');
