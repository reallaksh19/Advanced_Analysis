/**
 * U3 lifecycle-aware facade over the U2 immutable LAFEA workbench store.
 *
 * The facade binds producer-owned lifecycle evidence to an exact editor
 * document revision. The U2 FNV document digest remains a revision token only;
 * it is never used as an engineering source/model/mesh/result hash.
 */
import {
  LAFEA_LIFECYCLE_BINDING_NOT_CURRENT,
} from './lafea-lifecycle-workbench-contracts.js';
import {
  createLafeaLifecycleWorkbenchRuntime,
} from './lafea-lifecycle-workbench-runtime.js';
import {
  createLafeaWorkbenchStore as createBaseLafeaWorkbenchStore,
} from './lafea-workbench-store.js';

export {
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
} from './lafea-lifecycle-workbench-contracts.js';

/** Create the public lifecycle-aware LAFEA workbench store. */
export function createLafeaWorkbenchStore(options) {
  const configuration = options ?? {};
  const base = createBaseLafeaWorkbenchStore(configuration);
  return createLafeaLifecycleWorkbenchRuntime({
    base,
    configuration,
    canBindImportedSource,
  });
}

function canBindImportedSource(baseState) {
  return baseState.status !== 'FAILED';
}

// Retain the exact fail-closed error identity at the public facade boundary.
void LAFEA_LIFECYCLE_BINDING_NOT_CURRENT;
