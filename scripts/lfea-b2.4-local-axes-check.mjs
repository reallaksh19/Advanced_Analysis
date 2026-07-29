#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  FRAME_LOCAL_AXIS_PROFILE,
  FrameLocalAxisError,
  canonicalStringify,
  computeFrameLocalAxisProfileSemanticHash,
  computeFrameLocalAxisResultSemanticHash,
  deepFreeze,
  requireFrameLocalAxisProfile,
  requireFrameLocalAxisResult,
  resolveFrameLocalAxes,
  semanticHash,
  verifyFrameLocalAxes,
  qualifyFrameLocalAxisVerification,
} from '../src/core/centerline-beam-fea/index.js';

const tests = [];
const deliberateRegressions = [];

function test(id, description, run) {
  tests.push({ id, description, run });
}

function regression(id, description, run) {
  deliberateRegressions.push({ id, description, run });
}

function clone(value) {
  return structuredClone(value);
}

function resealProfile(profile) {
  const candidate = clone(profile);
  delete candidate.semanticHash;
  candidate.semanticHash = computeFrameLocalAxisProfileSemanticHash(candidate);
  return requireFrameLocalAxisProfile(candidate);
}

function resealResult(result) {
  const candidate = clone(result);
  delete candidate.semanticHash;
  candidate.semanticHash = computeFrameLocalAxisResultSemanticHash(candidate);
  return requireFrameLocalAxisResult(candidate);
}

function expectCode(run, code) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof FrameLocalAxisError, `Expected FrameLocalAxisError, received ${error?.constructor?.name}`);
    assert.equal(error.code, code);
    return true;
  });
}

