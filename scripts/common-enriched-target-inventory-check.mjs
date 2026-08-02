import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../src/core/shared-piping-model/immutable.js';
import {
  COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  createCommonEnrichedTargetInventory,
  requireCommonEnrichedTargetInventory,
} from '../src/core/common-enriched-properties/target-inventory.js';

const source = sharedModel([
  component('COMP-A', 'S100', 'B1'),
  component('COMP-B', 's100', 'B2'),
  component('COMP-C', 'S200', 'B1'),
  component('COMP-D', '', 'B3', { name: 'PIPE-S300-BUT-NO-IDENTITY' }),
  component('COMP-E', 'S100', 'B4'),
]);
const before = JSON.stringify(source);
const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-EXACT-001',
  sharedModel: source,
});
const repeat = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-EXACT-001',
  sharedModel: source,
});

assert.deepEqual(requireCommonEnrichedTargetInventory(inventory), inventory);
assert.deepEqual(repeat, inventory);
assert.equal(JSON.stringify(source), before);
assert.equal(inventory.summary.lineTargetCount, 2);
assert.equal(inventory.summary.componentTargetCount, 5);
assert.equal(inventory.summary.exactComponentCount, 4);
assert.equal(inventory.summary.blockedMissingComponentCount, 1);
assert.equal(inventory.summary.multiComponentLineCount, 1);

const s100 = inventory.lineTargets.find((target) => target.lineKey === 'S100');
assert.deepEqual(s100.sourceRecordIds, ['COMP-A', 'COMP-B', 'COMP-E']);
assert.deepEqual(s100.componentTargetIds, ['COMPONENT:COMP-A', 'COMPONENT:COMP-B', 'COMPONENT:COMP-E']);
assert.deepEqual(s100.branchIds, ['B1', 'B2', 'B4']);
assert.ok(s100.diagnostics.includes('MODEL_LINE_ID_CANONICALIZED'));

const missing = inventory.componentTargets.find((target) => target.sourceRecordId === 'COMP-D');
assert.equal(missing.status, 'BLOCKED_MISSING');
assert.equal(missing.lineKey, null);
assert.equal(missing.lineTargetId, null);
assert.deepEqual(missing.diagnostics, ['MODEL_LINE_ID_MISSING']);
assert.equal(inventory.lineTargets.some((target) => target.lineKey === 'S300'), false);
assert.ok(Object.isFrozen(inventory));
assert.ok(Object.isFrozen(inventory.lineTargets));
assert.ok(Object.isFrozen(inventory.componentTargets[0]));

expectCode(
  () => createCommonEnrichedTargetInventory({
    schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
    inventoryId: 'INV-DUP',
    sharedModel: sharedModel([component('DUP', 'S1', 'B1'), component('DUP', 'S2', 'B2')]),
  }),
  'COMMON_ENRICHED_DUPLICATE_IDENTITY',
);
expectCode(
  () => createCommonEnrichedTargetInventory({
    schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
    inventoryId: 'INV-STALE',
    sharedModel: { ...source, project: { datasetId: 'TAMPERED' } },
  }),
  'COMMON_ENRICHED_SOURCE_MODEL_STALE',
);
expectCode(
  () => requireCommonEnrichedTargetInventory({ ...inventory, inventoryId: 'TAMPERED' }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);
expectCode(
  () => requireCommonEnrichedTargetInventory({
    ...inventory,
    componentTargets: inventory.componentTargets.map((target) => target.sourceRecordId === 'COMP-D'
      ? { ...target, lineKey: 'S300', lineTargetId: 'LINE:S300' }
      : target),
  }),
  'COMMON_ENRICHED_TARGET_IDENTITY_INVALID',
);

console.log('PASS common enriched exact target inventory checks');
console.log(JSON.stringify({
  sourceModelHash: source.semanticHash,
  inventorySemanticHash: inventory.semanticHash,
  summary: inventory.summary,
}, null, 2));

function component(componentKey, lineId, branchId, options = {}) {
  return {
    componentKey,
    sourceEntityId: options.sourceEntityId || componentKey,
    name: options.name || componentKey,
    type: 'PIPE',
    identity: { lineId, branchId, systemId: '', zoneId: '' },
  };
}

function sharedModel(components) {
  const base = {
    schema: 'shared-piping-model/v1',
    project: { datasetId: 'EXACT-TARGET-FIXTURE' },
    units: { length: 'mm', force: 'N', mass: 'kg' },
    components,
    supports: [],
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function expectCode(action, code) {
  assert.throws(action, (error) => error?.code === code, `expected ${code}`);
}
