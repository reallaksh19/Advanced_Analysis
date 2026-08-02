import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  buildTopologyEditInspectionModel,
  TOPOLOGY_EDIT_INSPECTION_SCHEMA,
  TOPOLOGY_EDIT_MEASUREMENT_SCHEMA,
} from '../src/workspace/topology-edit/topology-edit-inspection-model.js';
import {
  topologyEditInspectionMarkup,
} from '../src/workspace/topology-edit/topology-edit-inspection-panel.js';
import {
  TopologyEditInspectionRenderer,
} from '../src/workspace/topology-edit/topology-edit-inspection-renderer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function topology() {
  return {
    canonicalTopologyHash: 'canonical:test:inspection',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:b', position: { x: 3, y: 4, z: 12 } },
      { id: 'node:c', position: { x: 13, y: 4, z: 12 } },
    ],
    edges: [
      {
        id: 'edge:ab',
        fromNodeId: 'node:a',
        toNodeId: 'node:b',
        componentKey: 'pipe:ab',
        componentType: 'PIPE',
        boreMm: 100,
        outsideDiameterMm: 114.3,
      },
      {
        id: 'edge:bc',
        fromNodeId: 'node:b',
        toNodeId: 'node:c',
        componentKey: 'pipe:bc',
        componentType: 'PIPE',
      },
    ],
  };
}

test('two-node inspection is exact and deterministic under canonical reorder', () => {
  const canonical = topology();
  const selection = { nodeIds: ['node:a', 'node:b'], edgeId: null };
  const model = buildTopologyEditInspectionModel({
    canonicalTopology: canonical,
    selection,
  });
  const reordered = buildTopologyEditInspectionModel({
    canonicalTopology: {
      ...canonical,
      nodes: [...canonical.nodes].reverse(),
      edges: [...canonical.edges].reverse(),
    },
    selection,
  });
  assert.equal(model.schema, TOPOLOGY_EDIT_INSPECTION_SCHEMA);
  assert.equal(model.status, 'READY');
  assert.equal(model.inspectionHash, reordered.inspectionHash);
  assert.deepEqual(model.canonicalIds, ['node:a', 'node:b']);
  assert.equal(model.measurement.schema, TOPOLOGY_EDIT_MEASUREMENT_SCHEMA);
  assert.equal(model.measurement.kind, 'NODE_DISTANCE');
  assert.deepEqual(model.measurement.delta, { x: 3, y: 4, z: 12 });
  assert.equal(model.measurement.distanceMm, 13);
  assert.deepEqual(model.measurement.unitDirection, {
    x: 3 / 13,
    y: 4 / 13,
    z: 12 / 13,
  });
  assert.deepEqual(model.nodes[1].incidentEdgeIds, ['edge:ab', 'edge:bc']);
  assert.deepEqual(model.overlay.points.map((row) => row.order), [1, 2]);
  assert.equal(Object.isFrozen(model), true);
});

test('one-node and selected-edge inspection retain exact evidence', () => {
  const canonical = topology();
  const nodeModel = buildTopologyEditInspectionModel({
    canonicalTopology: canonical,
    selection: { nodeIds: ['node:b'], edgeId: null },
  });
  assert.equal(nodeModel.measurement, null);
  assert.equal(nodeModel.nodes[0].degree, 2);
  const edgeModel = buildTopologyEditInspectionModel({
    canonicalTopology: canonical,
    selection: { nodeIds: [], edgeId: 'edge:ab' },
  });
  assert.equal(edgeModel.edge.edgeId, 'edge:ab');
  assert.equal(edgeModel.edge.componentKey, 'pipe:ab');
  assert.equal(edgeModel.edge.boreMm, 100);
  assert.equal(edgeModel.edge.outsideDiameterMm, 114.3);
  assert.equal(edgeModel.measurement.kind, 'EDGE_LENGTH');
  assert.equal(edgeModel.measurement.distanceMm, 13);
  assert.deepEqual(edgeModel.overlay.segments.map((row) => row.canonicalId), ['edge:ab']);
});

