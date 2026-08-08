import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  buildEnrichmentObservedAuthority,
} from '../src/workspace/engineering-enrichment/review-package-validation.js';
import {
  ENGINEERING_INPUT_SEAL_CURRENTNESS_SCHEMA,
  ENGINEERING_INPUT_SEAL_SCHEMA,
  ENRICHMENT_APPROVAL_SCHEMA,
  assertEngineeringEnrichmentApproval,
  assertEngineeringInputSeal,
  assertEngineeringInputSealCurrentness,
  buildEngineeringEnrichmentApproval,
  buildEngineeringInputSeal,
  evaluateEngineeringInputSealCurrentness,
} from '../src/workspace/engineering-enrichment/input-seal.js';

const packet = reviewPacket();
const packetBefore = JSON.stringify(packet);
const observed = observedAuthority(packet);
const observedBefore = JSON.stringify(observed);
const approvalA = buildEngineeringEnrichmentApproval({
  reviewPacket: packet,
  approvalId: 'APPROVAL-A',
  reviewerId: 'reviewer-a',
  approvedAt: '2026-08-08T05:20:00.000Z',
  basis: 'Reviewed source, structural and numerical shadow evidence.',
});
const approvalB = buildEngineeringEnrichmentApproval({
  reviewPacket: packet,
  approvalId: 'APPROVAL-B',
  reviewerId: 'reviewer-b',
  approvedAt: '2026-08-08T05:21:00.000Z',
  basis: 'Independent engineering review completed.',
});

assert.equal(approvalA.schema, ENRICHMENT_APPROVAL_SCHEMA);
assert.equal(approvalA.reviewPacketHash, packet.packetHash);
assert.equal(approvalA.decision, 'APPROVED_FOR_INPUT_SEAL');
assert.equal(approvalA.persistenceCreated, false);
assert.equal(approvalA.sealCreated, false);
assert.equal(approvalA.productionCalculationConsumptionEnabled, false);
assert.equal(approvalA.automaticCalculationTriggered, false);
assert.equal(assertEngineeringEnrichmentApproval(approvalA), approvalA);

const sealInput = {
  reviewPacket: packet,
  observedAuthority: observed,
  sealId: 'SEAL:ENRICHMENT:4A:001',
  sealedBy: 'engineering-governance',
  sealedAt: '2026-08-08T05:22:00.000Z',
};
const seal = buildEngineeringInputSeal({
  ...sealInput,
  approvals: [approvalB, approvalA],
});
const sealAgain = buildEngineeringInputSeal({
  ...sealInput,
  approvals: [approvalA, approvalB],
});

assert.deepEqual(sealAgain, seal, 'seal must be independent of approval input order');
assert.equal(seal.schema, ENGINEERING_INPUT_SEAL_SCHEMA);
assert.equal(seal.status, 'SEALED_CURRENT');
assert.equal(seal.current, true);
assert.equal(seal.requiresReseal, false);
assert.equal(seal.governedBindingCreated, true);
assert.equal(seal.persistenceCreated, false);
assert.equal(seal.productionCalculationConsumptionEnabled, false);
assert.equal(seal.automaticCalculationTriggered, false);
assert.equal(seal.resultAcceptanceEligible, false);
assert.deepEqual(seal.approvalIds, ['APPROVAL-A', 'APPROVAL-B']);
assert.deepEqual(seal.approvalHashes, [approvalA.approvalHash, approvalB.approvalHash]);
assert.deepEqual(seal.masterSnapshotHashes, packet.evidenceRefs.masterSnapshotHashes);
assert.deepEqual(seal.proposalHashes, packet.evidenceRefs.proposalHashes);
assert.equal(seal.projectDataHash, packet.contextIdentities.projectDataHash);
assert.equal(seal.overrideSetHash, packet.contextIdentities.overrideSetHash);
assert.equal(seal.approximationSetHash, packet.contextIdentities.approximationSetHash);
assert.equal(seal.selectorRegistryHash, packet.contextIdentities.selectorRegistryHash);
assert.equal(assertEngineeringInputSeal(seal), seal);

const current = evaluateEngineeringInputSealCurrentness({
  seal,
  observedAuthority: observed,
});
assert.equal(current.schema, ENGINEERING_INPUT_SEAL_CURRENTNESS_SCHEMA);
assert.equal(current.status, 'CURRENT');
assert.equal(current.current, true);
assert.equal(current.requiresReseal, false);
assert.equal(current.differences.length, 0);
assert.equal(current.productionCalculationConsumptionEnabled, false);
assert.equal(current.automaticCalculationTriggered, false);
assert.equal(current.resultAcceptanceEligible, false);
assert.equal(assertEngineeringInputSealCurrentness(current), current);

