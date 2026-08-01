#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_DIAGNOSTIC_DISPLAY_SCHEMA,
  LAFEA_RENDER_QUALITY_FLAGS,
  LAFEA_UNRECOVERED_VERTEX_DISPLAY_POLICY,
  createLafeaDiagnosticDisplay,
  createLafeaDiagnosticSafeVertexColors,
} from '../src/workspace/lafea-canvas/diagnostic-field-display.js';
import {
  createLafeaResultRenderRequest,
} from '../src/workspace/lafea-canvas/result-render-request.js';
import {
  createThreeMeshRendererV2,
} from '../src/workspace/lafea-canvas/three-mesh-renderer-v2.js';
import {
  sealRenderPacketV2,
} from '../src/workspace/lafea-canvas/render-packet-v2-contract.js';
import {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
} from '../src/workspace/lafea-render-evidence-intake.js';
import {
  fakeThree,
  u4gRenderPacket,
} from './lafea-u4g-fixtures.mjs';

class FakeCanvas {
  constructor() {
    this.dataset = {};
    this.hidden = false;
    this.listeners = new Map();
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 420 }; }
}

const packet = diagnosticPacket();
const display = createLafeaDiagnosticDisplay(packet);
assert.equal(display.schema, LAFEA_DIAGNOSTIC_DISPLAY_SCHEMA);
assert.equal(display.status, 'DIAGNOSTIC');
assert.equal(display.validVertexCount, 2);
assert.equal(display.diagnosticVertexCount, 1);
assert.equal(display.renderProfileHash, packet.lineage.renderProfileHash);
assert.deepEqual(display.policy, LAFEA_UNRECOVERED_VERTEX_DISPLAY_POLICY);
assert.equal(Object.isFrozen(display), true);
assert.deepEqual(LAFEA_RENDER_QUALITY_FLAGS, { VALID: 0, UNRECOVERED: 1 });
assert.deepEqual(display.policy.color, [1, 0, 1]);

const colors = createLafeaDiagnosticSafeVertexColors(packet, display);
assert.deepEqual([...colors.slice(0, 3)], [0, 0, 1]);
assert.deepEqual([...colors.slice(3, 6)], [1, 0, 1]);
assert.deepEqual([...colors.slice(6, 9)], [1, 0, 0]);
assert.equal(Number.isNaN(packet.fieldValues[1]), true);

const request = createLafeaResultRenderRequest({
  intake: readyIntake(packet),
  viewport: viewport(packet),
  mode: 'STRESS_CONTOUR',
});
assert.equal(request.diagnosticDisplay.diagnosticVertexCount, 1);
assert.equal(Number.isNaN(request.renderPacket.fieldValues[1]), true);
assert.equal(request.renderPacket.field.bounds.minimum, 10);
assert.equal(request.renderPacket.field.bounds.maximum, 30);

const canvas = new FakeCanvas();
const THREE = fakeThree(true);
const renderer = createThreeMeshRendererV2(THREE, canvas);
const rendered = renderer.render(request);
assert.equal(rendered.diagnosticVertexCount, 1);
assert.equal(rendered.diagnosticPolicyId, display.policy.policyId);
assert.equal(rendered.diagnosticPolicyHash, display.policy.semanticHash);
assert.equal(canvas.dataset.diagnosticVertexCount, '1');
assert.equal(canvas.dataset.diagnosticPolicyId, display.policy.policyId);
assert.equal(canvas.dataset.diagnosticPolicyHash, display.policy.semanticHash);
assert.deepEqual(
  [...THREE.lastGeometry.attributes.color.array.slice(3, 6)],
  [1, 0, 1],
);
assert.equal(Number.isNaN(THREE.lastGeometry.attributes.resultValue.array[1]), true);
assert.deepEqual([...THREE.lastGeometry.attributes.qualityFlag.array], [0, 1, 0]);
renderer.clearCurrentScene();
assert.equal(canvas.dataset.diagnosticVertexCount, undefined);
assert.equal(canvas.dataset.diagnosticPolicyId, undefined);
assert.equal(canvas.dataset.diagnosticPolicyHash, undefined);
renderer.dispose();

