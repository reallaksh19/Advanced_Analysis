import {
  FRAME_LOCAL_AXIS_POLICY_ID,
  FRAME_LOCAL_AXIS_RESULT_SCHEMA,
  FrameLocalAxisError,
  axisError,
  computeFrameLocalAxisResultSemanticHash,
  deepFreeze,
  requireExactRecord,
  requireFiniteVector,
  requireFrameLocalAxisProfile,
  strictClone,
  vectorNorm,
} from './local-axis-contract.js';

const RESULT_KEYS = [
  'schema',
  'policyId',
  'profileId',
  'profileSemanticHash',
  'elementDirection',
  'inputReference',
  'selectedReference',
  'axes',
  'verification',
  'diagnostics',
  'semanticHash',
];
const DIRECTION_KEYS = ['delta', 'length'];
const INPUT_REFERENCE_KEYS = ['vector', 'norm', 'parallelResidual', 'accepted'];
const SELECTED_REFERENCE_KEYS = ['source', 'candidateId', 'vector', 'alignment'];
const AXES_KEYS = ['x', 'y', 'z'];
const VERIFICATION_KEYS = [
  'unitVectorTolerance',
  'orthogonalityTolerance',
  'handednessTolerance',
  'determinantTolerance',
  'normResidualX',
  'normResidualY',
  'normResidualZ',
  'orthogonalityXY',
  'orthogonalityYZ',
  'orthogonalityZX',
  'handednessResidual',
  'determinant',
  'determinantResidual',
];
const DIAGNOSTIC_KEYS = ['code', 'severity'];
const DIAGNOSTIC_CODES = new Set([
  'FRAME_REFERENCE_VECTOR_ACCEPTED',
  'FRAME_REFERENCE_VECTOR_PARALLEL',
  'FRAME_REFERENCE_VECTOR_NEAR_PARALLEL',
  'FRAME_REFERENCE_VECTOR_FALLBACK_SELECTED',
  'FRAME_REFERENCE_VECTOR_FALLBACK_TIE_RESOLVED',
]);

