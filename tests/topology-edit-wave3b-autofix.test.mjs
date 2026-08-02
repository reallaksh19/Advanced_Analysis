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

function topology({ nodes, edges, junctions = [], supports = [], boundaries = [], rigids = [] }) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'W3B', datasetVersion: 0,
    sourceHash: 'source:w3b', topologyGraphHash: 'graph:w3b',
    nodes, edges, junctions, supports, boundaries, rigids,
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
      { id: 'edge:x', componentKey: 'PX', fromNodeId: 'node:turn',
        toNodeId: 'node:x', entityType: 'PIPE', sourcePath: '$[0]' },
      { id: 'edge:y', componentKey: 'PY', fromNodeId: 'node:turn',
        toNodeId: 'node:y', entityType: 'PIPE', sourcePath: '$[1]' },
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
      { id: 'edge:trim', fromNodeId: 'node:tail',
        toNodeId: 'node:middle', entityType: 'PIPE' },
      { id: 'edge:next', fromNodeId: 'node:middle',
        toNodeId: 'node:end', entityType: 'PIPE' },
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
    commandId: `CMD-${commandType}`, commandType, payload, basis,
  });
  return resolveTopologyEditCommand({ request, canonicalTopology: canonical, authority: basis });
}

const bendPayload = Object.freeze({
  nodeId: 'node:turn', edgeIds: ['edge:x', 'edge:y'],
  radiusMm: 150, angleDeg: 90, radiusAuthority: 'CATALOG:LR_1_5D',
});
const junctionPayload = Object.freeze({
  nodeId: 'node:j', edgeIds: ['edge:a', 'edge:b', 'edge:c'],
  kind: 'TEE', inferenceAuthority: 'EXPLICIT_USER_SELECTION',
});
const trimPayload = Object.freeze({
  edgeId: 'edge:trim', endpoint: 'FROM', position: { x: 25, y: 0, z: 0 },
});

test('public native vocabulary stays locked while exact Wave 3 commands are additive', () => {
  assert.equal(TOPOLOGY_EDIT_NATIVE_COMMANDS.length, 7);
  assert.deepEqual(TOPOLOGY_EDIT_AUTOFIX_COMMANDS, [
    'ADD_BEND_DEFINITION', 'ADD_JUNCTION_DEFINITION', 'TRIM_EDGE',
  ]);
});

test('bend, junction, and trim reducers use exact source payloads and fail closed', () => {
  const bendBase = rightAngleTopology();
  const bendCommand = resolved(bendBase, 'ADD_BEND_DEFINITION', bendPayload);
  const bendLeft = applyResolvedTopologyEditCommand(bendBase, bendCommand);
  assert.deepEqual(bendLeft, applyResolvedTopologyEditCommand(bendBase, bendCommand));
  assert.equal(bendLeft.bends[0].angleDeg, 90);
  assert.equal(bendLeft.bends[0].radiusAuthority, 'CATALOG:LR_1_5D');

  const junctionBase = multiwayTopology();
  const junction = applyResolvedTopologyEditCommand(
    junctionBase, resolved(junctionBase, 'ADD_JUNCTION_DEFINITION', junctionPayload),
  );
  assert.equal(junction.junctions[0].kind, 'TEE');
  assert.equal(junction.junctions[0].inferenceAuthority, 'EXPLICIT_USER_SELECTION');

  const trimBase = trimTopology();
  const trimmed = applyResolvedTopologyEditCommand(
    trimBase, resolved(trimBase, 'TRIM_EDGE', trimPayload),
  );
  assert.deepEqual(
    trimmed.nodes.find((node) => node.id === 'node:tail').position,
    { x: 25, y: 0, z: 0 },
  );
  assert.throws(() => resolved(trimBase, 'TRIM_EDGE', {
    edgeId: 'edge:trim', endpoint: 'TO', position: { x: 125, y: 0, z: 0 },
  }), /not graph-open/);
});

