#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyLafeaLifecycleEvent,
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  createLafeaLifecycleEvent,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';
import {
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
} from '../src/workspace/lafea-lifecycle-workbench-store.js';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
} from '../src/workspace/lafea-canvas/render-packet-v2-contract.js';
import {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
  LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES,
  evaluateLafeaRenderEvidenceIntake,
} from '../src/workspace/lafea-render-evidence-intake.js';
import * as publicSurface from '../src/workspace/lafea-workbench.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lineage = Object.freeze({
  sourceHash: 'sha256:source-u4d',
  topologyHash: 'sha256:geometry-u4d',
  meshHash: 'sha256:mesh-u4d',
  executionHash: 'sha256:execution-u4d',
  recoveryHash: 'sha256:recovery-u4d',
  displayGeometryHash: 'sha256:display-geometry-u4d',
  renderProfileHash: 'sha256:render-profile-u4d',
});
const lifecycle = qualifiedLifecycle('LAFEA.3', lineage);
const binding = currentBinding();
const packet = renderPacket('LAFEA.3', 7, lineage);

assert.equal(LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA, 'lafea-render-evidence-intake/v1');
assert.deepEqual(LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES, ['READY', 'BLOCKED']);
assert.ok(Object.isFrozen(LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES));

const ready = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3',
  sceneRevision: 7,
  packet,
  lifecycle,
  lifecycleBinding: binding,
});
assert.equal(ready.status, 'READY');
assert.equal(ready.renderEvidenceReady, true);
assert.deepEqual(ready.blockingReasons, []);
assert.ok(Object.isFrozen(ready));
assert.ok(Object.isFrozen(ready.blockingReasons));
assert.notEqual(ready.packet.positions, packet.positions);
packet.positions[0] = 99;
assert.equal(ready.packet.positions[0], 0);

const missingPacket = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3', sceneRevision: 7, packet: null, lifecycle,
  lifecycleBinding: binding,
});
assert.equal(missingPacket.status, 'BLOCKED');
assert.equal(missingPacket.packet, null);
assert.ok(missingPacket.blockingReasons.includes('LAFEA_RENDER_PACKET_NOT_SUPPLIED'));

const staleBinding = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3', sceneRevision: 7, packet: renderPacket('LAFEA.3', 7, lineage),
  lifecycle, lifecycleBinding: staleDocumentBinding(),
});
assert.equal(staleBinding.renderEvidenceReady, false);
assert.ok(staleBinding.blockingReasons.includes(
  'LAFEA_RENDER_LIFECYCLE_BINDING_STALE_DOCUMENT_REVISION',
));

const sceneMismatch = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3', sceneRevision: 8, packet: renderPacket('LAFEA.3', 7, lineage),
  lifecycle, lifecycleBinding: binding,
});
assert.ok(sceneMismatch.blockingReasons.includes(
  'LAFEA_RENDER_PACKET_SCENE_REVISION_MISMATCH',
));

const sourceMismatchLineage = { ...lineage, sourceHash: 'sha256:other-source' };
const sourceMismatch = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3', sceneRevision: 7,
  packet: renderPacket('LAFEA.3', 7, sourceMismatchLineage),
  lifecycle, lifecycleBinding: binding,
});
assert.ok(sourceMismatch.blockingReasons.includes('LAFEA_RENDER_SOURCE_HASH_MISMATCH'));

const staleMeshLifecycle = structuredClone(lifecycle);
staleMeshLifecycle.artifacts.ANALYSIS_MESH.status = 'STALE';
const staleMesh = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3', sceneRevision: 7, packet: renderPacket('LAFEA.3', 7, lineage),
  lifecycle: staleMeshLifecycle, lifecycleBinding: binding,
});
assert.ok(staleMesh.blockingReasons.includes(
  'LAFEA_RENDER_ANALYSIS_MESH_NOT_CURRENT_PASS',
));
assert.ok(staleMesh.blockingReasons.includes('LAFEA_RENDER_LIFECYCLE_MESH_NOT_QUALIFIED'));
assert.ok(staleMesh.blockingReasons.includes('LAFEA_RENDER_LIFECYCLE_RESULT_NOT_READY'));

const recoveryHashMismatch = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3', sceneRevision: 7,
  packet: renderPacket('LAFEA.3', 7, { ...lineage, recoveryHash: 'sha256:wrong-recovery' }),
  lifecycle, lifecycleBinding: binding,
});
assert.ok(recoveryHashMismatch.blockingReasons.includes(
  'LAFEA_RENDER_RECOVERY_HASH_MISMATCH',
));

