#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { triangleSource } from './lafea.3-fixtures.mjs';
import { PROFILE_KINDS, canonicalProfile } from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import {
  LAFEA_ANALYSIS_MESH_CUSTODY_PROJECTION_SCHEMA,
  createLafeaWorkbenchStore,
} from '../src/workspace/lafea-lifecycle-workbench-store.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  createLafeaArtifactRecord,
  createLafeaLifecycleEvent,
} from '../src/workspace/lafea-lifecycle.js';
import { issueLafeaSourceAuthority } from '../src/workspace/lafea-source-authority.js';
const STAGE = 'LAFEA.3';
const DOCUMENT = triangleSource();
const SOURCE = issueLafeaSourceAuthority(STAGE, DOCUMENT, 'WP-MC1/LIVE').sourceHash;
const MODEL = hash('MODEL');
const GEOMETRY = hash('GEOMETRY');
const PROFILE = meshProfile();
const EVIDENCE = evidence('LIVE-MESH', 100);
const CONFLICT = evidence('CONFLICT-MESH', 80);
const store = createLafeaWorkbenchStore({
  initialStage: STAGE,
  initialDocument: DOCUMENT,
});
assert.equal(typeof store.registerAnalysisMeshEvidence, 'function');
assert.equal(typeof store.recoverAnalysisMeshEvidence, 'function');
assert.equal(store.getState().stages[STAGE].analysisMeshCustodyProjection.state, 'ABSENT');
preparePrerequisites(store);
let publications = 0;
const snapshots = [];
store.subscribe((state) => {
  publications += 1;
  snapshots.push(state.stages[STAGE]);
});
let result = store.registerAnalysisMeshEvidence(EVIDENCE);
assert.equal(result.changed, true);
assert.equal(publications, 1);
assert.equal(snapshots[0].analysisMeshCustodyProjection.state, 'CURRENT_PASS');
assert.equal(
  snapshots[0].lifecycle.artifacts.ANALYSIS_MESH.artifactHash,
  EVIDENCE.artifactHash,
);
assert.equal(
  snapshots[0].retainedAnalysisMeshEvidence.artifactHash,
  EVIDENCE.artifactHash,
);
let stage = store.getState().stages[STAGE];
const projection = stage.analysisMeshCustodyProjection;
assert.equal(projection.schema, LAFEA_ANALYSIS_MESH_CUSTODY_PROJECTION_SCHEMA);
assert.equal(projection.usableForAdvance, true);
assert.equal(projection.usableForAuthorization, true);
assert.equal(projection.usableForRun, true);
assert.equal(projection.advancePolicy, 'ALLOW');
assert.equal(projection.meshIdentity, 'LIVE-MESH');
assert.equal(projection.meshHash, EVIDENCE.meshHash);
assert.equal(projection.meshProfileIdentity, PROFILE.profileIdentity);
assert.equal(projection.meshProfileHash, PROFILE.semanticHash);
assert.equal(projection.sourceHash, SOURCE);
assert.equal(projection.canonicalModelHash, MODEL);
assert.equal(projection.analysisGeometryHash, GEOMETRY);
assert.equal(projection.artifactHash, EVIDENCE.artifactHash);
assert.equal(projection.registrationId, EVIDENCE.registrationId);
assert.equal(projection.producerRef, EVIDENCE.authority.producerRef);
assert.equal(projection.nodeCount, 3);
assert.equal(projection.elementCount, 1);
assert.ok(Object.isFrozen(projection));
result = store.registerAnalysisMeshEvidence(EVIDENCE);
assert.equal(result.changed, false);
assert.equal(publications, 1);
assert.throws(
  () => store.registerAnalysisMeshEvidence(CONFLICT),
  (error) => error?.code === 'LAFEA_ANALYSIS_MESH_CONFLICTING_REPLAY',
);
assert.equal(publications, 1);
const exported = store.exportAnalysisMeshEvidence(STAGE);
assert.deepEqual(exported, EVIDENCE);
assert.equal(JSON.stringify(exported), JSON.stringify(
  store.exportAnalysisMeshEvidence(STAGE),
));
assert.ok(Object.isFrozen(exported));
store.selectStage('LAFEA.4');
store.selectStage(STAGE);
assert.equal(
  store.selectRetainedAnalysisMeshEvidence(STAGE).artifactHash,
  EVIDENCE.artifactHash,
);
const nodeB = store.getState().stages[STAGE].document.nodes
  .find((row) => row.nodeId === 'B');
