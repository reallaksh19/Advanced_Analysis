import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { finiteNumber } from '../shared-analysis-contract/numeric.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';

export const QUALIFICATION_REQUEST_SCHEMA = 'linear-piping-qualification-comparison-request/v1';
export const QUALIFICATION_RESULT_SCHEMA = 'linear-piping-qualification-comparison/v1';
export const QUALIFICATION_PROFILE_SCHEMA = 'linear-piping-qualification-profile/v1';
export const QUALIFICATION_KINDS = Object.freeze([
  'REAL_MODEL_RECONCILIATION',
  'COMMERCIAL_CORROBORATION',
]);
export const AUTHORITY_KINDS = Object.freeze([
  'INDEPENDENT_ENGINEERING_REVIEW',
  'COMMERCIAL_PIPE_STRESS_PROGRAM',
]);
export const SELECTOR_KINDS = Object.freeze([
  'INTERFACE_FORCE_LOCAL',
  'INTERFACE_MOMENT_REFERENCE_LOCAL',
  'NOZZLE_UTILIZATION',
  'B31_CALCULATED_STRESS',
  'B31_UTILIZATION',
]);
export const VECTOR_COMPONENTS = Object.freeze(['X', 'Y', 'Z']);
export const COMPARISON_RULE_ID = 'ABSOLUTE_OR_RELATIVE_V1';

export const PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'comparisonRuleId',
  'relativeScaleFloor',
  'semanticHash',
]);
export const DECLARED_VALUE_KEYS = Object.freeze(['value', 'source']);
export const AUTHORITY_KEYS = Object.freeze([
  'authorityKind',
  'organization',
  'productOrMethod',
  'version',
  'documentId',
  'revision',
  'runId',
  'sourceSemanticHash',
  'reviewer',
  'reviewedAtUtc',
]);
export const OBSERVATION_KEYS = Object.freeze([
  'comparisonId',
  'selector',
  'referenceValue',
  'absoluteTolerance',
  'relativeTolerance',
]);
export const VALUE_KEYS = Object.freeze(['value', 'unit']);
export const ABSOLUTE_TOLERANCE_KEYS = Object.freeze(['value', 'unit', 'source']);
export const RELATIVE_TOLERANCE_KEYS = Object.freeze(['value', 'source']);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

export class LinearPipingProjectQualificationError extends SharedAnalysisContractError {
  constructor(message, code, evidence = null) {
    super(message, code);
    this.name = 'LinearPipingProjectQualificationError';
    this.evidence = evidence;
  }
}

export function failQualification(message, code, evidence = null) {
  throw new LinearPipingProjectQualificationError(message, code, evidence);
}

export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failQualification(`${field} must be an array.`, 'PIPING_QUALIFICATION_ARRAY_REQUIRED');
  }
  return value;
}

export function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    failQualification(`${field} must be a semantic hash.`, 'PIPING_QUALIFICATION_HASH_INVALID');
  }
  return value;
}

export function sealQualificationProfile(source) {
  exactKeys(source, PROFILE_KEYS, 'qualificationProfile');
  if (source.schema !== QUALIFICATION_PROFILE_SCHEMA) {
    failQualification('Qualification profile schema is invalid.', 'PIPING_QUALIFICATION_PROFILE_INVALID');
  }
  if (source.comparisonRuleId !== COMPARISON_RULE_ID) {
    failQualification('Qualification comparison rule is unsupported.', 'PIPING_QUALIFICATION_RULE_UNSUPPORTED');
  }
  const draft = {
    schema: source.schema,
    profileId: nonEmptyString(source.profileId, 'qualificationProfile.profileId'),
    comparisonRuleId: source.comparisonRuleId,
    relativeScaleFloor: canonicalDeclaredPositive(
      source.relativeScaleFloor,
      'qualificationProfile.relativeScaleFloor',
    ),
    semanticHash: '',
  };
  draft.semanticHash = semanticHash(profileSemanticProjection(draft));
  return requireQualificationProfile(draft);
}

