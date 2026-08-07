import { canonicalLafeaAnalysisMeshProfile } from './lafea-analysis-mesh-contract.js';

export function canonicalLafeaDomainFirstMeshProfile(value) {
  return canonicalLafeaAnalysisMeshProfile(value);
}

export function lafeaDomainFirstMeshProfileHash(value) {
  return canonicalLafeaDomainFirstMeshProfile(value).semanticHash;
}

export function requireLafeaDomainFirstMeshProfileHash(value, expectedHash) {
  const meshProfile = canonicalLafeaDomainFirstMeshProfile(value);
  const meshProfileHash = meshProfile.semanticHash;
  if (meshProfileHash !== expectedHash) {
    fail('LAFEA_DOMAIN_FIRST_MESH_PROFILE_HASH_MISMATCH');
  }
  return Object.freeze({ meshProfile, meshProfileHash });
}

export function canonicalLafeaMeshProfileParentHash(value) {
  if (typeof value !== 'string'
    || !/^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u.test(value)) {
    fail('LAFEA_DOMAIN_FIRST_MESH_PROFILE_PARENT_HASH_INVALID');
  }
  return value;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