store.setScalar(
  'LAFEA.3.node.x',
  'B',
  String(nodeB.x + 25),
  'WP-MC1/LIVE',
);
stage = store.getState().stages[STAGE];
assert.equal(stage.analysisMeshCustodyProjection.state, 'STALE');
assert.ok(stage.analysisMeshCustodyProjection.staleReasons
  .includes('SOURCE_BINDING_STALE'));
store.undo();
stage = store.getState().stages[STAGE];
assert.equal(stage.analysisMeshCustodyProjection.state, 'STALE');
assert.equal(stage.analysisMeshCustodyProjection.usableForRun, false);
const replacementProfileHash = hash('REPLACEMENT-PROFILE');
bindProfile(store, replacementProfileHash, 'WP-MC1-PROFILE-CHANGE');
stage = store.getState().stages[STAGE];
assert.equal(stage.analysisMeshProfileHash, replacementProfileHash);
assert.ok(stage.analysisMeshCustodyProjection.staleReasons
  .includes('MESH_PROFILE_BINDING_STALE'));
assert.throws(
  () => store.registerAnalysisMeshEvidence(EVIDENCE),
  (error) => error?.code === 'LAFEA_ANALYSIS_MESH_PROFILE_BINDING_MISMATCH',
);
result = store.recoverAnalysisMeshEvidence(EVIDENCE);
assert.equal(result.changed, false);
assert.equal(store.getState().stages[STAGE].analysisMeshProfileHash,
  replacementProfileHash);
store.destroy();
const recovery = createLafeaWorkbenchStore({
  initialStage: STAGE,
  initialDocument: DOCUMENT,
});
let recoveryPublications = 0;
recovery.subscribe(() => { recoveryPublications += 1; });
const serialized = JSON.parse(JSON.stringify(exported));
result = recovery.recoverAnalysisMeshEvidence(serialized);
assert.equal(result.changed, true);
assert.equal(result.projection.state, 'STALE');
assert.deepEqual(result.projection.staleReasons, ['LIFECYCLE_NOT_INITIALIZED']);
assert.equal(recoveryPublications, 1);
preparePrerequisites(recovery, 'WP-MC1/RECOVERY');
result = recovery.recoverAnalysisMeshEvidence(serialized);
assert.equal(result.changed, true);
assert.equal(result.projection.state, 'CURRENT_PASS');
assert.equal(
  recovery.getState().stages[STAGE].lifecycle.artifacts.ANALYSIS_MESH.status,
  'CURRENT',
);
recovery.destroy();

const lifecycleOnly = createLafeaWorkbenchStore({
  initialStage: STAGE,
  initialDocument: DOCUMENT,
});
preparePrerequisites(lifecycleOnly, 'WP-MC1/LIFECYCLE-ONLY');
lifecycleOnly.registerLifecycleArtifact(
  EVIDENCE.artifactRecord,
  EVIDENCE.registrationId,
);
stage = lifecycleOnly.getState().stages[STAGE];
assert.equal(stage.analysisMeshCustodyProjection.state, 'ABSENT');
assert.equal(stage.analysisMeshCustodyProjection.absenceReasons[0],
  'LIFECYCLE_MESH_HAS_NO_RETAINED_EVIDENCE');
result = lifecycleOnly.recoverAnalysisMeshEvidence(serialized);
assert.equal(result.projection.state, 'CURRENT_PASS');
lifecycleOnly.destroy();

