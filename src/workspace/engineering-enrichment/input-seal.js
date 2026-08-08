import {
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import {
  deepFreeze,
  isPlainRecord,
} from '../../core/shared-piping-model/immutable.js';
import {
  assertEngineeringEnrichmentObservedAuthority,
  assertEngineeringEnrichmentReviewPacket,
} from './review-package-validation.js';

export const ENRICHMENT_APPROVAL_SCHEMA = 'EngineeringEnrichmentApproval.v1';
export const ENGINEERING_INPUT_SEAL_SCHEMA = 'EngineeringInputSeal.v1';
export const ENGINEERING_INPUT_SEAL_CURRENTNESS_SCHEMA =
  'EngineeringInputSealCurrentness.v1';

const EVIDENCE_KEYS = Object.freeze([
  'sourceDatasetHash',
  'sourceSharedModelHash',
  'sourceStructuralHash',
  'masterSnapshotHashes',
  'proposalHashes',
  'resolutionHash',
  'candidateProjectionHash',
  'structuralImpactHash',
  'engineDescriptorHash',
  'baselineReferenceHash',
  'baselineResultHash',
  'candidateResultHash',
  'numericalImpactHash',
]);

const CONTEXT_KEYS = Object.freeze([
  'projectDataHash',
  'overrideSetHash',
  'approximationSetHash',
  'selectorRegistryHash',
]);

/**
 * Records an explicit human approval of one immutable shadow review packet.
 * Approval is necessary for sealing, but does not itself persist data, create a
 * seal, authorize calculation consumption, or execute any calculation.
 */
export function buildEngineeringEnrichmentApproval(input) {
  exactKeys(input, [
    'reviewPacket',
    'approvalId',
    'reviewerId',
    'approvedAt',
    'basis',
  ], 'Enrichment approval input');
  const packet = assertEngineeringEnrichmentReviewPacket(input.reviewPacket);
  if (packet.status !== 'READY_FOR_REVIEW_ONLY' || packet.blockers.length !== 0) {
    fail(
      'ENRICHMENT_APPROVAL_REVIEW_PACKET_BLOCKED',
      'Only a blocker-free READY_FOR_REVIEW_ONLY packet may be approved for sealing.',
    );
  }
  const material = {
    schema: ENRICHMENT_APPROVAL_SCHEMA,
    approvalId: requiredText(input.approvalId, 'approvalId'),
    reviewPacketHash: packet.packetHash,
    reviewerId: requiredText(input.reviewerId, 'reviewerId'),
    approvedAt: canonicalTimestamp(input.approvedAt, 'approvedAt'),
    basis: requiredText(input.basis, 'basis'),
    decision: 'APPROVED_FOR_INPUT_SEAL',
    persistenceCreated: false,
    sealCreated: false,
    productionCalculationConsumptionEnabled: false,
    automaticCalculationTriggered: false,
  };
  return deepFreeze({ ...material, approvalHash: semanticHash(material) });
}

export function assertEngineeringEnrichmentApproval(value) {
  exactKeys(value, [
    'schema',
    'approvalId',
    'reviewPacketHash',
    'reviewerId',
    'approvedAt',
    'basis',
    'decision',
    'persistenceCreated',
    'sealCreated',
    'productionCalculationConsumptionEnabled',
    'automaticCalculationTriggered',
    'approvalHash',
  ], 'Engineering enrichment approval');
  if (value.schema !== ENRICHMENT_APPROVAL_SCHEMA) {
    fail('ENRICHMENT_APPROVAL_SCHEMA_INVALID', 'Unexpected enrichment approval schema.');
  }
  requiredText(value.approvalId, 'approvalId');
  requiredText(value.reviewPacketHash, 'reviewPacketHash');
  requiredText(value.reviewerId, 'reviewerId');
  canonicalTimestamp(value.approvedAt, 'approvedAt');
  requiredText(value.basis, 'basis');
  if (value.decision !== 'APPROVED_FOR_INPUT_SEAL'
      || value.persistenceCreated !== false
      || value.sealCreated !== false
      || value.productionCalculationConsumptionEnabled !== false
      || value.automaticCalculationTriggered !== false) {
    fail(
      'ENRICHMENT_APPROVAL_BOUNDARY_INVALID',
      'Approval must remain a non-persistent, non-executing approval-for-seal record.',
    );
  }
  const { approvalHash, ...material } = value;
  if (approvalHash !== semanticHash(material)) {
    fail('ENRICHMENT_APPROVAL_HASH_MISMATCH', 'Enrichment approval hash mismatch.');
  }
  return value;
}

/**
 * Creates a governed input seal from a reviewed shadow package only when the
 * complete observed evidence/context identity set is unchanged and at least one
 * explicit approval is bound to that exact packet.
 *
 * Package 4A deliberately stops at governance: a current seal does not enable
 * production calculation consumption or automatically execute a calculation.
 */
export function buildEngineeringInputSeal(input) {
  exactKeys(input, [
    'reviewPacket',
    'observedAuthority',
    'approvals',
    'sealId',
    'sealedBy',
    'sealedAt',
  ], 'Engineering input seal input');
  const packet = assertEngineeringEnrichmentReviewPacket(input.reviewPacket);
  const observed = assertEngineeringEnrichmentObservedAuthority(input.observedAuthority);
  if (packet.status !== 'READY_FOR_REVIEW_ONLY' || packet.blockers.length !== 0) {
    fail(
      'ENRICHMENT_INPUT_SEAL_REVIEW_PACKET_BLOCKED',
      'A blocker-free READY_FOR_REVIEW_ONLY packet is required for sealing.',
    );
  }
  const differences = comparePacketToObserved(packet, observed);
  if (differences.length > 0) {
    fail(
      'ENRICHMENT_INPUT_SEAL_STALE_REVIEW',
      'The reviewed shadow identities changed before sealing; review and reseal are required.',
      { differences },
    );
  }
  const approvals = normalizeApprovals(input.approvals, packet.packetHash);
  const identities = sealIdentities(packet);
  const material = {
    schema: ENGINEERING_INPUT_SEAL_SCHEMA,
    sealId: requiredText(input.sealId, 'sealId'),
    sealedBy: requiredText(input.sealedBy, 'sealedBy'),
    sealedAt: canonicalTimestamp(input.sealedAt, 'sealedAt'),
    reviewPacketHash: packet.packetHash,
    observedAuthorityHash: observed.observedAuthorityHash,
    approvalHashes: approvals.map((row) => row.approvalHash),
    approvalIds: approvals.map((row) => row.approvalId),
    ...identities,
    status: 'SEALED_CURRENT',
    current: true,
    requiresReseal: false,
    governedBindingCreated: true,
    persistenceCreated: false,
    productionCalculationConsumptionEnabled: false,
    automaticCalculationTriggered: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({ ...material, sealHash: semanticHash(material) });
}

export function assertEngineeringInputSeal(value) {
  exactKeys(value, [
    'schema',
    'sealId',
    'sealedBy',
    'sealedAt',
    'reviewPacketHash',
    'observedAuthorityHash',
    'approvalHashes',
    'approvalIds',
    ...EVIDENCE_KEYS,
    ...CONTEXT_KEYS,
    'status',
    'current',
    'requiresReseal',
    'governedBindingCreated',
    'persistenceCreated',
    'productionCalculationConsumptionEnabled',
    'automaticCalculationTriggered',
    'resultAcceptanceEligible',
    'sealHash',
  ], 'Engineering input seal');
  if (value.schema !== ENGINEERING_INPUT_SEAL_SCHEMA) {
    fail('ENRICHMENT_INPUT_SEAL_SCHEMA_INVALID', 'Unexpected EngineeringInputSeal schema.');
  }
  requiredText(value.sealId, 'sealId');
  requiredText(value.sealedBy, 'sealedBy');
  canonicalTimestamp(value.sealedAt, 'sealedAt');
  requiredText(value.reviewPacketHash, 'reviewPacketHash');
  requiredText(value.observedAuthorityHash, 'observedAuthorityHash');
  validateIdentities(value);
  if (!Array.isArray(value.approvalHashes) || value.approvalHashes.length === 0
      || !Array.isArray(value.approvalIds)
      || value.approvalIds.length !== value.approvalHashes.length
      || !strictlySortedUnique(value.approvalIds)
      || !strictlySortedUnique(value.approvalHashes)) {
    fail(
      'ENRICHMENT_INPUT_SEAL_APPROVALS_INVALID',
      'A seal requires non-empty unique sorted approval IDs and hashes.',
    );
  }
  if (value.status !== 'SEALED_CURRENT'
      || value.current !== true
      || value.requiresReseal !== false
      || value.governedBindingCreated !== true
      || value.persistenceCreated !== false
      || value.productionCalculationConsumptionEnabled !== false
      || value.automaticCalculationTriggered !== false
      || value.resultAcceptanceEligible !== false) {
    fail(
      'ENRICHMENT_INPUT_SEAL_BOUNDARY_INVALID',
      'Package 4A seals must remain current governance bindings with production consumption disabled.',
    );
  }
  const { sealHash, ...material } = value;
  if (sealHash !== semanticHash(material)) {
    fail('ENRICHMENT_INPUT_SEAL_HASH_MISMATCH', 'Engineering input seal hash mismatch.');
  }
  return value;
}

/**
 * Re-evaluates a governed seal against current observed identities. Any change
 * in source, master snapshots, proposals, resolution/projection/impact hashes,
 * Project Data, overrides, approximations, or selector registry requires reseal.
 */
export function evaluateEngineeringInputSealCurrentness(input) {
  exactKeys(input, ['seal', 'observedAuthority'], 'Engineering input seal currentness input');
  const seal = assertEngineeringInputSeal(input.seal);
  const observed = assertEngineeringEnrichmentObservedAuthority(input.observedAuthority);
  const differences = compareSealToObserved(seal, observed);
  const current = differences.length === 0;
  const material = {
    schema: ENGINEERING_INPUT_SEAL_CURRENTNESS_SCHEMA,
    sealId: seal.sealId,
    sealHash: seal.sealHash,
    observedAuthorityHash: observed.observedAuthorityHash,
    status: current ? 'CURRENT' : 'STALE_RESEAL_REQUIRED',
    current,
    requiresReseal: !current,
    differences,
    evaluationScope: 'COMPLETE_SEALED_IDENTITY_SET',
    productionCalculationConsumptionEnabled: false,
    automaticCalculationTriggered: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({ ...material, currentnessHash: semanticHash(material) });
}

export function assertEngineeringInputSealCurrentness(value) {
  exactKeys(value, [
    'schema',
    'sealId',
    'sealHash',
    'observedAuthorityHash',
    'status',
    'current',
    'requiresReseal',
    'differences',
    'evaluationScope',
    'productionCalculationConsumptionEnabled',
    'automaticCalculationTriggered',
    'resultAcceptanceEligible',
    'currentnessHash',
  ], 'Engineering input seal currentness');
  if (value.schema !== ENGINEERING_INPUT_SEAL_CURRENTNESS_SCHEMA
      || !['CURRENT', 'STALE_RESEAL_REQUIRED'].includes(value.status)
      || typeof value.current !== 'boolean'
      || value.requiresReseal !== !value.current
      || !Array.isArray(value.differences)
      || value.evaluationScope !== 'COMPLETE_SEALED_IDENTITY_SET'
      || value.productionCalculationConsumptionEnabled !== false
      || value.automaticCalculationTriggered !== false
      || value.resultAcceptanceEligible !== false) {
    fail(
      'ENRICHMENT_INPUT_SEAL_CURRENTNESS_INVALID',
      'Engineering input seal currentness contract is invalid.',
    );
  }
  if ((value.current && (value.status !== 'CURRENT' || value.differences.length !== 0))
      || (!value.current
        && (value.status !== 'STALE_RESEAL_REQUIRED' || value.differences.length === 0))) {
    fail(
      'ENRICHMENT_INPUT_SEAL_CURRENTNESS_STATE_INVALID',
      'Seal currentness status, differences and reseal state disagree.',
    );
  }
  const { currentnessHash, ...material } = value;
  if (currentnessHash !== semanticHash(material)) {
    fail(
      'ENRICHMENT_INPUT_SEAL_CURRENTNESS_HASH_MISMATCH',
      'Engineering input seal currentness hash mismatch.',
    );
  }
  return value;
}

function normalizeApprovals(values, packetHash) {
  if (!Array.isArray(values) || values.length === 0) {
    fail('ENRICHMENT_INPUT_SEAL_APPROVAL_REQUIRED', 'At least one explicit approval is required.');
  }
  const approvals = values.map(assertEngineeringEnrichmentApproval)
    .sort((left, right) => ascii(left.approvalId, right.approvalId));
  if (!strictlySortedUnique(approvals.map((row) => row.approvalId))) {
    fail('ENRICHMENT_INPUT_SEAL_APPROVAL_DUPLICATE', 'Approval IDs must be unique.');
  }
  if (approvals.some((row) => row.reviewPacketHash !== packetHash)) {
    fail(
      'ENRICHMENT_INPUT_SEAL_APPROVAL_PACKET_MISMATCH',
      'Every approval must bind the exact review packet being sealed.',
    );
  }
  return approvals;
}

function sealIdentities(packet) {
  return deepFreeze({
    ...Object.fromEntries(EVIDENCE_KEYS.map((key) => [
      key,
      cloneIdentity(packet.evidenceRefs[key]),
    ])),
    ...Object.fromEntries(CONTEXT_KEYS.map((key) => [
      key,
      cloneIdentity(packet.contextIdentities[key]),
    ])),
  });
}

function validateIdentities(value) {
  for (const key of EVIDENCE_KEYS) {
    validateIdentityValue(value[key], `seal.${key}`);
  }
  for (const key of CONTEXT_KEYS) {
    if (value[key] !== null) validateIdentityValue(value[key], `seal.${key}`);
  }
}

function comparePacketToObserved(packet, observed) {
  const differences = [];
  for (const key of EVIDENCE_KEYS) {
    addDifference(differences, `evidenceRefs.${key}`, packet.evidenceRefs[key], observed[key]);
  }
  for (const key of CONTEXT_KEYS) {
    addDifference(
      differences,
      `contextIdentities.${key}`,
      packet.contextIdentities[key],
      observed.contextIdentities[key],
    );
  }
  return deepFreeze(differences.sort(differenceOrder));
}

function compareSealToObserved(seal, observed) {
  const differences = [];
  for (const key of EVIDENCE_KEYS) {
    addDifference(differences, key, seal[key], observed[key]);
  }
  for (const key of CONTEXT_KEYS) {
    addDifference(differences, key, seal[key], observed.contextIdentities[key]);
  }
  return deepFreeze(differences.sort(differenceOrder));
}

function addDifference(target, field, sealed, observed) {
  if (semanticHash(cloneIdentity(sealed)) === semanticHash(cloneIdentity(observed))) return;
  target.push(deepFreeze({
    field,
    sealed: cloneIdentity(sealed),
    observed: cloneIdentity(observed),
  }));
}

function cloneIdentity(value) {
  if (Array.isArray(value)) return [...value].sort(ascii);
  if (isPlainRecord(value)) return canonicalizeJson(value);
  return value ?? null;
}

function validateIdentityValue(value, label) {
  if (Array.isArray(value)) {
    if (!strictlySortedUnique(value) || value.length === 0) {
      fail('ENRICHMENT_INPUT_SEAL_IDENTITY_INVALID', `${label} must be non-empty, unique and sorted.`);
    }
    value.forEach((item) => requiredText(item, label));
    return;
  }
  requiredText(value, label);
}

function exactKeys(value, expected, label) {
  if (!isPlainRecord(value)) {
    fail('ENRICHMENT_INPUT_SEAL_TYPE_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(ascii);
  const wanted = [...expected].sort(ascii);
  if (actual.length !== wanted.length
      || actual.some((key, index) => key !== wanted[index])) {
    fail(
      'ENRICHMENT_INPUT_SEAL_KEYS_INVALID',
      `${label} keys must be exactly: ${wanted.join(', ')}.`,
    );
  }
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail('ENRICHMENT_INPUT_SEAL_TEXT_INVALID', `${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  requiredText(value, label);
  let normalized;
  try {
    normalized = new Date(value).toISOString();
  } catch {
    normalized = '';
  }
  if (normalized !== value) {
    fail(
      'ENRICHMENT_INPUT_SEAL_TIMESTAMP_INVALID',
      `${label} must be a canonical ISO-8601 timestamp.`,
    );
  }
  return value;
}

function strictlySortedUnique(values) {
  if (new Set(values).size !== values.length) return false;
  return values.every((value, index) => index === 0 || ascii(values[index - 1], value) < 0);
}

function differenceOrder(left, right) {
  return ascii(left.field, right.field);
}

function ascii(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function fail(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details === null ? null : deepFreeze(details);
  throw error;
}
