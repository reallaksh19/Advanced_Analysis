import assert from 'node:assert/strict';
import {
  TopologyEditNavigationHudViewportBackend,
} from '../src/workspace/topology-edit/topology-edit-navigation-hud-viewport-backend.js';

const exactTarget = Object.freeze({ objectId: 'edge:gpu', objectKind: 'component' });
const rayReceipt = Object.freeze({ objectId: 'edge:ray', objectKind: 'component' });
const cursorPointer = Object.freeze({ x: 0.1, y: -0.2 });
const samplePointer = Object.freeze({ x: 0.125, y: -0.175 });

{
  const backend = backendHarness({
    gpuHit: { target: exactTarget, samplePointer },
    gpuPoint: Object.freeze({ x: 1, y: 2, z: 3 }),
    rayReceipt,
  });
  assert.equal(
    backend.pickAt(100, 200),
    rayReceipt,
    'The exact ray identity under the pointer must precede nearby GPU-radius candidates.',
  );
  assert.equal(backend.calls.raycaster, 1);
  assert.equal(backend.calls.gpu, 0);
  assert.equal(backend.calls.receipt, 0);
  assert.equal(backend.calls.resolvedPointer, null);
}

{
  const point = Object.freeze({ x: 1, y: 2, z: 3 });
  const gpuReceipt = Object.freeze({ objectId: 'edge:gpu', point });
  const backend = backendHarness({
    gpuHit: { target: exactTarget, samplePointer },
    gpuPoint: point,
    gpuReceipt,
    rayReceipt: null,
  });
  assert.equal(
    backend.pickAt(100, 200),
    gpuReceipt,
    'GPU radius sampling remains the fallback when no exact ray target exists.',
  );
  assert.equal(backend.calls.raycaster, 1);
  assert.equal(backend.calls.gpu, 1);
  assert.equal(backend.calls.receipt, 1);
  assert.equal(
    backend.calls.resolvedPointer,
    samplePointer,
    'The governed receipt must resolve through the winning GPU sample ray.',
  );
}

{
  const backend = backendHarness({
    gpuHit: { target: exactTarget },
    gpuPoint: null,
    rayReceipt: null,
  });
  assert.equal(backend.pickAt(100, 200), null);
  assert.equal(backend.calls.raycaster, 1);
  assert.equal(backend.calls.gpu, 1);
  assert.equal(backend.calls.receipt, 0);
  assert.equal(
    backend.calls.resolvedPointer,
    cursorPointer,
    'Legacy GPU receipts without sample lineage retain the exact cursor ray fallback.',
  );
}

console.log('PASS topology-edit exact-ray then deterministic GPU sample authority');

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
