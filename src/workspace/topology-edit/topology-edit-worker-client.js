/**
 * Topology Edit Draft — Web Worker Client Proxy
 *
 * Manages async request/response dispatch, request cancellation, and worker pool lifecycle.
 */

export class TopologyEditWorkerClient {
  constructor() {
    this.worker = null;
    this.pendingRequests = new Map();
    this.requestCounter = 0;
  }

  init() {
    if (typeof Worker === 'undefined') return false;
    try {
      this.worker = new Worker(new URL('./topology-edit-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event) => this.handleMessage(event);
      return true;
    } catch {
      return false;
    }
  }

  handleMessage(event) {
    const { requestId, success, result, error } = event.data || {};
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    this.pendingRequests.delete(requestId);
    if (success) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(error || 'Worker task failed.'));
    }
  }

  dispatch(action, payload) {
    const requestId = `req-${++this.requestCounter}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      if (this.worker) {
        this.worker.postMessage({ requestId, action, payload });
      } else {
        // Fallback for non-worker environments
        reject(new Error('Web Worker not initialized.'));
      }
    });
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }
}
