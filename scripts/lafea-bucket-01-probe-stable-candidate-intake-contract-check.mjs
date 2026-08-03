#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_INPUT_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_VALIDATION_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_PACKAGE_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_TOPOLOGY_REPORT_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_TOPOLOGY_VALIDATION_EVIDENCE_SCHEMA,
  evaluateLafeaBucket01ProbeStableCandidateIntake,
  validateLafeaBucket01ProbeStableCandidateIntakeEvidence,
} from '../src/workspace/lafea-bucket-01-probe-stable-candidate-intake.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const head = 'a'.repeat(40);
const design = JSON.parse(fs.readFileSync(
  new URL(
    '../validation/bucket-01/13-probe-stable-polar-mesh-design.json',
    import.meta.url,
  ),
  'utf8',
));
assert.equal(design.designId, 'B01-PROBE-STABLE-POLAR-V3');
assert.deepEqual(design.radialAxis.protectedBreakpoints, [60]);
const designHash = canonicalLafeaSha256(design);
const candidatePackage = buildCandidatePackage();
const topologyReport = buildTopologyReport(candidatePackage.semanticHash);
const candidateValidationEvidence = buildCandidateValidationEvidence(
  candidatePackage.semanticHash,
);
const topologyValidationEvidence = buildTopologyValidationEvidence(
  candidatePackage.semanticHash,
  topologyReport.semanticHash,
);
const input = {
  schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_INPUT_SCHEMA,
  exactHeadSha: head,
  designHash,
  candidatePackage,
  topologyReport,
  candidateValidationEvidence,
  topologyValidationEvidence,
};
const evidence = evaluateLafeaBucket01ProbeStableCandidateIntake(input);
assert.equal(
  evidence.status,
  'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW',
);
assert.equal(evidence.levels.length, 4);
assert.equal(evidence.levels[3].elementCount, 14256);
assert.equal(evidence.expectedLocationCount, 7);
assert.equal(evidence.minimumCandidateNaturalMargin, 0.05);
assert.equal(evidence.authority.candidateRebuildValidationExecuted, true);
assert.equal(evidence.authority.topologyRecomputationExecuted, true);
assert.equal(evidence.authority.mappingWindowRecomputed, true);
assert.equal(evidence.authority.executedRecomputation, true);
assert.equal(evidence.authority.independentCheckerExecution, false);
assert.equal(
  evidence.authority.independentCheckerRequiredBeforeReplayAdjudication,
  true,
);
assert.equal(evidence.authority.productionSwitchAuthorized, false);
assert.equal(evidence.authority.productionSwitchApplied, false);
assert.equal(evidence.authority.productionMeshAuthority, false);
assert.equal(evidence.authority.stressAcceptanceAuthority, false);
assert.equal(evidence.authority.qualificationAuthority, false);
assert.equal(evidence.authority.bucketQualified, false);
assert.equal(
  validateLafeaBucket01ProbeStableCandidateIntakeEvidence(evidence).ok,
  true,
);

const validationNotExecuted = clone(candidateValidationEvidence);
validationNotExecuted.executed = false;
rehash(validationNotExecuted);
assert.throws(
  () => evaluateLafeaBucket01ProbeStableCandidateIntake({
    ...input,
    candidateValidationEvidence: validationNotExecuted,
  }),
  hasCode('LAFEA_B01_PROBE_STABLE_CANDIDATE_VALIDATION_INCOMPLETE'),
);

const mappingNotRecomputed = clone(candidateValidationEvidence);
mappingNotRecomputed.mappingWindowRecomputed = false;
rehash(mappingNotRecomputed);
assert.throws(
  () => evaluateLafeaBucket01ProbeStableCandidateIntake({
    ...input,
    candidateValidationEvidence: mappingNotRecomputed,
  }),
  hasCode('LAFEA_B01_PROBE_STABLE_CANDIDATE_VALIDATION_INCOMPLETE'),
);

const recomputationFlagFalse = clone(candidateValidationEvidence);
recomputationFlagFalse.authority.executedRecomputation = false;
rehash(recomputationFlagFalse);
assert.throws(
  () => evaluateLafeaBucket01ProbeStableCandidateIntake({
    ...input,
    candidateValidationEvidence: recomputationFlagFalse,
  }),
  hasCode('LAFEA_B01_PROBE_STABLE_VALIDATION_RECOMPUTATION_NOT_EXECUTED'),
);

const escalated = clone(candidatePackage);
escalated.authority.productionMeshAuthority = true;
rehash(escalated);
assert.throws(
  () => evaluateLafeaBucket01ProbeStableCandidateIntake({
    ...input,
    candidatePackage: escalated,
  }),
  hasCode('LAFEA_B01_PROBE_STABLE_PACKAGE_AUTHORITY_ESCALATED'),
);

const wrongCount = clone(candidatePackage);
wrongCount.levels[3].elementCount = 13992;
rehash(wrongCount);
assert.throws(
  () => evaluateLafeaBucket01ProbeStableCandidateIntake({
    ...input,
    candidatePackage: wrongCount,
  }),
  hasCode('LAFEA_B01_PROBE_STABLE_PACKAGE_LEVEL_INVALID'),
);

const invalidMappingHash = clone(candidatePackage);
invalidMappingHash.levels[0].mappingWindowHash = 'not-a-hash';
rehash(invalidMappingHash);
assert.throws(
  () => evaluateLafeaBucket01ProbeStableCandidateIntake({
    ...input,
    candidatePackage: invalidMappingHash,
  }),
  hasCode('LAFEA_B01_PROBE_STABLE_INTAKE_HASH_INVALID'),
);