export function requireFrameLocalAxisResult(result) {
  let candidate;
  try {
    candidate = strictClone(result, 'FRAME_AXIS_BASIS_NONFINITE');
  } catch (error) {
    if (error instanceof FrameLocalAxisError) throw error;
    throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'Result cannot be cloned');
  }
  requireExactRecord(candidate, RESULT_KEYS, 'result', 'FRAME_AXIS_BASIS_NONFINITE');
  if (candidate.schema !== FRAME_LOCAL_AXIS_RESULT_SCHEMA || candidate.policyId !== FRAME_LOCAL_AXIS_POLICY_ID) {
    throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'Result schema or policy is invalid');
  }
  if (typeof candidate.profileId !== 'string' || typeof candidate.profileSemanticHash !== 'string') {
    throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'Result profile identity is invalid');
  }
  requireExactRecord(candidate.elementDirection, DIRECTION_KEYS, 'result.elementDirection', 'FRAME_AXIS_BASIS_NONFINITE');
  requireFiniteVector(candidate.elementDirection.delta, 'result.elementDirection.delta', 'FRAME_AXIS_BASIS_NONFINITE');
  requireFiniteNonnegative(candidate.elementDirection.length, 'result.elementDirection.length');

  requireExactRecord(candidate.inputReference, INPUT_REFERENCE_KEYS, 'result.inputReference', 'FRAME_AXIS_BASIS_NONFINITE');
  requireFiniteVector(candidate.inputReference.vector, 'result.inputReference.vector', 'FRAME_AXIS_BASIS_NONFINITE');
  requireFiniteNonnegative(candidate.inputReference.norm, 'result.inputReference.norm');
  requireFiniteNonnegative(candidate.inputReference.parallelResidual, 'result.inputReference.parallelResidual');
  if (typeof candidate.inputReference.accepted !== 'boolean') throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'result.inputReference.accepted must be boolean');

  requireExactRecord(candidate.selectedReference, SELECTED_REFERENCE_KEYS, 'result.selectedReference', 'FRAME_AXIS_BASIS_NONFINITE');
  if (!['INPUT', 'FALLBACK'].includes(candidate.selectedReference.source)) {
    throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'result.selectedReference.source is invalid');
  }
  if (candidate.selectedReference.source === 'INPUT' && candidate.selectedReference.candidateId !== null) {
    throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'Input reference must have null candidateId');
  }
  if (candidate.selectedReference.source === 'FALLBACK'
    && (typeof candidate.selectedReference.candidateId !== 'string' || candidate.selectedReference.candidateId.length === 0)) {
    throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'Fallback reference must retain candidateId');
  }
  requireFiniteVector(candidate.selectedReference.vector, 'result.selectedReference.vector', 'FRAME_AXIS_BASIS_NONFINITE');
  requireFiniteNonnegative(candidate.selectedReference.alignment, 'result.selectedReference.alignment');

  requireExactRecord(candidate.axes, AXES_KEYS, 'result.axes', 'FRAME_AXIS_BASIS_NONFINITE');
  for (const key of AXES_KEYS) requireFiniteVector(candidate.axes[key], `result.axes.${key}`, 'FRAME_AXIS_BASIS_NONFINITE');

  requireExactRecord(candidate.verification, VERIFICATION_KEYS, 'result.verification', 'FRAME_AXIS_BASIS_NONFINITE');
  for (const key of VERIFICATION_KEYS) {
    if (!Number.isFinite(candidate.verification[key])) throw axisError('FRAME_AXIS_BASIS_NONFINITE', `result.verification.${key} must be finite`);
  }

  if (!Array.isArray(candidate.diagnostics)) throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'result.diagnostics must be an array');
  for (let index = 0; index < candidate.diagnostics.length; index += 1) {
    const diagnostic = candidate.diagnostics[index];
    requireExactRecord(diagnostic, DIAGNOSTIC_KEYS, `result.diagnostics[${index}]`, 'FRAME_AXIS_BASIS_NONFINITE');
    if (!DIAGNOSTIC_CODES.has(diagnostic.code) || diagnostic.severity !== 'INFO') {
      throw axisError('FRAME_AXIS_BASIS_NONFINITE', `result.diagnostics[${index}] is invalid`);
    }
  }
  if (typeof candidate.semanticHash !== 'string') throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Result semanticHash must be a string');
  const expectedHash = computeFrameLocalAxisResultSemanticHash(candidate);
  if (candidate.semanticHash !== expectedHash) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Result semantic hash mismatch', {
      expected: expectedHash,
      received: candidate.semanticHash,
    });
  }
  return deepFreeze(candidate);
}

export function verifyFrameLocalAxes(result, profile) {
  const governedProfile = requireFrameLocalAxisProfile(profile);
  const governedResult = requireFrameLocalAxisResult(result);
  if (governedResult.profileId !== governedProfile.profileId
    || governedResult.profileSemanticHash !== governedProfile.semanticHash) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Result is bound to a different profile');
  }
  const evidenceTolerancePairs = [
    ['unitVectorTolerance', governedProfile.unitVectorTolerance],
    ['orthogonalityTolerance', governedProfile.orthogonalityTolerance],
    ['handednessTolerance', governedProfile.handednessTolerance],
    ['determinantTolerance', governedProfile.determinantTolerance],
  ];
  for (const [key, expected] of evidenceTolerancePairs) {
    if (governedResult.verification[key] !== expected) {
      throw axisError('FRAME_AXIS_HASH_MISMATCH', `Result verification.${key} is not profile-bound`);
    }
  }

  const { x, y, z } = governedResult.axes;
  const calculated = calculateFrameLocalAxisVerification(x, y, z, governedProfile);
  for (const key of [
    'normResidualX', 'normResidualY', 'normResidualZ',
    'orthogonalityXY', 'orthogonalityYZ', 'orthogonalityZX',
    'handednessResidual', 'determinant', 'determinantResidual',
  ]) {
    if (governedResult.verification[key] !== calculated[key]) {
      throw axisError('FRAME_AXIS_HASH_MISMATCH', `Result verification.${key} does not match its axes`);
    }
  }

  qualifyFrameLocalAxisVerification(calculated, governedProfile);
  verifyConstructionEvidence(governedResult, governedProfile);
  return governedResult;
}