const staleCases = [
  ['masterSnapshotHashes', observedWith(packet, {
    masterSnapshotHashes: [hash('master-a'), hash('master-c')],
  })],
  ['projectDataHash', observedWith(packet, {}, { projectDataHash: hash('project-data-new') })],
  ['overrideSetHash', observedWith(packet, {}, { overrideSetHash: hash('overrides-new') })],
  ['approximationSetHash', observedWith(packet, {}, { approximationSetHash: hash('approximations-new') })],
  ['selectorRegistryHash', observedWith(packet, {}, { selectorRegistryHash: hash('selectors-new') })],
  ['candidateProjectionHash', observedWith(packet, {
    candidateProjectionHash: hash('candidate-projection-new'),
  })],
  ['numericalImpactHash', observedWith(packet, {
    numericalImpactHash: hash('numerical-impact-new'),
  })],
];

for (const [field, changedObserved] of staleCases) {
  const stale = evaluateEngineeringInputSealCurrentness({
    seal,
    observedAuthority: changedObserved,
  });
  assert.equal(stale.status, 'STALE_RESEAL_REQUIRED', `${field} must stale the seal`);
  assert.equal(stale.current, false);
  assert.equal(stale.requiresReseal, true);
  assert.equal(stale.productionCalculationConsumptionEnabled, false);
  assert.equal(stale.automaticCalculationTriggered, false);
  assert(
    stale.differences.some((row) => row.field.endsWith(field)),
    `${field} difference must be visible`,
  );
}

assert.throws(
  () => buildEngineeringInputSeal({
    ...sealInput,
    observedAuthority: staleCases[0][1],
    approvals: [approvalA],
  }),
  (error) => error.code === 'ENRICHMENT_INPUT_SEAL_STALE_REVIEW'
    && error.details?.differences?.length > 0,
);

assert.throws(
  () => buildEngineeringInputSeal({ ...sealInput, approvals: [] }),
  (error) => error.code === 'ENRICHMENT_INPUT_SEAL_APPROVAL_REQUIRED',
);

const otherPacket = reviewPacket({
  sourceDatasetHash: hash('other-source-dataset'),
});
const otherApproval = buildEngineeringEnrichmentApproval({
  reviewPacket: otherPacket,
  approvalId: 'APPROVAL-OTHER',
  reviewerId: 'reviewer-other',
  approvedAt: '2026-08-08T05:23:00.000Z',
  basis: 'Review of a different packet.',
});
assert.throws(
  () => buildEngineeringInputSeal({
    ...sealInput,
    approvals: [otherApproval],
  }),
  (error) => error.code === 'ENRICHMENT_INPUT_SEAL_APPROVAL_PACKET_MISMATCH',
);

const blockedPacket = reviewPacket({}, {
  status: 'BLOCKED',
  blockers: [{ code: 'STEP_3_NOT_READY' }],
});
assert.throws(
  () => buildEngineeringEnrichmentApproval({
    reviewPacket: blockedPacket,
    approvalId: 'APPROVAL-BLOCKED',
    reviewerId: 'reviewer-blocked',
    approvedAt: '2026-08-08T05:24:00.000Z',
    basis: 'Must not be accepted.',
  }),
  (error) => error.code === 'ENRICHMENT_APPROVAL_REVIEW_PACKET_BLOCKED',
);

const tamperedApproval = structuredClone(approvalA);
tamperedApproval.reviewerId = 'tampered-reviewer';
assert.throws(
  () => assertEngineeringEnrichmentApproval(tamperedApproval),
  (error) => error.code === 'ENRICHMENT_APPROVAL_HASH_MISMATCH',
);

const tamperedSeal = structuredClone(seal);
tamperedSeal.numericalImpactHash = hash('tampered-impact');
assert.throws(
  () => assertEngineeringInputSeal(tamperedSeal),
  (error) => error.code === 'ENRICHMENT_INPUT_SEAL_HASH_MISMATCH',
);

const broadenedSeal = structuredClone(seal);
broadenedSeal.productionCalculationConsumptionEnabled = true;
broadenedSeal.sealHash = semanticHash(withoutHash(broadenedSeal, 'sealHash'));
assert.throws(
  () => assertEngineeringInputSeal(broadenedSeal),
  (error) => error.code === 'ENRICHMENT_INPUT_SEAL_BOUNDARY_INVALID',
);

const tamperedCurrentness = structuredClone(current);
tamperedCurrentness.requiresReseal = true;
assert.throws(
  () => assertEngineeringInputSealCurrentness(tamperedCurrentness),
  (error) => error.code === 'ENRICHMENT_INPUT_SEAL_CURRENTNESS_INVALID',
);

