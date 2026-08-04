#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  artifact,
  axisPlan,
  buildPackage,
  candidateIntakeFixture,
  designFixture,
  hasCode,
  hashed,
  manifestDefinition,
  probeSpecFixture,
  productionSpecFixture,
  refreshPackage,
  rehash,
  rehashArtifact,
  syncLevelCase,
} from './lafea-bucket-01-independent-candidate-verification-fixture.mjs';
import {
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA,
  evaluateLafeaBucket01IndependentCandidateVerification,
  recomputeLafeaBucket01IndependentCandidateQuality,
  validateLafeaBucket01IndependentCandidateVerification,
} from '../src/workspace/lafea-bucket-01-independent-candidate-verification.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const head = 'a'.repeat(40);
const candidateHead = 'b'.repeat(40);
const design = designFixture();
const probeSpec = probeSpecFixture();
const productionSpec = productionSpecFixture();
const radialPlan = axisPlan(design.radialAxis, 20, 100, design);
const angularPlan = axisPlan(design.circumferentialAxis, 0, 360, design);
const levelPackages = radialPlan.levels.map((radial, index) => buildPackage(
  radial,
  angularPlan.levels[index],
  design,
));
assert.deepEqual(levelPackages.map((row) => row.mesh.elements.length), [480, 1190, 4080, 14256]);

const designHash = canonicalLafeaSha256(design);
const designArtifact = artifact({
  artifactId: 'design', role: 'DESIGN', relativePath: 'validation/design.json',
  payload: design, parentArtifactHashes: [],
});
const probeArtifact = artifact({
  artifactId: 'probe', role: 'FROZEN_PROBE_SPEC', relativePath: 'validation/probe.json',
  payload: probeSpec, parentArtifactHashes: [designHash],
});
const productionArtifact = artifact({
  artifactId: 'production', role: 'PRODUCTION_RESPONSE_SPEC',
  relativePath: 'validation/production.json', payload: productionSpec,
  parentArtifactHashes: [designHash],
});
const levelArtifacts = levelPackages.map((payload, index) => artifact({
  artifactId: `level-${index + 1}`,
  role: `CANDIDATE_LEVEL_${index + 1}`,
  relativePath: `reports/level-${index + 1}.json`,
  payload, levelOrdinal: index + 1, parentArtifactHashes: [designHash],
}));
const candidateIntake = candidateIntakeFixture(levelPackages, designHash);
const candidateIntakeArtifact = artifact({
  artifactId: 'candidate-intake', role: 'CANDIDATE_INTAKE_EVIDENCE',
  relativePath: 'reports/candidate-intake.json', payload: candidateIntake,
  parentArtifactHashes: levelPackages.map((row) => row.semanticHash),
});
const boundArtifacts = [
  candidateIntakeArtifact, designArtifact, probeArtifact, productionArtifact,
  ...levelArtifacts,
];
const suppliedManifest = hashed({
  schema: 'lafea-bucket-01-phase-3a-supplied-artifact-manifest/v1',
  producerRevision: 'TEST-PHASE-3A-MANIFEST.1',
  exactHeadSha: candidateHead,
  designHash,
  artifacts: boundArtifacts.map(manifestDefinition),
  authority: {
    productionSwitchAuthorized: false,
    qualificationAuthority: false,
    bucketQualified: false,
  },
});
const replayArtifactManifestArtifact = artifact({
  artifactId: 'replay-artifact-manifest',
  artifactScope: 'REPOSITORY_REGRESSION',
  role: 'REPLAY_ARTIFACT_MANIFEST',
  relativePath: 'reports/replay-artifact-manifest.json',
  payload: suppliedManifest, parentArtifactHashes: [candidateIntake.semanticHash],
});
const input = {
  schema: LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA,
  verificationHeadSha: head,
  candidateArtifactHeadSha: candidateHead,
  mergeBaseSha: candidateHead,
  candidateArtifactHeadIsAncestor: true,
  replayArtifactManifestArtifact,
  candidateIntakeEvidenceArtifact: candidateIntakeArtifact,
  designArtifact,
  probeSpecArtifact: probeArtifact,
  productionResponseSpecArtifact: productionArtifact,
  levelArtifacts,
};
const result = evaluateLafeaBucket01IndependentCandidateVerification(input);
assert.equal(result.evidence.status, 'PASS');
assert.equal(result.evidence.levels.length, 4);
assert.equal(result.evidence.locationHistories.length, 7);
assert.equal(result.evidence.authority.executedRecomputation, true);
assert.equal(result.evidence.authority.independentCheckerExecution, true);
assert.equal(result.evidence.authority.productionSwitchAuthorized, false);
assert.equal(result.evidence.authority.qualificationAuthority, false);
assert.equal(result.evidence.authority.bucketQualified, false);
assert.equal(result.evidence.levels.every((row) => row.edgePolicy.accepted), true);
assert.equal(result.evidence.levels.every((row) => row.quality.minimumDenseJacobian > 0), true);
assert.equal(result.evidence.locationHistories.every((row) => row.status === 'PASS'), true);
assert.equal(result.evidence.levels.every((row) => row.loadWindow.exactStart), true);
assert.equal(result.evidence.levels.every((row) => row.loadWindow.exactEnd), true);
assert.equal(result.evidence.levels.every((row) => row.restraintWindow.exactEnd), true);
assert.deepEqual(result.evidence.reasons, []);
assert.equal(
  validateLafeaBucket01IndependentCandidateVerification(
    result.evidence,
    result.artifactManifest,
  ).ok,
  true,
);

