import {
  canonicalStringify as canonicalStringifyShared,
  semanticHash as semanticHashShared,
} from '../shared-piping-model/canonical-json.js';

export const FRAME_LOCAL_AXIS_PROFILE_SCHEMA = 'frame-local-axis-profile/v1';
export const FRAME_LOCAL_AXIS_RESULT_SCHEMA = 'frame-local-axis-result/v1';
export const FRAME_LOCAL_AXIS_POLICY_ID = 'FRAME_AXIS_REFERENCE_VECTOR_V1';
export const FRAME_LOCAL_AXIS_PROFILE_ID = 'PIPE-FRAME-AXIS-R1';
export const FRAME_LOCAL_AXIS_PARALLEL_BOUNDARY_RULE = 'PARALLEL_WHEN_RESIDUAL_LE_TOLERANCE';
export const FRAME_LOCAL_AXIS_FALLBACK_SELECTION_RULE = 'MINIMUM_ABSOLUTE_ALIGNMENT_THEN_DECLARED_ORDER';

const PROFILE_KEYS = [
  'schema',
  'profileId',
  'zeroLengthTolerance',
  'referenceNormTolerance',
  'parallelTolerance',
  'unitVectorTolerance',
  'orthogonalityTolerance',
  'handednessTolerance',
  'determinantTolerance',
  'parallelBoundaryRule',
  'fallbackSelectionRule',
  'fallbackCandidates',
  'semanticHash',
];
const FALLBACK_KEYS = ['candidateId', 'vector'];

export class FrameLocalAxisError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'FrameLocalAxisError';
    this.code = code;
    if (details !== undefined) this.details = deepFreeze(strictClone(details, code));
  }
}

export function normalizeFrameLocalAxisNumber(value) {
  return Object.is(value, -0) ? 0 : value;
}

export function strictClone(value, code = 'FRAME_AXIS_PROFILE_INVALID') {
  return cloneValue(value, new WeakSet(), '$', code);
}

function cloneValue(value, seen, path, code) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw axisError(code, `${path} contains a nonfinite number`);
    return normalizeFrameLocalAxisNumber(value);
  }
  if (typeof value !== 'object') throw axisError(code, `${path} must contain plain JSON data`);
  if (seen.has(value)) throw axisError(code, `${path} must not contain a cycle`);
  seen.add(value);
  const output = Array.isArray(value)
    ? cloneArray(value, seen, path, code)
    : cloneRecord(value, seen, path, code);
  seen.delete(value);
  return output;
}

function cloneArray(value, seen, path, code) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw axisError(code, `${path} must use the standard array prototype`);
  }
  const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
  if (keys.some((key) => typeof key === 'symbol') || keys.length !== value.length) {
    throw axisError(code, `${path} must not contain holes or extra properties`);
  }
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw axisError(code, `${path} must not contain holes`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireDataDescriptor(descriptor, `${path}[${index}]`, code);
    output.push(cloneValue(descriptor.value, seen, `${path}[${index}]`, code));
  }
  return output;
}

function cloneRecord(value, seen, path, code) {
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw axisError(code, `${path} must contain plain records`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol')) {
    throw axisError(code, `${path} must not contain symbol properties`);
  }
  const output = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireDataDescriptor(descriptor, `${path}.${key}`, code);
    output[key] = cloneValue(descriptor.value, seen, `${path}.${key}`, code);
  }
  return output;
}

function requireDataDescriptor(descriptor, path, code) {
  if (!descriptor || !descriptor.enumerable || 'get' in descriptor || 'set' in descriptor) {
    throw axisError(code, `${path} must be an enumerable data property`);
  }
}

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

export function canonicalStringify(value) {
  return canonicalStringifyShared(value);
}

export function semanticHash(value) {
  return semanticHashShared(value);
}

export function profileSemanticPayload(profile) {
  const payload = {};
  for (const key of PROFILE_KEYS) {
    if (key !== 'semanticHash') payload[key] = profile[key];
  }
  return payload;
}

export function resultSemanticPayload(result) {
  const payload = {};
  for (const key of Reflect.ownKeys(result)) {
    if (key !== 'semanticHash') payload[key] = result[key];
  }
  return payload;
}

export function computeFrameLocalAxisProfileSemanticHash(profile) {
  return semanticHash(profileSemanticPayload(profile));
}

export function computeFrameLocalAxisResultSemanticHash(result) {
  return semanticHash(resultSemanticPayload(result));
}

