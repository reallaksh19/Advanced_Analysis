import assert from 'node:assert/strict';
import { parseFirstCutMasterDataCsv } from '../src/core/first-cut-load-estimation/index.js';
import { copyTextToClipboard } from '../src/workspace/enrichment/clipboard-adapter.js';
import { createBindingsCsv } from '../src/workspace/enrichment/first-cut-serialization.js';
import { FirstCutWorkbenchStore } from '../src/workspace/enrichment/first-cut-workbench-store.js';

const bindings = [{
  recordId: 'ROW-1',
  selectorKind: 'ENTITY',
  selectorKey: 'PIPE-1',
  fieldId: 'unitPipeWeightKgPerM',
  value: 12.5,
  unit: 'kg/m',
  sourceId: '[SIMULATED] MASTER',
  revision: 'A',
  authorityLevel: 'AUTHORIZED_MASTER',
}];
const csvA = createBindingsCsv(bindings);
const csvB = createBindingsCsv([...bindings].reverse());
assert.equal(csvA, csvB, 'UI-FC-10 deterministic export');
const imported = parseFirstCutMasterDataCsv(csvA, '[SIMULATED] MASTER', 'A');
assert.equal(imported.records[0].value, 12.5, 'UI-FC-10 export/re-import');
assert.equal(imported.records[0].selectorKind, 'ENTITY');

let copied = '';
await copyTextToClipboard({ writeText: async (value) => { copied = value; } }, 'REPORT');
assert.equal(copied, 'REPORT', 'UI-FC-06 Copy Report adapter');
await assert.rejects(
  copyTextToClipboard({ writeText: async () => { throw new Error('denied'); } }, 'REPORT'),
  /denied/u,
  'UI-FC-06 clipboard failure is explicit',
);

const store = new FirstCutWorkbenchStore();
store.setProfileField('profileId', '[SIMULATED] STAGED');
store.resetStaged();
assert.equal(store.getSnapshot().profileForm.profileId, '', 'UI-FC-02 reset restores sealed state');
console.log('✅ [SIMULATED] First-cut workbench export, clipboard, and staged-state checks passed.');
