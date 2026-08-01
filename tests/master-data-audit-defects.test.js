import assert from 'node:assert/strict';
import test from 'node:test';

test('F-001 | BLOCKER | All four upload controls are wired to the wrong DOM attribute', () => {
  // Requirement: R02, R25, R27-R29
  assert.fail('Requirement R02: wrapper upload handler is not correctly bound to data-master-file');
});

test('F-002 | BLOCKER | Auto Map computes a mapping and discards it', () => {
  // Requirement: R07-R08, R26
  assert.fail('Requirement R08: Mapping health cannot improve and downstream master arrays remain raw workbook rows');
});

test('F-004 | BLOCKER | Raw workbook rows are written directly into normalized master arrays', () => {
  // Requirement: R07-R08, R12
  assert.fail('Requirement R12: Resolvers receive arbitrary workbook headings rather than canonical fields');
});

test('F-005 | BLOCKER | masterDataConfig is a dead property with no calculation consumer', () => {
  // Requirement: R12-R14, R30
  assert.fail('Requirement R30: Weights, densities, materials, ratings, and piping-class data never affect Load Calc');
});

test('F-006 | BLOCKER | Apply Overrides bypasses the event bus and recalculation pipeline', () => {
  // Requirement: R13-R15, R31
  assert.fail('Requirement R15: WorkspaceConsumerController does not refresh, Preflight and Load Evaluation stay stale');
});

test('F-007 | BLOCKER | JSON Trace engine is synthetic rather than evidence-based', () => {
  // Requirement: R18-R22
  assert.fail('Requirement R20: Trace can certify unsupported facts');
});
