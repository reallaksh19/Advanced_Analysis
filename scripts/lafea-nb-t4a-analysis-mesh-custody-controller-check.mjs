#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROFILE_KINDS, canonicalProfile } from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import {
  createLafeaAnalysisMeshCustodyController,
} from '../src/workspace/lafea-analysis-mesh-custody-controller.js';
import {
  buildAnalysisMeshCustodyProjection,
} from '../src/workspace/lafea-analysis-mesh-custody-projection.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';

const STAGE = 'LAFEA.3';
const SOURCE = hash('SOURCE');
const MODEL = hash('MODEL');
const GEOMETRY = hash('GEOMETRY');
const PROFILE = meshProfile();
const first = evidence('MESH-A', 100);
const second = evidence('MESH-B', 80);

let stage = stageState(lifecycleWithGeometry());
let commits = 0;
let publications = 0;
const controller = createLafeaAnalysisMeshCustodyController({
  getActiveStageId: () => STAGE,
  readStageState: () => stage,
  commitStageState: (stageId, next, expectedVersion) => {
    assert.equal(stageId, STAGE);
    assert.equal(expectedVersion, stage.analysisMeshCustodyVersion);
    commits += 1;
    stage = Object.freeze({
      ...next,
      analysisMeshCustodyVersion: expectedVersion + 1,
    });
  },
  publish: () => { publications += 1; },
});

let result = controller.registerAnalysisMeshEvidence(first);
assert.equal(result.changed, true);
assert.equal(result.projection.state, 'CURRENT_PASS');
assert.equal(commits, 1);
assert.equal(publications, 1);
assert.equal(stage.lifecycle.artifacts.ANALYSIS_MESH.artifactHash, first.artifactHash);
assert.equal(stage.retainedAnalysisMeshEvidence.artifactHash, first.artifactHash);
assert.equal(stage.analysisMeshProfileHash, first.meshProfileHash);
assert.ok(Object.isFrozen(stage.retainedAnalysisMeshEvidence));

result = controller.registerAnalysisMeshEvidence(first);
assert.equal(result.changed, false);
assert.equal(commits, 1);
assert.equal(publications, 1);
assert.throws(
  () => controller.registerAnalysisMeshEvidence(second),
  (error) => error?.code === 'LAFEA_ANALYSIS_MESH_CONFLICTING_REPLAY',
);
assert.equal(commits, 1);

const exported = controller.exportAnalysisMeshEvidence(STAGE);
assert.deepEqual(exported, first);
assert.equal(JSON.stringify(exported), JSON.stringify(
  controller.exportAnalysisMeshEvidence(STAGE),
));
assert.ok(Object.isFrozen(exported));
assert.deepEqual(controller.selectRetainedAnalysisMeshEvidence(STAGE), first);

const staleProjection = buildAnalysisMeshCustodyProjection({
  ...stage,
  lifecycleBinding: { status: 'STALE_DOCUMENT_REVISION' },
}, first);
assert.equal(staleProjection.state, 'STALE');
assert.equal(staleProjection.canView, true);
assert.equal(staleProjection.usableForRun, false);

let recoveredStage = stageState(createLafeaLifecycle(STAGE, SOURCE), null);
let recoveryCommits = 0;
const recovery = createLafeaAnalysisMeshCustodyController({
  getActiveStageId: () => STAGE,
  readStageState: () => recoveredStage,
  commitStageState: (_stageId, next, version) => {
    recoveryCommits += 1;
    recoveredStage = Object.freeze({
      ...next,
      analysisMeshCustodyVersion: version + 1,
    });
  },
});
result = recovery.recoverAnalysisMeshEvidence(first);
assert.equal(result.changed, true);
assert.equal(result.projection.state, 'STALE');
assert.equal(recoveredStage.lifecycle.artifacts.ANALYSIS_MESH.status, 'ABSENT');
assert.equal(recoveryCommits, 1);
result = recovery.recoverAnalysisMeshEvidence(first);
assert.equal(result.changed, false);
assert.equal(recoveryCommits, 1);
assert.throws(
  () => recovery.recoverAnalysisMeshEvidence(second),
  (error) => error?.code === 'LAFEA_ANALYSIS_MESH_RECOVERY_CONFLICTING_REPLAY',
);

const noProfile = createController(stageState(lifecycleWithGeometry(), null, null));
assert.throws(
  () => noProfile.registerAnalysisMeshEvidence(first),
  (error) => error?.code === 'LAFEA_ANALYSIS_MESH_PROFILE_BINDING_REQUIRED',
);

const tampered = structuredClone(first);
tampered.quality.elementCount = 99;
assert.throws(
  () => recovery.recoverAnalysisMeshEvidence(tampered),
  (error) => error?.code === 'LAFEA_ANALYSIS_MESH_EVIDENCE_TAMPERED',
);

let failedStage = stageState(lifecycleWithGeometry());
const commitFailure = createLafeaAnalysisMeshCustodyController({
  getActiveStageId: () => STAGE,
  readStageState: () => failedStage,
  commitStageState: () => { throw new Error('COMMIT_FAILED'); },
});
assert.throws(() => commitFailure.registerAnalysisMeshEvidence(first), /COMMIT_FAILED/u);
assert.equal(failedStage.retainedAnalysisMeshEvidence, null);
assert.equal(failedStage.lifecycle.artifacts.ANALYSIS_MESH.status, 'ABSENT');

