import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  finalizeCanonicalTopology,
} from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  TopologyEditCertifiedSession,
} from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  TopologyEditInteractionRuntime,
} from '../src/workspace/viewport-interaction/topology-edit-interaction-runtime.js';
import {
  assertCurrentTopologyEditInteractionRuntime,
  selectedTopologyEditNodeContext,
  verifyTopologyEditInteractionAcceptance,
} from '../src/workspace/viewport-productivity/topology-edit-interaction-session.js';
import {
  topologyEditInteractionPanelMarkup,
} from '../src/workspace/viewport-productivity/topology-edit-interaction-panel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-P1B',
    datasetVersion: 0,
    sourceHash: 'source:p1b',
    topologyGraphHash: 'graph:p1b',
    nodes: [
      { id: 'node:n1', position: { x: 0, y: 0, z: 0 }, portKeys: ['P1:port:start'] },
      { id: 'node:n2', position: { x: 100, y: 0, z: 0 }, portKeys: ['P1:port:end'] },
    ],
    edges: [{
      id: 'edge:e1', componentKey: 'P1', fromNodeId: 'node:n1',
      toNodeId: 'node:n2', diameterMm: 100, entityType: 'PIPE', sourcePath: '$[0]',
    }],
    junctions: [],
    supports: [],
    boundaries: [],
    rigids: [],
  });
}

function selection(nodeId = 'node:n2') {
  return { nodeIds: [nodeId], edgeId: null };
}

function movingRuntime(topology = baseTopology()) {
  const context = selectedTopologyEditNodeContext(topology, selection());
  const runtime = new TopologyEditInteractionRuntime();
  runtime.rebase({ ...context, mode: 'AXIS_X' });
  runtime.previewNumeric({
    entryMode: 'DELTA',
    values: { x: '3', y: '0', z: '0' },
    mode: 'FREE',
  });
  return runtime;
}

test('selected context requires one exact current canonical node', () => {
  const topology = baseTopology();
  const context = selectedTopologyEditNodeContext(topology, selection());
  assert.equal(context.nodeId, 'node:n2');
  assert.equal(context.basisHash, topology.canonicalTopologyHash);
  assert.deepEqual(context.anchorPosition, { x: 100, y: 0, z: 0 });
  assert.equal(Object.isFrozen(context), true);
  assert.throws(
    () => selectedTopologyEditNodeContext(topology, { nodeIds: [], edgeId: null }),
    /Exactly one canonical node/,
  );
  assert.throws(
    () => selectedTopologyEditNodeContext(topology, selection('node:missing')),
    /resolved 0 records/,
  );
});

test('current runtime fails closed on stale basis, changed selection and anchor drift', () => {
  const topology = baseTopology();
  const runtime = movingRuntime(topology);
  const state = runtime.snapshot();
  assert.equal(
    assertCurrentTopologyEditInteractionRuntime({
      runtimeState: state,
      topology,
      selection: selection(),
    }).runtimeHash,
    state.runtimeHash,
  );
  assert.throws(
    () => assertCurrentTopologyEditInteractionRuntime({
      runtimeState: state,
      topology: { ...topology, canonicalTopologyHash: 'fnv1a64:changed' },
      selection: selection(),
    }),
    /stale/,
  );
  assert.throws(
    () => assertCurrentTopologyEditInteractionRuntime({
      runtimeState: state,
      topology,
      selection: selection('node:n1'),
    }),
    /different selected node/,
  );
  assert.throws(
    () => assertCurrentTopologyEditInteractionRuntime({
      runtimeState: { ...state, anchorPosition: { x: 99, y: 0, z: 0 } },
      topology,
      selection: selection(),
    }),
    /anchor differs/,
  );
});

test('apply delegates exact preview payload to one certified MOVE_NODE journal transition', () => {
  const topology = baseTopology();
  const runtime = movingRuntime(topology);
  const compiled = runtime.compileApply();
  const session = new TopologyEditCertifiedSession(topology);
  const priorVersion = session.journal.sessionVersion;
  const transition = session.execute('MOVE_NODE', compiled.payload);
  const acceptance = verifyTopologyEditInteractionAcceptance({
    preview: compiled.preview,
    payload: compiled.payload,
    transition,
    priorSessionVersion: priorVersion,
  });
  assert.equal(transition.disposition, 'ACCEPTED');
  assert.equal(session.journal.activeCommandIds.length, 1);
  assert.equal(acceptance.commandType, 'MOVE_NODE');
  assert.equal(acceptance.sessionVersion, 1);
  assert.equal(acceptance.previewHash, compiled.preview.previewHash);
  assert.equal(acceptance.directMutation, false);
  assert.deepEqual(
    session.currentTopology().nodes.find((node) => node.id === 'node:n2').position,
    { x: 103, y: 0, z: 0 },
  );
  assert.equal(Object.isFrozen(acceptance), true);
});

