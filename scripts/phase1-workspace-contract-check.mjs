import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EventBus } from '../src/workspace/event-bus.js';
import { EVENT_TOPICS } from '../src/workspace/event-topics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = [
  'src/workspace/event-bus.js',
  'src/workspace/event-topics.js',
  'src/workspace/tree-panel.js',
  'src/workspace/properties-panel.js',
  'src/workspace/viewport-panel.js',
  'src/workspace/workspace-layout.js',
  'src/workspace/bootstrap.js',
];

for (const relativePath of modules) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  const lineCount = source.split(/\r?\n/).length;
  assert.ok(lineCount <= 300, `${relativePath} exceeds 300 lines (${lineCount}).`);
}

for (const relativePath of [
  'src/workspace/tree-panel.js',
  'src/workspace/properties-panel.js',
  'src/workspace/viewport-panel.js',
]) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  assert.doesNotMatch(source, /document\.(querySelector|getElementById)/, `${relativePath} crosses its panel root.`);
}

const css = await readFile(path.join(root, 'src/workspace/workspace.css'), 'utf8');
assert.match(css, /grid-template-columns:\s*300px minmax\(0, 1fr\) 350px;/);
assert.match(css, /height:\s*100vh;/);
assert.match(css, /overflow:\s*hidden;/);

assert.equal(EVENT_TOPICS.DATASET_LOADED, 'dataset:loaded');
assert.equal(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, 'viewport:entitySelected');
assert.equal(EVENT_TOPICS.ANALYSIS_REQUESTED, 'analysis:requested');

let receivedPayload = null;
const unsubscribe = EventBus.subscribe(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, (payload) => {
  receivedPayload = payload;
});

EventBus.publish(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, {
  entityId: 'PIPE-102',
  properties: { material: 'Steel' },
});

assert.equal(receivedPayload.entityId, 'PIPE-102');
assert.equal(receivedPayload.properties.material, 'Steel');
assert.equal(EventBus.listenerCount(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED), 1);

unsubscribe();
assert.equal(EventBus.listenerCount(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED), 0);

assert.throws(
  () => EventBus.publish(EVENT_TOPICS.DATASET_LOADED, { datasetId: 'BAD', nodeCount: -1 }),
  /non-negative integer/,
);
assert.throws(
  () => EventBus.publish(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, {
    entityId: 'PIPE-102',
    type: 'valve',
  }),
  /pipe.*support/,
);

const deliveryOrder = [];
const unsubscribeFailure = EventBus.subscribe(EVENT_TOPICS.ANALYSIS_REQUESTED, () => {
  deliveryOrder.push('first');
  throw new Error('listener failure');
});
const unsubscribeSuccess = EventBus.subscribe(EVENT_TOPICS.ANALYSIS_REQUESTED, () => {
  deliveryOrder.push('second');
});

assert.throws(
  () => EventBus.publish(EVENT_TOPICS.ANALYSIS_REQUESTED, {
    analysisType: 'pipe-screening',
    targetId: 'PIPE-102',
  }),
  /listener failure/,
);
assert.deepEqual(deliveryOrder, ['first', 'second']);

unsubscribeFailure();
unsubscribeSuccess();
assert.equal(EventBus.listenerCount(EVENT_TOPICS.ANALYSIS_REQUESTED), 0);

console.log('Phase 1 workspace contract check passed.');