export function qualifyFrameLocalAxisVerification(verification, profile) {
  if (verification.normResidualX > profile.unitVectorTolerance
    || verification.normResidualY > profile.unitVectorTolerance
    || verification.normResidualZ > profile.unitVectorTolerance
    || verification.orthogonalityXY > profile.orthogonalityTolerance
    || verification.orthogonalityYZ > profile.orthogonalityTolerance
    || verification.orthogonalityZX > profile.orthogonalityTolerance) {
    throw axisError('FRAME_AXIS_BASIS_NOT_ORTHONORMAL', 'Basis residual exceeds an inclusive qualification tolerance');
  }
  if (verification.handednessResidual > profile.handednessTolerance
    || verification.determinantResidual > profile.determinantTolerance
    || verification.determinant <= 0) {
    throw axisError('FRAME_AXIS_BASIS_NOT_RIGHT_HANDED', 'Basis is not right-handed within the inclusive qualification tolerance');
  }
  return true;
}

export function calculateFrameLocalAxisVerification(x, y, z, profile) {
  for (const vector of [x, y, z]) {
    if (!vector.every(Number.isFinite)) throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'Basis contains a nonfinite value');
  }
  const crossXY = cross(x, y);
  const determinant = dot(x, cross(y, z));
  return deepFreeze({
    unitVectorTolerance: profile.unitVectorTolerance,
    orthogonalityTolerance: profile.orthogonalityTolerance,
    handednessTolerance: profile.handednessTolerance,
    determinantTolerance: profile.determinantTolerance,
    normResidualX: clean(Math.abs(vectorNorm(x) - 1)),
    normResidualY: clean(Math.abs(vectorNorm(y) - 1)),
    normResidualZ: clean(Math.abs(vectorNorm(z) - 1)),
    orthogonalityXY: clean(Math.abs(dot(x, y))),
    orthogonalityYZ: clean(Math.abs(dot(y, z))),
    orthogonalityZX: clean(Math.abs(dot(z, x))),
    handednessResidual: clean(vectorNorm(subtract(crossXY, z))),
    determinant: clean(determinant),
    determinantResidual: clean(Math.abs(determinant - 1)),
  });
}


