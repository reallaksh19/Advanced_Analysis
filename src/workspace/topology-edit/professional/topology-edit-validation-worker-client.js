import {
  assertTopologyEditOperationPlan,
} from './topology-edit-operation-plan.js';
import {
  assertTopologyEditValidationWorkerResponse,
  createTopologyEditValidationWorkerRequest,
} from './topology-edit-validation-worker-contract.js';
import { topologyEditDiagnosticsHash } from './topology-edit-validation-diagnostics.js';
import {
  acceptTopologyEditValidationWorkerResponse,
  beginTopologyEditValidationWorkerRequest,
  cancelTopologyEditValidationWorkerRequest,
  createTopologyEditValidationWorkerState,
} from './topology-edit-validation-worker-state.js';

const DEFAULT_POLICY = Object.freeze({
  fastPathBudgetMs: 16,
  warningBudgetMs: 100,
  hysteresisMs: 4,
});

export class TopologyEditValidationWorkerClient {
  constructor(options = {}) {
    this.WorkerCtor = options.WorkerCtor ?? globalThis.Worker ?? null;
    this.workerUrl = options.workerUrl ?? new URL(
      './topology-edit-validation-worker.js',
      import.meta.url,
    );
    this.state = createTopologyEditValidationWorkerState();
    this.active = null;
    this.destroyed = false;
  }

  validate(input = {}) {
    this.assertAvailable();
    const plan = assertTopologyEditOperationPlan(input.operationPlan);
    const canonicalTopology = input.canonicalTopology;
    const previousDiagnostics = input.previousDiagnostics ?? [];
    const request = input.request ?? createTopologyEditValidationWorkerRequest({
      operationPlan: plan,
      validatedTopologyHash: canonicalTopology?.canonicalTopologyHash,
      previousIssueHash: topologyEditDiagnosticsHash(previousDiagnostics),
      checkerOptions: input.checkerOptions ?? {},
      performancePolicy: input.performancePolicy ?? DEFAULT_POLICY,
      blockingSeverities: input.blockingSeverities ?? ['HIGH'],
    });

    const prior = this.active;
    this.state = beginTopologyEditValidationWorkerRequest(this.state, request);
    if (prior) {
      this.cleanupActive(prior);
      prior.reject(cancellationError('SUPERSEDED', prior.request.requestId));
    }

    const worker = new this.WorkerCtor(this.workerUrl, {
      type: 'module',
      name: 'topology-edit-professional-validation',
    });
    return new Promise((resolve, reject) => {
      const active = {
        request,
        worker,
        resolve,
        reject,
        settled: false,
        onMessage: (event) => this.handleMessage(event),
        onError: (event) => this.handleWorkerError(event),
      };
      this.active = active;
      worker.addEventListener('message', active.onMessage);
      worker.addEventListener('error', active.onError);
      worker.postMessage({
        type: 'VALIDATE',
        request,
        operationPlan: plan,
        canonicalTopology,
        previousDiagnostics,
      });
    });
  }

  cancel(requestId = this.active?.request.requestId, reason = 'CANCELLED') {
    if (!this.active || this.active.request.requestId !== requestId) return false;
    const active = this.active;
    this.state = cancelTopologyEditValidationWorkerRequest(this.state, requestId);
    this.cleanupActive(active);
    active.reject(cancellationError(reason, requestId));
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.active) this.cancel(this.active.request.requestId, 'DESTROYED');
  }

  snapshot() {
    return this.state;
  }

  handleMessage(event) {
    const active = this.active;
    if (!active || active.settled) return;
    const payload = event.data;
    if (payload?.requestId !== active.request.requestId) return;
    if (payload.type === 'FAILED') {
      this.cleanupActive(active);
      active.reject(workerFailure(payload.error));
      return;
    }
    if (payload.type !== 'VALIDATED') return;
    try {
      const response = assertTopologyEditValidationWorkerResponse(payload.response);
      const disposition = acceptTopologyEditValidationWorkerResponse(this.state, response);
      this.state = disposition.state;
      this.cleanupActive(active);
      if (disposition.status !== 'ACCEPTED') {
        active.reject(new Error(
          `TopologyEditValidationWorkerClient: response ${disposition.status}.`,
        ));
        return;
      }
      active.resolve({
        request: active.request,
        response,
        receipt: disposition.receipt,
        disposition,
      });
    } catch (error) {
      this.cleanupActive(active);
      active.reject(error);
    }
  }

  handleWorkerError(event) {
    const active = this.active;
    if (!active || active.settled) return;
    this.cleanupActive(active);
    active.reject(new Error(
      `TopologyEditValidationWorkerClient: ${event?.message || 'validation worker failed'}.`,
    ));
  }

  cleanupActive(active) {
    if (active.settled) return;
    active.settled = true;
    active.worker.removeEventListener('message', active.onMessage);
    active.worker.removeEventListener('error', active.onError);
    active.worker.terminate();
    if (this.active === active) this.active = null;
  }

  assertAvailable() {
    if (this.destroyed) {
      throw new Error('TopologyEditValidationWorkerClient: client is destroyed.');
    }
    if (typeof this.WorkerCtor !== 'function') {
      throw new Error('TopologyEditValidationWorkerClient: module Worker support is required.');
    }
  }
}

function cancellationError(reason, requestId) {
  const error = new Error(
    `TopologyEditValidationWorkerClient: ${reason.toLowerCase()} ${requestId}.`,
  );
  error.name = 'AbortError';
  return error;
}

function workerFailure(value) {
  const error = new Error(
    `TopologyEditValidationWorkerClient: ${value?.message || 'validation failed'}.`,
  );
  error.name = value?.name || 'Error';
  return error;
}
