const REGISTERED_ARTIFACT_RECEIPTS = new WeakSet();
const RUNTIME_VERIFIED_RESULTS = new WeakSet();

export function registerLafeaBucket01ReplayArtifactReceiptInternal(value) {
  if (!value || typeof value !== 'object') {
    const error = new TypeError('LAFEA_B01_REPLAY_ARTIFACT_REGISTRATION_INVALID');
    error.code = 'LAFEA_B01_REPLAY_ARTIFACT_REGISTRATION_INVALID';
    throw error;
  }
  REGISTERED_ARTIFACT_RECEIPTS.add(value);
  return value;
}

export function assertRegisteredLafeaBucket01ReplayArtifacts(artifacts) {
  if (!Array.isArray(artifacts)
    || artifacts.some((row) => !REGISTERED_ARTIFACT_RECEIPTS.has(row))) {
    const error = new TypeError('LAFEA_B01_REPLAY_ARTIFACT_NOT_REGISTRY_VERIFIED');
    error.code = 'LAFEA_B01_REPLAY_ARTIFACT_NOT_REGISTRY_VERIFIED';
    throw error;
  }
}

export function markLafeaBucket01ControlledReplayResultRuntimeVerified(value) {
  RUNTIME_VERIFIED_RESULTS.add(value);
  return value;
}

export function isLafeaBucket01ControlledReplayResultRuntimeVerified(value) {
  return RUNTIME_VERIFIED_RESULTS.has(value);
}
