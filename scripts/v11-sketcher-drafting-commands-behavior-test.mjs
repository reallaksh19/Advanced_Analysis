import { convertSelectedNodeToBend, convertSelectedNodeToTee, convertSelectedNodeToOlet, autoConnectPipes, validateSketchCommand } from '../src/sketcher/commands/professionalDraftingCommands.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Test 1: Convert Bend
test('Convert Bend: Node with 2 connections → elbow', () => {
  const nodes = {
    A: { pos: [0, 0, 0], type: 'free' },
    B: { pos: [100, 0, 0], type: 'free' },
    C: { pos: [200, 0, 0], type: 'free' },
  };
  const segments = [
    { id: 'S1', startNode: 'A', endNode: 'B' },
    { id: 'S2', startNode: 'B', endNode: 'C' },
  ];
  const result = convertSelectedNodeToBend({ nodes, segments, selectedNodeId: 'B' });
  assert(result.ok === true, 'ok should be true');
  assert(result.nodes.B.type === 'elbow', 'node type should be elbow');
  assert(result.command === 'CONVERT_BEND', 'command should be CONVERT_BEND');
});

// Test 2: Convert Bend with invalid connection count
test('Convert Bend: Node with 1 connection → error', () => {
  const nodes = {
    A: { pos: [0, 0, 0], type: 'free' },
    B: { pos: [100, 0, 0], type: 'free' },
  };
  const segments = [
    { id: 'S1', startNode: 'A', endNode: 'B' },
  ];
  const result = convertSelectedNodeToBend({ nodes, segments, selectedNodeId: 'B' });
  assert(result.ok === false, 'ok should be false');
  assert(result.diagnostics.some(d => d.code === 'INVALID_CONNECTION_COUNT'), 'should have INVALID_CONNECTION_COUNT diagnostic');
});

// Test 3: Convert Tee
test('Convert Tee: Node with 3 connections → tee', () => {
  const nodes = {
    W: { pos: [0, 0, 0], type: 'free' },
    T: { pos: [100, 0, 0], type: 'free' },
    E: { pos: [200, 0, 0], type: 'free' },
    N: { pos: [100, 100, 0], type: 'free' },
  };
  const segments = [
    { id: 'S1', startNode: 'W', endNode: 'T' },
    { id: 'S2', startNode: 'T', endNode: 'E' },
    { id: 'S3', startNode: 'T', endNode: 'N' },
  ];
  const result = convertSelectedNodeToTee({ nodes, segments, selectedNodeId: 'T' });
  assert(result.ok === true, 'ok should be true');
  assert(result.nodes.T.type === 'tee', 'node type should be tee');
  assert(result.command === 'CONVERT_TEE', 'command should be CONVERT_TEE');
});

// Test 4: Convert Olet
test('Convert Olet: Node with 2+ connections → olet', () => {
  const nodes = {
    A: { pos: [0, 0, 0], type: 'free' },
    B: { pos: [100, 0, 0], type: 'free' },
    C: { pos: [200, 0, 0], type: 'free' },
  };
  const segments = [
    { id: 'S1', startNode: 'A', endNode: 'B' },
    { id: 'S2', startNode: 'B', endNode: 'C' },
  ];
  const result = convertSelectedNodeToOlet({ nodes, segments, selectedNodeId: 'B' });
  assert(result.ok === true, 'ok should be true');
  assert(result.nodes.B.type === 'olet', 'node type should be olet');
  assert(result.command === 'CONVERT_OLET', 'command should be CONVERT_OLET');
});

// Test 5: Auto Connect Pipes
test('Auto Connect: Nodes within tolerance merged', () => {
  const nodes = {
    B: { pos: [0, 0, 0], type: 'free' },
    B2: { pos: [0.5, 0, 0], type: 'free' },
    C: { pos: [200, 0, 0], type: 'free' },
  };
  const segments = [
    { id: 'S1', startNode: 'B', endNode: 'B2' },
    { id: 'S2', startNode: 'B2', endNode: 'C' },
  ];
  const result = autoConnectPipes({ nodes, segments, toleranceMm: 1.0 });
  assert(result.meta.mergeCount === 1, 'mergeCount should be 1');
  assert(!result.nodes.B2, 'B2 should be removed');
  assert(result.nodes.B, 'B should exist');
});

// Test 6: Validate Topology
test('Validate Topology: Returns validation summary', () => {
  const nodes = {
    A: { pos: [0, 0, 0], type: 'free' },
    B: { pos: [100, 0, 0], type: 'free' },
    C: { pos: [200, 0, 0], type: 'free' },
  };
  const segments = [
    { id: 'S1', startNode: 'A', endNode: 'B' },
    { id: 'S2', startNode: 'B', endNode: 'C' },
  ];
  const result = validateSketchCommand({ nodes, segments });
  assert(result.command === 'VALIDATE_TOPOLOGY', 'command should be VALIDATE_TOPOLOGY');
  assert(result.meta.validationSummary, 'validationSummary should exist');
  assert(result.meta.validationSummary.nodeCount === 3, 'nodeCount should be 3');
  assert(result.meta.validationSummary.segmentCount === 2, 'segmentCount should be 2');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
