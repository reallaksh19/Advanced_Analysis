#!/usr/bin/env node

import {
  createSolverResultContract,
  validateSolverResultContract,
  unwrapSolverResults,
  ENGINEERING_LEVEL,
  SOLVER_RESULT_SCHEMA_VERSION,
} from '../src/core/solvers/certification/solverResultContract.js';

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[U5:behavior] ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[U5:behavior] ✗ ${name}`);
    console.error(`  ${err.message}`);
    failCount++;
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, message) {
  if (!value) throw new Error(message);
}

function assertFalse(value, message) {
  if (value) throw new Error(message);
}

// Test 1: createSolverResultContract with valid inputs
test('createSolverResultContract with valid inputs validates successfully', () => {
  const contract = createSolverResultContract({
    moduleId: 'test',
    methodId: 'TEST_METHOD',
    formulaIds: ['F1'],
    status: 'PASSED',
    results: { x: 1 },
  });
  const validation = validateSolverResultContract(contract);
  assertTrue(validation.ok, `Validation failed: ${validation.errors.join(', ')}`);
});

// Test 2: createSolverResultContract with missing moduleId uses fallback
test('createSolverResultContract missing moduleId uses fallback', () => {
  const contract = createSolverResultContract({
    methodId: 'TEST_METHOD',
    formulaIds: ['F1'],
    status: 'PASSED',
    results: { x: 1 },
  });
  assertTrue(contract.moduleId === 'unknown-module', `Expected fallback moduleId, got ${contract.moduleId}`);
});

// Test 3: validateSolverResultContract on valid contract
test('validateSolverResultContract on valid contract returns ok:true', () => {
  const contract = createSolverResultContract({
    moduleId: 'test-module',
    methodId: 'TEST_METHOD',
    formulaIds: ['F1'],
    status: 'PASSED',
    results: { result: 'value' },
  });
  const result = validateSolverResultContract(contract);
  assertTrue(result.ok === true, `Expected ok:true, got ${result.ok}`);
  assertTrue(result.errors.length === 0, `Expected no errors, got ${result.errors.length}`);
});

// Test 4: validateSolverResultContract on null returns ok:false
test('validateSolverResultContract on null returns ok:false', () => {
  const result = validateSolverResultContract(null);
  assertTrue(result.ok === false, `Expected ok:false, got ${result.ok}`);
  assertTrue(result.errors.length > 0, `Expected errors, got none`);
});

// Test 5: unwrapSolverResults extracts results from contract
test('unwrapSolverResults extracts results object from contract', () => {
  const testResults = { x: 1, y: 2 };
  const contract = createSolverResultContract({
    moduleId: 'test',
    methodId: 'TEST',
    formulaIds: ['F1'],
    status: 'PASSED',
    results: testResults,
  });
  const unwrapped = unwrapSolverResults(contract);
  assertEqual(unwrapped, testResults, 'Unwrapped results do not match');
});

// Test 6: unwrapSolverResults returns input if not a contract
test('unwrapSolverResults returns input if not a contract', () => {
  const input = { legacy: 'result' };
  const unwrapped = unwrapSolverResults(input);
  assertEqual(unwrapped, input, 'Should return input unchanged');
});

// Test 7: ENGINEERING_LEVEL constants exist
test('ENGINEERING_LEVEL.BENCHMARKED_SCREENING exists', () => {
  assertTrue(ENGINEERING_LEVEL.BENCHMARKED_SCREENING === 'BENCHMARKED_SCREENING', 'BENCHMARKED_SCREENING missing');
});

test('ENGINEERING_LEVEL.CERTIFIED exists', () => {
  assertTrue(ENGINEERING_LEVEL.CERTIFIED === 'CERTIFIED', 'CERTIFIED missing');
});

test('ENGINEERING_LEVEL.SCREENING exists', () => {
  assertTrue(ENGINEERING_LEVEL.SCREENING === 'SCREENING', 'SCREENING missing');
});

test('ENGINEERING_LEVEL.MOCK exists', () => {
  assertTrue(ENGINEERING_LEVEL.MOCK === 'MOCK', 'MOCK missing');
});

// Test 8: Schema version constant
test('SOLVER_RESULT_SCHEMA_VERSION is correct', () => {
  assertEqual(SOLVER_RESULT_SCHEMA_VERSION, 'solver-result-contract-v1', 'Schema version mismatch');
});

// Test 9: createSolverResultContract normalizes formulaIds
test('createSolverResultContract normalizes single formulaId to array', () => {
  const contract = createSolverResultContract({
    moduleId: 'test',
    methodId: 'TEST',
    formulaIds: 'F1',
    status: 'PASSED',
    results: {},
  });
  assertTrue(Array.isArray(contract.formulaIds), 'formulaIds should be array');
  assertEqual(contract.formulaIds, ['F1'], 'formulaId normalization failed');
});

// Test 10: createSolverResultContract freezes result
test('createSolverResultContract returns frozen object', () => {
  const contract = createSolverResultContract({
    moduleId: 'test',
    methodId: 'TEST',
    formulaIds: ['F1'],
    status: 'PASSED',
    results: {},
  });
  assertTrue(Object.isFrozen(contract), 'Contract should be frozen');
});

// Report
console.log(`\n[U5:behavior] Tests: ${passCount} passed, ${failCount} failed`);
process.exit(failCount > 0 ? 1 : 0);
