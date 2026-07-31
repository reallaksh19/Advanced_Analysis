#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_ARTIFACT_KINDS,
  LAFEA_ARTIFACT_RECORD_SCHEMA,
  LAFEA_LIFECYCLE_EVENT_SCHEMA,
  LAFEA_LIFECYCLE_SCHEMA,
  applyLafeaLifecycleEvent,
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  createLafeaLifecycleEvent,
  lafeaLifecycleReadiness,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';

const stageId = 'LAFEA.3';
const sourceHash = 'sha256:source-A';
const event = (changeClass, options = {}) => createLafeaLifecycleEvent({
  eventId: options.eventId ?? `EVENT-${changeClass}`,
  stageId,
  changeClass,
  previousSourceHash: options.previousSourceHash ?? null,
  currentSourceHash: options.currentSourceHash ?? null,
  profileHash: options.profileHash ?? null,
  originRef: options.originRef ?? 'U3A-CHECK',
});
const record = (kind, artifactHash, parentHashes, options = {}) => createLafeaArtifactRecord({
  stageId,
  kind,
  status: options.status ?? 'CURRENT',
  artifactHash,
  parentHashes,
  qualification: options.qualification ?? 'PASS',
  producerRef: options.producerRef ?? `CHECK/${kind}/v1`,
  diagnostics: options.diagnostics ?? [],
});

let lifecycle = createLafeaLifecycle(stageId, sourceHash);
assert.equal(lifecycle.schema, LAFEA_LIFECYCLE_SCHEMA);
assert.ok(Object.isFrozen(lifecycle));
assert.deepEqual(Object.keys(lifecycle.artifacts), LAFEA_ARTIFACT_KINDS);
LAFEA_ARTIFACT_KINDS.forEach((kind) => {
  assert.equal(lifecycle.artifacts[kind].schema, LAFEA_ARTIFACT_RECORD_SCHEMA);
  assert.equal(lifecycle.artifacts[kind].status, 'ABSENT');
});

lifecycle = registerLafeaArtifact(lifecycle, record(
  'CANONICAL_MODEL', 'sha256:model-A', { sourceHash },
), 'REG-MODEL-A');
lifecycle = registerLafeaArtifact(lifecycle, record(
  'ANALYSIS_GEOMETRY', 'sha256:geometry-A', {
    sourceHash, canonicalModelHash: 'sha256:model-A',
  },
), 'REG-GEOMETRY-A');
lifecycle = registerLafeaArtifact(lifecycle, record(
  'ANALYSIS_MESH', 'sha256:mesh-A', {
    analysisGeometryHash: 'sha256:geometry-A', meshProfileHash: 'sha256:mesh-profile-A',
  },
), 'REG-MESH-A');
lifecycle = registerLafeaArtifact(lifecycle, record(
  'EXECUTION', 'sha256:execution-A', {
    canonicalModelHash: 'sha256:model-A', meshHash: 'sha256:mesh-A',
    physicalLoadCaseHash: 'sha256:loads-A', solverProfileHash: 'sha256:solver-A',
  },
), 'REG-EXECUTION-A');
lifecycle = registerLafeaArtifact(lifecycle, record(
  'RECOVERY', 'sha256:recovery-A', {
    executionHash: 'sha256:execution-A', meshHash: 'sha256:mesh-A',
    recoveryProfileHash: 'sha256:recovery-profile-A',
  },
), 'REG-RECOVERY-A');
lifecycle = registerLafeaArtifact(lifecycle, record(
  'CONVERGENCE', 'sha256:convergence-A', {
    recoveryHash: 'sha256:recovery-A', recoverySetHash: 'sha256:recovery-set-A',
    convergenceProfileHash: 'sha256:convergence-profile-A',
  },
), 'REG-CONVERGENCE-A');
lifecycle = registerLafeaArtifact(lifecycle, record(
  'CODE_ASSESSMENT', 'sha256:code-A', {
    sourceHash, canonicalModelHash: 'sha256:model-A', meshHash: 'sha256:mesh-A',
    executionHash: 'sha256:execution-A', recoveryHash: 'sha256:recovery-A',
    convergenceHash: 'sha256:convergence-A', codeProfileHash: 'sha256:code-profile-A',
    allowableSourceHash: 'sha256:allowable-A', classificationProfileHash: 'sha256:classification-A',
  },
), 'REG-CODE-A');
lifecycle = registerLafeaArtifact(lifecycle, record(
  'REPORT_EVIDENCE', 'sha256:report-A', {
    sourceHash, canonicalModelHash: 'sha256:model-A', meshHash: 'sha256:mesh-A',
    executionHash: 'sha256:execution-A', recoveryHash: 'sha256:recovery-A',
    convergenceHash: 'sha256:convergence-A', codeAssessmentHash: 'sha256:code-A',
    reportProfileHash: 'sha256:report-profile-A',
  },
), 'REG-REPORT-A');

