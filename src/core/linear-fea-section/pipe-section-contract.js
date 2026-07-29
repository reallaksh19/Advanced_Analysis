import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import {
  canonicalizePipeSectionValue,
  computePipeSectionProfileSemanticHash,
} from './pipe-section-canonicalization.js';

export const PIPE_SECTION_REQUEST_SCHEMA = 'fea-linear-pipe-section-request/v1';
export const PIPE_SECTION_PROFILE_SCHEMA = 'fea-linear-pipe-section-profile/v1';
export const PIPE_SECTION_RESOLUTION_SCHEMA = 'fea-linear-pipe-section-resolution/v1';

export const PIPE_SECTION_FORMULATION_ID = 'PIPE_CIRCULAR_ANNULUS_V1';
export const PIPE_SECTION_PROFILE_ID = 'PIPE-CIRCULAR-ANNULUS-R1';
export const PIPE_SECTION_ARITHMETIC_RULE = 'FACTORED_ANNULUS_PROPERTIES_V1';
export const PIPE_SECTION_INNER_DIAMETER_RULE = 'INNER_DIAMETER_EQUALS_OD_MINUS_2T';
export const PIPE_SECTION_SOLID_RULE = 'SOLID_SECTION_PROHIBITED';

export const PIPE_SECTION_REQUEST_KEYS = Object.freeze([
  'schema',
  'sectionStateId',
  'formulationId',
  'outerDiameter',
  'wallThickness',
  'sourceEvidence',
  'semanticHash',
]);

export const PIPE_SECTION_PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'formulationId',
  'arithmeticRule',
  'innerDiameterRule',
  'solidSectionRule',
  'semanticHash',
]);

export const PIPE_SECTION_RESOLUTION_KEYS = Object.freeze([
  'schema',
  'profileId',
  'profileSemanticHash',
  'requestSemanticHash',
  'dimensions',
  'sectionState',
  'verification',
  'limitations',
  'diagnostics',
  'diagnosticEvidence',
  'qualificationEvidence',
  'semanticHash',
  'evidenceHash',
]);

export const PIPE_SECTION_SOURCE_EVIDENCE_KEYS = Object.freeze([
  'sourceId',
  'sourceRevision',
  'sourceSemanticHash',
]);

export const PIPE_SECTION_DIMENSION_KEYS = Object.freeze([
  'outerDiameter',
  'wallThickness',
  'innerDiameter',
]);

export const PIPE_SECTION_STATE_KEYS = Object.freeze([
  'sectionStateId',
  'area',
  'secondMomentY',
  'secondMomentZ',
  'polarMoment',
  'sourceEvidence',
]);

export const PIPE_SECTION_VERIFICATION_KEYS = Object.freeze([
  'circularSymmetryResidual',
  'polarClosureResidual',
]);

export const PIPE_SECTION_LIMITATION_KEYS = Object.freeze([
  'code',
  'severity',
  'scope',
  'stiffnessRelevant',
  'details',
]);

export const PIPE_SECTION_DIAGNOSTIC_KEYS = Object.freeze([
  'code',
  'severity',
  'message',
  'evidenceIds',
  'qualificationEvidenceIds',
]);

export const PIPE_SECTION_DIAGNOSTIC_EVIDENCE_KEYS = Object.freeze([
  'evidenceId',
  'sourceId',
  'sourceRevision',
  'sourceSemanticHash',
  'details',
]);

export const PIPE_SECTION_QUALIFICATION_EVIDENCE_KEYS = Object.freeze([
  'evidenceId',
  'checkId',
  'passed',
  'actual',
  'expected',
]);

export const PIPE_SECTION_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class PipeSectionError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'PipeSectionError';
    this.code = code;
    if (details !== undefined) this.details = deepFreeze(strictClonePipeSectionData(details, code));
  }
}

export function pipeSectionError(code, message, details = undefined) {
  return new PipeSectionError(code, message, details);
}

export function strictClonePipeSectionData(value, code = 'PIPE_SECTION_REQUEST_INVALID') {
  return cloneValue(value, new WeakSet(), '$', code);
}

