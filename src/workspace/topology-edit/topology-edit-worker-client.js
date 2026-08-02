/**
 * Topology Edit Draft — authority-bound Web Worker client.
 *
 * Every request carries session/source/draft/scope authority. Responses are
 * accepted only while that exact authority remains current. Cancellation,
 * timeout, destroy, and stale responses cannot mutate the active draft.
 */

export const TOPOLOGY_EDIT_WORKER_AUTHORITY_SCHEMA =
  'advanced-topology-edit-worker-authority/v1';

export class TopologyEditWorkerError extends Error {
  constructor(code, message = code, details = null) {
    super(message);
    this.name = 'TopologyEditWorkerError';
    this.code = code;
    this.details = details;
  }
}

export class TopologyEditWorkerClient {
  constructor(options = {}) {
    this.worker = null;
    this.pendingRequests = new Map();
    this.requestCounter = 0;
    this.defaultTimeoutMs = positiveInteger(
      options.defaultTimeoutMs || 30_000,
      'defaultTimeoutMs',
    );
    this.workerFactory =
      typeof options.workerFactory === 'function'
        ? options.workerFactory
        : defaultWorkerFactory;
    this.currentAuthority = null;
    this.destroyed = false;
  }

  init() {
    if (this.destroyed) return false;
    try {
      this.worker = this.workerFactory();
      if (!this.worker) return false;
      this.worker.onmessage = (event) => this.handleMessage(event);
      this.worker.onerror = (event) => this.handleWorkerError(event);
      return true;
    } catch {
      this.worker = null;
      return false;
    }
  }

  setAuthority(authority) {
    this.currentAuthority = normalizeWorkerAuthority(authority);
    return this.currentAuthority;
  }

  handleMessage(event) {
    const response = event?.data || {};
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) return;

    if (
      !sameAuthority(response.authority, pending.authority) ||
      !sameAuthority(this.currentAuthority, pending.authority)
    ) {
      this.finishRequest(
        response.requestId,
        'reject',
        new TopologyEditWorkerError(
          'STALE_WORKER_RESPONSE',
          'Worker response authority no longer matches the active session.',
          {
            expected: pending.authority,
            received: response.authority || null,
            current: this.currentAuthority,
          },
        ),
      );
      return;
    }

