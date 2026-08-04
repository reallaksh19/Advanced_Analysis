import { aggregateP1InvalidationEvidence } from './p1-invalidation-recorder.mjs';
import {
  P1_REQUIRED_P0_STAGE_IDS,
  P1_THRESHOLDS,
  p1Failure,
} from './p1-contracts.mjs';

export function evaluateP1QualificationEvidence({
  p0Report,
  stageStatistics,
  browserEvidence,
  invalidationEvidence,
}) {
  const violations = [];
  const failures = [];
  requireP0StageCoverage(stageStatistics, failures);

  const normalizationRows = stageStatistics.filter((row) => (
    row.stageId === 'NORMALIZATION' && row.sampleCount > 0
  ));
  addMaximumMetric({
    violations,
    failures,
    metric: 'normalizationP95Ms',
    threshold: P1_THRESHOLDS.normalizationP95Ms,
    observed: maxFinite(normalizationRows.map((row) => row.p95Ms)),
    evidence: { source: 'P0_STAGE_STATISTICS' },
  });

  if (browserEvidence) {
    addMaximumMetric({
      violations, failures,
      metric: 'fileSelectionToFirstMeaningfulFrameMs',
      threshold: P1_THRESHOLDS.fileSelectionToFirstMeaningfulFrameMs,
      observed: browserEvidence.fileSelectionToFirstMeaningfulFrameMs,
      evidence: { source: 'P1_BROWSER_EVIDENCE' },
    });
    addMaximumMetric({
      violations, failures,
      metric: 'postParseMainThreadTaskMaxMs',
      threshold: P1_THRESHOLDS.postParseMainThreadTaskMaxMs,
      observed: browserEvidence.postParseMainThreadTaskMaxMs,
      evidence: { source: 'P1_BROWSER_EVIDENCE' },
    });
    addMaximumMetric({
      violations, failures,
      metric: 'orbitPanP95Ms',
      threshold: P1_THRESHOLDS.orbitPanP95Ms,
      observed: browserEvidence.orbitPanP95Ms,
      evidence: { source: 'P1_BROWSER_EVIDENCE' },
    });
    addMaximumMetric({
      violations, failures,
      metric: 'selectionP95Ms',
      threshold: P1_THRESHOLDS.selectionP95Ms,
      observed: browserEvidence.selectionP95Ms,
      evidence: { source: 'P1_BROWSER_EVIDENCE' },
    });
    addExactMetric({
      violations, failures,
      metric: 'canvasCount',
      threshold: P1_THRESHOLDS.canvasCount,
      observed: browserEvidence.canvasCount,
      evidence: { source: 'P1_BROWSER_EVIDENCE' },
    });
    addExactMetric({
      violations, failures,
      metric: 'webglCanvasCount',
      threshold: P1_THRESHOLDS.webglCanvasCount,
      observed: browserEvidence.webglCanvasCount,
      evidence: { source: 'P1_BROWSER_EVIDENCE' },
    });
    addExactMetric({
      violations, failures,
      metric: 'renderOwnerCount',
      threshold: P1_THRESHOLDS.renderOwnerCount,
      observed: browserEvidence.renderOwnerCount,
      evidence: { source: 'P1_BROWSER_EVIDENCE' },
    });
    addExactMetric({
      violations, failures,
      metric: 'pageErrorCount',
      threshold: P1_THRESHOLDS.pageErrorCount,
      observed: browserEvidence.pageErrors.length,
      evidence: { source: 'P1_BROWSER_EVIDENCE' },
    });
    if (browserEvidence.observabilityGaps.length) {
      failures.push(p1Failure(
        'P1_REQUIRED_STAGE_OBSERVABILITY_MISSING',
        'Required production substages are not independently observable on this exact head.',
        { stageIds: browserEvidence.observabilityGaps },
      ));
    }
  } else {
    for (const metric of [
      'fileSelectionToFirstMeaningfulFrameMs',
      'postParseMainThreadTaskMaxMs',
      'orbitPanP95Ms',
      'selectionP95Ms',
      'canvasCount',
      'webglCanvasCount',
      'renderOwnerCount',
      'pageErrorCount',
    ]) failures.push(missingMetric(metric));
  }

  return {
    violations,
    failures,
    recommendedFixes: recommendP1Fixes({
      invalidationEvidence,
      violations,
      browserEvidence,
    }),
  };
}

