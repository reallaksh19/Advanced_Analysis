#!/usr/bin/env node
import assert from 'node:assert/strict';
import { PROFILE_KINDS, canonicalProfile } from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  createLafeaLifecycleEvent,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';
import {
  createLafeaWorkbenchMeshState,
} from '../src/workspace/lafea-workbench-mesh-state.js';

const STAGE = 'LAFEA.3';
const SOURCE = hash('SOURCE');
const MODEL = hash('MODEL');
const GEOMETRY = hash('GEOMETRY');
const PROFILE = meshProfile();
const EVIDENCE = evidence();

let retainedState = freeze({
  schema: 'lafea-workbench-state/v2',
  activeStageId: STAGE,
  status: 'READY',
  diagnostics: [],
  stages: {
    [STAGE]: {
      lifecycle: lifecycleWithGeometry(),
      lifecycleBinding: { status: 'CURRENT' },
      sourceAuthority: null,
    },
  },
});
let publications = 0;
let meshState;

const host = {
  getActiveStageId: () => retainedState.activeStageId,
  readStageState: () => stageState(),
  invokeRetained: (method) => {
    if (method === 'registerLifecycleArtifact') {
      retainedState = freeze({
        ...retainedState,
        status: 'FAILED',
        diagnostics: [{
          severity: 'ERROR',
          code: 'INJECTED_REGISTRATION_FAILURE',
          path: 'lifecycle',
          entityId: null,
          message: 'Injected registration failure.',
        }],
      });
    }
    return retainedState;
  },
  publish: () => {
    publications += 1;
    return retainedState;
  },
};
meshState = createLafeaWorkbenchMeshState([STAGE], host);
meshState.afterLifecycleEvent(profileEvent(), true);

const before = stageState();
assert.throws(
  () => meshState.registerAnalysisMeshEvidence(EVIDENCE),
  (error) => error?.code === 'INJECTED_REGISTRATION_FAILURE',
);
const after = stageState();
assert.equal(publications, 0);
assert.deepEqual(after.lifecycle, before.lifecycle);
assert.equal(after.retainedAnalysisMeshEvidence, null);
assert.equal(
  meshState.buildAnalysisMeshCustodyProjection(
    after,
    after.retainedAnalysisMeshEvidence,
  ).state,
  'ABSENT',
);
assert.equal(retainedState.status, 'FAILED');
assert.equal(retainedState.diagnostics[0].code, 'INJECTED_REGISTRATION_FAILURE');

console.log(JSON.stringify({
  check: 'lafea-nb-t4a-analysis-mesh-live-transaction',
  status: 'PASS',
  meshStateIsStoreDecorator: false,
  failedRegistrationPublishes: false,
  failedRegistrationChangesLifecycle: false,
  failedRegistrationRetainsEvidence: false,
  failClosedDiagnosticChannelUsed: true,
}));

function stageState() {
  return freeze({
    ...retainedState.stages[STAGE],
    stageId: STAGE,
    ...meshState.fields(STAGE),
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

function profileEvent() {
  return createLafeaLifecycleEvent({
    eventId: 'WP-MC1-TRANSACTION-PROFILE',
    stageId: STAGE,
    changeClass: 'ANALYSIS_MESH_PROFILE',
    previousSourceHash: null,
    currentSourceHash: null,
    profileHash: PROFILE.semanticHash,
    originRef: 'WP-MC1/TRANSACTION',
  });
}

function evidence() {
  const mesh = {
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity: 'WP-MC1-TRANSACTION',
    nodes: [
      { nodeId: 'N1', x: 0, y: 0, z: 0 },
      { nodeId: 'N2', x: 10, y: 0, z: 0 },
      { nodeId: 'N3', x: 0, y: 10, z: 0 },
    ],
    elements: [{
      elementId: 'E1',
      elementType: 'T3',
      nodeIds: ['N1', 'N2', 'N3'],
    }],
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
      producerRef: 'WP-MC1/TRANSACTION',
      sourceHash: SOURCE, canonicalModelHash: MODEL,
      analysisGeometryHash: GEOMETRY,
      meshProfileHash: PROFILE.semanticHash, meshHash,
    },
  });
}

function meshProfile() {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: 'WP-MC1-TRANSACTION-T3',
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
  return canonicalLafeaSha256({ schema: 'wp-mc1-transaction-hash/v1', value });
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
