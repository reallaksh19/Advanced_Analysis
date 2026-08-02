import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import {
  requireBoolean,
  requireConfidence,
  requireExactKeys,
  requireIdentity,
  requireJsonScalar,
  requireMember,
  requireNullableUnit,
  requireOptionalIdentity,
  requireOptionalSourceDigest,
  requireStringArray,
} from './validation.js';

export const COMMON_ENRICHED_FIELD_SCHEMA = 'common-enriched-properties-field/v1';

export const ENRICHMENT_STATUSES = Object.freeze([
  'RESOLVED_EXACT',
  'RESOLVED_DERIVED',
  'PROPOSED_REVIEW',
  'BLOCKED_MISSING',
  'BLOCKED_AMBIGUOUS',
  'BLOCKED_CONFLICT',
  'BLOCKED_STALE_SOURCE',
  'NOT_APPLICABLE',
]);

export const ENRICHMENT_SOURCE_KINDS = Object.freeze([
  'MODEL',
  'LINE_LIST',
  'PIPING_CLASS',
  'MATERIAL_REGISTER',
  'FLUID_REGISTER',
  'INSULATION_REGISTER',
  'COMPONENT_WEIGHT_MASTER',
  'DERIVATION_POLICY',
  'MANUAL_REVIEW',
  'NONE',
]);

export const COMMON_ENRICHED_FIELD_KEYS = Object.freeze([
  'schema',
  'field',
  'value',
  'unit',
  'status',
  'sourceKind',
  'sourceKey',
  'sourceHash',
  'locator',
  'matchMethod',
  'confidence',
  'policyId',
  'policyHash',
  'reviewEventId',
  'approved',
  'diagnostics',
]);

const BLOCKED_STATUSES = Object.freeze([
  'BLOCKED_MISSING',
  'BLOCKED_AMBIGUOUS',
  'BLOCKED_CONFLICT',
  'BLOCKED_STALE_SOURCE',
]);

export function requireCommonEnrichedField(value) {
  requireExactKeys(value, COMMON_ENRICHED_FIELD_KEYS, 'enrichedField');
  if (value.schema !== COMMON_ENRICHED_FIELD_SCHEMA) {
    failCommonEnrichment('enrichedField.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const field = {
    schema: value.schema,
    field: requireIdentity(value.field, 'enrichedField.field'),
    value: requireJsonScalar(value.value, 'enrichedField.value'),
    unit: requireNullableUnit(value.unit, 'enrichedField.unit'),
    status: requireMember(value.status, ENRICHMENT_STATUSES, 'enrichedField.status'),
    sourceKind: requireMember(value.sourceKind, ENRICHMENT_SOURCE_KINDS, 'enrichedField.sourceKind'),
    sourceKey: requireOptionalIdentity(value.sourceKey, 'enrichedField.sourceKey'),
    sourceHash: requireOptionalSourceDigest(value.sourceHash, 'enrichedField.sourceHash'),
    locator: requireOptionalIdentity(value.locator, 'enrichedField.locator'),
    matchMethod: requireIdentity(value.matchMethod, 'enrichedField.matchMethod'),
    confidence: requireConfidence(value.confidence, 'enrichedField.confidence'),
    policyId: requireOptionalIdentity(value.policyId, 'enrichedField.policyId'),
    policyHash: requireOptionalSourceDigest(value.policyHash, 'enrichedField.policyHash'),
    reviewEventId: requireOptionalIdentity(value.reviewEventId, 'enrichedField.reviewEventId'),
    approved: requireBoolean(value.approved, 'enrichedField.approved'),
    diagnostics: requireStringArray(value.diagnostics, 'enrichedField.diagnostics'),
  };
  requireEvidenceConsistency(field);
  requireStatusConsistency(field);
  return deepFreeze(field);
}

function requireEvidenceConsistency(field) {
  const absent = field.sourceKind === 'NONE';
  const bindingValues = [field.sourceKey, field.sourceHash, field.locator];
  if (absent) {
    if (bindingValues.some((entry) => entry !== null) || field.matchMethod !== 'NONE') {
      failCommonEnrichment('NONE evidence must carry no source binding.', 'COMMON_ENRICHED_EVIDENCE_INVALID');
    }
    return;
  }
  if (bindingValues.some((entry) => entry === null) || field.matchMethod === 'NONE') {
    failCommonEnrichment('Evidence binding is incomplete.', 'COMMON_ENRICHED_EVIDENCE_INVALID');
  }
}

function requireStatusConsistency(field) {
  if (field.status === 'RESOLVED_EXACT') {
    requireResolvedValue(field);
    requireEvidence(field);
    requireNoPolicy(field);
    requireConfidenceValue(field, 1);
    return;
  }
  if (field.status === 'RESOLVED_DERIVED') {
    requireResolvedValue(field);
    requireEvidence(field);
    requirePolicy(field);
    requireConfidenceValue(field, 1);
    return;
  }
  if (field.status === 'PROPOSED_REVIEW') {
    requireResolvedValue(field);
    requireEvidence(field);
    requirePolicy(field);
    if (field.confidence <= 0) {
      failCommonEnrichment('PROPOSED_REVIEW confidence must be greater than zero.', 'COMMON_ENRICHED_STATUS_INVALID');
    }
    if (field.approved && field.reviewEventId === null) {
      failCommonEnrichment('An approved proposal requires a reviewEventId.', 'COMMON_ENRICHED_REVIEW_REQUIRED');
    }
    return;
  }
  if (BLOCKED_STATUSES.includes(field.status)) {
    if (field.value !== null || field.approved || field.confidence !== 0 || field.reviewEventId !== null) {
      failCommonEnrichment('Blocked fields must remain null, unapproved and zero-confidence.', 'COMMON_ENRICHED_STATUS_INVALID');
    }
    requireNoPolicy(field);
    return;
  }
  if (field.status === 'NOT_APPLICABLE') {
    if (field.value !== null || field.unit !== null || field.confidence !== 1 || !field.approved) {
      failCommonEnrichment('NOT_APPLICABLE must be approved, null and unitless.', 'COMMON_ENRICHED_STATUS_INVALID');
    }
  }
}

function requireResolvedValue(field) {
  if (field.value === null) {
    failCommonEnrichment(`${field.status} requires a value.`, 'COMMON_ENRICHED_STATUS_INVALID');
  }
}

function requireEvidence(field) {
  if (field.sourceKind === 'NONE') {
    failCommonEnrichment(`${field.status} requires evidence.`, 'COMMON_ENRICHED_EVIDENCE_REQUIRED');
  }
}

function requirePolicy(field) {
  if (field.policyId === null || field.policyHash === null) {
    failCommonEnrichment(`${field.status} requires a policy binding.`, 'COMMON_ENRICHED_POLICY_REQUIRED');
  }
}

function requireNoPolicy(field) {
  if (field.policyId !== null || field.policyHash !== null) {
    failCommonEnrichment(`${field.status} must not carry a derivation policy.`, 'COMMON_ENRICHED_POLICY_INVALID');
  }
}

function requireConfidenceValue(field, expected) {
  if (field.confidence !== expected) {
    failCommonEnrichment(`${field.status} confidence must equal ${expected}.`, 'COMMON_ENRICHED_CONFIDENCE_INVALID');
  }
}
