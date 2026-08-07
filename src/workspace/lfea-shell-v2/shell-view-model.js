import { LFEA_PIPELINE_STAGES } from '../lfea-pipeline-stages.js';

const STEP_STATE = Object.freeze({
  COMPLETE: 'Complete',
  RUNNING: 'Running',
  WARNING: 'Warning',
  BLOCKED: 'Blocked',
  NOT_RUN: 'Not run',
});

export function createLfeaShellViewModel(state, runTrace = null) {
  const packageValue = state.packageValue;
  const execution = state.execution;
  return Object.freeze({
    status: state.status,
    identity: Object.freeze({
      semanticHash: packageValue?.semanticHash ?? null,
      modelVersion: state.modelVersion,
      runId: state.activeRun?.runId ?? execution?.runId ?? null,
      inputSemanticHash: state.activeRun?.inputSemanticHash
        ?? execution?.inputSemanticHash ?? null,
      inputModelVersion: state.activeRun?.inputModelVersion
        ?? execution?.inputModelVersion ?? null,
    }),
    commands: Object.freeze({
      canRun: Boolean(packageValue) && state.status !== 'RUNNING',
      canCancel: state.status === 'RUNNING',
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      canExportPackage: Boolean(packageValue),
      canExportEvidence: isCurrentQualifiedExport(state),
    }),
    navigator: navigatorModel(packageValue, execution),
    pipeline: pipelineModel(state, runTrace),
    fidelity: fidelitySnapshot(state),
  });
}

export function captureRunTrace(state, previous = null) {
  if (!state.activeRun || !state.progress) return previous;
  return Object.freeze({
    runId: state.activeRun.runId,
    inputSemanticHash: state.activeRun.inputSemanticHash,
    inputModelVersion: state.activeRun.inputModelVersion,
    stage: state.progress.stage,
    index: state.progress.index,
    total: state.progress.total,
  });
}

export function traceMatchesDiagnostic(trace, diagnostic) {
  return Boolean(trace)
    && diagnostic?.runId === trace.runId
    && diagnostic?.inputSemanticHash === trace.inputSemanticHash
    && diagnostic?.inputModelVersion === trace.inputModelVersion;
}

function navigatorModel(packageValue, execution) {
  const analysis = packageValue?.analysisDefinition ?? {};
  const loadCase = analysis.loadCase ?? {};
  return Object.freeze({
    nodes: packageValue?.nodes?.length ?? 0,
    elements: packageValue?.elements?.length ?? 0,
    materials: packageValue?.materials?.length ?? 0,
    regions: packageValue?.regions?.length ?? 0,
    constraints: analysis.constraints?.length ?? 0,
    loads: (loadCase.pointForces?.length ?? 0)
      + (loadCase.boundaryTractions?.length ?? 0)
      + (loadCase.boundaryPressures?.length ?? 0),
    hasResults: Boolean(execution?.result),
    hasReview: Boolean(execution?.review),
    hasExport: execution?.evidenceExport?.status === 'QUALIFIED_EXPORT',
  });
}

function pipelineModel(state, runTrace) {
  if (state.activeRun && state.progress) return runningPipeline(state.progress);
  if (state.execution) return executionPipeline(state.execution);
  const diagnostic = state.diagnostics?.[0];
  if (diagnostic?.code === 'LFEA_RUN_CANCELLED_MODEL_CHANGED') {
    return stages(() => STEP_STATE.NOT_RUN);
  }
  if (diagnostic?.code === 'LFEA_RUN_CANCELLED'
    && traceMatchesDiagnostic(runTrace, diagnostic)) {
    return cancelledPipeline(runTrace);
  }
  return stages(() => STEP_STATE.NOT_RUN);
}

function runningPipeline(progress) {
  const current = Math.max(0, LFEA_PIPELINE_STAGES.indexOf(progress.stage));
  return stages((_, index) => {
    if (index < current) return STEP_STATE.COMPLETE;
    if (index === current) return STEP_STATE.RUNNING;
    return STEP_STATE.NOT_RUN;
  });
}

