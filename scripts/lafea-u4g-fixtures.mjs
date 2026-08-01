import {
  applyLafeaLifecycleEvent,
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  createLafeaLifecycleEvent,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';
import { LAFEA_LIFECYCLE_BINDING_SCHEMA } from '../src/workspace/lafea-lifecycle-workbench-store.js';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
} from '../src/workspace/lafea-canvas/render-packet-v2-contract.js';

export const U4G_LINEAGE = Object.freeze({
  sourceHash: 'sha256:source-u4g',
  topologyHash: 'sha256:geometry-u4g',
  meshHash: 'sha256:mesh-u4g',
  executionHash: 'sha256:execution-u4g',
  recoveryHash: 'sha256:recovery-u4g',
  displayGeometryHash: 'sha256:display-geometry-u4g',
  renderProfileHash: 'sha256:render-profile-u4g',
});

export function u4gDocument() {
  return {
    nodes: [
      { nodeId: 'N1', x: 0, y: 0, z: 0 },
      { nodeId: 'N2', x: 1, y: 0, z: 0 },
      { nodeId: 'N3', x: 0, y: 1, z: 0 },
    ],
    elements: [{ elementId: 'E1', nodeIds: ['N1', 'N2', 'N3'] }],
  };
}

export function u4gQualifiedLifecycle(stageId = 'LAFEA.3', hashes = U4G_LINEAGE) {
  let value = createLafeaLifecycle(stageId, hashes.sourceHash);
  value = register(value, 'CANONICAL_MODEL', 'sha256:model-u4g', {
    sourceHash: hashes.sourceHash,
  }, 'REG-MODEL-U4G');
  value = register(value, 'ANALYSIS_GEOMETRY', hashes.topologyHash, {
    sourceHash: hashes.sourceHash,
    canonicalModelHash: 'sha256:model-u4g',
  }, 'REG-GEOMETRY-U4G');
  value = register(value, 'ANALYSIS_MESH', hashes.meshHash, {
    analysisGeometryHash: hashes.topologyHash,
    meshProfileHash: 'sha256:mesh-profile-u4g',
  }, 'REG-MESH-U4G');
  value = register(value, 'EXECUTION', hashes.executionHash, {
    canonicalModelHash: 'sha256:model-u4g',
    meshHash: hashes.meshHash,
    physicalLoadCaseHash: 'sha256:load-case-u4g',
    solverProfileHash: 'sha256:solver-profile-u4g',
  }, 'REG-EXECUTION-U4G');
  value = register(value, 'RECOVERY', hashes.recoveryHash, {
    executionHash: hashes.executionHash,
    meshHash: hashes.meshHash,
    recoveryProfileHash: 'sha256:recovery-profile-u4g',
  }, 'REG-RECOVERY-U4G');
  value = applyLafeaLifecycleEvent(value, createLafeaLifecycleEvent({
    eventId: 'EV-DISPLAY-GEOMETRY-U4G',
    stageId,
    changeClass: 'DISPLAY_MESH_DENSITY',
    profileHash: hashes.displayGeometryHash,
    originRef: 'U4G-TEST',
  }));
  return applyLafeaLifecycleEvent(value, createLafeaLifecycleEvent({
    eventId: 'EV-RENDER-PROFILE-U4G',
    stageId,
    changeClass: 'CONTOUR_PALETTE',
    profileHash: hashes.renderProfileHash,
    originRef: 'U4G-TEST',
  }));
}

export function u4gCurrentBinding(digest = 'fnv32:document-u4g') {
  return {
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status: 'CURRENT',
    boundDocumentDigest: digest,
    currentDocumentDigest: digest,
    reason: null,
    originRef: 'U4G-TEST',
  };
}

export function u4gStaleBinding() {
  return {
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status: 'STALE_DOCUMENT_REVISION',
    boundDocumentDigest: 'fnv32:document-u4g',
    currentDocumentDigest: 'fnv32:document-u4g-stale',
    reason: 'DOCUMENT_REVISION_CHANGED_WITHOUT_SOURCE_HASH_EVENT',
    originRef: 'U4G-TEST',
  };
}

export function u4gRenderPacket(
  sceneRevision = 1,
  stageId = 'LAFEA.3',
  hashes = U4G_LINEAGE,
) {
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
      fieldId: 'FIELD-U4G',
      kind: 'PROJECTED_NODAL',
      units: 'MPa',
      sourcePath: 'qualifiedRecovery.displayFields.FIELD-U4G',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum: 10,
        maximum: 30,
        source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
        semanticHash: 'sha256:bounds-u4g',
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
        sourceEntityId: 'E1',
        meshEntityId: 'E1',
        entityRole: 'ELEMENT',
      }],
    },
    lineage: {
      schema: LAFEA_RENDER_LINEAGE_SCHEMA,
      ...hashes,
      producerRef: 'U4G-PACKET-PRODUCER',
    },
  };
}

function register(lifecycle, kind, artifactHash, parentHashes, registrationId) {
  return registerLafeaArtifact(lifecycle, createLafeaArtifactRecord({
    stageId: lifecycle.stageId,
    kind,
    status: 'CURRENT',
    artifactHash,
    parentHashes,
    qualification: 'PASS',
    producerRef: 'U4G-TEST-PRODUCER',
  }), registrationId);
}

export class FakeDocument {
  constructor() {
    this.head = new FakeElement(this, 'head');
    this.body = new FakeElement(this, 'body');
  }
  createElement(tagName) { return new FakeElement(this, tagName); }
  createElementNS(_namespace, tagName) { return new FakeElement(this, tagName); }
  querySelectorAll() { return []; }
  querySelector(selector) {
    if (selector !== '[data-lafea-workbench-styles]') return null;
    return this.head.querySelector(selector);
  }
}

export class FakeElement {
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
    nodes.filter(Boolean).forEach((node) => {
      node.parentNode = this;
      this.children.push(node);
    });
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') {
      this.classList = new FakeClassList(String(value).split(/\s+/u).filter(Boolean));
    }
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
      stopPropagation() {},
      preventDefault() {},
      ...event,
      target: this,
      currentTarget: this,
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
  getBoundingClientRect() { return { left: 0, top: 0, width: 760, height: 440 }; }
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

export function fakeThree(webgl2 = true) {
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
