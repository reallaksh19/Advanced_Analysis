import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPOLOGY_EDIT_AUTOFIX_COMMANDS,
  TOPOLOGY_EDIT_NATIVE_COMMANDS,
  createTopologyEditCommandRequest,
} from '../src/workspace/topology-edit/topology-edit-command-contract.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { resolveTopologyEditCommand } from '../src/workspace/topology-edit/topology-edit-command-resolver.js';
import { applyResolvedTopologyEditCommand } from '../src/workspace/topology-edit/topology-edit-pure-reducer.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { TopologyEditAutofixController } from '../src/workspace/topology-edit/topology-edit-autofix-controller.js';
import { checkCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-checker.js';

function topology({ nodes, edges, junctions = [] }) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'W3B',
    datasetVersion: 0,
    sourceHash: 'source:w3b',
    topologyGraphHash: 'graph:w3b',
    nodes,
    edges,
    junctions,
    supports: [],
    boundaries: [],
    rigids: [],
  });
}

function rightAngleTopology() {
  return topology({
    nodes: [
      { id: 'node:turn', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:x', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:y', position: { x: 0, y: 100, z: 0 }, portKeys: [] },
    ],
    edges: [
      { id: 'edge:x', componentKey: 'PX', fromNodeId: 'node:turn', toNodeId: 'node:x', entityType: 'PIPE' },
      { id: 'edge:y', componentKey: 'PY', fromNodeId: 'node:turn', toNodeId: 'node:y', entityType: 'PIPE' },
    ],
  });
}

