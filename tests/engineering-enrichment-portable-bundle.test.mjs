import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEngineeringEnrichmentPortableBundle,
  assertEngineeringEnrichmentPortableBundleVerification,
  buildEnrichmentObservedAuthority,
  buildEnrichmentPortableBundle,
  buildEnrichmentReviewPacket,
  buildEnrichmentShadowReproducibilityReceipt,
  buildEnrichmentStalenessReport,
  executeEnrichmentShadowCalculation,
  parseAndVerifyEnrichmentPortableBundle,
  serializeEnrichmentPortableBundle,
  verifyEngineeringEnrichmentPortableBundle,
} from '../src/workspace/engineering-enrichment/index.js';
import {
  buildPipeline,
  engineOutput,
} from './engineering-enrichment-test-fixture.mjs';

function context() {
  return {
    projectDataHash: null,
    overrideSetHash: null,
    approximationSetHash: null,
    selectorRegistryHash: 'fnv1a64:7777777777777777',
  };
}

function evidence(setup = buildPipeline()) {
  const reviewPacket = buildEnrichmentReviewPacket({
    masterSnapshots: [setup.masterSnapshot],
    proposals: setup.proposals,
    resolution: setup.resolution,
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    numericalImpact: setup.numericalImpact,
    contextIdentities: context(),
  });
  const observedAuthority = buildEnrichmentObservedAuthority({
    ...reviewPacket.evidenceRefs,
    contextIdentities: reviewPacket.contextIdentities,
  });
  const stalenessReport = buildEnrichmentStalenessReport({
    reviewPacket,
    observedAuthority,
  });
  const repeatedCandidateResult = executeEnrichmentShadowCalculation({
    descriptor: setup.descriptor,
    request: setup.candidateRequest,
    runEngine: () => engineOutput(12),
  });
  const reproducibilityReceipt = buildEnrichmentShadowReproducibilityReceipt({
    referenceCandidateResult: setup.candidateResult,
    repeatedCandidateResult,
  });
  return {
    setup,
    reviewPacket,
    observedAuthority,
    stalenessReport,
    repeatedCandidateResult,
    reproducibilityReceipt,
  };
}

function bundleInput(value = evidence(), overrides = {}) {
  const { setup } = value;
  return {
    masterSnapshots: [setup.masterSnapshot],
    proposals: setup.proposals,
    resolution: setup.resolution,
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    engineDescriptor: setup.descriptor,
    baselineReference: setup.baselineReference,
    baselineRequest: setup.baselineRequest,
    candidateRequest: setup.candidateRequest,
    baselineResult: setup.baselineResult,
    candidateResult: setup.candidateResult,
    numericalImpact: setup.numericalImpact,
    reviewPacket: value.reviewPacket,
    observedAuthority: value.observedAuthority,
    stalenessReport: value.stalenessReport,
    repeatedCandidateResult: value.repeatedCandidateResult,
    reproducibilityReceipt: value.reproducibilityReceipt,
    ...overrides,
  };
}

test('portable bundle carries the complete shadow chain without authority', () => {
  const bundle = buildEnrichmentPortableBundle(bundleInput());
  assert.equal(bundle.transportFormat, 'CANONICAL_JSON_UTF8');
  assert.equal(bundle.purpose, 'SHADOW_EVIDENCE_TRANSFER_ONLY');
  assert.equal(bundle.summary.stalenessIncluded, true);
  assert.equal(bundle.summary.reproducibilityIncluded, true);
  assert.equal(bundle.storageLocationSelected, false);
  assert.equal(bundle.retentionPolicySelected, false);
  assert.equal(bundle.persistenceCreated, false);
  assert.equal(bundle.current, false);
  assert.equal(bundle.resultAcceptanceEligible, false);
  assert.equal(assertEngineeringEnrichmentPortableBundle(bundle), bundle);
});

test('independent builds have deterministic bundle identity and serialization', () => {
  const first = buildEnrichmentPortableBundle(bundleInput(evidence()));
  const second = buildEnrichmentPortableBundle(bundleInput(evidence()));
  assert.equal(first.bundleHash, second.bundleHash);
  assert.equal(
    serializeEnrichmentPortableBundle(first),
    serializeEnrichmentPortableBundle(second),
  );
});

test('canonical serialization round-trips with a verification receipt', () => {
  const bundle = buildEnrichmentPortableBundle(bundleInput());
  const text = serializeEnrichmentPortableBundle(bundle);
  const parsed = parseAndVerifyEnrichmentPortableBundle(text);
  assert.deepEqual(parsed.bundle, bundle);
  assert.equal(parsed.canonicalText, text);
  assert.equal(parsed.verification.verified, true);
  assert.equal(parsed.verification.inputWasCanonical, true);
  assert.equal(parsed.verification.originVerified, false);
  assert.equal(parsed.verification.storageVerified, false);
  assert.equal(parsed.verification.current, false);
  assert.equal(
    assertEngineeringEnrichmentPortableBundleVerification(parsed.verification),
    parsed.verification,
  );
});

test('non-canonical JSON is accepted but reported and normalized', () => {
  const bundle = buildEnrichmentPortableBundle(bundleInput());
  const canonicalText = serializeEnrichmentPortableBundle(bundle);
  const parsed = parseAndVerifyEnrichmentPortableBundle(`\n${canonicalText}\n`);
  assert.equal(parsed.verification.inputWasCanonical, false);
  assert.equal(parsed.canonicalText, canonicalText);
});

test('valid but mismatched candidate result cannot enter the bundle', () => {
  const value = evidence();
  const other = buildPipeline({ weight: 13 });
  assert.throws(() => buildEnrichmentPortableBundle(bundleInput(value, {
    candidateResult: other.candidateResult,
  })), /candidate request\/result|candidate result\/numerical/u);
});

test('observation and staleness artifacts must be supplied as a pair', () => {
  const value = evidence();
  assert.throws(() => buildEnrichmentPortableBundle(bundleInput(value, {
    stalenessReport: null,
  })), /must be supplied together/u);
});

test('repeated result and reproducibility receipt must be supplied as a pair', () => {
  const value = evidence();
  assert.throws(() => buildEnrichmentPortableBundle(bundleInput(value, {
    reproducibilityReceipt: null,
  })), /must be supplied together/u);
});

test('a staleness report from another observation is rejected', () => {
  const value = evidence();
  const changedObserved = buildEnrichmentObservedAuthority({
    ...value.reviewPacket.evidenceRefs,
    sourceSharedModelHash: 'fnv1a64:9999999999999999',
    contextIdentities: value.reviewPacket.contextIdentities,
  });
  const otherReport = buildEnrichmentStalenessReport({
    reviewPacket: value.reviewPacket,
    observedAuthority: changedObserved,
  });
  assert.throws(() => buildEnrichmentPortableBundle(bundleInput(value, {
    stalenessReport: otherReport,
  })), /staleness report differs/u);
});

test('verification remains in-memory only and invalid JSON fails closed', () => {
  const bundle = buildEnrichmentPortableBundle(bundleInput());
  const verification = verifyEngineeringEnrichmentPortableBundle(bundle);
  assert.equal(
    verification.verificationScope,
    'IN_MEMORY_CONTRACT_AND_CANONICAL_INTEGRITY_ONLY',
  );
  assert.equal(verification.persistenceCreated, false);
  assert.equal(verification.reviewDecisionCreated, false);
  assert.throws(
    () => parseAndVerifyEnrichmentPortableBundle('{not-json'),
    /not valid JSON/u,
  );
});
