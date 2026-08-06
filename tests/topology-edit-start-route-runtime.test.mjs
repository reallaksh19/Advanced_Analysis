import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  activateStartRouteRuntime,
  beginStartRouteRuntimeValidation,
  cancelStartRouteRuntime,
  completeStartRouteRuntimeValidation,
  createStartRouteRuntime,
  markStartRouteRuntimeApplied,
  markStartRouteStartPointAcquired,
  publishStartRouteGhost,
  updateStartRouteRuntimeSessionState,
} from '../src/workspace/viewport-productivity/topology-edit-start-route-runtime.js';

function preview() {
  const material = {
    schema: 'TopologyEditStartRoutePreview.v2',
    planHash: 'plan',
    candidateHash: 'candidate',
    priorSessionVersion: 0,
    priorJournalHash: 'journal-prior',
    priorCanonicalHash: 'canonical-prior',
    resultingJournalHash: 'journal-result',
    resultingCanonicalHash: 'canonical-result',
    catalogueHash: 'catalogue',
    graphExecutionHash: 'execution',
    materializedCommandHash: 'commands',
    operationBindingsHash: 'bindings',
    ghostAuthority: 'DISPLAY_ONLY_CANDIDATE_TOPOLOGY',
  };
  return { ...material, previewHash: semanticHash(material) };
}
function geometry() {
  const material = {
    startPointMm: { x: 0, y: 0, z: 0 },
    endPointMm: { x: 1000, y: 0, z: 0 },
    lengthMm: 1000,
    unitDirection: { x: 1, y: 0, z: 0 },
  };
  return { ...material, geometryHash: semanticHash(material) };
}

test('runtime session state cannot enter engineering references', () => {
  let state = activateStartRouteRuntime(createStartRouteRuntime());
  state = updateStartRouteRuntimeSessionState(state, {
    pointerCaptureId: 17,
    cameraToken: 'camera-a',
    hoverToken: 'hover-a',
  });
  state = markStartRouteStartPointAcquired(state);
  state = publishStartRouteGhost(state, preview(), geometry());
  const engineeringHash = state.engineeringReferenceHash;
  const changedSession = updateStartRouteRuntimeSessionState(state, {
    pointerCaptureId: 19,
    cameraToken: 'camera-b',
    hoverToken: 'hover-b',
  });
  assert.notEqual(changedSession.runtimeHash, state.runtimeHash);
  assert.equal(changedSession.engineeringReferenceHash, engineeringHash);
  assert.equal(changedSession.ghost.pickable, false);
  assert.equal(changedSession.ghost.canonicalMutation, false);
});

test('validation, Apply, and cancel release pointer and ghost state', () => {
  let state = activateStartRouteRuntime(createStartRouteRuntime());
  state = updateStartRouteRuntimeSessionState(state, { pointerCaptureId: 23 });
  state = markStartRouteStartPointAcquired(state);
  state = publishStartRouteGhost(state, preview(), geometry());
  state = beginStartRouteRuntimeValidation(state);
  state = completeStartRouteRuntimeValidation(state, {
    blockingIssueCount: 0,
    diagnostics: [],
  });
  assert.equal(state.phase, 'READY_TO_APPLY');
  assert.equal(state.pointerCaptureId, null);
  state = markStartRouteRuntimeApplied(state);
  assert.equal(state.phase, 'APPLIED');
  assert.equal(state.pointerCaptureId, null);
  assert.equal(state.ghost, null);

  const cancelled = cancelStartRouteRuntime(
    updateStartRouteRuntimeSessionState(
      activateStartRouteRuntime(createStartRouteRuntime()),
      { pointerCaptureId: 29, hoverToken: 'hover' },
    ),
  );
  assert.equal(cancelled.phase, 'IDLE');
  assert.equal(cancelled.pointerCaptureId, null);
  assert.equal(cancelled.hoverToken, null);
  assert.equal(cancelled.ghost, null);
});
