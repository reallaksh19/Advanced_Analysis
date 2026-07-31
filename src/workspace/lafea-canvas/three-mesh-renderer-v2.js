/** Standalone U4E Three.js adapter for exact U4D/U4C result requests. */
import { contractError, deepFreeze } from './contracts.js';
import { requireLafeaResultRenderRequest } from './result-render-request.js';

export const LAFEA_THREE_RENDER_RESULT_SCHEMA = 'LafeaThreeRenderResult.v1';

export function createThreeMeshRendererV2(THREE, canvas) {
  requireThreeAdapter(THREE, canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  let currentObjects = [];
  let destroyed = false;
  let contextLost = false;

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    disposeCurrent();
    markNotReady();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    markNotReady();
  });

  function render(requestValue) {
    if (destroyed) throw contractError('LAFEA_V2_RENDERER_DESTROYED');
    if (contextLost) throw contractError('LAFEA_V2_WEBGL_CONTEXT_LOST');
    if (renderer.capabilities.isWebGL2 !== true) {
      throw contractError('LAFEA_V2_WEBGL2_REQUIRED');
    }
    const request = requireLafeaResultRenderRequest(requestValue);
    disposeCurrent();
    markNotReady();
    const packet = request.renderPacket;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(packet.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(packet.drawTriangleIndices, 1));
    geometry.setAttribute('resultValue', new THREE.BufferAttribute(packet.fieldValues, 1));
    geometry.setAttribute('qualityFlag', new THREE.BufferAttribute(packet.qualityFlags, 1));
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(vertexColors(packet), 3),
    );
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      wireframe: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    currentObjects.push(mesh);

    const camera = new THREE.Camera();
    camera.matrixAutoUpdate = false;
    camera.matrixWorldInverse.fromArray(request.viewport.viewMatrix);
    camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
    camera.projectionMatrix.fromArray(request.viewport.projectionMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer.setPixelRatio(request.viewport.devicePixelRatio);
    renderer.setSize(
      request.viewport.cssWidth,
      request.viewport.cssHeight,
      false,
    );
    renderer.render(scene, camera);
    canvas.dataset.ready = 'true';
    canvas.dataset.renderer = 'THREE_WEBGL';
    canvas.dataset.stageId = request.stageId;
    canvas.dataset.sceneRevision = String(request.sceneRevision);
    canvas.dataset.fieldId = packet.field.fieldId;

    return deepFreeze({
      schema: LAFEA_THREE_RENDER_RESULT_SCHEMA,
      stageId: request.stageId,
      sceneRevision: request.sceneRevision,
      renderer: 'THREE_WEBGL',
      fieldId: packet.field.fieldId,
      triangleCount: request.displayedPrimitiveCount,
      meshHash: packet.lineage.meshHash,
      recoveryHash: packet.lineage.recoveryHash,
      renderProfileHash: packet.lineage.renderProfileHash,
    });
  }

  function disposeCurrent() {
    for (const object of currentObjects) {
      object.geometry?.dispose();
      disposeMaterial(object.material);
      scene.remove(object);
    }
    currentObjects = [];
  }

  function markNotReady() {
    canvas.dataset.ready = 'false';
    delete canvas.dataset.renderer;
    delete canvas.dataset.stageId;
    delete canvas.dataset.sceneRevision;
    delete canvas.dataset.fieldId;
  }

  return Object.freeze({
    isAvailable: () => !destroyed && !contextLost
      && renderer.capabilities.isWebGL2 === true,
    render,
    clearCurrentScene() {
      disposeCurrent();
      markNotReady();
    },
    setVisible(visible) {
      if (typeof visible !== 'boolean') {
        throw contractError('LAFEA_V2_RENDERER_VISIBILITY_INVALID');
      }
      canvas.hidden = !visible;
    },
    dispose() {
      if (destroyed) return;
      destroyed = true;
      disposeCurrent();
      renderer.dispose();
      renderer.forceContextLoss?.();
      markNotReady();
    },
  });
}

function vertexColors(packet) {
  const colors = new Float32Array(packet.fieldValues.length * 3);
  const minimum = packet.field.bounds.minimum;
  const maximum = packet.field.bounds.maximum;
  const range = maximum - minimum;
  for (let index = 0; index < packet.fieldValues.length; index += 1) {
    const normalized = range === 0 ? 0.5
      : Math.min(1, Math.max(0, (packet.fieldValues[index] - minimum) / range));
    const [red, green, blue] = colorMap(normalized, packet.field.colorMapId);
    colors[index * 3] = red;
    colors[(index * 3) + 1] = green;
    colors[(index * 3) + 2] = blue;
  }
  return colors;
}

function colorMap(value, colorMapId) {
  if (colorMapId === 'COOL_WARM') {
    return [
      Math.min(1, value * 2),
      1 - Math.abs((value * 2) - 1),
      Math.min(1, (1 - value) * 2),
    ];
  }
  return [
    Math.min(1, Math.max(0, 1.5 - Math.abs((4 * value) - 3))),
    Math.min(1, Math.max(0, 1.5 - Math.abs((4 * value) - 2))),
    Math.min(1, Math.max(0, 1.5 - Math.abs((4 * value) - 1))),
  ];
}

function requireThreeAdapter(THREE, canvas) {
  const constructors = [
    'WebGLRenderer', 'Scene', 'BufferGeometry', 'BufferAttribute',
    'MeshBasicMaterial', 'Mesh', 'Camera',
  ];
  if (!THREE || constructors.some((key) => typeof THREE[key] !== 'function')
    || THREE.DoubleSide === undefined
    || !canvas?.dataset
    || typeof canvas.addEventListener !== 'function') {
    throw contractError('LAFEA_V2_THREE_ADAPTER_REQUIRED');
  }
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  material?.dispose?.();
}
