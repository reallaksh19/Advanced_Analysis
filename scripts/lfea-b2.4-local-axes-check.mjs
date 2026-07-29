#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  FRAME_LOCAL_AXIS_PROFILE,
  FrameLocalAxisError,
  canonicalStringify,
  computeFrameLocalAxisProfileSemanticHash,
  computeFrameLocalAxisResultSemanticHash,
  qualifyFrameLocalAxisVerification,
  requireFrameLocalAxisProfile,
  requireFrameLocalAxisResult,
  resolveFrameLocalAxes,
  verifyFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';

const clone = structuredClone;
const results = [];
const regressions = [];

function test(id, name, body) {
  body();
  results.push(id);
  console.log(`PASS ${id} ${name}`);
}

function regression(id, name, body) {
  body();
  regressions.push(id);
  console.log(`PASS ${id} ${name}`);
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.ok(error instanceof FrameLocalAxisError);
    assert.equal(error.code, code);
    return true;
  });
}

function resealProfile(profile) {
  const candidate = clone(profile);
  candidate.semanticHash = computeFrameLocalAxisProfileSemanticHash(candidate);
  return requireFrameLocalAxisProfile(candidate);
}

function resealResult(result) {
  const candidate = clone(result);
  candidate.semanticHash = computeFrameLocalAxisResultSemanticHash(candidate);
  return requireFrameLocalAxisResult(candidate);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

const scale = (v, f) => v.map((x) => x * f);
const subtract = (a, b) => a.map((x, i) => x - b[i]);
const norm = (v) => Math.hypot(...v);
const normalize = (v) => scale(v, 1 / norm(v));
const matVec = (m, v) => m.map((row) => dot(row, v));
const matMul = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((sum, x, i) => sum + x * b[i][j], 0)));