function verifyConstructionEvidence(result, profile) {
  const { delta, length } = result.elementDirection;
  const calculatedLength = vectorNorm(delta);
  if (length !== calculatedLength || length <= profile.zeroLengthTolerance) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Element-direction evidence is inconsistent');
  }
  const expectedX = delta.map((value) => clean(value / calculatedLength));
  if (!sameVectorWithin(result.axes.x, expectedX, profile.unitVectorTolerance)) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Local x is inconsistent with element-direction evidence');
  }

  const input = result.inputReference;
  const calculatedReferenceNorm = vectorNorm(input.vector);
  const calculatedParallelResidual = clean(vectorNorm(cross(result.axes.x, input.vector)) / calculatedReferenceNorm);
  const calculatedAccepted = calculatedParallelResidual > profile.parallelTolerance;
  if (input.norm !== calculatedReferenceNorm
    || !sameNumber(input.parallelResidual, calculatedParallelResidual, profile.parallelTolerance)
    || input.accepted !== calculatedAccepted) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Input-reference evidence is inconsistent');
  }

  const selected = result.selectedReference;
  if (calculatedAccepted) {
    if (selected.source !== 'INPUT' || selected.candidateId !== null || !sameVector(selected.vector, input.vector)) {
      throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Accepted input-reference selection is inconsistent');
    }
  } else {
    if (selected.source !== 'FALLBACK') {
      throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Rejected input reference must retain fallback selection');
    }
    const fallback = profile.fallbackCandidates.find((candidate) => candidate.candidateId === selected.candidateId);
    if (!fallback || !sameVector(fallback.vector, selected.vector)) {
      throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Selected fallback is not present in the bound profile');
    }
    let minimum = Infinity;
    let firstMinimumId = null;
    let tie = false;
    for (const candidate of profile.fallbackCandidates) {
      const candidateNorm = vectorNorm(candidate.vector);
      const normalized = candidate.vector.map((value) => value * (1 / candidateNorm));
      const alignment = clean(Math.abs(dot(result.axes.x, normalized)));
      if (alignment < minimum) {
        minimum = alignment;
        firstMinimumId = candidate.candidateId;
        tie = false;
      } else if (alignment === minimum) tie = true;
    }
    if (selected.candidateId !== firstMinimumId || !sameNumber(selected.alignment, minimum, profile.unitVectorTolerance)) {
      throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Fallback selection does not follow declared order and minimum alignment');
    }
    const expectedCodes = [
      calculatedParallelResidual === 0
        ? 'FRAME_REFERENCE_VECTOR_PARALLEL'
        : 'FRAME_REFERENCE_VECTOR_NEAR_PARALLEL',
      'FRAME_REFERENCE_VECTOR_FALLBACK_SELECTED',
      ...(tie ? ['FRAME_REFERENCE_VECTOR_FALLBACK_TIE_RESOLVED'] : []),
    ];
    if (!sameDiagnosticCodes(result.diagnostics, expectedCodes)) {
      throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Fallback diagnostics are inconsistent');
    }
  }
  if (calculatedAccepted && !sameDiagnosticCodes(result.diagnostics, ['FRAME_REFERENCE_VECTOR_ACCEPTED'])) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Accepted-reference diagnostics are inconsistent');
  }
  const selectedNorm = vectorNorm(selected.vector);
  const selectedAlignment = clean(Math.abs(dot(result.axes.x, selected.vector.map((value) => value * (1 / selectedNorm)))));
  if (!sameNumber(selected.alignment, selectedAlignment, profile.unitVectorTolerance)) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Selected-reference alignment evidence is inconsistent');
  }
  const transverse = subtract(selected.vector, result.axes.x.map((value) => value * dot(selected.vector, result.axes.x)));
  const transverseNorm = vectorNorm(transverse);
  if (!Number.isFinite(transverseNorm) || transverseNorm <= 0) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Selected reference cannot reconstruct the retained basis');
  }
  const firstY = transverse.map((value) => clean(value * (1 / transverseNorm)));
  const firstZRaw = cross(result.axes.x, firstY);
  const firstZNorm = vectorNorm(firstZRaw);
  const expectedZ = firstZRaw.map((value) => clean(value * (1 / firstZNorm)));
  const correctedYRaw = cross(expectedZ, result.axes.x);
  const correctedYNorm = vectorNorm(correctedYRaw);
  const expectedY = correctedYRaw.map((value) => clean(value * (1 / correctedYNorm)));
  if (!sameVectorWithin(result.axes.y, expectedY, profile.unitVectorTolerance)
    || !sameVectorWithin(result.axes.z, expectedZ, profile.unitVectorTolerance)) {
    throw axisError('FRAME_AXIS_HASH_MISMATCH', 'Retained axes do not match the governed construction evidence');
  }
}

function sameVector(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameVectorWithin(left, right, tolerance) {
  return left.length === right.length
    && left.every((value, index) => sameNumber(value, right[index], tolerance));
}

function sameNumber(left, right, tolerance) {
  return Math.abs(left - right) <= tolerance;
}

function sameDiagnosticCodes(diagnostics, expectedCodes) {
  return diagnostics.length === expectedCodes.length
    && diagnostics.every((diagnostic, index) => diagnostic.code === expectedCodes[index] && diagnostic.severity === 'INFO');
}

function requireFiniteNonnegative(value, path) {
  if (!Number.isFinite(value) || value < 0) throw axisError('FRAME_AXIS_BASIS_NONFINITE', `${path} must be finite and nonnegative`);
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function clean(value) {
  return Object.is(value, -0) ? 0 : value;
}