export function requireQualificationProfile(record) {
  exactKeys(record, PROFILE_KEYS, 'qualificationProfile');
  if (record.schema !== QUALIFICATION_PROFILE_SCHEMA
    || record.comparisonRuleId !== COMPARISON_RULE_ID) {
    failQualification('Qualification profile is invalid.', 'PIPING_QUALIFICATION_PROFILE_INVALID');
  }
  nonEmptyString(record.profileId, 'qualificationProfile.profileId');
  canonicalDeclaredPositive(record.relativeScaleFloor, 'qualificationProfile.relativeScaleFloor');
  requireHash(record.semanticHash, 'qualificationProfile.semanticHash');
  if (record.semanticHash !== semanticHash(profileSemanticProjection(record))) {
    failQualification('Qualification profile hash is stale.', 'PIPING_QUALIFICATION_PROFILE_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}

export function canonicalAuthority(source, qualificationKind) {
  exactKeys(source, AUTHORITY_KEYS, 'qualificationAuthority');
  const expectedKind = qualificationKind === 'REAL_MODEL_RECONCILIATION'
    ? 'INDEPENDENT_ENGINEERING_REVIEW'
    : 'COMMERCIAL_PIPE_STRESS_PROGRAM';
  if (source.authorityKind !== expectedKind) {
    failQualification(
      `qualificationAuthority.authorityKind must be ${expectedKind}.`,
      'PIPING_QUALIFICATION_AUTHORITY_KIND_MISMATCH',
    );
  }
  if (!UTC_PATTERN.test(source.reviewedAtUtc) || !Number.isFinite(Date.parse(source.reviewedAtUtc))) {
    failQualification('qualificationAuthority.reviewedAtUtc must be an exact UTC timestamp.', 'PIPING_QUALIFICATION_TIME_INVALID');
  }
  return deepFreeze({
    authorityKind: source.authorityKind,
    organization: nonEmptyString(source.organization, 'qualificationAuthority.organization'),
    productOrMethod: nonEmptyString(source.productOrMethod, 'qualificationAuthority.productOrMethod'),
    version: nonEmptyString(source.version, 'qualificationAuthority.version'),
    documentId: nonEmptyString(source.documentId, 'qualificationAuthority.documentId'),
    revision: nonEmptyString(source.revision, 'qualificationAuthority.revision'),
    runId: nonEmptyString(source.runId, 'qualificationAuthority.runId'),
    sourceSemanticHash: requireHash(source.sourceSemanticHash, 'qualificationAuthority.sourceSemanticHash'),
    reviewer: nonEmptyString(source.reviewer, 'qualificationAuthority.reviewer'),
    reviewedAtUtc: source.reviewedAtUtc,
  });
}

export function canonicalReferenceValue(source, field) {
  exactKeys(source, VALUE_KEYS, field);
  return deepFreeze({
    value: finiteNumber(source.value, `${field}.value`),
    unit: nonEmptyString(source.unit, `${field}.unit`),
  });
}

export function canonicalAbsoluteTolerance(source, field) {
  exactKeys(source, ABSOLUTE_TOLERANCE_KEYS, field);
  const value = finiteNumber(source.value, `${field}.value`);
  if (value < 0) failQualification(`${field}.value must be non-negative.`, 'PIPING_QUALIFICATION_TOLERANCE_INVALID');
  return deepFreeze({
    value,
    unit: nonEmptyString(source.unit, `${field}.unit`),
    source: nonEmptyString(source.source, `${field}.source`),
  });
}

export function canonicalRelativeTolerance(source, field) {
  exactKeys(source, RELATIVE_TOLERANCE_KEYS, field);
  const value = finiteNumber(source.value, `${field}.value`);
  if (value < 0) failQualification(`${field}.value must be non-negative.`, 'PIPING_QUALIFICATION_TOLERANCE_INVALID');
  return deepFreeze({
    value,
    source: nonEmptyString(source.source, `${field}.source`),
  });
}

export function canonicalDeclaredPositive(source, field) {
  exactKeys(source, DECLARED_VALUE_KEYS, field);
  const value = finiteNumber(source.value, `${field}.value`);
  if (!(value > 0)) failQualification(`${field}.value must be positive.`, 'PIPING_QUALIFICATION_VALUE_INVALID');
  return deepFreeze({
    value,
    source: nonEmptyString(source.source, `${field}.source`),
  });
}

function profileSemanticProjection(record) {
  const { semanticHash: _semanticHash, ...projection } = record;
  return projection;
}