test('suggestions require complete radius, junction, and exact trim-position authority', () => {
  const issues = [
    { id: 'i:bend', kind: 'RIGHT_ANGLE_WITHOUT_BEND', nodeIds: ['node:turn'],
      edgeIds: ['edge:x', 'edge:y'], angleDeg: 90 },
    { id: 'i:junction', kind: 'MULTIWAY_WITHOUT_JUNCTION', nodeIds: ['node:j'],
      edgeIds: ['edge:a', 'edge:b', 'edge:c'] },
    { id: 'i:trim', kind: 'OVERLAPPING_ELEMENTS', nodeIds: [],
      edgeIds: ['edge:trim', 'edge:other'] },
  ];
  assert.deepEqual(TopologyEditAutofixController.suggestions({}, issues, {}), []);
  const suggestions = TopologyEditAutofixController.suggestions({}, issues, {
    bendRadiusByNodeId: { 'node:turn': 150 },
    bendRadiusAuthorityByNodeId: { 'node:turn': 'CATALOG:LR_1_5D' },
    junctionKindByNodeId: { 'node:j': 'TEE' },
    junctionInferenceAuthorityByNodeId: { 'node:j': 'EXPLICIT_USER_SELECTION' },
    trimPlanByIssueId: {
      'i:trim': { edgeId: 'edge:trim', endpoint: 'FROM',
        position: { x: 25, y: 0, z: 0 } },
    },
  });
  assert.deepEqual(suggestions.map((row) => row.payload), [
    bendPayload, junctionPayload, trimPayload,
  ]);
  const serialized = JSON.stringify(suggestions);
  assert.equal(serialized.includes('bendType'), false);
  assert.equal(serialized.includes('junctionType'), false);
  assert.equal(serialized.includes('fraction'), false);
});

test('certified preview, ghost, and accepted bend candidate remain identical', () => {
  const base = rightAngleTopology();
  const issue = checkCanonicalTopology(base)
    .find((row) => row.kind === 'RIGHT_ANGLE_WITHOUT_BEND');
  const session = new TopologyEditCertifiedSession(base);
  const [suggestion] = TopologyEditAutofixController.suggestions(base, [issue], {
    bendRadiusByNodeId: { 'node:turn': 150 },
    bendRadiusAuthorityByNodeId: { 'node:turn': 'CATALOG:LR_1_5D' },
  });
  const preview = TopologyEditAutofixController.preview(session, suggestion);
  assert.equal(preview.disposition, 'ACCEPTED');
  assert.equal(preview.ghost.candidateDraftHash, preview.candidateDraftHash);
  assert.deepEqual(preview.ghost.segments.map((row) => row.id).sort(), ['edge:x', 'edge:y']);
  const transition = TopologyEditAutofixController.accept(session, preview);
  assert.equal(transition.disposition, 'ACCEPTED');
  assert.equal(session.currentTopology().bends[0].radiusMm, 150);
  assert.equal(session.currentTopology().bends[0].angleDeg, 90);
  assert.throws(() => TopologyEditAutofixController.accept(session, preview), /preview is stale/);
});

test('junction and trim commands pass the full certified session pipeline', () => {
  const junctionSession = new TopologyEditCertifiedSession(multiwayTopology());
  assert.equal(
    junctionSession.execute('ADD_JUNCTION_DEFINITION', junctionPayload).disposition,
    'ACCEPTED',
  );
  assert.equal(junctionSession.currentTopology().junctions[0].kind, 'TEE');

  const trimSession = new TopologyEditCertifiedSession(trimTopology());
  assert.equal(trimSession.execute('TRIM_EDGE', trimPayload).disposition, 'ACCEPTED');
  assert.deepEqual(
    trimSession.currentTopology().nodes.find((node) => node.id === 'node:tail').position,
    { x: 25, y: 0, z: 0 },
  );
});
