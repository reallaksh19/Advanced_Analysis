import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  P1_REQUIRED_P0_STAGE_IDS,
  P1_REQUIRED_STAGE_OBSERVABILITY_IDS,
  P1_THRESHOLDS,
} from '../scripts/p1/p1-contracts.mjs';
import { requireP1QualificationReport } from '../scripts/p1/p1-report-validator.mjs';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const SHA = 'c'.repeat(64);
const HASH = 'fnv1a64:0123456789abcdef';
const FIXTURE = 'cache/large-model.json';

function invalidationEvidence() {
  return {
    schema: 'non-fea-p1-invalidation-evidence/v1',
    executionId: 'p1-q0-test',
    exactHeadSha: HEAD,
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
    viewportRoute: 'WORKSPACE_STANDARD_VIEWPORT',
    actionIds: [
      'INITIAL_IMPORT', 'SELECTION_ONLY', 'ORBIT_PAN', 'MODEL_ZONE_CHANGE',
      'CALCULATED_EVENT', 'MASTER_DATA_CHANGED', 'PROJECT_DATA_CHANGED',
      'CLEAR_RELOAD', 'CONTEXT_RESTORATION',
    ],
    invocationIds: [
      'NORMALIZATION_REQUEST', 'ENGINEERING_MODEL_REBUILD', 'VIEWPORT_PIPELINE',
      'RENDER_MODEL_INSTALL_REQUEST', 'THREE_SCENE_INSTALL', 'RENDER_FRAME',
    ],
    runs: [],
  };
}
function browserEvidence() {
  return {
    schema: 'non-fea-p1-browser-evidence/v1',
    executionId: 'p1-q0-test',
    exactHeadSha: HEAD,
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
    fixturePath: FIXTURE,
    sourceSha256: SHA,
    browser: 'chromium',
    os: 'linux',
    viewport: { width: 1600, height: 1000, devicePixelRatio: 1 },
    sampleCounts: { selection: 2, orbitPan: 2 },
    stageMeasurements: [
      { stageId: 'FILE_SELECTION_TO_FIRST_MEANINGFUL_FRAME', durationMs: 6000 },
      { stageId: 'POST_PARSE_MAIN_THREAD_TASK', durationMs: 250 },
      { stageId: 'SELECTION', durationMs: 50 },
      { stageId: 'ORBIT_PAN', durationMs: 20 },
    ],
    detailedStageMeasurements: P1_REQUIRED_STAGE_OBSERVABILITY_IDS.map((stageId) => ({
      stageId,
      durationMs: 1,
    })),
    selectionSamplesMs: [40, 50],
    orbitPanFrameSamplesMs: [18, 20],
    selectionP95Ms: 50,
    orbitPanP95Ms: 20,
    fileSelectionToFirstMeaningfulFrameMs: 6000,
    postParseMainThreadTaskMaxMs: 250,
    pageErrors: [],
    longTaskSupport: true,
    longTasks: [{ startTimeMs: 100, durationMs: 250 }],
    canvasCount: 1,
    webglCanvasCount: 1,
    renderOwnerCount: 1,
    observabilityGaps: [],
    invalidationEvidence: invalidationEvidence(),
  };
}
function completeStageStatistics() {
  return P1_REQUIRED_P0_STAGE_IDS.flatMap((stageId) => ['COLD', 'WARM'].map(
    (sampleKind) => ({
      fixturePath: FIXTURE,
      sampleKind,
      stageId,
      sampleCount: 1,
      medianMs: 1,
      p95Ms: 1,
      maxMs: 1,
    }),
  ));
}
function manifest() {
  const diagnosticManifest = [];
  const canonicalObjectManifest = [];
  const pickTargetManifest = [];
  const sceneBounds = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 1, y: 1, z: 1 },
    center: { x: 0.5, y: 0.5, z: 0.5 },
    size: { x: 1, y: 1, z: 1 },
  };
  return {
    schema: 'non-fea-p1-protected-manifest/v1',
    exactHeadSha: HEAD,
    executionId: 'p1-q0-test',
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
    fixturePath: FIXTURE,
    sourceSha256: SHA,
    sourcePackageHash: HASH,
    sourcePackageHashAfter: HASH,
    sourceMutationStatus: 'UNCHANGED',
    materializationAuthority: 'PRODUCTION_RENDER_THREE_MODEL',
    datasetHash: HASH,
    hierarchyHash: HASH,
    sharedModelHash: HASH,
    supportSiteHash: HASH,
    routePartitionHash: HASH,
    modelZoneHash: HASH,
    resolvedGeometryHash: HASH,
    renderModelHash: HASH,
    diagnosticManifestHash: semanticHash(diagnosticManifest),
    canonicalObjectManifestHash: semanticHash(canonicalObjectManifest),
    pickTargetManifestHash: semanticHash(pickTargetManifest),
    sceneBoundsHash: semanticHash(sceneBounds),
    diagnosticManifest,
    canonicalObjectManifest,
    pickTargetManifest,
    sceneBounds,
    counts: {
      entityCount: 4884,
      diagnosticCount: 0,
      renderItemCount: 0,
      materializedPickRootCount: 0,
      materializedPickNodeCount: 0,
    },
  };
}
function baseReport(overrides = {}) {
  return {
    schema: 'non-fea-p1-qualification/v1',
    status: 'BLOCKED',
    exactHeadSha: HEAD,
    baseCommitSha: BASE,
    executionId: 'p1-q0-test',
    generatedAt: '2026-08-04T00:00:00.000Z',
    p0Evidence: {
      reportPath: 'reports/non-fea-current-main-baseline.json',
      reportSha256: SHA,
      reportStatus: null,
      exactHeadSha: null,
      accepted: false,
      acceptancePath: null,
      acceptanceStatus: null,
    },
    fixture: {
      role: 'LARGE_MODEL_4884_ENTITY',
      path: null,
      sourceSha256: null,
      authorityStatus: 'UNRESOLVED',
    },
    thresholds: { ...P1_THRESHOLDS },
    stageStatistics: [],
    browserEvidence: null,
    invalidationEvidence: null,
    protectedManifest: null,
    violations: [],
    recommendedFixes: [],
    failures: [
      ...P1_REQUIRED_P0_STAGE_IDS.flatMap((stageId) => ['COLD', 'WARM'].map(
        (sampleKind) => ({
          code: 'P1_REQUIRED_STAGE_METRIC_MISSING',
          message: `Required ${sampleKind} exact-fixture P0 stage evidence is missing: ${stageId}.`,
          details: { stageId, sampleKind },
        }),
      )),
      { code: 'P1_REQUIRED_METRIC_MISSING', message: 'Required P1 metric is missing: normalizationP95Ms.', details: { metric: 'normalizationP95Ms' } },
      ...[
        'fileSelectionToFirstMeaningfulFrameMs', 'postParseMainThreadTaskMaxMs',
        'orbitPanP95Ms', 'selectionP95Ms', 'canvasCount', 'webglCanvasCount',
        'renderOwnerCount', 'pageErrorCount',
      ].map((metric) => ({
        code: 'P1_REQUIRED_METRIC_MISSING',
        message: `Required P1 metric is missing: ${metric}.`,
        details: { metric },
      })),
    ],
    ...overrides,
  };
}
function qualifiedReport() {
  const browser = browserEvidence();
  return baseReport({
    status: 'QUALIFIED_FOR_FIX',
    p0Evidence: {
      reportPath: 'reports/non-fea-current-main-baseline.json',
      reportSha256: SHA,
      reportStatus: 'PASS',
      exactHeadSha: BASE,
      accepted: true,
      acceptancePath: 'reports/non-fea-p0-owner-acceptance.json',
      acceptanceStatus: 'ACCEPTED',
    },
    fixture: {
      role: 'LARGE_MODEL_4884_ENTITY',
      path: FIXTURE,
      sourceSha256: SHA,
      authorityStatus: 'VERIFIED',
    },
    stageStatistics: completeStageStatistics(),
    browserEvidence: browser,
    invalidationEvidence: browser.invalidationEvidence,
    protectedManifest: manifest(),
    violations: [
      { metric: 'fileSelectionToFirstMeaningfulFrameMs', threshold: 5000, observed: 6000, comparison: '<=', evidence: { source: 'P1_BROWSER_EVIDENCE' } },
      { metric: 'postParseMainThreadTaskMaxMs', threshold: 200, observed: 250, comparison: '<=', evidence: { source: 'P1_BROWSER_EVIDENCE' } },
    ],
    recommendedFixes: [
      {
        rank: 1,
        fixId: 'P1-B1-TRANSACTIONAL-WORKSPACE-SCENE',
        rationale: 'Import-to-frame or post-parse main-thread timing exceeds the frozen threshold.',
        allowedWriteSet: [
          'src/workspace/three-viewport-scene.js',
          'src/workspace/three-viewport-backend.js',
          'tests/**',
          'e2e/**',
        ],
        blockedBy: [],
      },
      {
        rank: 2,
        fixId: 'P1-D1-BOUNDED-YIELDING-DECISION',
        rationale: 'A measured post-parse main-thread task exceeds 200 ms after simpler fixes.',
        allowedWriteSet: ['scripts/**', 'tests/**', 'e2e/**'],
        blockedBy: ['P1-A1-REASON-AWARE-INVALIDATION', 'P1-B1-TRANSACTIONAL-WORKSPACE-SCENE'],
      },
    ],
    failures: [],
  });
}

