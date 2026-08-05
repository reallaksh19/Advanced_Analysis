import assert from 'node:assert/strict';
import {
  TopologyEditNavigationHudViewportBackend,
} from '../src/workspace/topology-edit/topology-edit-navigation-hud-viewport-backend.js';

const exactTarget = Object.freeze({ objectId: 'edge:gpu', objectKind: 'component' });
const rayReceipt = Object.freeze({ objectId: 'edge:ray', objectKind: 'component' });
const cursorPointer = Object.freeze({ x: 0.1, y: -0.2 });
const samplePointer = Object.freeze({ x: 0.125, y: -0.175 });

{
  const point = Object.freeze({ x: 1, y: 2, z: 3 });
  const gpuReceipt = Object.freeze({ objectId: 'edge:gpu', point });
  const backend = backendHarness({
    gpuHit: { target: exactTarget, samplePointer },
    gpuPoint: point,
    gpuReceipt,
    rayReceipt,
  });
  assert.equal(
    backend.pickAt(100, 200),
    gpuReceipt,
    'The exact ID-buffer sample and its governed screen-space radius must precede a whole-scene CPU raycast.',
  );
  assert.equal(backend.calls.gpu, 1);
  assert.equal(backend.calls.raycaster, 0);
  assert.equal(backend.calls.receipt, 1);
  assert.equal(backend.calls.resolvedPointer, samplePointer);
}

{
  const backend = backendHarness({
    gpuHit: null,
    gpuPoint: null,
    rayReceipt,
  });
  assert.equal(
    backend.pickAt(100, 200),
    rayReceipt,
    'The exact CPU ray remains the compatibility fallback when the GPU pass has no identity.',
  );
  assert.equal(backend.calls.gpu, 1);
  assert.equal(backend.calls.raycaster, 1);
  assert.equal(backend.calls.receipt, 0);
}

{
  const backend = backendHarness({
    gpuHit: { target: exactTarget },
    gpuPoint: null,
    rayReceipt,
  });
  assert.equal(
    backend.pickAt(100, 200),
    rayReceipt,
    'A GPU identity without an exact engineering intersection must fall back to the CPU ray.',
  );
  assert.equal(backend.calls.gpu, 1);
  assert.equal(backend.calls.raycaster, 1);
  assert.equal(backend.calls.receipt, 0);
  assert.equal(
    backend.calls.resolvedPointer,
    cursorPointer,
    'Legacy GPU receipts without sample lineage retain the cursor pointer for point resolution.',
  );
}

console.log('PASS topology-edit GPU-first exact sample then CPU fallback authority');

function backendHarness({ gpuHit, gpuPoint, gpuReceipt = null, rayReceipt: fallback }) {
  const backend = Object.create(TopologyEditNavigationHudViewportBackend.prototype);
  backend.contextLost = false;
  backend.configurationError = null;
  backend.activeCamera = Object.freeze({});
  backend.calls = { receipt: 0, raycaster: 0, gpu: 0, resolvedPointer: null };
  backend.pickContext = () => ({ rect: Object.freeze({}), pointer: cursorPointer });
  backend.gpuPicker = {
    pick: () => {
      backend.calls.gpu += 1;
      return gpuHit;
    },
  };
  backend.resolveGpuPickPoint = (hit, pointer) => {
    backend.calls.resolvedPointer = pointer;
    return gpuPoint;
  };
  backend.pickReceipt = () => {
    backend.calls.receipt += 1;
    return gpuReceipt;
  };
  backend.pickWithRaycaster = () => {
    backend.calls.raycaster += 1;
    return fallback;
  };
  return backend;
}
