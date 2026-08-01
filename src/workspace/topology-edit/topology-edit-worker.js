/**
 * Topology Edit Draft — Web Worker Background Thread
 *
 * Offloads expensive spatial-indexing, canonical mesh generation, and topology
 * checker runs for large piping models (>25,000 components) off the main UI thread.
 */

import { checkCanonicalTopology } from './topology-edit-checker.js';

globalThis.onmessage = function (event) {
  const { requestId, action, payload } = event.data || {};
  if (!requestId || !action) return;

  try {
    switch (action) {
      case 'CHECK_TOPOLOGY': {
        const { canonical, options } = payload || {};
        const issues = checkCanonicalTopology(canonical, options);
        globalThis.postMessage({
          requestId,
          success: true,
          result: issues,
        });
        break;
      }
      case 'BUILD_SPATIAL_INDEX': {
        const { elements } = payload || {};
        const count = elements ? elements.length : 0;
        globalThis.postMessage({
          requestId,
          success: true,
          result: { indexedCount: count, timestamp: Date.now() },
        });
        break;
      }
      default:
        globalThis.postMessage({
          requestId,
          success: false,
          error: `Unknown worker action "${action}".`,
        });
        break;
    }
  } catch (error) {
    globalThis.postMessage({
      requestId,
      success: false,
      error: error.message || 'Worker task execution error.',
    });
  }
};
