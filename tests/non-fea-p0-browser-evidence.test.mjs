import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NON_FEA_BROWSER_EVIDENCE_SCHEMA,
  NON_FEA_BROWSER_STAGE_IDS,
  requireNonFeaBrowserEvidence,
} from '../scripts/non-fea-baseline/browser-baseline.mjs';

const HEAD = 'a'.repeat(40);
const SOURCE = 'b'.repeat(64);

function evidence(overrides = {}) {
  return {
    schema: NON_FEA_BROWSER_EVIDENCE_SCHEMA,
    executionId: 'p0-browser-test',
    exactHeadSha: HEAD,
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
    fixturePath: 'private-cache/large-model.json',
    sourceSha256: SOURCE,
    browser: 'Google Chrome 150',
    os: 'Windows 11',
    devicePixelRatio: 1,
    viewport: { width: 1280, height: 720 },
    workers: 1,
    pageErrors: [],
    longTaskSupport: true,
    longTasks: [],
    stageMeasurements: NON_FEA_BROWSER_STAGE_IDS.map((stageId, index) => ({
      stageId,
      durationMs: index + 1,
    })),
    canvasCount: 1,
    webglCanvasCount: 1,
    renderOwnerCount: 1,
    ...overrides,
  };
}

test('P0 browser evidence accepts exact-head complete stage coverage', () => {
  const value = requireNonFeaBrowserEvidence(evidence(), {
    executionId: 'p0-browser-test',
    exactHeadSha: HEAD,
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
  });
  assert.equal(value.canvasCount, 1);
  assert.ok(Object.isFrozen(value));
});

test('P0 browser evidence rejects missing measured stages', () => {
  assert.throws(() => requireNonFeaBrowserEvidence(evidence({
    stageMeasurements: evidence().stageMeasurements.slice(1),
  })), /P0_BROWSER_STAGE_COVERAGE_INVALID/u);
});

test('P0 browser evidence rejects duplicate canvas or render ownership', () => {
  assert.throws(
    () => requireNonFeaBrowserEvidence(evidence({ canvasCount: 2 })),
    /P0_BROWSER_CANVAS_COUNT_INVALID/u,
  );
  assert.throws(
    () => requireNonFeaBrowserEvidence(evidence({ renderOwnerCount: 2 })),
    /P0_BROWSER_RENDER_OWNER_COUNT_INVALID/u,
  );
});

test('P0 browser evidence rejects stale head and page errors', () => {
  assert.throws(() => requireNonFeaBrowserEvidence(evidence(), {
    exactHeadSha: 'c'.repeat(40),
  }), /P0_BROWSER_HEAD_SHA_MISMATCH/u);
  assert.throws(
    () => requireNonFeaBrowserEvidence(evidence({ pageErrors: ['boom'] })),
    /P0_BROWSER_PAGE_ERRORS_PRESENT/u,
  );
});
