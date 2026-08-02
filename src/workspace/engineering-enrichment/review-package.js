import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import {
  deepFreeze,
  isPlainRecord,
} from '../../core/shared-piping-model/immutable.js';
import {
  assertEngineeringEnrichmentCandidateProjection,
} from './candidate-projection.js';
import {
  assertEngineeringEnrichmentProposal,
} from './master-adapters.js';
import {
  assertMasterDataSnapshot,
} from './master-snapshot.js';
import {
  assertEngineeringEnrichmentNumericalImpact,
  assertEnrichmentShadowCalculationResult,
} from './numerical-impact.js';
import {
  assertEngineeringEnrichmentResolution,
} from './resolution-validation.js';
import {
  assertEngineeringEnrichmentStructuralImpact,
} from './structural-impact.js';

export const ENRICHMENT_REVIEW_PACKET_SCHEMA =
  'EngineeringEnrichmentReviewPacket.v1';
export const ENRICHMENT_OBSERVED_AUTHORITY_SCHEMA =
  'EngineeringEnrichmentObservedAuthority.v1';
export const ENRICHMENT_STALENESS_REPORT_SCHEMA =
  'EngineeringEnrichmentStalenessReport.v1';
export const ENRICHMENT_REPRODUCIBILITY_RECEIPT_SCHEMA =
  'EngineeringEnrichmentShadowReproducibilityReceipt.v1';

