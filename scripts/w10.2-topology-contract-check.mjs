#!/usr/bin/env node
import assert from 'node:assert/strict';
import { canonicalStringify } from '../src/core/shared-piping-model/index.js';
import {
  buildPipingPortTopologyGraph,
  createExactTopologyProfile,
  createToleranceTopologyProfile,
  projectEngineeringPorts,
  TOPOLOGY_EVIDENCE,
  TOPOLOGY_STATES,
  validateEngineeringPortProjection,
  validatePipingPortTopologyGraph,
  validateTopologyConnectionAudit,
  validateTopologyConnectionProfile,
} from '../src/core/piping-topology/index.js';
import {
  closedLoop,
  component,
  crossFixture,
  exactChain,
  pipe,
  point,
  sharedModelFixture,
  teeFixture,
} from './w10.2-topology-fixtures.mjs';

console.log('\n--- W10.2 Topology Contract and Algorithm Check ---');

checkEmptyAndIsolated();
checkExactChainsAndOrientation();
checkJunctionComponents();
checkCyclesAndDisconnectedGeometry();
checkEvidencePrecedence();
checkToleranceProfiles();
checkIdentityAndAmbiguity();
checkInvalidAndExtremeCoordinates();
checkImmutabilityAndDeterminism();

console.log('\n✅ W10.2 topology contract and algorithm check passed.\n');

function checkEmptyAndIsolated() {
  const empty = buildPipingPortTopologyGraph(sharedModelFixture([]));
  assertGraph(empty);
  assert.equal(empty.summary.componentCount, 0);
  assert.equal(empty.summary.connectionCount, 0);
  const isolated = buildPipingPortTopologyGraph(sharedModelFixture([
    pipe('ISOLATED', point(0, 0), point(100, 0)),
  ]));
  assert.equal(isolated.summary.connectedComponentCount, 1);
  assert.equal(isolated.summary.unconnectedPortCount, 2);
  console.log('✅ Empty and isolated component contracts are deterministic.');
}

function checkExactChainsAndOrientation() {
  const two = buildPipingPortTopologyGraph(sharedModelFixture([
    pipe('A', point(0, 0), point(100, 0)),
    pipe('B', point(100, 0), point(200, 0)),
  ]));
  assert.equal(two.connections.length, 1);
  assert.equal(two.connections[0].evidenceType, TOPOLOGY_EVIDENCE.EXACT_COORDINATE);
  const reversed = buildPipingPortTopologyGraph(sharedModelFixture([
    pipe('A', point(100, 0), point(0, 0)),
    pipe('B', point(200, 0), point(100, 0)),
  ]));
  assert.deepEqual(componentPairs(reversed), componentPairs(two));
  const chain = buildPipingPortTopologyGraph(sharedModelFixture(exactChain(10)));
  assert.equal(chain.connections.length, 9);
  assert.equal(chain.connectedComponents.length, 1);
  console.log('✅ Straight chains and reversed orientation preserve connectivity.');
}

function checkJunctionComponents() {
  const tee = buildPipingPortTopologyGraph(sharedModelFixture(teeFixture()));
  assert.equal(tee.components.find((row) => row.componentKey === 'TEE').portKeys.length, 3);
  assert.equal(tee.connections.length, 3);
  const cross = buildPipingPortTopologyGraph(sharedModelFixture(crossFixture()));
  assert.equal(cross.components.find((row) => row.componentKey === 'CROSS').portKeys.length, 4);
  assert.equal(cross.connections.length, 4);
  console.log('✅ Tee and cross remain multi-port engineering components.');
}

