import * as THREE from 'three';
import {
  TOPOLOGY_EDIT_MAX_GPU_PICK_ID,
  captureTopologyEditRendererState,
  createTopologyEditPickMaterial,
  encodeTopologyEditPickId,
  normalizeTopologyEditPickRadius,
  renderTopologyEditPickPass,
  resolveTopologyEditPickSamplePointer,
  resolveTopologyEditPickViewport,
  restoreTopologyEditRendererState,
  sameTopologyEditPickKeys,
  selectNearestTopologyEditPickSample,
  topologyEditPickMaterialKey,
  topologyEditPickTargetKey,
} from './topology-edit-gpu-pick-helpers.js';

export class TopologyEditGpuPicker {
  constructor({ renderer, scene, pixelRadius } = {}) {
    if (!renderer || !scene) {
      throw new TypeError('TopologyEditGpuPicker requires a renderer and scene.');
    }
    this.renderer = renderer;
    this.scene = scene;
    this.pixelRadius = normalizeTopologyEditPickRadius(pixelRadius);
    this.renderTarget = null;
    this.renderSize = new THREE.Vector2();
    this.objectIds = new WeakMap();
    this.instancedIds = new WeakMap();
    this.nextPickId = 1;
    this.materials = new Map();
    this.indexedRows = [];
    this.indexedEntries = new Map();
    this.instancedPickGeometries = new Map();
    this.sceneRevision = 0;
    this.indexRevision = -1;
    this.disposed = false;
  }

  isAvailable() {
    return !this.disposed
      && typeof this.renderer.setRenderTarget === 'function'
      && typeof this.renderer.readRenderTargetPixels === 'function'
      && typeof this.renderer.render === 'function';
  }

  invalidateScene() {
    if (this.disposed) return;
    this.releaseSceneIndex();
    this.objectIds = new WeakMap();
    this.instancedIds = new WeakMap();
    this.nextPickId = 1;
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
    this.sceneRevision += 1;
  }

  pick({ clientX, clientY, rect, camera } = {}) {
    if (!this.isAvailable() || !camera) return null;
    const viewport = resolveTopologyEditPickViewport(
      this.renderer,
      clientX,
      clientY,
      rect,
      this.pixelRadius,
    );
    if (!viewport) return null;
    const prepared = this.prepareScene();
    if (!prepared.entries.size) {
      prepared.restore();
      return null;
    }
    const state = captureTopologyEditRendererState(this.renderer);
    try {
      this.ensureRenderTarget(viewport.fullWidth, viewport.fullHeight);
      renderTopologyEditPickPass(
        this.renderer,
        this.renderTarget,
        this.scene,
        camera,
        viewport,
      );
      const bytes = new Uint8Array(viewport.width * viewport.height * 4);
      this.renderer.readRenderTargetPixels(
        this.renderTarget,
        viewport.x,
        viewport.y,
        viewport.width,
        viewport.height,
        bytes,
      );
      const sample = selectNearestTopologyEditPickSample(
        bytes,
        viewport.width,
        viewport.height,
      );
      if (!sample) return null;
      const entry = prepared.entries.get(sample.id);
      const samplePointer = resolveTopologyEditPickSamplePointer(viewport, sample);
      if (!entry || !samplePointer) return null;
      return Object.freeze({ ...entry, sample, samplePointer });
    } catch {
      return null;
    } finally {
      prepared.restore();
      restoreTopologyEditRendererState(this.renderer, state);
    }
  }

  prepareScene() {
    this.ensureSceneIndex();
    const restorations = [];
    for (const row of this.indexedRows) {
      const object = row.object;
      if (row.kind === 'HIDDEN' || !isEffectivelyVisible(object)) {
        hideForPick(object, restorations);
        continue;
      }
      if (row.kind === 'INSTANCED') {
        const originalMaterial = object.material;
        const originalGeometry = object.geometry;
        restorations.push(() => {
          object.material = originalMaterial;
          object.geometry = originalGeometry;
        });
        object.geometry = row.pickGeometry;
        object.material = row.pickMaterial;
        continue;
      }
      const originalMaterial = object.material;
      const originalBeforeRender = object.onBeforeRender;
      restorations.push(() => {
        object.material = originalMaterial;
        object.onBeforeRender = originalBeforeRender;
      });
      object.material = row.pickMaterial;
      object.onBeforeRender = () => {
        row.pickMaterial.uniforms.pickColor.value.setRGB(
          row.color.r / 255,
          row.color.g / 255,
          row.color.b / 255,
        );
      };
    }
    return {
      entries: this.indexedEntries,
      restore: () => restorePreparedObjects(restorations),
    };
  }

