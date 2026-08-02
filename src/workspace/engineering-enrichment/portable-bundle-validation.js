import {
  assertEngineeringEnrichmentPortableBundle as assertPortableBundleBase,
  buildEnrichmentPortableBundle as buildPortableBundleBase,
  parseAndVerifyEnrichmentPortableBundle as parsePortableBundleBase,
  serializeEnrichmentPortableBundle as serializePortableBundleBase,
  verifyEngineeringEnrichmentPortableBundle as verifyPortableBundleBase,
} from './portable-bundle.js';

export {
  ENRICHMENT_PORTABLE_BUNDLE_SCHEMA,
  ENRICHMENT_PORTABLE_VERIFICATION_SCHEMA,
  assertEngineeringEnrichmentPortableBundleVerification,
} from './portable-bundle.js';

export function buildEnrichmentPortableBundle(input) {
  const bundle = buildPortableBundleBase(input);
  assertPortableBundleChainAuthority(bundle);
  return bundle;
}

export function assertEngineeringEnrichmentPortableBundle(value) {
  const bundle = assertPortableBundleBase(value);
  assertPortableBundleChainAuthority(bundle);
  return bundle;
}

export function serializeEnrichmentPortableBundle(value) {
  return serializePortableBundleBase(
    assertEngineeringEnrichmentPortableBundle(value),
  );
}

export function verifyEngineeringEnrichmentPortableBundle(value, options) {
  const bundle = assertEngineeringEnrichmentPortableBundle(value);
  return options === undefined
    ? verifyPortableBundleBase(bundle)
    : verifyPortableBundleBase(bundle, options);
}

export function parseAndVerifyEnrichmentPortableBundle(text) {
  const parsed = parsePortableBundleBase(text);
  assertPortableBundleChainAuthority(parsed.bundle);
  return parsed;
}

function assertPortableBundleChainAuthority(bundle) {
  const {
    candidateProjection: candidate,
    structuralImpact: structural,
    baselineRequest,
    candidateRequest,
    baselineResult,
    candidateResult,
  } = bundle.artifacts;

  const requestChecks = [
    [candidate.sourceDatasetHash, baselineRequest.sourceDatasetHash,
      'baseline request source dataset'],
    [candidate.sourceDatasetHash, candidateRequest.sourceDatasetHash,
      'candidate request source dataset'],
    [candidate.sourceSharedModelHash, baselineRequest.sourceSharedModelHash,
      'baseline request shared model'],
    [candidate.sourceSharedModelHash, candidateRequest.sourceSharedModelHash,
      'candidate request shared model'],
    [candidate.sourceStructuralHash, baselineRequest.sourceStructuralHash,
      'baseline request structural authority'],
    [candidate.sourceStructuralHash, candidateRequest.sourceStructuralHash,
      'candidate request structural authority'],
    [structural.impactHash, baselineRequest.structuralImpactHash,
      'baseline request structural impact'],
    [structural.impactHash, candidateRequest.structuralImpactHash,
      'candidate request structural impact'],
  ];
  requestChecks.forEach(([expected, actual, label]) => {
    if (actual !== expected) fail(`${label} identity mismatch.`);
  });

  assertRequestResultAuthority(baselineRequest, baselineResult, 'baseline');
  assertRequestResultAuthority(candidateRequest, candidateResult, 'candidate');
}

function assertRequestResultAuthority(request, result, label) {
  const fields = [
    'descriptorHash',
    'variant',
    'sourceDatasetHash',
    'sourceSharedModelHash',
    'sourceStructuralHash',
    'structuralImpactHash',
    'comparisonCandidateProjectionHash',
    'appliedCandidateProjectionHash',
    'baselineReferenceHash',
  ];
  fields.forEach((field) => {
    if (request[field] !== result[field]) {
      fail(`${label} request/result differs at ${field}.`);
    }
  });
}

function fail(message) {
  throw new RangeError(`EngineeringEnrichmentPortableBundleValidation: ${message}`);
}
