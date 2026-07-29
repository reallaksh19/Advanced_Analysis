import { executeLfeaWorkbench } from './lfea-workbench-pipeline.js';
import { failedState, freeze, isRecord, requirePackage } from './lfea-workbench-state.js';
import {
  cancellationDiagnostic,
  sameRunIdentity,
  serializableLfeaExecutionError,
  userCancellation,
} from './lfea-workbench-run-state.js';

export function createLfeaWorkbenchRunStore(options) {
  const {
    getState,
    publish,
    nextRunId,
    pipelineOptions,
  } = options;

  function run() {
    const running = beginRun();
    const identity = running.activeRun;
    try {
      const execution = executeLfeaWorkbench(
        requirePackage(running),
        pipelineOptions,
      );
      return completeRun({ type: 'COMPLETE', ...identity, execution });
    } catch (error) {
      return failRun({
        type: 'FAILURE',
        ...identity,
        error: serializableLfeaExecutionError(error),
      });
    }
  }

  function beginRun() {
    const state = getState();
    const packageValue = requirePackage(state);
    if (state.activeRun) throw new TypeError('An LFEA run is already active.');
    const activeRun = freeze({
      runId: nextRunId(),
      inputSemanticHash: packageValue.semanticHash,
      inputModelVersion: state.modelVersion,
    });
    return publish({
      ...state,
      status: 'RUNNING',
      activeRun,
      execution: null,
      progress: freeze({ ...activeRun, stage: 'QUEUED', index: 0, total: 7 }),
      display: { ...state.display, resultMode: 'MODEL' },
      diagnostics: [],
    });
  }

  function updateRunProgress(message) {
    const state = getState();
    const mismatch = runMessageMismatch(state, message);
    if (mismatch) return rejectRunMessage(state, message, 'PROGRESS', mismatch);
    const progress = isRecord(message.progress) ? message.progress : {};
    return publish({
      ...state,
      progress: freeze({
        runId: message.runId,
        inputSemanticHash: message.inputSemanticHash,
        inputModelVersion: message.inputModelVersion,
        ...structuredClone(progress),
      }),
    });
  }

  function completeRun(message) {
    if (!isRecord(message) || !isRecord(message.execution)) {
      throw new TypeError('LFEA completion message must contain an execution object.');
    }
    const state = getState();
    const mismatch = runMessageMismatch(state, message);
    if (mismatch) return rejectRunMessage(state, message, 'COMPLETE', mismatch);
    const execution = freeze({
      ...structuredClone(message.execution),
      runId: message.runId,
      inputSemanticHash: message.inputSemanticHash,
      inputModelVersion: message.inputModelVersion,
    });
    return publish({
      ...state,
      status: execution.status,
      activeRun: null,
      execution,
      progress: null,
      diagnostics: execution.diagnostics ?? [],
    });
  }

  function failRun(message) {
    const state = getState();
    const failure = normalizeFailureMessage(message, state.activeRun);
    const mismatch = runMessageMismatch(state, failure);
    if (mismatch) return rejectRunMessage(state, failure, 'FAILURE', mismatch);
    const error = new Error(failure.error?.message || 'LFEA worker execution failed.');
    error.name = failure.error?.name || 'Error';
    if (typeof failure.error?.code === 'string') error.code = failure.error.code;
    const failed = failedState(state, error, 'LFEA_WORKER_FAILURE');
    return publish({
      ...failed,
      activeRun: null,
      execution: null,
      progress: null,
      display: { ...state.display, resultMode: 'MODEL' },
      diagnostics: failed.diagnostics.map((row) => ({
        ...row,
        runId: failure.runId,
        inputSemanticHash: failure.inputSemanticHash,
        inputModelVersion: failure.inputModelVersion,
      })),
    });
  }

  function cancelRun(cancellation) {
    const state = getState();
    if (!state.activeRun) return state;
    const evidence = isRecord(cancellation)
      ? cancellation
      : userCancellation(state.activeRun);
    if (!sameRunIdentity(evidence, state.activeRun)) return state;
    const code = evidence.code === 'LFEA_RUN_CANCELLED_MODEL_CHANGED'
      ? evidence.code
      : 'LFEA_RUN_CANCELLED';
    return publish({
      ...state,
      status: state.packageValue ? 'READY' : 'EMPTY',
      activeRun: null,
      execution: null,
      progress: null,
      display: { ...state.display, resultMode: 'MODEL' },
      diagnostics: [cancellationDiagnostic(evidence, code)],
    });
  }

  function runMessageMismatch(state, message) {
    const activeRun = state.activeRun;
    if (!activeRun) return 'LFEA_STALE_RESULT_REJECTED';
    if (message?.runId !== activeRun.runId) return 'LFEA_RUN_ID_MISMATCH';
    if (message?.inputSemanticHash !== activeRun.inputSemanticHash) {
      return 'LFEA_RUN_INPUT_HASH_MISMATCH';
    }
    if (message?.inputModelVersion !== activeRun.inputModelVersion) {
      return 'LFEA_RUN_MODEL_VERSION_MISMATCH';
    }
    if (state.packageValue?.semanticHash !== activeRun.inputSemanticHash) {
      return 'LFEA_STALE_RESULT_REJECTED';
    }
    return null;
  }

  function rejectRunMessage(state, message, messageType, code) {
    return publish({
      ...state,
      diagnostics: [{
        severity: 'WARNING',
        code,
        message: `Rejected stale or mismatched LFEA ${messageType.toLowerCase()} message.`,
        messageType,
        rejected: true,
        runId: message?.runId ?? null,
        inputSemanticHash: message?.inputSemanticHash ?? null,
        inputModelVersion: message?.inputModelVersion ?? null,
        activeRun: state.activeRun ? { ...state.activeRun } : null,
      }],
    });
  }

  return Object.freeze({
    run,
    beginRun,
    updateRunProgress,
    completeRun,
    failRun,
    cancelRun,
  });
}

function normalizeFailureMessage(message, activeRun) {
  if (isRecord(message?.workerMessage)) return message.workerMessage;
  if (isRecord(message) && typeof message.runId === 'string') return message;
  return {
    type: 'FAILURE',
    ...(activeRun ?? {}),
    error: serializableLfeaExecutionError(message),
  };
}
