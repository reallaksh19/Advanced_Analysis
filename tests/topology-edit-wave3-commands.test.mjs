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
