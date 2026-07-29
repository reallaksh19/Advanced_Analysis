/**
 * Browser Worker lifecycle for LFEA execution.
 *
 * Cancellation terminates the active worker, guaranteeing that a synchronous
 * numerical stage cannot continue consuming CPU after the user cancels.
 */
export function createLfeaWorkerClient(workerFactory) {
  const createWorker = workerFactory ?? defaultWorkerFactory;
  let active = null;

  function run(input, identity, handlers = {}) {
    if (active) throw new TypeError('An LFEA worker run is already active.');
    assertRunIdentity(identity);
    const worker = createWorker();
    const requestId = `lfea-worker-${sequence += 1}`;
    return new Promise((resolve, reject) => {
      const current = {
        worker,
        requestId,
        identity: { ...identity },
        reject,
        settled: false,
      };
      active = current;
      worker.addEventListener('message', (event) => {
        const message = event.data ?? {};
        if (message.requestId !== requestId) return;
        if (active !== current || current.settled) {
          handlers.onLateMessage?.(message);
          return;
        }
        if (message.type === 'PROGRESS') {
          handlers.onProgress?.(message);
          return;
        }
        if (message.type === 'FAILURE') {
          settle(current);
          reject(workerFailure(message));
          return;
        }
        if (message.type !== 'COMPLETE') return;
        settle(current);
        resolve(message);
      });
      worker.addEventListener('error', (event) => {
        if (active !== current || current.settled) return;
        const message = {
          type: 'FAILURE',
          requestId,
          ...current.identity,
          error: {
            name: 'Error',
            message: event.message || 'LFEA worker execution failed.',
            code: null,
          },
        };
        settle(current);
        reject(workerFailure(message));
      });
      worker.postMessage({
        type: 'RUN',
        requestId,
        ...current.identity,
        input,
      });
    });
  }

  function cancel(reason = 'USER') {
    if (!active) return null;
    const current = active;
    const cancellation = Object.freeze({
      type: 'CANCELLED',
      requestId: current.requestId,
      ...current.identity,
      reason,
      code: reason === 'MODEL_CHANGED'
        ? 'LFEA_RUN_CANCELLED_MODEL_CHANGED'
        : 'LFEA_RUN_CANCELLED',
    });
    current.settled = true;
    current.worker.terminate();
    active = null;
    current.reject(abortError(cancellation));
    return cancellation;
  }

  function settle(current) {
    current.settled = true;
    current.worker.terminate();
    if (active === current) active = null;
  }

  return Object.freeze({
    run,
    cancel,
    isRunning: () => Boolean(active),
    destroy: () => cancel('DESTROYED'),
  });
}

let sequence = 0;

function defaultWorkerFactory() {
  return new Worker(
    new URL('./lfea-worker.js', import.meta.url),
    { type: 'module', name: 'lfea-pipeline' },
  );
}

function assertRunIdentity(identity) {
  if (typeof identity?.runId !== 'string' || !identity.runId) {
    throw new TypeError('LFEA worker runId is required.');
  }
  if (typeof identity.inputSemanticHash !== 'string'
    || !identity.inputSemanticHash) {
    throw new TypeError('LFEA worker inputSemanticHash is required.');
  }
  if (!Number.isInteger(identity.inputModelVersion)
    || identity.inputModelVersion < 0) {
    throw new TypeError('LFEA worker inputModelVersion must be a non-negative integer.');
  }
}

function workerFailure(message) {
  const error = new Error(message.error?.message || 'LFEA worker execution failed.');
  error.name = message.error?.name || 'Error';
  if (typeof message.error?.code === 'string') error.code = message.error.code;
  error.workerMessage = message;
  return error;
}

function abortError(cancellation) {
  const error = new DOMException('LFEA execution cancelled.', 'AbortError');
  error.cancellation = cancellation;
  return error;
}
