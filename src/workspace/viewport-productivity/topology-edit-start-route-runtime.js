import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertStartRoutePreview } from '../topology-edit/authoring/topology-edit-start-route-transaction.js';

export const START_ROUTE_RUNTIME_SCHEMA = 'TopologyEditStartRouteRuntime.v1';

const PHASES = new Set([
  'IDLE', 'ACQUIRING_START', 'ACQUIRING_END', 'PREVIEW_READY',
  'VALIDATING', 'READY_TO_APPLY', 'BLOCKED', 'APPLIED',
]);

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditStartRouteRuntime: ${message}`);
}
function runtime(material) {
  const engineeringReference = {
    previewHash: material.preview?.previewHash ?? null,
    candidateHash: material.preview?.candidateHash ?? null,
    priorCanonicalHash: material.preview?.priorCanonicalHash ?? null,
    resultingCanonicalHash: material.preview?.resultingCanonicalHash ?? null,
  };
  return deepFreeze({
    ...material,
    engineeringReferenceHash: semanticHash(engineeringReference),
    runtimeHash: semanticHash(material),
  });
}

export function createStartRouteRuntime() {
  return runtime({
    schema: START_ROUTE_RUNTIME_SCHEMA,
    revision: 0,
    phase: 'IDLE',
    pointerCaptureId: null,
    cameraToken: null,
    hoverToken: null,
    preview: null,
    ghost: null,
    diagnostics: [],
  });
}

export function assertStartRouteRuntime(value) {
  if (value?.schema !== START_ROUTE_RUNTIME_SCHEMA || !PHASES.has(value.phase)) {
    fail(`runtime must use ${START_ROUTE_RUNTIME_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.engineeringReferenceHash;
  delete material.runtimeHash;
  const rebuilt = runtime(material);
  if (rebuilt.runtimeHash !== value.runtimeHash
    || rebuilt.engineeringReferenceHash !== value.engineeringReferenceHash) {
    fail('runtime hash mismatch.');
  }
  return value;
}

function transition(input, patch) {
  const current = assertStartRouteRuntime(input);
  const material = { ...current, ...patch, revision: current.revision + 1 };
  delete material.engineeringReferenceHash;
  delete material.runtimeHash;
  return runtime(material);
}

export function activateStartRouteRuntime(input) {
  return transition(input, {
    phase: 'ACQUIRING_START',
    pointerCaptureId: null,
    hoverToken: null,
    preview: null,
    ghost: null,
    diagnostics: [],
  });
}

export function updateStartRouteRuntimeSessionState(input, patch = {}) {
  const allowed = new Set(['pointerCaptureId', 'cameraToken', 'hoverToken']);
  const unknown = Object.keys(patch).filter((key) => !allowed.has(key));
  if (unknown.length) fail(`unsupported session field(s): ${unknown.join(', ')}.`);
  return transition(input, patch);
}

export function markStartRouteStartPointAcquired(input) {
  return transition(input, { phase: 'ACQUIRING_END' });
}

export function publishStartRouteGhost(input, previewInput, geometry) {
  const preview = assertStartRoutePreview(previewInput);
  const ghost = {
    schema: 'TopologyEditStartRouteGhost.v1',
    pickable: false,
    canonicalMutation: false,
    previewHash: preview.previewHash,
    candidateHash: preview.candidateHash,
    startPointMm: geometry.startPointMm,
    endPointMm: geometry.endPointMm,
    lengthMm: geometry.lengthMm,
    geometryHash: geometry.geometryHash,
  };
  return transition(input, {
    phase: 'PREVIEW_READY',
    preview,
    ghost: deepFreeze({ ...ghost, ghostHash: semanticHash(ghost) }),
  });
}

export function beginStartRouteRuntimeValidation(input) {
  const current = assertStartRouteRuntime(input);
  if (!current.preview || !current.ghost) fail('preview ghost is required before validation.');
  return transition(current, { phase: 'VALIDATING', diagnostics: [] });
}

export function completeStartRouteRuntimeValidation(input, validation) {
  const current = assertStartRouteRuntime(input);
  if (current.phase !== 'VALIDATING') fail('runtime is not validating.');
  const blocked = Number(validation?.blockingIssueCount ?? 0) > 0;
  return transition(current, {
    phase: blocked ? 'BLOCKED' : 'READY_TO_APPLY',
    diagnostics: [...(validation?.diagnostics ?? [])],
    pointerCaptureId: null,
  });
}

export function markStartRouteRuntimeApplied(input) {
  const current = assertStartRouteRuntime(input);
  if (current.phase !== 'READY_TO_APPLY') fail('runtime is not ready to apply.');
  return transition(current, {
    phase: 'APPLIED',
    pointerCaptureId: null,
    hoverToken: null,
    ghost: null,
  });
}

export function cancelStartRouteRuntime(input) {
  const current = assertStartRouteRuntime(input);
  return runtime({
    schema: START_ROUTE_RUNTIME_SCHEMA,
    revision: current.revision + 1,
    phase: 'IDLE',
    pointerCaptureId: null,
    cameraToken: current.cameraToken,
    hoverToken: null,
    preview: null,
    ghost: null,
    diagnostics: [],
  });
}