function checkCyclesAndDisconnectedGeometry() {
  const loop = buildPipingPortTopologyGraph(sharedModelFixture(closedLoop()));
  assert.equal(loop.connections.length, 4);
  assert.equal(loop.summary.cycleCount, 1);
  assert.equal(loop.topologyAudit.cyclicComponentIds.length, 1);
  const crossing = buildPipingPortTopologyGraph(sharedModelFixture([
    pipe('HORIZONTAL', point(-100, 0), point(100, 0)),
    pipe('VERTICAL', point(0, -100), point(0, 100)),
  ]));
  assert.equal(crossing.connections.length, 0);
  const parallel = buildPipingPortTopologyGraph(sharedModelFixture([
    pipe('P1', point(0, 0), point(100, 0)),
    pipe('P2', point(0, 10), point(100, 10)),
  ]));
  assert.equal(parallel.connections.length, 0);
  console.log('✅ Valid loops are cyclic evidence; crossing and parallel lines stay disconnected.');
}

function checkEvidencePrecedence() {
  const explicit = sharedModelFixture([
    component('EX-A', [{ position: point(0, 0), sourceReference: { peerPortKey: 'EX-B:port:1' } }]),
    component('EX-B', [{ position: point(500, 0) }]),
  ]);
  const explicitGraph = buildPipingPortTopologyGraph(explicit);
  assert.equal(explicitGraph.connections[0].evidenceType, TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE);
  assert.equal(explicitGraph.connections[0].distanceCanonical, 500);
  const endpoint = sharedModelFixture([
    component('EP-A', [{ position: point(0, 0), sourceReference: { sourceNodeId: 'NODE-1' } }]),
    component('EP-B', [{ position: point(500, 0), sourceReference: { sourceNodeId: 'NODE-1' } }]),
  ]);
  assert.equal(buildPipingPortTopologyGraph(endpoint).connections[0].evidenceType, TOPOLOGY_EVIDENCE.SHARED_SOURCE_ENDPOINT_IDENTITY);
  const sameCoordinateWithExplicit = sharedModelFixture([
    component('P-A', [{ position: point(0, 0), sourceReference: { explicitConnectionId: 'REF-1' } }]),
    component('P-B', [{ position: point(0, 0), sourceReference: { explicitConnectionId: 'REF-1' } }]),
  ]);
  assert.equal(buildPipingPortTopologyGraph(sameCoordinateWithExplicit).connections[0].evidenceType, TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE);
  console.log('✅ Explicit, endpoint identity and exact evidence precedence is enforced.');
}

function checkToleranceProfiles() {
  const model = sharedModelFixture([
    component('TA', [{ position: point(0, 0) }]),
    component('TB', [{ position: point(1, 0) }]),
  ]);
  assert.equal(buildPipingPortTopologyGraph(model).connections.length, 0);
  assert.equal(buildPipingPortTopologyGraph(model, createToleranceTopologyProfile('mm', 0.999)).connections.length, 0);
  const equal = buildPipingPortTopologyGraph(model, createToleranceTopologyProfile('mm', 1));
  assert.equal(equal.connections[0].evidenceType, TOPOLOGY_EVIDENCE.TOLERANCE_INFERRED);
  assert.equal(buildPipingPortTopologyGraph(model, createToleranceTopologyProfile('mm', 1.001)).connections.length, 1);
  const unknown = buildPipingPortTopologyGraph(sharedModelFixture([
    component('UA', [{ position: point(0, 0) }]),
    component('UB', [{ position: point(1, 0) }]),
  ], { unit: 'unknown' }), createToleranceTopologyProfile('mm', 2));
  assert.equal(unknown.connections.length, 0);
  assert.ok(unknown.topologyAudit.portStates.every((row) => row.state === TOPOLOGY_STATES.UNIT_BLOCKED));
  assert.equal(validateTopologyConnectionProfile(createExactTopologyProfile('mm')).ok, true);
  assert.throws(() => createToleranceTopologyProfile('mm', 0), /positive/);
  console.log('✅ Tolerance is explicit, boundary-safe and blocked for unknown model units.');
}

