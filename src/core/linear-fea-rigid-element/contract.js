import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';

export const RIGID_ELEMENT_REQUEST_SCHEMA = 'fea-linear-rigid-element-request/v1';
export const RIGID_ELEMENT_AUTHORITY_SCHEMA = 'fea-linear-rigid-element-authority/v1';

export const RIGID_ELEMENT_REQUEST_KEYS = Object.freeze([
  'schema',
  'rigidElementId',
  'length',
  'insideDiameter',
  'enteredOutsideDiameter',
  'pipeWallThickness',
  'enteredRigidWeight',
  'fluidDensity',
  'insulationThickness',
  'insulationDensity',
  'refractoryWeight',
  'claddingWeight',
  'gravityAcceleration',
  'installationTemperature',
  'operatingTemperature',
  'material',
  'sourceEvidence',
  'semanticHash',
]);

export const MATERIAL_KEYS = Object.freeze([
  'elasticModulus',
  'shearModulus',
  'thermalExpansionCoefficient',
]);

export const SOURCE_EVIDENCE_KEYS = Object.freeze([
  'sourceId',
  'sourceRevision',
  'sourceSemanticHash',
]);

export const RIGID_ELEMENT_AUTHORITY_KEYS = Object.freeze([
  'schema',
  'rigidElementId',
  'sourceIdentity',
  'inputSemanticHash',
  'geometry',
  'stiffnessSection',
  'rigidities',
  'gravity',
  'thermal',
  'structuralParticipation',
  'limitations',
  'semanticHash',
]);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class RigidElementError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'RigidElementError';
  }
}

export function fail(message, code) {
  throw new RigidElementError(message, code);
}

export function requireRecord(value, field, code = 'RIGID_ELEMENT_INPUT_INVALID') {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, code);
  return value;
}

export function requireExactKeys(value, expected, field, code = 'RIGID_ELEMENT_INPUT_INVALID') {
  requireRecord(value, field, code);
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, code);
  }
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) fail(`${field} contains unexpected field ${key}.`, code);
  }
  return value;
}

