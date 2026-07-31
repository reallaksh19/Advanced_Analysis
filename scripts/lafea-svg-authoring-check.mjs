// scripts/lafea-svg-authoring-check.mjs

import assert from 'node:assert/strict';
import { createSvgAuthoringController } from '../src/workspace/lafea-canvas/svg-authoring-controller.js';
import {
  REQUIRED_CANVAS_TESTS,
  assertRequiredTestsRegistered,
} from './lafea-required-test-registry.mjs';

let revision = 1;
const executedTests = new Set();
const mockGateway = {
  execute(command) {
    revision += 1;
    return { success: true, revision };
  },
};

const controller = createSvgAuthoringController({
  getAcceptedSource: () => ({ nodes: [] }),
  getCurrentRevision: () => revision,
  commandGateway: mockGateway,
  compilePreview: ({ intent, pointerState }) => ({ ...intent, pointerState }),
});

// LAFEA-CANVAS-T16: Begin preview & update cycle
const sourceIntent = {
  operationType: 'MOVE',
  selectedEntityIds: ['N1'],
  beforeValues: { x: 0 },
};
controller.begin(sourceIntent);
sourceIntent.beforeValues.x = 5;
const preview = controller.update({ x: 10 });
assert.equal(preview.baseRevision, 1);
assert.equal(preview.intent.beforeValues.x, 0);
assert.equal(Object.isFrozen(sourceIntent), false);
assert.equal(preview.previewGeometry.pointerState.x, 10);
executedTests.add('LAFEA-CANVAS-T16');

// LAFEA-CANVAS-T17: Stale base revision rejection
assert.throws(() => {
  revision = 2; // Revision incremented externally
  controller.commit({ operationId: 'OP_STALE', exactAfterValues: { x: 10 } });
}, (err) => err.code === 'LAFEA_AUTHORING_BASE_REVISION_STALE');
executedTests.add('LAFEA-CANVAS-T17');

// Reset revision for successful commit test
controller.cancel();
revision = 1;
controller.begin({ operationType: 'MOVE', selectedEntityIds: ['N1'], beforeValues: { x: 0 } });
controller.update({ x: 10 });

// LAFEA-CANVAS-T18: Gateway execution & preview cleanup
const result = controller.commit({ operationId: 'OP1', exactAfterValues: { x: 10 } });
assert.equal(result.success, true);
assert.equal(result.revision, 2);
assert.equal(controller.getPreview(), null);
executedTests.add('LAFEA-CANVAS-T18');

assertRequiredTestsRegistered(
  [...executedTests],
  REQUIRED_CANVAS_TESTS.slice(15, 18),
);
console.log('LAFEA SVG authoring check PASS (Tests T16-T18 executed)');