function cancelledPipeline(trace) {
  const current = Math.max(0, LFEA_PIPELINE_STAGES.indexOf(trace.stage));
  return stages((_, index) => {
    if (index < current) return STEP_STATE.COMPLETE;
    if (index === current) return STEP_STATE.WARNING;
    return STEP_STATE.NOT_RUN;
  });
}

function executionPipeline(execution) {
  const preflight = execution.preflight;
  if (preflight?.status === 'BLOCKED_BY_DECLARED_CAPACITY') {
    return stages((stage) => stage === 'VALIDATE'
      ? STEP_STATE.COMPLETE
      : stage === 'PREFLIGHT' ? STEP_STATE.BLOCKED : STEP_STATE.NOT_RUN);
  }
  if (preflight?.status === 'EXPORT_LIKELY_TO_EXCEED_BYTE_CAPACITY'
    && execution.result?.status === 'QUALIFIED'
    && !execution.evidenceExport) {
    return stages((stage) => {
      if (stage === 'PREFLIGHT') return STEP_STATE.WARNING;
      if (['VALIDATE', 'ADAPT', 'SOLVE'].includes(stage)) return STEP_STATE.COMPLETE;
      if (stage === 'EXPORT') return STEP_STATE.BLOCKED;
      return STEP_STATE.NOT_RUN;
    });
  }
  if (execution.status === 'QUALIFIED'
    && execution.evidenceExport?.status === 'QUALIFIED_EXPORT') {
    return stages((stage) => stage === 'PREFLIGHT' && preflightWarning(preflight)
      ? STEP_STATE.WARNING : STEP_STATE.COMPLETE);
  }
  const failed = normalizeFailedStage(execution.failedStage);
  const failedIndex = LFEA_PIPELINE_STAGES.indexOf(failed);
  return stages((stage, index) => {
    if (stage === 'PREFLIGHT' && preflightWarning(preflight)) return STEP_STATE.WARNING;
    if (failedIndex < 0) return STEP_STATE.NOT_RUN;
    if (index < failedIndex) return STEP_STATE.COMPLETE;
    if (index === failedIndex) return STEP_STATE.BLOCKED;
    return STEP_STATE.NOT_RUN;
  });
}

function stages(resolve) {
  return Object.freeze(LFEA_PIPELINE_STAGES.map((stage, index) => Object.freeze({
    stage,
    state: resolve(stage, index),
  })));
}

function preflightWarning(preflight) {
  return preflight?.status === 'EXPORT_LIKELY_TO_EXCEED_BYTE_CAPACITY';
}

function normalizeFailedStage(value) {
  if (value === 'VALIDATION') return 'VALIDATE';
  if (value === 'ADAPTER') return 'ADAPT';
  if (value === 'SOLVER') return 'SOLVE';
  return value ?? null;
}

function isCurrentQualifiedExport(state) {
  return Boolean(state.execution)
    && state.execution.inputSemanticHash === state.packageValue?.semanticHash
    && state.execution.inputModelVersion === state.modelVersion
    && state.execution.evidenceExport?.status === 'QUALIFIED_EXPORT';
}

function fidelitySnapshot(state) {
  const execution = state.execution;
  return Object.freeze({
    packageSemanticHash: String(state.packageValue?.semanticHash ?? ''),
    modelVersion: String(state.modelVersion),
    executionRunId: String(execution?.runId ?? ''),
    executionSemanticHash: String(execution?.result?.semanticHash ?? ''),
    reviewSemanticHash: String(execution?.review?.semanticHash ?? ''),
    evidenceExportSemanticHash: String(execution?.evidenceExport?.semanticHash ?? ''),
    preflightStatus: String(execution?.preflight?.status ?? ''),
    resultStatus: String(execution?.result?.status ?? ''),
    reviewStatus: String(execution?.review?.status ?? ''),
    evidenceExportStatus: String(execution?.evidenceExport?.status ?? ''),
    resultMode: String(state.display?.resultMode ?? ''),
    deformationScale: String(state.display?.deformationScale ?? ''),
  });
}

export { STEP_STATE as LFEA_SHELL_STEP_STATE };
