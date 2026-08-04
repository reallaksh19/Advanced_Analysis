import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';

export const FACTOR_CALCULATION_REQUEST_SCHEMA = 'fea-b31-factor-calculation-request/v1';
export const FACTOR_CALCULATION_RESULT_SCHEMA = 'fea-b31-factor-calculation-result/v1';
export const COMPONENT_GEOMETRY_SCHEMA = 'fea-b31-component-geometry/v1';
export const SUPPLEMENTARY_GEOMETRY_SCHEMA = 'fea-b31-supplementary-component-geometry/v1';

export const EDITION_PROFILE_IDS = Object.freeze([
  'B31_3_2018_APPENDIX_D',
  'B31_3_2020_B31J_2017',
  'B31_3_2022_B31J_2017',
  'B31_3_2024_B31J_2023',
]);

export const FACTOR_COMPONENT_TYPES = Object.freeze([
  'BEND',
  'WELDING_TEE',
  'REDUCER',
]);

export const FACTOR_RESULT_STATUSES = Object.freeze([
  'QUALIFIED',
  'BLOCKED',
]);

export const REQUEST_KEYS = Object.freeze([
  'schema',
  'calculationId',
  'componentId',
  'editionProfileId',
  'componentType',
  'geometry',
  'momentDirectionMapping',
  'semanticHash',
]);

export const RESULT_KEYS = Object.freeze([
  'schema',
  'calculationId',
  'componentId',
  'editionProfileId',
  'componentType',
  'status',
  'sourceIdentity',
  'applicability',
  'geometry',
  'factors',
  'componentFactorSet',
  'stressFactorSets',
  'matchingPipeApplication',
  'diagnostics',
  'semanticHash',
]);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class B31FactorCalculatorError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'B31FactorCalculatorError';
  }
}

export function fail(message, code) {
  throw new B31FactorCalculatorError(message, code);
}

export function requireRecord(value, field, code = 'B31_FACTOR_RECORD_INVALID') {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, code);
  return value;
}

export function requireExactKeys(value, expected, field, code = 'B31_FACTOR_RECORD_INVALID') {
  requireRecord(value, field, code);
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, code);
  }
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) fail(`${field} contains unexpected field ${key}.`, code);
  }
  return value;
}

export function requireText(value, field, code = 'B31_FACTOR_RECORD_INVALID') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${field} must be a non-empty string.`, code);
  }
  return value;
}

export function requireIdentity(value, field, code = 'B31_FACTOR_RECORD_INVALID') {
  try {
    return requireCanonicalNodeId(value);
  } catch {
    return fail(`${field} must be a canonical identity.`, code);
  }
}

export function requireFinite(value, field, code = 'B31_FACTOR_GEOMETRY_INVALID') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be a finite number.`, code);
  }
  return Object.is(value, -0) ? 0 : value;
}

export function requirePositive(value, field, code = 'B31_FACTOR_GEOMETRY_INVALID') {
  const number = requireFinite(value, field, code);
  if (!(number > 0)) fail(`${field} must be greater than zero.`, code);
  return number;
}

export function requireNonnegative(value, field, code = 'B31_FACTOR_GEOMETRY_INVALID') {
  const number = requireFinite(value, field, code);
  if (number < 0) fail(`${field} must not be negative.`, code);
  return number;
}

export function requireMember(value, members, field, code = 'B31_FACTOR_RECORD_INVALID') {
  if (!members.includes(value)) fail(`${field} is unsupported.`, code);
  return value;
}

export function requireHash(value, field, code = 'B31_FACTOR_RECORD_INVALID') {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail(`${field} must be a canonical semantic hash.`, code);
  }
  return value;
}

export function requireMomentDirectionMapping(mapping) {
  requireExactKeys(
    mapping,
    ['inPlaneField', 'outOfPlaneField'],
    'request.momentDirectionMapping',
    'B31_FACTOR_DIRECTION_MAPPING_INVALID',
  );
  const supported = ['my', 'mz'];
  requireMember(mapping.inPlaneField, supported, 'request.momentDirectionMapping.inPlaneField', 'B31_FACTOR_DIRECTION_MAPPING_INVALID');
  requireMember(mapping.outOfPlaneField, supported, 'request.momentDirectionMapping.outOfPlaneField', 'B31_FACTOR_DIRECTION_MAPPING_INVALID');
  if (mapping.inPlaneField === mapping.outOfPlaneField) {
    fail(
      'request.momentDirectionMapping must distinguish in-plane from out-of-plane bending.',
      'B31_FACTOR_DIRECTION_MAPPING_INVALID',
    );
  }
  return mapping;
}

