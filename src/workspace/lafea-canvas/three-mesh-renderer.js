// src/workspace/lafea-canvas/three-mesh-renderer.js

import * as THREE from 'three';
import { contractError } from './contracts.js';
import { requireRenderPacket } from './render-packet-contract.js';

export function createThreeMeshRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });

  const scene = new THREE.Scene();
  let currentObjects = [];

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    disposeCurrent();
    renderer.domElement.dataset.ready = 'false';
  });

  function render({ renderPacket, viewport }) {
    requireRenderPacket(renderPacket);
    disposeCurrent();

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(renderPacket.positions, 3),
    );

    geometry.setIndex(
      new THREE.BufferAttribute(renderPacket.indices, 1),
    );

    geometry.setAttribute(
      'resultValue',
      new THREE.BufferAttribute(renderPacket.fieldValues, 1),
    );

    geometry.setAttribute(
      'qualityFlag',
      new THREE.BufferAttribute(renderPacket.qualityFlags, 1),
    );

    // BEGIN_AGENT_FILL:C3-CREATE-MATERIAL
    const bounds = viewport?.displayOptions?.fieldBounds;
    const colorMapId = viewport?.displayOptions?.colorMapId;
    const supportedColorMaps = [
      'AUTODESK_SIMULATION_RAINBOW',
      'JET',
      'COOL_WARM',
    ];
    if (!bounds || !Number.isFinite(bounds.minimum) || !Number.isFinite(bounds.maximum)
      || bounds.maximum < bounds.minimum || typeof bounds.source !== 'string'
      || !bounds.source.trim()) {
      throw contractError('LAFEA_RENDER_FIELD_BOUNDS_REQUIRED');
    }
    if (!supportedColorMaps.includes(colorMapId)) {
      throw contractError('LAFEA_RENDER_COLOR_MAP_UNSUPPORTED', { colorMapId });
    }
    const colors = new Float32Array(renderPacket.fieldValues.length * 3);
    const range = bounds.maximum - bounds.minimum;
    for (let index = 0; index < renderPacket.fieldValues.length; index += 1) {
      const fieldValue = renderPacket.fieldValues[index];
      const diagnostic = renderPacket.qualityFlags[index] !== 0 || !Number.isFinite(fieldValue);
      const normalized = range === 0 ? 0.5
        : Math.min(1, Math.max(0, (fieldValue - bounds.minimum) / range));
      let red;
      let green;
      let blue;
      if (diagnostic) {
        [red, green, blue] = [1, 0, 1];
      } else if (colorMapId === 'COOL_WARM') {
        red = Math.min(1, normalized * 2);
        blue = Math.min(1, (1 - normalized) * 2);
        green = 1 - Math.abs((normalized * 2) - 1);
      } else {
        red = Math.min(1, Math.max(0, 1.5 - Math.abs((4 * normalized) - 3)));
        green = Math.min(1, Math.max(0, 1.5 - Math.abs((4 * normalized) - 2)));
        blue = Math.min(1, Math.max(0, 1.5 - Math.abs((4 * normalized) - 1)));
      }
      colors[(index * 3)] = red;
      colors[(index * 3) + 1] = green;
      colors[(index * 3) + 2] = blue;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      wireframe: viewport?.displayOptions?.wireframe === true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    currentObjects.push(mesh);
    const validMatrix = (value) => Array.isArray(value) && value.length === 16
      && value.every(Number.isFinite);
    if (!validMatrix(viewport?.viewMatrix) || !validMatrix(viewport?.projectionMatrix)) {
      throw contractError('LAFEA_RENDER_CAMERA_MATRIX_INVALID');
    }
    const camera = new THREE.Camera();
    camera.matrixAutoUpdate = false;
    camera.matrixWorldInverse.fromArray(viewport.viewMatrix);
    camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
    camera.projectionMatrix.fromArray(viewport.projectionMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer.setPixelRatio(viewport.devicePixelRatio);
    renderer.setSize(viewport.cssWidth, viewport.cssHeight, false);
    renderer.render(scene, camera);
    // END_AGENT_FILL:C3-CREATE-MATERIAL
  }

  function disposeCurrent() {
    for (const object of currentObjects) {
      object.geometry?.dispose();
      disposeMaterial(object.material);
      scene.remove(object);
    }
    currentObjects = [];
  }

  return Object.freeze({
    isAvailable: () => renderer.capabilities.isWebGL2 === true,
    render,
    clearCurrentScene: disposeCurrent,
    setVisible(visible) {
      canvas.hidden = !visible;
    },
    dispose() {
      disposeCurrent();
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  });
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  material?.dispose?.();
}

function requiredSlot(slotId) {
  const error = new Error(`Required implementation slot ${slotId} is empty.`);
  error.code = 'LAFEA_REQUIRED_SLOT_UNIMPLEMENTED';
  error.slotId = slotId;
  return error;
}