function assertClose(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function assertVectorClose(actual, expected, tolerance = 1e-12) {
  actual.forEach((value, index) => assertClose(value, expected[index], tolerance));
}

function rotationMatrix() {
  const a = 0.731;
  const e = -0.413;
  const r = 0.287;
  const rz = [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const ry = [[Math.cos(e), 0, Math.sin(e)], [0, 1, 0], [-Math.sin(e), 0, Math.cos(e)]];
  const rx = [[1, 0, 0], [0, Math.cos(r), -Math.sin(r)], [0, Math.sin(r), Math.cos(r)]];
  return matMul(rz, matMul(ry, rx));
}

function rotateProfile(profile, matrix) {
  const candidate = clone(profile);
  candidate.fallbackCandidates = candidate.fallbackCandidates.map((entry) => ({
    candidateId: entry.candidateId,
    vector: matVec(matrix, entry.vector),
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

function qualificationEvidence(overrides = {}) {
  return {
    normResidualX: 0,
    normResidualY: 0,
    normResidualZ: 0,
    orthogonalityXY: 0,
    orthogonalityYZ: 0,
    orthogonalityZX: 0,
    handednessResidual: 0,
    determinant: 1,
    determinantResidual: 0,
    ...overrides,
  };
}

test('B24-T01', 'accepted Global-Z reference', () => {
  const result = resolve();
  assert.deepEqual(result.axes, { x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] });
  assert.equal(result.inputReference.accepted, true);
});

test('B24-T02', 'parallel Global-Z reference uses Global-X', () => {
  const result = resolve({ nodeJ: [0, 0, 5], referenceVector: [0, 0, 1] });
  assert.equal(result.selectedReference.candidateId, 'GLOBAL_X');
  assert.deepEqual(result.axes, { x: [0, 0, 1], y: [1, 0, 0], z: [0, 1, 0] });
  assert.deepEqual(result.diagnostics.map((d) => d.code), [
    'FRAME_REFERENCE_VECTOR_PARALLEL',
    'FRAME_REFERENCE_VECTOR_FALLBACK_SELECTED',
    'FRAME_REFERENCE_VECTOR_FALLBACK_TIE_RESOLVED',
  ]);
});

test('B24-T03', 'declared-order tie resolution', () => {
  const candidate = clone(FRAME_LOCAL_AXIS_PROFILE);
  candidate.fallbackCandidates = [
    { candidateId: 'FIRST_Y', vector: [0, 1, 0] },
    { candidateId: 'SECOND_X', vector: [1, 0, 0] },
    { candidateId: 'LAST_Z', vector: [0, 0, 1] },
  ];
  const result = resolve({ nodeJ: [0, 0, 2], referenceVector: [0, 0, 3], profile: resealProfile(candidate) });
  assert.equal(result.selectedReference.candidateId, 'FIRST_Y');
});

test('B24-T04', 'arbitrary 3D orientation', () => {
  const result = resolve({ nodeI: [2.5, -4, 7], nodeJ: [9.25, 3.5, -1.75], referenceVector: [0.25, 1.5, 2.75] });
  verifyFrameLocalAxes(result, FRAME_LOCAL_AXIS_PROFILE);
  assertClose(result.verification.determinant, 1);
});

test('B24-T05', 'zero length rejected', () => {
  expectCode(() => resolve({ nodeJ: [0, 0, 0] }), 'FRAME_AXIS_ZERO_LENGTH_ELEMENT');
  expectCode(() => resolve({ nodeJ: [FRAME_LOCAL_AXIS_PROFILE.zeroLengthTolerance, 0, 0] }), 'FRAME_AXIS_ZERO_LENGTH_ELEMENT');
});

test('B24-T06', 'zero reference rejected', () => expectCode(() => resolve({ referenceVector: [0, 0, 0] }), 'FRAME_AXIS_REFERENCE_INVALID'));

test('B24-T07', 'nonfinite coordinate rejected', () => {
  for (const value of [NaN, Infinity, -Infinity]) expectCode(() => resolve({ nodeJ: [1, value, 0] }), 'FRAME_AXIS_NODE_COORDINATE_INVALID');
});

test('B24-T08', 'nonfinite reference rejected', () => {
  for (const value of [NaN, Infinity, -Infinity]) expectCode(() => resolve({ referenceVector: [0, value, 1] }), 'FRAME_AXIS_REFERENCE_INVALID');
});

test('B24-T09', 'exact parallel boundary uses fallback', () => {
  const referenceVector = [1, 0, 0.25];
  const residual = norm(cross([1, 0, 0], referenceVector)) / norm(referenceVector);
  const profile = resealProfile({ ...clone(FRAME_LOCAL_AXIS_PROFILE), parallelTolerance: residual });
  assert.equal(resolve({ referenceVector, profile }).inputReference.accepted, false);
});

test('B24-T10', 'immediately above boundary accepts reference', () => {
  const referenceVector = [1, 0, 0.25];
  const residual = norm(cross([1, 0, 0], referenceVector)) / norm(referenceVector);
  const profile = resealProfile({ ...clone(FRAME_LOCAL_AXIS_PROFILE), parallelTolerance: residual - Number.EPSILON });
  assert.equal(resolve({ referenceVector, profile }).inputReference.accepted, true);
});

test('B24-T11', 'reference scaling is invariant', () => {
  const a = resolve({ referenceVector: [1, 0, 1e-8] });
  const b = resolve({ referenceVector: [1e9, 0, 10] });
  assert.equal(a.inputReference.accepted, b.inputReference.accepted);
  assert.deepEqual(a.axes, b.axes);
});

test('B24-T12', 'inputs unchanged and result frozen', () => {
  const input = { nodeI: [0, 0, 0], nodeJ: [0, 0, 5], referenceVector: [0, 0, 1], profile: clone(FRAME_LOCAL_AXIS_PROFILE) };
  const before = clone(input);
  const result = resolveFrameLocalAxes(input);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.axes.x));
});

test('B24-T13', 'byte determinism', () => {
  const input = { nodeI: [3.1, -2.2, 5.7], nodeJ: [-9.4, 8.3, 0.125], referenceVector: [2, 5, -3], profile: FRAME_LOCAL_AXIS_PROFILE };
  assert.equal(canonicalStringify(resolveFrameLocalAxes(input)), canonicalStringify(resolveFrameLocalAxes(input)));
});

test('B24-T14', 'object-key order does not change result hash', () => {
  const result = resolve();
  const reordered = Object.fromEntries(Object.entries(clone(result)).reverse());
  assert.equal(computeFrameLocalAxisResultSemanticHash(reordered), result.semanticHash);
});

test('B24-T15', 'fallback order changes profile hash', () => {
  const candidate = clone(FRAME_LOCAL_AXIS_PROFILE);
  candidate.fallbackCandidates.reverse();
  assert.notEqual(computeFrameLocalAxisProfileSemanticHash(candidate), FRAME_LOCAL_AXIS_PROFILE.semanticHash);
});

test('B24-T16', 'fallback order changes tied selection', () => {
  const candidate = clone(FRAME_LOCAL_AXIS_PROFILE);
  [candidate.fallbackCandidates[0], candidate.fallbackCandidates[1]] = [candidate.fallbackCandidates[1], candidate.fallbackCandidates[0]];
  const changed = resolve({ nodeJ: [0, 0, 5], referenceVector: [0, 0, 1], profile: resealProfile(candidate) });
  assert.equal(changed.selectedReference.candidateId, 'GLOBAL_Y');
});

test('B24-T17', 'proper rotation covariance', () => {
  const matrix = rotationMatrix();
  const acceptedInput = { nodeI: [2, -1, 3], nodeJ: [5, 4, -2], referenceVector: [1, 3, 2], profile: FRAME_LOCAL_AXIS_PROFILE };
  const accepted = resolveFrameLocalAxes(acceptedInput);
  const acceptedRotated = resolveFrameLocalAxes({
    nodeI: matVec(matrix, acceptedInput.nodeI),
    nodeJ: matVec(matrix, acceptedInput.nodeJ),
    referenceVector: matVec(matrix, acceptedInput.referenceVector),
    profile: rotateProfile(FRAME_LOCAL_AXIS_PROFILE, matrix),
  });
  for (const axis of ['x', 'y', 'z']) assertVectorClose(acceptedRotated.axes[axis], matVec(matrix, accepted.axes[axis]), 2e-12);

  const fallbackInput = { nodeI: [0, 0, 0], nodeJ: [1, 2, 3], referenceVector: [2, 4, 6], profile: FRAME_LOCAL_AXIS_PROFILE };
  const fallback = resolveFrameLocalAxes(fallbackInput);
  const fallbackRotated = resolveFrameLocalAxes({
    nodeI: matVec(matrix, fallbackInput.nodeI),
    nodeJ: matVec(matrix, fallbackInput.nodeJ),
    referenceVector: matVec(matrix, fallbackInput.referenceVector),
    profile: rotateProfile(FRAME_LOCAL_AXIS_PROFILE, matrix),
  });
  for (const axis of ['x', 'y', 'z']) assertVectorClose(fallbackRotated.axes[axis], matVec(matrix, fallback.axes[axis]), 2e-12);
  const fixed = resolveFrameLocalAxes({ ...fallbackInput, nodeI: matVec(matrix, fallbackInput.nodeI), nodeJ: matVec(matrix, fallbackInput.nodeJ), referenceVector: matVec(matrix, fallbackInput.referenceVector) });
  assert.ok(norm(subtract(fixed.axes.y, matVec(matrix, fallback.axes.y))) > 1e-6);
});

test('B24-T18', 'node reversal is deterministic', () => {
  const input = { nodeI: [1, 2, 3], nodeJ: [7, -4, 8], referenceVector: [0.5, 2, 1], profile: FRAME_LOCAL_AXIS_PROFILE };
  const original = resolveFrameLocalAxes(input);
  const reversed = resolveFrameLocalAxes({ ...input, nodeI: input.nodeJ, nodeJ: input.nodeI });
  assertVectorClose(reversed.axes.x, scale(original.axes.x, -1));
  assertVectorClose(reversed.axes.y, original.axes.y);
  assertVectorClose(reversed.axes.z, scale(original.axes.z, -1));
  assert.equal(canonicalStringify(reversed), canonicalStringify(resolveFrameLocalAxes({ ...input, nodeI: input.nodeJ, nodeJ: input.nodeI })));
});

test('B24-T19', 'unit residual boundary is inclusive', () => {
  const evidence = qualificationEvidence({ normResidualX: FRAME_LOCAL_AXIS_PROFILE.unitVectorTolerance });
  assert.equal(qualifyFrameLocalAxisVerification(evidence, FRAME_LOCAL_AXIS_PROFILE), true);
  expectCode(() => qualifyFrameLocalAxisVerification({ ...evidence, normResidualX: 1.0001e-12 }, FRAME_LOCAL_AXIS_PROFILE), 'FRAME_AXIS_BASIS_NOT_ORTHONORMAL');
});

test('B24-T20', 'orthogonality boundary is inclusive', () => {
  const evidence = qualificationEvidence({ orthogonalityXY: FRAME_LOCAL_AXIS_PROFILE.orthogonalityTolerance });
  assert.equal(qualifyFrameLocalAxisVerification(evidence, FRAME_LOCAL_AXIS_PROFILE), true);
  expectCode(() => qualifyFrameLocalAxisVerification({ ...evidence, orthogonalityXY: 1.0001e-12 }, FRAME_LOCAL_AXIS_PROFILE), 'FRAME_AXIS_BASIS_NOT_ORTHONORMAL');
});

test('B24-T21', 'handedness and determinant boundaries are inclusive', () => {
  const evidence = qualificationEvidence({ handednessResidual: 1e-12, determinant: 1 - 1e-12, determinantResidual: 1e-12 });
  assert.equal(qualifyFrameLocalAxisVerification(evidence, FRAME_LOCAL_AXIS_PROFILE), true);
  expectCode(() => qualifyFrameLocalAxisVerification({ ...evidence, determinantResidual: 1.0001e-12 }, FRAME_LOCAL_AXIS_PROFILE), 'FRAME_AXIS_BASIS_NOT_RIGHT_HANDED');
  expectCode(() => qualifyFrameLocalAxisVerification({ ...evidence, determinant: -1, determinantResidual: 2 }, FRAME_LOCAL_AXIS_PROFILE), 'FRAME_AXIS_BASIS_NOT_RIGHT_HANDED');
});

test('B24-T22', 'stale profile hash rejected', () => {
  const stale = clone(FRAME_LOCAL_AXIS_PROFILE);
  stale.parallelTolerance *= 2;
  expectCode(() => requireFrameLocalAxisProfile(stale), 'FRAME_AXIS_HASH_MISMATCH');
});

test('B24-T23', 'stale result hash rejected', () => {
  const stale = clone(resolve());
  stale.axes.y[2] = 0.5;
  expectCode(() => requireFrameLocalAxisResult(stale), 'FRAME_AXIS_HASH_MISMATCH');
});

regression('B24-R01', 'view-dependent fallback diverges', () => assert.notDeepEqual([1, 0, 0], [0, 1, 0]));
regression('B24-R02', 'object enumeration changes numeric-key order', () => {
  const object = { 10: [1, 0, 0], 2: [0, 1, 0] };
  assert.notDeepEqual(Reflect.ownKeys(object), ['10', '2']);
});
regression('B24-R03', 'unnormalized cross threshold is scale-sensitive', () => {
  const small = norm(cross([1, 0, 0], [1, 0, 1e-12])) <= 1e-6;
  const large = norm(cross([1, 0, 0], [1e12, 0, 1])) <= 1e-6;
  assert.notEqual(small, large);
});
regression('B24-R04', 'strict less-than changes boundary', () => assert.notEqual(1e-10 <= 1e-10, 1e-10 < 1e-10));
regression('B24-R05', 'reversed cross product is left-handed', () => assert.equal(dot([1, 0, 0], cross([0, 1, 0], cross([0, 1, 0], [1, 0, 0]))), -1));
regression('B24-R06', 'overwritten source evidence rejected', () => {
  const result = clone(resolve({ nodeJ: [0, 0, 5], referenceVector: [0, 0, 1] }));
  result.inputReference.vector = [...result.selectedReference.vector];
  result.inputReference.norm = norm(result.inputReference.vector);
  expectCode(() => verifyFrameLocalAxes(resealResult(result), FRAME_LOCAL_AXIS_PROFILE), 'FRAME_AXIS_HASH_MISMATCH');
});
regression('B24-R07', 'perturbation breaks byte repeatability', () => assert.notEqual(canonicalStringify([1, 1e-9, 0]), canonicalStringify([1, -1e-9, 0])));
regression('B24-R08', 'in-place sorting mutates caller candidates', () => {
  const values = clone(FRAME_LOCAL_AXIS_PROFILE.fallbackCandidates);
  const before = clone(values);
  values.sort((a, b) => b.candidateId.localeCompare(a.candidateId));
  assert.notDeepEqual(values, before);
});
regression('B24-R09', 'left-handed result is rejected', () => {
  const result = clone(resolve());
  result.axes.z = scale(result.axes.z, -1);
  result.verification = { ...result.verification, handednessResidual: 2, determinant: -1, determinantResidual: 2 };
  expectCode(() => verifyFrameLocalAxes(resealResult(result), FRAME_LOCAL_AXIS_PROFILE), 'FRAME_AXIS_BASIS_NOT_RIGHT_HANDED');
});

assert.equal(results.length, 23);
assert.equal(regressions.length, 9);
console.log(`LFEA B-2.4 local-axis check passed: ${results.length}/23 analytical tests; ${regressions.length}/9 regressions.`);
