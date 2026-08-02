import test from 'node:test';
import assert from 'node:assert/strict';
import { createTopologyEditCommandRequest } from '../src/workspace/topology-edit/topology-edit-command-contract.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { certifyTopologyEditCommand } from '../src/workspace/topology-edit/topology-edit-certification-service.js';
import { assertTopologyEditAuthorityReceipt } from '../src/workspace/topology-edit/topology-edit-authority-receipt.js';
import { assertTopologyEditCertificationResult } from '../src/workspace/topology-edit/topology-edit-certification-service.js';

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-1',
    datasetVersion: 0,
    sourceHash: 'source:abc',
    topologyGraphHash: 'graph:abc',
    nodes: [
      { id: 'node:n1', position: { x: 0, y: 0, z: 0 }, portKeys: ['P1:port:start'] },
      { id: 'node:n2', position: { x: 100, y: 0, z: 0 }, portKeys: ['P1:port:end'] },
      { id: 'node:n3', position: { x: 200, y: 0, z: 0 }, portKeys: ['P2:port:start'] },
      { id: 'node:n4', position: { x: 300, y: 0, z: 0 }, portKeys: ['P2:port:end'] },
    ],
    edges: [
      { id: 'edge:e1', componentKey: 'P1', fromNodeId: 'node:n1', toNodeId: 'node:n2', diameterMm: 100, entityType: 'PIPE', sourcePath: '$[0]' },
      { id: 'edge:e2', componentKey: 'P2', fromNodeId: 'node:n3', toNodeId: 'node:n4', diameterMm: 80, entityType: 'PIPE', sourcePath: '$[1]' },
    ],
    junctions: [],
    supports: [{ id: 'support:s1', entityId: 'S1', nodeId: 'node:n3', resolved: true }],
    boundaries: [],
    rigids: [],
  });
}

function basis(base, current = base, sessionVersion = 0) {
  return {
    sourceHash: base.sourceHash,
    baseCanonicalHash: base.canonicalTopologyHash,
    priorDraftHash: current.canonicalTopologyHash,
    sessionVersion,
  };
}

function certify({ base = baseTopology(), current = base, commandId = 'CMD-1', commandType = 'MOVE_NODE', payload, sessionVersion = 0, requestBasis, authorityBasis, checkerPolicy } = {}) {
  const authority = authorityBasis ?? basis(base, current, sessionVersion);
  const request = createTopologyEditCommandRequest({
    commandId,
    commandType,
    payload,
    basis: requestBasis ?? authority,
  });
  return certifyTopologyEditCommand({
    request,
    canonicalTopology: current,
    baseCanonicalTopology: base,
    authority,
    checkerPolicy,
  });
}

test('valid command produces deterministic accepted receipt and full candidate', () => {
  const base = baseTopology();
  const input = { base, current: base, commandId: 'CMD-MOVE-1', payload: { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } } };
  const left = certify(input);
  const right = certify(input);
  assert.deepEqual(left, right);
  assert.equal(left.disposition, 'ACCEPTED');
  assert.equal(left.receipt.schema, 'TopologyEditCommandReceipt.v1');
  assert.equal(left.receipt.result.canonicalTopologyHash, left.candidate.canonicalTopologyHash);
  assert.equal(left.receipt.result.candidateDraftHash, left.candidate.candidateDraftHash);
  assert.match(left.receipt.result.editLedgerHash, /^fnv1a64:/);
  assert.deepEqual(left.candidate.canonicalTopology.nodes.find((node) => node.id === 'node:n1').position, { x: 10, y: 0, z: 0 });
  assertTopologyEditAuthorityReceipt(left.receipt);
  assertTopologyEditCertificationResult(left);
});

