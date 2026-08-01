import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { canonicalVector3, requireOrthonormalBasis } from '../shared-analysis-contract/vector3.js';
import { finiteNumber } from '../shared-analysis-contract/numeric.js';
import { exactKeys, member, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { DOF_ORDER } from '../linear-fea-contract/conventions.js';

export const INTERFACE_PROFILE_SCHEMA = 'linear-piping-interface-profile/v1';
export const INTERFACE_SET_SCHEMA = 'linear-piping-interface-set/v1';
export const INTERFACE_RECOVERY_SCHEMA = 'linear-piping-interface-recovery/v1';
export const INTERFACE_ENVELOPE_SCHEMA = 'linear-piping-interface-envelope/v1';

export const INTERFACE_KINDS = Object.freeze(['SUPPORT', 'ANCHOR', 'NOZZLE', 'EQUIPMENT']);
export const INTERFACE_SIGN_CONVENTIONS = Object.freeze([
  'FORCE_ON_PIPE_FROM_INTERFACE',
  'FORCE_ON_INTERFACE_FROM_PIPE',
]);
export const REVERSED_INTERFACE_SIGN = Object.freeze({
  FORCE_ON_PIPE_FROM_INTERFACE: 'FORCE_ON_INTERFACE_FROM_PIPE',
  FORCE_ON_INTERFACE_FROM_PIPE: 'FORCE_ON_PIPE_FROM_INTERFACE',
});
export const REPRESENTABLE_INTERFACE_BEHAVIORS = Object.freeze([
  'FIXED',
  'LINEAR_SPRING',
  'PRESCRIBED_SLOT',
]);
export const PROHIBITED_INTERFACE_STATES = Object.freeze([
  'GAP', 'CONFLICT', 'UNKNOWN', 'ONE_WAY', 'LIFT_OFF', 'FRICTION', 'CONTACT', 'NONLINEAR_SPRING',
]);
export const REFERENCE_TRANSFER_FORMULA = 'M_REFERENCE_EQUALS_M_NODE_PLUS_R_REFERENCE_TO_NODE_CROSS_F';

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const PROFILE_KEYS = Object.freeze([
  'schema', 'profileId', 'basisTolerance', 'positionTolerance', 'offsetTolerance', 'semanticHash',
]);
const DECLARED_VALUE_KEYS = Object.freeze(['value', 'source']);
export const DEFINITION_INPUT_KEYS = Object.freeze([
  'interfaceId', 'interfaceKind', 'nodeId', 'sourceEntityId', 'supportBinding', 'basis',
  'referencePointGlobal', 'leverReferenceToNodeLocal', 'dofMappings', 'reportingSignConvention',
  'sourceEvidence', 'allowableProfileHash',
]);
export const DOF_MAPPING_KEYS = Object.freeze(['dof', 'behavior', 'constraintId', 'stiffness']);
export const SUPPORT_BINDING_KEYS = Object.freeze(['supportKey', 'attachmentId', 'restraintId']);
export const SOURCE_EVIDENCE_KEYS = Object.freeze([
  'sourceId', 'sourceRevision', 'sourceSemanticHash',
]);

export class LinearPipingInterfaceError extends SharedAnalysisContractError {
  constructor(message, code, evidence = null) {
    super(message, code);
    this.name = 'LinearPipingInterfaceError';
    this.evidence = evidence;
  }
}

export function failInterface(message, code, evidence = null) {
  throw new LinearPipingInterfaceError(message, code, evidence);
}

export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    failInterface(`${field} must be a semantic hash.`, 'PIPING_INTERFACE_HASH_INVALID');
  }
  return value;
}

export function requireNullableHash(value, field) {
  if (value === null) return null;
  return requireHash(value, field);
}

export function requireRecord(value, field) {
  if (!isPlainRecord(value)) failInterface(`${field} must be a record.`, 'PIPING_INTERFACE_RECORD_REQUIRED');
  return value;
}

export function requireArray(value, field) {
  if (!Array.isArray(value)) failInterface(`${field} must be an array.`, 'PIPING_INTERFACE_ARRAY_REQUIRED');
  return value;
}