const ready = lafeaLifecycleReadiness(lifecycle);
assert.equal(ready.meshGenerated, true);
assert.equal(ready.meshQualified, true);
assert.equal(ready.resultReady, true);
assert.equal(ready.codeReady, true);
assert.equal(ready.reportCurrent, true);
assert.deepEqual(ready.blockingReasons, []);
assert.equal(lifecycle.lastRegistration.registrationId, 'REG-REPORT-A');

const engineeringSnapshot = structuredClone(lifecycle.artifacts);
const paletteEvent = event('CONTOUR_PALETTE', { profileHash: 'sha256:palette-B' });
assert.equal(paletteEvent.schema, LAFEA_LIFECYCLE_EVENT_SCHEMA);
const paletteChanged = applyLafeaLifecycleEvent(lifecycle, paletteEvent);
assert.deepEqual(paletteChanged.artifacts, engineeringSnapshot);
assert.equal(paletteChanged.display.contourPaletteHash, 'sha256:palette-B');
assert.equal(paletteChanged.lastEvent.eventId, paletteEvent.eventId);

const materialChanged = applyLafeaLifecycleEvent(lifecycle, event('MATERIAL_PROPERTY', {
  previousSourceHash: sourceHash,
  currentSourceHash: 'sha256:source-B',
}));
assert.equal(materialChanged.source.sourceHash, 'sha256:source-B');
assert.equal(materialChanged.artifacts.CANONICAL_MODEL.status, 'STALE');
assert.equal(materialChanged.artifacts.ANALYSIS_GEOMETRY.status, 'REVALIDATION_REQUIRED');
assert.equal(materialChanged.artifacts.ANALYSIS_MESH.status, 'REVALIDATION_REQUIRED');
for (const kind of ['EXECUTION', 'RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE']) {
  assert.equal(materialChanged.artifacts[kind].status, 'STALE');
}
assert.equal(lafeaLifecycleReadiness(materialChanged).codeReady, false);

const geometryChanged = applyLafeaLifecycleEvent(lifecycle, event('GEOMETRY', {
  previousSourceHash: sourceHash,
  currentSourceHash: 'sha256:source-C',
}));
for (const kind of LAFEA_ARTIFACT_KINDS) assert.equal(geometryChanged.artifacts[kind].status, 'STALE');

const meshProfileChanged = applyLafeaLifecycleEvent(lifecycle, event('ANALYSIS_MESH_PROFILE', {
  profileHash: 'sha256:mesh-profile-B',
}));
assert.equal(meshProfileChanged.artifacts.CANONICAL_MODEL.status, 'CURRENT');
assert.equal(meshProfileChanged.artifacts.ANALYSIS_GEOMETRY.status, 'CURRENT');
for (const kind of ['ANALYSIS_MESH', 'EXECUTION', 'RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE']) {
  assert.equal(meshProfileChanged.artifacts[kind].status, 'STALE');
}

const recoveryProfileChanged = applyLafeaLifecycleEvent(lifecycle, event('RECOVERY_PROFILE', {
  profileHash: 'sha256:recovery-profile-B',
}));
assert.equal(recoveryProfileChanged.artifacts.EXECUTION.status, 'CURRENT');
for (const kind of ['RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE']) {
  assert.equal(recoveryProfileChanged.artifacts[kind].status, 'STALE');
}

const codeProfileChanged = applyLafeaLifecycleEvent(lifecycle, event('CODE_PROFILE', {
  profileHash: 'sha256:code-profile-B',
}));
assert.equal(codeProfileChanged.artifacts.CONVERGENCE.status, 'CURRENT');
assert.equal(codeProfileChanged.artifacts.CODE_ASSESSMENT.status, 'STALE');
assert.equal(codeProfileChanged.artifacts.REPORT_EVIDENCE.status, 'STALE');

