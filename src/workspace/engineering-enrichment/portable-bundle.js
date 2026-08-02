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
  assertEnrichmentBaselineReference,
  assertEnrichmentEngineDescriptor,
  assertEnrichmentShadowCalculationRequest,
  assertEnrichmentShadowCalculationResult,
} from './numerical-impact.js';
import {
  assertEngineeringEnrichmentObservedAuthority,
  assertEngineeringEnrichmentReviewPacket,
  assertEngineeringEnrichmentShadowReproducibilityReceipt,
  assertEngineeringEnrichmentStalenessReport,
  buildEnrichmentReviewPacket,
  buildEnrichmentShadowReproducibilityReceipt,
  buildEnrichmentStalenessReport,
} from './review-package.js';
import {
  assertEngineeringEnrichmentResolution,
} from './resolution-validation.js';
import {
  assertEngineeringEnrichmentStructuralImpact,
} from './structural-impact.js';

export const ENRICHMENT_PORTABLE_BUNDLE_SCHEMA =
  'EngineeringEnrichmentPortableBundle.v1';
export const ENRICHMENT_PORTABLE_VERIFICATION_SCHEMA =
  'EngineeringEnrichmentPortableBundleVerification.v1';

const ARTIFACT_KEYS = Object.freeze([
  'masterSnapshots',
  'proposals',
  'resolution',
  'candidateProjection',
  'structuralImpact',
  'engineDescriptor',
  'baselineReference',
  'baselineRequest',
  'candidateRequest',
  'baselineResult',
  'candidateResult',
  'numericalImpact',
  'reviewPacket',
  'observedAuthority',
  'stalenessReport',
  'repeatedCandidateResult',
  'reproducibilityReceipt',
]);
const FALSE_AUTHORITY_FIELDS = Object.freeze([
  'persistenceCreated',
  'reviewDecisionCreated',
  'approvalGranted',
  'current',
  'sealEligible',
  'calculationEligible',
  'resultAcceptanceEligible',
]);

