import {
  LOAD_FOUNDATION_HANDOFF_SCHEMA,
  LOAD_FOUNDATION_RESULT_SCHEMA,
  LOAD_FOUNDATION_TARGET_STAGES,
} from './constants.js';
import { LoadFoundationError } from './validation.js';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export function createLafeaLoadFoundationHandoff(options) {
  const result = options?.foundationResult;
  if (!result || result.schema !== LOAD_FOUNDATION_RESULT_SCHEMA
    || result.qualification?.state !== 'ACCEPTED'
    || result.forceMomentClosure?.accepted !== true) {
    fail('LOAD_FOUNDATION_HANDOFF_RESULT_NOT_QUALIFIED', 'foundationResult',
      'A current accepted finite-foundation result is required.');
  }
  const targetStageId = options?.targetStageId;
  if (!LOAD_FOUNDATION_TARGET_STAGES.includes(targetStageId)) {
    fail('LOAD_FOUNDATION_HANDOFF_TARGET_UNSUPPORTED', 'targetStageId',
      'Foundation handoff target must be LAFEA.3, LAFEA.4 or LAFEA.5.');
  }
  const targetSourceHash = sha256(options?.targetSourceHash, 'targetSourceHash');
  return deepFreeze({
    schema: LOAD_FOUNDATION_HANDOFF_SCHEMA,
    handoffIdentity: text(options?.handoffIdentity, 'handoffIdentity'),
    sourceStageId: 'LAFEA.1',
    targetStageId,
    targetSourceHash,
    sourceAncestry: result.sourceAncestry,
    foundationIdentity: result.foundationIdentity,
    footprintMethod: result.footprint.method,
    referencePoint: result.referencePoint,
    resultant: {
      force: result.forceMomentClosure.reconstructedForce,
      moment: result.forceMomentClosure.reconstructedMoment,
    },
    stationLoads: result.stationLoads,
    authority: 'LOAD_DISTRIBUTION_HANDOFF_ONLY',
    prohibitedInferences: Object.freeze([
      'NO_TARGET_MODEL_AUTOGENERATION',
      'NO_FE_STRESS_TRANSFER',
      'NO_CODE_STRESS_TRANSFER',
      'NO_STIFFNESS_OR_CONTACT_CLAIM',
    ]),
  });
}

function sha256(value, path) {
  const result = text(value, path);
  if (!HASH_PATTERN.test(result)) {
    fail('LOAD_FOUNDATION_HANDOFF_SHA256_REQUIRED', path,
      `${path} must be a canonical SHA-256 identity.`);
  }
  return result;
}

function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    fail('LOAD_FOUNDATION_HANDOFF_TEXT_REQUIRED', path, `${path} is required.`);
  }
  return value.trim();
}

function fail(code, path, message) {
  throw new LoadFoundationError(code, path, message);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
