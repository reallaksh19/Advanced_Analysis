#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createLafeaSourceEngineeringScene,
} from '../src/workspace/lafea-engineering-scene.js';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  sealRenderPacketV2,
} from '../src/workspace/lafea-canvas/render-packet-v2-contract.js';
import {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
} from '../src/workspace/lafea-render-evidence-intake.js';
import {
  mountLafeaHybridResultViewport,
} from '../src/workspace/lafea-hybrid-result-viewport.js';
import * as publicSurface from '../src/workspace/lafea-workbench.js';

function run() {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourceHash = 'sha256:u4f-mounted-source';
  const scene = sourceScene(9, sourceHash);
  const packet = sealRenderPacketV2(packetValue(9, sourceHash));
  const viewport = viewportValue(packet);
  const readyIntake = intakeReady(packet);

  const documentRef = new FakeDocument();
  const root = documentRef.createElement('div');
  const THREE = fakeThree(true);
  const selections = [];
  const mounted = mountLafeaHybridResultViewport(root, {
    stageId: 'LAFEA.3',
    sourceScene: scene,
    intake: readyIntake,
    viewport,
    selection: null,
    THREE,
    onSelectionChange: (selection) => selections.push(selection),
  });

  assert.equal(mounted.getState().status, 'READY');
  assert.equal(mounted.getState().renderer, 'THREE_WEBGL');
  assert.equal(mounted.getState().renderResult.fieldId, 'FIELD-U4F-MOUNT');
  assert.equal(root.dataset.resultStatus, 'READY');
  assert.equal(root.dataset.resultRenderer, 'THREE_WEBGL');
  assert.equal(root.dataset.resultFieldId, 'FIELD-U4F-MOUNT');
  assert.equal(root.dataset.resultBlockingReasonCount, '0');
  assert.equal(root.children.length, 3);
  assert.equal(root.children[0].dataset.layer, 'webgl');
  assert.equal(root.children[1].dataset.layer, 'engineering-overlay');
  assert.equal(root.children[2].dataset.layer, 'accessible-inspector');
  assert.equal(root.children[0].dataset.ready, 'true');
  assert.equal(root.children[0].hidden, false);
  assert.ok(root.children[1].querySelectorAll('[data-node-id]').length >= 3);
  assert.match(
    root.children[2].querySelector('[data-role="lafea-result-display-status"]').textContent,
    /Result display READY: FIELD-U4F-MOUNT/u,
  );

  const initialRenderCount = THREE.lastRenderer.renderCount;
  const nodeN2 = root.children[1].querySelectorAll('[data-node-id]')
    .find((node) => node.dataset.nodeId === 'N2');
  nodeN2.dispatchEvent({ type: 'click' });
  assert.equal(mounted.getSelection().sourceEntityId, 'N2');
  assert.equal(selections.at(-1).sourceEntityId, 'N2');
  assert.ok(THREE.lastRenderer.renderCount > initialRenderCount);
  assert.ok(root.children[1].querySelectorAll('[data-node-id]').some(
    (node) => node.dataset.nodeId === 'N2'
      && node.dataset.selected === 'true'
      && node.classList.contains('lafea-svg-highlighted'),
  ));
  assert.match(root.children[2].children[1].textContent, /Selected Entity: N2 \(SOURCE\)/u);
  assert.throws(
    () => mounted.selectSource('0'),
    (error) => error.code === 'LAFEA_HYBRID_RESULT_SOURCE_SELECTION_INVALID',
  );
  mounted.clearSelection();
  assert.equal(mounted.getSelection().sourceEntityId, null);

  const canvas = root.children[0];
  canvas.dispatchEvent({ type: 'webglcontextlost' });
  assert.equal(mounted.getState().status, 'BLOCKED');
  assert.equal(mounted.getState().renderer, 'SVG');
  assert.ok(mounted.getState().blockingReasons.includes(
    'LAFEA_HYBRID_RESULT_WEBGL_CONTEXT_LOST',
  ));
  assert.equal(root.dataset.resultStatus, 'BLOCKED');
  assert.equal(root.dataset.resultRenderer, 'SVG');
  assert.equal(canvas.dataset.ready, 'false');
  assert.equal(canvas.hidden, true);
  assert.match(
    root.children[2].querySelector('[data-role="lafea-result-display-status"]').textContent,
    /Result display BLOCKED/u,
  );

  canvas.dispatchEvent({ type: 'webglcontextrestored' });
  assert.ok(mounted.getState().blockingReasons.includes(
    'LAFEA_HYBRID_RESULT_RERENDER_REQUIRED',
  ));
  assert.equal(mounted.getState().status, 'BLOCKED');
  const refreshed = mounted.refresh();
  assert.equal(refreshed.status, 'READY');
  assert.equal(refreshed.renderer, 'THREE_WEBGL');
  assert.equal(canvas.dataset.ready, 'true');
  assert.equal(canvas.hidden, false);

  const unavailableRoot = new FakeDocument().createElement('div');
  const unavailable = mountLafeaHybridResultViewport(unavailableRoot, {
    stageId: 'LAFEA.3',
    sourceScene: scene,
    intake: readyIntake,
    viewport,
    selection: null,
    THREE: fakeThree(false),
  });
  assert.equal(unavailable.getState().status, 'BLOCKED');
  assert.equal(unavailable.getState().renderer, 'SVG');
  assert.ok(unavailable.getState().blockingReasons.includes(
    'LAFEA_HYBRID_RESULT_WEBGL_UNAVAILABLE',
  ));
  assert.ok(unavailableRoot.children[1].querySelectorAll('[data-node-id]').length >= 3);
  assert.equal(unavailableRoot.children[0].dataset.ready, 'false');
  assert.equal(unavailable.refresh().status, 'BLOCKED');

  const blockedRoot = new FakeDocument().createElement('div');
  const blocked = mountLafeaHybridResultViewport(blockedRoot, {
    stageId: 'LAFEA.3',
    sourceScene: scene,
    intake: {
      schema: LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
      stageId: 'LAFEA.3',
      sceneRevision: 9,
      status: 'BLOCKED',
      renderEvidenceReady: false,
      packet: null,
      blockingReasons: ['LAFEA_RENDER_LIFECYCLE_RESULT_NOT_READY'],
    },
    viewport: sourceOnlyViewport(),
    selection: null,
    THREE: null,
  });
  assert.equal(blocked.getState().status, 'BLOCKED');
  assert.equal(blocked.getState().renderer, 'SVG');
  assert.deepEqual(blocked.getState().blockingReasons, [
    'LAFEA_RENDER_LIFECYCLE_RESULT_NOT_READY',
  ]);
  assert.equal(blockedRoot.children[0].dataset.ready, 'false');
  assert.ok(blockedRoot.children[1].querySelectorAll('[data-node-id]').length >= 3);
  assert.match(
    blockedRoot.children[2].querySelector('[data-role="lafea-result-blocking-reasons"]')
      .children[0].textContent,
    /LAFEA_RENDER_LIFECYCLE_RESULT_NOT_READY/u,
  );

  assert.notStrictEqual(
    publicSurface.mountLafeaHybridResultViewport,
    mountLafeaHybridResultViewport,
  );
  const coordinatorSource = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-hybrid-result-viewport.js'),
    'utf8',
  );
  const sharedOverlaySource = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-canvas/source-overlay-adapter.js'),
    'utf8',
  );
  const sourceViewportSource = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-source-workbench-viewport.js'),
    'utf8',
  );
  const hybridSource = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-canvas/hybrid-viewport.js'),
    'utf8',
  );
  const liveViewSource = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-workbench-view.js'),
    'utf8',
  );
  assert.match(coordinatorSource, /LAFEA_HYBRID_RESULT_WEBGL_UNAVAILABLE/u);
  assert.match(coordinatorSource, /LAFEA_HYBRID_RESULT_RERENDER_REQUIRED/u);
  assert.doesNotMatch(coordinatorSource, /stage\.execution|initializeLifecycle|registerLifecycleArtifact/u);
  assert.doesNotMatch(coordinatorSource, /SVG_FALLBACK|CANVAS2D_FALLBACK|RASTER_WEBGL_CAPTURE/u);
  assert.match(sourceViewportSource, /renderLafeaSourceOverlay/u);
  assert.doesNotMatch(sourceViewportSource, /function sourceGeometry|function bindSourceSelection/u);
  assert.match(sharedOverlaySource, /renderLafeaWorkbenchSvg/u);
  assert.match(hybridSource, /isAvailable\(canvas\)/u);
  assert.doesNotMatch(liveViewSource, /mountLafeaHybridResultViewport/u);

  blocked.destroy();
  unavailable.destroy();
  mounted.destroy();
  assert.equal(root.children.length, 0);
  assert.equal(root.dataset.resultStatus, 'DESTROYED');
  assert.equal(root.dataset.resultRenderer, undefined);
  assert.equal(root.dataset.resultFieldId, undefined);
  assert.equal(root.dataset.resultBlockingReasons, undefined);

  console.log(JSON.stringify({
    check: 'lafea-u4f-hybrid-result-viewport',
    status: 'PASS',
    readyRenderer: 'THREE_WEBGL',
    blockedRenderer: 'SVG',
    sourceOverlayAlwaysVisible: true,
    exactSourceSelection: true,
    publicFacadeIsolated: true,
    webglFallbackUsed: false,
    contextRestoreRequiresRefresh: true,
    liveWorkbenchMounted: false,
    numericalAuthorityChanged: false,
    lafea6Enabled: false,
  }));
}

