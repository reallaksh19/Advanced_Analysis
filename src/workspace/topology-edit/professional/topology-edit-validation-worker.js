import {
  executeTopologyEditValidationWorkerRequest,
} from './topology-edit-validation-worker-contract.js';

const workerScope = globalThis;

workerScope.addEventListener('message', (event) => {
  const payload = event.data;
  if (payload?.type !== 'VALIDATE') return;
  try {
    const response = executeTopologyEditValidationWorkerRequest({
      request: payload.request,
      operationPlan: payload.operationPlan,
      canonicalTopology: payload.canonicalTopology,
      previousDiagnostics: payload.previousDiagnostics,
      now: () => workerScope.performance.now(),
    });
    workerScope.postMessage({
      type: 'VALIDATED',
      requestId: response.requestId,
      response,
    });
  } catch (error) {
    workerScope.postMessage({
      type: 'FAILED',
      requestId: payload?.request?.requestId ?? null,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
