/**
 * Fail-closed LAFEA analysis lifecycle and lineage contracts.
 *
 * Hash values are opaque producer-owned references. These production modules
 * validate exact lineage and state transitions; they do not invent engineering
 * hashes, mesh, solve, recovery, convergence, code or report evidence.
 */
export {
  LAFEA_ARTIFACT_KINDS,
  LAFEA_ARTIFACT_RECORD_SCHEMA,
  LAFEA_ARTIFACT_REGISTRATION_SCHEMA,
  LAFEA_ARTIFACT_STATUSES,
  LAFEA_LIFECYCLE_CHANGE_CLASSES,
  LAFEA_LIFECYCLE_EVENT_SCHEMA,
  LAFEA_LIFECYCLE_SCHEMA,
  LAFEA_QUALIFICATION_STATES,
} from './lafea-lifecycle-contracts.js';

export {
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  createLafeaLifecycleEvent,
} from './lafea-lifecycle-factory.js';

export {
  registerLafeaArtifact,
} from './lafea-lifecycle-registration.js';

export {
  applyLafeaLifecycleEvent,
} from './lafea-lifecycle-events.js';

export {
  lafeaLifecycleReadiness,
} from './lafea-lifecycle-readiness.js';
