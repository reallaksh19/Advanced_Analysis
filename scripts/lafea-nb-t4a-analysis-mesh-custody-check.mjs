#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
  registerLafeaAnalysisMeshEvidence,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import {
  LAFEA_ANALYSIS_MESH_CUSTODY_SCHEMA,
  selectLafeaAnalysisMeshCustody,
} from '../src/workspace/lafea-analysis-mesh-custody.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';

const SOURCE_HASH = hash('CUSTODY-SOURCE');
const MODEL_HASH = hash('CUSTODY-MODEL');
const GEOMETRY_HASH = hash('CUSTODY-GEOMETRY');
const PROFILE = meshProfile();
const PASS_MESH = mesh('PASS', [
  node('N1', 0, 0, 0),
  node('N2', 4, 0, 0),
  node('N3', 0, 4, 0),
]);
const WARNING_MESH = mesh('WARNING', [
  node('N1', 0, 0, 0),
  node('N2', 4, 0, 0),
  node('N3', 0, 1, 0),
]);
const BLOCK_MESH = mesh('BLOCK', [
  node('N1', 0, 0, 0),
  node('N2', 100, 0, 0),
  node('N3', 0.01, 0.001, 0),
]);

const notApplicable = selectLafeaAnalysisMeshCustody({
  stageId: 'LAFEA.1',
  lifecycle: createLafeaLifecycle('LAFEA.1', SOURCE_HASH),
  evidence: null,
  meshProfileHash: null,
});
assert.equal(notApplicable.schema, LAFEA_ANALYSIS_MESH_CUSTODY_SCHEMA);
assert.equal(notApplicable.state, 'NOT_APPLICABLE');
assert.equal(notApplicable.actions.allowsStageAdvance, true);
assert.equal(notApplicable.actions.allowsRunAuthorization, true);

const absentLifecycle = lifecycleWithGeometry();
const absent = select(absentLifecycle, null);
assert.equal(absent.state, 'ABSENT');
assert.equal(absent.actions.allowsStageAdvance, false);
assert.equal(absent.actions.canRecover, false);

const passEvidence = createEvidence(PASS_MESH);
const passLifecycle = registerLafeaAnalysisMeshEvidence(
  lifecycleWithGeometry(), passEvidence,
);
const pass = select(passLifecycle, passEvidence);
assert.equal(pass.state, 'CURRENT_PASS');
assert.equal(pass.qualityStatus, 'OK');
assert.equal(pass.actions.allowsStageAdvance, true);
assert.equal(pass.actions.allowsRunAuthorization, true);
assert.equal(pass.actions.canExport, true);
assert.ok(Object.isFrozen(pass));
assert.ok(Object.isFrozen(pass.actions));

const warningEvidence = createEvidence(WARNING_MESH);
assert.equal(warningEvidence.quality.worstStatus, 'WARNING');
const warning = select(
  registerLafeaAnalysisMeshEvidence(lifecycleWithGeometry(), warningEvidence),
  warningEvidence,
);
assert.equal(warning.state, 'CURRENT_WARNING');
assert.equal(warning.actions.canFocus, true);
assert.equal(warning.actions.allowsStageAdvance, false);
assert.equal(warning.actions.allowsRunAuthorization, false);

const blockEvidence = createEvidence(BLOCK_MESH);
assert.equal(blockEvidence.quality.worstStatus, 'BLOCK');
const block = select(
  registerLafeaAnalysisMeshEvidence(lifecycleWithGeometry(), blockEvidence),
  blockEvidence,
);
assert.equal(block.state, 'CURRENT_BLOCK');
assert.equal(block.actions.canFocus, true);
assert.equal(block.actions.allowsStageAdvance, false);
assert.equal(block.actions.allowsRunAuthorization, false);

const profileStale = selectLafeaAnalysisMeshCustody({
  stageId: 'LAFEA.3',
  lifecycle: passLifecycle,
  evidence: passEvidence,
  meshProfileHash: 'fnv1a64:0000000000000000',
});
assert.equal(profileStale.state, 'STALE');
assert.deepEqual(profileStale.reasons, ['MESH_PROFILE_BINDING_STALE']);
assert.equal(profileStale.actions.auditOnly, true);
assert.equal(profileStale.actions.canRecover, true);
assert.equal(profileStale.actions.canExport, true);

const changedSource = hash('CHANGED-SOURCE');
const staleParents = select(
  lifecycleWithGeometry({
    sourceHash: changedSource,
    modelHash: hash('CHANGED-MODEL'),
    geometryHash: hash('CHANGED-GEOMETRY'),
  }),
  passEvidence,
);
assert.equal(staleParents.state, 'STALE');
assert.ok(staleParents.reasons.includes('SOURCE_BINDING_STALE'));
assert.ok(staleParents.reasons.includes('CANONICAL_MODEL_BINDING_STALE'));
assert.ok(staleParents.reasons.includes('ANALYSIS_GEOMETRY_BINDING_STALE'));
assert.ok(staleParents.reasons.includes('ANALYSIS_MESH_NOT_CURRENTLY_REGISTERED'));