const noProfile = createLafeaWorkbenchStore({
  initialStage: STAGE,
  initialDocument: DOCUMENT,
});
noProfile.initializeLifecycle(SOURCE, 'WP-MC1/NO-PROFILE');
noProfile.registerLifecycleArtifact(modelRecord(), 'WP-MC1-NP-MODEL');
noProfile.registerLifecycleArtifact(geometryRecord(), 'WP-MC1-NP-GEOMETRY');
assert.throws(
  () => noProfile.registerAnalysisMeshEvidence(EVIDENCE),
  (error) => error?.code === 'LAFEA_ANALYSIS_MESH_PROFILE_BINDING_REQUIRED',
);
noProfile.destroy();

for (const path of [
  'src/workspace/lafea-analysis-mesh-custody.js',
  'src/workspace/lafea-analysis-mesh-custody-controller.js',
  'src/workspace/lafea-analysis-mesh-custody-projection.js',
  'src/workspace/lafea-analysis-mesh-evidence-validator.js',
  'src/workspace/lafea-analysis-mesh-workbench-store.js',
  'src/workspace/lafea-lifecycle-workbench-store.js',
  'src/workspace/lafea-lifecycle-workbench-store-core.js',
  'src/workspace/lafea-workbench-readiness.js',
  'src/workspace/lafea-workbench-controller.js',
  'src/workspace/lafea-workbench.js',
  'scripts/lafea-nb-t4a-analysis-mesh-custody-check.mjs',
  'scripts/lafea-nb-t4a-analysis-mesh-custody-controller-check.mjs',
  'scripts/lafea-nb-t4a-analysis-mesh-live-store-check.mjs',
]) assert.ok(fs.readFileSync(path, 'utf8').trimEnd().split('\n').length < 300,
  `${path} exceeds limit`);

console.log(JSON.stringify({
  check: 'lafea-nb-t4a-analysis-mesh-live-store',
  status: 'PASS',
  publicStoreIntegrated: true,
  onePublicationWithoutPartialState: true,
  exactReplayPublishes: false,
  directExportRecoveryRoundTrip: true,
  lifecycleOnlyProjectsAbsent: true,
  undoHashReappearanceResurrectsEvidence: false,
  profileRecoveryOverwritesBinding: false,
  explicitProfileBindingRequired: true,
  staleEvidenceCanPromoteAfterExplicitPrerequisites: true,
  moduleLineLimitExclusive: 300,
}));

function preparePrerequisites(target, origin = 'WP-MC1/LIVE') {
  target.initializeLifecycle(SOURCE, origin);
  target.registerLifecycleArtifact(modelRecord(), `${origin}-MODEL`);
  target.registerLifecycleArtifact(geometryRecord(), `${origin}-GEOMETRY`);
  bindProfile(target, PROFILE.semanticHash, `${origin}-PROFILE`);
}

function bindProfile(target, profileHash, eventId) {
  target.applyLifecycleEvent(createLafeaLifecycleEvent({
    eventId,
    stageId: STAGE,
    changeClass: 'ANALYSIS_MESH_PROFILE',
    previousSourceHash: null,
    currentSourceHash: null,
    profileHash,
    originRef: 'WP-MC1/LIVE',
  }));
}

function modelRecord() {
  return createLafeaArtifactRecord({
    stageId: STAGE, kind: 'CANONICAL_MODEL', status: 'CURRENT',
    artifactHash: MODEL, parentHashes: { sourceHash: SOURCE },
    qualification: 'PASS', producerRef: 'WP-MC1/MODEL', diagnostics: [],
  });
}

function geometryRecord() {
  return createLafeaArtifactRecord({
    stageId: STAGE, kind: 'ANALYSIS_GEOMETRY', status: 'CURRENT',
    artifactHash: GEOMETRY,
    parentHashes: { sourceHash: SOURCE, canonicalModelHash: MODEL },
    qualification: 'PASS', producerRef: 'WP-MC1/GEOMETRY', diagnostics: [],
  });
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
    profileIdentity: 'WP-MC1-LIVE-T3',
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
  return canonicalLafeaSha256({ schema: 'wp-mc1-live-hash/v1', value });
}