const missingDisplayLifecycle = structuredClone(lifecycle);
missingDisplayLifecycle.display.displayMeshDensityHash = null;
missingDisplayLifecycle.display.contourPaletteHash = null;
const missingDisplay = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3', sceneRevision: 7, packet: renderPacket('LAFEA.3', 7, lineage),
  lifecycle: missingDisplayLifecycle, lifecycleBinding: binding,
});
assert.ok(missingDisplay.blockingReasons.includes(
  'LAFEA_RENDER_DISPLAY_GEOMETRY_PROFILE_MISSING',
));
assert.ok(missingDisplay.blockingReasons.includes('LAFEA_RENDER_PROFILE_MISSING'));

const displayHashMismatch = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3', sceneRevision: 7,
  packet: renderPacket('LAFEA.3', 7, {
    ...lineage,
    displayGeometryHash: 'sha256:wrong-display-geometry',
    renderProfileHash: 'sha256:wrong-render-profile',
  }),
  lifecycle, lifecycleBinding: binding,
});
assert.ok(displayHashMismatch.blockingReasons.includes(
  'LAFEA_RENDER_DISPLAY_GEOMETRY_HASH_MISMATCH',
));
assert.ok(displayHashMismatch.blockingReasons.includes(
  'LAFEA_RENDER_PROFILE_HASH_MISMATCH',
));

const stageMismatch = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.4', sceneRevision: 7, packet: renderPacket('LAFEA.3', 7, lineage),
  lifecycle, lifecycleBinding: binding,
});
assert.ok(stageMismatch.blockingReasons.includes('LAFEA_RENDER_PACKET_STAGE_MISMATCH'));
assert.ok(stageMismatch.blockingReasons.includes('LAFEA_RENDER_LIFECYCLE_STAGE_MISMATCH'));

const weldLifecycle = createLafeaLifecycle('LAFEA.6', 'sha256:weld-source');
const weld = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.6', sceneRevision: 1,
  packet: renderPacket('LAFEA.6', 1, {
    ...lineage,
    sourceHash: 'sha256:weld-source',
  }),
  lifecycle: weldLifecycle,
  lifecycleBinding: binding,
});
assert.ok(weld.blockingReasons.includes('LAFEA_RENDER_STAGE_ENGINE_NOT_IMPLEMENTED'));
assert.equal(weld.renderEvidenceReady, false);

assert.throws(
  () => evaluateLafeaRenderEvidenceIntake({
    stageId: 'LAFEA.3', sceneRevision: 7,
    packet: { ...renderPacket('LAFEA.3', 7, lineage), extra: true },
    lifecycle, lifecycleBinding: binding,
  }),
  (error) => error.code === 'LAFEA_RENDER_PACKET_V2_KEYS_INVALID',
);
assert.throws(
  () => evaluateLafeaRenderEvidenceIntake({
    stageId: 'LAFEA.3', sceneRevision: 7, packet: renderPacket('LAFEA.3', 7, lineage),
    lifecycle, lifecycleBinding: { ...binding, currentDocumentDigest: 'different' },
  }),
  (error) => error.code === 'LAFEA_RENDER_CURRENT_BINDING_INVALID',
);

for (const name of [
  'LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA',
  'LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES',
  'evaluateLafeaRenderEvidenceIntake',
]) {
  assert.equal(publicSurface[name], {
    LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
    LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES,
    evaluateLafeaRenderEvidenceIntake,
  }[name], `${name} must be exported without wrapping.`);
}

const source = fs.readFileSync(
  path.join(ROOT, 'src/workspace/lafea-render-evidence-intake.js'),
  'utf8',
);
assert.doesNotMatch(source, /THREE|WebGL|createHybridViewport|three-mesh-renderer/u);
assert.doesNotMatch(source, /createLafeaArtifactRecord|registerLafeaArtifact|crypto|fnv|triangulate|packQualified/u);
assert.match(source, /ANALYSIS_GEOMETRY/u);
assert.match(source, /displayMeshDensityHash/u);
assert.match(source, /contourPaletteHash/u);
assert.ok(source.split(/\r?\n/u).length <= 300);

console.log(JSON.stringify({
  check: 'lafea-u4d-render-evidence-intake',
  status: 'PASS',
  lifecycleBound: true,
  displayProfileBound: true,
  rendererInvoked: false,
  evidenceCreated: false,
  resultWebglEnabled: false,
  lafea6Enabled: false,
}));

