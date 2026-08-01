#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  LAFEA_ARTIFACT_RECORD_SCHEMA,
  LAFEA_LIFECYCLE_SCHEMA,
  applyLafeaLifecycleEvent,
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  createLafeaLifecycleEvent,
  lafeaLifecycleReadiness,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';
import { lafeaLifecycleArtifactKinds } from '../src/workspace/lafea-lifecycle-profiles.js';

const stageId = 'LAFEA.3';
const sourceHash = 'sha256:source-A';
let lifecycle = createLafeaLifecycle(stageId, sourceHash);
assert.equal(lifecycle.schema, LAFEA_LIFECYCLE_SCHEMA);
assert.equal(lifecycle.profileId, 'FEA_MESH_RECOVERY_V1');
assert.deepEqual(Object.keys(lifecycle.artifacts), lafeaLifecycleArtifactKinds(stageId));
Object.values(lifecycle.artifacts).forEach((row) => {
  assert.equal(row.schema, LAFEA_ARTIFACT_RECORD_SCHEMA);
  assert.equal(row.status, 'ABSENT');
});

lifecycle = add(lifecycle, 'CANONICAL_MODEL', 'sha256:model-A', { sourceHash });
lifecycle = add(lifecycle, 'ANALYSIS_GEOMETRY', 'sha256:geometry-A', {
  sourceHash, canonicalModelHash: 'sha256:model-A',
});
lifecycle = add(lifecycle, 'ANALYSIS_MESH', 'sha256:mesh-A', {
  analysisGeometryHash: 'sha256:geometry-A', meshProfileHash: 'sha256:mesh-profile-A',
});
lifecycle = add(lifecycle, 'EXECUTION', 'sha256:execution-A', {
  canonicalModelHash: 'sha256:model-A', meshHash: 'sha256:mesh-A',
  physicalLoadCaseHash: 'sha256:loads-A', solverProfileHash: 'sha256:solver-A',
});
lifecycle = add(lifecycle, 'RECOVERY', 'sha256:recovery-A', {
  executionHash: 'sha256:execution-A', meshHash: 'sha256:mesh-A',
  recoveryProfileHash: 'sha256:recovery-profile-A',
});
let ready = lafeaLifecycleReadiness(lifecycle);
assert.equal(ready.meshQualified, true);
assert.equal(ready.resultReady, true);
assert.equal(ready.convergenceReady, false);
assert.equal(ready.codeAssessmentApplicable, false);
assert.equal(ready.codeReady, false);
assert.deepEqual(ready.blockingReasons, []);

lifecycle = add(lifecycle, 'REPORT_EVIDENCE', 'sha256:report-A', {
  sourceHash, canonicalModelHash: 'sha256:model-A', meshHash: 'sha256:mesh-A',
  executionHash: 'sha256:execution-A', recoveryHash: 'sha256:recovery-A',
  convergenceHash: null, reportProfileHash: 'sha256:report-profile-A',
});
assert.equal(lafeaLifecycleReadiness(lifecycle).reportQualified, true);

const palette = applyLafeaLifecycleEvent(lifecycle, event('CONTOUR_PALETTE', {
  profileHash: 'sha256:palette-B',
}));
assert.deepEqual(palette.artifacts, lifecycle.artifacts);
assert.equal(palette.display.contourPaletteHash, 'sha256:palette-B');

const material = applyLafeaLifecycleEvent(lifecycle, event('MATERIAL_PROPERTY', {
  previousSourceHash: sourceHash, currentSourceHash: 'sha256:source-B',
}));
assert.equal(material.artifacts.CANONICAL_MODEL.status, 'STALE');
assert.equal(material.artifacts.ANALYSIS_GEOMETRY.status, 'REVALIDATION_REQUIRED');
assert.equal(material.artifacts.ANALYSIS_MESH.status, 'REVALIDATION_REQUIRED');
assert.equal(material.artifacts.EXECUTION.status, 'STALE');
assert.equal(material.artifacts.RECOVERY.status, 'STALE');
assert.equal(material.artifacts.REPORT_EVIDENCE.status, 'STALE');
assert.equal(lafeaLifecycleReadiness(material).resultReady, false);

const meshChanged = applyLafeaLifecycleEvent(lifecycle, event('ANALYSIS_MESH_PROFILE', {
  profileHash: 'sha256:mesh-profile-B',
}));
assert.equal(meshChanged.artifacts.CANONICAL_MODEL.status, 'CURRENT');
assert.equal(meshChanged.artifacts.ANALYSIS_GEOMETRY.status, 'CURRENT');
assert.equal(meshChanged.artifacts.ANALYSIS_MESH.status, 'STALE');
assert.equal(meshChanged.artifacts.RECOVERY.status, 'STALE');

assert.throws(() => applyLafeaLifecycleEvent(lifecycle, event('CODE_PROFILE', {
  profileHash: 'sha256:code-profile',
})), (error) => error?.code === 'LAFEA_CHANGE_CLASS_NOT_AUTHORIZED_FOR_PROFILE');
assert.throws(() => createLafeaArtifactRecord({
  stageId, kind: 'CODE_ASSESSMENT', status: 'CURRENT',
  artifactHash: 'sha256:code', parentHashes: {}, qualification: 'PASS',
  producerRef: 'CHECK/INVALID', diagnostics: [],
}), (error) => error?.code === 'LAFEA_ARTIFACT_KIND_NOT_AUTHORIZED_FOR_PROFILE');

const weld = createLafeaLifecycle('LAFEA.6', 'sha256:weld');
assert.deepEqual(weld.artifacts, {});
assert.equal(lafeaLifecycleReadiness(weld).resultReady, false);
assert.throws(() => applyLafeaLifecycleEvent(weld, createLafeaLifecycleEvent({
  eventId: 'WELD-EDIT', stageId: 'LAFEA.6', changeClass: 'GEOMETRY',
  previousSourceHash: 'sha256:weld', currentSourceHash: 'sha256:weld-B',
  profileHash: null, originRef: 'U3A-CHECK',
})), (error) => error?.code === 'LAFEA_LIFECYCLE_EDIT_NOT_AUTHORIZED');

console.log(JSON.stringify({
  check: 'lafea-u3a-lifecycle-lineage-contracts', status: 'PASS',
  lifecycleSchema: LAFEA_LIFECYCLE_SCHEMA, profileId: lifecycle.profileId,
  artifactKinds: lafeaLifecycleArtifactKinds(stageId),
  displayChangesInvalidateEngineeringEvidence: false,
  sourceChangesFailClosed: true, producerHashesOpaque: true,
  codeAssessmentAuthorized: false, unsupportedStageArtifactSlots: 0,
}));

function add(value, kind, artifactHash, parentHashes) {
  return registerLafeaArtifact(value, createLafeaArtifactRecord({
    stageId: value.stageId, profileId: value.profileId, kind, status: 'CURRENT',
    artifactHash, parentHashes, qualification: 'PASS',
    producerRef: `U3A/${kind}/v2`, diagnostics: [],
  }), `U3A-${kind}`);
}
function event(changeClass, options = {}) {
  return createLafeaLifecycleEvent({
    eventId: `U3A-${changeClass}`, stageId, changeClass,
    previousSourceHash: options.previousSourceHash ?? null,
    currentSourceHash: options.currentSourceHash ?? null,
    profileHash: options.profileHash ?? null, originRef: 'U3A-CHECK',
  });
}