test('empty and stale selections fail closed without display retargeting', () => {
  const canonical = topology();
  const empty = buildTopologyEditInspectionModel({
    canonicalTopology: canonical,
    selection: { nodeIds: [], edgeId: null },
  });
  assert.equal(empty.status, 'EMPTY');
  assert.deepEqual(empty.canonicalIds, []);
  assert.equal(empty.overlay.measurement, null);
  const stale = buildTopologyEditInspectionModel({
    canonicalTopology: canonical,
    selection: { nodeIds: ['node:missing'], edgeId: null },
  });
  assert.equal(stale.status, 'STALE_SELECTION');
  assert.deepEqual(stale.staleIds, ['node:missing']);
  assert.deepEqual(stale.overlay.points, []);
  assert.deepEqual(stale.overlay.segments, []);
});

test('inspection panel exposes focus and clear controls with escaped identities', () => {
  const canonical = topology();
  canonical.nodes.push({
    id: 'node:<unsafe>',
    position: { x: 1, y: 2, z: 3 },
  });
  const model = buildTopologyEditInspectionModel({
    canonicalTopology: canonical,
    selection: { nodeIds: ['node:<unsafe>'], edgeId: null },
  });
  const markup = topologyEditInspectionMarkup(model);
  assert.match(markup, /data-action="focus-inspection"/);
  assert.match(markup, /data-action="clear-inspection"/);
  assert.match(markup, /node:&lt;unsafe&gt;/);
  assert.doesNotMatch(markup, /node:<unsafe>/);
  assert.match(markup, /Inspection hash:/);
});

test('renderer uses isolated non-pickable selection and measurement groups', () => {
  const model = buildTopologyEditInspectionModel({
    canonicalTopology: topology(),
    selection: { nodeIds: ['node:a', 'node:b'], edgeId: null },
  });
  const selectionGroup = new THREE.Group();
  const measurementGroup = new THREE.Group();
  const renderer = new TopologyEditInspectionRenderer({
    selectionGroup,
    measurementGroup,
  });
  const result = renderer.render(
    model,
    new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(13, 4, 12),
    ),
  );
  assert.equal(selectionGroup.userData.nonPickable, true);
  assert.equal(measurementGroup.userData.nonPickable, true);
  assert.equal(result.selectionObjects, 2);
  assert.equal(result.measurementObjects, 3);
  assert.equal(selectionGroup.children.every((row) => row.userData.nonPickable), true);
  assert.equal(measurementGroup.children.every((row) => row.userData.nonPickable), true);
  renderer.clear();
  assert.equal(selectionGroup.children.length, 0);
  assert.equal(measurementGroup.children.length, 0);
  renderer.destroy();
  assert.throws(() => renderer.render(model), /disposed/);
});

test('production composition remains read-only and consumes the inspection batch', async () => {
  const files = await Promise.all([
    'src/workspace/load-calc-consumer-controller.js',
    'src/workspace/topology-edit-3d-inspection-controller.js',
    'src/workspace/topology-edit/topology-edit-inspection-model.js',
    'src/workspace/topology-edit/topology-edit-inspection-panel.js',
    'src/workspace/topology-edit/topology-edit-inspection-renderer.js',
    'src/workspace/topology-edit/topology-edit-viewport-backend.js',
  ].map((file) => readFile(path.join(ROOT, file), 'utf8')));
  const [loadController, controller, model, panel, renderer, viewport] = files;
  assert.match(loadController, /topology-edit-3d-inspection-controller\.js/);
  assert.match(controller, /extends IssueReviewController/);
  assert.match(controller, /buildTopologyEditInspectionModel/);
  assert.match(controller, /renderInspection/);
  assert.match(controller, /focusCanonicalIds/);
  assert.match(controller, /createTopologyEditSelection/);
  assert.match(viewport, /TopologyEditInspectionRenderer/);
  assert.match(viewport, /renderInspection\(model\)/);
  assert.match(renderer, /selectionGroup\.userData\.nonPickable = true/);
  assert.match(renderer, /measurementGroup\.userData\.nonPickable = true/);
  assert.match(panel, /data-action="focus-inspection"/);
  assert.match(panel, /data-action="clear-inspection"/);
  const combined = `${controller}\n${model}\n${panel}\n${renderer}`;
  for (const prohibited of [
    'WorkspaceState.loadDataset',
    'WorkspaceState.clearDataset',
    '.session.execute(',
    '.acceptAutofix(',
    '.commitDraft(',
    'createTopologyEditCommandIntent(',
    'nearest',
    'proximity',
  ]) {
    assert.equal(combined.includes(prohibited), false, `inspection batch must not use ${prohibited}`);
  }
});