  ensureSceneIndex() {
    if (this.indexRevision === this.sceneRevision) return;
    this.releaseSceneIndex();
    this.scene.updateMatrixWorld?.(true);
    this.scene.traverse?.((object) => {
      if (!object?.isMesh) return;
      if (hasNonPickableAncestor(object)) {
        this.indexedRows.push({ kind: 'HIDDEN', object });
        return;
      }
      if (isInstancedPickObject(object)) {
        this.indexInstancedObject(object);
        return;
      }
      this.indexObject(object);
    });
    this.indexRevision = this.sceneRevision;
  }

  indexObject(object) {
    const target = object.userData?.pickTarget;
    if (!target?.objectId) {
      this.indexedRows.push({ kind: 'HIDDEN', object });
      return;
    }
    const id = this.objectId(object, target);
    if (!id) {
      this.indexedRows.push({ kind: 'HIDDEN', object });
      return;
    }
    const pickMaterial = this.materialFor(object.material, false);
    const color = encodeTopologyEditPickId(id);
    this.indexedRows.push({ kind: 'OBJECT', object, pickMaterial, color });
    this.indexedEntries.set(id, Object.freeze({ target, object, instanceId: null }));
  }

  indexInstancedObject(object) {
    const targets = object.userData.pickTable;
    const ids = this.instanceIds(object, targets);
    if (!ids) {
      this.indexedRows.push({ kind: 'HIDDEN', object });
      return;
    }
    const colors = new Float32Array(targets.length * 3);
    targets.forEach((target, index) => {
      const id = ids[index];
      const color = encodeTopologyEditPickId(id);
      colors.set([color.r / 255, color.g / 255, color.b / 255], index * 3);
      this.indexedEntries.set(id, Object.freeze({ target, object, instanceId: index }));
    });
    const pickGeometry = object.geometry.clone();
    pickGeometry.setAttribute(
      'instancePickColor',
      new THREE.InstancedBufferAttribute(colors, 3, false),
    );
    this.instancedPickGeometries.set(object, pickGeometry);
    this.indexedRows.push({
      kind: 'INSTANCED',
      object,
      pickGeometry,
      pickMaterial: this.materialFor(object.material, true),
    });
  }

  releaseSceneIndex() {
    this.instancedPickGeometries.forEach((geometry) => geometry.dispose());
    this.instancedPickGeometries.clear();
    this.indexedRows = [];
    this.indexedEntries = new Map();
    this.indexRevision = -1;
  }

  objectId(object, target) {
    const key = topologyEditPickTargetKey(target);
    const current = this.objectIds.get(object);
    if (current?.key === key) return current.id;
    const id = this.allocateId();
    if (!id) return 0;
    this.objectIds.set(object, { key, id });
    return id;
  }

  instanceIds(object, targets) {
    if (!targets.length || targets.some((target) => !target?.objectId)) return null;
    const keys = targets.map(topologyEditPickTargetKey);
    const current = this.instancedIds.get(object);
    if (current && sameTopologyEditPickKeys(current.keys, keys)) return current.ids;
    const ids = keys.map(() => this.allocateId());
    if (ids.some((id) => !id)) return null;
    this.instancedIds.set(object, { keys, ids });
    return ids;
  }

  allocateId() {
    if (this.nextPickId > TOPOLOGY_EDIT_MAX_GPU_PICK_ID) return 0;
    const id = this.nextPickId;
    this.nextPickId += 1;
    return id;
  }

  materialFor(originalMaterial, instanced) {
    const key = topologyEditPickMaterialKey(originalMaterial, instanced);
    if (!this.materials.has(key)) {
      this.materials.set(
        key,
        createTopologyEditPickMaterial(originalMaterial, instanced),
      );
    }
    return this.materials.get(key);
  }

  ensureRenderTarget(width, height) {
    if (!this.renderTarget) {
      this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
      this.renderTarget.texture.generateMipmaps = false;
      this.renderSize.set(width, height);
      return;
    }
    if (this.renderSize.x === width && this.renderSize.y === height) return;
    this.renderTarget.setSize(width, height);
    this.renderSize.set(width, height);
  }

  dispose() {
    if (this.disposed) return;
    this.releaseSceneIndex();
    this.disposed = true;
    this.renderTarget?.dispose();
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
    this.renderTarget = null;
    this.renderer = null;
    this.scene = null;
    this.objectIds = new WeakMap();
    this.instancedIds = new WeakMap();
  }
}

function hideForPick(object, restorations) {
  const visible = object.visible;
  restorations.push(() => { object.visible = visible; });
  object.visible = false;
}

function restorePreparedObjects(restorations) {
  for (let index = restorations.length - 1; index >= 0; index -= 1) {
    restorations[index]();
  }
}

function isEffectivelyVisible(object) {
  let current = object;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return true;
}

function hasNonPickableAncestor(object) {
  let current = object;
  while (current) {
    if (current.userData?.nonPickable) return true;
    current = current.parent;
  }
  return false;
}

function isInstancedPickObject(object) {
  return object.isInstancedMesh && Array.isArray(object.userData?.pickTable);
}