export function recommendP1Fixes({ invalidationEvidence, violations, browserEvidence }) {
  const recommendations = [];
  if (invalidationEvidence) {
    const aggregate = aggregateP1InvalidationEvidence(invalidationEvidence);
    const redundant = ['CALCULATED_EVENT', 'MASTER_DATA_CHANGED'].filter((actionId) => {
      const counts = aggregate[actionId]?.counts || {};
      return Number(counts.VIEWPORT_PIPELINE || 0) > 0
        || Number(counts.RENDER_MODEL_INSTALL_REQUEST || 0) > 0
        || Number(counts.THREE_SCENE_INSTALL || 0) > 0;
    });
    if (redundant.length) recommendations.push({
      rank: 1,
      fixId: 'P1-A1-REASON-AWARE-INVALIDATION',
      rationale: `Measured non-geometric events rebuild viewport geometry: ${redundant.join(', ')}.`,
      allowedWriteSet: ['src/workspace/viewport-panel.js', 'tests/**', 'e2e/**'],
      blockedBy: [],
    });
  }

  const slowImport = violations.some((row) => [
    'fileSelectionToFirstMeaningfulFrameMs',
    'postParseMainThreadTaskMaxMs',
  ].includes(row.metric));
  if (slowImport) recommendations.push({
    rank: recommendations.length + 1,
    fixId: 'P1-B1-TRANSACTIONAL-WORKSPACE-SCENE',
    rationale: 'Import-to-frame or post-parse main-thread timing exceeds the frozen threshold.',
    allowedWriteSet: [
      'src/workspace/three-viewport-scene.js',
      'src/workspace/three-viewport-backend.js',
      'tests/**',
      'e2e/**',
    ],
    blockedBy: recommendations.some((row) => row.fixId.startsWith('P1-A1'))
      ? ['P1-A1-REASON-AWARE-INVALIDATION']
      : [],
  });

  if (browserEvidence?.postParseMainThreadTaskMaxMs > P1_THRESHOLDS.postParseMainThreadTaskMaxMs) {
    recommendations.push({
      rank: recommendations.length + 1,
      fixId: 'P1-D1-BOUNDED-YIELDING-DECISION',
      rationale: 'A measured post-parse main-thread task exceeds 200 ms after simpler fixes.',
      allowedWriteSet: ['scripts/**', 'tests/**', 'e2e/**'],
      blockedBy: ['P1-A1-REASON-AWARE-INVALIDATION', 'P1-B1-TRANSACTIONAL-WORKSPACE-SCENE'],
    });
  }
  return recommendations;
}

function requireP0StageCoverage(rows, failures) {
  for (const stageId of P1_REQUIRED_P0_STAGE_IDS) {
    for (const sampleKind of ['COLD', 'WARM']) {
      const measured = rows.some((row) => row.stageId === stageId
        && row.sampleKind === sampleKind && row.sampleCount > 0
        && Number.isFinite(row.p95Ms));
      if (!measured) failures.push(p1Failure(
        'P1_REQUIRED_STAGE_METRIC_MISSING',
        `Required ${sampleKind} exact-fixture P0 stage evidence is missing: ${stageId}.`,
        { stageId, sampleKind },
      ));
    }
  }
}
function addMaximumMetric({ violations, failures, metric, threshold, observed, evidence }) {
  if (!Number.isFinite(observed)) {
    failures.push(missingMetric(metric));
    return;
  }
  if (observed > threshold) violations.push({ metric, threshold, observed, comparison: '<=', evidence });
}
function addExactMetric({ violations, failures, metric, threshold, observed, evidence }) {
  if (!Number.isFinite(observed)) {
    failures.push(missingMetric(metric));
    return;
  }
  if (observed !== threshold) violations.push({ metric, threshold, observed, comparison: '===', evidence });
}
function missingMetric(metric) {
  return p1Failure('P1_REQUIRED_METRIC_MISSING',
    `Required P1 metric is missing: ${metric}.`, { metric });
}
function maxFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}
