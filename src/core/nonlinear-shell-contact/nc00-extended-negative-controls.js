import assert from 'node:assert/strict';
import { createDeterministicRigidSurfaceMesh } from './rigid-surface-mesher.js';
import { inventoryExternalSolverOutputs, parseAsciiFrdDatasets } from './structural-output-inventory.js';
import { reconstructOutputCoverage, reconstructStepSequence } from './result-reconstruction.js';
import { validateExecutionPolicy, validateOutputInventoryRows } from './execution-runner.js';
import { clone, hashOf } from './nc00-fixtures.js';

export function runNc00ExtendedNegativeControls(ctx) {
  const rows = [];
  const reject = (controlId, fn, pattern) => {
    let error;
    try { fn(); } catch (caught) { error = caught; }
    assert.ok(error, `${controlId} did not reject.`);
    if (pattern) assert.match(String(error.message), pattern, `${controlId} rejected for the wrong reason.`);
    rows.push({ controlId, status: 'PASS', reason: error.message });
  };
  const mesh = (surface) => createDeterministicRigidSurfaceMesh(surface, {
    firstNodeId: 100,
    firstElementId: 200,
  });
  const surfaces = Object.fromEntries(Object.entries(ctx.extendedRigidInputs).map(([id, input]) => (
    [id, clone(input.rigidSurfaces[0])]
  )));

  const sphere180 = clone(surfaces['NC00-F2-SPHERE']);
  sphere180.dimensions.angle = 180;
  reject('RIGID_SPHERE_180_DEGREE_CAP', () => mesh(sphere180), /angle|179/iu);
  const cylinderAngle = clone(surfaces['NC00-F2-CYLINDER']);
  cylinderAngle.dimensions.angle = 361;
  reject('RIGID_CYLINDER_ANGLE_OVER_360', () => mesh(cylinderAngle), /angle|360/iu);
  const saddleWidth = clone(surfaces['NC00-F2-SADDLE']);
  saddleWidth.dimensions.width = 2 * saddleWidth.dimensions.radius;
  reject('RIGID_SADDLE_WIDTH_OVER_DIAMETER', () => mesh(saddleWidth), /twice radius/iu);
  const planeRadius = clone(surfaces['NC00-F2-PLANE']);
  planeRadius.dimensions.radius = 1;
  reject('RIGID_PLANE_RADIUS_CONTAMINATION', () => mesh(planeRadius), /radius.*null/iu);
  const parallelAxis = clone(surfaces['NC00-F2-CYLINDER']);
  parallelAxis.orientation.axis = [...parallelAxis.orientation.normal];
  reject('RIGID_SURFACE_PARALLEL_AXIS', () => mesh(parallelAxis), /parallel/iu);

  Object.entries(surfaces).forEach(([fixtureId, surface]) => {
    const first = mesh(surface);
    const second = mesh(surface);
    assert.deepEqual(first, second);
    rows.push({
      controlId: `${fixtureId}_DETERMINISTIC_GEOMETRY`,
      status: 'PASS',
      reason: first.geometrySemanticHash,
    });
  });

  reject('MALFORMED_UTF8_RESULT', () => inventoryExternalSolverOutputs(
    new Map([['model.sta', Buffer.from([0xff, 0xfe, 0xfd])]]),
    { requestedOutputs: [], loadSteps: [] },
  ), /UTF-8/iu);
  const nonMonotonic = inventoryExternalSolverOutputs(
    new Map([['model.sta', Buffer.from('STEP S INCREMENT 2\nSTEP S INCREMENT 1\n')]]),
    { requestedOutputs: [], loadSteps: [] },
  );
  assert.equal(nonMonotonic.incrementSequenceEvidence.status, 'NON_MONOTONIC');
  rows.push({
    controlId: 'NON_MONOTONIC_INCREMENT_SEQUENCE',
    status: 'PASS',
    reason: 'NON_MONOTONIC',
  });
  const missing = inventoryExternalSolverOutputs(
    new Map([['model.sta', Buffer.from('JOB FINISHED\n')]]),
    { requestedOutputs: ['NODAL_DISPLACEMENT'], loadSteps: [] },
  );
  assert.deepEqual(missing.requestedOutputCoverage.missing, ['NODAL_DISPLACEMENT']);
  rows.push({
    controlId: 'MISSING_REQUESTED_FIELD_COVERAGE',
    status: 'PASS',
    reason: 'MISSING_FIELD_RETAINED',
  });
  const malformedDataset = parseAsciiFrdDatasets(
    ' -4 DISP 3 1\n -1 1 NOT_A_NUMBER 2.0\n -3\n',
  );
  assert.equal(malformedDataset[0].numericTokenCount, 2);
  assert.equal(malformedDataset[0].finiteValueCount, 1);
  rows.push({
    controlId: 'NONFINITE_OR_MALFORMED_DATASET_TOKEN_NOT_NORMALIZED',
    status: 'PASS',
    reason: 'TOKEN_COUNT_DIFFERS_FROM_FINITE_COUNT',
  });

  const expectedSteps = ['PRESSURE', 'INDENT', 'UNLOAD'];
  assert.equal(reconstructStepSequence(expectedSteps, [
    { stepId: 'PRESSURE', source: 'TEXT_STEP_MARKER' },
    { stepId: 'UNLOAD', source: 'TEXT_STEP_MARKER' },
    { stepId: 'INDENT', source: 'TEXT_STEP_MARKER' },
  ]).status, 'MISMATCH');
  rows.push({ controlId: 'STEP_ORDER_MISMATCH', status: 'PASS', reason: 'MISMATCH' });

  const outputCoverage = reconstructOutputCoverage(
    ctx.completedModel,
    { maps: { outputRequestMap: { S: { emitted: [], unmapped: ['EXTERNAL_WORK'] } } } },
    { available: [] },
  );
  assert.equal(outputCoverage.status, 'INCOMPLETE');
  rows.push({
    controlId: 'UNMAPPED_DECK_OUTPUT_BLOCKS_RECONSTRUCTION',
    status: 'PASS',
    reason: 'INCOMPLETE',
  });

  const inventoryPolicy = {
    allowlistedOutputFileNames: ['model.frd'],
    requiredOutputFileNames: ['model.frd'],
    maximumOutputBytes: 1000,
    maximumOutputFiles: 1,
  };
  reject('EXCESSIVE_OUTPUT_FILE_COUNT', () => validateOutputInventoryRows([
    { name: 'model.frd', byteLength: 1, kind: 'FILE' },
    { name: 'model.inp', byteLength: 1, kind: 'FILE' },
  ], inventoryPolicy), /file count/iu);

  const gitSha = 'a'.repeat(40);
  const policy = {
    executablePath: '/opt/lafea-nc00/bin/ccx',
    fixedArguments: ['-i', 'model'],
    approvedEnvironment: { OMP_NUM_THREADS: '1' },
    allowlistedOutputFileNames: ['model.frd'],
    requiredOutputFileNames: ['model.frd'],
    maximumStreamBytes: 1000,
    maximumOutputFiles: 0,
    observedContainerDigest: hashOf('container'),
    networkIsolationEstablished: true,
    exactHeadSha: gitSha,
    baseSha: gitSha,
    quarantineDirectory: null,
  };
  reject('INVALID_MAXIMUM_OUTPUT_FILE_COUNT', () => validateExecutionPolicy(policy), /maximumOutputFiles/iu);

  return rows;
}
