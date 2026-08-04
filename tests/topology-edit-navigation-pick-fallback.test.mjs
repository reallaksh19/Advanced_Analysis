import assert from 'node:assert/strict';
import {
  TopologyEditNavigationHudViewportBackend,
} from '../src/workspace/topology-edit/topology-edit-navigation-hud-viewport-backend.js';

const exactTarget = Object.freeze({ objectId: 'edge:gpu', objectKind: 'component' });
const rayReceipt = Object.freeze({ objectId: 'edge:ray', objectKind: 'component' });

{
  const backend = backendHarness({
    gpuHit: { target: exactTarget },
    gpuPoint: null,
    rayReceipt,
  });
  assert.equal(
    backend.pickAt(100, 200),
    rayReceipt,
    'An unresolved nearby GPU identity must not suppress the exact raycaster fallback.',
  );
  assert.equal(backend.calls.raycaster, 1);
  assert.equal(backend.calls.receipt, 0);
}

{
  const point = Object.freeze({ x: 1, y: 2, z: 3 });
  const gpuReceipt = Object.freeze({ objectId: 'edge:gpu', point });
  const backend = backendHarness({
    gpuHit: { target: exactTarget },
    gpuPoint: point,
    gpuReceipt,
    rayReceipt,
  });
  assert.equal(
    backend.pickAt(100, 200),
    gpuReceipt,
    'A GPU identity with an exact governed ray point retains precedence.',
  );
  assert.equal(backend.calls.receipt, 1);
  assert.equal(backend.calls.raycaster, 0);
}

{
  const backend = backendHarness({ gpuHit: null, gpuPoint: null, rayReceipt });
  assert.equal(backend.pickAt(100, 200), rayReceipt);
  assert.equal(backend.calls.raycaster, 1);
}

console.log('PASS topology-edit navigation GPU-to-ray picking fallback');

function backendHarness({ gpuHit, gpuPoint, gpuReceipt = null, rayReceipt: fallback }) {
  const backend = Object.create(TopologyEditNavigationHudViewportBackend.prototype);
  backend.contextLost = false;
  backend.configurationError = null;
  backend.activeCamera = Object.freeze({});
  backend.calls = { receipt: 0, raycaster: 0 };
  backend.pickContext = () => ({ rect: Object.freeze({}), pointer: Object.freeze({}) });
  backend.gpuPicker = { pick: () => gpuHit };
  backend.resolveGpuPickPoint = () => gpuPoint;
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
