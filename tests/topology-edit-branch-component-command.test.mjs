import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTopologyEditBranchComponentEffect,
  assertTopologyEditBranchComponentRequest,
  createTopologyEditBranchComponentEffect,
  normalizeTopologyEditBranchComponentRequest,
} from '../src/workspace/topology-edit/topology-edit-branch-component-command.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

function request(overrides = {}) {
  return {
    operationId: 'operation:branch-001',
    hostEdgeId: 'edge:P-005',
    hostEdgeHash: HASH_A,
    hostFromNodeId: 'node:N-009',
    hostToNodeId: 'node:N-010',
    hostFrom: { x: 0, y: 0, z: 0 },
    hostTo: { x: 1200, y: 0, z: 0 },
    catalogueHash: HASH_B,
    catalogueVersion: '2026.08.06',
    catalogueRecordId: 'OLET-DN100-DN50-600-A',
    catalogueRecordHash: HASH_C,
    branchFamily: 'OLET',
    hostNominalSizeMm: 100,
    hostOutsideDiameterMm: 114.3,
    branchNominalSizeMm: 50,
    branchOutsideDiameterMm: 60.3,
    pipingClass: '600',
    pressureClass: '600',
    materialSpecification: 'ASTM A105',
    hostEndConnection: 'BW',
    branchEndConnection: 'BW',
    stationMm: 500,
    clockingDeg: 90,
    componentLengthMm: 75,
    componentMassKg: 8.5,
    branchPipeLengthMm: 425,
    ...overrides,
  };
}

test('request normalization retains exact catalogue and derived geometry authority', () => {
  const normalized = normalizeTopologyEditBranchComponentRequest(request());

  assert.equal(normalized.catalogueRecordId, 'OLET-DN100-DN50-600-A');
  assert.equal(normalized.catalogueRecordHash, HASH_C);
  assert.equal(normalized.branchFamily, 'OLET');
  assert.equal(normalized.hostNominalSizeMm, 100);
  assert.equal(normalized.branchNominalSizeMm, 50);
  assert.equal(normalized.componentLengthMm, 75);
  assert.equal(normalized.componentMassKg, 8.5);
  assert.equal(normalized.geometry.stationMm, 500);
  assert.equal(normalized.geometry.clockingDeg, 90);
  assert.equal(assertTopologyEditBranchComponentRequest(normalized), normalized);
  assert.ok(Object.isFrozen(normalized));
});

test('effect removes one host and creates exact degree-three branch topology', () => {
  const effect = createTopologyEditBranchComponentEffect(request());

  assert.deepEqual(effect.removedEdgeIds, ['edge:P-005']);
  assert.equal(effect.nodes.length, 3);
  assert.equal(effect.edges.length, 4);
  assert.equal(new Set(effect.generatedNodeIds).size, 3);
  assert.equal(new Set(effect.generatedEdgeIds).size, 4);

  const junction = effect.symbolicOutputs.junctionNodeId;
  const incident = effect.edges.filter((edge) => (
    edge.fromNodeId === junction || edge.toNodeId === junction
  ));
  assert.equal(incident.length, 3);
  assert.deepEqual(
    incident.map((edge) => edge.role).sort(),
    ['BRANCH_COMPONENT', 'HOST_FROM', 'HOST_TO'],
  );

  const component = effect.edges.find((edge) => (
    edge.id === effect.symbolicOutputs.componentEdgeId
  ));
  assert.equal(component.entityType, 'OLET');
  assert.equal(component.catalogueRecordId, 'OLET-DN100-DN50-600-A');
  assert.equal(component.catalogueRecordHash, HASH_C);
  assert.equal(component.lengthMm, 75);
  assert.equal(component.componentMassKg, 8.5);

  const branchPipe = effect.edges.find((edge) => (
    edge.id === effect.symbolicOutputs.branchPipeEdgeId
  ));
  assert.equal(branchPipe.entityType, 'PIPE');
  assert.equal(branchPipe.nominalSizeMm, 50);
  assert.equal(branchPipe.outsideDiameterMm, 60.3);
  assert.equal(branchPipe.lengthMm, 425);
  assert.equal(branchPipe.fromNodeId, effect.symbolicOutputs.componentFaceNodeId);
  assert.equal(branchPipe.toNodeId, effect.symbolicOutputs.branchEndNodeId);

  for (const edge of effect.edges) assert.ok(edge.lengthMm > 0);
  assert.equal(assertTopologyEditBranchComponentEffect(effect), effect);
});

test('equivalent clocking produces identical request, generated IDs, and effect hashes', () => {
  const left = createTopologyEditBranchComponentEffect(request({ clockingDeg: 450 }));
  const right = createTopologyEditBranchComponentEffect(request({ clockingDeg: -270 }));

  assert.deepEqual(left, right);
});

test('tee and olet effects retain distinct component family authority', () => {
  const olet = createTopologyEditBranchComponentEffect(request());
  const tee = createTopologyEditBranchComponentEffect(request({
    branchFamily: 'TEE',
    catalogueRecordId: 'TEE-DN100-DN50-600-A',
    catalogueRecordHash: `sha256:${'d'.repeat(64)}`,
    componentLengthMm: 110,
    componentMassKg: 23,
  }));

  assert.notEqual(tee.effectHash, olet.effectHash);
  assert.equal(
    tee.edges.find((edge) => edge.role === 'BRANCH_COMPONENT').entityType,
    'TEE',
  );
  assert.equal(
    olet.edges.find((edge) => edge.role === 'BRANCH_COMPONENT').entityType,
    'OLET',
  );
});

test('contract rejects stale hashes, invalid placement, zero lengths, and tampering', () => {
  assert.throws(
    () => normalizeTopologyEditBranchComponentRequest(request({
      catalogueRecordHash: 'not-a-hash',
    })),
    /sha256 hash/u,
  );
  assert.throws(
    () => normalizeTopologyEditBranchComponentRequest(request({
      stationMm: 1200,
    })),
    /fit strictly inside/u,
  );
  assert.throws(
    () => normalizeTopologyEditBranchComponentRequest(request({
      componentMassKg: 0,
    })),
    /must be positive/u,
  );
  assert.throws(
    () => normalizeTopologyEditBranchComponentRequest(request({
      branchPipeLengthMm: 0,
    })),
    /must be positive/u,
  );

  const normalized = normalizeTopologyEditBranchComponentRequest(request());
  assert.throws(
    () => assertTopologyEditBranchComponentRequest({
      ...normalized,
      catalogueRecordId: 'OLET-TAMPERED',
    }),
    /hash mismatch/u,
  );

  const effect = createTopologyEditBranchComponentEffect(normalized);
  assert.throws(
    () => assertTopologyEditBranchComponentEffect({
      ...effect,
      removedEdgeIds: [],
    }),
    /hash mismatch/u,
  );
});
