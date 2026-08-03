import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTopologyEditCommandRequest,
  TOPOLOGY_EDIT_AUTOFIX_COMMANDS,
  TOPOLOGY_EDIT_GOVERNED_COMMANDS,
  TOPOLOGY_EDIT_NATIVE_COMMANDS,
  TOPOLOGY_EDIT_WAVE3_ENGINEERING_COMMANDS,
} from '../src/workspace/topology-edit/topology-edit-command-contract.js';
import { TopologyEditAutofixController } from '../src/workspace/topology-edit/topology-edit-autofix-controller.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { resolveTopologyEditCommand } from '../src/workspace/topology-edit/topology-edit-command-resolver.js';
import { buildTopologyEditCandidate } from '../src/workspace/topology-edit/topology-edit-candidate-builder.js';
import { validateTopologyEditCandidate } from '../src/workspace/topology-edit/topology-edit-candidate-validator.js';

function canonical({ nodes, edges, junctions = [], supports = [], boundaries = [], rigids = [], bends } = {}) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'DS', datasetVersion: 0,
    sourceHash: 'source', topologyGraphHash: 'graph', nodes, edges, junctions,
    supports, boundaries, rigids, ...(bends ? { bends } : {}),
  });
}
function basis(base, current = base) {
  return { sourceHash: base.sourceHash, baseCanonicalHash: base.canonicalTopologyHash,
    priorDraftHash: current.canonicalTopologyHash, sessionVersion: 0 };
}
function resolved(base, type, payload) {
  const request = createTopologyEditCommandRequest({ commandId: `cmd:${type}`, commandType: type,
    payload, basis: basis(base) });
  return resolveTopologyEditCommand({ request, canonicalTopology: base, authority: request.basis });
}
function bendBase() {
  return canonical({ nodes: [
    { id: 'N0', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
    { id: 'N1', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
    { id: 'N2', position: { x: 100, y: 100, z: 0 }, portKeys: [] },
  ], edges: [
    { id: 'E1', componentKey: 'P1', fromNodeId: 'N0', toNodeId: 'N1', entityType: 'PIPE' },
    { id: 'E2', componentKey: 'P2', fromNodeId: 'N1', toNodeId: 'N2', entityType: 'PIPE' },
  ] });
}
function junctionBase() {
  return canonical({ nodes: [
    { id: 'C', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
    { id: 'A', position: { x: -100, y: 0, z: 0 }, portKeys: [] },
    { id: 'B', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
    { id: 'D', position: { x: 0, y: 100, z: 0 }, portKeys: [] },
  ], edges: [
    { id: 'EA', componentKey: 'P1', fromNodeId: 'A', toNodeId: 'C', entityType: 'PIPE' },
    { id: 'EB', componentKey: 'P2', fromNodeId: 'C', toNodeId: 'B', entityType: 'PIPE' },
    { id: 'ED', componentKey: 'P3', fromNodeId: 'C', toNodeId: 'D', entityType: 'PIPE' },
  ] });
}
function tieFlipBase(reverseInput) {
  const nodes = [
    { id: 'a:1', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
    { id: 'a:2', position: { x: 1100, y: 0, z: 0 }, portKeys: [] },
    { id: 'b:1', position: { x: 2000, y: 0, z: 0 }, portKeys: [] },
    { id: 'b:2', position: { x: 2100, y: 0, z: 0 }, portKeys: [] },
    { id: 'z:1', position: { x: 0, y: 1000, z: 0 }, portKeys: [] },
    { id: 'z:2', position: { x: 100, y: 1000, z: 0 }, portKeys: [] },
    { id: 'z:3', position: { x: 200, y: 1000, z: 0 }, portKeys: [] },
  ];
  const edges = [
    { id: 'E:A', componentKey: 'A', fromNodeId: 'a:1', toNodeId: 'a:2', entityType: 'PIPE' },
    { id: 'E:B', componentKey: 'B', fromNodeId: 'b:1', toNodeId: 'b:2', entityType: 'PIPE' },
    { id: 'E:Z1', componentKey: 'Z1', fromNodeId: 'z:1', toNodeId: 'z:2', entityType: 'PIPE' },
    { id: 'E:Z2', componentKey: 'Z2', fromNodeId: 'z:2', toNodeId: 'z:3', entityType: 'PIPE' },
  ];
  return canonical({ nodes: reverseInput ? nodes.toReversed() : nodes,
    edges: reverseInput ? edges.toReversed() : edges });
}
function lineBase(nodeIds) {
  return canonical({
    nodes: nodeIds.map((id, index) => ({ id, position: { x: index * 100, y: 0, z: 0 }, portKeys: [] })),
    edges: nodeIds.slice(1).map((id, index) => ({ id: `E:${index + 1}`,
      componentKey: `P:${index + 1}`, fromNodeId: nodeIds[index], toNodeId: id,
      entityType: 'PIPE' })),
  });
}
function equalSizeReplacementBase() {
  return canonical({ nodes: [
    { id: 'a:old', position: { x: 0, y: 0, z: 0 }, portKeys: ['P0:port:start'] },
    { id: 'z:1', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
    { id: 'z:2', position: { x: 200, y: 0, z: 0 }, portKeys: [] },
    { id: 'b:1', position: { x: 0, y: 1000, z: 0 }, portKeys: [] },
    { id: 'b:2', position: { x: 100, y: 1000, z: 0 }, portKeys: [] },
    { id: 'b:3', position: { x: 200, y: 1000, z: 0 }, portKeys: [] },
  ], edges: [
    { id: 'E:P0', componentKey: 'P0', fromNodeId: 'a:old', toNodeId: 'z:1', entityType: 'PIPE' },
    { id: 'E:P1', componentKey: 'P1', fromNodeId: 'z:1', toNodeId: 'z:2', entityType: 'PIPE' },
    { id: 'E:B1', componentKey: 'B1', fromNodeId: 'b:1', toNodeId: 'b:2', entityType: 'PIPE' },
    { id: 'E:B2', componentKey: 'B2', fromNodeId: 'b:2', toNodeId: 'b:3', entityType: 'PIPE' },
  ] });
}

test('Wave 3 adds three governed commands without changing the seven-command public source API', () => {
  assert.equal(TOPOLOGY_EDIT_NATIVE_COMMANDS.length, 7);
  assert.deepEqual(TOPOLOGY_EDIT_WAVE3_ENGINEERING_COMMANDS,
    ['ADD_BEND_DEFINITION', 'ADD_JUNCTION_DEFINITION', 'TRIM_EDGE']);
  assert.deepEqual(TOPOLOGY_EDIT_AUTOFIX_COMMANDS, TOPOLOGY_EDIT_WAVE3_ENGINEERING_COMMANDS);
  assert.equal(TOPOLOGY_EDIT_GOVERNED_COMMANDS.length, 10);
});

test('bend definition binds exact incident arms and certifies the candidate', () => {
  const base = bendBase();
  const command = resolved(base, 'ADD_BEND_DEFINITION', { nodeId: 'N1', edgeIds: ['E1', 'E2'],
    radiusMm: 150, angleDeg: 90, radiusAuthority: 'CATALOG:LR_1_5D' });
  const candidate = buildTopologyEditCandidate({ canonicalTopology: base, resolvedCommand: command });
  const report = validateTopologyEditCandidate({ candidate, baseCanonicalTopology: base });
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(candidate.canonicalTopology.bends.length, 1);
  assert.equal(candidate.canonicalTopology.edges.every((edge) => edge.bendDefinition?.bendId === candidate.canonicalTopology.bends[0].id), true);
  assert.equal(candidate.checkerDelta.resolvedIssues.some((issue) => issue.kind === 'RIGHT_ANGLE_WITHOUT_BEND'), true);
});

test('junction definition binds exact three arms and certifies TEE/OLET authority', () => {
  const base = junctionBase();
  const command = resolved(base, 'ADD_JUNCTION_DEFINITION', { nodeId: 'C', edgeIds: ['EA', 'EB', 'ED'],
    kind: 'TEE', inferenceAuthority: 'EXPLICIT_USER_SELECTION' });
  const candidate = buildTopologyEditCandidate({ canonicalTopology: base, resolvedCommand: command });
  const report = validateTopologyEditCandidate({ candidate, baseCanonicalTopology: base });
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.deepEqual(candidate.canonicalTopology.junctions[0].participatingEdgeIds, ['EA', 'EB', 'ED']);
  assert.equal(candidate.checkerDelta.resolvedIssues.some((issue) => issue.kind === 'MULTIWAY_WITHOUT_JUNCTION'), true);
});

test('trim requires an exact graph-open endpoint and rejects dependent or collapsing edits', () => {
  const base = bendBase();
  const trim = resolved(base, 'TRIM_EDGE', { edgeId: 'E1', endpoint: 'FROM', position: { x: 20, y: 0, z: 0 } });
  const candidate = buildTopologyEditCandidate({ canonicalTopology: base, resolvedCommand: trim });
  assert.equal(validateTopologyEditCandidate({ candidate, baseCanonicalTopology: base }).valid, true);
  assert.deepEqual(candidate.canonicalTopology.nodes.find((node) => node.id === 'N0').position, { x: 20, y: 0, z: 0 });
  assert.throws(() => resolved(base, 'TRIM_EDGE', { edgeId: 'E1', endpoint: 'TO', position: { x: 80, y: 0, z: 0 } }), /not graph-open/);
  const supported = canonical({ ...base, canonicalTopologyHash: undefined,
    supports: [{ id: 'S1', nodeId: 'N0', resolved: true }] });
  assert.throws(() => resolved(supported, 'TRIM_EDGE', { edgeId: 'E1', endpoint: 'FROM', position: { x: 20, y: 0, z: 0 } }), /supports record S1 depends/);
  assert.throws(() => resolved(base, 'TRIM_EDGE', { edgeId: 'E1', endpoint: 'FROM', position: { x: 100, y: 0, z: 0 } }), /would collapse/);
});

test('autofix emits only explicit source-compatible payloads and never the superseded dialect', () => {
  const issues = [
    { id: 'i:bend', kind: 'RIGHT_ANGLE_WITHOUT_BEND', nodeIds: ['N1'], edgeIds: ['E1', 'E2'], angleDeg: 90 },
    { id: 'i:junction', kind: 'MULTIWAY_WITHOUT_JUNCTION', nodeIds: ['C'], edgeIds: ['EA', 'EB', 'ED'] },
    { id: 'i:trim', kind: 'OVERLAPPING_ELEMENTS', nodeIds: [], edgeIds: ['E1', 'E9'] },
  ];
  assert.deepEqual(TopologyEditAutofixController.suggestions({}, issues, {}), []);
  const rows = TopologyEditAutofixController.suggestions({}, issues, {
    bendRadiusByNodeId: { N1: 150 }, bendRadiusAuthorityByNodeId: { N1: 'CATALOG:LR_1_5D' },
    junctionKindByNodeId: { C: 'TEE' }, junctionInferenceAuthorityByNodeId: { C: 'EXPLICIT_USER_SELECTION' },
    trimPlanByIssueId: { 'i:trim': { edgeId: 'E1', endpoint: 'FROM', position: { x: 20, y: 0, z: 0 } } },
  });
  assert.deepEqual(rows.map((row) => row.commandType),
    ['ADD_BEND_DEFINITION', 'ADD_JUNCTION_DEFINITION', 'TRIM_EDGE']);
  const json = JSON.stringify(rows);
  assert.equal(json.includes('bendType'), false);
  assert.equal(json.includes('junctionType'), false);
  assert.equal(json.includes('fraction'), false);
});

test('[SIMULATED] exact previous-primary tie flips are continuity, independent of input order', () => {
  const candidates = [false, true].map((reverseInput) => {
    const base = tieFlipBase(reverseInput);
    return buildTopologyEditCandidate({ canonicalTopology: base,
      resolvedCommand: resolved(base, 'MERGE_NODES', { sourceNodeId: 'a:2', targetNodeId: 'b:1' }) });
  });
  const previousPrimary = ['z:1', 'z:2', 'z:3'];
  for (const candidate of candidates) {
    assert.equal(candidate.afterChecker.issues.some((issue) => issue.kind === 'BRANCH_DISCONNECTED'
      && issue.nodeIds.length === previousPrimary.length
      && issue.nodeIds.every((id, index) => id === previousPrimary[index])), true);
    assert.deepEqual(candidate.checkerDelta.introducedIssues, []);
  }
  assert.equal(candidates[0].checkerDelta.checkerDeltaHash,
    candidates[1].checkerDelta.checkerDeltaHash);
  assert.equal(candidates[0].candidateDraftHash, candidates[1].candidateDraftHash);
});

test('[SIMULATED] deleting an edge keeps a genuine primary subset introduced', () => {
  const base = lineBase(['n:1', 'n:2', 'n:3', 'n:4']);
  const candidate = buildTopologyEditCandidate({ canonicalTopology: base,
    resolvedCommand: resolved(base, 'DELETE_EDGE', { edgeId: 'E:2' }) });
  const introducedBranch = candidate.checkerDelta.introducedIssues.find((issue) => (
    issue.kind === 'BRANCH_DISCONNECTED'
  ));
  assert.deepEqual(introducedBranch.nodeIds, ['n:3', 'n:4']);
});

test('[SIMULATED] size-only matches and non-branch findings remain introduced', () => {
  const base = equalSizeReplacementBase();
  const candidate = buildTopologyEditCandidate({ canonicalTopology: base,
    resolvedCommand: resolved(base, 'DISCONNECT_ENDPOINT', { edgeId: 'E:P0', endpoint: 'FROM' }) });
  const previousPrimary = ['a:old', 'z:1', 'z:2'];
  const equalSizeBranch = candidate.checkerDelta.introducedIssues.find((issue) => (
    issue.kind === 'BRANCH_DISCONNECTED' && issue.nodeIds.length === previousPrimary.length
  ));
  assert.ok(equalSizeBranch);
  assert.notDeepEqual(equalSizeBranch.nodeIds, previousPrimary);
  const afterOrphan = candidate.afterChecker.issues.find((issue) => (
    issue.kind === 'ORPHAN_NODE' && issue.nodeIds.includes('a:old')
  ));
  assert.ok(afterOrphan);
  const introducedOrphan = candidate.checkerDelta.introducedIssues.find((issue) => (
    issue.id === afterOrphan.id
  ));
  assert.deepEqual(introducedOrphan, afterOrphan);
});
