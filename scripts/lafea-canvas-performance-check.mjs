// scripts/lafea-canvas-performance-check.mjs

import assert from 'node:assert/strict';
import { resolveLafeaRenderer } from '../src/workspace/lafea-canvas/render-policy.js';

const policy = {
  schema: 'LafeaRenderPolicy.v1',
  policyId: 'DEFAULT_POLICY',
  sourceRevision: 1,
  svgMeshLimit: { source: 'CONFIG', value: 1000 },
  svgFallbackLimit: { source: 'CONFIG', value: 5000 },
  canvas2dFallbackLimit: { source: 'CONFIG', value: 20000 },
  allowedFallbackModes: ['MESH_WIREFRAME'],
  semanticHash: 'HASH123',
};

const diagnosticBudget = Object.freeze({
  source: '[SIMULATED] LOCAL_DIAGNOSTIC_BUDGET',
  iterations: 1000,
  maximumElapsedMs: 100,
});

const start = performance.now();
for (let i = 0; i < diagnosticBudget.iterations; i++) {
  resolveLafeaRenderer({
    mode: 'SOURCE_AUTHORING',
    displayedPrimitiveCount: 500,
    webglAvailable: true,
    canvas2dAvailable: true,
    policy,
  });
}
const elapsed = performance.now() - start;
assert.ok(
  elapsed < diagnosticBudget.maximumElapsedMs,
  `Performance diagnostic exceeded ${diagnosticBudget.source}: ${elapsed}ms`,
);

console.log(
  `[SIMULATED] LAFEA canvas policy performance diagnostic PASS `
  + `(${elapsed.toFixed(2)}ms for ${diagnosticBudget.iterations} iterations; `
  + `budget=${diagnosticBudget.source})`,
);