assert.equal(JSON.stringify(packet), packetBefore, '4A mutated review packet');
assert.equal(JSON.stringify(observed), observedBefore, '4A mutated observed authority');

const source = await readFile(
  new URL('../src/workspace/engineering-enrichment/input-seal.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  source,
  /authorized-empirical-load-execution|support-load-distribution|executeEnrichmentShadowCalculation|calculateSupport|linear-fea|lafea|lfea|solver/iu,
  'Package 4A governance must not import or invoke calculation mechanics.',
);
assert.doesNotMatch(
  source,
  /localStorage|indexedDB|sessionStorage|fetch\s*\(/iu,
  'Package 4A must not create persistence or external side effects.',
);

console.log(JSON.stringify({
  check: 'enrichment-package4a-input-seal',
  status: 'PASS',
  approvalSchema: approvalA.schema,
  sealSchema: seal.schema,
  sealStatus: seal.status,
  approvalIds: seal.approvalIds,
  completeIdentityCurrentness: true,
  resealTriggers: staleCases.map(([field]) => field),
  persistenceCreated: seal.persistenceCreated,
  productionCalculationConsumptionEnabled: seal.productionCalculationConsumptionEnabled,
  automaticCalculationTriggered: seal.automaticCalculationTriggered,
  sealHash: seal.sealHash,
}, null, 2));

function reviewPacket(
  evidenceOverrides = {},
  { status = 'READY_FOR_REVIEW_ONLY', blockers = [] } = {},
) {
  const evidenceRefs = {
    sourceDatasetHash: hash('source-dataset'),
    sourceSharedModelHash: hash('source-shared-model'),
    sourceStructuralHash: hash('source-structural'),
    masterSnapshotHashes: [hash('master-a'), hash('master-b')].sort(),
    proposalHashes: [hash('proposal-a'), hash('proposal-b')].sort(),
    resolutionHash: hash('resolution'),
    candidateProjectionHash: hash('candidate-projection'),
    structuralImpactHash: hash('structural-impact'),
    engineDescriptorHash: hash('engine-descriptor'),
    baselineReferenceHash: hash('baseline-reference'),
    baselineResultHash: hash('baseline-result'),
    candidateResultHash: hash('candidate-result'),
    numericalImpactHash: hash('numerical-impact'),
    ...evidenceOverrides,
  };
  if (Array.isArray(evidenceRefs.masterSnapshotHashes)) {
    evidenceRefs.masterSnapshotHashes = [...evidenceRefs.masterSnapshotHashes].sort();
  }
  if (Array.isArray(evidenceRefs.proposalHashes)) {
    evidenceRefs.proposalHashes = [...evidenceRefs.proposalHashes].sort();
  }
  const contextIdentities = {
    projectDataHash: hash('project-data'),
    overrideSetHash: hash('overrides'),
    approximationSetHash: hash('approximations'),
    selectorRegistryHash: hash('selectors'),
  };
  const material = {
    schema: 'EngineeringEnrichmentReviewPacket.v1',
    evidenceRefs,
    contextIdentities,
    blockers,
    summary: {
      snapshotCount: evidenceRefs.masterSnapshotHashes.length,
      proposalCount: evidenceRefs.proposalHashes.length,
      step1Status: status === 'BLOCKED' ? 'BLOCKED' : 'READY_FOR_REVIEW',
      candidateStatus: status === 'BLOCKED' ? 'BLOCKED' : 'READY_FOR_STRUCTURAL_IMPACT',
      step2Status: status === 'BLOCKED' ? 'BLOCKED' : 'PASS_SHADOW_NO_STRUCTURAL_CHANGE',
      step3Status: status === 'BLOCKED' ? 'BLOCKED' : 'RECORDED_SHADOW_RAW_DELTAS',
      contextIdentityCount: 4,
      status,
    },
    status,
    reviewDecisionStatus: 'NOT_RECORDED',
    persistenceCreated: false,
    bindingCreated: false,
    reviewSelectionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return Object.freeze({ ...material, packetHash: semanticHash(material) });
}

function observedAuthority(packetValue) {
  return buildEnrichmentObservedAuthority({
    ...packetValue.evidenceRefs,
    contextIdentities: packetValue.contextIdentities,
  });
}

function observedWith(packetValue, evidenceOverrides = {}, contextOverrides = {}) {
  return buildEnrichmentObservedAuthority({
    ...packetValue.evidenceRefs,
    ...evidenceOverrides,
    contextIdentities: {
      ...packetValue.contextIdentities,
      ...contextOverrides,
    },
  });
}

function hash(label) {
  return semanticHash({ label });
}

function withoutHash(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return copy;
}
