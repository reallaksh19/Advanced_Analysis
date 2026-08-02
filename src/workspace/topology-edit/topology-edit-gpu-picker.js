import * as THREE from 'three';

const MAX_PICK_ID = 0xffffff;
const DEFAULT_PIXEL_RADIUS = 2;

export function encodeTopologyEditPickId(id) {
  const value = Number(id);
  if (!Number.isInteger(value) || value < 1 || value > MAX_PICK_ID) {
    throw new RangeError(`GPU pick ID must be an integer from 1 to ${MAX_PICK_ID}.`);
  }
  return Object.freeze({
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  });
}

export function decodeTopologyEditPickId(bytes, offset = 0) {
  if (!bytes || offset < 0 || offset + 2 >= bytes.length) return 0;
  return (Number(bytes[offset]) << 16)
    | (Number(bytes[offset + 1]) << 8)
    | Number(bytes[offset + 2]);
}

export function selectNearestTopologyEditPickId(bytes, width, height) {
  if (!bytes || !Number.isInteger(width) || !Number.isInteger(height)) return 0;
  if (width < 1 || height < 1 || bytes.length < width * height * 4) return 0;
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  let selected = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const id = decodeTopologyEditPickId(bytes, pixel * 4);
      if (!id) continue;
      const distance = ((x - centerX) ** 2) + ((y - centerY) ** 2);
      if (!selected || distance < selected.distance
        || (distance === selected.distance && pixel < selected.pixel)) {
        selected = { id, distance, pixel };
      }
    }
  }
  return selected?.id ?? 0;
}

