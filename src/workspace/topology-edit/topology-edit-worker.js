/**
 * Topology Edit Draft — authority-bound background worker.
 *
 * Results echo the exact session/source/draft/scope authority supplied by the
 * caller. Spatial-index construction is deterministic and indexes canonical
 * engineering-space AABBs rather than rendered meshes.
 */

import { checkCanonicalTopology } from './topology-edit-checker.js';
import {
  buildCanonicalSpatialIndex,
  queryCanonicalSpatialIndex,
  queryCanonicalSpatialIndexRay,
} from './topology-edit-scope-contract.js';
import {
  normalizeWorkerAuthority,
} from './topology-edit-worker-client.js';

const cancelledRequests = new Set();
const cancellationOrder = [];
const MAX_REMEMBERED_CANCELLATIONS = 2_048;

globalThis.onmessage = async function onTopologyEditWorkerMessage(event) {
  const message = event?.data || {};
  const requestId = String(message.requestId || '').trim();
  const action = String(message.action || '').trim();
  if (!requestId || !action) return;

  if (action === 'CANCEL_REQUEST') {
    rememberCancellation(requestId);
    return;
  }

  let authority;
  try {
    authority = normalizeWorkerAuthority(message.authority);
  } catch (error) {
    postFailure(requestId, message.authority || null, error);
    return;
  }

  try {
    const result = await executeAction(action, message.payload || {});
    if (cancelledRequests.delete(requestId)) return;
    globalThis.postMessage({
      requestId,
      authority,
      success: true,
      result,
    });
  } catch (error) {
    if (cancelledRequests.delete(requestId)) return;
    postFailure(requestId, authority, error);
  }
};

async function executeAction(action, payload) {
  switch (action) {
    case 'CHECK_TOPOLOGY': {
      const { canonical, options } = payload;
      return checkCanonicalTopology(canonical, options);
    }
    case 'BUILD_SPATIAL_INDEX': {
      const records = payload.records || payload.elements || [];
      return buildCanonicalSpatialIndex(records, payload.options);
    }
    case 'QUERY_SPATIAL_INDEX':
      return queryCanonicalSpatialIndex(payload.index, payload.bounds);
    case 'QUERY_SPATIAL_INDEX_RAY':
      return queryCanonicalSpatialIndexRay(
        payload.index,
        payload.ray,
        payload.maxDistance,
      );
    default: {
      const error = new Error(`Unknown worker action "${action}".`);
      error.code = 'UNKNOWN_WORKER_ACTION';
      throw error;
    }
  }
}

function rememberCancellation(requestId) {
  if (cancelledRequests.has(requestId)) return;
  cancelledRequests.add(requestId);
  cancellationOrder.push(requestId);
  while (cancellationOrder.length > MAX_REMEMBERED_CANCELLATIONS) {
    cancelledRequests.delete(cancellationOrder.shift());
  }
}

function postFailure(requestId, authority, error) {
  globalThis.postMessage({
    requestId,
    authority,
    success: false,
    errorCode: error?.code || 'WORKER_TASK_FAILED',
    error: error?.message || 'Worker task execution error.',
  });
}
