import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEngineeringEnrichmentProposalHandoffComparison,
  assertEngineeringEnrichmentProposalHandoffVerification,
  compareEnrichmentProposalHandoffs,
  parseAndVerifyEnrichmentProposalHandoff,
  serializeEnrichmentProposalHandoff,
  verifyEngineeringEnrichmentProposalHandoff,
} from '../src/workspace/engineering-enrichment/index.js';
import { buildPipeline } from './engineering-enrichment-test-fixture.mjs';
import { buildQualificationPackage } from './engineering-enrichment-shadow-qualification-fixture.mjs';

test('proposal handoff canonical serialization round-trips with verification', () => {
  const value = buildQualificationPackage().proposalHandoff;
  const text = serializeEnrichmentProposalHandoff(value);
  const parsed = parseAndVerifyEnrichmentProposalHandoff(text);
  assert.deepEqual(parsed.handoff, value);
  assert.equal(parsed.canonicalText, text);
  assert.equal(parsed.verification.verified, true);
  assert.equal(parsed.verification.inputWasCanonical, true);
  assert.equal(parsed.verification.originVerified, false);
  assert.equal(parsed.verification.storageVerified, false);
  assert.equal(assertEngineeringEnrichmentProposalHandoffVerification(parsed.verification), parsed.verification);
});

test('non-canonical handoff JSON is normalized and reported', () => {
  const value = buildQualificationPackage().proposalHandoff;
  const canonicalText = serializeEnrichmentProposalHandoff(value);
  const parsed = parseAndVerifyEnrichmentProposalHandoff(`\n${canonicalText}\n`);
  assert.equal(parsed.verification.inputWasCanonical, false);
  assert.equal(parsed.canonicalText, canonicalText);
});

test('identical proposal handoffs produce an exact no-difference comparison', () => {
  const value = buildQualificationPackage().proposalHandoff;
  const comparison = compareEnrichmentProposalHandoffs({
    beforeHandoff: value,
    afterHandoff: value,
  });
  assert.equal(comparison.status, 'IDENTICAL_SHADOW_HANDOFFS');
  assert.equal(comparison.summary.differenceCount, 0);
  assert.equal(comparison.comparisonJudgement, 'NOT_AUTHORIZED');
  assert.equal(comparison.adoptionDecision, 'NOT_AUTHORIZED');
  assert.equal(assertEngineeringEnrichmentProposalHandoffComparison(comparison), comparison);
});

test('changed proposal evidence is directionally retained without adoption authority', () => {
  const before = buildQualificationPackage().proposalHandoff;
  const after = buildQualificationPackage({ setup: buildPipeline({ weight: 13 }) }).proposalHandoff;
  const comparison = compareEnrichmentProposalHandoffs({ beforeHandoff: before, afterHandoff: after });
  assert.equal(comparison.direction, 'BEFORE_TO_AFTER');
  assert.equal(comparison.status, 'RECORDED_SHADOW_HANDOFF_DIFFERENCES');
  assert.ok(comparison.summary.differenceCount > 0);
  assert.equal(comparison.reviewRequirement, 'NOT_AUTHORIZED');
  assert.equal(comparison.approvalGranted, false);
});

test('verification and comparison cannot escalate authority', () => {
  const handoff = buildQualificationPackage().proposalHandoff;
  const verification = structuredClone(verifyEngineeringEnrichmentProposalHandoff(handoff));
  verification.current = true;
  assert.throws(() => assertEngineeringEnrichmentProposalHandoffVerification(verification), /current must remain false/u);
  const comparison = structuredClone(compareEnrichmentProposalHandoffs({ beforeHandoff: handoff, afterHandoff: handoff }));
  comparison.adoptionDecision = 'APPROVED';
  assert.throws(() => assertEngineeringEnrichmentProposalHandoffComparison(comparison), /scope is invalid/u);
});
