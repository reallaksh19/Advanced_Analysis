import {
  connectEndpointsElbowOptions,
  redoConnectEndpointsAuthoring,
  undoConnectEndpointsAuthoring,
} from './topology-edit-connect-endpoints-authoring-service.js';

export function connectEndpointsPhase(runtime) {
  if (runtime.validation?.status === 'READY_TO_APPLY') return 'READY_TO_APPLY';
  if (runtime.validation?.status === 'BLOCKED') return 'BLOCKED';
  if (runtime.candidate) return 'PREVIEW_READY';
  if (runtime.connectPlan) return 'ALTERNATIVES_READY';
  if (runtime.connectStartEndpoint && runtime.connectEndEndpoint) return 'ENDPOINTS_READY';
  return 'SELECT_ENDPOINTS';
}

export function refreshConnectEndpointsElbowOptions(runtime) {
  runtime.connectElbowOptions = runtime.connectValues.alternativeId && runtime.connectPlan
    ? connectEndpointsElbowOptions({
        plan: runtime.connectPlan,
        alternativeId: runtime.connectValues.alternativeId,
        catalogue: runtime.requiredCatalogue(),
      })
    : [];
}

export function assertCurrentConnectEndpointsCandidate(runtime, operation, candidate) {
  if (runtime.connectOperation?.operationHash !== operation.operationHash
    || runtime.candidate?.candidateHash !== candidate.candidateHash
    || runtime.controller.session?.currentTopology()?.canonicalTopologyHash !== candidate.priorCanonicalHash) {
    throw new RangeError('Connect validation completed against a stale candidate.');
  }
}

export function clearConnectEndpointsCandidate(runtime, clearGhost = true) {
  runtime.connectOperation = null;
  runtime.candidate = null;
  runtime.preview = null;
  runtime.validation = null;
  runtime.connectWorkerReceipt = null;
  if (clearGhost) runtime.controller.viewportBackend?.clearGhost();
}

export function clearConnectEndpointsPlanning(runtime) {
  runtime.connectIntent = null;
  runtime.connectPlan = null;
  runtime.connectElbowOptions = [];
  runtime.connectValues.alternativeId = '';
  clearConnectEndpointsCandidate(runtime);
}

export function transitionConnectEndpointsHistory(runtime, direction, receipt) {
  if (!receipt || !runtime.controller.session) return false;
  const priorVersion = runtime.controller.session.journal.sessionVersion;
  try {
    if (direction === 'undo') {
      undoConnectEndpointsAuthoring(runtime.controller, receipt);
      runtime.redoTransaction = receipt;
      runtime.transaction = null;
    } else {
      redoConnectEndpointsAuthoring(runtime.controller, receipt);
      runtime.transaction = receipt;
      runtime.redoTransaction = null;
    }
    runtime.controller.refreshView(runtime.controller.session.currentTopology());
    runtime.controller.autosaveAfterTransition?.(priorVersion);
    runtime.message = `Connect ${direction} restored the exact canonical hash.`;
    runtime.error = null;
  } catch (error) {
    runtime.reject(error, `Connect ${direction} blocked.`);
  }
  runtime.publish();
  return true;
}