    if (response.success) {
      this.finishRequest(response.requestId, 'resolve', response.result);
    } else {
      this.finishRequest(
        response.requestId,
        'reject',
        new TopologyEditWorkerError(
          response.errorCode || 'WORKER_TASK_FAILED',
          response.error || 'Worker task failed.',
        ),
      );
    }
  }

  handleWorkerError(event) {
    const error = new TopologyEditWorkerError(
      'WORKER_RUNTIME_ERROR',
      event?.message || 'Topology Edit worker runtime error.',
    );
    for (const requestId of [...this.pendingRequests.keys()]) {
      this.finishRequest(requestId, 'reject', error);
    }
  }

  dispatch(action, payload, authority = this.currentAuthority, options = {}) {
    if (this.destroyed) {
      return rejectedDispatch(
        new TopologyEditWorkerError(
          'WORKER_CLIENT_DESTROYED',
          'Worker client has been destroyed.',
        ),
      );
    }
    if (!this.worker) {
      return rejectedDispatch(
        new TopologyEditWorkerError(
          'WORKER_NOT_INITIALIZED',
          'Web Worker is not initialized.',
        ),
      );
    }

    const normalizedAction = String(action || '').trim();
    if (!normalizedAction) {
      return rejectedDispatch(
        new TopologyEditWorkerError(
          'WORKER_ACTION_REQUIRED',
          'Worker action is required.',
        ),
      );
    }

    let normalizedAuthority;
    try {
      normalizedAuthority = normalizeWorkerAuthority(authority);
    } catch (error) {
      return rejectedDispatch(error);
    }

    const requestId = `topology-edit-worker-${++this.requestCounter}`;
    const timeoutMs = positiveInteger(
      options.timeoutMs || this.defaultTimeoutMs,
      'timeoutMs',
    );
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const timeout = setTimeout(() => {
      this.cancel(
        requestId,
        new TopologyEditWorkerError(
          'WORKER_TIMEOUT',
          `Worker request ${requestId} exceeded ${timeoutMs} ms.`,
        ),
      );
    }, timeoutMs);

    this.pendingRequests.set(requestId, {
      resolve: resolvePromise,
      reject: rejectPromise,
      timeout,
      authority: normalizedAuthority,
    });

    this.worker.postMessage({
      requestId,
      action: normalizedAction,
      payload,
      authority: normalizedAuthority,
    });

    Object.defineProperties(promise, {
      requestId: { value: requestId, enumerable: true },
      cancel: {
        value: () => this.cancel(requestId),
        enumerable: false,
      },
    });
    return promise;
  }

  cancel(
    requestId,
    reason = new TopologyEditWorkerError(
      'WORKER_REQUEST_CANCELLED',
      `Worker request ${requestId} was cancelled.`,
    ),
  ) {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return false;
    try {
      this.worker?.postMessage({
        requestId,
        action: 'CANCEL_REQUEST',
        authority: pending.authority,
      });
    } finally {
      this.finishRequest(requestId, 'reject', reason);
    }
    return true;
  }

  finishRequest(requestId, disposition, value) {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return false;
    this.pendingRequests.delete(requestId);
    clearTimeout(pending.timeout);
    if (disposition === 'resolve') pending.resolve(value);
    else pending.reject(value);
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const error = new TopologyEditWorkerError(
      'WORKER_CLIENT_DESTROYED',
      'Worker client was destroyed before completion.',
    );
    for (const requestId of [...this.pendingRequests.keys()]) {
      this.finishRequest(requestId, 'reject', error);
    }
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.currentAuthority = null;
  }
}

export function normalizeWorkerAuthority(authority = {}) {
  const normalized = Object.freeze({
    schema: TOPOLOGY_EDIT_WORKER_AUTHORITY_SCHEMA,
    sessionAuthorityId: String(authority.sessionAuthorityId || '').trim(),
    sessionVersion: Number(authority.sessionVersion),
    sourceHash: String(authority.sourceHash || '').trim(),
    draftHash: String(authority.draftHash || '').trim(),
    scopeHash: String(authority.scopeHash || '').trim(),
  });
  if (
    !normalized.sessionAuthorityId ||
    !normalized.sourceHash ||
    !normalized.draftHash ||
    !normalized.scopeHash
  ) {
    throw new TopologyEditWorkerError(
      'WORKER_AUTHORITY_INCOMPLETE',
      'Worker authority requires session, source, draft, and scope identities.',
    );
  }
  if (
    !Number.isSafeInteger(normalized.sessionVersion) ||
    normalized.sessionVersion < 0
  ) {
    throw new TopologyEditWorkerError(
      'WORKER_AUTHORITY_VERSION_INVALID',
      'Worker authority requires a non-negative integer sessionVersion.',
    );
  }
  return normalized;
}

function sameAuthority(left, right) {
  if (!left || !right) return false;
  return (
    left.schema === right.schema &&
    left.sessionAuthorityId === right.sessionAuthorityId &&
    left.sessionVersion === right.sessionVersion &&
    left.sourceHash === right.sourceHash &&
    left.draftHash === right.draftHash &&
    left.scopeHash === right.scopeHash
  );
}

function defaultWorkerFactory() {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./topology-edit-worker.js', import.meta.url), {
    type: 'module',
  });
}

function rejectedDispatch(error) {
  const promise = Promise.reject(error);
  Object.defineProperty(promise, 'requestId', {
    value: null,
    enumerable: true,
  });
  Object.defineProperty(promise, 'cancel', {
    value: () => false,
  });
  return promise;
}

function positiveInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return numeric;
}
