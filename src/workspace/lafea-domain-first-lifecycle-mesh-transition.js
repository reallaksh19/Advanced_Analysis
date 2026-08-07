import {
  createLafeaDomainFirstLifecycle,
  registerLafeaDomainFirstArtifact,
  validateLafeaDomainFirstLifecycle,
} from './lafea-domain-first-lifecycle.js';

export function replaceLafeaDomainFirstAnalysisMeshArtifact(
  lifecycleValue,
  artifactValue,
  registrationId,
) {
  const lifecycle = validateLafeaDomainFirstLifecycle(lifecycleValue);
  let next = createLafeaDomainFirstLifecycle(
    lifecycle.sourceHash,
    lifecycle.custodyEpoch,
  );
  for (const kind of ['ANALYSIS_DOMAIN', 'ANALYSIS_GEOMETRY']) {
    const row = lifecycle.artifacts[kind];
    if (row.status !== 'CURRENT' || row.qualification !== 'PASS') {
      fail('LAFEA_MP3_LIFECYCLE_PREREQUISITE_NOT_CURRENT');
    }
    next = registerLafeaDomainFirstArtifact(
      next,
      row,
      `MP3-RETAIN-${kind}-${row.artifactHash.slice(7, 19)}`,
    );
  }
  next = registerLafeaDomainFirstArtifact(next, artifactValue, registrationId);
  return next;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
