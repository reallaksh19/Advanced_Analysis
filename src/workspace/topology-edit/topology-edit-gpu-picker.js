import * as THREE from 'three';
import {
  TOPOLOGY_EDIT_MAX_GPU_PICK_ID,
  captureTopologyEditRendererState,
  createTopologyEditPickMaterial,
  encodeTopologyEditPickId,
  normalizeTopologyEditPickRadius,
  renderTopologyEditPickPass,
  resolveTopologyEditPickViewport,
  restoreTopologyEditRendererState,
  sameTopologyEditPickKeys,
  selectNearestTopologyEditPickId,
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
    this.disposed = false;
  }

  isAvailable() {
    return !this.disposed
      && typeof this.renderer.setRenderTarget === 'function'
      && typeof this.renderer.readRenderTargetPixels === 'function'
      && typeof this.renderer.render === 'function';
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
      const id = selectNearestTopologyEditPickId(
        bytes,
        viewport.width,
        viewport.height,
      );
      return prepared.entries.get(id) ?? null;
    } catch {
      return null;
    } finally {
      prepared.restore();
      restoreTopologyEditRendererState(this.renderer, state);
    }
  }

  prepareScene() {
    const restorations = [];
    const entries = new Map();
    this.scene.updateMatrixWorld?.(true);
    this.scene.traverse?.((object) => {
      if (!object?.isMesh) return;
      if (!isEffectivelyVisible(object) || hasNonPickableAncestor(object)) {
        hideForPick(object, restorations);
        return;
      }
      if (isInstancedPickObject(object)) {
        this.prepareInstancedObject(object, restorations, entries);
        return;
      }
      this.prepareObject(object, restorations, entries);
    });
    return {
      entries,
      restore: () => restorePreparedObjects(restorations),
    };
  }

  prepareObject(object, restorations, entries) {
    const target = object.userData?.pickTarget;
    if (!target?.objectId) return hideForPick(object, restorations);
    const id = this.objectId(object, target);
    if (!id) return hideForPick(object, restorations);
    const originalMaterial = object.material;
    const originalBeforeRender = object.onBeforeRender;
    const material = this.materialFor(originalMaterial, false);
    const color = encodeTopologyEditPickId(id);
    restorations.push(() => {
      object.material = originalMaterial;
      object.onBeforeRender = originalBeforeRender;
    });
    object.material = material;
    object.onBeforeRender = () => {
      material.uniforms.pickColor.value.setRGB(
        color.r / 255,
        color.g / 255,
        color.b / 255,
      );
    };
    entries.set(id, Object.freeze({ target, object, instanceId: null }));
  }

  prepareInstancedObject(object, restorations, entries) {
    const targets = object.userData.pickTable;
    const ids = this.instanceIds(object, targets);
    if (!ids) return hideForPick(object, restorations);
    const colors = new Float32Array(targets.length * 3);
    targets.forEach((target, index) => {
      const id = ids[index];
      const color = encodeTopologyEditPickId(id);
      colors.set([color.r / 255, color.g / 255, color.b / 255], index * 3);
      entries.set(id, Object.freeze({ target, object, instanceId: index }));
    });
    const originalMaterial = object.material;
    const originalGeometry = object.geometry;
    const pickGeometry = originalGeometry.clone();
    pickGeometry.setAttribute(
      'instancePickColor',
      new THREE.InstancedBufferAttribute(colors, 3, false),
    );
    restorations.push(() => {
      object.material = originalMaterial;
      object.geometry = originalGeometry;
      pickGeometry.dispose();
    });
    object.geometry = pickGeometry;
    object.material = this.materialFor(originalMaterial, true);
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
