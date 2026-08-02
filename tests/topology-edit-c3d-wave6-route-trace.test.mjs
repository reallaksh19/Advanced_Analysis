import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  buildTopologyEditRouteTrace,
} from '../src/workspace/topology-edit/topology-edit-route-trace-model.js';
import {
  topologyEditRouteTraceMarkup,
} from '../src/workspace/topology-edit/topology-edit-route-trace-panel.js';
import {
  TopologyEditRouteTraceRenderer,
} from '../src/workspace/topology-edit/topology-edit-route-trace-renderer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function topology() {
  return {
    canonicalTopologyHash: 'canonical:route-fixture',
    nodes: [
      node('node:a', 0, 0, 0),
      node('node:b', 3, 0, 0),
      node('node:c', 3, 4, 0),
      node('node:d', 10, 0, 0),
      node('node:e', 3, -2, 0),
    ],
    edges: [
      edge('edge:ab', 'node:a', 'node:b', 'pipe:ab'),
      edge('edge:bc', 'node:b', 'node:c', 'pipe:bc'),
      edge('edge:ad', 'node:a', 'node:d', 'pipe:ad'),
      edge('edge:dc', 'node:d', 'node:c', 'pipe:dc'),
      edge('edge:be', 'node:b', 'node:e', 'pipe:be'),
    ],
  };
}

function node(id, x, y, z) {
  return { id, position: { x, y, z } };
}
function edge(id, fromNodeId, toNodeId, componentKey = null) {
  return { id, fromNodeId, toNodeId, componentKey, entityType: 'PIPE' };
}
function selectNodes(...nodeIds) {
  return { nodeIds, edgeId: null };
}
function selectEdge(edgeId) {
  return { nodeIds: [], edgeId };
}

test('derives the unique minimum engineering-length route', () => {
  const model = buildTopologyEditRouteTrace({
    canonicalTopology: topology(),
    selection: selectNodes('node:a', 'node:c'),
  });
  assert.equal(model.status, 'READY');
  assert.equal(model.mode, 'POINT_TO_POINT');
  assert.deepEqual(model.orderedNodeIds, ['node:a', 'node:b', 'node:c']);
  assert.deepEqual(model.orderedEdgeIds, ['edge:ab', 'edge:bc']);
  assert.equal(model.totalLengthMm, 7);
  assert.deepEqual(model.branchNodeIds, ['node:b']);
  assert.deepEqual(model.componentKeys, ['pipe:ab', 'pipe:bc']);
  assert.equal(Object.isFrozen(model), true);
});

test('route identity is invariant to canonical array ordering', () => {
  const source = topology();
  const reordered = {
    ...source,
    nodes: [...source.nodes].reverse(),
    edges: [...source.edges].reverse(),
  };
  const left = buildTopologyEditRouteTrace({
    canonicalTopology: source,
    selection: selectNodes('node:a', 'node:c'),
  });
  const right = buildTopologyEditRouteTrace({
    canonicalTopology: reordered,
    selection: selectNodes('node:a', 'node:c'),
  });
  assert.equal(left.routeTraceHash, right.routeTraceHash);
  assert.deepEqual(left.edgeEvidence, right.edgeEvidence);
});

test('rejects equal minimum-length alternatives instead of choosing arbitrarily', () => {
  const model = buildTopologyEditRouteTrace({
    canonicalTopology: {
      canonicalTopologyHash: 'canonical:diamond',
      nodes: [
        node('node:a', 0, 0, 0), node('node:b', 1, 1, 0),
        node('node:c', 1, -1, 0), node('node:d', 2, 0, 0),
      ],
      edges: [
        edge('edge:ab', 'node:a', 'node:b'),
        edge('edge:bd', 'node:b', 'node:d'),
        edge('edge:ac', 'node:a', 'node:c'),
        edge('edge:cd', 'node:c', 'node:d'),
      ],
    },
    selection: selectNodes('node:a', 'node:d'),
  });
  assert.equal(model.status, 'AMBIGUOUS_PATH');
  assert.equal(model.totalLengthMm, 2 * Math.SQRT2);
  assert.deepEqual(model.orderedEdgeIds, []);
});

test('rejects disconnected and stale route selections', () => {
  const source = topology();
  source.nodes.push(node('node:z', 50, 50, 0));
  const disconnected = buildTopologyEditRouteTrace({
    canonicalTopology: source,
    selection: selectNodes('node:a', 'node:z'),
  });
  assert.equal(disconnected.status, 'DISCONNECTED');
  const stale = buildTopologyEditRouteTrace({
    canonicalTopology: source,
    selection: selectNodes('node:a', 'node:missing'),
  });
  assert.equal(stale.status, 'STALE_SELECTION');
});

