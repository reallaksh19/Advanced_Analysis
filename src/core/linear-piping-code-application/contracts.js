import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { finiteNumber } from '../shared-analysis-contract/numeric.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

export const NOZZLE_ALLOWABLE_PROFILE_SCHEMA = 'linear-piping-nozzle-allowable-profile/v1';
export const NOZZLE_ASSESSMENT_SCHEMA = 'linear-piping-nozzle-assessment/v1';
export const B31_APPLICATION_REQUEST_SCHEMA = 'linear-piping-b31-application-request/v1';
export const B31_APPLICATION_SCHEMA = 'linear-piping-b31-application/v1';
export const APPLICATION_RESULT_REQUEST_SCHEMA = 'linear-piping-qualified-application-result-request/v1';
export const APPLICATION_RESULT_SCHEMA = 'linear-piping-qualified-application-result/v1';

export const NOZZLE_INTERACTION_RULE = 'LINEAR_ABSOLUTE_SUM_V1';
export const NOZZLE_ASSESSMENT_STATUSES = Object.freeze(['PASS', 'FAIL']);
export const CALCULATION_QUALIFICATION_STATUSES = Object.freeze([
  'QUALIFIED_UNDER_CONFIGURED_PROFILE',
  'CONDITIONAL',
]);
export const APPLICATION_STATUSES = Object.freeze(['QUALIFIED', 'CONDITIONAL']);

export const NOZZLE_PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'interfaceId',
  'sourceIdentity',
  'forceAllowables',
  'momentAllowables',
  'interactionRuleId',
  'interactionLimit',
  'semanticHash',
]);
export const SOURCE_IDENTITY_KEYS = Object.freeze([
  'authority',
  'documentId',
  'revision',
  'sourceSemanticHash',
]);
export const VECTOR_ALLOWABLE_KEYS = Object.freeze(['x', 'y', 'z']);
export const DECLARED_VALUE_KEYS = Object.freeze(['value', 'source']);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class LinearPipingCodeApplicationError extends SharedAnalysisContractError {
  constructor(message, code, evidence = null) {
    super(message, code);
    this.name = 'LinearPipingCodeApplicationError';
    this.evidence = evidence;
  }
}

export function failCodeApplication(message, code, evidence = null) {
  throw new LinearPipingCodeApplicationError(message, code, evidence);
}

export function requireHash(value, field, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    failCodeApplication(`${field} must be a semantic hash.`, 'PIPING_CODE_HASH_INVALID', { field, value });
  }
  return value;
}

export function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failCodeApplication(`${field} must be an array.`, 'PIPING_CODE_ARRAY_REQUIRED', { field });
  }
  return value;
}

export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sealNozzleAllowableProfile(source) {
  exactKeys(source, NOZZLE_PROFILE_KEYS, 'nozzleAllowableProfile');
  if (source.schema !== NOZZLE_ALLOWABLE_PROFILE_SCHEMA) {
    failCodeApplication(
      `nozzleAllowableProfile.schema must be ${NOZZLE_ALLOWABLE_PROFILE_SCHEMA}.`,
      'PIPING_NOZZLE_PROFILE_INVALID',
    );
  }
  const draft = {
    schema: source.schema,
    profileId: nonEmptyString(source.profileId, 'nozzleAllowableProfile.profileId'),
    interfaceId: nonEmptyString(source.interfaceId, 'nozzleAllowableProfile.interfaceId'),
    sourceIdentity: canonicalSourceIdentity(source.sourceIdentity),
    forceAllowables: canonicalAllowableVector(source.forceAllowables, 'nozzleAllowableProfile.forceAllowables'),
    momentAllowables: canonicalAllowableVector(source.momentAllowables, 'nozzleAllowableProfile.momentAllowables'),
    interactionRuleId: source.interactionRuleId,
    interactionLimit: canonicalDeclaredPositive(source.interactionLimit, 'nozzleAllowableProfile.interactionLimit'),
    semanticHash: '',
  };
  if (draft.interactionRuleId !== NOZZLE_INTERACTION_RULE) {
    failCodeApplication(
      `nozzleAllowableProfile.interactionRuleId must be ${NOZZLE_INTERACTION_RULE}.`,
      'PIPING_NOZZLE_INTERACTION_RULE_UNSUPPORTED',
    );
  }
  draft.semanticHash = semanticHash(nozzleProfileSemanticProjection(draft));
  return requireNozzleAllowableProfile(draft);
}

export function requireNozzleAllowableProfile(record) {
  exactKeys(record, NOZZLE_PROFILE_KEYS, 'nozzleAllowableProfile');
  if (record.schema !== NOZZLE_ALLOWABLE_PROFILE_SCHEMA) {
    failCodeApplication('Nozzle allowable profile schema is invalid.', 'PIPING_NOZZLE_PROFILE_INVALID');
  }
  nonEmptyString(record.profileId, 'nozzleAllowableProfile.profileId');
  nonEmptyString(record.interfaceId, 'nozzleAllowableProfile.interfaceId');
  canonicalSourceIdentity(record.sourceIdentity);
  canonicalAllowableVector(record.forceAllowables, 'nozzleAllowableProfile.forceAllowables');
  canonicalAllowableVector(record.momentAllowables, 'nozzleAllowableProfile.momentAllowables');
  if (record.interactionRuleId !== NOZZLE_INTERACTION_RULE) {
    failCodeApplication('Nozzle interaction rule is unsupported.', 'PIPING_NOZZLE_INTERACTION_RULE_UNSUPPORTED');
  }
  canonicalDeclaredPositive(record.interactionLimit, 'nozzleAllowableProfile.interactionLimit');
  requireHash(record.semanticHash, 'nozzleAllowableProfile.semanticHash');
  if (record.semanticHash !== semanticHash(nozzleProfileSemanticProjection(record))) {
    failCodeApplication('Nozzle allowable profile hash is stale.', 'PIPING_NOZZLE_PROFILE_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}

export function nozzleProfileSemanticProjection(record) {
  const { semanticHash: _semanticHash, ...projection } = record;
  return projection;
}

export function canonicalDeclaredPositive(source, field) {
  exactKeys(source, DECLARED_VALUE_KEYS, field);
  const value = finiteNumber(source.value, `${field}.value`);
  if (!(value > 0)) {
    failCodeApplication(`${field}.value must be greater than zero.`, 'PIPING_CODE_POSITIVE_VALUE_REQUIRED');
  }
  return deepFreeze({
    value,
    source: nonEmptyString(source.source, `${field}.source`),
  });
}

function canonicalAllowableVector(source, field) {
  exactKeys(source, VECTOR_ALLOWABLE_KEYS, field);
  return deepFreeze(Object.fromEntries(
    VECTOR_ALLOWABLE_KEYS.map((component) => [
      component,
      canonicalDeclaredPositive(source[component], `${field}.${component}`),
    ]),
  ));
}

function canonicalSourceIdentity(source) {
  exactKeys(source, SOURCE_IDENTITY_KEYS, 'nozzleAllowableProfile.sourceIdentity');
  return deepFreeze({
    authority: nonEmptyString(source.authority, 'nozzleAllowableProfile.sourceIdentity.authority'),
    documentId: nonEmptyString(source.documentId, 'nozzleAllowableProfile.sourceIdentity.documentId'),
    revision: nonEmptyString(source.revision, 'nozzleAllowableProfile.sourceIdentity.revision'),
    sourceSemanticHash: requireHash(
      source.sourceSemanticHash,
      'nozzleAllowableProfile.sourceIdentity.sourceSemanticHash',
    ),
  });
}
