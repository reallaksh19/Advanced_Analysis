/**
 * Browser Worker lifecycle for LFEA execution.
 *
 * Cancellation terminates the active worker, guaranteeing that a synchronous
 * numerical stage cannot continue consuming CPU after the user cancels.
 */
export function createLfeaWorkerClient(workerFactory) {
  const createWorker = workerFactory ?? defaultWorkerFactory;
  let active = null;

  function run(input, handlers) {
    if (active) throw new TypeError('An LFEA worker run is already active.');
    const worker = createWorker();
    const requestId = `lfea-worker-${sequence += 1}`;
    return new Promise((resolve, reject) => {
      active = { worker, requestId, reject };
      worker.addEventListener('message', (event) => {
        const message = event.data ?? {};
        if (message.requestId !== requestId) return;
        if (message.type === 'PROGRESS') {
          handlers.onProgress(message.progress);
          return;
        }
        if (message.type !== 'COMPLETE') return;
        cleanup();
        resolve(message.execution);
      });
      worker.addEventListener('error', (event) => {
        cleanup();
        reject(new Error(event.message || 'LFEA worker execution failed.'));
      });
      worker.postMessage({ requestId, input });
    });
  }

  function cancel() {
    if (!active) return false;
    const error = new DOMException('LFEA execution cancelled.', 'AbortError');
    const reject = active.reject;
    active.worker.terminate();
    active = null;
    reject(error);
    return true;
  }

  function cleanup() {
    active?.worker.terminate();
    active = null;
  }

  return Object.freeze({
    run,
    cancel,
    isRunning: () => Boolean(active),
    destroy: cancel,
  });
}

let sequence = 0;

function defaultWorkerFactory() {
  return new Worker(
    new URL('./lfea-pipeline-worker.js', import.meta.url),
    { type: 'module', name: 'lfea-pipeline' },
  );
}
