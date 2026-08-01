/** Standalone U4E/U4J Three.js adapter for exact U4D result requests. */
import { contractError, deepFreeze } from './contracts.js';
import {
  createLafeaDiagnosticSafeVertexColors,
} from './diagnostic-field-display.js';
import { requireLafeaResultRenderRequest } from './result-render-request.js';
import { createThreePrimitivePicker } from './three-primitive-picker.js';

export const LAFEA_THREE_RENDER_RESULT_SCHEMA = 'LafeaThreeRenderResult.v1';

export function createThreeMeshRendererV2(THREE, canvas) {
  requireThreeAdapter(THREE, canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  let currentObjects = [];
  let currentCamera = null;
  let picker = null;
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
    geometry.setAttribute('color', new THREE.BufferAttribute(
      createLafeaDiagnosticSafeVertexColors(packet, request.diagnosticDisplay),
      3,
    ));
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true, wireframe: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    currentObjects.push(mesh);

    const CameraType = typeof THREE.OrthographicCamera === 'function'
      ? THREE.OrthographicCamera : THREE.Camera;
    currentCamera = new CameraType();
    currentCamera.isOrthographicCamera = true;
    [currentCamera.near, currentCamera.far] = orthographicDepth(
      request.viewport.projectionMatrix,
    );
    currentCamera.matrixAutoUpdate = false;
    currentCamera.matrixWorldInverse.fromArray(request.viewport.viewMatrix);
    currentCamera.matrixWorld.copy(currentCamera.matrixWorldInverse).invert();
    currentCamera.projectionMatrix.fromArray(request.viewport.projectionMatrix);
    currentCamera.projectionMatrixInverse.copy(currentCamera.projectionMatrix).invert();
    renderer.setPixelRatio(request.viewport.devicePixelRatio);
    renderer.setSize(request.viewport.cssWidth, request.viewport.cssHeight, false);
    renderer.render(scene, currentCamera);
    Object.assign(canvas.dataset, {
      ready: 'true',
      renderer: 'THREE_WEBGL',
      stageId: request.stageId,
      sceneRevision: String(request.sceneRevision),
      fieldId: packet.field.fieldId,
      diagnosticVertexCount: String(request.diagnosticDisplay.diagnosticVertexCount),
      diagnosticPolicyId: request.diagnosticDisplay.policy.policyId,
      diagnosticPolicyHash: request.diagnosticDisplay.policy.semanticHash,
    });

    return deepFreeze({
      schema: LAFEA_THREE_RENDER_RESULT_SCHEMA,
      stageId: request.stageId,
      sceneRevision: request.sceneRevision,
      renderer: 'THREE_WEBGL',
      fieldId: packet.field.fieldId,
      triangleCount: request.displayedPrimitiveCount,
      diagnosticVertexCount: request.diagnosticDisplay.diagnosticVertexCount,
      diagnosticPolicyId: request.diagnosticDisplay.policy.policyId,
      diagnosticPolicyHash: request.diagnosticDisplay.policy.semanticHash,
      meshHash: packet.lineage.meshHash,
      recoveryHash: packet.lineage.recoveryHash,
      renderProfileHash: packet.lineage.renderProfileHash,
    });
  }

  function pickClientPoint(value) {
    if (destroyed) throw contractError('LAFEA_V2_RENDERER_DESTROYED');
    if (contextLost) throw contractError('LAFEA_V2_WEBGL_CONTEXT_LOST');
    picker ??= createThreePrimitivePicker(THREE, canvas, () => ({
      ready: canvas.dataset.ready === 'true',
      objects: currentObjects,
      camera: currentCamera,
    }));
    return picker.pickClientPoint(value);
  }

  function disposeCurrent() {
    for (const object of currentObjects) {
      object.geometry?.dispose();
      disposeMaterial(object.material);
      scene.remove(object);
    }
    currentObjects = [];
    currentCamera = null;
  }

  function markNotReady() {
    canvas.dataset.ready = 'false';
    for (const key of [
      'renderer', 'stageId', 'sceneRevision', 'fieldId',
      'diagnosticVertexCount', 'diagnosticPolicyId', 'diagnosticPolicyHash',
    ]) delete canvas.dataset[key];
  }

  return Object.freeze({
    isAvailable: () => !destroyed && !contextLost
      && renderer.capabilities.isWebGL2 === true,
    render,
    pickClientPoint,
    clearCurrentScene() { disposeCurrent(); markNotReady(); },
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
      picker = null;
      renderer.dispose();
      renderer.forceContextLoss?.();
      markNotReady();
    },
  });
}

function orthographicDepth(matrix) {
  const scale = matrix[10];
  const offset = matrix[14];
  const near = (offset + 1) / scale;
  const far = (offset - 1) / scale;
  if (![scale, offset, near, far].every(Number.isFinite)
    || scale === 0 || near === far) {
    throw contractError('LAFEA_V2_ORTHOGRAPHIC_DEPTH_INVALID');
  }
  return [near, far];
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
  if (Array.isArray(material)) material.forEach(disposeMaterial);
  else material?.dispose?.();
}