let activeStage = STAGE;
const stageSwitch = createLafeaAnalysisMeshCustodyController({
  getActiveStageId: () => activeStage,
  readStageState: () => stageState(lifecycleWithGeometry()),
  commitStageState: () => { throw new Error('MUST_NOT_COMMIT'); },
});
activeStage = 'LAFEA.4';
assert.throws(
  () => stageSwitch.registerAnalysisMeshEvidence(first),
  (error) => error?.code === 'LAFEA_ANALYSIS_MESH_ACTIVE_STAGE_MISMATCH',
);

let subscriberStage = stageState(lifecycleWithGeometry());
const subscriberFailure = createLafeaAnalysisMeshCustodyController({
  getActiveStageId: () => STAGE,
  readStageState: () => subscriberStage,
  commitStageState: (_stageId, next, version) => {
    subscriberStage = Object.freeze({
      ...next,
      analysisMeshCustodyVersion: version + 1,
    });
  },
  publish: () => { throw new Error('SUBSCRIBER_FAILED'); },
});
assert.doesNotThrow(() => subscriberFailure.registerAnalysisMeshEvidence(first));
assert.equal(subscriberStage.retainedAnalysisMeshEvidence.artifactHash, first.artifactHash);

for (const path of [
  'src/workspace/lafea-analysis-mesh-custody-controller.js',
  'src/workspace/lafea-analysis-mesh-custody-projection.js',
  'src/workspace/lafea-analysis-mesh-evidence-validator.js',
  'scripts/lafea-nb-t4a-analysis-mesh-custody-controller-check.mjs',
]) {
  assert.ok(fs.readFileSync(path, 'utf8').split('\n').length < 300,
    `${path} exceeds 300 lines`);
}

console.log(JSON.stringify({
  check: 'lafea-nb-t4a-analysis-mesh-custody-controller',
  status: 'PASS',
  atomicStagePointerSwap: true,
  onePublicationPerChangedCommand: true,
  exactReplayIdempotent: true,
  conflictingReplayFailClosed: true,
  explicitProfileBindingRequired: true,
  staleRecoveryAuditOnly: true,
  stageSwitchFailsClosed: true,
  subscriberFailureIsolated: true,
  moduleLineLimitExclusive: 300,
}));

function createController(initialStage) {
  return createLafeaAnalysisMeshCustodyController({
    getActiveStageId: () => STAGE,
    readStageState: () => initialStage,
    commitStageState: () => { throw new Error('UNEXPECTED_COMMIT'); },
  });
}

function stageState(lifecycle, retained = null, profileHash = PROFILE.semanticHash) {
  return Object.freeze({
    stageId: STAGE,
    lifecycle,
    lifecycleBinding: Object.freeze({ status: 'CURRENT' }),
    sourceAuthority: null,
    analysisMeshCustodyVersion: 0,
    analysisMeshProfileHash: profileHash,
    retainedAnalysisMeshEvidence: retained,
    lastAnalysisMeshCustodyAction: null,
  });
}

function lifecycleWithGeometry() {
  let lifecycle = createLafeaLifecycle(STAGE, SOURCE);
  lifecycle = registerLafeaArtifact(lifecycle, createLafeaArtifactRecord({
    stageId: STAGE, kind: 'CANONICAL_MODEL', status: 'CURRENT',
    artifactHash: MODEL, parentHashes: { sourceHash: SOURCE },
    qualification: 'PASS', producerRef: 'WP-MC1/MODEL', diagnostics: [],
  }), 'WP-MC1-MODEL');
  return registerLafeaArtifact(lifecycle, createLafeaArtifactRecord({
    stageId: STAGE, kind: 'ANALYSIS_GEOMETRY', status: 'CURRENT',
    artifactHash: GEOMETRY,
    parentHashes: { sourceHash: SOURCE, canonicalModelHash: MODEL },
    qualification: 'PASS', producerRef: 'WP-MC1/GEOMETRY', diagnostics: [],
  }), 'WP-MC1-GEOMETRY');
}

function evidence(meshIdentity, size) {
  const mesh = {
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity,
    nodes: [
      { nodeId: 'N1', x: 0, y: 0, z: 0 },
      { nodeId: 'N2', x: size, y: 0, z: 0 },
      { nodeId: 'N3', x: 0, y: size, z: 0 },
    ],
    elements: [
      { elementId: 'E1', elementType: 'T3', nodeIds: ['N1', 'N2', 'N3'] },
    ],
  };
  const meshHash = lafeaAnalysisMeshContentHash(mesh);
  return createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: STAGE, sourceHash: SOURCE, canonicalModelHash: MODEL,
    analysisGeometryHash: GEOMETRY, meshProfile: PROFILE, mesh,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId: STAGE, authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: `WP-MC1/${meshIdentity}`,
      sourceHash: SOURCE, canonicalModelHash: MODEL,
      analysisGeometryHash: GEOMETRY,
      meshProfileHash: PROFILE.semanticHash, meshHash,
    },
  });
}

function meshProfile() {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: 'WP-MC1-T3',
    sourceRevision: '1',
    fields: {
      continuumElement: 'T3',
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize: 25, adjacentSizeRatioMax: 1.5,
      aspectRatioWarn: 3, aspectRatioBlock: 6,
      scaledJacobianWarn: 0.3, scaledJacobianBlock: 0.1,
      adaptiveLevels: 3,
    },
    semanticHash: undefined,
  });
}

function hash(value) {
  return canonicalLafeaSha256({ schema: 'wp-mc1-test-hash/v1', value });
}