const producerRole = clonePacket(packet);
producerRole.field.kind = 'PROJECTED_NODAL';
producerRole.field.units = 'MPa';
producerRole.field.sourcePath = 'qualifiedRecovery.displayFields.FIELD-U4J-PRODUCER';
producerRole.field.valueRole = 'PRODUCER_PROJECTED_DISPLAY_ONLY';
assert.throws(
  () => createLafeaResultRenderRequest({
    intake: readyIntake(producerRole),
    viewport: viewport(producerRole),
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_RESULT_RENDER_DIAGNOSTIC_FIELD_UNSUPPORTED',
);

const noFlag = clonePacket(packet);
noFlag.fieldValues = new Float32Array([10, 20, 30]);
noFlag.qualityFlags = new Uint8Array([0, 0, 0]);
assert.throws(
  () => createLafeaResultRenderRequest({
    intake: readyIntake(noFlag),
    viewport: viewport(noFlag),
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_RESULT_RENDER_DIAGNOSTIC_FLAG_REQUIRED',
);

const unsupportedFlag = clonePacket(packet);
unsupportedFlag.qualityFlags = new Uint8Array([0, 2, 0]);
assert.throws(
  () => createLafeaResultRenderRequest({
    intake: readyIntake(unsupportedFlag),
    viewport: viewport(unsupportedFlag),
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_DIAGNOSTIC_DISPLAY_QUALITY_FLAG_UNSUPPORTED',
);

console.log(JSON.stringify({
  check: 'lafea-u4j-diagnostic-field-display',
  status: 'PASS',
  validFlag: LAFEA_RENDER_QUALITY_FLAGS.VALID,
  unrecoveredFlag: LAFEA_RENDER_QUALITY_FLAGS.UNRECOVERED,
  diagnosticColor: LAFEA_UNRECOVERED_VERTEX_DISPLAY_POLICY.color,
  originalNaNRetained: true,
  smoothingApplied: false,
  averagingApplied: false,
  boundsRecomputed: false,
  producerRoleDiagnosticsAccepted: false,
  unsupportedFlagsAccepted: false,
}));

function diagnosticPacket() {
  const value = u4gRenderPacket(17);
  value.fieldValues = new Float32Array([10, Number.NaN, 30]);
  value.qualityFlags = new Uint8Array([0, 1, 0]);
  value.field = {
    ...value.field,
    fieldId: 'FIELD-U4J-DIAGNOSTIC',
    kind: 'MESH_QUALITY',
    units: 'FLAG',
    sourcePath: 'qualifiedRecovery.displayFields.FIELD-U4J-DIAGNOSTIC',
    valueRole: 'DIAGNOSTIC_VERTEX_FIELD',
    bounds: {
      minimum: 10,
      maximum: 30,
      source: 'QUALIFIED_RECOVERY_FINITE_FIELD_BOUNDS',
      semanticHash: 'sha256:u4j-finite-bounds',
    },
  };
  value.lineage = {
    ...value.lineage,
    renderProfileHash: 'sha256:u4j-diagnostic-render-profile',
  };
  return sealRenderPacketV2(value);
}

function readyIntake(renderPacket) {
  return {
    schema: LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
    stageId: renderPacket.stageId,
    sceneRevision: renderPacket.sceneRevision,
    status: 'READY',
    renderEvidenceReady: true,
    packet: renderPacket,
    blockingReasons: [],
  };
}

function viewport(renderPacket) {
  return {
    schema: 'LafeaViewportState.v2',
    projection: 'XY_ENGINEERING',
    cameraMode: 'ORTHOGRAPHIC',
    worldBounds: {
      minimum: { x: -0.1, y: -0.1, z: 0 },
      maximum: { x: 1.1, y: 1.1, z: 0 },
    },
    viewMatrix: identity(),
    projectionMatrix: identity(),
    cssWidth: 640,
    cssHeight: 420,
    devicePixelRatio: 1,
    clippingPlanes: [],
    displayOptions: {
      sourceAuthoring: false,
      wireframe: false,
      fieldBounds: structuredClone(renderPacket.field.bounds),
      colorMapId: renderPacket.field.colorMapId,
      deformationScale: 0,
    },
  };
}

function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function clonePacket(value) {
  return {
    ...value,
    positions: new Float32Array(value.positions),
    vertexMeshNodeIds: [...value.vertexMeshNodeIds],
    drawTriangleIndices: new Uint32Array(value.drawTriangleIndices),
    drawTriangleElementIndices: new Uint32Array(value.drawTriangleElementIndices),
    sourceElementIds: [...value.sourceElementIds],
    fieldValues: new Float32Array(value.fieldValues),
    qualityFlags: new Uint8Array(value.qualityFlags),
    field: structuredClone(value.field),
    pickMap: structuredClone(value.pickMap),
    lineage: structuredClone(value.lineage),
  };
}
