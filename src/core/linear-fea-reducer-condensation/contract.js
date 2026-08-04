import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';

export const REDUCER_CONDENSATION_REQUEST_SCHEMA = 'fea-linear-reducer-condensation-request/v1';
export const REDUCER_CONDENSATION_AUTHORITY_SCHEMA = 'fea-linear-reducer-condensation-authority/v1';
export const REDUCER_SEGMENT_COUNT = 10;
export const REDUCER_SAMPLING_RULE = 'MIDPOINT_LINEAR_INTERPOLATION_CANDIDATE_V1';

export const REDUCER_REQUEST_KEYS = Object.freeze([
  'schema',
  'reducerId',
  'length',
  'fromSection',
  'toSection',
  'segmentCount',
  'samplingRule',
  'material',
  'gravity',
  'thermal',
  'sourceEvidence',
  'semanticHash',
]);

export const SECTION_KEYS = Object.freeze(['outerDiameter', 'wallThickness']);
export const MATERIAL_KEYS = Object.freeze([
  'elasticModulus',
  'shearModulus',
  'massDensity',
  'thermalExpansionCoefficient',
]);
export const GRAVITY_KEYS = Object.freeze([
  'enabled',
  'acceleration',
  'directionLocal',
  'fluidDensity',
  'insulationThickness',
  'insulationDensity',
]);
export const THERMAL_KEYS = Object.freeze(['installationTemperature', 'operatingTemperature']);
export const SOURCE_KEYS = Object.freeze(['sourceId', 'sourceRevision', 'sourceSemanticHash']);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class ReducerCondensationError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'ReducerCondensationError';
  }
}

export function fail(message, code) {
  throw new ReducerCondensationError(message, code);
}

function requireRecord(value, field, code = 'REDUCER_CONDENSATION_INPUT_INVALID') {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, code);
  return value;
}

function requireExactKeys(value, expected, field, code = 'REDUCER_CONDENSATION_INPUT_INVALID') {
  requireRecord(value, field, code);
  for (const key of expected) if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, code);
  for (const key of Object.keys(value)) if (!expected.includes(key)) fail(`${field} contains unexpected field ${key}.`, code);
  return value;
}

