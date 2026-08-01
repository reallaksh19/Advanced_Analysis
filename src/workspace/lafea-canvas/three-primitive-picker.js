/**
 * Convert one browser client point into a renderer primitive only.
 *
 * This adapter never emits engineering identity. The governed selection store
 * resolves the returned draw primitive through the revision-bound V2 pick map.
 */
import {
  assertExactKeys,
  contractError,
  deepFreeze,
  requireFiniteNumber,
} from './contracts.js';

const POINT_KEYS = Object.freeze(['clientX', 'clientY']);

export function createThreePrimitivePicker(THREE, canvas, getRenderedScene) {
  if (typeof THREE?.Raycaster !== 'function'
    || typeof THREE?.Vector2 !== 'function'
    || !canvas?.dataset
    || typeof canvas.getBoundingClientRect !== 'function'
    || typeof getRenderedScene !== 'function') {
    throw contractError('LAFEA_THREE_PRIMITIVE_PICKER_REQUIRED');
  }
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pickClientPoint(value) {
    assertExactKeys(value, POINT_KEYS, 'LAFEA_THREE_PICK_POINT_KEYS_INVALID');
    requireFiniteNumber(value.clientX, 'clientX');
    requireFiniteNumber(value.clientY, 'clientY');
    const rendered = getRenderedScene();
    if (!rendered || rendered.ready !== true
      || !Array.isArray(rendered.objects) || rendered.objects.length === 0
      || !rendered.camera) {
      throw contractError('LAFEA_THREE_PICK_SCENE_NOT_READY');
    }
    const rect = canvas.getBoundingClientRect();
    const dimensions = [rect?.left, rect?.top, rect?.width, rect?.height];
    if (!dimensions.every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
      throw contractError('LAFEA_THREE_PICK_CANVAS_BOUNDS_INVALID');
    }
    pointer.x = normalizedZero(((value.clientX - rect.left) / rect.width) * 2 - 1);
    pointer.y = normalizedZero(-(((value.clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointer, rendered.camera);
    const intersection = raycaster.intersectObjects(rendered.objects, false)
      .find((entry) => Number.isInteger(entry?.faceIndex) && entry.faceIndex >= 0);
    if (!intersection) return null;
    return deepFreeze({
      drawGroup: 'TRIANGLES',
      primitiveIndex: intersection.faceIndex,
    });
  }

  return Object.freeze({ pickClientPoint });
}

function normalizedZero(value) {
  return Object.is(value, -0) ? 0 : value;
}
