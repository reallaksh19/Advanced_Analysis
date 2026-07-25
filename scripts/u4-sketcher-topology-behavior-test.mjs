#!/usr/bin/env node

/**
 * U4 Sketcher Topology Behavior Tests
 * Tests validateSketchTopology and classifyTeeMainBranch behavior
 */

import { validateSketchTopology, buildConnectionIndex, SKETCH_TOPOLOGY_SCHEMA_VERSION } from '../src/sketcher/topology/validateSketchTopology.js';
import { classifyTeeMainBranch } from '../src/sketcher/topology/classifyTeeMainBranch.js';

let passed = true;
const tests = [];

function assertEqual(actual, expected, message) {
  const ok = actual === expected;
  tests.push({ ok, message: `${message} (expected ${expected}, got ${actual})` });
  if (!ok) passed = false;
}

function assertTrue(condition, message) {
  tests.push({ ok: condition, message });
  if (!condition) passed = false;
}

function assertFalse(condition, message) {
  tests.push({ ok: !condition, message });
  if (condition) passed = false;
}

console.log('=== U4 SKETCHER TOPOLOGY BEHAVIOR TESTS ===\n');

// Test 1: L-route with elbow
console.log('Test 1: L-route topology');
const nodes1 = {
  A: { pos: [0, 0, 0], type: 'free' },
  B: { pos: [10, 0, 0], type: 'elbow' },
  C: { pos: [10, 10, 0], type: 'free' }
};
const segments1 = [
  { id: 'AB', startNode: 'A', endNode: 'B' },
  { id: 'BC', startNode: 'B', endNode: 'C' }
];
const result1 = validateSketchTopology(nodes1, segments1);
assertTrue(result1.ok, 'L-route should validate without errors');
assertEqual(result1.summary.errorCount, 0, 'L-route error count');
assertEqual(result1.summary.segmentCount, 2, 'L-route segment count');
tests[tests.length - 3].message = `L-route topology validation: ${tests[tests.length - 3].message}`;

// Test 2: Zero-length segment detection
console.log('Test 2: Zero-length segment detection');
const nodes2 = {
  A: { pos: [0, 0, 0], type: 'free' },
  B: { pos: [0, 0, 0], type: 'free' }
};
const segments2 = [
  { id: 'AB', startNode: 'A', endNode: 'B' }
];
const result2 = validateSketchTopology(nodes2, segments2);
assertFalse(result2.ok, 'Zero-length segment should fail validation');
const zeroError = result2.issues.find(i => i.code === 'ZERO_LENGTH_SEGMENT');
assertTrue(zeroError, 'Should have ZERO_LENGTH_SEGMENT error');

// Test 3: Elbow with wrong connection count
console.log('Test 3: Elbow with invalid connection count');
const nodes3 = {
  A: { pos: [0, 0, 0], type: 'free' },
  B: { pos: [10, 0, 0], type: 'elbow' },
  C: { pos: [10, 10, 0], type: 'free' },
  D: { pos: [10, -10, 0], type: 'free' }
};
const segments3 = [
  { id: 'AB', startNode: 'A', endNode: 'B' },
  { id: 'BC', startNode: 'B', endNode: 'C' },
  { id: 'BD', startNode: 'B', endNode: 'D' }
];
const result3 = validateSketchTopology(nodes3, segments3);
assertFalse(result3.ok, 'Elbow with 3 connections should fail');
const elbowError = result3.issues.find(i => i.code === 'INVALID_ELBOW_CONNECTION_COUNT');
assertTrue(elbowError, 'Should have INVALID_ELBOW_CONNECTION_COUNT error');

// Test 4: Tee with 3 connections validates successfully
console.log('Test 4: Tee with 3 connections');
const nodes4 = {
  A: { pos: [0, 0, 0], type: 'free' },
  T: { pos: [10, 0, 0], type: 'tee' },
  B: { pos: [20, 0, 0], type: 'free' },
  C: { pos: [10, 10, 0], type: 'free' }
};
const segments4 = [
  { id: 'AT', startNode: 'A', endNode: 'T' },
  { id: 'TB', startNode: 'T', endNode: 'B' },
  { id: 'TC', startNode: 'T', endNode: 'C' }
];
const result4 = validateSketchTopology(nodes4, segments4);
assertTrue(result4.ok, 'Tee with 3 connections should validate');
assertEqual(result4.summary.errorCount, 0, 'Tee error count');

// Test 5: Tee classification with vector colinearity
console.log('Test 5: Tee classification (WEST, EAST, NORTH)');
const nodes5 = {
  WEST: { pos: [-10, 0, 0], type: 'free' },
  TEE: { pos: [0, 0, 0], type: 'tee' },
  EAST: { pos: [10, 0, 0], type: 'free' },
  NORTH: { pos: [0, 10, 0], type: 'free' }
};
const segments5 = [
  { id: 'WEST-TEE', startNode: 'WEST', endNode: 'TEE' },
  { id: 'TEE-EAST', startNode: 'TEE', endNode: 'EAST' },
  { id: 'TEE-NORTH', startNode: 'TEE', endNode: 'NORTH' }
];
const connected5 = segments5.filter(s => s.startNode === 'TEE' || s.endNode === 'TEE');
const classification5 = classifyTeeMainBranch(nodes5, 'TEE', connected5);
assertTrue(classification5.ok, 'Tee classification should succeed');
assertEqual(classification5.main.length, 2, 'Should have 2 main segments');
assertTrue(classification5.branch !== null, 'Should have 1 branch segment');

// Test 6: Tee classification invariance (reordered segments)
console.log('Test 6: Tee classification invariance');
const segments5b = [
  { id: 'TEE-NORTH', startNode: 'TEE', endNode: 'NORTH' },
  { id: 'WEST-TEE', startNode: 'WEST', endNode: 'TEE' },
  { id: 'TEE-EAST', startNode: 'TEE', endNode: 'EAST' }
];
const connected5b = segments5b.filter(s => s.startNode === 'TEE' || s.endNode === 'TEE');
const classification5b = classifyTeeMainBranch(nodes5, 'TEE', connected5b);
assertTrue(classification5b.ok, 'Reordered tee classification should succeed');
// The branch should still be NORTH (same segment object or id)
const branchIdFromFirst = classification5.branch.id;
const branchIdFromSecond = classification5b.branch.id;
assertEqual(branchIdFromFirst, branchIdFromSecond, 'Branch segment should be same regardless of order');

// Print results
console.log('\n=== RESULTS ===\n');
tests.forEach((test, idx) => {
  const symbol = test.ok ? '✓' : '✗';
  console.log(`${symbol} Test ${idx + 1}: ${test.message}`);
});

console.log(`\nTotal: ${tests.length} tests, ${tests.filter(t => t.ok).length} passed, ${tests.filter(t => !t.ok).length} failed`);
console.log(`\n${passed ? 'All tests passed!' : 'Some tests failed.'}\n`);
process.exit(passed ? 0 : 1);