function multiwayTopology() {
  return topology({
    nodes: [
      { id: 'node:j', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:a', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 0, y: 100, z: 0 }, portKeys: [] },
      { id: 'node:c', position: { x: 0, y: 0, z: 100 }, portKeys: [] },
    ],
    edges: [
      { id: 'edge:a', fromNodeId: 'node:j', toNodeId: 'node:a', entityType: 'PIPE' },
      { id: 'edge:b', fromNodeId: 'node:j', toNodeId: 'node:b', entityType: 'PIPE' },
      { id: 'edge:c', fromNodeId: 'node:j', toNodeId: 'node:c', entityType: 'PIPE' },
    ],
  });
}

function trimTopology() {
  return topology({
    nodes: [
      { id: 'node:tail', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:middle', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:end', position: { x: 200, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [
      { id: 'edge:trim', fromNodeId: 'node:tail', toNodeId: 'node:middle', entityType: 'PIPE' },
      { id: 'edge:next', fromNodeId: 'node:middle', toNodeId: 'node:end', entityType: 'PIPE' },
    ],
  });
}

function resolved(canonical, commandType, payload) {
  const basis = {
    sourceHash: canonical.sourceHash,
    baseCanonicalHash: canonical.canonicalTopologyHash,
    priorDraftHash: canonical.canonicalTopologyHash,
    sessionVersion: 0,
  };
  const request = createTopologyEditCommandRequest({
    commandId: `CMD-${commandType}`,
    commandType,
    payload,
    basis,
  });
  return resolveTopologyEditCommand({ request, canonicalTopology: canonical, authority: basis });
}

test('public native vocabulary stays locked while Wave 3B adds governed autofix commands', () => {
  assert.equal(TOPOLOGY_EDIT_NATIVE_COMMANDS.length, 7);
  assert.deepEqual(TOPOLOGY_EDIT_AUTOFIX_COMMANDS, [
    'ADD_BEND_DEFINITION',
    'ADD_JUNCTION_DEFINITION',
    'TRIM_EDGE',
  ]);
});

test('bend, junction, and trim reducers are deterministic and fail closed', () => {
  const bendBase = rightAngleTopology();
  const bendCommand = resolved(bendBase, 'ADD_BEND_DEFINITION', {
    nodeId: 'node:turn',
    edgeIds: ['edge:x', 'edge:y'],
    radiusMm: 150,
  });
  const bendLeft = applyResolvedTopologyEditCommand(bendBase, bendCommand);
  const bendRight = applyResolvedTopologyEditCommand(bendBase, bendCommand);
  assert.deepEqual(bendLeft, bendRight);
  assert.equal(bendLeft.edges.filter((edge) => edge.bendDefinition).length, 2);

  const junctionBase = multiwayTopology();
  const junction = applyResolvedTopologyEditCommand(junctionBase, resolved(
    junctionBase,
    'ADD_JUNCTION_DEFINITION',
    { nodeId: 'node:j', edgeIds: ['edge:a', 'edge:b', 'edge:c'], junctionType: 'TEE' },
  ));
  assert.equal(junction.junctions.length, 1);
  assert.deepEqual(junction.junctions[0].nodeIds, ['node:a', 'node:b', 'node:c', 'node:j']);

  const trimBase = trimTopology();
  const trimmed = applyResolvedTopologyEditCommand(trimBase, resolved(
    trimBase,
    'TRIM_EDGE',
    { edgeId: 'edge:trim', endpoint: 'FROM', fraction: 0.25 },
  ));
  assert.deepEqual(trimmed.nodes.find((node) => node.id === 'node:tail').position, { x: 25, y: 0, z: 0 });
  assert.throws(() => resolved(trimBase, 'TRIM_EDGE', {
    edgeId: 'edge:trim', endpoint: 'TO', fraction: 0.25,
  }), /degree 1 is required/);
});

test('fix suggestions require explicit radius, junction type, and trim plan evidence', () => {
  const issues = [
    { id: 'i:bend', kind: 'RIGHT_ANGLE_WITHOUT_BEND', nodeIds: ['node:turn'], edgeIds: ['edge:x', 'edge:y'] },
    { id: 'i:junction', kind: 'MULTIWAY_WITHOUT_JUNCTION', nodeIds: ['node:j'], edgeIds: ['edge:a', 'edge:b', 'edge:c'] },
    { id: 'i:trim', kind: 'OVERLAPPING_ELEMENTS', nodeIds: [], edgeIds: ['edge:trim', 'edge:other'] },
  ];
  assert.deepEqual(TopologyEditAutofixController.suggestions({}, issues, {}), []);
  const suggestions = TopologyEditAutofixController.suggestions({}, issues, {
    bendRadiusByNodeId: { 'node:turn': 150 },
    junctionTypeByNodeId: { 'node:j': 'TEE' },
    trimPlanByIssueId: { 'i:trim': { edgeId: 'edge:trim', endpoint: 'FROM', fraction: 0.25 } },
  });
  assert.deepEqual(suggestions.map((row) => row.commandType).sort(), [
    'ADD_BEND_DEFINITION', 'ADD_JUNCTION_DEFINITION', 'TRIM_EDGE',
  ]);
});

test('certified preview, ghost, and accepted candidate are identical', () => {
  const base = rightAngleTopology();
  const issue = checkCanonicalTopology(base).find((row) => row.kind === 'RIGHT_ANGLE_WITHOUT_BEND');
  assert.ok(issue);
  const session = new TopologyEditCertifiedSession(base);
  const [suggestion] = TopologyEditAutofixController.suggestions(base, [issue], {
    bendRadiusByNodeId: { 'node:turn': 150 },
  });
  const preview = TopologyEditAutofixController.preview(session, suggestion);
  assert.equal(preview.disposition, 'ACCEPTED');
  assert.deepEqual(preview.guardReasons, []);
  assert.equal(preview.ghost.candidateDraftHash, preview.candidateDraftHash);
  assert.deepEqual(preview.ghost.segments.map((row) => row.id).sort(), ['edge:x', 'edge:y']);

  const transition = TopologyEditAutofixController.accept(session, preview);
  assert.equal(transition.disposition, 'ACCEPTED');
  assert.equal(transition.certification.candidate.candidateDraftHash, preview.candidateDraftHash);
  assert.equal(session.journal.activeCommandIds.length, 1);
  assert.equal(session.currentTopology().edges.every((edge) => edge.bendDefinition?.radiusMm === 150), true);
  assert.throws(() => TopologyEditAutofixController.accept(session, preview), /preview is stale/);
});

test('junction and trim commands pass the full certified session pipeline', () => {
  const junctionSession = new TopologyEditCertifiedSession(multiwayTopology());
  const junction = junctionSession.execute('ADD_JUNCTION_DEFINITION', {
    nodeId: 'node:j', edgeIds: ['edge:a', 'edge:b', 'edge:c'], junctionType: 'TEE',
  });
  assert.equal(junction.disposition, 'ACCEPTED');
  assert.equal(junctionSession.currentTopology().junctions.length, 1);

  const trimSession = new TopologyEditCertifiedSession(trimTopology());
  const trim = trimSession.execute('TRIM_EDGE', {
    edgeId: 'edge:trim', endpoint: 'FROM', fraction: 0.25,
  });
  assert.equal(trim.disposition, 'ACCEPTED');
  assert.deepEqual(trimSession.currentTopology().nodes.find((node) => node.id === 'node:tail').position, {
    x: 25, y: 0, z: 0,
  });
});
