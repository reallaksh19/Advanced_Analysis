import {
  LAFEA_HYBRID_RESULT_RENDER_POLICY,
  LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA,
  LAFEA_HYBRID_RESULT_VIEWPORT_STATUSES,
  createLafeaHybridResultViewportModel,
  mountLafeaHybridResultViewport as mountInternalHybridResultViewport,
} from './lafea-hybrid-result-viewport.js';

export {
  LAFEA_HYBRID_RESULT_RENDER_POLICY,
  LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA,
  LAFEA_HYBRID_RESULT_VIEWPORT_STATUSES,
  createLafeaHybridResultViewportModel,
};

const PUBLIC_MOUNT_KEYS = Object.freeze([
  'schema',
  'getState',
  'getSelection',
  'selectSource',
  'clearSelection',
  'refresh',
  'destroy',
]);

/**
 * Mount the governed result viewport without exposing its typed-array-bearing
 * internal model. Render evidence remains private to the mounted coordinator.
 */
export function mountLafeaHybridResultViewport(root, input) {
  const mounted = mountInternalHybridResultViewport(root, input);
  const facade = {
    schema: mounted.schema,
    getState: mounted.getState,
    getSelection: mounted.getSelection,
    selectSource: mounted.selectSource,
    clearSelection: mounted.clearSelection,
    refresh: mounted.refresh,
    destroy: mounted.destroy,
  };
  if (JSON.stringify(Object.keys(facade)) !== JSON.stringify(PUBLIC_MOUNT_KEYS)) {
    throw new TypeError('LAFEA_HYBRID_RESULT_PUBLIC_FACADE_KEYS_INVALID');
  }
  return Object.freeze(facade);
}
