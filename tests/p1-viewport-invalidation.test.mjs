import assert from 'node:assert/strict';
import test from 'node:test';
import { ViewportPanel } from '../src/workspace/viewport-panel.js';

test('selection-only snapshot changes do not rebuild or reinstall the render model', () => {
  const dataset = Object.freeze({ datasetId: 'dataset:stable' });
  let renderDatasetCalls = 0;
  const selected = [];
  const panel = {
    datasetReference: dataset,
    renderDataset: () => { renderDatasetCalls += 1; },
    renderSelection: (entityId) => selected.push(entityId),
  };

  ViewportPanel.prototype.renderSnapshot.call(panel, {
    status: 'ready',
    dataset,
    selectedEntityId: 'pipe:2',
  });

  assert.equal(renderDatasetCalls, 0);
  assert.deepEqual(selected, ['pipe:2']);
});

test('calculated and master-data events do not trigger geometry compilation', () => {
  const rerenders = [];
  const panel = {
    rerenderActiveDataset: (reason) => rerenders.push(reason),
  };

  ViewportPanel.prototype.engineeringModelChanged.call(panel, 'calculated');
  ViewportPanel.prototype.engineeringModelChanged.call(panel, 'master-data-changed');
  assert.deepEqual(rerenders, []);

  ViewportPanel.prototype.engineeringModelChanged.call(panel, 'project-data-changed');
  assert.deepEqual(rerenders, ['project-data-changed']);
});