function assertClose(actual, expected, tolerance = 1e-12, message = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} expected ${expected}, received ${actual}`);
}

function assertVectorClose(actual, expected, tolerance = 1e-12, message = '') {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assertClose(value, expected[index], tolerance, `${message}[${index}]`));
}

function norm(vector) {
  return Math.hypot(...vector);
}

function normalize(vector) {
  const magnitude = norm(vector);
  return vector.map((value) => value / magnitude);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function matVec(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function rotationMatrix() {
  const azimuth = 0.731;
  const elevation = -0.413;
  const roll = 0.287;
  const ca = Math.cos(azimuth);
  const sa = Math.sin(azimuth);
  const ce = Math.cos(elevation);
  const se = Math.sin(elevation);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const rz = [[ca, -sa, 0], [sa, ca, 0], [0, 0, 1]];
  const ry = [[ce, 0, se], [0, 1, 0], [-se, 0, ce]];
  const rx = [[1, 0, 0], [0, cr, -sr], [0, sr, cr]];
  return multiplyMatrices(rz, multiplyMatrices(ry, rx));
}

function multiplyMatrices(left, right) {
  return left.map((row) => right[0].map((_, column) =>
    row.reduce((sum, value, index) => sum + value * right[index][column], 0)));
}

function rotateProfile(profile, matrix) {
  const candidate = clone(profile);
  candidate.fallbackCandidates = candidate.fallbackCandidates.map((fallback) => ({
    candidateId: fallback.candidateId,
    vector: matVec(matrix, fallback.vector),
  }));
  return resealProfile(candidate);
}

function resolve(overrides = {}) {
  return resolveFrameLocalAxes({
    nodeI: [0, 0, 0],
    nodeJ: [1, 0, 0],
    referenceVector: [0, 0, 1],
    profile: FRAME_LOCAL_AXIS_PROFILE,
    ...overrides,
  });
}

function diagnosticCodes(result) {
  return result.diagnostics.map(({ code }) => code);
}

test('B24-T01', 'Global-X element with accepted Global-Z reference', () => {
  const result = resolve();
  assert.deepEqual(result.axes.x, [1, 0, 0]);
  assert.deepEqual(result.axes.y, [0, 0, 1]);
  assert.deepEqual(result.axes.z, [0, -1, 0]);
  assert.equal(result.inputReference.accepted, true);
  assert.deepEqual(diagnosticCodes(result), ['FRAME_REFERENCE_VECTOR_ACCEPTED']);
});

test('B24-T02', 'Global-Z element with parallel Global-Z reference', () => {
  const result = resolve({ nodeJ: [0, 0, 5], referenceVector: [0, 0, 1] });
  assert.deepEqual(result.elementDirection, { delta: [0, 0, 5], length: 5 });
  assert.deepEqual(result.inputReference, {
    vector: [0, 0, 1],
    norm: 1,
    parallelResidual: 0,
    accepted: false,
  });
  assert.deepEqual(result.selectedReference, {
    source: 'FALLBACK',
    candidateId: 'GLOBAL_X',
    vector: [1, 0, 0],
    alignment: 0,
  });
  assert.deepEqual(result.axes, { x: [0, 0, 1], y: [1, 0, 0], z: [0, 1, 0] });
  assert.deepEqual(diagnosticCodes(result), [
    'FRAME_REFERENCE_VECTOR_PARALLEL',
    'FRAME_REFERENCE_VECTOR_FALLBACK_SELECTED',
    'FRAME_REFERENCE_VECTOR_FALLBACK_TIE_RESOLVED',
  ]);
});

test('B24-T03', 'Deterministic fallback tie resolved by declared order', () => {
  const profile = resealProfile({
    ...clone(FRAME_LOCAL_AXIS_PROFILE),
    fallbackCandidates: [
      { candidateId: 'FIRST_Y', vector: [0, 1, 0] },
      { candidateId: 'SECOND_X', vector: [1, 0, 0] },
      { candidateId: 'LAST_Z', vector: [0, 0, 1] },
    ],
  });
  const result = resolve({ nodeJ: [0, 0, 2], referenceVector: [0, 0, 3], profile });
  assert.equal(result.selectedReference.candidateId, 'FIRST_Y');
  assert.ok(diagnosticCodes(result).includes('FRAME_REFERENCE_VECTOR_FALLBACK_TIE_RESOLVED'));
});

test('B24-T04', 'Arbitrarily oriented 3D element', () => {
  const result = resolve({
    nodeI: [2.5, -4, 7],
    nodeJ: [9.25, 3.5, -1.75],
    referenceVector: [0.25, 1.5, 2.75],
  });
  assert.equal(result.inputReference.accepted, true);
  verifyFrameLocalAxes(result, FRAME_LOCAL_AXIS_PROFILE);
  assertClose(result.verification.determinant, 1, 1e-12);
});

test('B24-T05', 'Zero-length element rejected', () => {
  expectCode(() => resolve({ nodeJ: [0, 0, 0] }), 'FRAME_AXIS_ZERO_LENGTH_ELEMENT');
  expectCode(() => resolve({ nodeJ: [FRAME_LOCAL_AXIS_PROFILE.zeroLengthTolerance, 0, 0] }), 'FRAME_AXIS_ZERO_LENGTH_ELEMENT');
});

test('B24-T06', 'Zero reference rejected', () => {
  expectCode(() => resolve({ referenceVector: [0, 0, 0] }), 'FRAME_AXIS_REFERENCE_INVALID');
});

test('B24-T07', 'Nonfinite coordinate rejected', () => {
  for (const coordinate of [NaN, Infinity, -Infinity]) {
    expectCode(() => resolve({ nodeJ: [1, coordinate, 0] }), 'FRAME_AXIS_NODE_COORDINATE_INVALID');
  }
});

test('B24-T08', 'Nonfinite reference rejected', () => {
  for (const coordinate of [NaN, Infinity, -Infinity]) {
    expectCode(() => resolve({ referenceVector: [0, coordinate, 1] }), 'FRAME_AXIS_REFERENCE_INVALID');
  }
});

test('B24-T09', 'Boundary residual exactly equal to tolerance uses fallback', () => {
  const referenceVector = [1, 0, 0.25];
  const x = [1, 0, 0];
  const residual = norm(cross(x, referenceVector)) / norm(referenceVector);
  const profile = resealProfile({ ...clone(FRAME_LOCAL_AXIS_PROFILE), parallelTolerance: residual });
  const result = resolve({ referenceVector: referenceVector, profile });
  assert.equal(result.inputReference.parallelResidual, profile.parallelTolerance);
  assert.equal(result.inputReference.accepted, false);
  assert.equal(result.selectedReference.source, 'FALLBACK');
});

test('B24-T10', 'Residual immediately above tolerance accepts reference', () => {
  const referenceVector = [1, 0, 0.25];
  const residual = norm(cross([1, 0, 0], referenceVector)) / norm(referenceVector);
  const profile = resealProfile({
    ...clone(FRAME_LOCAL_AXIS_PROFILE),
    parallelTolerance: residual - Number.EPSILON,
  });
  const result = resolve({ referenceVector, profile });
  assert.ok(result.inputReference.parallelResidual > profile.parallelTolerance);
  assert.equal(result.inputReference.accepted, true);
});

test('B24-T11', 'Reference magnitude scaling does not alter decision', () => {
  const inputA = [1, 0, 1e-8];
  const inputB = scale(inputA, 1e9);
  const resultA = resolve({ referenceVector: inputA });
  const resultB = resolve({ referenceVector: inputB });
  assert.equal(resultA.inputReference.accepted, resultB.inputReference.accepted);
  assert.equal(resultA.inputReference.parallelResidual, resultB.inputReference.parallelResidual);
  assert.deepEqual(resultA.axes, resultB.axes);
});

test('B24-T12', 'Input arrays are not mutated', () => {
  const nodeI = [0, 0, 0];
  const nodeJ = [0, 0, 5];
  const referenceVector = [0, 0, 1];
  const profile = clone(FRAME_LOCAL_AXIS_PROFILE);
  const before = clone({ nodeI, nodeJ, referenceVector, profile });
  const result = resolveFrameLocalAxes({ nodeI, nodeJ, referenceVector, profile });
  assert.deepEqual({ nodeI, nodeJ, referenceVector, profile }, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.axes), true);
  assert.equal(Object.isFrozen(result.axes.x), true);
  assert.equal(Object.isFrozen(result.diagnostics), true);
});

test('B24-T13', 'Repeat execution is byte-deterministic', () => {
  const input = {
    nodeI: [3.1, -2.2, 5.7],
    nodeJ: [-9.4, 8.3, 0.125],
    referenceVector: [2, 5, -3],
    profile: clone(FRAME_LOCAL_AXIS_PROFILE)
  };
  const first = canonicalStringify(resolveFrameLocalAxes(input));
  const second = canonicalStringify(resolveFrameLocalAxes(input));
  assert.equal(second, first);
});

test('B24-T14', 'Result hash is invariant to object-key order', () => {
  const result = resolve();
  const reordered = {
    diagnostics: result.diagnostics.map((row) => ({ severity: row.severity, code: row.code })),
    verification: Object.fromEntries(Reflect.ownKeys(result.verification).reverse().map((key) => [key, result.verification[key]])),
    axes: { z: result.axes.z, y: result.axes.y, x: result.axes.x },
    selectedReference: {
      alignment: result.selectedReference.alignment,
      vector: result.selectedReference.vector,
      candidateId: result.selectedReference.candidateId,
      source: result.selectedReference.source,
    },
    inputReference: {
      accepted: result.inputReference.accepted,
      parallelResidual: result.inputReference.parallelResidual,
      norm: result.inputReference.norm,
      vector: result.inputReference.vector,
    },
    elementDirection: { length: result.elementDirection.length, delta: result.elementDirection.delta },
    profileSemanticHash: result.profileSemanticHash,
    profileId: result.profileId,
    policyId: result.policyId,
    schema: result.schema,
  };
  assert.equal(computeFrameLocalAxisResultSemanticHash(reordered), result.semanticHash);
});

test('B24-T15', 'Profile order change affects profile hash', () => {
  const reordered = clone(FRAME_LOCAL_AXIS_PROFILE);
  reordered.fallbackCandidates.reverse();
  delete reordered.semanticHash;
  assert.notEqual(computeFrameLocalAxisProfileSemanticHash(reordered), FRAME_LOCAL_AXIS_PROFILE.semanticHash);
});

test('B24-T16', 'Fallback order change may change tied selection', () => {
  const reordered = clone(FRAME_LOCAL_AXIS_PROFILE);
  reordered.fallbackCandidates = [
    reordered.fallbackCandidates[1],
    reordered.fallbackCandidates[0],
    reordered.fallbackCandidates[2],
  ];
  const profile = resealProfile(reordered);
  const original = resolve({ nodeJ: [0, 0, 5], referenceVector: [0, 0, 1] });
  const changed = resolve({ nodeJ: [0, 0, 5], referenceVector: [0, 0, 1], profile });
  assert.equal(original.selectedReference.candidateId, 'GLOBAL_X');
  assert.equal(changed.selectedReference.candidateId, 'GLOBAL_Y');
});

test('B24-T17', 'Proper rigid rotation covariance', () => {
  const matrix = rotationMatrix();
  const acceptedInput = {
    nodeI: [2, -1, 3],
    nodeJ: [5, 4, -2],
    referenceVector: [1, 3, 2],
    profile: FRAME_LOCAL_AXIS_PROFILE,
  };
  const accepted = resolveFrameLocalAxes(acceptedInput);
  const acceptedRotated = resolveFrameLocalAxes({
    nodeI: matVec(matrix, acceptedInput.nodeI,
    nodeJ: matVec(matrix, acceptedInput.nodeJ),
    referenceVector: matVec(matrix, acceptedInput.referenceVector),
    profile: rotateProfile(FRAME_LOCAL_AXIS_PROFILE, matrix),
  });
  for (const axis of ['x', 'y', 'z']) {
    assertVectorClose(acceptedRotated.axes[axis], matVec(matrix, accepted.axes[axis]), 2e-12, `accepted ${axis}`);
  }

  const fallbackInput = {
    nodeI: [0, 0, 0],
    nodeJ: [1, 2, 3],
    referenceVector: [2, 4, 6],
    profile: FRAME_LOCAL_AXIS_PROFILE,
  };
  const fallback = resolveFrameLocalAxes(fallbackInput);
  const rotatedProfile = rotateProfile(FRAME_LOCAL_AXIS_PROFILE, matrix);
  const fallbackRotated = resolveFrameLocalAxes({
    nodeI: matVec(matrix, fallbackInput.nodeI),
    nodeJ: matVec(matrix, fallbackInput.nodeJ),
    referenceVector: matVec(matrix, fallbackInput.referenceVector),
    profile: rotatedProfile,
  });
  for (const axis of ['x', 'y', 'z']) {
    assertVectorClose(fallbackRotated.axes[axis], matVec(matrix, fallback.axes[axis]), 2e-12, `fallback ${axis}`);
  }

  const fixedGlobalFallback = resolveFrameLocalAxes({
    nodeI: matVec(matrix, fallbackInput.nodeI),
    nodeJ: matVec(matrix, fallbackInput.nodeJ),
    referenceVector: matVec(matrix, fallbackInput.referenceVector),
    profile: FRAME_LOCAL_AXIS_PROFILE,
  });
  const covarianceError = norm(subtract(fixedGlobalFallback.axes.y, matVec(matrix, fallback.axes.y)));
  assert.ok(covarianceError > 1e-6, 'Fixed global fallback profile is intentionally not generally covariant');
});

test('B24-T18', 'Node reversal deterministic behavior', () => {
  const input = {
    nodeI: [1, 2, 3],
    nodeJ: [7, -4, 8],
    referenceVector: [0.5, 2, 1],
    profile: FRAME_LOCAL_AXIS_PROFILE,
  };
  const original = resolveFrameLocalAxes(input);
  const reversed = resolveFrameLocalAxes({ ...input, nodeI: input.nodeJ, nodeJ: input.nodeI });
  assertVectorClose(reversed.axes.x, scale(original.axes.x, -1));
  assertVectorClose(reversed.axes.y, original.axes.y);
  assertVectorClose(reversed.axes.z, scale(original.axes.z, -1));
  assert.equal(reversed.verification.determinant > 0, true);
  const repeated = resolveFrameLocalAxes({ ...input, nodeI: input.nodeJ, nodeJ: input.nodeI });
  assert.equal(canonicalStringify(repeated), canonicalStringify(reversed));
  const doubleReversed = resolveFrameLocalAxes(input);
  assert.equal(canonicalStringify(doubleReversed), canonicalStringify(original));
});

test('B24-T19', 'Unit-vector residual qualification', () => {
  const verification = {
    normResidualX: FRAME_LOCAL_AXIS_PROFILE.unitVectorTolerance,
    normResidualY: 0,
    normResidualZ: 0,
    orthogonalityXY: 0,
    orthogonalityYZ: 0,
    orthogonalityZX: 0,
    handednessResidual: 0,
    determinant: 1,
    determinantResidual: 0,
  };
  assert.equal(qualifyFrameLocalAxisVerification(verification, FRAME_LOCAL_AXIS_PROFILE), true);
  expectCode(
    () => qualifyFrameLocalAxisVerification({ ...verification, normResidualX: FRAME_LOCAL_AXIS_PROFILE.unitVectorTolerance * 1.0001 }, FRAME_LOCAL_AXIS_PROFILE),
    'FRAME_AXIS_BASIS_NOT_ORTHONORMAL',
  );
});

test('B24-T20', 'Orthogonality residual qualification', () => {
  const verification = {
    normResidualX: 0,
    normResidualY: 0,
    normResidualZ: 0,
    orthogonalityXY: FRAME_LOCAL_AXIS_PROFILE.orthogonalityTolerance,
    orthogonalityYZ: 0,
    orthogonalityZX: 0,
    handednessResidual: 0,
    determinant: 1,
    determinantResidual: 0,
  };
  assert.equal(qualifyFrameLocalAxisVerification(verification, FRAME_LOCAL_AXIS_PROFILE), true);
  expectCode(
    () => qualifyFrameLocalAxisVerification({ ...verification, orthogonalityXY: FRAME_LOCAL_AXIS_PROFILE.orthogonalityTolerance * 1.0001 }, FRAME_LOCAL_AXIS_PROFILE),
    'FRAME_AXIS_BASIS_NOT_ORTHONORMAL',
  );
});

test('B24-T21', 'Right-handed determinant qualification', () => {
  const verification = {
    normResidualX: 0,
    normResidualY: 0,
    normResidualZ: 0,
    orthogonalityXY: 0,
    orthogonalityYZ: 0,
    orthogonalityZX: 0,
    handednessResidual: FRAME_LOCAL_AXIS_PROFILE.handednessTolerance,
    determinant: 1 - FRAME_LOCAL_AXIS_PROFILE.determinantTolerance,
    determinantResidual: FRAME_LOCAL_AXIS_PROFILE.determinantTolerance,
  };
  assert.equal(qualifyFrameLocalAxisVerification(verification, FRAME_LOCAL_AXIS_PROFILE), true);
  expectCode(
    () => qualifyFrameLocalAxisVerification({ ...verification, determinantResidual: FRAME_LOCAL_AXIS_PROFILE.determinantTolerance * 1.0001 }, FRAME_LOCAL_AXIS_PROFILE),
    'FRAME_AXIS_BASIS_NOT_RIGHT_HANDED',
  );
  expectCode(
    () => qualifyFrameLocalAxisVerification({ ...verification, determinant: -1, determinantResidual: 2 }, FRAME_LOCAL_AXIS_PROFILE),
    'FRAME_AXIS_BASIS_NOT_RIGHT_HANDED',
  );
});

test('B24-T22', 'Stale profile hash rejected', () => {
  const stale = clone(FRAME_LOCAL_AXIS_PROFILE);
  stale.parallelTolerance *= 2;
  expectCode(() => requireFrameLocalAxisProfile(stale), 'FRAME_AXIS_HASH_MISMATCH');
  expectCode(() => resolve({ profile: stale }), 'FRAME_AXIS_HASH_MISMATCH');
});

test('B24-T23', 'Stale result hash rejected', () => {
  const stale = clone(resolve());
  stale.axes.y[2] = 0.5;
  expectCode(() => requireFrameLocalAxisResult(stale), 'FRAME_AXIS_HASH_MISMATCH');
});

regression('B24-R01', 'View-dependent up direction changes identical geometry', () => {
  const x = [0, 0, 1];
  const basisA = normalize(subtract([1, 0, 0], scale(x, dot([1, 0, 0], x))));
  const basisB = normalize(subtract([0, 1, 0], scale(x, dot([0, 1, 0], x))));
  assert.notDeepEqual(basisA, basisB);
});

regression('B24-R02', 'Object enumeration does not preserve a declared candidate sequence', () => {
  const declared = [
    { candidateId: '10', vector: [1, 0, 0] },
    { candidateId: '2', vector: [0, 1, 0] },
  ];
  const object = {};
  for (const candidate of declared) object[candidate.candidateId] = candidate.vector;
  assert.notDeepEqual(Reflect.ownKeys(object), declared.map(({ candidateId }) => candidateId));
});

regression('B24-R03', 'Unnormalized cross magnitude changes under reference scaling', () => {
  const x = [1, 0, 0];
  const small = [1, 0, 1e-12];
  const large = scale(small, 1e12);
  const tolerance = 1e-6;
  const smallDecision = norm(cross(x, small)) <= tolerance;
  const largeDecision = norm(cross(x, large)) <= tolerance;
  assert.notEqual(smallDecision, largeDecision);
});

regression('B24-R04', 'Strict less-than changes the exact tolerance boundary', () => {
  const residual = FRAME_LOCAL_AXIS_PROFILE.parallelTolerance;
  assert.equal(residual <= FRAME_LOCAL_AXIS_PROFILE.parallelTolerance, true);
  assert.equal(residual < FRAME_LOCAL_AXIS_PROFILE.parallelTolerance, false);
});

regression('B24-R05', 'Reversing the cross-product order creates a left-handed basis', () => {
  const x = [1, 0, 0];
  const y = [0, 1, 0];
  const wrongZ = cross(y, x);
  const determinant = dot(x, cross(y, wrongZ));
  assert.equal(determinant, -1);
});

regression('B24-R06', 'Overwriting the source reference is rejected even after resealing', () => {
  const result = clone(resolve({ nodeJ: [0, 0, 5], referenceVector: [0, 0, 1] }));
  result.inputReference.vector = [...result.selectedReference.vector];
  result.inputReference.norm = norm(result.inputReference.vector);
  delete result.semanticHash;
  result.semanticHash = computeFrameLocalAxisResultSemanticHash(result);
  expectCode(() => verifyFrameLocalAxes(result, FRAME_LOCAL_AXIS_PROFILE), 'FRAME_AXIS_HASH_MISMATCH');
});

regression('B24-R07', 'Perturbation sequence breaks byte repeatability', () => {
  const outputs = [1e-9, -1e-9].map((perturbation) => canonicalStringify([1, perturbation, 0]));
  assert.notEqual(outputs[0], outputs[1]);
});

regression('B24-R08', 'In-place sorting mutates caller fallback arrays', () => {
  const caller = clone(FRAME_LOCAL_AXIS_PROFILE.fallbackCandidates);
  const before = clone(caller);
  caller.sort((left, right) => left.candidateId < right.candidateId ? 1 : -1);
  assert.notDeepEqual(caller, before);
});

regression('B24-R09', 'Removing right-handed verification would admit a left-handed basis', () => {
  const result = clone(resolve());
  result.axes.z = scale(result.axes.z, -1);
  result.verification = {
    ...result.verification,
    handednessResidual: 2,
    determinant: -1,
    determinantResidual: 2,
  };
  delete result.semanticHash;
  result.semanticHash = computeFrameLocalAxisResultSemanticHash(result);
  expectCode(() => verifyFrameLocalAxes(result, FRAME_LOCAL_AXIS_PROFILE), 'FRAME_AXIS_BASIS_NOT_RIGHT_HANDED');
});

console.log('\n--- LFEA B-2.4 deterministic frame local-axis check ---');
for (const { id, description, run } of tests) {
  await run();
  console.log(`PASS ${id} ${description}`);
}
console.log('\n--- Deliberate regression demonstrations ---');
for (const { id, description, run } of deliberateRegressions) {
  await run();
  console.log(`PASS ${id} ${description}`);
}
console.log(`\nLFEA B-2.4 local-axis check passed: ${tests.length} analytical tests and ${deliberateRegressions.length} deliberate regressions.`);