export class TopologyEditGpuPicker {
  constructor({ renderer, scene, pixelRadius = DEFAULT_PIXEL_RADIUS } = {}) {
    if (!renderer || !scene) {
      throw new TypeError('TopologyEditGpuPicker requires a renderer and scene.');
    }
    this.renderer = renderer;
    this.scene = scene;
    this.pixelRadius = normalizeRadius(pixelRadius);
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
    if (!this.isAvailable() || !camera || !validRect(rect)) return null;
    const viewport = resolveViewport(this.renderer, clientX, clientY, rect, this.pixelRadius);
    if (!viewport) return null;
    const prepared = this.prepareScene();
    if (!prepared.entries.size) {
      prepared.restore();
      return null;
    }
    const rendererState = captureRendererState(this.renderer);
    try {
      this.ensureRenderTarget(viewport.fullWidth, viewport.fullHeight);
      renderPickPass(this.renderer, this.renderTarget, this.scene, camera, viewport);
      const bytes = new Uint8Array(viewport.width * viewport.height * 4);
      this.renderer.readRenderTargetPixels(
        this.renderTarget,
        viewport.x,
        viewport.y,
        viewport.width,
        viewport.height,
        bytes,
      );
      const id = selectNearestTopologyEditPickId(bytes, viewport.width, viewport.height);
      return prepared.entries.get(id) ?? null;
    } catch {
      return null;
    } finally {
      prepared.restore();
      restoreRendererState(this.renderer, rendererState);
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
    if (!target?.objectId) {
      hideForPick(object, restorations);
      return;
    }
    const id = this.objectId(object, target);
    if (!id) {
      hideForPick(object, restorations);
      return;
    }
    const originalMaterial = object.material;
    const originalBeforeRender = object.onBeforeRender;
    const material = this.materialFor(originalMaterial, false);
    const color = encodeTopologyEditPickId(id);
    restorations.push(() => {
      object.material = originalMaterial;
      object.onBeforeRender = originalBeforeRender;
    });
    object.material = material;
    object.onBeforeRender = (...args) => {
      material.uniforms.pickColor.value.setRGB(
        color.r / 255,
        color.g / 255,
        color.b / 255,
      );
      originalBeforeRender?.apply(object, args);
    };
    entries.set(id, Object.freeze({ target, object, instanceId: null }));
  }

  prepareInstancedObject(object, restorations, entries) {
    const targets = object.userData.pickTable;
    const ids = this.instanceIds(object, targets);
    if (!ids) {
      hideForPick(object, restorations);
      return;
    }
    const colors = new Float32Array(targets.length * 3);
    targets.forEach((target, index) => {
      const id = ids[index];
      const color = encodeTopologyEditPickId(id);
      colors[index * 3] = color.r / 255;
      colors[index * 3 + 1] = color.g / 255;
      colors[index * 3 + 2] = color.b / 255;
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
    const key = targetKey(target);
    const current = this.objectIds.get(object);
    if (current?.key === key) return current.id;
    const id = this.allocateId();
    if (!id) return 0;
    this.objectIds.set(object, { key, id });
    return id;
  }

  instanceIds(object, targets) {
    if (!targets.length || targets.some((target) => !target?.objectId)) return null;
    const keys = targets.map(targetKey);
    const current = this.instancedIds.get(object);
    if (current && sameStrings(current.keys, keys)) return current.ids;
    const ids = [];
    for (let index = 0; index < keys.length; index += 1) {
      const id = this.allocateId();
      if (!id) return null;
      ids.push(id);
    }
    this.instancedIds.set(object, { keys, ids });
    return ids;
  }

  allocateId() {
    if (this.nextPickId > MAX_PICK_ID) return 0;
    const id = this.nextPickId;
    this.nextPickId += 1;
    return id;
  }

  materialFor(originalMaterial, instanced) {
    const options = materialOptions(originalMaterial);
    const key = `${instanced ? 'I' : 'O'}:${options.key}`;
    if (!this.materials.has(key)) {
      this.materials.set(key, createPickMaterial(options, instanced));
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

function createPickMaterial(options, instanced) {
  return new THREE.ShaderMaterial({
    uniforms: instanced ? {} : { pickColor: { value: new THREE.Color() } },
    vertexShader: instanced ? INSTANCED_VERTEX_SHADER : OBJECT_VERTEX_SHADER,
    fragmentShader: PICK_FRAGMENT_SHADER,
    side: options.side,
    clippingPlanes: options.clippingPlanes,
    clipIntersection: options.clipIntersection,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
}

function materialOptions(material) {
  const row = Array.isArray(material) ? material.find(Boolean) : material;
  const planes = (row?.clippingPlanes ?? []).map((plane) => plane.clone());
  const planeKey = planes.map((plane) => [
    plane.normal.x,
    plane.normal.y,
    plane.normal.z,
    plane.constant,
  ].join(',')).join(';');
  const side = row?.side ?? THREE.FrontSide;
  const clipIntersection = row?.clipIntersection === true;
  return {
    side,
    clippingPlanes: planes,
    clipIntersection,
    key: `${side}:${clipIntersection}:${planeKey}`,
  };
}

function captureRendererState(renderer) {
  return {
    target: renderer.getRenderTarget?.() ?? null,
    viewport: renderer.getViewport?.(new THREE.Vector4()) ?? null,
    scissor: renderer.getScissor?.(new THREE.Vector4()) ?? null,
    scissorTest: renderer.getScissorTest?.() ?? false,
    clearColor: renderer.getClearColor?.(new THREE.Color()) ?? null,
    clearAlpha: renderer.getClearAlpha?.() ?? 1,
    autoClear: renderer.autoClear,
  };
}

function restoreRendererState(renderer, state) {
  renderer.setRenderTarget?.(state.target);
  if (state.viewport) renderer.setViewport?.(state.viewport);
  if (state.scissor) renderer.setScissor?.(state.scissor);
  renderer.setScissorTest?.(state.scissorTest);
  if (state.clearColor) renderer.setClearColor?.(state.clearColor, state.clearAlpha);
  if (state.autoClear !== undefined) renderer.autoClear = state.autoClear;
}

function renderPickPass(renderer, target, scene, camera, viewport) {
  renderer.setRenderTarget(target);
  renderer.setViewport(0, 0, viewport.fullWidth, viewport.fullHeight);
  renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
  renderer.setScissorTest(true);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.clear?.(true, true, true);
  renderer.render(scene, camera);
}

function resolveViewport(renderer, clientX, clientY, rect, radius) {
  if (![clientX, clientY].every(Number.isFinite)) return null;
  const ratio = positive(renderer.getPixelRatio?.()) ?? 1;
  const fullWidth = Math.max(1, Math.round(rect.width * ratio));
  const fullHeight = Math.max(1, Math.round(rect.height * ratio));
  const pixelX = clamp(Math.floor((clientX - rect.left) * ratio), 0, fullWidth - 1);
  const topY = clamp(Math.floor((clientY - rect.top) * ratio), 0, fullHeight - 1);
  const pixelY = fullHeight - 1 - topY;
  const x = Math.max(0, pixelX - radius);
  const y = Math.max(0, pixelY - radius);
  const maxX = Math.min(fullWidth - 1, pixelX + radius);
  const maxY = Math.min(fullHeight - 1, pixelY + radius);
  return {
    x,
    y,
    width: maxX - x + 1,
    height: maxY - y + 1,
    fullWidth,
    fullHeight,
  };
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

function targetKey(target) {
  return JSON.stringify(canonicalize(target));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validRect(rect) {
  return rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)
    && positive(rect.width) !== null && positive(rect.height) !== null;
}

function normalizeRadius(value) {
  const radius = Number(value);
  return Number.isInteger(radius) && radius >= 0 && radius <= 8
    ? radius
    : DEFAULT_PIXEL_RADIUS;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

const OBJECT_VERTEX_SHADER = `
  uniform vec3 pickColor;
  varying vec3 vPickColor;
  #include <clipping_planes_pars_vertex>
  void main() {
    vPickColor = pickColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const INSTANCED_VERTEX_SHADER = `
  attribute vec3 instancePickColor;
  varying vec3 vPickColor;
  #include <clipping_planes_pars_vertex>
  void main() {
    vPickColor = instancePickColor;
    vec4 localPosition = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      localPosition = instanceMatrix * localPosition;
    #endif
    vec4 mvPosition = modelViewMatrix * localPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const PICK_FRAGMENT_SHADER = `
  varying vec3 vPickColor;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    gl_FragColor = vec4(vPickColor, 1.0);
  }
`;
