import {
  FRAME_LOCAL_AXIS_POLICY_ID,
  FRAME_LOCAL_AXIS_RESULT_SCHEMA,
  axisError,
  computeFrameLocalAxisResultSemanticHash,
  deepFreeze,
  normalizeFrameLocalAxisNumber,
  requireFiniteVector,
  requireFrameLocalAxisProfile,
  vectorNorm,
} from './local-axis-contract.js';
import {
  calculateFrameLocalAxisVerification,
  verifyFrameLocalAxes,
} from './local-axis-validation.js';

export function resolveFrameLocalAxes({ nodeI, nodeJ, referenceVector, profile }) {
  const governedProfile = requireFrameLocalAxisProfile(profile);
  const start = cloneCoordinate(nodeI, 'nodeI');
  const end = cloneCoordinate(nodeJ, 'nodeJ');
  const suppliedReference = cloneReference(referenceVector, governedProfile);

  const delta = subtract(end, start);
  const length = vectorNorm(delta);
  if (!Number.isFinite(length)) {
    throw axisError('FRAME_AXIS_BASIS_NONFINITE', 'Element-direction norm is nonfinite');
  }
  if (length <= governedProfile.zeroLengthTolerance) {
    throw axisError('FRAME_AXIS_ZERO_LENGTH_ELEMENT', 'Element length is at or below zeroLengthTolerance', {
      length,
      zeroLengthTolerance: governedProfile.zeroLengthTolerance,
    });
  }
  const localX = normalize(delta, 'FRAME_AXIS_BASIS_NONFINITE');
  const inputNorm = vectorNorm(suppliedReference);
  const parallelResidual = clean(vectorNorm(cross(localX, suppliedReference)) / inputNorm);
  const inputUnusable = parallelResidual <= governedProfile.parallelTolerance;
  const inputAccepted = !inputUnusable;
  const diagnostics = [];

  let selectedReference;
  if (inputAccepted) {
    diagnostics.push(info('FRAME_REFERENCE_VECTOR_ACCEPTED'));
    selectedReference = {
      source: 'INPUT',
      candidateId: null,
      vector: [...suppliedReference],
      alignment: clean(Math.abs(dot(localX, scale(suppliedReference, 1 / inputNorm)))),
    };
  } else {
    diagnostics.push(info(parallelResidual === 0
      ? 'FRAME_REFERENCE_VECTOR_PARALLEL'
      : 'FRAME_REFERENCE_VECTOR_NEAR_PARALLEL'));
    const selection = selectFallback(localX, governedProfile);
    diagnostics.push(info('FRAME_REFERENCE_VECTOR_FALLBACK_SELECTED'));
    if (selection.tieResolved) diagnostics.push(info('FRAME_REFERENCE_VECTOR_FALLBACK_TIE_RESOLVED'));
    selectedReference = {
      source: 'FALLBACK',
      candidateId: selection.candidateId,
      vector: [...selection.vector],
      alignment: selection.alignment,
    };
  }

  const transverse = subtract(
    selectedReference.vector,
    scale(localX, dot(selectedReference.vector, localX)),
  );
  const transverseNorm = vectorNorm(transverse);
  if (!Number.isFinite(transverseNorm) || transverseNorm <= 0) {
    throw axisError('FRAME_AXIS_FALLBACK_UNAVAILABLE', 'Selected reference cannot construct a transverse axis');
  }
  const localY = normalize(transverse, 'FRAME_AXIS_BASIS_NONFINITE');
  const localZ = normalize(cross(localX, localY), 'FRAME_AXIS_BASIS_NONFINITE');
  const correctedLocalY = normalize(cross(localZ, localX), 'FRAME_AXIS_BASIS_NONFINITE');
  const axes = deepFreeze({
    x: cleanVector(localX),
    y: cleanVector(correctedLocalY),
    z: cleanVector(localZ),
  });
  const verification = calculateFrameLocalAxisVerification(
    axes.x,
    axes.y,
    axes.z,
    governedProfile,
  );

  const resultPayload = {
    schema: FRAME_LOCAL_AXIS_RESULT_SCHEMA,
    policyId: FRAME_LOCAL_AXIS_POLICY_ID,
    profileId: governedProfile.profileId,
    profileSemanticHash: governedProfile.semanticHash,
    elementDirection: {
      delta: cleanVector(delta),
      length: clean(length),
    },
    inputReference: {
      vector: cleanVector(suppliedReference),
      norm: clean(inputNorm),
      parallelResidual,
      accepted: inputAccepted,
    },
    selectedReference,
    axes,
    verification,
    diagnostics,
  };
  const result = deepFreeze({
    ...resultPayload,
    semanticHash: computeFrameLocalAxisResultSemanticHash(resultPayload),
  });
  return verifyFrameLocalAxes(result, governedProfile);
}

function cloneCoordinate(value, label) {
  try {
    requireFiniteVector(value, label, 'FRAME_AXIS_NODE_COORDINATE_INVALID');
  } catch (error) {
    throw axisError('FRAME_AXIS_NODE_COORDINATE_INVALID', `${label} must be an array of exactly three finite values`);
  }
  return value.map(clean);
}

function cloneReference(value, profile) {
  try {
    requireFiniteVector(value, 'referenceVector', 'FRAME_AXIS_REFERENCE_INVALID');
  } catch (error) {
    throw axisError('FRAME_AXIS_REFERENCE_INVALID', 'referenceVector must be an array of exactly three finite values');
  }
  const output = value.map(clean);
  const norm = vectorNorm(output);
  if (!Number.isFinite(norm) || norm <= profile.referenceNormTolerance) {
    throw axisError('FRAME_AXIS_REFERENCE_INVALID', 'referenceVector norm is at or below referenceNormTolerance', {
      norm,
      referenceNormTolerance: profile.referenceNormTolerance,
    });
  }
  return output;
}

function selectFallback(localX, profile) {
  let selected = null;
  let tieResolved = false;
  for (let index = 0; index < profile.fallbackCandidates.length; index += 1) {
    const candidate = profile.fallbackCandidates[index];
    const normalized = normalize(candidate.vector, 'FRAME_AXIS_PROFILE_INVALID');
    const alignment = clean(Math.abs(dot(localX, normalized)));
    if (selected === null || alignment < selected.alignment) {
      selected = {
        candidateId: candidate.candidateId,
        vector: [...candidate.vector],
        alignment,
        normalized,
      };
      tieResolved = false;
    } else if (alignment === selected.alignment) {
      tieResolved = true;
    }
  }
  if (selected === null) throw axisError('FRAME_AXIS_FALLBACK_UNAVAILABLE', 'No fallback candidates are declared');
  const selectedResidual = vectorNorm(cross(localX, selected.normalized));
  if (selectedResidual <= profile.parallelTolerance) {
    throw axisError('FRAME_AXIS_FALLBACK_UNAVAILABLE', 'Every fallback candidate is parallel or near-parallel');
  }
  return { ...selected, tieResolved };
}

function normalize(vector, code) {
  const norm = vectorNorm(vector);
  if (!Number.isFinite(norm) || norm <= 0) throw axisError(code, 'Cannot normalize a zero or nonfinite vector');
  return cleanVector(scale(vector, 1 / norm));
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector, factor) {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
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

function info(code) {
  return { code, severity: 'INFO' };
}

function clean(value) {
  return normalizeFrameLocalAxisNumber(value);
}

function cleanVector(vector) {
  return vector.map(clean);
}