test('fails closed on zero-length or unresolved canonical edges', () => {
  const source = topology();
  source.edges.push(edge('edge:zero', 'node:a', 'node:a'));
  const model = buildTopologyEditRouteTrace({
    canonicalTopology: source,
    selection: selectNodes('node:a', 'node:c'),
  });
  assert.equal(model.status, 'INVALID_GRAPH');
  assert.deepEqual(model.invalidEdgeIds, ['edge:zero']);
});

test('derives the complete exact connected component from a selected edge', () => {
  const model = buildTopologyEditRouteTrace({
    canonicalTopology: topology(),
    selection: selectEdge('edge:ab'),
  });
  assert.equal(model.status, 'READY');
  assert.equal(model.mode, 'CONNECTED_COMPONENT');
  assert.equal(model.traceNodeCount, 5);
  assert.equal(model.traceEdgeCount, 5);
  assert.deepEqual(model.openEndpointIds, ['node:e']);
  assert.deepEqual(model.branchNodeIds, ['node:b']);
});

test('renders isolated non-pickable connector evidence and disposes it', () => {
  const group = new THREE.Group();
  const renderer = new TopologyEditRouteTraceRenderer(group);
  const model = buildTopologyEditRouteTrace({
    canonicalTopology: topology(),
    selection: selectNodes('node:a', 'node:c'),
  });
  const count = renderer.render(model, new THREE.Box3(
    new THREE.Vector3(0, -2, 0),
    new THREE.Vector3(10, 4, 0),
  ));
  assert.ok(count >= 5);
  assert.equal(group.userData.nonPickable, true);
  group.traverse((object) => assert.notEqual(object.userData?.nonPickable, false));
  renderer.clear();
  assert.equal(group.children.length, 0);
});

test('panel escapes identities and exposes trace focus and clear controls', () => {
  const model = buildTopologyEditRouteTrace({
    canonicalTopology: topology(),
    selection: selectNodes('node:a', 'node:c'),
  });
  const markup = topologyEditRouteTraceMarkup({
    ...model,
    componentKeys: ['<unsafe>'],
  });
  assert.match(markup, /data-action="build-route-trace"/);
  assert.match(markup, /data-action="focus-route-trace"/);
  assert.match(markup, /data-action="clear-route-trace"/);
  assert.match(markup, /&lt;unsafe&gt;/);
  assert.doesNotMatch(markup, /<unsafe>/);
});

test('production composition retains comparison and remains read-only', async () => {
  const paths = [
    'src/workspace/load-calc-consumer-controller.js',
    'src/workspace/topology-edit-3d-route-controller.js',
    'src/workspace/topology-edit-3d-comparison-controller.js',
    'src/workspace/topology-edit/topology-edit-route-trace-model.js',
    'src/workspace/topology-edit/topology-edit-route-trace-panel.js',
    'src/workspace/topology-edit/topology-edit-route-trace-renderer.js',
  ];
  const [consumer, controller, comparison, model, panel, renderer] = await Promise.all(
    paths.map((file) => readFile(path.join(ROOT, file), 'utf8')),
  );
  assert.match(consumer, /topology-edit-3d-route-controller\.js/);
  assert.match(controller, /topology-edit-3d-comparison-controller\.js/);
  assert.match(controller, /extends ComparisonController/);
  assert.match(comparison, /buildTopologyEditComparisonModel/);
  assert.match(controller, /buildTopologyEditRouteTrace/);
  assert.match(controller, /connectorGroup/);
  assert.match(controller, /focusCanonicalIds/);
  assert.match(model, /canonicalTopology\.nodes/);
  assert.match(model, /canonicalTopology\.edges/);
  assert.match(model, /AMBIGUOUS_PATH/);
  assert.match(panel, /Canonical route continuity/);
  assert.match(renderer, /nonPickable/);
  const combined = [controller, model, panel, renderer].join('\n');
  for (const prohibited of [
    'createTopologyEditCommandIntent', 'previewAutofix(', 'acceptAutofix(',
    'WorkspaceState.loadDataset', 'WorkspaceState.clearDataset',
    'nearest', 'raycast', 'screenX', 'screenY', 'mesh.name',
  ]) {
    assert.equal(combined.includes(prohibited), false, `route review must not use ${prohibited}`);
  }
});