const rawTamper = structuredClone(input);
rawTamper.levelArtifacts[0].computedRawFileHash = `sha256:${'0'.repeat(64)}`;
assert.throws(
  () => evaluateLafeaBucket01IndependentCandidateVerification(rawTamper),
  hasCode('LAFEA_B01_INDEPENDENT_RAW_FILE_HASH_MISMATCH'),
);

const ancestryTamper = structuredClone(input);
ancestryTamper.candidateArtifactHeadIsAncestor = false;
assert.throws(
  () => evaluateLafeaBucket01IndependentCandidateVerification(ancestryTamper),
  hasCode('LAFEA_B01_INDEPENDENT_ANCESTRY_INVALID'),
);

const manifestTamper = structuredClone(input);
manifestTamper.replayArtifactManifestArtifact.payload.artifacts[0].rawFileHash = `sha256:${'1'.repeat(64)}`;
rehash(manifestTamper.replayArtifactManifestArtifact.payload);
rehashArtifact(manifestTamper.replayArtifactManifestArtifact);
assert.throws(
  () => evaluateLafeaBucket01IndependentCandidateVerification(manifestTamper),
  hasCode('LAFEA_B01_INDEPENDENT_SUPPLIED_MANIFEST_CUSTODY_MISMATCH'),
);

const alteredMesh = structuredClone(input);
alteredMesh.levelArtifacts[0].payload.mesh.nodes[0].x += 0.01;
syncLevelCase(alteredMesh, 0, false);
assert.throws(
  () => evaluateLafeaBucket01IndependentCandidateVerification(alteredMesh),
  hasCode('LAFEA_B01_INDEPENDENT_PACKAGE_COMPONENT_HASH_MISMATCH'),
);

const curvedInternal = structuredClone(input);
const curvedPackage = curvedInternal.levelArtifacts[0].payload;
const internalMid = curvedPackage.mesh.nodes.find((row) => {
  const match = /^M-C-R(?<ringA>\d+)-S\d+--C-R(?<ringB>\d+)-S\d+$/u.exec(row.nodeId);
  return match && match.groups.ringA === match.groups.ringB
    && Number(match.groups.ringA) > 0
    && Number(match.groups.ringA) < curvedPackage.spec.radialAxis.coordinates.length - 1;
});
assert.ok(internalMid);
internalMid.x += 0.01;
refreshPackage(curvedPackage);
syncLevelCase(curvedInternal, 0, true);
const curvedResult = evaluateLafeaBucket01IndependentCandidateVerification(curvedInternal);
assert.equal(curvedResult.evidence.status, 'BLOCKED');
assert.ok(curvedResult.evidence.reasons.includes('LEVEL_1_MIDSIDE_POLICY_BLOCKED'));

const chordalBoundary = structuredClone(input);
const boundaryPackage = chordalBoundary.levelArtifacts[0].payload;
const boundaryMid = boundaryPackage.mesh.nodes.find((row) =>
  row.nodeId.startsWith('M-C-R0-')
    && row.nodeId.includes('--C-R0-'));
assert.ok(boundaryMid);
const boundaryIds = /^M-(C-R\d+-S\d+)--(C-R\d+-S\d+)$/u.exec(boundaryMid.nodeId);
const boundaryNodes = new Map(boundaryPackage.mesh.nodes.map((row) => [row.nodeId, row]));
const boundaryA = boundaryNodes.get(boundaryIds[1]);
const boundaryB = boundaryNodes.get(boundaryIds[2]);
boundaryMid.x = (boundaryA.x + boundaryB.x) / 2;
boundaryMid.y = (boundaryA.y + boundaryB.y) / 2;
refreshPackage(boundaryPackage);
syncLevelCase(chordalBoundary, 0, true);
const boundaryResult = evaluateLafeaBucket01IndependentCandidateVerification(chordalBoundary);
assert.equal(boundaryResult.evidence.status, 'BLOCKED');
assert.ok(boundaryResult.evidence.reasons.includes('LEVEL_1_MIDSIDE_POLICY_BLOCKED'));

