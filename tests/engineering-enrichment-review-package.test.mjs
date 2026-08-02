import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEngineeringEnrichmentObservedAuthority,
  assertEngineeringEnrichmentReviewPacket,
  assertEngineeringEnrichmentShadowReproducibilityReceipt,
  assertEngineeringEnrichmentStalenessReport,
  buildComponentWeightProposals,
  buildEnrichmentObservedAuthority,
  buildEnrichmentReviewPacket,
  buildEnrichmentShadowReproducibilityReceipt,
  buildEnrichmentStalenessReport,
  executeEnrichmentShadowCalculation,
} from '../src/workspace/engineering-enrichment/index.js';
import {
  buildPipeline,
  buildWeightSnapshot,
  engineOutput,
} from './engineering-enrichment-test-fixture.mjs';

function context(overrides = {}) {
  return {
    projectDataHash: null,
    overrideSetHash: null,
    approximationSetHash: null,
    selectorRegistryHash: 'fnv1a64:7777777777777777',
    ...overrides,
  };
}

function packet(setup, contextIdentities = context()) {
  return buildEnrichmentReviewPacket({
    masterSnapshots: [setup.masterSnapshot],
    proposals: setup.proposals,
    resolution: setup.resolution,
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    numericalImpact: setup.numericalImpact,
    contextIdentities,
  });
}

function observedFromPacket(value, overrides = {}) {
  return buildEnrichmentObservedAuthority({
    ...value.evidenceRefs,
    contextIdentities: value.contextIdentities,
    ...overrides,
  });
}

test('review packet composes exact Steps 1-3 without granting authority', () => {
  const setup = buildPipeline();
  const value = packet(setup);
  assert.equal(value.status, 'READY_FOR_REVIEW_ONLY');
  assert.equal(value.reviewDecisionStatus, 'NOT_RECORDED');
  assert.equal(value.persistenceCreated, false);
  assert.equal(value.current, false);
  assert.equal(value.sealEligible, false);
  assert.equal(value.resultAcceptanceEligible, false);
  assert.equal(value.evidenceRefs.resolutionHash, setup.resolution.resolutionHash);
  assert.equal(
    value.evidenceRefs.numericalImpactHash,
    setup.numericalImpact.impactHash,
  );
  assert.equal(assertEngineeringEnrichmentReviewPacket(value), value);
});

test('blocked Step 3 remains blocked in the review packet', () => {
  const setup = buildPipeline({ candidateComplete: false });
  const value = packet(setup);
  assert.equal(value.status, 'BLOCKED');
  assert.ok(value.blockers.some((row) => row.code === 'STEP_3_NOT_READY'));
});

test('review packet rejects proposal identities outside Step 1 authority', () => {
  const setup = buildPipeline();
  const otherSnapshot = buildWeightSnapshot(13);
  const otherProposals = buildComponentWeightProposals({
    snapshot: otherSnapshot,
    policy: {
      schema: 'ComponentWeightAdapterPolicy.v1',
      adapterId: 'component-weight:test:v1',
      selectorKind: 'COMPONENT_TYPE_BORE',
      selectorMap: { componentType: 'valveType', boreMm: 'bore' },
      valueColumn: 'weight',
      sourceUnit: 'kg',
      canonicalUnit: 'kg',
    },
  });
  assert.throws(() => buildEnrichmentReviewPacket({
    masterSnapshots: [setup.masterSnapshot],
    proposals: otherProposals,
    resolution: setup.resolution,
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    numericalImpact: setup.numericalImpact,
    contextIdentities: context(),
  }), /proposal identities differ/u);
});

