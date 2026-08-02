import { deepFreeze } from '../../core/shared-piping-model/immutable.js';

export const ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA =
  'EngineeringEnrichmentCandidateProjection.v2';

export const SHADOW_NONSTRUCTURAL_FIELD_REGISTRY = deepFreeze({
  componentWeightKg: deepFreeze({
    targetKind: 'COMPONENT',
    canonicalUnit: 'kg',
  }),
});

export const CANDIDATE_PROJECTION_KEYS = Object.freeze([
  'schema', 'sourceDatasetHash', 'sourceSharedModelHash', 'sourceStructuralHash',
  'resolutionHash', 'simulationMode', 'rows', 'summary', 'bindingCreated',
  'reviewSelectionCreated', 'approvalGranted', 'current', 'sealEligible',
  'calculationEligible', 'projectionHash',
]);

export const CANDIDATE_ROW_KEYS = Object.freeze([
  'proposalId', 'proposalHash', 'targetKind', 'targetId', 'fieldId',
  'proposedValue', 'unit', 'authorityLevel', 'disposition', 'blockers',
  'existingExplicitEvidence', 'bindingCreated',
]);

export const CANDIDATE_FALSE_AUTHORITY_FIELDS = Object.freeze([
  'bindingCreated', 'reviewSelectionCreated', 'approvalGranted', 'current',
  'sealEligible', 'calculationEligible',
]);

export const CANDIDATE_DISPOSITIONS = Object.freeze([
  'SHADOW_CANDIDATE_VALUE', 'NOT_PROJECTED_UNRESOLVED',
  'BLOCKED_TARGET_KIND', 'BLOCKED_TARGET_NOT_FOUND',
  'BLOCKED_EXPLICIT_SOURCE_PRECEDENCE', 'BLOCKED_SAME_AUTHORITY_CONFLICT',
]);