const missingBreakpoint = structuredClone(input);
missingBreakpoint.levelArtifacts[0].payload.spec.radialAxis.coordinates =
  missingBreakpoint.levelArtifacts[0].payload.spec.radialAxis.coordinates
    .map((row) => row === 60 ? 60.01 : row);
syncLevelCase(missingBreakpoint, 0, false);
assert.throws(
  () => evaluateLafeaBucket01IndependentCandidateVerification(missingBreakpoint),
  hasCode('LAFEA_B01_INDEPENDENT_PACKAGE_IDENTITY_INVALID'),
);

const mappingTamper = structuredClone(input);
mappingTamper.levelArtifacts[0].payload.mappingWindow.loadNodeIds =
  mappingTamper.levelArtifacts[0].payload.mappingWindow.loadNodeIds.slice(2);
refreshPackage(mappingTamper.levelArtifacts[0].payload, true);
syncLevelCase(mappingTamper, 0, true);
assert.throws(
  () => evaluateLafeaBucket01IndependentCandidateVerification(mappingTamper),
  hasCode('LAFEA_B01_INDEPENDENT_MAPPING_WINDOW_MISMATCH'),
);

const staleArtifact = structuredClone(input);
staleArtifact.levelArtifacts[0].exactHeadSha = head;
const staleDefinition = staleArtifact.replayArtifactManifestArtifact.payload.artifacts
  .find((row) => row.artifactId === staleArtifact.levelArtifacts[0].artifactId);
staleDefinition.exactHeadSha = head;
rehash(staleArtifact.replayArtifactManifestArtifact.payload);
rehashArtifact(staleArtifact.replayArtifactManifestArtifact);
assert.throws(
  () => evaluateLafeaBucket01IndependentCandidateVerification(staleArtifact),
  hasCode('LAFEA_B01_INDEPENDENT_ARTIFACT_HEAD_OR_DESIGN_STALE'),
);

const authorityEscalation = structuredClone(input);
authorityEscalation.levelArtifacts[0].payload.authority.productionMeshAuthority = true;
refreshPackage(authorityEscalation.levelArtifacts[0].payload, false);
syncLevelCase(authorityEscalation, 0, true);
assert.throws(
  () => evaluateLafeaBucket01IndependentCandidateVerification(authorityEscalation),
  hasCode('LAFEA_B01_INDEPENDENT_PACKAGE_AUTHORITY_ESCALATED'),
);

const source = fs.readFileSync(
  new URL('../src/workspace/lafea-bucket-01-independent-candidate-verification.js', import.meta.url),
  'utf8',
);
for (const forbidden of [
  'generateLafeaLugPinholeProbeStableT6Mesh',
  'validateLafeaLugPinholeProbeStableT6Mesh',
  'observeLafeaLugPinholeProbeStableT6Topology',
  'transformInternalCircumferentialMidsides',
]) {
  assert.equal(source.includes(forbidden), false, `independent checker imports/calls ${forbidden}`);
}

console.log(JSON.stringify({
  schema: 'lafea-bucket-01-independent-candidate-verification-contract-check/v1',
  status: 'PASS',
  candidateDisposition: result.evidence.status,
  verifiedBoundary: 'EXACT_20_60_WINDOW_REPRESENTED_AT_ALL_LEVELS',
  levelElementCounts: result.evidence.levels.map((row) => row.elementCount),
  exactWindowByLevel: result.evidence.levels.map((row) => ({ ordinal: row.ordinal, load: row.loadWindow.exactWindow, restraint: row.restraintWindow.exactWindow, lower: row.loadWindow.lowerBoundingRadius, upper: row.loadWindow.upperBoundingRadius })),
  minimumNaturalMargins: result.evidence.locationHistories.map((row) => row.minimumNaturalMargin),
  negativeCases: {
    rawHashTamperBlocked: true,
    ancestryTamperBlocked: true,
    manifestCustodyTamperBlocked: true,
    alteredMeshHashBlocked: true,
    curvedInternalMidsideBlocked: true,
    chordalPhysicalBoundaryMidsideBlocked: true,
    missingSixtyMillimetreBreakpointBlocked: true,
    incorrectMappingWindowBlocked: true,
    staleArtifactHeadBlocked: true,
    authorityEscalationBlocked: true,
    forbiddenHelperCallsAbsent: true,
  },
  authority: result.evidence.authority,
}, null, 2));
