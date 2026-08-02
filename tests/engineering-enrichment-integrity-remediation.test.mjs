import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  assertEngineeringEnrichmentCandidateProjection,
  assertEngineeringEnrichmentNumericalImpact,
  assertEnrichmentShadowCalculationResult,
  buildEnrichmentTarget,
  buildShadowCandidateProjection,
  resolveExactEnrichmentProposals,
} from '../src/workspace/engineering-enrichment/index.js';
import {
  buildPipeline,
  DATASET_SHA,
} from './engineering-enrichment-test-fixture.mjs';
import {
  findPr371BoundaryViolations,
} from '../scripts/lfea-piping-phase6i-pr371-boundary-check.mjs';

function rehash(value, field) {
  const material = { ...value };
  delete material[field];
  value[field] = semanticHash(material);
  return value;
}

test('proposal authority rejects a fabricated source row after complete re-hashing', () => {
  const setup = buildPipeline();
  const proposal = structuredClone(setup.proposals[0]);
  proposal.sourceRowHash = semanticHash({ fabricated: true });
  proposal.proposalId = semanticHash({
    adapterId: proposal.adapterId,
    sourceSnapshotHash: proposal.sourceSnapshotHash,
    sourceRowHash: proposal.sourceRowHash,
    fieldId: proposal.fieldId,
    selector: proposal.selector,
  });
  rehash(proposal, 'proposalHash');
  assert.throws(() => resolveExactEnrichmentProposals({
    sourceDatasetHash: DATASET_SHA,
    sourceSharedModelHash: setup.sharedModel.semanticHash,
    masterSnapshots: [setup.masterSnapshot],
    proposals: [proposal],
    targets: setup.targets,
  }), /does not resolve to exactly one snapshot row/u);
});

test('proposal authority rejects altered source evidence after re-hashing', () => {
  const setup = buildPipeline();
  const proposal = structuredClone(setup.proposals[0]);
  proposal.evidence.sourceFileName = 'other.xlsx';
  rehash(proposal, 'proposalHash');
  assert.throws(() => resolveExactEnrichmentProposals({
    sourceDatasetHash: DATASET_SHA,
    sourceSharedModelHash: setup.sharedModel.semanticHash,
    masterSnapshots: [setup.masterSnapshot],
    proposals: [proposal],
    targets: setup.targets,
  }), /source evidence differs from its snapshot/u);
});

test('typed target identity cannot silently treat a support target as a component', () => {
  const setup = buildPipeline();
  const resolution = resolveExactEnrichmentProposals({
    sourceDatasetHash: DATASET_SHA,
    sourceSharedModelHash: setup.sharedModel.semanticHash,
    masterSnapshots: [setup.masterSnapshot],
    proposals: setup.proposals,
    targets: [buildEnrichmentTarget({
      targetKind: 'SUPPORT',
      targetId: 'entity:1',
      selector: setup.proposals[0].selector,
    })],
  });
  assert.equal(resolution.rows[0].selectedTargetRef.targetKind, 'SUPPORT');
  const candidate = buildShadowCandidateProjection({
    sourceSharedModel: setup.sharedModel,
    resolution,
    proposals: setup.proposals,
  });
  assert.equal(candidate.rows[0].disposition, 'BLOCKED_TARGET_KIND');
  assert.equal(candidate.summary.status, 'BLOCKED');
});

test('candidate validation rejects a rehashed structural field injection', () => {
  const setup = buildPipeline();
  const candidate = structuredClone(setup.candidateProjection);
  candidate.rows[0].fieldId = 'geometry.position';
  rehash(candidate, 'projectionHash');
  assert.throws(
    () => assertEngineeringEnrichmentCandidateProjection(candidate),
    /fieldId is not nonstructural/u,
  );
});

test('candidate validation rejects rehashed authority and value promotion', () => {
  const setup = buildPipeline();
  for (const mutate of [
    (row) => { row.authorityLevel = 'AUTHORIZED_MASTER'; },
    (row) => { row.proposedValue = -1; },
  ]) {
    const candidate = structuredClone(setup.candidateProjection);
    mutate(candidate.rows[0]);
    rehash(candidate, 'projectionHash');
    assert.throws(
      () => assertEngineeringEnrichmentCandidateProjection(candidate),
      /authorityLevel is invalid|positive finite number/u,
    );
  }
});

test('result validation rejects rehashed non-numeric and duplicate metrics', () => {
  const setup = buildPipeline();
  const nonNumeric = structuredClone(setup.candidateResult);
  nonNumeric.metrics[0].value = String(nonNumeric.metrics[0].value);
  rehash(nonNumeric, 'resultHash');
  assert.throws(
    () => assertEnrichmentShadowCalculationResult(nonNumeric),
    /must be a finite number/u,
  );

  const duplicate = structuredClone(setup.candidateResult);
  duplicate.metrics.push(structuredClone(duplicate.metrics[0]));
  duplicate.metrics.sort((left, right) => (
    left.metricId.localeCompare(right.metricId)
    || left.scopeId.localeCompare(right.scopeId)
    || left.loadCaseId.localeCompare(right.loadCaseId)
  ));
  rehash(duplicate, 'resultHash');
  assert.throws(
    () => assertEnrichmentShadowCalculationResult(duplicate),
    /duplicate metric tuple/u,
  );
});

test('numerical impact validation rejects rehashed delta arithmetic tampering', () => {
  const setup = buildPipeline();
  const impact = structuredClone(setup.numericalImpact);
  impact.deltas[0].delta += 1;
  impact.deltas[0].absoluteDelta = Math.abs(impact.deltas[0].delta);
  rehash(impact, 'impactHash');
  assert.throws(
    () => assertEngineeringEnrichmentNumericalImpact(impact),
    /arithmetic is invalid/u,
  );
});

test('Phase 6I authority files remain scanned for direct enrichment imports', () => {
  for (const path of [
    'scripts/lfea-piping-phase6i-project-authority-index.mjs',
    'scripts/lfea-piping-phase6i-project-authority-index-check.mjs',
  ]) {
    const violations = findPr371BoundaryViolations(
      path,
      "import '../src/workspace/engineering-enrichment/index.js';",
    );
    assert.ok(violations.includes('ENGINEERING_ENRICHMENT_IMPORT'), path);
  }
});