test('P1-Q0 accepts explicit blocking and rejects silent blocking', () => {
  assert.equal(requireP1QualificationReport(baseReport()).status, 'BLOCKED');
  assert.throws(() => requireP1QualificationReport(baseReport({ failures: [] })),
    /P1_REPORT_REQUIRED_FAILURE_MISSING/u);
});

test('P1-Q0 permits fix qualification only with complete accepted evidence', () => {
  const report = qualifiedReport();
  assert.equal(requireP1QualificationReport(report).status, 'QUALIFIED_FOR_FIX');
  const unauthorized = structuredClone(report);
  unauthorized.p0Evidence.accepted = false;
  assert.throws(() => requireP1QualificationReport(unauthorized),
    /P1_REPORT_NONBLOCKED_WITH_INCOMPLETE_EVIDENCE/u);
});

test('P1-Q0 rejects non-blocked reports with incomplete P0 stage evidence', () => {
  const report = qualifiedReport();
  report.stageStatistics.pop();
  assert.throws(() => requireP1QualificationReport(report),
    /P1_REPORT_REQUIRED_FAILURE_MISSING|P1_REPORT_NONBLOCKED_WITH_INCOMPLETE_EVIDENCE/u);
});

test('P1-Q0 blocks qualification when stage observability is incomplete', () => {
  const report = qualifiedReport();
  report.status = 'BLOCKED';
  const stageId = 'SUPPORT_SITE_CONSTRUCTION';
  report.browserEvidence.detailedStageMeasurements
    .find((row) => row.stageId === stageId).durationMs = null;
  report.browserEvidence.observabilityGaps = [stageId];
  report.failures = [{
    code: 'P1_REQUIRED_STAGE_OBSERVABILITY_MISSING',
    message: 'Required production substages are not independently observable on this exact head.',
    details: { stageIds: [stageId] },
  }];
  assert.equal(requireP1QualificationReport(report).status, 'BLOCKED');
});

test('P1-Q0 validates current-head render owner evidence', () => {
  const report = qualifiedReport();
  report.browserEvidence.renderOwnerCount = -1;
  assert.throws(() => requireP1QualificationReport(report), /renderOwnerCount/u);
});