function qualifiedLifecycle(stageId, hashes) {
  let value = createLafeaLifecycle(stageId, hashes.sourceHash);
  value = register(value, 'CANONICAL_MODEL', 'sha256:model-u4d', {
    sourceHash: hashes.sourceHash,
  }, 'REG-MODEL');
  value = register(value, 'ANALYSIS_GEOMETRY', hashes.topologyHash, {
    sourceHash: hashes.sourceHash,
    canonicalModelHash: 'sha256:model-u4d',
  }, 'REG-GEOMETRY');
  value = register(value, 'ANALYSIS_MESH', hashes.meshHash, {
    analysisGeometryHash: hashes.topologyHash,
    meshProfileHash: 'sha256:mesh-profile-u4d',
  }, 'REG-MESH');
  value = register(value, 'EXECUTION', hashes.executionHash, {
    canonicalModelHash: 'sha256:model-u4d',
    meshHash: hashes.meshHash,
    physicalLoadCaseHash: 'sha256:load-case-u4d',
    solverProfileHash: 'sha256:solver-profile-u4d',
  }, 'REG-EXECUTION');
  value = register(value, 'RECOVERY', hashes.recoveryHash, {
    executionHash: hashes.executionHash,
    meshHash: hashes.meshHash,
    recoveryProfileHash: 'sha256:recovery-profile-u4d',
  }, 'REG-RECOVERY');
  value = applyLafeaLifecycleEvent(value, createLafeaLifecycleEvent({
    eventId: 'EV-DISPLAY-GEOMETRY', stageId,
    changeClass: 'DISPLAY_MESH_DENSITY', profileHash: hashes.displayGeometryHash,
    originRef: 'U4D-TEST',
  }));
  return applyLafeaLifecycleEvent(value, createLafeaLifecycleEvent({
    eventId: 'EV-RENDER-PROFILE', stageId,
    changeClass: 'CONTOUR_PALETTE', profileHash: hashes.renderProfileHash,
    originRef: 'U4D-TEST',
  }));
}

function register(lifecycleValue, kind, artifactHash, parentHashes, registrationId) {
  return registerLafeaArtifact(lifecycleValue, createLafeaArtifactRecord({
    stageId: lifecycleValue.stageId,
    kind,
    status: 'CURRENT',
    artifactHash,
    parentHashes,
    qualification: 'PASS',
    producerRef: 'U4D-TEST-PRODUCER',
  }), registrationId);
}

function currentBinding() {
  return {
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status: 'CURRENT',
    boundDocumentDigest: 'fnv32:document-u4d',
    currentDocumentDigest: 'fnv32:document-u4d',
    reason: null,
    originRef: 'U4D-TEST',
  };
}

function staleDocumentBinding() {
  return {
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status: 'STALE_DOCUMENT_REVISION',
    boundDocumentDigest: 'fnv32:document-u4d',
    currentDocumentDigest: 'fnv32:document-other',
    reason: 'DOCUMENT_REVISION_CHANGED_WITHOUT_SOURCE_HASH_EVENT',
    originRef: 'U4D-TEST',
  };
}

function renderPacket(stageId, sceneRevision, hashes) {
  return {
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision,
    stageId,
    sourceElementType: 'T3',
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    vertexMeshNodeIds: ['N1', 'N2', 'N3'],
    drawTriangleIndices: new Uint32Array([0, 1, 2]),
    drawTriangleElementIndices: new Uint32Array([0]),
    sourceElementIds: ['E1'],
    fieldValues: new Float32Array([10, 20, 30]),
    qualityFlags: new Uint8Array([0, 0, 0]),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: 'FIELD-U4D',
      kind: 'PROJECTED_NODAL',
      units: 'MPa',
      sourcePath: 'qualifiedRecovery.displayFields.FIELD-U4D',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum: 10,
        maximum: 30,
        source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
        semanticHash: 'sha256:bounds-u4d',
      },
      colorMapId: 'COOL_WARM',
    },
    pickMap: {
      schema: 'LafeaPickMap.v1',
      sceneRevision,
      entries: [{
        drawGroup: 'TRIANGLES',
        primitiveStart: 0,
        primitiveEnd: 1,
        sourceEntityId: 'SOURCE-E1',
        meshEntityId: 'E1',
        entityRole: 'ELEMENT',
      }],
    },
    lineage: {
      schema: LAFEA_RENDER_LINEAGE_SCHEMA,
      ...hashes,
      producerRef: 'U4D-PACKET-PRODUCER',
    },
  };
}
