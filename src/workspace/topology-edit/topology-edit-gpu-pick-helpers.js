import * as THREE from 'three';

export const TOPOLOGY_EDIT_MAX_GPU_PICK_ID = 0xffffff;
export const TOPOLOGY_EDIT_GPU_PICK_PIXEL_RADIUS = 2;

export function encodeTopologyEditPickId(id) {
  const value = Number(id);
  if (!Number.isInteger(value) || value < 1
    || value > TOPOLOGY_EDIT_MAX_GPU_PICK_ID) {
    throw new RangeError(
      `GPU pick ID must be an integer from 1 to ${TOPOLOGY_EDIT_MAX_GPU_PICK_ID}.`,
    );
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
  if (!validPixelBuffer(bytes, width, height)) return 0;
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  let selected = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const id = decodeTopologyEditPickId(bytes, pixel * 4);
      if (!id) continue;
      const distance = ((x - centerX) ** 2) + ((y - centerY) ** 2);
      if (preferSample(selected, distance, pixel)) {
        selected = { id, distance, pixel };
      }
    }
  }
  return selected?.id ?? 0;
}

export function resolveTopologyEditPickViewport(
  renderer,
  clientX,
  clientY,
  rect,
  pixelRadius = TOPOLOGY_EDIT_GPU_PICK_PIXEL_RADIUS,
) {
  if (![clientX, clientY].every(Number.isFinite) || !validRect(rect)) return null;
  const ratio = positive(renderer.getPixelRatio?.()) ?? 1;
  const fullWidth = Math.max(1, Math.round(rect.width * ratio));
  const fullHeight = Math.max(1, Math.round(rect.height * ratio));
  const pixelX = clamp(Math.floor((clientX - rect.left) * ratio), 0, fullWidth - 1);
  const topY = clamp(Math.floor((clientY - rect.top) * ratio), 0, fullHeight - 1);
  const pixelY = fullHeight - 1 - topY;
  const radius = normalizeRadius(pixelRadius);
  const x = Math.max(0, pixelX - radius);
  const y = Math.max(0, pixelY - radius);
  const maxX = Math.min(fullWidth - 1, pixelX + radius);
  const maxY = Math.min(fullHeight - 1, pixelY + radius);
  return Object.freeze({
    x,
    y,
    width: maxX - x + 1,
    height: maxY - y + 1,
    fullWidth,
    fullHeight,
  });
}

export function createTopologyEditPickMaterial(originalMaterial, instanced) {
  const options = materialOptions(originalMaterial);
  return new THREE.ShaderMaterial({
    uniforms: instanced ? {} : { pickColor: { value: new THREE.Color() } },
    vertexShader: instanced ? INSTANCED_VERTEX_SHADER : OBJECT_VERTEX_SHADER,
    fragmentShader: PICK_FRAGMENT_SHADER,
    side: options.side,
    clippingPlanes: options.clippingPlanes,
    clipIntersection: options.clipIntersection,
    clipping: options.clippingPlanes.length > 0,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
}

export function topologyEditPickMaterialKey(originalMaterial, instanced) {
  const options = materialOptions(originalMaterial);
  return `${instanced ? 'I' : 'O'}:${options.key}`;
}

export function captureTopologyEditRendererState(renderer) {
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

export function restoreTopologyEditRendererState(renderer, state) {
  renderer.setRenderTarget?.(state.target);
  if (state.viewport) renderer.setViewport?.(state.viewport);
  if (state.scissor) renderer.setScissor?.(state.scissor);
  renderer.setScissorTest?.(state.scissorTest);
  if (state.clearColor) renderer.setClearColor?.(state.clearColor, state.clearAlpha);
  if (state.autoClear !== undefined) renderer.autoClear = state.autoClear;
}

export function renderTopologyEditPickPass(
  renderer,
  target,
  scene,
  camera,
  viewport,
) {
  renderer.setRenderTarget(target);
  renderer.setViewport(0, 0, viewport.fullWidth, viewport.fullHeight);
  renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
  renderer.setScissorTest(true);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.clear?.(true, true, true);
  renderer.render(scene, camera);
}

export function topologyEditPickTargetKey(target) {
  return JSON.stringify(canonicalize(target));
}

export function sameTopologyEditPickKeys(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function normalizeTopologyEditPickRadius(value) {
  return normalizeRadius(value);
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

function validPixelBuffer(bytes, width, height) {
  return Boolean(bytes)
    && Number.isInteger(width)
    && Number.isInteger(height)
    && width > 0
    && height > 0
    && bytes.length >= width * height * 4;
}

function preferSample(selected, distance, pixel) {
  return !selected
    || distance < selected.distance
    || (distance === selected.distance && pixel < selected.pixel);
}

function validRect(rect) {
  return rect
    && Number.isFinite(rect.left)
    && Number.isFinite(rect.top)
    && positive(rect.width) !== null
    && positive(rect.height) !== null;
}

function normalizeRadius(value) {
  const radius = Number(value);
  return Number.isInteger(radius) && radius >= 0 && radius <= 8
    ? radius
    : TOPOLOGY_EDIT_GPU_PICK_PIXEL_RADIUS;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
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
