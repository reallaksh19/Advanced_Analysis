import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEngineeringEnrichmentQualificationManifest,
  buildEnrichmentQualificationManifest,
} from '../src/workspace/engineering-enrichment/index.js';
import { buildPipeline } from './engineering-enrichment-test-fixture.mjs';
import { buildQualificationPackage } from './engineering-enrichment-shadow-qualification-fixture.mjs';

test('qualification manifest is deterministic, source-bound, and non-authoritative', () => {
  const first = buildQualificationPackage();
  const second = buildQualificationPackage();
  assert.equal(first.qualificationManifest.manifestHash, second.qualificationManifest.manifestHash);
  assert.equal(first.qualificationManifest.bundleHash, first.bundle.bundleHash);
  assert.equal(first.qualificationManifest.graphHash, first.lineageGraph.graphHash);
  assert.equal(first.qualificationManifest.reviewRequirement, 'NOT_AUTHORIZED');
  assert.equal(first.qualificationManifest.productionReadinessJudgement, 'NOT_AUTHORIZED');
  assert.equal(first.qualificationManifest.approvalGranted, false);
  assert.equal(assertEngineeringEnrichmentQualificationManifest(first.qualificationManifest), first.qualificationManifest);
});

test('optional lifecycle evidence is explicitly absent without becoming a blocker', () => {
  const value = buildQualificationPackage({ optionalLifecycle: false });
  assert.equal(value.qualificationManifest.checks.find((row) => row.checkId === 'STALENESS_EVIDENCE').status, 'EVIDENCE_ABSENT_OPTIONAL');
  assert.equal(value.qualificationManifest.checks.find((row) => row.checkId === 'REPRODUCIBILITY_EVIDENCE').status, 'EVIDENCE_ABSENT_OPTIONAL');
  assert.equal(value.qualificationManifest.summary.optionalAbsentEntryCount, 2);
});

test('existing blocked Step 3 status is retained without an acceptability judgement', () => {
  const value = buildQualificationPackage({ setup: buildPipeline({ candidateComplete: false }), optionalLifecycle: false });
  const numerical = value.qualificationManifest.checks.find((row) => row.checkId === 'RAW_NUMERICAL_IMPACT');
  assert.equal(numerical.status, 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS');
  assert.equal(numerical.observedArtifactStatus, 'BLOCKED');
  assert.ok(numerical.blockers.some((row) => row.code === 'CANDIDATE_RESULT_INCOMPLETE'));
  assert.equal(value.qualificationManifest.productionReadinessJudgement, 'NOT_AUTHORIZED');
});

test('manifest tampering is rejected', () => {
  const value = buildQualificationPackage();
  const changed = structuredClone(value.qualificationManifest);
  changed.checks[0].sourceArtifactHashes[0] = 'changed';
  assert.throws(() => assertEngineeringEnrichmentQualificationManifest(changed), /manifestHash is invalid/u);
});

test('cross-bundle graph identity is rejected before manifest construction', () => {
  const first = buildQualificationPackage();
  const other = buildQualificationPackage({ setup: buildPipeline({ weight: 13 }) });
  assert.throws(() => buildEnrichmentQualificationManifest({ bundle: first.bundle, lineageGraph: other.lineageGraph }), /identity mismatch/u);
});
