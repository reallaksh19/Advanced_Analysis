import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEngineeringEnrichmentEvidenceIndex,
  assertEngineeringEnrichmentProposalHandoff,
} from '../src/workspace/engineering-enrichment/index.js';
import { buildPipeline } from './engineering-enrichment-test-fixture.mjs';
import { buildQualificationPackage } from './engineering-enrichment-shadow-qualification-fixture.mjs';

test('evidence index provides deterministic exact lookups', () => {
  const first = buildQualificationPackage();
  const second = buildQualificationPackage();
  assert.equal(first.evidenceIndex.indexHash, second.evidenceIndex.indexHash);
  assert.equal(first.evidenceIndex.lookupSemantics, 'EXACT_IMMUTABLE_KEYS_ONLY');
  assert.equal(first.evidenceIndex.byProposal.length, 1);
  assert.equal(first.evidenceIndex.byTarget[0].targetId, 'entity:1');
  assert.equal(first.evidenceIndex.byMetric.length, 2);
  assert.equal(first.evidenceIndex.byProvenance[0].sourceSha256, 'a'.repeat(64));
  assert.equal(assertEngineeringEnrichmentEvidenceIndex(first.evidenceIndex), first.evidenceIndex);
});

test('blocker index retains exact blocker codes and locations', () => {
  const value = buildQualificationPackage({ setup: buildPipeline({ baselineComplete: false }), optionalLifecycle: false });
  const blocker = value.evidenceIndex.byBlocker.find((row) => row.code === 'BASELINE_RESULT_INCOMPLETE');
  assert.ok(blocker);
  assert.ok(blocker.locations.includes('numericalImpact'));
  assert.ok(blocker.locations.includes('qualification:RAW_NUMERICAL_IMPACT'));
});

test('proposal handoff carries immutable provenance and shadow evidence only', () => {
  const value = buildQualificationPackage();
  const handoff = value.proposalHandoff;
  assert.equal(handoff.purpose, 'EXTERNAL_GOVERNANCE_INPUT_ONLY');
  assert.equal(handoff.approvalOwner, 'EXTERNAL_TO_PR_371');
  assert.equal(handoff.candidateBindingOwner, 'EXTERNAL_TO_PR_371');
  assert.equal(handoff.proposals[0].resolvedTargetId, 'entity:1');
  assert.equal(handoff.proposals[0].source.sha256, 'a'.repeat(64));
  assert.equal(handoff.proposals[0].evidenceHashes.bundleHash, value.bundle.bundleHash);
  assert.equal(handoff.approvalGranted, false);
  assert.equal(handoff.bindingCreated, false);
  assert.equal(handoff.calculationEligible, false);
  assert.equal(assertEngineeringEnrichmentProposalHandoff(handoff), handoff);
});

test('evidence index tampering is rejected', () => {
  const value = buildQualificationPackage();
  const changed = structuredClone(value.evidenceIndex);
  changed.byProposal[0].projectionDisposition = 'CHANGED';
  assert.throws(() => assertEngineeringEnrichmentEvidenceIndex(changed), /indexHash is invalid/u);
});

test('proposal handoff cannot escalate authority', () => {
  const value = buildQualificationPackage();
  const changed = structuredClone(value.proposalHandoff);
  changed.approvalGranted = true;
  assert.throws(() => assertEngineeringEnrichmentProposalHandoff(changed), /approvalGranted must remain false/u);
});
