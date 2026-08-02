import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEngineeringEnrichmentEvidenceLineageGraph,
  assertEngineeringEnrichmentEvidenceLineageImpact,
  buildEnrichmentEvidenceLineageGraph,
  buildEnrichmentEvidenceLineageImpact,
  buildEnrichmentObservedAuthority,
  buildEnrichmentPortableBundle,
  buildEnrichmentReviewPacket,
  buildEnrichmentShadowReproducibilityReceipt,
  buildEnrichmentStalenessReport,
  compareEnrichmentPortableBundles,
  executeEnrichmentShadowCalculation,
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

function buildBundle({
  weight = 12,
  candidateOutput = null,
  lifecycle = false,
} = {}) {
  const setup = buildPipeline({ weight, candidateOutput });
  const reviewPacket = buildEnrichmentReviewPacket({
    masterSnapshots: [setup.masterSnapshot],
    proposals: setup.proposals,
    resolution: setup.resolution,
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    numericalImpact: setup.numericalImpact,
    contextIdentities: context(),
  });
  let observedAuthority = null;
  let stalenessReport = null;
  let repeatedCandidateResult = null;
  let reproducibilityReceipt = null;
  if (lifecycle) {
    observedAuthority = buildEnrichmentObservedAuthority({
      ...reviewPacket.evidenceRefs,
      contextIdentities: reviewPacket.contextIdentities,
    });
    stalenessReport = buildEnrichmentStalenessReport({
      reviewPacket,
      observedAuthority,
    });
    repeatedCandidateResult = executeEnrichmentShadowCalculation({
      descriptor: setup.descriptor,
      request: setup.candidateRequest,
      runEngine: () => engineOutput(weight),
    });
    reproducibilityReceipt = buildEnrichmentShadowReproducibilityReceipt({
      referenceCandidateResult: setup.candidateResult,
      repeatedCandidateResult,
    });
  }
  return buildEnrichmentPortableBundle({
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
    reviewPacket,
    observedAuthority,
    stalenessReport,
    repeatedCandidateResult,
    reproducibilityReceipt,
  });
}

function graphFor(bundle) {
  return buildEnrichmentEvidenceLineageGraph({ bundle });
}

test('lineage graph is deterministic and remains shadow-only', () => {
  const first = graphFor(buildBundle());
  const second = graphFor(buildBundle());
  assert.equal(first.graphHash, second.graphHash);
  assert.equal(first.status, 'RECORDED_SHADOW_LINEAGE_GRAPH');
  assert.equal(first.lineageBasis, 'DECLARED_CONTRACT_DEPENDENCIES_ONLY');
  assert.equal(first.persistenceCreated, false);
  assert.equal(first.current, false);
  assert.equal(first.resultAcceptanceEligible, false);
  assert.equal(assertEngineeringEnrichmentEvidenceLineageGraph(first), first);
});

test('lineage graph records fixed logical roles and declared dependencies', () => {
  const graph = graphFor(buildBundle());
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  assert.equal(graph.nodes.length, 18);
  assert.equal(graph.summary.presentNodeCount, 14);
  assert.equal(graph.summary.optionalAbsentNodeCount, 4);
  assert.deepEqual(
    byId.get('STEP_3_NUMERICAL_IMPACT').dependencies,
    [
      'BASELINE_REFERENCE',
      'BASELINE_RESULT',
      'CANDIDATE_PROJECTION',
      'CANDIDATE_RESULT',
      'ENGINE_DESCRIPTOR',
      'STEP_2_STRUCTURAL_IMPACT',
    ],
  );
  assert.ok(
    byId.get('PORTABLE_BUNDLE').dependencies.includes('REVIEW_PACKET'),
  );
});

test('optional lifecycle artifacts become present lineage nodes as a complete set', () => {
  const graph = graphFor(buildBundle({ lifecycle: true }));
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  assert.equal(graph.summary.presentNodeCount, 18);
  assert.equal(graph.summary.optionalAbsentNodeCount, 0);
  assert.equal(byId.get('OBSERVED_AUTHORITY').present, true);
  assert.equal(byId.get('STALENESS_REPORT').present, true);
  assert.equal(byId.get('REPEATED_CANDIDATE_RESULT').present, true);
  assert.equal(byId.get('SHADOW_REPRODUCIBILITY_RECEIPT').present, true);
});

test('lineage graph rejects dependency tampering', () => {
  const graph = structuredClone(graphFor(buildBundle()));
  const node = graph.nodes.find((row) => row.nodeId === 'CANDIDATE_RESULT');
  node.dependencies = [];
  assert.throws(
    () => assertEngineeringEnrichmentEvidenceLineageGraph(graph),
    /dependencies differ/u,
  );
});

