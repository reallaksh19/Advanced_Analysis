import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Canvas2DViewportBackend } from '../src/workspace/canvas2d-viewport-backend.js';
import { VIEWPORT_RENDER_MODEL_SCHEMA } from '../src/workspace/viewport-render-model.js';

const backend = new Canvas2DViewportBackend();
backend.canvas = { style: { width: '500px', height: '360px' } };
backend.context = fakeContext();

backend.model = renderModel([]);
assert.doesNotThrow(() => backend.draw(), 'An empty v3 render model must be a valid no-op.');

const item = {
  primitiveId: 'visual:PIPE-A:line',
  objectId: 'PIPE-A',
  entityType: 'PIPE',
  category: 'pipe',
  componentKind: 'PIPE',
  layer: 'PHYSICAL',
  resolutionStatus: 'resolved',
  resolutionReason: '',
  kind: 'LINE',
  primitive: {
    kind: 'LINE',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1000, y: 0, z: 0 },
  },
  start: { x: 0, y: 0, z: 0 },
  end: { x: 1000, y: 0, z: 0 },
  center: { x: 500, y: 0, z: 0 },
};
backend.model = renderModel([item]);
backend.selectedEntityId = 'PIPE-A';
assert.doesNotThrow(() => backend.draw(), 'A governed v3 physical primitive must render without a legacy items array.');
assert.ok(backend.context.strokeCalls > 0, 'Canvas v3 primitive must execute a drawing stroke.');

const source = await readFile(new URL('../src/workspace/canvas2d-viewport-backend.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /this\.model\.items/, 'Canvas2D must not depend on the retired render-model items array.');
assert.match(source, /item\.objectId === this\.selectedEntityId/, 'Canvas2D selection must use v3 objectId identity.');
assert.match(source, /physicalPrimitives/, 'Canvas2D must consume the v3 physical primitive layer.');
assert.match(source, /supportOverlayPrimitives/, 'Canvas2D must consume the v3 support overlay layer.');
assert.match(source, /diagnosticPrimitives/, 'Canvas2D must consume the v3 diagnostic layer.');

console.log(JSON.stringify({
  check: 'non-fea-canvas-v3-bootstrap',
  status: 'PASS',
  emptyModelNoOp: true,
  physicalPrimitiveRendered: true,
  legacyItemsDependency: false,
  selectionIdentity: 'objectId',
}));

function renderModel(physicalPrimitives) {
  return {
    schema: VIEWPORT_RENDER_MODEL_SCHEMA,
    datasetId: 'NON-FEA-CANVAS-V3',
    physicalPrimitives,
    supportOverlayPrimitives: [],
    diagnosticPrimitives: [],
    skippedEntityIds: [],
    bounds: null,
    summary: {
      renderableCount: physicalPrimitives.length,
      skippedCount: 0,
      resolvedCount: physicalPrimitives.length,
      fallbackCount: 0,
      byKind: physicalPrimitives.length ? { PIPE: physicalPrimitives.length } : {},
    },
  };
}

function fakeContext() {
  return {
    strokeCalls: 0,
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    rect() {},
    closePath() {},
    setLineDash() {},
    stroke() { this.strokeCalls += 1; },
    set strokeStyle(_) {},
    set fillStyle(_) {},
    set lineWidth(_) {},
  };
}