export function requireFrameLocalAxisProfile(profile) {
  let candidate;
  try {
    candidate = strictClone(profile, 'FRAME_AXIS_PROFILE_INVALID');
  } catch (error) {
    if (error instanceof FrameLocalAxisError) throw error;
    throw axisError('FRAME_AXIS_PROFILE_INVALID', 'Profile cannot be cloned');
  }
  requireExactRecord(candidate, PROFILE_KEYS, 'profile', 'FRAME_AXIS_PROFILE_INVALID');
  requireExactValue(candidate.schema, FRAME_LOCAL_AXIS_PROFILE_SCHEMA, 'profile.schema');
  requireExactValue(candidate.profileId, FRAME_LOCAL_AXIS_PROFILE_ID, 'profile.profileId');
  requirePositiveFinite(candidate.zeroLengthTolerance, 'profile.zeroLengthTolerance');
  requirePositiveFinite(candidate.referenceNormTolerance, 'profile.referenceNormTolerance');
  requirePositiveFinite(candidate.parallelTolerance, 'profile.parallelTolerance');
  requirePositiveFinite(candidate.unitVectorTolerance, 'profile.unitVectorTolerance');
  requirePositiveFinite(candidate.orthogonalityTolerance, 'profile.orthogonalityTolerance');
  requirePositiveFinite(candidate.handednessTolerance, 'profile.handednessTolerance');
  requirePositiveFinite(candidate.determinantTolerance, 'profile.determinantTolerance');
  requireExactValue(
    candidate.parallelBoundaryRule,
    FRAME_LOCAL_AXIS_PARALLEL_BOUNDARY_RULE,
    'profile.parallelBoundaryRule',
  );
  requireExactValue(
    candidate.fallbackSelectionRule,
    FRAME_LOCAL_AXIS_FALLBACK_SELECTION_RULE,
    'profile.fallbackSelectionRule',
  );
  if (!Array.isArray(candidate.fallbackCandidates) || candidate.fallbackCandidates.length === 0) {
    throw axisError('FRAME_AXIS_PROFILE_INVALID', 'profile.fallbackCandidates must be a nonempty array');
  }
  const ids = new Set();
  for (let index = 0; index < candidate.fallbackCandidates.length; index += 1) {
    const fallback = candidate.fallbackCandidates[index];
    requireExactRecord(fallback, FALLBACK_KEYS, `profile.fallbackCandidates[${index}]`, 'FRAME_AXIS_PROFILE_INVALID');
    if (typeof fallback.candidateId !== 'string' || fallback.candidateId.length === 0) {
      throw axisError('FRAME_AXIS_PROFILE_INVALID', `profile.fallbackCandidates[${index}].candidateId must be nonempty`);
    }
    if (ids.has(fallback.candidateId)) {
      throw axisError('FRAME_AXIS_PROFILE_INVALID', `Duplicate fallback candidateId ${fallback.candidateId}`);
    }
    ids.add(fallback.candidateId);
    requireFiniteVector(fallback.vector, `profile.fallbackCandidates[${index}].vector`, 'FRAME_AXIS_PROFILE_INVALID');
    const fallbackNorm = vectorNorm(fallback.vector);
    if (!Number.isFinite(fallbackNorm) || fallbackNorm === 0) {
      throw axisError('FRAME_AXIS_PROFILE_INVALID', `profile.fallbackCandidates[${index}].vector must have a finite nonzero norm`);
    }
  }
  if (typeof candidate.semanticHash !== 'string') {
    throw axisError('FRAME_AXIS_PROFILE_INVALID', 'profile.semanticHash must be a string');
  }
  const expectedHash = computeFrameLocalAxisProfileSemanticHash(candidate);
  if (candidate.semanticHash !== expectedHash) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Profile semantic hash mismatch', {
      expected: expectedHash,
      received: candidate.semanticHash,
    });
  }
  return deepFreeze(candidate);
}

export function requireExactRecord(value, keys, path, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw axisError(code, `${path} must be a plain record`);
  }
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== 'string')) throw axisError(code, `${path} contains a symbol key`);
  const expectedSet = new Set(keys);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw axisError(code, `${path}.${key} is required`);
  }
  for (const key of actual) {
    if (!expectedSet.has(key)) throw axisError(code, `${path}.${key} is unexpected`);
  }
}

export function requireFiniteVector(value, path, code) {
  if (!Array.isArray(value) || value.length !== 3) throw axisError(code, `${path} must be an array of exactly three values`);
  for (let index = 0; index < 3; index += 1) {
    if (!Number.isFinite(value[index])) throw axisError(code, `${path}[${index}] must be finite`);
  }
  return value;
}

export function vectorNorm(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function requirePositiveFinite(value, path) {
  if (!Number.isFinite(value) || value <= 0) throw axisError('FRAME_AXIS_PROFILE_INVALID', `${path} must be finite and positive`);
}

function requireExactValue(value, expected, path) {
  if (value !== expected) throw axisError('FRAME_AXIS_PROFILE_INVALID', `${path} must equal ${expected}`);
}

export function axisError(code, message, details = undefined) {
  return new FrameLocalAxisError(code, message, details);
}

const DEFAULT_PROFILE_PAYLOAD = {
  schema: FRAME_LOCAL_AXIS_PROFILE_SCHEMA,
  profileId: FRAME_LOCAL_AXIS_PROFILE_ID,
  zeroLengthTolerance: 1e-10,
  referenceNormTolerance: 1e-14,
  parallelTolerance: 1e-10,
  unitVectorTolerance: 1e-12,
  orthogonalityTolerance: 1e-12,
  handednessTolerance: 1e-12,
  determinantTolerance: 1e-12,
  parallelBoundaryRule: FRAME_LOCAL_AXIS_PARALLEL_BOUNDARY_RULE,
  fallbackSelectionRule: FRAME_LOCAL_AXIS_FALLBACK_SELECTION_RULE,
  fallbackCandidates: [
    { candidateId: 'GLOBAL_X', vector: [1, 0, 0] },
    { candidateId: 'GLOBAL_Y', vector: [0, 1, 0] },
    { candidateId: 'GLOBAL_Z', vector: [0, 0, 1] },
  ],
};

export const FRAME_LOCAL_AXIS_PROFILE = deepFreeze({
  ...DEFAULT_PROFILE_PAYLOAD,
  semanticHash: semanticHash(DEFAULT_PROFILE_PAYLOAD),
});