function cloneValue(value, active, path, code) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'object') throw pipeSectionError(code, `${path} must contain plain JSON data.`);
  if (active.has(value)) throw pipeSectionError(code, `${path} must not contain a cycle.`);
  active.add(value);
  const output = Array.isArray(value)
    ? cloneArray(value, active, path, code)
    : cloneRecord(value, active, path, code);
  active.delete(value);
  return output;
}

function cloneArray(value, active, path, code) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw pipeSectionError(code, `${path} must use the standard array prototype.`);
  }
  const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
  if (keys.some((key) => typeof key !== 'string') || keys.length !== value.length) {
    throw pipeSectionError(code, `${path} must not contain holes or extra properties.`);
  }
  return value.map((entry, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    requireDataDescriptor(descriptor, `${path}[${index}]`, code);
    return cloneValue(entry, active, `${path}[${index}]`, code);
  });
}

function cloneRecord(value, active, path, code) {
  if (!isPlainRecord(value)) throw pipeSectionError(code, `${path} must contain plain records.`);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) {
    throw pipeSectionError(code, `${path} must not contain symbol properties.`);
  }
  const output = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireDataDescriptor(descriptor, `${path}.${key}`, code);
    output[key] = cloneValue(descriptor.value, active, `${path}.${key}`, code);
  }
  return output;
}

function requireDataDescriptor(descriptor, path, code) {
  if (!descriptor || !descriptor.enumerable || 'get' in descriptor || 'set' in descriptor) {
    throw pipeSectionError(code, `${path} must be an enumerable data property.`);
  }
}

export function requireExactPipeSectionRecord(value, expectedKeys, path, code) {
  if (!isPlainRecord(value)) throw pipeSectionError(code, `${path} must be a plain record.`);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) throw pipeSectionError(code, `${path} contains a symbol key.`);
  const expected = new Set(expectedKeys);
  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw pipeSectionError(code, `${path}.${key} is required.`);
    }
  }
  for (const key of keys) {
    if (!expected.has(key)) throw pipeSectionError(code, `${path}.${key} is unexpected.`);
  }
  return value;
}

export function requirePipeSectionHash(value, path, code = 'PIPE_SECTION_REQUEST_INVALID') {
  if (typeof value !== 'string' || !PIPE_SECTION_HASH_PATTERN.test(value)) {
    throw pipeSectionError(code, `${path} must be a canonical semantic hash.`);
  }
  return value;
}

export function requireRetainedSourceString(value, path, code) {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
    throw pipeSectionError(code, `${path} must be a retained nonempty source string.`);
  }
  return value;
}

export const PIPE_SECTION_LIMITATIONS = deepFreeze(canonicalizePipeSectionValue([
  {
    code: 'PIPE_SECTION_LIMITATION_CIRCULAR_ANNULUS_ONLY',
    severity: 'INFO',
    scope: 'SECTION',
    stiffnessRelevant: false,
    details: {
      formulationId: PIPE_SECTION_FORMULATION_ID,
      solidSectionSupported: false,
      dimensionUnit: 'm',
      areaUnit: 'm^2',
      secondMomentUnit: 'm^4',
      polarMomentUnit: 'm^4',
    },
  },
]));

const DEFAULT_PROFILE_PAYLOAD = {
  schema: PIPE_SECTION_PROFILE_SCHEMA,
  profileId: PIPE_SECTION_PROFILE_ID,
  formulationId: PIPE_SECTION_FORMULATION_ID,
  arithmeticRule: PIPE_SECTION_ARITHMETIC_RULE,
  innerDiameterRule: PIPE_SECTION_INNER_DIAMETER_RULE,
  solidSectionRule: PIPE_SECTION_SOLID_RULE,
};

export const PIPE_SECTION_PROFILE = deepFreeze(canonicalizePipeSectionValue({
  ...DEFAULT_PROFILE_PAYLOAD,
  semanticHash: computePipeSectionProfileSemanticHash(DEFAULT_PROFILE_PAYLOAD),
}));