export function buildEnrichmentPortableBundle(input) {
  assertExactKeys(input, ARTIFACT_KEYS, 'Portable bundle input');
  const artifacts = normalizeArtifacts(input);
  assertPortableChain(artifacts);
  const artifactHashes = buildArtifactHashes(artifacts);
  const material = {
    schema: ENRICHMENT_PORTABLE_BUNDLE_SCHEMA,
    transportFormat: 'CANONICAL_JSON_UTF8',
    purpose: 'SHADOW_EVIDENCE_TRANSFER_ONLY',
    artifacts,
    artifactHashes,
    summary: deepFreeze({
      masterSnapshotCount: artifacts.masterSnapshots.length,
      proposalCount: artifacts.proposals.length,
      reviewPacketStatus: artifacts.reviewPacket.status,
      stalenessIncluded: artifacts.stalenessReport !== null,
      reproducibilityIncluded: artifacts.reproducibilityReceipt !== null,
      numericalImpactStatus: artifacts.numericalImpact.status,
    }),
    storageLocationSelected: false,
    retentionPolicySelected: false,
    originalSourceBytesIncluded: false,
    persistenceCreated: false,
    reviewDecisionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({
    ...material,
    bundleHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentPortableBundle(value) {
  assertExactKeys(value, [
    'schema',
    'transportFormat',
    'purpose',
    'artifacts',
    'artifactHashes',
    'summary',
    'storageLocationSelected',
    'retentionPolicySelected',
    'originalSourceBytesIncluded',
    ...FALSE_AUTHORITY_FIELDS,
    'bundleHash',
  ], 'Engineering enrichment portable bundle');
  if (value.schema !== ENRICHMENT_PORTABLE_BUNDLE_SCHEMA) {
    fail(`bundle schema must be ${ENRICHMENT_PORTABLE_BUNDLE_SCHEMA}.`);
  }
  if (
    value.transportFormat !== 'CANONICAL_JSON_UTF8'
    || value.purpose !== 'SHADOW_EVIDENCE_TRANSFER_ONLY'
  ) {
    fail('portable bundle transport purpose is invalid.');
  }
  if (
    value.storageLocationSelected !== false
    || value.retentionPolicySelected !== false
    || value.originalSourceBytesIncluded !== false
  ) {
    fail('portable bundle must not select storage, retention, or original-byte policy.', RangeError);
  }
  FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) fail(`${field} must remain false.`, RangeError);
  });
  if (!isPlainRecord(value.summary)) fail('summary must be an object.');
  const rebuilt = buildEnrichmentPortableBundle(value.artifacts);
  if (canonicalStringify(rebuilt) !== canonicalStringify(value)) {
    fail('portable bundle differs from canonical verified authority.', RangeError);
  }
  return value;
}

export function serializeEnrichmentPortableBundle(value) {
  return canonicalStringify(assertEngineeringEnrichmentPortableBundle(value));
}

export function verifyEngineeringEnrichmentPortableBundle(
  value,
  options = { inputWasCanonical: true },
) {
  assertExactKeys(options, ['inputWasCanonical'], 'Portable verification options');
  const bundle = assertEngineeringEnrichmentPortableBundle(value);
  const canonicalText = canonicalStringify(bundle);
  const material = {
    schema: ENRICHMENT_PORTABLE_VERIFICATION_SCHEMA,
    bundleHash: bundle.bundleHash,
    canonicalTextHash: semanticHash(canonicalText),
    canonicalTextLength: canonicalText.length,
    artifactCount: ARTIFACT_KEYS.filter(
      (key) => bundle.artifacts[key] !== null,
    ).length,
    inputWasCanonical: booleanValue(options.inputWasCanonical, 'inputWasCanonical'),
    verified: true,
    verificationScope: 'IN_MEMORY_CONTRACT_AND_CANONICAL_INTEGRITY_ONLY',
    originVerified: false,
    storageVerified: false,
    persistenceCreated: false,
    reviewDecisionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({
    ...material,
    verificationHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentPortableBundleVerification(value) {
  assertExactKeys(value, [
    'schema',
    'bundleHash',
    'canonicalTextHash',
    'canonicalTextLength',
    'artifactCount',
    'inputWasCanonical',
    'verified',
    'verificationScope',
    'originVerified',
    'storageVerified',
    ...FALSE_AUTHORITY_FIELDS,
    'verificationHash',
  ], 'Engineering enrichment portable bundle verification');
  if (value.schema !== ENRICHMENT_PORTABLE_VERIFICATION_SCHEMA) {
    fail(`verification schema must be ${ENRICHMENT_PORTABLE_VERIFICATION_SCHEMA}.`);
  }
  if (
    value.verified !== true
    || value.verificationScope
      !== 'IN_MEMORY_CONTRACT_AND_CANONICAL_INTEGRITY_ONLY'
    || value.originVerified !== false
    || value.storageVerified !== false
  ) {
    fail('verification scope or authority is invalid.', RangeError);
  }
  if (!Number.isSafeInteger(value.canonicalTextLength) || value.canonicalTextLength < 0) {
    fail('canonicalTextLength must be a non-negative safe integer.', RangeError);
  }
  if (!Number.isSafeInteger(value.artifactCount) || value.artifactCount < 0) {
    fail('artifactCount must be a non-negative safe integer.', RangeError);
  }
  booleanValue(value.inputWasCanonical, 'inputWasCanonical');
  FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) fail(`${field} must remain false.`, RangeError);
  });
  const material = verificationMaterial(value);
  if (value.verificationHash !== semanticHash(material)) {
    fail('verificationHash is invalid.', RangeError);
  }
  return value;
}

export function parseAndVerifyEnrichmentPortableBundle(text) {
  if (typeof text !== 'string' || !text.trim()) {
    fail('serialized bundle is required.');
  }
  const sourceText = text;
  let parsed;
  try {
    parsed = JSON.parse(sourceText);
  } catch (error) {
    fail(
      `serialized bundle is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
      SyntaxError,
    );
  }
  const bundle = assertEngineeringEnrichmentPortableBundle(parsed);
  const canonicalText = serializeEnrichmentPortableBundle(bundle);
  const verification = verifyEngineeringEnrichmentPortableBundle(bundle, {
    inputWasCanonical: sourceText === canonicalText,
  });
  return deepFreeze({
    bundle: deepFreeze(canonicalizeJson(bundle)),
    canonicalText,
    verification,
  });
}

function normalizeArtifacts(value) {
  const masterSnapshots = requiredArray(value.masterSnapshots, 'masterSnapshots')
    .map(assertMasterDataSnapshot)
    .sort((left, right) => compareAscii(left.snapshotHash, right.snapshotHash));
  const proposals = requiredArray(value.proposals, 'proposals')
    .map(assertEngineeringEnrichmentProposal)
    .sort((left, right) => compareAscii(left.proposalHash, right.proposalHash));
  assertUnique(masterSnapshots.map((row) => row.snapshotHash), 'snapshotHash');
  assertUnique(proposals.map((row) => row.proposalHash), 'proposalHash');
  return deepFreeze({
    masterSnapshots: deepFreeze(masterSnapshots),
    proposals: deepFreeze(proposals),
    resolution: assertEngineeringEnrichmentResolution(value.resolution),
    candidateProjection: assertEngineeringEnrichmentCandidateProjection(
      value.candidateProjection,
    ),
    structuralImpact: assertEngineeringEnrichmentStructuralImpact(
      value.structuralImpact,
    ),
    engineDescriptor: assertEnrichmentEngineDescriptor(value.engineDescriptor),
    baselineReference: assertEnrichmentBaselineReference(value.baselineReference),
    baselineRequest: assertEnrichmentShadowCalculationRequest(value.baselineRequest),
    candidateRequest: assertEnrichmentShadowCalculationRequest(value.candidateRequest),
    baselineResult: assertEnrichmentShadowCalculationResult(value.baselineResult),
    candidateResult: assertEnrichmentShadowCalculationResult(value.candidateResult),
    numericalImpact: assertEngineeringEnrichmentNumericalImpact(
      value.numericalImpact,
    ),
    reviewPacket: assertEngineeringEnrichmentReviewPacket(value.reviewPacket),
    observedAuthority: nullableArtifact(
      value.observedAuthority,
      assertEngineeringEnrichmentObservedAuthority,
      'observedAuthority',
    ),
    stalenessReport: nullableArtifact(
      value.stalenessReport,
      assertEngineeringEnrichmentStalenessReport,
      'stalenessReport',
    ),
    repeatedCandidateResult: nullableArtifact(
      value.repeatedCandidateResult,
      assertEnrichmentShadowCalculationResult,
      'repeatedCandidateResult',
    ),
    reproducibilityReceipt: nullableArtifact(
      value.reproducibilityReceipt,
      assertEngineeringEnrichmentShadowReproducibilityReceipt,
      'reproducibilityReceipt',
    ),
  });
}

function assertPortableChain(artifacts) {
  const {
    masterSnapshots,
    proposals,
    resolution,
    candidateProjection: candidate,
    structuralImpact: structural,
    engineDescriptor: descriptor,
    baselineReference,
    baselineRequest,
    candidateRequest,
    baselineResult,
    candidateResult,
    numericalImpact: numerical,
    reviewPacket,
    observedAuthority,
    stalenessReport,
    repeatedCandidateResult,
    reproducibilityReceipt,
  } = artifacts;

  const rebuiltPacket = buildEnrichmentReviewPacket({
    masterSnapshots,
    proposals,
    resolution,
    candidateProjection: candidate,
    structuralImpact: structural,
    numericalImpact: numerical,
    contextIdentities: reviewPacket.contextIdentities,
  });
  assertCanonicalEqual(rebuiltPacket, reviewPacket, 'review packet');

  const sharedChecks = [
    [descriptor.descriptorHash, baselineRequest.descriptorHash, 'baseline request descriptor'],
    [descriptor.descriptorHash, candidateRequest.descriptorHash, 'candidate request descriptor'],
    [descriptor.descriptorHash, baselineResult.descriptorHash, 'baseline result descriptor'],
    [descriptor.descriptorHash, candidateResult.descriptorHash, 'candidate result descriptor'],
    [descriptor.descriptorHash, numerical.engineDescriptorHash, 'numerical descriptor'],
    [baselineReference.baselineReferenceHash, baselineRequest.baselineReferenceHash, 'baseline request reference'],
    [baselineReference.baselineReferenceHash, candidateRequest.baselineReferenceHash, 'candidate request reference'],
    [baselineReference.baselineReferenceHash, baselineResult.baselineReferenceHash, 'baseline result reference'],
    [baselineReference.baselineReferenceHash, candidateResult.baselineReferenceHash, 'candidate result reference'],
    [baselineReference.baselineReferenceHash, numerical.baselineReferenceHash, 'numerical baseline reference'],
    [baselineRequest.requestHash, baselineResult.requestHash, 'baseline request/result'],
    [candidateRequest.requestHash, candidateResult.requestHash, 'candidate request/result'],
    [baselineResult.resultHash, numerical.baselineResultHash, 'baseline result/numerical'],
    [candidateResult.resultHash, numerical.candidateResultHash, 'candidate result/numerical'],
    [candidate.projectionHash, baselineRequest.comparisonCandidateProjectionHash, 'baseline request candidate'],
    [candidate.projectionHash, candidateRequest.comparisonCandidateProjectionHash, 'candidate request candidate'],
    [structural.impactHash, baselineRequest.structuralImpactHash, 'baseline request Step 2'],
    [structural.impactHash, candidateRequest.structuralImpactHash, 'candidate request Step 2'],
  ];
  sharedChecks.forEach(([actual, expected, label]) => {
    if (actual !== expected) fail(`${label} identity mismatch.`, RangeError);
  });
  if (baselineRequest.variant !== 'BASELINE' || baselineResult.variant !== 'BASELINE') {
    fail('baseline artifacts must use BASELINE variant.', RangeError);
  }
  if (candidateRequest.variant !== 'CANDIDATE' || candidateResult.variant !== 'CANDIDATE') {
    fail('candidate artifacts must use CANDIDATE variant.', RangeError);
  }

  const stalenessPairPresent = observedAuthority !== null && stalenessReport !== null;
  if ((observedAuthority === null) !== (stalenessReport === null)) {
    fail('observedAuthority and stalenessReport must be supplied together.', RangeError);
  }
  if (stalenessPairPresent) {
    const rebuilt = buildEnrichmentStalenessReport({
      reviewPacket,
      observedAuthority,
    });
    assertCanonicalEqual(rebuilt, stalenessReport, 'staleness report');
  }

  const reproductionPairPresent = repeatedCandidateResult !== null
    && reproducibilityReceipt !== null;
  if ((repeatedCandidateResult === null) !== (reproducibilityReceipt === null)) {
    fail(
      'repeatedCandidateResult and reproducibilityReceipt must be supplied together.',
      RangeError,
    );
  }
  if (reproductionPairPresent) {
    const rebuilt = buildEnrichmentShadowReproducibilityReceipt({
      referenceCandidateResult: candidateResult,
      repeatedCandidateResult,
    });
    assertCanonicalEqual(rebuilt, reproducibilityReceipt, 'reproducibility receipt');
  }
}

function buildArtifactHashes(artifacts) {
  return deepFreeze({
    masterSnapshotHashes: artifacts.masterSnapshots.map((row) => row.snapshotHash),
    proposalHashes: artifacts.proposals.map((row) => row.proposalHash),
    resolutionHash: artifacts.resolution.resolutionHash,
    candidateProjectionHash: artifacts.candidateProjection.projectionHash,
    structuralImpactHash: artifacts.structuralImpact.impactHash,
    engineDescriptorHash: artifacts.engineDescriptor.descriptorHash,
    baselineReferenceHash: artifacts.baselineReference.baselineReferenceHash,
    baselineRequestHash: artifacts.baselineRequest.requestHash,
    candidateRequestHash: artifacts.candidateRequest.requestHash,
    baselineResultHash: artifacts.baselineResult.resultHash,
    candidateResultHash: artifacts.candidateResult.resultHash,
    numericalImpactHash: artifacts.numericalImpact.impactHash,
    reviewPacketHash: artifacts.reviewPacket.packetHash,
    observedAuthorityHash: artifacts.observedAuthority?.observedAuthorityHash ?? null,
    stalenessHash: artifacts.stalenessReport?.stalenessHash ?? null,
    repeatedCandidateResultHash: artifacts.repeatedCandidateResult?.resultHash ?? null,
    reproducibilityReceiptHash: artifacts.reproducibilityReceipt?.receiptHash ?? null,
  });
}

function verificationMaterial(value) {
  return {
    schema: value.schema,
    bundleHash: value.bundleHash,
    canonicalTextHash: value.canonicalTextHash,
    canonicalTextLength: value.canonicalTextLength,
    artifactCount: value.artifactCount,
    inputWasCanonical: value.inputWasCanonical,
    verified: value.verified,
    verificationScope: value.verificationScope,
    originVerified: value.originVerified,
    storageVerified: value.storageVerified,
    persistenceCreated: value.persistenceCreated,
    reviewDecisionCreated: value.reviewDecisionCreated,
    approvalGranted: value.approvalGranted,
    current: value.current,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
    resultAcceptanceEligible: value.resultAcceptanceEligible,
  };
}

function nullableArtifact(value, validator, label) {
  if (value === null) return null;
  if (value === undefined) fail(`${label} must be explicitly null or an artifact.`);
  return validator(value);
}

function requiredArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array.`);
  }
  return [...value];
}

function assertCanonicalEqual(actual, expected, label) {
  if (canonicalStringify(actual) !== canonicalStringify(expected)) {
    fail(`${label} differs from rebuilt contract evidence.`, RangeError);
  }
}

function assertUnique(values, label) {
  const seen = new Set();
  values.forEach((value) => {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}.`, RangeError);
    seen.add(value);
  });
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be boolean.`);
  return value;
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

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentPortableBundle: ${message}`);
}