test('observed authority canonicalizes identity-array order', () => {
  const base = {
    sourceDatasetHash: 'dataset:1',
    sourceSharedModelHash: 'shared:1',
    sourceStructuralHash: 'structural:1',
    resolutionHash: 'resolution:1',
    candidateProjectionHash: 'candidate:1',
    structuralImpactHash: 'step2:1',
    engineDescriptorHash: 'engine:1',
    baselineReferenceHash: 'baseline-reference:1',
    baselineResultHash: 'baseline-result:1',
    candidateResultHash: 'candidate-result:1',
    numericalImpactHash: 'step3:1',
    contextIdentities: context(),
  };
  const first = buildEnrichmentObservedAuthority({
    ...base,
    masterSnapshotHashes: ['snapshot:b', 'snapshot:a'],
    proposalHashes: ['proposal:b', 'proposal:a'],
  });
  const second = buildEnrichmentObservedAuthority({
    ...base,
    masterSnapshotHashes: ['snapshot:a', 'snapshot:b'],
    proposalHashes: ['proposal:a', 'proposal:b'],
  });
  assert.deepEqual(first, second);
  assert.equal(assertEngineeringEnrichmentObservedAuthority(first), first);
});

test('unchanged shadow identities never become governed currentness', () => {
  const value = packet(buildPipeline());
  const observed = observedFromPacket(value);
  const report = buildEnrichmentStalenessReport({
    reviewPacket: value,
    observedAuthority: observed,
  });
  assert.equal(report.stale, false);
  assert.equal(report.status, 'UNCHANGED_SHADOW_IDENTITIES');
  assert.equal(report.current, false);
  assert.equal(report.governedCurrentnessApproved, false);
  assert.equal(assertEngineeringEnrichmentStalenessReport(report), report);
});

test('source and context changes produce exact staleness differences', () => {
  const value = packet(buildPipeline());
  const observed = observedFromPacket(value, {
    sourceSharedModelHash: 'fnv1a64:9999999999999999',
    contextIdentities: context({
      projectDataHash: 'fnv1a64:8888888888888888',
    }),
  });
  const report = buildEnrichmentStalenessReport({
    reviewPacket: value,
    observedAuthority: observed,
  });
  assert.equal(report.stale, true);
  assert.deepEqual(report.differences.map((row) => row.field), [
    'contextIdentities.projectDataHash',
    'sourceSharedModelHash',
  ]);
  assert.equal(report.resultAcceptanceEligible, false);
});

test('identical candidate rerun creates shadow-only reproducibility evidence', () => {
  const setup = buildPipeline();
  const repeated = executeEnrichmentShadowCalculation({
    descriptor: setup.descriptor,
    request: setup.candidateRequest,
    runEngine: () => engineOutput(12),
  });
  const receipt = buildEnrichmentShadowReproducibilityReceipt({
    referenceCandidateResult: setup.candidateResult,
    repeatedCandidateResult: repeated,
  });
  assert.equal(receipt.matched, true);
  assert.equal(receipt.status, 'MATCHED_SHADOW_REPRODUCTION');
  assert.equal(receipt.productionResultCompared, false);
  assert.equal(receipt.postSealAuthorityPresent, false);
  assert.equal(receipt.resultAcceptanceEligible, false);
  assert.equal(
    assertEngineeringEnrichmentShadowReproducibilityReceipt(receipt),
    receipt,
  );
});

test('different candidate rerun is retained as a mismatch', () => {
  const setup = buildPipeline();
  const repeated = executeEnrichmentShadowCalculation({
    descriptor: setup.descriptor,
    request: setup.candidateRequest,
    runEngine: () => engineOutput(13),
  });
  const receipt = buildEnrichmentShadowReproducibilityReceipt({
    referenceCandidateResult: setup.candidateResult,
    repeatedCandidateResult: repeated,
  });
  assert.equal(receipt.matched, false);
  assert.ok(receipt.differences.some((row) => row.field === 'metrics'));
  assert.ok(receipt.differences.some((row) => row.field === 'resultHash'));
  assert.equal(receipt.resultAcceptanceEligible, false);
});

test('baseline output cannot masquerade as candidate reproducibility evidence', () => {
  const setup = buildPipeline();
  assert.throws(() => buildEnrichmentShadowReproducibilityReceipt({
    referenceCandidateResult: setup.baselineResult,
    repeatedCandidateResult: setup.candidateResult,
  }), /must use CANDIDATE variant/u);
});
