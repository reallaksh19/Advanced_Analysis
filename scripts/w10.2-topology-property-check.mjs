#!/usr/bin/env node
import assert from 'node:assert/strict';
import { canonicalStringify } from '../src/core/shared-piping-model/index.js';
import {
  buildPipingPortTopologyGraph,
  createExactTopologyProfile,
  TOPOLOGY_EVIDENCE,
} from '../src/core/piping-topology/index.js';
import {
  component,
  exactChain,
  point,
  sharedModelFixture,
  translatedComponents,
} from './w10.2-topology-fixtures.mjs';

const SEED = 1022026;
const random = fixedRandom(SEED);
console.log(`\n--- W10.2 Fixed-Seed Topology Properties (${SEED}) ---`);

for (let iteration = 0; iteration < 40; iteration += 1) {
  const count = 2 + Math.floor(random() * 18);
  const components = exactChain(count);
  const base = buildPipingPortTopologyGraph(sharedModelFixture(components, { datasetId: `PROP-${iteration}` }));
  checkTranslationInvariant(base, components, iteration);
  checkOrderInvariant(base, components, iteration);
  checkConnectionProperties(base);
}

checkDuplicateCoordinateProperties();
console.log('\n✅ W10.2 fixed-seed topology properties passed.\n');

function checkTranslationInvariant(base, components, iteration) {
  const delta = point(
    Math.round((random() - 0.5) * 1e8),
    Math.round((random() - 0.5) * 1e8),
    Math.round((random() - 0.5) * 1e8),
  );
  const translated = buildPipingPortTopologyGraph(sharedModelFixture(
    translatedComponents(components, delta),
    { datasetId: `PROP-${iteration}` },
  ));
  assert.deepEqual(componentPairs(translated), componentPairs(base), `Translation property failed at seed ${SEED}, iteration ${iteration}`);
  assert.deepEqual(componentGroups(translated), componentGroups(base), `Translated grouping failed at seed ${SEED}, iteration ${iteration}`);
}

function checkOrderInvariant(base, components, iteration) {
  const shuffledComponents = deterministicShuffle(components, random).map((item) => ({
    ...item,
    geometry: { ...item.geometry, ports: deterministicShuffle(item.geometry.ports, random) },
  }));
  const reordered = buildPipingPortTopologyGraph(sharedModelFixture(
    shuffledComponents,
    { datasetId: `PROP-${iteration}` },
  ));
  assert.equal(canonicalStringify(topologySignature(reordered)), canonicalStringify(topologySignature(base)), `Order topology failed at seed ${SEED}, iteration ${iteration}`);
}

function checkConnectionProperties(graph) {
  const ports = new Map(graph.ports.map((port) => [port.portKey, port]));
  const pairs = new Set();
  graph.connections.forEach((connection) => {
    assert.ok(ports.has(connection.portAKey));
    assert.ok(ports.has(connection.portBKey));
    assert.ok(ports.get(connection.portAKey).peerPortKeys.includes(connection.portBKey));
    assert.ok(ports.get(connection.portBKey).peerPortKeys.includes(connection.portAKey));
    const pair = [connection.portAKey, connection.portBKey].sort().join('|');
    assert.equal(pairs.has(pair), false, `Duplicate undirected pair ${pair}`);
    pairs.add(pair);
    assert.notEqual(connection.evidenceType, TOPOLOGY_EVIDENCE.TOLERANCE_INFERRED);
  });
  graph.connectedComponents.forEach((group) => {
    const components = new Set(group.componentKeys);
    group.connectionIds.forEach((connectionId) => {
      const connection = graph.connections.find((row) => row.connectionId === connectionId);
      assert.ok(components.has(ports.get(connection.portAKey).componentKey));
      assert.ok(components.has(ports.get(connection.portBKey).componentKey));
    });
  });
}

function checkDuplicateCoordinateProperties() {
  const model = sharedModelFixture([
    component('DUP-A', [{ portKey: 'DUP-A:P', position: point(0, 0) }]),
    component('DUP-B', [{ portKey: 'DUP-B:P', position: point(0, 0) }]),
    component('DUP-C', [{ portKey: 'DUP-C:P', position: point(0, 0) }]),
  ], { datasetId: 'DUPLICATE-PROPERTY' });
  const graph = buildPipingPortTopologyGraph(model, createExactTopologyProfile('mm'));
  assert.equal(graph.connections.length, 0);
  assert.equal(graph.topologyAudit.ambiguousPorts.length, 3);
}

function topologySignature(graph) {
  return {
    components: graph.components,
    ports: graph.ports.map(({ peerPortKeys, topologyState, ...port }) => ({ ...port, peerPortKeys, topologyState })),
    connections: graph.connections,
    connectedComponents: graph.connectedComponents,
    summary: graph.summary,
  };
}

function componentPairs(graph) {
  const ports = new Map(graph.ports.map((port) => [port.portKey, port.componentKey]));
  return graph.connections.map((connection) => [
    ports.get(connection.portAKey),
    ports.get(connection.portBKey),
  ].sort().join('|')).sort();
}

function componentGroups(graph) {
  return graph.connectedComponents.map((group) => group.componentKeys.join('|')).sort();
}

function deterministicShuffle(values, randomValue) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const next = Math.floor(randomValue() * (index + 1));
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }
  return copy;
}

function fixedRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
