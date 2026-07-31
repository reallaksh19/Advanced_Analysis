#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_RESULT_RENDER_MODES,
  LAFEA_RESULT_RENDER_REQUEST_SCHEMA,
  createLafeaResultRenderRequest,
  requireLafeaResultRenderRequest,
} from '../src/workspace/lafea-canvas/result-render-request.js';
import {
  LAFEA_THREE_RENDER_RESULT_SCHEMA,
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
import * as publicSurface from '../src/workspace/lafea-workbench.js';

function run() {
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packet = sealRenderPacketV2(renderPacket());
const intake = readyIntake(packet);
const viewport = resultViewport(packet);

assert.equal(LAFEA_RESULT_RENDER_REQUEST_SCHEMA, 'LafeaResultRenderRequest.v1');
assert.deepEqual(LAFEA_RESULT_RENDER_MODES, ['STRESS_CONTOUR']);
assert.ok(Object.isFrozen(LAFEA_RESULT_RENDER_MODES));

const request = createLafeaResultRenderRequest({
  intake,
  viewport,
  mode: 'STRESS_CONTOUR',
});
assert.equal(request.schema, LAFEA_RESULT_RENDER_REQUEST_SCHEMA);
assert.equal(request.stageId, 'LAFEA.3');
assert.equal(request.sceneRevision, 12);
assert.equal(request.mode, 'STRESS_CONTOUR');
assert.equal(request.displayedPrimitiveCount, 2);
assert.equal(request.renderPacket.drawTriangleIndices.length, 6);
assert.ok(Object.isFrozen(request));
assert.equal(requireLafeaResultRenderRequest(request), request);
packet.fieldValues[0] = 77;
assert.equal(request.renderPacket.fieldValues[0], 0);
packet.fieldValues[0] = 0;

assert.throws(
  () => createLafeaResultRenderRequest({
    intake: { ...intake, status: 'BLOCKED', renderEvidenceReady: false, packet: null,
      blockingReasons: ['BLOCKED'] },
    viewport,
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_RESULT_RENDER_READY_INTAKE_REQUIRED',
);
assert.throws(
  () => createLafeaResultRenderRequest({
    intake,
    viewport: {
      ...viewport,
      displayOptions: {
        ...viewport.displayOptions,
        fieldBounds: { ...viewport.displayOptions.fieldBounds, maximum: 999 },
      },
    },
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_RESULT_FIELD_BOUNDS_MISMATCH',
);
assert.throws(
  () => createLafeaResultRenderRequest({
    intake,
    viewport: {
      ...viewport,
      displayOptions: { ...viewport.displayOptions, colorMapId: 'JET' },
    },
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_RESULT_COLOR_MAP_MISMATCH',
);
assert.throws(
  () => createLafeaResultRenderRequest({
    intake,
    viewport: {
      ...viewport,
      displayOptions: { ...viewport.displayOptions, deformationScale: 1 },
    },
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_RESULT_VIEWPORT_AUTHORITY_INVALID',
);
assert.throws(
  () => createLafeaResultRenderRequest({ intake, viewport, mode: 'FILLED_MESH' }),
  (error) => error.code === 'LAFEA_RESULT_RENDER_MODE_UNSUPPORTED',
);
const diagnosticPacket = sealRenderPacketV2({
  ...renderPacket(),
  fieldValues: new Float32Array([0, Number.NaN, 100, 50]),
  qualityFlags: new Uint8Array([0, 1, 0, 0]),
});
assert.throws(
  () => createLafeaResultRenderRequest({
    intake: readyIntake(diagnosticPacket),
    viewport: resultViewport(diagnosticPacket),
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_RESULT_RENDER_DIAGNOSTIC_FIELD_UNSUPPORTED',
);

const canvas = new FakeCanvas();
const THREE = fakeThree(true);
const adapter = createThreeMeshRendererV2(THREE, canvas);
assert.equal(adapter.isAvailable(), true);
const rendered = adapter.render(request);
assert.equal(rendered.schema, LAFEA_THREE_RENDER_RESULT_SCHEMA);
assert.equal(rendered.renderer, 'THREE_WEBGL');
assert.equal(rendered.triangleCount, 2);
assert.equal(rendered.meshHash, packet.lineage.meshHash);
assert.equal(rendered.recoveryHash, packet.lineage.recoveryHash);
assert.equal(canvas.dataset.ready, 'true');
assert.equal(canvas.dataset.renderer, 'THREE_WEBGL');
assert.equal(canvas.dataset.stageId, 'LAFEA.3');
assert.equal(canvas.dataset.sceneRevision, '12');
assert.equal(canvas.dataset.fieldId, 'FIELD-U4E');
assert.equal(THREE.lastRenderer.renderCount, 1);
assert.deepEqual(
  [...THREE.lastGeometry.index.array],
  [...packet.drawTriangleIndices],
);
assert.equal(THREE.lastGeometry.attributes.position.array, request.renderPacket.positions);
assert.notEqual(THREE.lastGeometry.attributes.position.array, packet.positions);
assert.deepEqual([...THREE.lastGeometry.attributes.position.array], [...packet.positions]);
assert.equal(THREE.lastGeometry.attributes.color.array.length, packet.fieldValues.length * 3);
assert.ok([...THREE.lastGeometry.attributes.color.array].every(Number.isFinite));
assert.deepEqual(THREE.lastRenderer.size, [640, 420, false]);
assert.equal(THREE.lastRenderer.pixelRatio, 2);

adapter.setVisible(false);
assert.equal(canvas.hidden, true);
adapter.setVisible(true);
assert.equal(canvas.hidden, false);
canvas.dispatch('webglcontextlost');
assert.equal(canvas.dataset.ready, 'false');
assert.equal(THREE.lastGeometry.disposed, true);
assert.equal(THREE.lastMaterial.disposed, true);

adapter.dispose();
assert.equal(adapter.isAvailable(), false);
assert.equal(THREE.lastRenderer.disposed, true);
assert.equal(THREE.lastRenderer.contextLost, true);
assert.throws(
  () => adapter.render(request),
  (error) => error.code === 'LAFEA_V2_RENDERER_DESTROYED',
);

const unavailable = createThreeMeshRendererV2(fakeThree(false), new FakeCanvas());
assert.equal(unavailable.isAvailable(), false);
assert.throws(
  () => unavailable.render(request),
  (error) => error.code === 'LAFEA_V2_WEBGL2_REQUIRED',
);
unavailable.dispose();

for (const name of [
  'LAFEA_RESULT_RENDER_MODES',
  'LAFEA_RESULT_RENDER_REQUEST_SCHEMA',
  'createLafeaResultRenderRequest',
  'requireLafeaResultRenderRequest',
  'LAFEA_THREE_RENDER_RESULT_SCHEMA',
  'createThreeMeshRendererV2',
]) {
  assert.equal(publicSurface[name], {
    LAFEA_RESULT_RENDER_MODES,
    LAFEA_RESULT_RENDER_REQUEST_SCHEMA,
    createLafeaResultRenderRequest,
    requireLafeaResultRenderRequest,
    LAFEA_THREE_RENDER_RESULT_SCHEMA,
    createThreeMeshRendererV2,
  }[name], `${name} must be re-exported without wrapping.`);
}

const requestSource = fs.readFileSync(
  path.join(ROOT, 'src/workspace/lafea-canvas/result-render-request.js'),
  'utf8',
);
const rendererSource = fs.readFileSync(
  path.join(ROOT, 'src/workspace/lafea-canvas/three-mesh-renderer-v2.js'),
  'utf8',
);
const viewSource = fs.readFileSync(
  path.join(ROOT, 'src/workspace/lafea-workbench-view.js'),
  'utf8',
);
assert.doesNotMatch(requestSource, /SVG_FALLBACK|CANVAS2D_FALLBACK|RASTER_WEBGL_CAPTURE/u);
assert.doesNotMatch(requestSource, /createLafeaArtifactRecord|registerLafeaArtifact|triangulate|packQualified/u);
assert.doesNotMatch(rendererSource, /LafeaRenderPacket\.v1|render-packet-contract\.js|\.indices\b/u);
assert.doesNotMatch(rendererSource, /createHybridViewport|lafea-workbench-view/u);
assert.match(rendererSource, /drawTriangleIndices/u);
assert.match(rendererSource, /THREE_WEBGL/u);
assert.doesNotMatch(viewSource, /createThreeMeshRendererV2|createLafeaResultRenderRequest/u);
assert.ok(requestSource.split(/\r?\n/u).length <= 220);
assert.ok(rendererSource.split(/\r?\n/u).length <= 200);

console.log(JSON.stringify({
  check: 'lafea-u4e-v2-result-renderer-adapter',
  status: 'PASS',
  acceptedMode: 'STRESS_CONTOUR',
  v2DrawTrianglesUsed: true,
  diagnosticFieldsRendered: false,
  fallbackRendererUsed: false,
  liveWorkbenchMounted: false,
  numericalAuthorityChanged: false,
  lafea6Enabled: false,
}));
}

function readyIntake(renderPacketValue) {
  return Object.freeze({
    schema: LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
    stageId: renderPacketValue.stageId,
    sceneRevision: renderPacketValue.sceneRevision,
    status: 'READY',
    renderEvidenceReady: true,
    packet: renderPacketValue,
    blockingReasons: Object.freeze([]),
  });
}

function renderPacket() {
  return {
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision: 12,
    stageId: 'LAFEA.3',
    sourceElementType: 'Q8',
    positions: new Float32Array([
      0, 0, 0,
      2, 0, 0,
      2, 1, 0,
      0, 1, 0,
    ]),
    vertexMeshNodeIds: ['N1', 'N2', 'N3', 'N4'],
    drawTriangleIndices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    drawTriangleElementIndices: new Uint32Array([0, 0]),
    sourceElementIds: ['E-Q8-1'],
    fieldValues: new Float32Array([0, 25, 100, 50]),
    qualityFlags: new Uint8Array([0, 0, 0, 0]),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: 'FIELD-U4E',
      kind: 'PROJECTED_NODAL',
      units: 'MPa',
      sourcePath: 'qualifiedRecovery.displayFields.FIELD-U4E',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum: 0,
        maximum: 100,
        source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
        semanticHash: 'sha256:bounds-u4e',
      },
      colorMapId: 'COOL_WARM',
    },
    pickMap: {
      schema: 'LafeaPickMap.v1',
      sceneRevision: 12,
      entries: [{
        drawGroup: 'TRIANGLES',
        primitiveStart: 0,
        primitiveEnd: 2,
        sourceEntityId: 'SOURCE-E-Q8-1',
        meshEntityId: 'E-Q8-1',
        entityRole: 'ELEMENT',
      }],
    },
    lineage: {
      schema: LAFEA_RENDER_LINEAGE_SCHEMA,
      sourceHash: 'sha256:source-u4e',
      topologyHash: 'sha256:topology-u4e',
      meshHash: 'sha256:mesh-u4e',
      executionHash: 'sha256:execution-u4e',
      recoveryHash: 'sha256:recovery-u4e',
      displayGeometryHash: 'sha256:display-u4e',
      renderProfileHash: 'sha256:profile-u4e',
      producerRef: 'U4E-TEST-PRODUCER',
    },
  };
}

function resultViewport(renderPacketValue) {
  return {
    schema: 'LafeaViewportState.v2',
    projection: 'XY_ENGINEERING',
    cameraMode: 'ORTHOGRAPHIC',
    worldBounds: {
      minimum: { x: -0.1, y: -0.1, z: 0 },
      maximum: { x: 2.1, y: 1.1, z: 0 },
    },
    viewMatrix: identityMatrix(),
    projectionMatrix: identityMatrix(),
    cssWidth: 640,
    cssHeight: 420,
    devicePixelRatio: 2,
    clippingPlanes: [],
    displayOptions: {
      sourceAuthoring: false,
      wireframe: false,
      fieldBounds: structuredClone(renderPacketValue.field.bounds),
      colorMapId: renderPacketValue.field.colorMapId,
      deformationScale: 0,
    },
  };
}

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

class FakeCanvas {
  constructor() {
    this.dataset = {};
    this.hidden = false;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.({ preventDefault() {} });
  }
}

function fakeThree(webgl2) {
  const api = { DoubleSide: 'DOUBLE_SIDE' };
  class Matrix {
    fromArray(value) { this.value = [...value]; return this; }
    copy(value) { this.value = [...(value.value ?? [])]; return this; }
    invert() { this.inverted = true; return this; }
  }
  api.WebGLRenderer = class {
    constructor({ canvas }) {
      this.domElement = canvas;
      this.capabilities = { isWebGL2: webgl2 };
      this.renderCount = 0;
      api.lastRenderer = this;
    }
    setPixelRatio(value) { this.pixelRatio = value; }
    setSize(...value) { this.size = value; }
    render(scene, camera) { this.scene = scene; this.camera = camera; this.renderCount += 1; }
    dispose() { this.disposed = true; }
    forceContextLoss() { this.contextLost = true; }
  };
  api.Scene = class {
    constructor() { this.objects = []; }
    add(object) { this.objects.push(object); }
    remove(object) { this.objects = this.objects.filter((candidate) => candidate !== object); }
  };
  api.BufferGeometry = class {
    constructor() { this.attributes = {}; api.lastGeometry = this; }
    setAttribute(name, value) { this.attributes[name] = value; }
    setIndex(value) { this.index = value; }
    dispose() { this.disposed = true; }
  };
  api.BufferAttribute = class {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
  };
  api.MeshBasicMaterial = class {
    constructor(options) { this.options = options; api.lastMaterial = this; }
    dispose() { this.disposed = true; }
  };
  api.Mesh = class {
    constructor(geometry, material) { this.geometry = geometry; this.material = material; }
  };
  api.Camera = class {
    constructor() {
      this.matrixWorldInverse = new Matrix();
      this.matrixWorld = new Matrix();
      this.projectionMatrix = new Matrix();
      this.projectionMatrixInverse = new Matrix();
    }
  };
  return api;
}

run();