function checkIdentityAndAmbiguity() {
  const conflict = sharedModelFixture([
    component('IA', [{ position: point(0, 0) }], { identity: { lineId: 'L1', systemId: 'S1' } }),
    component('IB', [{ position: point(0, 0) }], { identity: { lineId: 'L2', systemId: 'S2' } }),
  ]);
  const conflictGraph = buildPipingPortTopologyGraph(conflict);
  assert.equal(conflictGraph.connections.length, 0);
  assert.equal(conflictGraph.topologyAudit.identityConflicts.length, 1);
  const ambiguous = buildPipingPortTopologyGraph(sharedModelFixture([
    component('AA', [{ position: point(0, 0) }]),
    component('AB', [{ position: point(0, 0) }]),
    component('AC', [{ position: point(0, 0) }]),
  ]));
  assert.equal(ambiguous.connections.length, 0);
  assert.equal(ambiguous.topologyAudit.ambiguousPorts.length, 3);
  const self = buildPipingPortTopologyGraph(sharedModelFixture([
    component('SELF', [{ position: point(0, 0), sourceReference: { peerPortKey: 'SELF:port:1' } }]),
  ]));
  assert.ok(self.topologyAudit.rejectedCandidates.some((row) => row.code === 'TOPOLOGY_SELF_CONNECTION_REJECTED'));
  const same = buildPipingPortTopologyGraph(sharedModelFixture([
    component('SAME', [{ position: point(0, 0) }, { position: point(0, 0) }]),
  ]));
  assert.ok(same.topologyAudit.rejectedCandidates.some((row) => row.code === 'TOPOLOGY_SAME_COMPONENT_CONNECTION_REJECTED'));
  console.log('✅ Identity conflicts, ambiguity, self and same-component rejection remain audited.');
}

function checkInvalidAndExtremeCoordinates() {
  const invalid = buildPipingPortTopologyGraph(sharedModelFixture([
    component('INVALID', [{ position: { x: Number.NaN, y: 0, z: 0 } }]),
  ]));
  assert.equal(invalid.ports[0].topologyState, TOPOLOGY_STATES.INVALID_POSITION);
  const large = buildPipingPortTopologyGraph(sharedModelFixture([
    component('L1', [{ position: point(1e12, -1e12, 5e11) }]),
    component('L2', [{ position: point(1e12, -1e12, 5e11) }]),
  ]));
  assert.equal(large.connections.length, 1);
  const negative = buildPipingPortTopologyGraph(sharedModelFixture([
    component('N1', [{ position: point(-1000, -2000, -3000) }]),
    component('N2', [{ position: point(-999.5, -2000, -3000) }]),
  ]), createToleranceTopologyProfile('mm', 0.5));
  assert.equal(negative.connections.length, 1);
  console.log('✅ Invalid, large and negative coordinates are handled deterministically.');
}

function checkImmutabilityAndDeterminism() {
  const source = sharedModelFixture(exactChain(4));
  const before = canonicalStringify(source);
  const first = buildPipingPortTopologyGraph(source);
  const second = buildPipingPortTopologyGraph(source);
  assert.equal(canonicalStringify(first), canonicalStringify(second));
  assert.equal(first.semanticHash, second.semanticHash);
  assert.equal(canonicalStringify(source), before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.connections));
  const projection = projectEngineeringPorts(source);
  assert.equal(validateEngineeringPortProjection(projection).ok, true);
  assert.equal(validateTopologyConnectionAudit(first.topologyAudit).ok, true);
  console.log('✅ Contracts are deeply immutable, hash-stable and source-preserving.');
}

function assertGraph(graph) {
  const validation = validatePipingPortTopologyGraph(graph);
  assert.equal(validation.ok, true, validation.errors.join(' '));
}

function componentPairs(graph) {
  const byPort = new Map(graph.ports.map((port) => [port.portKey, port.componentKey]));
  return graph.connections.map((connection) => [byPort.get(connection.portAKey), byPort.get(connection.portBKey)].sort().join('|')).sort();
}
