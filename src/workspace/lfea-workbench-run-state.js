import { assertResultMode, failedState, isRecord } from './lfea-workbench-state.js';

export function assertLfeaWorkbenchStateInvariants(state) {
  if (!isRecord(state)) throw new TypeError('LFEA workbench state must be an object.');
  if (!Number.isInteger(state.modelVersion) || state.modelVersion < 0) {
    throw new TypeError('LFEA modelVersion must be a non-negative integer.');
  }
  if (state.activeRun && state.status !== 'RUNNING') {
    throw new TypeError('LFEA activeRun requires RUNNING status.');
  }
  if (state.status === 'RUNNING' && !state.activeRun) {
    throw new TypeError('LFEA RUNNING status requires activeRun.');
  }
  if (state.execution && state.activeRun) {
    throw new TypeError('Current LFEA execution and activeRun are mutually exclusive.');
  }
  if (state.execution
    && state.execution.inputSemanticHash !== state.packageValue?.semanticHash) {
    throw new TypeError('Current LFEA execution hash must equal the package hash.');
  }
  if (state.execution
    && state.execution.inputModelVersion !== state.modelVersion) {
    throw new TypeError('Current LFEA execution model version must equal modelVersion.');
  }
  if (state.activeRun
    && state.activeRun.inputSemanticHash !== state.packageValue?.semanticHash) {
    throw new TypeError('Active LFEA run hash must equal the package hash.');
  }
  assertResultMode(state.display?.resultMode);
  assertDeformationScale(state.display?.deformationScale);
  if (state.display?.resultMode === 'DEFORMED'
    && !hasQualifiedLfeaDisplacementResult(state.execution)) {
    throw new TypeError('DEFORMED mode requires a current qualified displacement result.');
  }
  return true;
}

export function cancellationDiagnostic(evidence, code) {
  return {
    severity: 'WARNING',
    code,
    message: code === 'LFEA_RUN_CANCELLED_MODEL_CHANGED'
      ? 'LFEA execution was cancelled because the committed model changed.'
      : 'LFEA execution was cancelled before qualification completed.',
    reason: evidence.reason ?? null,
    ...runIdentity(evidence),
  };
}

export function modelChangedCancellation(activeRun) {
  return {
    type: 'CANCELLED',
    ...activeRun,
    reason: 'MODEL_CHANGED',
    code: 'LFEA_RUN_CANCELLED_MODEL_CHANGED',
  };
}

export function userCancellation(activeRun) {
  return {
    type: 'CANCELLED',
    ...activeRun,
    reason: 'USER',
    code: 'LFEA_RUN_CANCELLED',
  };
}

export function sameRunIdentity(left, right) {
  return left?.runId === right?.runId
    && left?.inputSemanticHash === right?.inputSemanticHash
    && left?.inputModelVersion === right?.inputModelVersion;
}

export function editFailureState(current, error, fallbackCode) {
  const failed = failedState(current, error, fallbackCode);
  return current.activeRun ? { ...failed, status: 'RUNNING' } : failed;
}

export function displayFailureState(current, code, message) {
  return {
    ...current,
    diagnostics: [{ severity: 'ERROR', code, message }],
  };
}

export function assertDeformationScale(value) {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new TypeError('LFEA deformation scale must be finite and greater than zero.');
  }
}

export function isCurrentExecution(current) {
  return Boolean(current.execution)
    && current.execution.inputSemanticHash === current.packageValue?.semanticHash
    && current.execution.inputModelVersion === current.modelVersion;
}

export function hasQualifiedLfeaDisplacementResult(execution) {
  return execution?.result?.status === 'QUALIFIED'
    && Array.isArray(execution.result.nodalDisplacements)
    && execution.result.nodalDisplacements.length > 0;
}

export function serializableLfeaExecutionError(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : 'Unknown LFEA execution failure.',
    code: typeof error?.code === 'string' ? error.code : null,
  };
}

function runIdentity(value) {
  return {
    runId: value.runId,
    inputSemanticHash: value.inputSemanticHash,
    inputModelVersion: value.inputModelVersion,
  };
}