const badParent = record('ANALYSIS_MESH', 'sha256:mesh-wrong', {
  analysisGeometryHash: 'sha256:not-current', meshProfileHash: 'sha256:mesh-profile-X',
});
assert.throws(
  () => registerLafeaArtifact(lifecycle, badParent, 'REG-BAD-PARENT'),
  (error) => error?.code === 'LAFEA_ARTIFACT_PARENT_MISMATCH',
);

const blockedMesh = record('ANALYSIS_MESH', 'sha256:mesh-blocked', {
  analysisGeometryHash: 'sha256:geometry-A', meshProfileHash: 'sha256:mesh-profile-blocked',
}, { status: 'BLOCKED', qualification: 'BLOCK' });
const blockedLifecycle = registerLafeaArtifact(lifecycle, blockedMesh, 'REG-MESH-BLOCKED');
assert.equal(blockedLifecycle.artifacts.ANALYSIS_MESH.status, 'BLOCKED');
assert.equal(lafeaLifecycleReadiness(blockedLifecycle).meshGenerated, true);
assert.equal(lafeaLifecycleReadiness(blockedLifecycle).meshQualified, false);
assert.throws(
  () => registerLafeaArtifact(blockedLifecycle, record('EXECUTION', 'sha256:execution-blocked', {
    canonicalModelHash: 'sha256:model-A', meshHash: 'sha256:mesh-blocked',
    physicalLoadCaseHash: 'sha256:loads-A', solverProfileHash: 'sha256:solver-A',
  }), 'REG-EXECUTION-BLOCKED'),
  (error) => error?.code === 'LAFEA_ARTIFACT_PREREQUISITE_BLOCKED',
);

assert.throws(
  () => createLafeaArtifactRecord({
    stageId,
    kind: 'ANALYSIS_MESH',
    status: 'CURRENT',
    artifactHash: 'sha256:invalid-current-block',
    parentHashes: {
      analysisGeometryHash: 'sha256:geometry-A', meshProfileHash: 'sha256:mesh-profile-A',
    },
    qualification: 'BLOCK',
    producerRef: 'CHECK/INVALID',
    diagnostics: [],
  }),
  /CURRENT evidence cannot have BLOCK/u,
);

assert.throws(
  () => applyLafeaLifecycleEvent(lifecycle, createLafeaLifecycleEvent({
    eventId: 'WRONG-STAGE',
    stageId: 'LAFEA.4',
    changeClass: 'CONTOUR_PALETTE',
    previousSourceHash: null,
    currentSourceHash: null,
    profileHash: 'sha256:palette-X',
    originRef: 'U3A-CHECK',
  })),
  (error) => error?.code === 'LAFEA_LIFECYCLE_STAGE_MISMATCH',
);

const weld = createLafeaLifecycle('LAFEA.6', 'sha256:weld-placeholder');
assert.equal(lafeaLifecycleReadiness(weld).codeReady, false);
assert.throws(
  () => applyLafeaLifecycleEvent(weld, createLafeaLifecycleEvent({
    eventId: 'WELD-EDIT',
    stageId: 'LAFEA.6',
    changeClass: 'GEOMETRY',
    previousSourceHash: 'sha256:weld-placeholder',
    currentSourceHash: 'sha256:weld-edited',
    profileHash: null,
    originRef: 'U3A-CHECK',
  })),
  (error) => error?.code === 'LAFEA_LIFECYCLE_EDIT_NOT_AUTHORIZED',
);
const weldPalette = applyLafeaLifecycleEvent(weld, createLafeaLifecycleEvent({
  eventId: 'WELD-DISPLAY',
  stageId: 'LAFEA.6',
  changeClass: 'CONTOUR_PALETTE',
  previousSourceHash: null,
  currentSourceHash: null,
  profileHash: 'sha256:weld-palette',
  originRef: 'U3A-CHECK',
}));
assert.equal(weldPalette.display.contourPaletteHash, 'sha256:weld-palette');

console.log(JSON.stringify({
  check: 'lafea-u3a-lifecycle-lineage-contracts',
  status: 'PASS',
  lifecycleSchema: LAFEA_LIFECYCLE_SCHEMA,
  artifactKinds: LAFEA_ARTIFACT_KINDS,
  displayChangesInvalidateEngineeringEvidence: false,
  sourceChangesFailClosed: true,
  producerHashesOpaque: true,
  unsupportedStageEngineeringLifecycle: false,
}));