test('stale session authority rejects without exposing a candidate', () => {
  const base = baseTopology();
  const result = certify({
    base,
    current: base,
    payload: { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } },
    requestBasis: basis(base, base, 0),
    authorityBasis: basis(base, base, 1),
  });
  assert.equal(result.disposition, 'REJECTED');
  assert.equal(result.candidate, null);
  assert.equal(result.receipt.result.editLedgerHash, null);
  assert.ok(result.receipt.reasons.some((reason) => reason.code === 'CERTIFICATION_RESOLUTION_REJECTED'));
});

test('zero-length result is rejected by structural validation', () => {
  const base = baseTopology();
  const result = certify({
    base,
    current: base,
    payload: { nodeId: 'node:n1', position: { x: 100, y: 0, z: 0 } },
  });
  assert.equal(result.disposition, 'REJECTED');
  assert.equal(result.candidate, null);
  assert.ok(result.validationReport.errors.some((row) => row.code === 'EDGE_ZERO_LENGTH'));
});

test('no-effect command is rejected', () => {
  const base = baseTopology();
  const result = certify({
    base,
    current: base,
    payload: { nodeId: 'node:n1', position: { x: 0, y: 0, z: 0 } },
  });
  assert.equal(result.disposition, 'REJECTED');
  assert.ok(result.validationReport.errors.some((row) => row.code === 'COMMAND_NO_EFFECT'));
});

test('new high-severity checker finding rejects an otherwise structural candidate', () => {
  const base = baseTopology();
  const result = certify({
    base,
    current: base,
    payload: { nodeId: 'node:n2', position: { x: 190, y: 0, z: 0 } },
  });
  assert.equal(result.disposition, 'REJECTED');
  assert.ok(result.validationReport.errors.some((row) => row.code === 'CHECKER_REGRESSION'));
  assert.ok(result.receipt.reasons.some((reason) => reason.message.includes('SNAP_GAP')));
});

test('medium checker findings are retained as warnings when policy allows them', () => {
  const base = baseTopology();
  const result = certify({
    base,
    current: base,
    commandId: 'CMD-DELETE-1',
    commandType: 'DELETE_EDGE',
    payload: { edgeId: 'edge:e1' },
  });
  assert.equal(result.disposition, 'ACCEPTED');
  assert.ok(result.validationReport.warnings.some((row) => row.code === 'CHECKER_FINDING_INTRODUCED'));
  assert.equal(result.candidate.canonicalTopology.edges.some((edge) => edge.id === 'edge:e1'), false);
});

test('checker policy can make introduced medium findings blocking', () => {
  const base = baseTopology();
  const result = certify({
    base,
    current: base,
    commandId: 'CMD-DELETE-2',
    commandType: 'DELETE_EDGE',
    payload: { edgeId: 'edge:e1' },
    checkerPolicy: { rejectNewSeverities: ['HIGH', 'MEDIUM'] },
  });
  assert.equal(result.disposition, 'REJECTED');
  assert.ok(result.validationReport.errors.some((row) => row.code === 'CHECKER_REGRESSION'));
});

test('second command remains bound to original base and current prior draft', () => {
  const base = baseTopology();
  const first = certify({
    base,
    current: base,
    commandId: 'CMD-MOVE-FIRST',
    payload: { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } },
  });
  assert.equal(first.disposition, 'ACCEPTED');
  const current = first.candidate.canonicalTopology;
  const second = certify({
    base,
    current,
    commandId: 'CMD-MOVE-SECOND',
    payload: { nodeId: 'node:n4', position: { x: 310, y: 0, z: 0 } },
    sessionVersion: 1,
  });
  assert.equal(second.disposition, 'ACCEPTED');
  assert.equal(second.receipt.basis.baseCanonicalHash, base.canonicalTopologyHash);
  assert.equal(second.receipt.basis.priorDraftHash, current.canonicalTopologyHash);
  assert.equal(second.receipt.basis.sessionVersion, 1);
});

test('certification never mutates base or current input topology', () => {
  const base = baseTopology();
  const before = JSON.stringify(base);
  certify({ base, current: base, payload: { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } } });
  assert.equal(JSON.stringify(base), before);
});
