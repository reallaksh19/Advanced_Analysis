import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEngineeringEnrichmentPortableBundleComparison,
  buildEnrichmentPortableBundle,
  buildEnrichmentReviewPacket,
  compareEnrichmentPortableBundles,
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

function bundleFor(setup = buildPipeline()) {
  const reviewPacket = buildEnrichmentReviewPacket({
    masterSnapshots: [setup.masterSnapshot],
    proposals: setup.proposals,
    resolution: setup.resolution,
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    numericalImpact: setup.numericalImpact,
    contextIdentities: context(),
  });
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
    observedAuthority: null,
    stalenessReport: null,
    repeatedCandidateResult: null,
    reproducibilityReceipt: null,
  });
}

test('identical bundles produce no exact differences and no authority', () => {
  const bundle = bundleFor();
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundle,
    afterBundle: bundle,
  });
  assert.equal(comparison.status, 'NO_EXACT_SHADOW_DIFFERENCES');
  assert.equal(comparison.summary.differenceCount, 0);
  assert.deepEqual(comparison.identityChanges, []);
  assert.deepEqual(comparison.candidateChanges, []);
  assert.deepEqual(comparison.metricChanges, []);
  assert.deepEqual(comparison.evidenceChanges, []);
  assert.equal(comparison.comparisonJudgement, 'NOT_AUTHORIZED');
  assert.equal(comparison.numericalPolicy.toleranceApplied, false);
  assert.equal(comparison.current, false);
  assert.equal(comparison.resultAcceptanceEligible, false);
  assert.equal(
    assertEngineeringEnrichmentPortableBundleComparison(comparison),
    comparison,
  );
});

test('independent comparisons are deterministic', () => {
  const first = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(buildPipeline({ weight: 12 })),
    afterBundle: bundleFor(buildPipeline({ weight: 13 })),
  });
  const second = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(buildPipeline({ weight: 12 })),
    afterBundle: bundleFor(buildPipeline({ weight: 13 })),
  });
  assert.deepEqual(first, second);
  assert.equal(first.comparisonHash, second.comparisonHash);
});

test('changed weight records identity candidate and metric differences', () => {
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(buildPipeline({ weight: 12 })),
    afterBundle: bundleFor(buildPipeline({ weight: 13 })),
  });
  assert.equal(comparison.status, 'RECORDED_EXACT_SHADOW_DIFFERENCES');
  assert.ok(comparison.identityChanges.length > 0);
  assert.equal(comparison.candidateChanges.length, 2);
  assert.deepEqual(
    comparison.candidateChanges.map((row) => row.changeType).sort(),
    ['ADDED', 'REMOVED'],
  );
  assert.equal(comparison.metricChanges.length, 2);
  assert.ok(comparison.metricChanges.every(
    (row) => row.changeType === 'CHANGED',
  ));
  const mass = comparison.metricChanges.find(
    (row) => row.key.startsWith('totalMassKg\u0000'),
  );
  assert.equal(mass.before.candidateValue, 112);
  assert.equal(mass.after.candidateValue, 113);
  assert.equal(comparison.numericalPolicy.mode, 'EXACT_REPRESENTATION_ONLY');
  assert.equal(comparison.numericalPolicy.thresholdEvaluation, 'NOT_AUTHORIZED');
});

test('comparison direction preserves before and after evidence', () => {
  const lower = bundleFor(buildPipeline({ weight: 12 }));
  const higher = bundleFor(buildPipeline({ weight: 13 }));
  const forward = compareEnrichmentPortableBundles({
    beforeBundle: lower,
    afterBundle: higher,
  });
  const reverse = compareEnrichmentPortableBundles({
    beforeBundle: higher,
    afterBundle: lower,
  });
  assert.notEqual(forward.comparisonHash, reverse.comparisonHash);
  const forwardMass = forward.metricChanges.find(
    (row) => row.key.startsWith('totalMassKg\u0000'),
  );
  const reverseMass = reverse.metricChanges.find(
    (row) => row.key.startsWith('totalMassKg\u0000'),
  );
  assert.equal(forwardMass.before.candidateValue, 112);
  assert.equal(forwardMass.after.candidateValue, 113);
  assert.equal(reverseMass.before.candidateValue, 113);
  assert.equal(reverseMass.after.candidateValue, 112);
});

test('diagnostic-only changes are retained as exact evidence changes', () => {
  const changedOutput = engineOutput(12);
  changedOutput.diagnostics = [{ code: 'SHADOW_NOTE', scopeId: 'route:1' }];
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(buildPipeline()),
    afterBundle: bundleFor(buildPipeline({
      candidateOutput: changedOutput,
    })),
  });
  assert.ok(comparison.evidenceChanges.some(
    (row) => row.field === 'candidateResult.diagnostics',
  ));
  assert.equal(comparison.metricChanges.length, 0);
  assert.equal(comparison.comparisonJudgement, 'NOT_AUTHORIZED');
});

test('blocked Step 3 changes statuses blockers and completeness exactly', () => {
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(buildPipeline()),
    afterBundle: bundleFor(buildPipeline({ candidateComplete: false })),
  });
  const fields = comparison.evidenceChanges.map((row) => row.field);
  assert.ok(fields.includes('candidateResult.complete'));
  assert.ok(fields.includes('numericalImpact.status'));
  assert.ok(fields.includes('numericalImpact.blockers'));
  assert.ok(fields.includes('reviewPacket.status'));
  assert.ok(fields.includes('reviewPacket.blockers'));
  assert.equal(comparison.approvalGranted, false);
  assert.equal(comparison.sealEligible, false);
});

test('exact numerical comparison applies no tolerance', () => {
  const changedOutput = engineOutput(12);
  changedOutput.metrics = changedOutput.metrics.map((row) => (
    row.metricId === 'totalMassKg'
      ? { ...row, value: row.value + 1e-9 }
      : row
  ));
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(buildPipeline()),
    afterBundle: bundleFor(buildPipeline({
      candidateOutput: changedOutput,
    })),
  });
  assert.equal(comparison.metricChanges.length, 1);
  assert.equal(comparison.numericalPolicy.toleranceApplied, false);
  assert.equal(comparison.numericalPolicy.precisionPolicyHash, null);
});

test('tampered comparison hash fails closed', () => {
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(),
    afterBundle: bundleFor(),
  });
  assert.throws(() => assertEngineeringEnrichmentPortableBundleComparison({
    ...comparison,
    comparisonHash: 'fnv1a64:0000000000000000',
  }), /comparisonHash is invalid/u);
});

test('comparison cannot be altered into current or accepted evidence', () => {
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(),
    afterBundle: bundleFor(),
  });
  assert.throws(() => assertEngineeringEnrichmentPortableBundleComparison({
    ...comparison,
    current: true,
  }), /current must remain false/u);
  assert.throws(() => assertEngineeringEnrichmentPortableBundleComparison({
    ...comparison,
    numericalPolicy: {
      ...comparison.numericalPolicy,
      toleranceApplied: true,
    },
  }), /numerical comparison policy/u);
});