const CONTEXT_KEYS = Object.freeze([
  'projectDataHash',
  'overrideSetHash',
  'approximationSetHash',
  'selectorRegistryHash',
]);
const FALSE_AUTHORITY_FIELDS = Object.freeze([
  'bindingCreated',
  'reviewSelectionCreated',
  'approvalGranted',
  'current',
  'sealEligible',
  'calculationEligible',
  'resultAcceptanceEligible',
]);
const EVIDENCE_REF_KEYS = Object.freeze([
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

export function buildEnrichmentReviewPacket(input) {
  assertExactKeys(input, [
    'masterSnapshots',
    'proposals',
    'resolution',
    'candidateProjection',
    'structuralImpact',
    'numericalImpact',
    'contextIdentities',
  ], 'Review packet input');
  const snapshots = validateSnapshots(input.masterSnapshots);
  const proposals = validateProposals(input.proposals);
  const resolution = assertEngineeringEnrichmentResolution(input.resolution);
  const candidate = assertEngineeringEnrichmentCandidateProjection(
    input.candidateProjection,
  );
  const structural = assertEngineeringEnrichmentStructuralImpact(
    input.structuralImpact,
  );
  const numerical = assertEngineeringEnrichmentNumericalImpact(
    input.numericalImpact,
  );
  const contextIdentities = normalizeContextIdentities(input.contextIdentities);
  assertReviewChain({ snapshots, proposals, resolution, candidate, structural, numerical });

  const blockers = reviewBlockers({ resolution, candidate, structural, numerical });
  const status = blockers.length ? 'BLOCKED' : 'READY_FOR_REVIEW_ONLY';
  const evidenceRefs = deepFreeze({
    sourceDatasetHash: resolution.sourceDatasetHash,
    sourceSharedModelHash: resolution.sourceSharedModelHash,
    sourceStructuralHash: candidate.sourceStructuralHash,
    masterSnapshotHashes: [...resolution.masterSnapshotHashes].sort(compareAscii),
    proposalHashes: [...resolution.proposalHashes].sort(compareAscii),
    resolutionHash: resolution.resolutionHash,
    candidateProjectionHash: candidate.projectionHash,
    structuralImpactHash: structural.impactHash,
    engineDescriptorHash: numerical.engineDescriptorHash,
    baselineReferenceHash: numerical.baselineReferenceHash,
    baselineResultHash: numerical.baselineResultHash,
    candidateResultHash: numerical.candidateResultHash,
    numericalImpactHash: numerical.impactHash,
  });
  const material = {
    schema: ENRICHMENT_REVIEW_PACKET_SCHEMA,
    evidenceRefs,
    contextIdentities,
    blockers: canonicalizeJson(blockers),
    summary: deepFreeze({
      snapshotCount: snapshots.length,
      proposalCount: proposals.length,
      step1Status: resolution.summary?.status ?? null,
      candidateStatus: candidate.summary?.status ?? null,
      step2Status: structural.status,
      step3Status: numerical.status,
      contextIdentityCount: CONTEXT_KEYS.filter(
        (key) => contextIdentities[key] !== null,
      ).length,
      status,
    }),
    status,
    reviewDecisionStatus: 'NOT_RECORDED',
    persistenceCreated: false,
    bindingCreated: false,
    reviewSelectionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({
    ...material,
    packetHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentReviewPacket(value) {
  assertExactKeys(value, [
    'schema',
    'evidenceRefs',
    'contextIdentities',
    'blockers',
    'summary',
    'status',
    'reviewDecisionStatus',
    'persistenceCreated',
    ...FALSE_AUTHORITY_FIELDS,
    'packetHash',
  ], 'Engineering enrichment review packet');
  if (value.schema !== ENRICHMENT_REVIEW_PACKET_SCHEMA) {
    fail(`review packet schema must be ${ENRICHMENT_REVIEW_PACKET_SCHEMA}.`);
  }
  if (!['READY_FOR_REVIEW_ONLY', 'BLOCKED'].includes(value.status)) {
    fail('review packet status is invalid.');
  }
  if (value.reviewDecisionStatus !== 'NOT_RECORDED') {
    fail('review decision must remain unrecorded.', RangeError);
  }
  if (value.persistenceCreated !== false) {
    fail('review packet must not create persistence.', RangeError);
  }
  FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) fail(`${field} must remain false.`, RangeError);
  });
  validateEvidenceRefs(value.evidenceRefs);
  normalizeContextIdentities(value.contextIdentities);
  if (!Array.isArray(value.blockers) || !isPlainRecord(value.summary)) {
    fail('blockers must be an array and summary must be an object.');
  }
  if (
    (value.status === 'READY_FOR_REVIEW_ONLY' && value.blockers.length !== 0)
    || (value.status === 'BLOCKED' && value.blockers.length === 0)
  ) {
    fail('review packet status and blockers disagree.', RangeError);
  }
  const material = reviewPacketMaterial(value);
  if (value.packetHash !== semanticHash(material)) {
    fail('packetHash is invalid.', RangeError);
  }
  return value;
}

export function buildEnrichmentObservedAuthority(input) {
  assertExactKeys(input, [
    ...EVIDENCE_REF_KEYS,
    'contextIdentities',
  ], 'Observed authority input');
  const material = {
    schema: ENRICHMENT_OBSERVED_AUTHORITY_SCHEMA,
    ...normalizeEvidenceRefs(input),
    contextIdentities: normalizeContextIdentities(input.contextIdentities),
    observationAuthority: 'CALLER_SUPPLIED_OBSERVED_IDENTITIES',
    governedCurrentnessApproved: false,
  };
  return deepFreeze({
    ...material,
    observedAuthorityHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentObservedAuthority(value) {
  assertExactKeys(value, [
    'schema',
    ...EVIDENCE_REF_KEYS,
    'contextIdentities',
    'observationAuthority',
    'governedCurrentnessApproved',
    'observedAuthorityHash',
  ], 'Engineering enrichment observed authority');
  if (value.schema !== ENRICHMENT_OBSERVED_AUTHORITY_SCHEMA) {
    fail(`observed authority schema must be ${ENRICHMENT_OBSERVED_AUTHORITY_SCHEMA}.`);
  }
  if (
    value.observationAuthority !== 'CALLER_SUPPLIED_OBSERVED_IDENTITIES'
    || value.governedCurrentnessApproved !== false
  ) {
    fail('observed identities must not grant governed currentness.', RangeError);
  }
  const rebuilt = buildEnrichmentObservedAuthority({
    ...Object.fromEntries(EVIDENCE_REF_KEYS.map((key) => [key, value[key]])),
    contextIdentities: value.contextIdentities,
  });
  if (canonicalStringify(rebuilt) !== canonicalStringify(value)) {
    fail('observed authority differs from canonical authority.', RangeError);
  }
  return value;
}

export function buildEnrichmentStalenessReport(input) {
  assertExactKeys(input, ['reviewPacket', 'observedAuthority'], 'Staleness input');
  const packet = assertEngineeringEnrichmentReviewPacket(input.reviewPacket);
  const observed = assertEngineeringEnrichmentObservedAuthority(
    input.observedAuthority,
  );
  const differences = comparePacketToObserved(packet, observed);
  const stale = differences.length > 0;
  const material = {
    schema: ENRICHMENT_STALENESS_REPORT_SCHEMA,
    reviewPacketHash: packet.packetHash,
    observedAuthorityHash: observed.observedAuthorityHash,
    differences,
    status: stale ? 'STALE_SHADOW_IDENTITIES' : 'UNCHANGED_SHADOW_IDENTITIES',
    stale,
    evaluationScope: 'IDENTITY_ONLY_NO_CURRENTNESS_GRANT',
    governedCurrentnessApproved: false,
    bindingCreated: false,
    reviewSelectionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({
    ...material,
    stalenessHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentStalenessReport(value) {
  assertExactKeys(value, [
    'schema',
    'reviewPacketHash',
    'observedAuthorityHash',
    'differences',
    'status',
    'stale',
    'evaluationScope',
    'governedCurrentnessApproved',
    ...FALSE_AUTHORITY_FIELDS,
    'stalenessHash',
  ], 'Engineering enrichment staleness report');
  if (value.schema !== ENRICHMENT_STALENESS_REPORT_SCHEMA) {
    fail(`staleness schema must be ${ENRICHMENT_STALENESS_REPORT_SCHEMA}.`);
  }
  if (!Array.isArray(value.differences)) fail('differences must be an array.');
  if (typeof value.stale !== 'boolean') fail('stale must be boolean.');
  const expectedStatus = value.stale
    ? 'STALE_SHADOW_IDENTITIES'
    : 'UNCHANGED_SHADOW_IDENTITIES';
  if (value.status !== expectedStatus) fail('staleness status is invalid.');
  if (
    value.evaluationScope !== 'IDENTITY_ONLY_NO_CURRENTNESS_GRANT'
    || value.governedCurrentnessApproved !== false
  ) {
    fail('staleness evidence must not grant currentness.', RangeError);
  }
  FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) fail(`${field} must remain false.`, RangeError);
  });
  if (
    (value.stale && value.differences.length === 0)
    || (!value.stale && value.differences.length !== 0)
  ) {
    fail('stale flag and differences disagree.', RangeError);
  }
  const material = stalenessMaterial(value);
  if (value.stalenessHash !== semanticHash(material)) {
    fail('stalenessHash is invalid.', RangeError);
  }
  return value;
}

export function buildEnrichmentShadowReproducibilityReceipt(input) {
  assertExactKeys(input, [
    'referenceCandidateResult',
    'repeatedCandidateResult',
  ], 'Shadow reproducibility input');
  const reference = assertCandidateResult(
    input.referenceCandidateResult,
    'referenceCandidateResult',
  );
  const repeated = assertCandidateResult(
    input.repeatedCandidateResult,
    'repeatedCandidateResult',
  );
  const differences = compareCandidateResults(reference, repeated);
  const matched = differences.length === 0;
  const material = {
    schema: ENRICHMENT_REPRODUCIBILITY_RECEIPT_SCHEMA,
    referenceResultHash: reference.resultHash,
    repeatedResultHash: repeated.resultHash,
    requestHash: reference.requestHash,
    descriptorHash: reference.descriptorHash,
    candidateProjectionHash: reference.comparisonCandidateProjectionHash,
    differences,
    matched,
    status: matched
      ? 'MATCHED_SHADOW_REPRODUCTION'
      : 'MISMATCHED_SHADOW_REPRODUCTION',
    productionResultCompared: false,
    postSealAuthorityPresent: false,
    bindingCreated: false,
    reviewSelectionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({
    ...material,
    receiptHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentShadowReproducibilityReceipt(value) {
  assertExactKeys(value, [
    'schema',
    'referenceResultHash',
    'repeatedResultHash',
    'requestHash',
    'descriptorHash',
    'candidateProjectionHash',
    'differences',
    'matched',
    'status',
    'productionResultCompared',
    'postSealAuthorityPresent',
    ...FALSE_AUTHORITY_FIELDS,
    'receiptHash',
  ], 'Engineering enrichment reproducibility receipt');
  if (value.schema !== ENRICHMENT_REPRODUCIBILITY_RECEIPT_SCHEMA) {
    fail(`receipt schema must be ${ENRICHMENT_REPRODUCIBILITY_RECEIPT_SCHEMA}.`);
  }
  if (!Array.isArray(value.differences) || typeof value.matched !== 'boolean') {
    fail('receipt differences and matched fields are invalid.');
  }
  const expectedStatus = value.matched
    ? 'MATCHED_SHADOW_REPRODUCTION'
    : 'MISMATCHED_SHADOW_REPRODUCTION';
  if (value.status !== expectedStatus) fail('receipt status is invalid.');
  if (
    value.productionResultCompared !== false
    || value.postSealAuthorityPresent !== false
  ) {
    fail('shadow receipt must not claim production or post-seal authority.', RangeError);
  }
  FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) fail(`${field} must remain false.`, RangeError);
  });
  if (
    (value.matched && value.differences.length !== 0)
    || (!value.matched && value.differences.length === 0)
  ) {
    fail('matched flag and differences disagree.', RangeError);
  }
  const material = receiptMaterial(value);
  if (value.receiptHash !== semanticHash(material)) {
    fail('receiptHash is invalid.', RangeError);
  }
  return value;
}

function validateSnapshots(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('masterSnapshots must be a non-empty array.');
  }
  const rows = value.map(assertMasterDataSnapshot);
  assertUnique(rows.map((row) => row.snapshotHash), 'snapshotHash');
  return rows;
}

function validateProposals(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('proposals must be a non-empty array.');
  }
  const rows = value.map(assertEngineeringEnrichmentProposal);
  assertUnique(rows.map((row) => row.proposalId), 'proposalId');
  assertUnique(rows.map((row) => row.proposalHash), 'proposalHash');
  return rows;
}

function assertReviewChain({
  snapshots,
  proposals,
  resolution,
  candidate,
  structural,
  numerical,
}) {
  assertSameList(
    snapshots.map((row) => row.snapshotHash),
    resolution.masterSnapshotHashes,
    'master snapshot identities differ from resolution authority',
  );
  assertSameList(
    proposals.map((row) => row.proposalHash),
    resolution.proposalHashes,
    'proposal identities differ from resolution authority',
  );
  const checks = [
    [candidate.sourceDatasetHash, resolution.sourceDatasetHash, 'candidate source dataset'],
    [candidate.sourceSharedModelHash, resolution.sourceSharedModelHash, 'candidate shared model'],
    [candidate.resolutionHash, resolution.resolutionHash, 'candidate resolution'],
    [structural.candidateProjectionHash, candidate.projectionHash, 'structural candidate'],
    [structural.sourceSharedModelHash, candidate.sourceSharedModelHash, 'structural shared model'],
    [structural.sourceStructuralHash, candidate.sourceStructuralHash, 'structural source authority'],
    [numerical.sourceDatasetHash, candidate.sourceDatasetHash, 'numerical source dataset'],
    [numerical.sourceSharedModelHash, candidate.sourceSharedModelHash, 'numerical shared model'],
    [numerical.sourceStructuralHash, candidate.sourceStructuralHash, 'numerical structural authority'],
    [numerical.candidateProjectionHash, candidate.projectionHash, 'numerical candidate'],
    [numerical.structuralImpactHash, structural.impactHash, 'numerical structural impact'],
  ];
  checks.forEach(([actual, expected, label]) => {
    if (actual !== expected) fail(`${label} identity mismatch.`, RangeError);
  });
}

function reviewBlockers({ resolution, candidate, structural, numerical }) {
  const blockers = [];
  if (resolution.summary?.status !== 'READY_FOR_REVIEW') {
    blockers.push({
      code: 'STEP_1_NOT_READY',
      observedStatus: resolution.summary?.status ?? null,
    });
  }
  if (candidate.summary?.status !== 'READY_FOR_STRUCTURAL_IMPACT') {
    blockers.push({
      code: 'CANDIDATE_NOT_READY',
      observedStatus: candidate.summary?.status ?? null,
    });
  }
  if (structural.status !== 'PASS_SHADOW_NO_STRUCTURAL_CHANGE') {
    blockers.push({ code: 'STEP_2_NOT_PASSING', observedStatus: structural.status });
  }
  if (numerical.status !== 'RECORDED_SHADOW_RAW_DELTAS') {
    blockers.push({ code: 'STEP_3_NOT_READY', observedStatus: numerical.status });
  }
  return blockers;
}

function validateEvidenceRefs(value) {
  assertExactKeys(value, EVIDENCE_REF_KEYS, 'Review packet evidenceRefs');
  normalizeEvidenceRefs(value);
}

function normalizeEvidenceRefs(value) {
  const result = {};
  EVIDENCE_REF_KEYS.forEach((key) => {
    if (key === 'masterSnapshotHashes' || key === 'proposalHashes') {
      result[key] = sortedUniqueText(value[key], key);
    } else {
      result[key] = requiredText(value[key], key);
    }
  });
  return result;
}

function normalizeContextIdentities(value) {
  assertExactKeys(value, CONTEXT_KEYS, 'Context identities');
  return deepFreeze(Object.fromEntries(CONTEXT_KEYS.map((key) => [
    key,
    nullableIdentity(value[key], `contextIdentities.${key}`),
  ])));
}

function comparePacketToObserved(packet, observed) {
  const differences = [];
  EVIDENCE_REF_KEYS.forEach((field) => {
    const left = packet.evidenceRefs[field];
    const right = observed[field];
    if (canonicalStringify(left) !== canonicalStringify(right)) {
      differences.push(difference(field, left, right));
    }
  });
  CONTEXT_KEYS.forEach((field) => {
    const left = packet.contextIdentities[field];
    const right = observed.contextIdentities[field];
    if (left !== right) {
      differences.push(difference(`contextIdentities.${field}`, left, right));
    }
  });
  differences.sort((left, right) => compareAscii(left.field, right.field));
  return deepFreeze(differences);
}

function compareCandidateResults(reference, repeated) {
  const fields = [
    'requestHash',
    'descriptorHash',
    'sourceDatasetHash',
    'sourceSharedModelHash',
    'sourceStructuralHash',
    'structuralImpactHash',
    'comparisonCandidateProjectionHash',
    'appliedCandidateProjectionHash',
    'baselineReferenceHash',
    'metrics',
    'diagnostics',
    'complete',
    'resultHash',
  ];
  const differences = fields.flatMap((field) => (
    canonicalStringify(reference[field]) === canonicalStringify(repeated[field])
      ? []
      : [difference(field, reference[field], repeated[field])]
  ));
  differences.sort((left, right) => compareAscii(left.field, right.field));
  return deepFreeze(differences);
}

function assertCandidateResult(value, label) {
  const result = assertEnrichmentShadowCalculationResult(value);
  if (result.variant !== 'CANDIDATE') {
    fail(`${label} must use CANDIDATE variant.`, RangeError);
  }
  return result;
}

function difference(field, packetValue, observedValue) {
  return deepFreeze({
    field,
    packetValue: canonicalizeJson(packetValue),
    observedValue: canonicalizeJson(observedValue),
  });
}

function reviewPacketMaterial(value) {
  return {
    schema: value.schema,
    evidenceRefs: value.evidenceRefs,
    contextIdentities: value.contextIdentities,
    blockers: value.blockers,
    summary: value.summary,
    status: value.status,
    reviewDecisionStatus: value.reviewDecisionStatus,
    persistenceCreated: value.persistenceCreated,
    bindingCreated: value.bindingCreated,
    reviewSelectionCreated: value.reviewSelectionCreated,
    approvalGranted: value.approvalGranted,
    current: value.current,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
    resultAcceptanceEligible: value.resultAcceptanceEligible,
  };
}

function stalenessMaterial(value) {
  return {
    schema: value.schema,
    reviewPacketHash: value.reviewPacketHash,
    observedAuthorityHash: value.observedAuthorityHash,
    differences: value.differences,
    status: value.status,
    stale: value.stale,
    evaluationScope: value.evaluationScope,
    governedCurrentnessApproved: value.governedCurrentnessApproved,
    bindingCreated: value.bindingCreated,
    reviewSelectionCreated: value.reviewSelectionCreated,
    approvalGranted: value.approvalGranted,
    current: value.current,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
    resultAcceptanceEligible: value.resultAcceptanceEligible,
  };
}

function receiptMaterial(value) {
  return {
    schema: value.schema,
    referenceResultHash: value.referenceResultHash,
    repeatedResultHash: value.repeatedResultHash,
    requestHash: value.requestHash,
    descriptorHash: value.descriptorHash,
    candidateProjectionHash: value.candidateProjectionHash,
    differences: value.differences,
    matched: value.matched,
    status: value.status,
    productionResultCompared: value.productionResultCompared,
    postSealAuthorityPresent: value.postSealAuthorityPresent,
    bindingCreated: value.bindingCreated,
    reviewSelectionCreated: value.reviewSelectionCreated,
    approvalGranted: value.approvalGranted,
    current: value.current,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
    resultAcceptanceEligible: value.resultAcceptanceEligible,
  };
}

function assertSameList(left, right, message) {
  const normalizedLeft = [...left].sort(compareAscii);
  const normalizedRight = [...right].sort(compareAscii);
  if (canonicalStringify(normalizedLeft) !== canonicalStringify(normalizedRight)) {
    fail(`${message}.`, RangeError);
  }
}

function sortedUniqueText(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array.`);
  }
  const rows = value.map((row, index) => requiredText(row, `${label}[${index}]`));
  const unique = [...new Set(rows)].sort(compareAscii);
  if (unique.length !== rows.length) fail(`${label} contains duplicates.`, RangeError);
  return deepFreeze(unique);
}

function nullableIdentity(value, label) {
  if (value === null) return null;
  return requiredText(value, label);
}

function assertUnique(values, label) {
  const seen = new Set();
  values.forEach((value) => {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}.`, RangeError);
    seen.add(value);
  });
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentReviewPackage: ${message}`);
}