export function requireFinite(value, field, code = 'RIGID_ELEMENT_INPUT_INVALID') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be a finite number.`, code);
  }
  return Object.is(value, -0) ? 0 : value;
}

export function requirePositive(value, field, code = 'RIGID_ELEMENT_INPUT_INVALID') {
  const number = requireFinite(value, field, code);
  if (!(number > 0)) fail(`${field} must be greater than zero.`, code);
  return number;
}

export function requireNonnegative(value, field, code = 'RIGID_ELEMENT_INPUT_INVALID') {
  const number = requireFinite(value, field, code);
  if (number < 0) fail(`${field} must not be negative.`, code);
  return number;
}

export function requireHash(value, field, code = 'RIGID_ELEMENT_INPUT_INVALID') {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail(`${field} must be a canonical semantic hash.`, code);
  }
  return value;
}

function requestProjection(request) {
  const projection = {};
  for (const key of RIGID_ELEMENT_REQUEST_KEYS) {
    if (key !== 'semanticHash') projection[key] = request[key];
  }
  return projection;
}

export function computeRigidElementRequestSemanticHash(request) {
  return semanticHash(requestProjection(request));
}

function validateRequestCore(request) {
  requireExactKeys(request, RIGID_ELEMENT_REQUEST_KEYS, 'request');
  if (request.schema !== RIGID_ELEMENT_REQUEST_SCHEMA) {
    fail(`request.schema must be ${RIGID_ELEMENT_REQUEST_SCHEMA}.`, 'RIGID_ELEMENT_SCHEMA_INVALID');
  }
  try {
    requireCanonicalNodeId(request.rigidElementId);
  } catch {
    fail('request.rigidElementId must be a canonical identity.', 'RIGID_ELEMENT_ID_INVALID');
  }
  requirePositive(request.length, 'request.length');
  requirePositive(request.insideDiameter, 'request.insideDiameter');
  requirePositive(request.enteredOutsideDiameter, 'request.enteredOutsideDiameter');
  requirePositive(request.pipeWallThickness, 'request.pipeWallThickness');
  requireNonnegative(request.enteredRigidWeight, 'request.enteredRigidWeight');
  requireNonnegative(request.fluidDensity, 'request.fluidDensity');
  requireNonnegative(request.insulationThickness, 'request.insulationThickness');
  requireNonnegative(request.insulationDensity, 'request.insulationDensity');
  requireNonnegative(request.refractoryWeight, 'request.refractoryWeight');
  requireNonnegative(request.claddingWeight, 'request.claddingWeight');
  requirePositive(request.gravityAcceleration, 'request.gravityAcceleration');
  requireFinite(request.installationTemperature, 'request.installationTemperature');
  requireFinite(request.operatingTemperature, 'request.operatingTemperature');
  requireExactKeys(request.material, MATERIAL_KEYS, 'request.material');
  requirePositive(request.material.elasticModulus, 'request.material.elasticModulus');
  requirePositive(request.material.shearModulus, 'request.material.shearModulus');
  requireFinite(request.material.thermalExpansionCoefficient, 'request.material.thermalExpansionCoefficient');
  requireExactKeys(request.sourceEvidence, SOURCE_EVIDENCE_KEYS, 'request.sourceEvidence');
  requireHash(request.sourceEvidence.sourceSemanticHash, 'request.sourceEvidence.sourceSemanticHash');
  if (request.enteredOutsideDiameter < request.insideDiameter) {
    fail('request.enteredOutsideDiameter must not be smaller than request.insideDiameter.', 'RIGID_ELEMENT_DIAMETER_INVALID');
  }
  return request;
}

export function sealRigidElementRequest(request) {
  validateRequestCore(request);
  return requireRigidElementRequest({
    ...requestProjection(request),
    semanticHash: computeRigidElementRequestSemanticHash(request),
  });
}

export function requireRigidElementRequest(request) {
  validateRequestCore(request);
  requireHash(request.semanticHash, 'request.semanticHash');
  if (request.semanticHash !== computeRigidElementRequestSemanticHash(request)) {
    fail('request.semanticHash is stale.', 'RIGID_ELEMENT_HASH_MISMATCH');
  }
  return deepFreeze({ ...requestProjection(request), semanticHash: request.semanticHash });
}

function authorityProjection(authority) {
  const projection = {};
  for (const key of RIGID_ELEMENT_AUTHORITY_KEYS) {
    if (key !== 'semanticHash') projection[key] = authority[key];
  }
  return projection;
}

export function computeRigidElementAuthoritySemanticHash(authority) {
  return semanticHash(authorityProjection(authority));
}

export function sealRigidElementAuthority(authority) {
  requireExactKeys(authority, RIGID_ELEMENT_AUTHORITY_KEYS, 'authority', 'RIGID_ELEMENT_AUTHORITY_INVALID');
  if (authority.schema !== RIGID_ELEMENT_AUTHORITY_SCHEMA) {
    fail(`authority.schema must be ${RIGID_ELEMENT_AUTHORITY_SCHEMA}.`, 'RIGID_ELEMENT_AUTHORITY_INVALID');
  }
  const draft = {
    ...authorityProjection(authority),
    semanticHash: computeRigidElementAuthoritySemanticHash(authority),
  };
  return requireRigidElementAuthority(draft);
}

export function requireRigidElementAuthority(authority) {
  requireExactKeys(authority, RIGID_ELEMENT_AUTHORITY_KEYS, 'authority', 'RIGID_ELEMENT_AUTHORITY_INVALID');
  requireHash(authority.semanticHash, 'authority.semanticHash', 'RIGID_ELEMENT_AUTHORITY_INVALID');
  if (authority.semanticHash !== computeRigidElementAuthoritySemanticHash(authority)) {
    fail('authority.semanticHash is stale.', 'RIGID_ELEMENT_HASH_MISMATCH');
  }
  return deepFreeze({ ...authorityProjection(authority), semanticHash: authority.semanticHash });
}
