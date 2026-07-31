#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  createLafeaResultRenderRequest,
} from '../src/workspace/lafea-canvas/result-render-request.js';
import {
  createThreeMeshRendererV2,
} from '../src/workspace/lafea-canvas/three-mesh-renderer-v2.js';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  sealRenderPacketV2,
} from '../src/workspace/lafea-canvas/render-packet-v2-contract.js';
import {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
} from '../src/workspace/lafea-render-evidence-intake.js';

const packet = sealRenderPacketV2(packetValue());
const request = createLafeaResultRenderRequest({
  intake: {
    schema: LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
    stageId: packet.stageId,
    sceneRevision: packet.sceneRevision,
    status: 'READY',
    renderEvidenceReady: true,
    packet,
    blockingReasons: [],
  },
  viewport: viewportValue(packet),
  mode: 'STRESS_CONTOUR',
});
const canvas = new FakeCanvas();
const THREE = fakeThree();
const adapter = createThreeMeshRendererV2(THREE, canvas);

adapter.render(request);
const firstGeometry = THREE.lastGeometry;
const firstMaterial = THREE.lastMaterial;
assert.equal(canvas.dataset.ready, 'true');
assert.equal(canvas.dataset.renderer, 'THREE_WEBGL');

adapter.clearCurrentScene();
assert.equal(canvas.dataset.ready, 'false');
assert.equal(canvas.dataset.renderer, undefined);
assert.equal(canvas.dataset.stageId, undefined);
assert.equal(canvas.dataset.sceneRevision, undefined);
assert.equal(canvas.dataset.fieldId, undefined);
assert.equal(firstGeometry.disposed, true);
assert.equal(firstMaterial.disposed, true);

adapter.render(request);
const secondGeometry = THREE.lastGeometry;
const secondMaterial = THREE.lastMaterial;
assert.notEqual(secondGeometry, firstGeometry);
assert.equal(canvas.dataset.ready, 'true');
canvas.dispatch('webglcontextlost');
assert.equal(canvas.dataset.ready, 'false');
assert.equal(canvas.dataset.renderer, undefined);
assert.equal(secondGeometry.disposed, true);
assert.equal(secondMaterial.disposed, true);
assert.equal(adapter.isAvailable(), false);
assert.throws(
  () => adapter.render(request),
  (error) => error.code === 'LAFEA_V2_WEBGL_CONTEXT_LOST',
);

canvas.dispatch('webglcontextrestored');
assert.equal(adapter.isAvailable(), true);
assert.equal(canvas.dataset.ready, 'false');
adapter.render(request);
assert.equal(canvas.dataset.ready, 'true');
adapter.dispose();
assert.equal(canvas.dataset.ready, 'false');
assert.equal(canvas.dataset.renderer, undefined);
assert.equal(THREE.lastRenderer.disposed, true);
assert.equal(THREE.lastRenderer.contextLost, true);

console.log(JSON.stringify({
  check: 'lafea-u4e-renderer-state-truth',
  status: 'PASS',
  explicitClearReady: false,
  contextLossReady: false,
  contextRestoreRequiresRerender: true,
  disposeReady: false,
  staleIdentityRetained: false,
}));

function packetValue() {
  return {
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision: 1,
    stageId: 'LAFEA.3',
    sourceElementType: 'T3',
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    vertexMeshNodeIds: ['N1', 'N2', 'N3'],
    drawTriangleIndices: new Uint32Array([0, 1, 2]),
    drawTriangleElementIndices: new Uint32Array([0]),
    sourceElementIds: ['E1'],
    fieldValues: new Float32Array([0, 50, 100]),
    qualityFlags: new Uint8Array([0, 0, 0]),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: 'FIELD-STATE',
      kind: 'PROJECTED_NODAL',
      units: 'MPa',
      sourcePath: 'qualifiedRecovery.displayFields.FIELD-STATE',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum: 0,
        maximum: 100,
        source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
        semanticHash: 'sha256:bounds-state',
      },
      colorMapId: 'COOL_WARM',
    },
    pickMap: {
      schema: 'LafeaPickMap.v1',
      sceneRevision: 1,
      entries: [{
        drawGroup: 'TRIANGLES', primitiveStart: 0, primitiveEnd: 1,
        sourceEntityId: 'SOURCE-E1', meshEntityId: 'E1', entityRole: 'ELEMENT',
      }],
    },
    lineage: {
      schema: LAFEA_RENDER_LINEAGE_SCHEMA,
      sourceHash: 'sha256:source-state',
      topologyHash: 'sha256:topology-state',
      meshHash: 'sha256:mesh-state',
      executionHash: 'sha256:execution-state',
      recoveryHash: 'sha256:recovery-state',
      displayGeometryHash: 'sha256:display-state',
      renderProfileHash: 'sha256:profile-state',
      producerRef: 'U4E-STATE-GUARD',
    },
  };
}

function viewportValue(packetValueInput) {
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return {
    schema: 'LafeaViewportState.v2', projection: 'XY_ENGINEERING',
    cameraMode: 'ORTHOGRAPHIC',
    worldBounds: { minimum: { x: -0.1, y: -0.1, z: 0 }, maximum: { x: 1.1, y: 1.1, z: 0 } },
    viewMatrix: matrix, projectionMatrix: matrix,
    cssWidth: 400, cssHeight: 300, devicePixelRatio: 1,
    clippingPlanes: [],
    displayOptions: {
      sourceAuthoring: false, wireframe: false,
      fieldBounds: structuredClone(packetValueInput.field.bounds),
      colorMapId: packetValueInput.field.colorMapId, deformationScale: 0,
    },
  };
}

class FakeCanvas {
  constructor() { this.dataset = {}; this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type) { this.listeners.get(type)?.({ preventDefault() {} }); }
}

function fakeThree() {
  const api = { DoubleSide: 'DOUBLE_SIDE' };
  class Matrix {
    fromArray(value) { this.value = [...value]; return this; }
    copy(value) { this.value = [...(value.value ?? [])]; return this; }
    invert() { return this; }
  }
  api.WebGLRenderer = class {
    constructor({ canvas }) { this.domElement = canvas; this.capabilities = { isWebGL2: true }; api.lastRenderer = this; }
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() { this.disposed = true; }
    forceContextLoss() { this.contextLost = true; }
  };
  api.Scene = class {
    constructor() { this.objects = []; }
    add(value) { this.objects.push(value); }
    remove(value) { this.objects = this.objects.filter((row) => row !== value); }
  };
  api.BufferGeometry = class {
    constructor() { this.attributes = {}; api.lastGeometry = this; }
    setAttribute(name, value) { this.attributes[name] = value; }
    setIndex(value) { this.index = value; }
    dispose() { this.disposed = true; }
  };
  api.BufferAttribute = class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } };
  api.MeshBasicMaterial = class {
    constructor() { api.lastMaterial = this; }
    dispose() { this.disposed = true; }
  };
  api.Mesh = class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } };
  api.Camera = class {
    constructor() {
      this.matrixWorldInverse = new Matrix(); this.matrixWorld = new Matrix();
      this.projectionMatrix = new Matrix(); this.projectionMatrixInverse = new Matrix();
    }
  };
  return api;
}