function sourceScene(sceneRevision, hash) {
  return createLafeaSourceEngineeringScene({
    stageId: 'LAFEA.3',
    document: {
      nodes: [
        { nodeId: 'N1', x: 0, y: 0, z: 0 },
        { nodeId: 'N2', x: 2, y: 0, z: 0 },
        { nodeId: 'N3', x: 0, y: 1, z: 0 },
      ],
      elements: [{ elementId: 'E1', nodeIds: ['N1', 'N2', 'N3'] }],
    },
    lifecycle: { source: { sourceHash: hash } },
    lifecycleBinding: { status: 'CURRENT' },
    sceneRevision,
  });
}

function intakeReady(renderPacket) {
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

function packetValue(sceneRevision, hash) {
  return {
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision,
    stageId: 'LAFEA.3',
    sourceElementType: 'T3',
    positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 1, 0]),
    vertexMeshNodeIds: ['N1', 'N2', 'N3'],
    drawTriangleIndices: new Uint32Array([0, 1, 2]),
    drawTriangleElementIndices: new Uint32Array([0]),
    sourceElementIds: ['E1'],
    fieldValues: new Float32Array([0, 50, 100]),
    qualityFlags: new Uint8Array([0, 0, 0]),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: 'FIELD-U4F-MOUNT',
      kind: 'PROJECTED_NODAL',
      units: 'MPa',
      sourcePath: 'qualifiedRecovery.displayFields.FIELD-U4F-MOUNT',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum: 0,
        maximum: 100,
        source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
        semanticHash: 'sha256:bounds-u4f-mount',
      },
      colorMapId: 'COOL_WARM',
    },
    pickMap: {
      schema: 'LafeaPickMap.v1',
      sceneRevision,
      entries: [{
        drawGroup: 'TRIANGLES', primitiveStart: 0, primitiveEnd: 1,
        sourceEntityId: 'N1', meshEntityId: 'E1', entityRole: 'ELEMENT',
      }],
    },
    lineage: {
      schema: LAFEA_RENDER_LINEAGE_SCHEMA,
      sourceHash: hash,
      topologyHash: 'sha256:topology-u4f-mount',
      meshHash: 'sha256:mesh-u4f-mount',
      executionHash: 'sha256:execution-u4f-mount',
      recoveryHash: 'sha256:recovery-u4f-mount',
      displayGeometryHash: 'sha256:display-u4f-mount',
      renderProfileHash: 'sha256:profile-u4f-mount',
      producerRef: 'U4F-MOUNT-TEST',
    },
  };
}

