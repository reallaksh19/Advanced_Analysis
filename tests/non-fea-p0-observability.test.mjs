import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNonFeaP0ObservabilityEnabled,
  measureNonFeaP0Stage,
  readNonFeaP0StageDurations,
  recordNonFeaP0Duration,
} from '../src/workspace/non-fea-p0-observability.js';

const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');

test.afterEach(() => {
  performance.clearMeasures();
  if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
  else delete globalThis.location;
});

test('P0 observability is disabled unless the explicit query authority is present', () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search: '' },
  });
  let callCount = 0;
  const result = measureNonFeaP0Stage('FIT', () => {
    callCount += 1;
    return 17;
  });
  assert.equal(result, 17);
  assert.equal(callCount, 1);
  assert.equal(isNonFeaP0ObservabilityEnabled(), false);
  assert.deepEqual(readNonFeaP0StageDurations(), {});
});

test('P0 observability records deterministic aggregate stage durations when enabled', () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search: '?nonFeaP0Evidence=1' },
  });
  assert.equal(isNonFeaP0ObservabilityEnabled(), true);
  recordNonFeaP0Duration('GPU_SCENE_INSTALL', 2.5);
  recordNonFeaP0Duration('GPU_SCENE_INSTALL', 1.25);
  const value = measureNonFeaP0Stage('FIT', () => 'done');
  assert.equal(value, 'done');
  const totals = readNonFeaP0StageDurations();
  assert.equal(totals.GPU_SCENE_INSTALL, 3.75);
  assert.ok(Number.isFinite(totals.FIT));
  assert.ok(totals.FIT >= 0);
});

test('P0 observability rejects malformed evidence input', () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search: '?nonFeaP0Evidence=1' },
  });
  assert.throws(() => recordNonFeaP0Duration('bad stage', 1), /stage ID/u);
  assert.throws(() => recordNonFeaP0Duration('FIT', Number.NaN), /duration/u);
  assert.throws(() => measureNonFeaP0Stage('FIT', null), /callback/u);
});