const lowMargin = clone(topologyReport);
lowMargin.levelReports[2].minimumNaturalMargin = 0.049999;
rehash(lowMargin);
assert.throws(
  () => evaluateLafeaBucket01ProbeStableCandidateIntake({
    ...input,
    topologyReport: lowMargin,
  }),
  hasCode('LAFEA_B01_PROBE_STABLE_TOPOLOGY_MARGIN_INADEQUATE'),
);

const custodyMismatch = clone(candidatePackage);
custodyMismatch.exactHeadSha = 'b'.repeat(40);
rehash(custodyMismatch);
assert.throws(
  () => evaluateLafeaBucket01ProbeStableCandidateIntake({
    ...input,
    candidatePackage: custodyMismatch,
  }),
  hasCode('LAFEA_B01_PROBE_STABLE_PACKAGE_CUSTODY_MISMATCH'),
);

const hashTamper = clone(candidatePackage);
hashTamper.levels[0].meshHash = `sha256:${'9'.repeat(64)}`;
assert.throws(
  () => evaluateLafeaBucket01ProbeStableCandidateIntake({
    ...input,
    candidatePackage: hashTamper,
  }),
  hasCode('LAFEA_B01_PROBE_STABLE_PACKAGE_HASH_TAMPERED'),
);

for (const sourcePath of [
  '../src/workspace/lafea-lug-pinhole-mesh-ladder.js',
  './lafea-bucket-01-production-replay.mjs',
  '../src/workspace/lafea-lug-pinhole-physical-problem-batch.js',
]) {
  const source = fs.readFileSync(new URL(sourcePath, import.meta.url), 'utf8');
  assert.equal(
    source.includes('generateLafeaLugPinholeProbeStableT6MeshV3'),
    false,
    `${sourcePath} prematurely imports Design V3 candidate generator`,
  );
  assert.equal(
    source.includes(LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_PACKAGE_SCHEMA),
    false,
    `${sourcePath} prematurely consumes candidate package`,
  );
}

console.log(
  'PASS LAFEA Bucket-01 Design V3 candidate intake contract checks',
);

function buildCandidatePackage() {
  const counts = [
    [1, 12, 20, 480],
    [2, 17, 35, 1190],
    [3, 30, 68, 4080],
    [4, 54, 132, 14256],
  ];
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_PACKAGE_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-CANDIDATE.3',
    exactHeadSha: head,
    designHash,
    levels: counts.map(([
      ordinal,
      radialCellCount,
      circumferentialCellCount,
      elementCount,
    ]) => ({
      ordinal,
      radialCellCount,
      circumferentialCellCount,
      elementCount,
      meshHash: syntheticHash(`mesh-${ordinal}`),
      radialCoordinateHash: syntheticHash(`radial-${ordinal}`),
      circumferentialCoordinateHash: syntheticHash(`angle-${ordinal}`),
      featureSetHash: syntheticHash(`feature-${ordinal}`),
      qualityHash: syntheticHash(`quality-${ordinal}`),
      mappingWindowHash: syntheticHash(`mapping-window-${ordinal}`),
      status: 'PASS',
    })),
    status: 'PASS',
    reasons: [],
    authority: {
      candidateOnly: true,
      solverExecuted: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return { ...base, semanticHash: canonicalLafeaSha256(base) };
}

function buildTopologyReport(candidatePackageHash) {
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_TOPOLOGY_REPORT_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-TOPOLOGY.3',
    exactHeadSha: head,
    designHash,
    candidatePackageHash,
    locationCount: 7,
    levelReports: [1, 2, 3, 4].map((ordinal) => ({
      ordinal,
      locationCount: 7,
      allLocationsUnique: true,
      allCoordinatesFrozen: true,
      allContainingElementsUnique: true,
      allJacobiansPositive: true,
      allTriangleSidesStable: true,
      allOrientationsStable: true,
      allLineagesCompatible: true,
      allOffNodesEdgesDiagonals: true,
      minimumNaturalMargin: 0.1,
      naturalCoordinateDriftReported: true,
      status: 'PASS',
    })),
    status: 'PASS',
    reasons: [],
    authority: {
      candidateTopologyProof: true,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return { ...base, semanticHash: canonicalLafeaSha256(base) };
}

function buildCandidateValidationEvidence(candidatePackageHash) {
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_VALIDATION_EVIDENCE_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-CANDIDATE-RECOMPUTATION.3',
    exactHeadSha: head,
    designHash,
    candidatePackageHash,
    executed: true,
    meshPackageRebuilt: true,
    coordinateHashesRebuilt: true,
    featureSetHashesRebuilt: true,
    qualityHashesRebuilt: true,
    mappingWindowRecomputed: true,
    status: 'PASS',
    reasons: [],
    authority: validationAuthority(),
  };
  return { ...base, semanticHash: canonicalLafeaSha256(base) };
}

function buildTopologyValidationEvidence(candidatePackageHash,
  topologyReportHash) {
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_TOPOLOGY_VALIDATION_EVIDENCE_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-TOPOLOGY-RECOMPUTATION.3',
    exactHeadSha: head,
    designHash,
    candidatePackageHash,
    topologyReportHash,
    executed: true,
    locationRecordsRebuilt: true,
    topologyAssertionsRecomputed: true,
    status: 'PASS',
    reasons: [],
    authority: validationAuthority(),
  };
  return { ...base, semanticHash: canonicalLafeaSha256(base) };
}

function validationAuthority() {
  return {
    executedRecomputation: true,
    independentCheckerExecution: false,
    productionSwitchApplied: false,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  };
}

function syntheticHash(label) {
  return canonicalLafeaSha256({
    schema: 'synthetic-hash-input/v1',
    label,
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rehash(value) {
  delete value.semanticHash;
  value.semanticHash = canonicalLafeaSha256(value);
  return value;
}

function hasCode(code) {
  return (error) => error?.code === code;
}
