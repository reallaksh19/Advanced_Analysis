import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  assertCurrentTopologyEditInteractionPreview,
  createTopologyEditDragSessionPreview,
  createTopologyEditNudgeSessionPreview,
  createTopologyEditNumericSessionPreview,
  selectedTopologyEditNodeContext,
  verifyTopologyEditInteractionAcceptance,
} from '../src/workspace/viewport-productivity/topology-edit-interaction-session.js';

function topology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-PRO',
    datasetVersion: 0,
    sourceHash: 'source:professional',
    topologyGraphHash: 'graph:professional',
    nodes: [
      { id: 'node:n1', position: { x: 0, y: 0, z: 0 }, portKeys: ['P-001:TO'] },
      { id: 'node:n2', position: { x: 100, y: 0, z: 0 }, portKeys: ['P-002:FROM'] },
    ],
    edges: [
      {
        id: 'edge:e1', componentKey: 'P-001', fromNodeId: 'node:n1',
        toNodeId: 'node:n2', diameterMm: 100, entityType: 'PIPE', sourcePath: '$[0]',
      },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}

const selection = Object.freeze({
  nodeIds: Object.freeze(['node:n1']),
  edgeId: null,
});

test('drag preview constrains the selected canonical node on the exact basis', () => {
  const current = topology();
  const context = selectedTopologyEditNodeContext(current, selection);
  const preview = createTopologyEditDragSessionPreview({
    topology: current,
    selection,
    transformMode: 'AXIS_X',
    targetPosition: { x: 20, y: 90, z: -40 },
  });
  assert.equal(preview.nodeId, 'node:n1');
  assert.equal(preview.basisHash, current.canonicalTopologyHash);
  assert.deepEqual(preview.anchorPosition, context.anchorPosition);
  assert.deepEqual(preview.targetPosition, { x: 20, y: 0, z: 0 });
  assert.equal(preview.displayOnly, true);
  assert.equal(preview.pickable, false);
});

test('numeric and nudge previews produce deterministic exact targets', () => {
  const current = topology();
  const numeric = createTopologyEditNumericSessionPreview({
    topology: current,
    selection,
    entryMode: 'DELTA',
    values: { x: '3', y: '0', z: '0' },
  });
  const repeated = createTopologyEditNumericSessionPreview({
    topology: current,
    selection,
    entryMode: 'DELTA',
    values: { z: '0', y: '0', x: '3.000' },
  });
  assert.deepEqual(numeric, repeated);
  const nudged = createTopologyEditNudgeSessionPreview({
    topology: current,
    selection,
    preview: numeric,
    axis: 'X',
    directionSign: 1,
    incrementMm: '2',
  });
  assert.deepEqual(nudged.targetPosition, { x: 5, y: 0, z: 0 });
});

test('current preview fails closed after topology basis or selection changes', () => {
  const current = topology();
  const preview = createTopologyEditDragSessionPreview({
    topology: current,
    selection,
    transformMode: 'AXIS_X',
    targetPosition: { x: 20, y: 0, z: 0 },
  });
  const session = new TopologyEditCertifiedSession(current);
  session.execute('MOVE_NODE', { nodeId: 'node:n2', position: { x: 110, y: 0, z: 0 } });
  assert.throws(() => assertCurrentTopologyEditInteractionPreview({
    preview,
    topology: session.currentTopology(),
    selection,
  }), /stale/i);
  assert.throws(() => assertCurrentTopologyEditInteractionPreview({
    preview,
    topology: current,
    selection: { nodeIds: ['node:n2'], edgeId: null },
  }), /different selected node/i);
});

test('accepted preview binds the exact MOVE_NODE request and certification', () => {
  const session = new TopologyEditCertifiedSession(topology());
  const preview = createTopologyEditDragSessionPreview({
    topology: session.currentTopology(),
    selection,
    transformMode: 'AXIS_X',
    targetPosition: { x: 20, y: 0, z: 0 },
  });
  const priorSessionVersion = session.journal.sessionVersion;
  const transition = session.execute('MOVE_NODE', preview.movePayload);
  const acceptance = verifyTopologyEditInteractionAcceptance({
    preview,
    transition,
    priorSessionVersion,
  });
  assert.equal(acceptance.commandType, 'MOVE_NODE');
  assert.equal(acceptance.previewHash, preview.previewHash);
  assert.equal(acceptance.sessionVersion, priorSessionVersion + 1);
  assert.equal(acceptance.directMutation, false);
  assert.deepEqual(
    session.currentTopology().nodes.find((node) => node.id === 'node:n1').position,
    { x: 20, y: 0, z: 0 },
  );
});