function requestProjection(request) {
  const projection = {};
  for (const key of REQUEST_KEYS) {
    if (key !== 'semanticHash') projection[key] = request[key];
  }
  return projection;
}

export function computeFactorCalculationRequestSemanticHash(request) {
  return semanticHash(requestProjection(request));
}

function validateRequestCore(request) {
  requireExactKeys(request, REQUEST_KEYS, 'request', 'B31_FACTOR_REQUEST_INVALID');
  if (request.schema !== FACTOR_CALCULATION_REQUEST_SCHEMA) {
    fail(`request.schema must be ${FACTOR_CALCULATION_REQUEST_SCHEMA}.`, 'B31_FACTOR_REQUEST_INVALID');
  }
  requireIdentity(request.calculationId, 'request.calculationId', 'B31_FACTOR_REQUEST_INVALID');
  requireIdentity(request.componentId, 'request.componentId', 'B31_FACTOR_REQUEST_INVALID');
  requireMember(request.editionProfileId, EDITION_PROFILE_IDS, 'request.editionProfileId', 'B31_FACTOR_EDITION_PROFILE_NOT_IMPLEMENTED');
  requireMember(request.componentType, FACTOR_COMPONENT_TYPES, 'request.componentType', 'B31_FACTOR_COMPONENT_NOT_IMPLEMENTED');
  requireRecord(request.geometry, 'request.geometry', 'B31_FACTOR_GEOMETRY_INVALID');
  if (request.geometry.schema !== COMPONENT_GEOMETRY_SCHEMA) {
    fail(`request.geometry.schema must be ${COMPONENT_GEOMETRY_SCHEMA}.`, 'B31_FACTOR_GEOMETRY_INVALID');
  }
  if (request.geometry.componentType !== request.componentType) {
    fail('request.geometry.componentType must match request.componentType.', 'B31_FACTOR_GEOMETRY_INVALID');
  }
  requireMomentDirectionMapping(request.momentDirectionMapping);
  return request;
}

export function sealFactorCalculationRequest(request) {
  validateRequestCore(request);
  return requireFactorCalculationRequest({
    ...requestProjection(request),
    semanticHash: computeFactorCalculationRequestSemanticHash(request),
  });
}

export function requireFactorCalculationRequest(request) {
  validateRequestCore(request);
  requireHash(request.semanticHash, 'request.semanticHash', 'B31_FACTOR_REQUEST_INVALID');
  if (request.semanticHash !== computeFactorCalculationRequestSemanticHash(request)) {
    fail('request.semanticHash is stale.', 'B31_FACTOR_HASH_MISMATCH');
  }
  return deepFreeze({ ...requestProjection(request), semanticHash: request.semanticHash });
}

function resultProjection(result) {
  const projection = {};
  for (const key of RESULT_KEYS) {
    if (key !== 'semanticHash') projection[key] = result[key];
  }
  return projection;
}

export function computeFactorCalculationResultSemanticHash(result) {
  return semanticHash(resultProjection(result));
}

export function sealFactorCalculationResult(result) {
  requireExactKeys(result, RESULT_KEYS, 'result', 'B31_FACTOR_RESULT_INVALID');
  if (result.schema !== FACTOR_CALCULATION_RESULT_SCHEMA) {
    fail(`result.schema must be ${FACTOR_CALCULATION_RESULT_SCHEMA}.`, 'B31_FACTOR_RESULT_INVALID');
  }
  requireMember(result.status, FACTOR_RESULT_STATUSES, 'result.status', 'B31_FACTOR_RESULT_INVALID');
  return deepFreeze({
    ...resultProjection(result),
    semanticHash: computeFactorCalculationResultSemanticHash(result),
  });
}
