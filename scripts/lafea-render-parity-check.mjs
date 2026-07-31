// scripts/lafea-render-parity-check.mjs

import assert from 'node:assert/strict';

export function assertRendererPixelParity({
  svgPoint,
  webglPoint,
  toleranceCssPx,
}) {
  assert.ok(
    Number.isFinite(toleranceCssPx) && toleranceCssPx >= 0,
    'toleranceCssPx must be an explicit non-negative finite value.',
  );
  const dx = Math.abs(svgPoint.x - webglPoint.x);
  const dy = Math.abs(svgPoint.y - webglPoint.y);

  if (dx > toleranceCssPx || dy > toleranceCssPx) {
    const error = new Error('SVG/WebGL projection parity failed.');
    error.code = 'LAFEA_RENDER_PIXEL_PARITY_FAILED';
    error.evidence = {
      svgPoint,
      webglPoint,
      dx,
      dy,
      toleranceCssPx,
    };
    throw error;
  }
}

// Check matching points pass within tolerance
assertRendererPixelParity({
  svgPoint: { x: 100.2, y: 200.1 },
  webglPoint: { x: 100.3, y: 200.0 },
  toleranceCssPx: 0.5,
});

// Check exceeding points fail correctly
assert.throws(() => {
  assertRendererPixelParity({
    svgPoint: { x: 100.0, y: 200.0 },
    webglPoint: { x: 101.0, y: 200.0 },
    toleranceCssPx: 0.5,
  });
}, (err) => err.code === 'LAFEA_RENDER_PIXEL_PARITY_FAILED');

console.log('LAFEA render parity check PASS');