const conflictingEvidence = createEvidence(WARNING_MESH);
const conflict = select(passLifecycle, conflictingEvidence);
assert.equal(conflict.state, 'INVALID');
assert.deepEqual(conflict.reasons, ['CONFLICTING_REGISTERED_ANALYSIS_MESH']);
assert.equal(conflict.actions.canRecover, false);

const tampered = structuredClone(passEvidence);
tampered.quality.elementCount = 99;
const invalid = select(passLifecycle, tampered);
assert.equal(invalid.state, 'INVALID');
assert.deepEqual(invalid.reasons, ['LAFEA_ANALYSIS_MESH_EVIDENCE_TAMPERED']);
assert.equal(invalid.actions.canExport, false);

assert.throws(() => selectLafeaAnalysisMeshCustody({
  stageId: 'LAFEA.3',
  lifecycle: passLifecycle,
  evidence: passEvidence,
}), (error) => error?.code === 'LAFEA_ANALYSIS_MESH_CUSTODY_INPUT_KEYS_INVALID');

console.log(JSON.stringify({
  check: 'lafea-nb-t4a-analysis-mesh-custody',
  status: 'PASS',
  schema: LAFEA_ANALYSIS_MESH_CUSTODY_SCHEMA,
  states: [
    'NOT_APPLICABLE', 'ABSENT', 'STALE', 'CURRENT_PASS',
    'CURRENT_WARNING', 'CURRENT_BLOCK', 'INVALID',
  ],
  exactReplayAuthorityPromoted: false,
  warningAuthorizesRun: false,
  staleEvidenceAuditOnly: true,
  releaseQualified: false,
}));

function select(lifecycle, evidence) {
  return selectLafeaAnalysisMeshCustody({
    stageId: 'LAFEA.3',
    lifecycle,
    evidence,
    meshProfileHash: PROFILE.semanticHash,
  });
}

function createEvidence(meshValue) {
  const meshHash = lafeaAnalysisMeshContentHash(meshValue);
  return createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: SOURCE_HASH,
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
    meshProfile: PROFILE,
    mesh: meshValue,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId: 'LAFEA.3',
      authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: 'TEST/CUSTODY/ANALYSIS-MESH',
      sourceHash: SOURCE_HASH,
      canonicalModelHash: MODEL_HASH,
      analysisGeometryHash: GEOMETRY_HASH,
      meshProfileHash: PROFILE.semanticHash,
      meshHash,
    },
  });
}

function lifecycleWithGeometry(options = {}) {
  const sourceHash = options.sourceHash ?? SOURCE_HASH;
  const modelHash = options.modelHash ?? MODEL_HASH;
  const geometryHash = options.geometryHash ?? GEOMETRY_HASH;
  let lifecycle = createLafeaLifecycle('LAFEA.3', sourceHash);
  lifecycle = registerLafeaArtifact(lifecycle, createLafeaArtifactRecord({
    stageId: 'LAFEA.3',
    kind: 'CANONICAL_MODEL',
    status: 'CURRENT',
    artifactHash: modelHash,
    parentHashes: { sourceHash },
    qualification: 'PASS',
    producerRef: 'TEST/CUSTODY/MODEL',
  }), 'TEST-CUSTODY-MODEL');
  return registerLafeaArtifact(lifecycle, createLafeaArtifactRecord({
    stageId: 'LAFEA.3',
    kind: 'ANALYSIS_GEOMETRY',
    status: 'CURRENT',
    artifactHash: geometryHash,
    parentHashes: { sourceHash, canonicalModelHash: modelHash },
    qualification: 'PASS',
    producerRef: 'TEST/CUSTODY/GEOMETRY',
  }), 'TEST-CUSTODY-GEOMETRY');
}

function meshProfile() {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: 'NB-T4A-CUSTODY-T3',
    sourceRevision: 'TEST-1',
    fields: {
      continuumElement: 'T3',
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize: 25,
      adjacentSizeRatioMax: 1.5,
      aspectRatioWarn: 3,
      aspectRatioBlock: 6,
      scaledJacobianWarn: 0.3,
      scaledJacobianBlock: 0.1,
      adaptiveLevels: 3,
    },
    semanticHash: undefined,
  });
}

function mesh(meshIdentity, nodes) {
  return {
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity,
    nodes,
    elements: [{
      elementId: 'E1',
      elementType: 'T3',
      nodeIds: ['N1', 'N2', 'N3'],
    }],
  };
}

function node(nodeId, x, y, z) {
  return { nodeId, x, y, z };
}

function hash(value) {
  return canonicalLafeaSha256({ schema: 'custody-test-hash/v1', value });
}
