import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from '../src/core/nonlinear-shell-contact/deck-writer.js';
import { inventoryExternalSolverOutputs } from '../src/core/nonlinear-shell-contact/structural-output-inventory.js';
import { reconstructStepSequence } from '../src/core/nonlinear-shell-contact/result-reconstruction.js';

test('CalculiX field-20 numeric format remains deterministic and parser-compatible', () => {
  assert.equal(formatNumber(1), '1.00000000000000E+00');
  assert.equal(formatNumber(-1), '-1.00000000000000E+00');
  assert.equal(formatNumber(210000), '2.10000000000000E+05');
  assert.equal(formatNumber(-0), '0.00000000000000E+00');
  assert.equal(formatNumber(1).length, 20);
  assert.throws(() => formatNumber(1e100), /field-20/);
});

test('completed CalculiX output ignores structured FRD ERROR datasets and transient nonlinear iterations', () => {
  const files = new Map([
    ['solver.stdout.txt', Buffer.from('STEP 1\nINCREMENT 1\nno convergence\nconvergence\nJob finished\n')],
    ['solver.stderr.txt', Buffer.alloc(0)],
    ['model.frd', Buffer.from(' -4  DISP 4 1\n -5 D1 1 1 0 0\n -1 1 0.0\n -3\n -4 ERROR 1 1\n -5 STR(%) 1 1 0 0\n -1 1 0.0\n -3\n 9999\n')],
  ]);
  const inventory = inventoryExternalSolverOutputs(files, {
    requestedOutputs: ['NODAL_DISPLACEMENT'],
    loadSteps: [{ outputRequests: [] }],
  });
  assert.equal(inventory.completionEvidence.hasCompletionMarker, true);
  assert.equal(inventory.completionEvidence.hasFailureMarker, false);
  assert.deepEqual(inventory.completionEvidence.failureMarkers, []);
  assert.equal(inventory.requestedOutputCoverage.status, 'COMPLETE');
});

test('terminal CalculiX input errors remain fail-closed', () => {
  const files = new Map([
    ['solver.stdout.txt', Buffer.from('*ERROR reading *NODE\nCalculiX stops.\n')],
    ['solver.stderr.txt', Buffer.alloc(0)],
  ]);
  const inventory = inventoryExternalSolverOutputs(files, {
    requestedOutputs: [],
    loadSteps: [],
  });
  assert.equal(inventory.completionEvidence.hasFailureMarker, true);
  assert.ok(inventory.completionEvidence.failureMarkers.includes('ERROR'));
});

test('CalculiX ordinal step markers bind by exact governed count when names are not echoed', () => {
  assert.deepEqual(
    reconstructStepSequence(
      ['STEP-PRESSURE', 'STEP-INDENT', 'STEP-UNLOAD'],
      [
        { source: 'TEXT_STEP_MARKER', stepId: '1' },
        { source: 'TEXT_STEP_MARKER', stepId: '2' },
        { source: 'TEXT_STEP_MARKER', stepId: '3' },
      ],
    ),
    {
      status: 'ORDINAL_COUNT_ONLY',
      expectedStepIds: ['STEP-PRESSURE', 'STEP-INDENT', 'STEP-UNLOAD'],
      observedStepIds: ['1', '2', '3'],
    },
  );
});