export function sealInterfaceProfile(source) {
  exactKeys(source, PROFILE_KEYS, 'interfaceProfile');
  if (source.schema !== INTERFACE_PROFILE_SCHEMA) {
    failInterface(`interfaceProfile.schema must be ${INTERFACE_PROFILE_SCHEMA}.`, 'PIPING_INTERFACE_PROFILE_INVALID');
  }
  const base = {
    schema: INTERFACE_PROFILE_SCHEMA,
    profileId: nonEmptyString(source.profileId, 'interfaceProfile.profileId'),
    basisTolerance: declaredPositive(source.basisTolerance, 'interfaceProfile.basisTolerance'),
    positionTolerance: declaredPositive(source.positionTolerance, 'interfaceProfile.positionTolerance'),
    offsetTolerance: declaredPositive(source.offsetTolerance, 'interfaceProfile.offsetTolerance'),
  };
  const expected = semanticHash(base);
  if (source.semanticHash !== '' && source.semanticHash !== expected) {
    failInterface('interfaceProfile.semanticHash is stale.', 'PIPING_INTERFACE_PROFILE_HASH_MISMATCH');
  }
  return deepFreeze({ ...base, semanticHash: expected });
}

export function canonicalBasis(source, profile, field) {
  exactKeys(source, ['origin', 'e1', 'e2', 'e3'], field);
  const basis = deepFreeze({
    origin: canonicalVector3(source.origin, `${field}.origin`),
    e1: canonicalVector3(source.e1, `${field}.e1`),
    e2: canonicalVector3(source.e2, `${field}.e2`),
    e3: canonicalVector3(source.e3, `${field}.e3`),
  });
  const qualification = requireOrthonormalBasis(
    basis,
    profile.basisTolerance.value,
    field,
  );
  return { basis, qualification };
}

export function canonicalDofMappings(source, field) {
  requireArray(source, field);
  const seen = new Set();
  return source.map((row, index) => {
    const label = `${field}[${index}]`;
    exactKeys(row, DOF_MAPPING_KEYS, label);
    const dof = member(row.dof, DOF_ORDER, `${label}.dof`);
    if (seen.has(dof)) failInterface(`${field} maps ${dof} more than once.`, 'PIPING_INTERFACE_DOF_DUPLICATE');
    seen.add(dof);
    const behavior = member(
      row.behavior,
      REPRESENTABLE_INTERFACE_BEHAVIORS,
      `${label}.behavior`,
    );
    const stiffness = row.stiffness === null ? null : finiteNumber(row.stiffness, `${label}.stiffness`);
    if (behavior === 'LINEAR_SPRING' && !(stiffness > 0)) {
      failInterface(`${label}.stiffness must be positive for LINEAR_SPRING.`, 'PIPING_INTERFACE_STIFFNESS_INVALID');
    }
    if (behavior !== 'LINEAR_SPRING' && stiffness !== null) {
      failInterface(`${label}.stiffness must be null unless behavior is LINEAR_SPRING.`, 'PIPING_INTERFACE_STIFFNESS_INVALID');
    }
    return deepFreeze({
      dof,
      behavior,
      constraintId: nonEmptyString(row.constraintId, `${label}.constraintId`),
      stiffness,
    });
  }).sort((a, b) => DOF_ORDER.indexOf(a.dof) - DOF_ORDER.indexOf(b.dof));
}

export function canonicalSupportBinding(source, required, field) {
  if (source === null) {
    if (required) failInterface(`${field} is required.`, 'PIPING_INTERFACE_SUPPORT_BINDING_REQUIRED');
    return null;
  }
  exactKeys(source, SUPPORT_BINDING_KEYS, field);
  return deepFreeze({
    supportKey: nonEmptyString(source.supportKey, `${field}.supportKey`),
    attachmentId: nonEmptyString(source.attachmentId, `${field}.attachmentId`),
    restraintId: nonEmptyString(source.restraintId, `${field}.restraintId`),
  });
}

export function canonicalSourceEvidence(source, field) {
  exactKeys(source, SOURCE_EVIDENCE_KEYS, field);
  return deepFreeze({
    sourceId: nonEmptyString(source.sourceId, `${field}.sourceId`),
    sourceRevision: nonEmptyString(source.sourceRevision, `${field}.sourceRevision`),
    sourceSemanticHash: requireHash(source.sourceSemanticHash, `${field}.sourceSemanticHash`),
  });
}

function declaredPositive(source, field) {
  exactKeys(source, DECLARED_VALUE_KEYS, field);
  const value = finiteNumber(source.value, `${field}.value`);
  if (!(value > 0)) failInterface(`${field}.value must be positive.`, 'PIPING_INTERFACE_PROFILE_INVALID');
  return deepFreeze({ value, source: nonEmptyString(source.source, `${field}.source`) });
}
