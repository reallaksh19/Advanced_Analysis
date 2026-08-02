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
} from './engineering-enrichment-test-fixture.mjs';

function context() {
  return {
    projectDataHash: null,
    overrideSetHash: null,
    approximationSetHash: null,
    selectorRegistryHash: 'fnv1a64:7777777777777777',
  };
}

function bundleFor(setup) {
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

test('changed lifecycle evidence is canonical and assertable', () => {
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(buildPipeline()),
    afterBundle: bundleFor(buildPipeline({ candidateComplete: false })),
  });
  const fields = comparison.evidenceChanges.map((row) => row.field);
  assert.deepEqual(fields, [...fields].sort());
  assert.ok(fields.length > 1);
  assert.equal(
    assertEngineeringEnrichmentPortableBundleComparison(comparison),
    comparison,
  );
});

test('noncanonical lifecycle evidence ordering fails closed', () => {
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(buildPipeline()),
    afterBundle: bundleFor(buildPipeline({ candidateComplete: false })),
  });
  assert.throws(
    () => assertEngineeringEnrichmentPortableBundleComparison({
      ...comparison,
      evidenceChanges: [...comparison.evidenceChanges].reverse(),
    }),
    /sorted and unique|canonical order/u,
  );
});

test('diagnostic changes remain canonical under public validation', () => {
  const changed = buildPipeline({
    candidateOutput: {
      metrics: [
        {
          metricId: 'totalMassKg',
          scopeId: 'route:1',
          loadCaseId: 'EMPTY',
          value: 112,
          unit: 'kg',
        },
        {
          metricId: 'supportReactionN',
          scopeId: 'support:1',
          loadCaseId: 'OPE',
          value: 1097.6,
          unit: 'N',
        },
      ],
      diagnostics: [{ code: 'SHADOW_NOTE' }],
      complete: true,
    },
  });
  const comparison = compareEnrichmentPortableBundles({
    beforeBundle: bundleFor(buildPipeline()),
    afterBundle: bundleFor(changed),
  });
  assert.ok(comparison.evidenceChanges.some(
    (row) => row.field === 'candidateResult.diagnostics',
  ));
  assert.equal(
    assertEngineeringEnrichmentPortableBundleComparison(comparison),
    comparison,
  );
});
