import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  assertEngineeringEnrichmentEvidenceIndex,
  assertEngineeringEnrichmentProposalHandoff,
  assertEngineeringEnrichmentProposalHandoffComparison,
  assertEngineeringEnrichmentQualificationManifest,
  compareEnrichmentProposalHandoffs,
} from '../src/workspace/engineering-enrichment/index.js';
import { buildQualificationPackage } from './engineering-enrichment-shadow-qualification-fixture.mjs';

function rehash(value, field) {
  const material = { ...value };
  delete material[field];
  value[field] = semanticHash(material);
  return value;
}

test('manifest rejects rehashed evidence on an optional-absent check', () => {
  const value = structuredClone(buildQualificationPackage({
    optionalLifecycle: false,
  }).qualificationManifest);
  const check = value.checks.find((row) => row.checkId === 'STALENESS_EVIDENCE');
  check.sourceArtifactHashes.push('changed');
  rehash(value, 'manifestHash');
  assert.throws(
    () => assertEngineeringEnrichmentQualificationManifest(value),
    /optional absence must not carry artifact hashes/u,
  );
});

test('evidence index rejects rehashed nested role shape tampering', () => {
  const value = structuredClone(buildQualificationPackage().evidenceIndex);
  value.byRole[0].unexpected = true;
  rehash(value, 'indexHash');
  assert.throws(
    () => assertEngineeringEnrichmentEvidenceIndex(value),
    /nodeId\[0\] keys are invalid/u,
  );
});

test('evidence index rejects rehashed metric identity tampering', () => {
  const value = structuredClone(buildQualificationPackage().evidenceIndex);
  value.byMetric[0].metricKey = 'changed';
  rehash(value, 'indexHash');
  assert.throws(
    () => assertEngineeringEnrichmentEvidenceIndex(value),
    /metricKey is invalid/u,
  );
});

test('proposal handoff rejects rehashed nested provenance tampering', () => {
  const value = structuredClone(buildQualificationPackage().proposalHandoff);
  value.proposals[0].source.sha256 = 'not-a-sha';
  rehash(value, 'handoffHash');
  assert.throws(
    () => assertEngineeringEnrichmentProposalHandoff(value),
    /source\.sha256 must be lowercase SHA-256/u,
  );
});

test('handoff comparison rejects rehashed malformed change rows', () => {
  const handoff = buildQualificationPackage().proposalHandoff;
  const value = structuredClone(compareEnrichmentProposalHandoffs({
    beforeHandoff: handoff,
    afterHandoff: handoff,
  }));
  value.proposalChanges.push({
    proposalId: 'invalid',
    kind: 'CHANGED',
    changedFields: [],
    beforeProposalHash: 'before',
    afterProposalHash: 'after',
  });
  value.summary = {
    proposalChangeCount: 1,
    evidenceChangeCount: 0,
    differenceCount: 1,
    status: 'RECORDED_SHADOW_HANDOFF_DIFFERENCES',
  };
  value.status = 'RECORDED_SHADOW_HANDOFF_DIFFERENCES';
  rehash(value, 'comparisonHash');
  assert.throws(
    () => assertEngineeringEnrichmentProposalHandoffComparison(value),
    /changedFields must be a non-empty array/u,
  );
});