function requireFinite(value, field, code = 'REDUCER_CONDENSATION_INPUT_INVALID') {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${field} must be finite.`, code);
  return Object.is(value, -0) ? 0 : value;
}

function requirePositive(value, field, code = 'REDUCER_CONDENSATION_INPUT_INVALID') {
  const number = requireFinite(value, field, code);
  if (!(number > 0)) fail(`${field} must be greater than zero.`, code);
  return number;
}

function requireNonnegative(value, field, code = 'REDUCER_CONDENSATION_INPUT_INVALID') {
  const number = requireFinite(value, field, code);
  if (number < 0) fail(`${field} must not be negative.`, code);
  return number;
}

function requireHash(value, field, code = 'REDUCER_CONDENSATION_INPUT_INVALID') {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) fail(`${field} must be a semantic hash.`, code);
  return value;
}

function projection(request) {
  const result = {};
  for (const key of REDUCER_REQUEST_KEYS) if (key !== 'semanticHash') result[key] = request[key];
  return result;
}

export function computeReducerCondensationRequestSemanticHash(request) {
  return semanticHash(projection(request));
}

function validateSection(section, field) {
  requireExactKeys(section, SECTION_KEYS, field);
  const outer = requirePositive(section.outerDiameter, `${field}.outerDiameter`);
  const wall = requirePositive(section.wallThickness, `${field}.wallThickness`);
  if (!(outer > 2 * wall)) fail(`${field} must retain a positive inside diameter.`, 'REDUCER_CONDENSATION_SECTION_INVALID');
}

function validateRequestCore(request) {
  requireExactKeys(request, REDUCER_REQUEST_KEYS, 'request');
  if (request.schema !== REDUCER_CONDENSATION_REQUEST_SCHEMA) fail('request.schema is unsupported.', 'REDUCER_CONDENSATION_SCHEMA_INVALID');
  try { requireCanonicalNodeId(request.reducerId); } catch { fail('request.reducerId must be canonical.', 'REDUCER_CONDENSATION_ID_INVALID'); }
  requirePositive(request.length, 'request.length');
  validateSection(request.fromSection, 'request.fromSection');
  validateSection(request.toSection, 'request.toSection');
  if (request.segmentCount !== REDUCER_SEGMENT_COUNT) {
    fail(`request.segmentCount must be ${REDUCER_SEGMENT_COUNT}.`, 'REDUCER_CONDENSATION_SEGMENT_COUNT_INVALID');
  }
  if (request.samplingRule !== REDUCER_SAMPLING_RULE) {
    fail(`request.samplingRule must be ${REDUCER_SAMPLING_RULE}.`, 'REDUCER_CONDENSATION_SAMPLING_RULE_INVALID');
  }
  requireExactKeys(request.material, MATERIAL_KEYS, 'request.material');
  requirePositive(request.material.elasticModulus, 'request.material.elasticModulus');
  requirePositive(request.material.shearModulus, 'request.material.shearModulus');
  requirePositive(request.material.massDensity, 'request.material.massDensity');
  requireFinite(request.material.thermalExpansionCoefficient, 'request.material.thermalExpansionCoefficient');
  requireExactKeys(request.gravity, GRAVITY_KEYS, 'request.gravity');
  if (typeof request.gravity.enabled !== 'boolean') fail('request.gravity.enabled must be boolean.', 'REDUCER_CONDENSATION_INPUT_INVALID');
  requirePositive(request.gravity.acceleration, 'request.gravity.acceleration');
  if (!Array.isArray(request.gravity.directionLocal) || request.gravity.directionLocal.length !== 3) {
    fail('request.gravity.directionLocal must be a three-component vector.', 'REDUCER_CONDENSATION_INPUT_INVALID');
  }
  request.gravity.directionLocal.forEach((value, index) => requireFinite(value, `request.gravity.directionLocal[${index}]`));
  if (!(Math.hypot(...request.gravity.directionLocal) > 0)) fail('request.gravity.directionLocal must have non-zero length.', 'REDUCER_CONDENSATION_INPUT_INVALID');
  requireNonnegative(request.gravity.fluidDensity, 'request.gravity.fluidDensity');
  requireNonnegative(request.gravity.insulationThickness, 'request.gravity.insulationThickness');
  requireNonnegative(request.gravity.insulationDensity, 'request.gravity.insulationDensity');
  requireExactKeys(request.thermal, THERMAL_KEYS, 'request.thermal');
  requireFinite(request.thermal.installationTemperature, 'request.thermal.installationTemperature');
  requireFinite(request.thermal.operatingTemperature, 'request.thermal.operatingTemperature');
  requireExactKeys(request.sourceEvidence, SOURCE_KEYS, 'request.sourceEvidence');
  requireHash(request.sourceEvidence.sourceSemanticHash, 'request.sourceEvidence.sourceSemanticHash');
  return request;
}

export function sealReducerCondensationRequest(request) {
  validateRequestCore(request);
  return requireReducerCondensationRequest({ ...projection(request), semanticHash: computeReducerCondensationRequestSemanticHash(request) });
}

export function requireReducerCondensationRequest(request) {
  validateRequestCore(request);
  requireHash(request.semanticHash, 'request.semanticHash');
  if (request.semanticHash !== computeReducerCondensationRequestSemanticHash(request)) {
    fail('request.semanticHash is stale.', 'REDUCER_CONDENSATION_HASH_MISMATCH');
  }
  return deepFreeze({ ...projection(request), semanticHash: request.semanticHash });
}

export function sealReducerCondensationAuthority(authority) {
  const draft = { ...authority, semanticHash: '' };
  draft.semanticHash = semanticHash(Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'semanticHash')));
  return deepFreeze(draft);
}
