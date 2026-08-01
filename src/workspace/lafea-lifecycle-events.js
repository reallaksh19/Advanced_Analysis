import {
  DISPLAY_CHANGE_CLASSES,
  LAFEA_ARTIFACT_KINDS,
  SOURCE_CHANGE_CLASSES,
  lifecycleError,
  requireHash,
  requireStage,
} from './lafea-lifecycle-contracts.js';
import {
  invalidateArtifactKinds,
} from './lafea-lifecycle-registration.js';
import {
  validateEvent,
  validateLifecycle,
} from './lafea-lifecycle-validation.js';

/** Apply one source/profile/display change using a fail-closed matrix. */
export function applyLafeaLifecycleEvent(lifecycleValue, eventValue) {
  const lifecycle = validateLifecycle(lifecycleValue);
  const event = validateEvent(eventValue);
  assertMatchingStage(lifecycle, event);
  assertEventAuthorized(lifecycle, event);

  const next = structuredClone(lifecycle);
  next.lastEvent = event;
  next.diagnostics = [];
  if (DISPLAY_CHANGE_CLASSES.has(event.changeClass)) {
    applyDisplayEvent(next.display, event);
  } else if (SOURCE_CHANGE_CLASSES.has(event.changeClass)) {
    applySourceEvent(next, lifecycle, event);
  } else {
    applyProfileEvent(next.artifacts, event);
  }
  return validateLifecycle(next);
}

function assertMatchingStage(lifecycle, event) {
  if (event.stageId === lifecycle.stageId) return;
  throw lifecycleError(
    'LAFEA_LIFECYCLE_STAGE_MISMATCH',
    'Lifecycle event stage does not match lifecycle stage.',
  );
}

function assertEventAuthorized(lifecycle, event) {
  const stage = requireStage(lifecycle.stageId);
  if (DISPLAY_CHANGE_CLASSES.has(event.changeClass)
    || stage.engineState !== 'ENGINE_NOT_IMPLEMENTED') return;
  throw lifecycleError(
    'LAFEA_LIFECYCLE_EDIT_NOT_AUTHORIZED',
    `${stage.stageId} engineering lifecycle edits are blocked without a qualified stage engine.`,
  );
}

function applySourceEvent(next, lifecycle, event) {
  if (event.previousSourceHash !== lifecycle.source.sourceHash) {
    throw lifecycleError(
      'LAFEA_STALE_SOURCE_HASH',
      'Lifecycle event previousSourceHash is stale.',
    );
  }
  requireHash(event.currentSourceHash, 'currentSourceHash');
  if (event.currentSourceHash === event.previousSourceHash) {
    throw lifecycleError(
      'LAFEA_SOURCE_HASH_UNCHANGED',
      'Engineering source events require a changed source hash.',
    );
  }
  next.source = {
    status: 'CURRENT',
    sourceHash: event.currentSourceHash,
  };
  invalidateForSourceChange(next.artifacts, event.changeClass);
}

function applyProfileEvent(artifacts, event) {
  requireHash(event.profileHash, 'profileHash');
  const kinds = profileInvalidationKinds(event.changeClass);
  invalidateArtifactKinds(artifacts, kinds, 'STALE');
}

function profileInvalidationKinds(changeClass) {
  if (changeClass === 'ANALYSIS_MESH_PROFILE') {
    return [
      'ANALYSIS_MESH', 'EXECUTION', 'RECOVERY', 'CONVERGENCE',
      'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
    ];
  }
  if (changeClass === 'RECOVERY_PROFILE') {
    return [
      'RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
    ];
  }
  if (changeClass === 'CODE_PROFILE') {
    return ['CODE_ASSESSMENT', 'REPORT_EVIDENCE'];
  }
  throw lifecycleError(
    'LAFEA_CHANGE_CLASS_UNSUPPORTED',
    `Unsupported lifecycle change: ${changeClass}.`,
  );
}

function invalidateForSourceChange(artifacts, changeClass) {
  if (changeClass === 'GEOMETRY') {
    invalidateArtifactKinds(artifacts, LAFEA_ARTIFACT_KINDS, 'STALE');
    return;
  }
  invalidateArtifactKinds(artifacts, ['CANONICAL_MODEL'], 'STALE');
  invalidateArtifactKinds(
    artifacts,
    ['ANALYSIS_GEOMETRY', 'ANALYSIS_MESH'],
    'REVALIDATION_REQUIRED',
  );
  invalidateArtifactKinds(artifacts, [
    'EXECUTION', 'RECOVERY', 'CONVERGENCE',
    'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
  ], 'STALE');
}

function applyDisplayEvent(display, event) {
  const field = displayField(event.changeClass);
  display[field] = event.profileHash;
}

function displayField(changeClass) {
  if (changeClass === 'DISPLAY_MESH_DENSITY') return 'displayMeshDensityHash';
  if (changeClass === 'CONTOUR_PALETTE') return 'contourPaletteHash';
  if (changeClass === 'REPORT_RENDER_PROFILE') return 'reportRenderProfileHash';
  throw lifecycleError(
    'LAFEA_DISPLAY_CHANGE_UNSUPPORTED',
    `Unsupported display change ${changeClass}.`,
  );
}