function viewportValue(renderPacket) {
  const matrix = identityMatrix();
  return {
    schema: 'LafeaViewportState.v2', projection: 'XY_ENGINEERING', cameraMode: 'ORTHOGRAPHIC',
    worldBounds: { minimum: { x: -0.1, y: -0.1, z: 0 }, maximum: { x: 2.1, y: 1.1, z: 0 } },
    viewMatrix: matrix, projectionMatrix: matrix,
    cssWidth: 640, cssHeight: 420, devicePixelRatio: 1, clippingPlanes: [],
    displayOptions: {
      sourceAuthoring: false, wireframe: false,
      fieldBounds: structuredClone(renderPacket.field.bounds),
      colorMapId: renderPacket.field.colorMapId, deformationScale: 0,
    },
  };
}

function sourceOnlyViewport() {
  const matrix = identityMatrix();
  return {
    schema: 'LafeaViewportState.v2', projection: 'XY_ENGINEERING', cameraMode: 'ORTHOGRAPHIC',
    worldBounds: { minimum: { x: -0.1, y: -0.1, z: 0 }, maximum: { x: 2.1, y: 1.1, z: 0 } },
    viewMatrix: matrix, projectionMatrix: matrix,
    cssWidth: 640, cssHeight: 420, devicePixelRatio: 1, clippingPlanes: [],
    displayOptions: {
      sourceAuthoring: false, wireframe: false,
      fieldBounds: null, colorMapId: null, deformationScale: 0,
    },
  };
}

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(this, tagName); }
  createElementNS(_namespace, tagName) { return new FakeElement(this, tagName); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
}

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.textContent = '';
    this.hidden = false;
  }
  append(...nodes) {
    nodes.filter(Boolean).forEach((node) => { node.parentNode = this; this.children.push(node); });
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.classList = new FakeClassList(String(value).split(/\s+/u).filter(Boolean));
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }
  dispatchEvent(event) {
    const normalized = {
      stopPropagation() {}, preventDefault() {}, ...event,
      target: this, currentTarget: this,
    };
    for (const listener of this.listeners.get(normalized.type) ?? []) listener(normalized);
    return true;
  }
  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (matchesSelector(child, selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 420 }; }
  setPointerCapture() {}
  scrollIntoView() {}
}

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

function matchesSelector(node, selector) {
  const match = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/u.exec(selector);
  if (!match) return false;
  const key = match[1].replace(/-([a-z])/gu, (_whole, letter) => letter.toUpperCase());
  if (!Object.hasOwn(node.dataset, key)) return false;
  return match[2] === undefined || node.dataset[key] === match[2];
}

function fakeThree(webgl2) {
  const api = { DoubleSide: 'DOUBLE_SIDE' };
  class Matrix {
    fromArray(value) { this.value = [...value]; return this; }
    copy(value) { this.value = [...(value.value ?? [])]; return this; }
    invert() { return this; }
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
    render() { this.renderCount += 1; }
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
    constructor(options) { this.options = options; api.lastMaterial = this; }
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

run();
