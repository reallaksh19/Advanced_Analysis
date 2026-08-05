import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanonicalNonlinearShellContactModel } from '../src/core/nonlinear-shell-contact/canonical-model.js';
import {
  DEFAULT_DECK_PROFILE_INPUT,
  createDeckProfile,
} from '../src/core/nonlinear-shell-contact/deck-profile.js';
import {
  formatNumber,
  writeDeterministicSolverDeck,
} from '../src/core/nonlinear-shell-contact/deck-writer.js';
import { createNc00ExtendedRigidFixtureInputs } from '../src/core/nonlinear-shell-contact/nc00-extended-fixtures.js';
import { createNc00FixtureInputs } from '../src/core/nonlinear-shell-contact/nc00-fixtures.js';
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

test('rigid surface carriers use prescribed nodes rather than shell rigid-body MPCs', () => {
  const inputs = createNc00FixtureInputs();
  const model = createCanonicalNonlinearShellContactModel(inputs['NC00-F2']);
  const deckProfile = createDeckProfile(DEFAULT_DECK_PROFILE_INPUT);
  const deck = writeDeterministicSolverDeck(model, deckProfile);
  const rigidId = model.rigidSurfaces[0].rigidSurfaceId;
  const motionNodes = deck.maps.rigidMotionNodeMap[rigidId];
  assert.ok(Array.isArray(motionNodes) && motionNodes.length > 4);
  assert.doesNotMatch(deck.deckText, /\*RIGID BODY/iu);
  assert.match(deck.deckText, /generated rigid carrier profile=DIRECTLY_PRESCRIBED_SHELL_CARRIER_V1/u);
  assert.match(deck.deckText, /\*SHELL SECTION, ELSET=RIGEL_/u);
  motionNodes.forEach((nodeId) => {
    assert.match(deck.deckText, new RegExp(`^${nodeId}, 3, 3, 1\\.00000000000000E-01$`, 'mu'));
  });
});

test('saddle adapter is positioned below the shell without initial geometric intersection', () => {
  const inputs = createNc00FixtureInputs();
  const extended = createNc00ExtendedRigidFixtureInputs(inputs['NC00-F2']);
  assert.deepEqual(
    extended['NC00-F2-SADDLE'].rigidSurfaces[0].referencePoint,
    [50, 50, -25],
  );
});