test('identical bundles create no lineage impact', () => {
  const beforeBundle = buildBundle();
  const afterBundle = buildBundle();
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle,
    afterBundle,
  });
  const impact = buildEnrichmentEvidenceLineageImpact({
    beforeGraph: graphFor(beforeBundle),
    afterGraph: graphFor(afterBundle),
    comparison,
  });
  assert.equal(impact.status, 'NO_SHADOW_LINEAGE_IMPACT');
  assert.deepEqual(impact.directChangedNodeIds, []);
  assert.deepEqual(impact.downstreamAffectedNodeIds, []);
  assert.deepEqual(impact.allAffectedNodeIds, []);
  assert.equal(impact.reviewRequirement, 'NOT_AUTHORIZED');
  assert.equal(impact.productionReadinessJudgement, 'NOT_AUTHORIZED');
  assert.equal(assertEngineeringEnrichmentEvidenceLineageImpact(impact), impact);
});

test('changed master value propagates through exact downstream shadow lineage', () => {
  const beforeBundle = buildBundle({ weight: 12 });
  const afterBundle = buildBundle({ weight: 13 });
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle,
    afterBundle,
  });
  const impact = buildEnrichmentEvidenceLineageImpact({
    beforeGraph: graphFor(beforeBundle),
    afterGraph: graphFor(afterBundle),
    comparison,
  });
  assert.equal(impact.status, 'RECORDED_SHADOW_LINEAGE_IMPACT');
  assert.ok(impact.directChangedNodeIds.includes('MASTER_SNAPSHOT_SET'));
  assert.ok(impact.directChangedNodeIds.includes('PROPOSAL_SET'));
  assert.ok(impact.directChangedNodeIds.includes('STEP_3_NUMERICAL_IMPACT'));
  assert.ok(impact.downstreamAffectedNodeIds.includes('PORTABLE_BUNDLE'));
  assert.equal(impact.approvalGranted, false);
  assert.equal(impact.calculationEligible, false);
});

test('lineage impact retains comparison direction', () => {
  const firstBundle = buildBundle({ weight: 12 });
  const secondBundle = buildBundle({ weight: 13 });
  const forwardComparison = compareEnrichmentPortableBundles({
    beforeBundle: firstBundle,
    afterBundle: secondBundle,
  });
  const reverseComparison = compareEnrichmentPortableBundles({
    beforeBundle: secondBundle,
    afterBundle: firstBundle,
  });
  const forward = buildEnrichmentEvidenceLineageImpact({
    beforeGraph: graphFor(firstBundle),
    afterGraph: graphFor(secondBundle),
    comparison: forwardComparison,
  });
  const reverse = buildEnrichmentEvidenceLineageImpact({
    beforeGraph: graphFor(secondBundle),
    afterGraph: graphFor(firstBundle),
    comparison: reverseComparison,
  });
  assert.notEqual(forward.comparisonHash, reverse.comparisonHash);
  assert.notEqual(forward.impactHash, reverse.impactHash);
  assert.equal(forward.beforeGraphHash, reverse.afterGraphHash);
  assert.equal(forward.afterGraphHash, reverse.beforeGraphHash);
});

test('comparison and graph bundle identities must agree', () => {
  const firstBundle = buildBundle({ weight: 12 });
  const secondBundle = buildBundle({ weight: 13 });
  const thirdBundle = buildBundle({ weight: 14 });
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: firstBundle,
    afterBundle: secondBundle,
  });
  assert.throws(() => buildEnrichmentEvidenceLineageImpact({
    beforeGraph: graphFor(firstBundle),
    afterGraph: graphFor(thirdBundle),
    comparison,
  }), /bundle identities differ/u);
});

test('lineage impact rejects authority escalation and affected-set tampering', () => {
  const beforeBundle = buildBundle({ weight: 12 });
  const afterBundle = buildBundle({ weight: 13 });
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle,
    afterBundle,
  });
  const original = buildEnrichmentEvidenceLineageImpact({
    beforeGraph: graphFor(beforeBundle),
    afterGraph: graphFor(afterBundle),
    comparison,
  });
  const escalated = structuredClone(original);
  escalated.current = true;
  assert.throws(
    () => assertEngineeringEnrichmentEvidenceLineageImpact(escalated),
    /current must remain false/u,
  );
  const tampered = structuredClone(original);
  tampered.allAffectedNodeIds = tampered.allAffectedNodeIds.slice(1);
  assert.throws(
    () => assertEngineeringEnrichmentEvidenceLineageImpact(tampered),
    /differs from direct and downstream/u,
  );
});
