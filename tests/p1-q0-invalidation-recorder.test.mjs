import assert from 'node:assert/strict';
import test from 'node:test';
import {
  P1InvalidationRecorder,
  aggregateP1InvalidationEvidence,
} from '../scripts/p1/p1-invalidation-recorder.mjs';

test('P1-Q0 records action-scoped invocation counts without cross-run mixing', () => {
  const recorder = new P1InvalidationRecorder({
    executionId: 'p1-q0-test',
    exactHeadSha: 'a'.repeat(40),
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
    viewportRoute: 'WORKSPACE_STANDARD_VIEWPORT',
  });
  recorder.begin('CALCULATED_EVENT');
  recorder.record('VIEWPORT_PIPELINE', 12.5);
  recorder.record('THREE_SCENE_INSTALL', 4.25);
  recorder.end();
  recorder.begin('SELECTION_ONLY');
  recorder.end();

  const evidence = recorder.snapshot();
  assert.equal(evidence.runs.length, 2);
  assert.equal(evidence.runs[0].counts.VIEWPORT_PIPELINE, 1);
  assert.deepEqual(evidence.runs[0].durations.VIEWPORT_PIPELINE, [12.5]);
  assert.equal(evidence.runs[1].counts.VIEWPORT_PIPELINE, 0);

  const aggregate = aggregateP1InvalidationEvidence(evidence);
  assert.equal(aggregate.CALCULATED_EVENT.counts.THREE_SCENE_INSTALL, 1);
  assert.equal(aggregate.SELECTION_ONLY.counts.THREE_SCENE_INSTALL, 0);
});

test('P1-Q0 rejects overlapping actions and unsupported invocation IDs', () => {
  const recorder = new P1InvalidationRecorder({
    executionId: 'p1-q0-test',
    exactHeadSha: 'b'.repeat(40),
    fixtureRole: 'TOPOLOGY_EDIT_20_OBJECT',
    viewportRoute: 'TOPOLOGY_EDIT_VIEWPORT',
  });
  recorder.begin('INITIAL_IMPORT');
  assert.throws(() => recorder.begin('SELECTION_ONLY'), /still active/u);
  assert.throws(() => recorder.record('UNKNOWN_STAGE', 0), /Unsupported/u);
  recorder.end({ status: 'FAIL' });
  assert.equal(recorder.snapshot().runs[0].status, 'FAIL');
});