test('acceptance verification rejects payload and preview-basis substitution', () => {
  const topology = baseTopology();
  const runtime = movingRuntime(topology);
  const compiled = runtime.compileApply();
  const session = new TopologyEditCertifiedSession(topology);
  const transition = session.execute('MOVE_NODE', compiled.payload);
  assert.throws(
    () => verifyTopologyEditInteractionAcceptance({
      preview: compiled.preview,
      payload: { nodeId: 'node:n2', position: { x: 104, y: 0, z: 0 } },
      transition,
      priorSessionVersion: 0,
    }),
    /payload differs/,
  );
  assert.throws(
    () => verifyTopologyEditInteractionAcceptance({
      preview: { ...compiled.preview, basisHash: 'fnv1a64:substituted' },
      payload: compiled.payload,
      transition,
      priorSessionVersion: 0,
    }),
    /prior draft basis differs/,
  );
});

test('cancelled runtime performs no session or canonical transition', () => {
  const topology = baseTopology();
  const session = new TopologyEditCertifiedSession(topology);
  const runtime = movingRuntime(topology);
  const before = session.snapshot();
  runtime.cancel();
  assert.equal(runtime.snapshot().preview, null);
  assert.equal(session.snapshot().sessionHash, before.sessionHash);
  assert.equal(session.journal.activeCommandIds.length, 0);
  assert.equal(session.currentTopology().canonicalTopologyHash, topology.canonicalTopologyHash);
});

test('panel escapes errors and exposes bounded numeric, nudge, apply and cancel controls', () => {
  const topology = baseTopology();
  const runtime = movingRuntime(topology);
  const context = selectedTopologyEditNodeContext(topology, selection());
  const markup = topologyEditInteractionPanelMarkup({
    context,
    runtimeState: runtime.snapshot(),
    error: '<interaction-error>',
    nudgeIncrementMm: 0.5,
  });
  assert.match(markup, /data-action="preview-professional-interaction"/);
  assert.match(markup, /data-action="apply-professional-interaction"/);
  assert.match(markup, /data-action="cancel-professional-interaction"/);
  assert.match(markup, /data-action="nudge-professional-interaction"/);
  assert.match(markup, /data-role="interaction-entry-mode"/);
  assert.match(markup, /&lt;interaction-error&gt;/);
  assert.doesNotMatch(markup, /<interaction-error>/);
  assert.match(markup, /DISPLAY_ONLY_PREVIEW/);
  assert.match(markup, /Pickable<\/dt><dd>false/);
});

test('standalone controller preserves shared routing and authority boundaries', async () => {
  const files = [
    'src/workspace/topology-edit-3d-interaction-controller.js',
    'src/workspace/viewport-interaction/topology-edit-interaction-runtime.js',
    'src/workspace/viewport-productivity/topology-edit-interaction-session.js',
    'src/workspace/viewport-productivity/topology-edit-interaction-panel.js',
    'src/workspace/viewport-productivity/topology-edit-interaction-controller-helpers.js',
    'src/workspace/load-calc-consumer-controller.js',
  ];
  const [controller, runtime, session, panel, helpers, consumer] = await Promise.all(
    files.map((file) => readFile(path.join(ROOT, file), 'utf8')),
  );
  assert.match(controller, /topology-edit-3d-review-response-controller\.js/);
  assert.match(controller, /session\.execute\('MOVE_NODE', compiled\.payload\)/);
  assert.match(controller, /verifyTopologyEditInteractionAcceptance/);
  assert.match(runtime, /compileTopologyEditMoveNodePayload/);
  assert.match(session, /CERTIFIED_SESSION_DELEGATION/);
  assert.match(panel, /Professional node interaction/);
  assert.match(helpers, /projectTopologyEditInteractionEvidence/);
  assert.match(consumer, /topology-edit-3d-review-response-controller\.js/);
  assert.doesNotMatch(consumer, /topology-edit-3d-interaction-controller\.js/);

  const combined = [controller, runtime, session, panel, helpers].join('\n');
  for (const prohibited of [
    'WorkspaceState.', 'applyResolvedTopologyEditCommand',
    'createTopologyEditCommandRequest', 'saveDraft(', 'exportDraft(',
    'commitDraft(', 'resolveIssue(', 'approveEngineering(', 'Date.now(',
    'Math.random(', 'mesh.name', 'nearestNeighbor', 'screenX', 'screenY',
  ]) {
    assert.equal(combined.includes(prohibited), false, `P1B must not use ${prohibited}`);
  }
});
