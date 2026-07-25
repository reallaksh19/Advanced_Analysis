import { FORMULA_IDS } from './constants.js';
import { loadError, modelError } from './errors.js';
import { canonicalNumber, toleranceFor } from './numeric.js';
import { cross, dot, norm, normalize, scale, subtract, transformColumns, transformRows } from './vector-math.js';
export function createPipeLocalFrame(model) {
  const source = model.pipeCoordinateSystem;
  const profile = model.qualificationProfile;
  const eX = normalize(source.axialDirection.value, 'pipeCoordinateSystem.axialDirection');
  const radial = source.radialHint.value;
  const radialNorm = norm(radial);
  if (radialNorm === 0) throw modelError('ZERO_RADIAL_HINT', 'pipeCoordinateSystem.radialHint', 'Radial hint must be non-zero.');
  const projected = subtract(radial, scale(eX, dot(radial, eX)));
  const conditioning = canonicalNumber(norm(projected) / radialNorm, 'frame conditioning');
  if (conditioning <= profile.frameMinimumSine) {
    throw modelError('COLLINEAR_FRAME_HINTS', 'pipeCoordinateSystem.radialHint', 'Radial hint is collinear or near-collinear with axial direction.');
  }
  const eZ = normalize(projected, 'projected radial hint');
  const eY = normalize(cross(eZ, eX), 'circumferential direction');
  const yHint = normalize(source.circumferentialHint.value, 'circumferential hint');
  const yAlignment = canonicalNumber(dot(yHint, eY), 'circumferential alignment');
  if (yAlignment <= profile.handednessMinimumAlignment) {
    throw modelError('LEFT_HANDED_OR_INCONSISTENT_FRAME', 'pipeCoordinateSystem.circumferentialHint', 'Circumferential hint does not define the required right-handed frame.');
  }
  const handedness = canonicalNumber(dot(cross(eX, eY), eZ), 'handedness');
  const orthogonalityResidual = Math.max(Math.abs(dot(eX, eY)), Math.abs(dot(eY, eZ)), Math.abs(dot(eZ, eX)));
  const tolerance = toleranceFor(profile, 'dimensionless', 1, handedness);
  if (Math.abs(1 - handedness) > tolerance || orthogonalityResidual > tolerance) {
    throw modelError('FRAME_QUALIFICATION_FAILURE', 'pipeCoordinateSystem', 'Frame orthogonality or handedness did not qualify.');
  }
  const rotationGlobalToLocal = [eX, eY, eZ];
  return {
    identity: source.identity,
    originGlobal: source.origin.value,
    axesGlobal: { eX, eY, eZ },
    rotationGlobalToLocal,
    constructionRule: 'PROJECT_RADIAL_HINT_THEN_NORMALIZE_AND_SET_EY_EQUALS_EZ_CROSS_EX',
    conditioning,
    circumferentialHintAlignment: yAlignment,
    handedness,
    orthogonalityResidual: canonicalNumber(orthogonalityResidual, 'orthogonality residual'),
    tolerance,
    formulaIds: [FORMULA_IDS.BASIS_PROJECTION],
  };
}
export function globalToLocal(frame, vector) { return transformRows(frame.rotationGlobalToLocal, vector); }
export function localToGlobal(frame, vector) { return transformColumns(frame.rotationGlobalToLocal, vector); }
export function proveVectorRoundTrip(frame, vector, quantity, profile) {
  const local = globalToLocal(frame, vector);
  const reconstructed = localToGlobal(frame, local);
  const residual = reconstructed.map((value, index) => canonicalNumber(value - vector[index], `${quantity} residual`));
  const tolerance = toleranceFor(profile, quantity, ...vector, ...reconstructed);
  if (residual.some((value) => Math.abs(value) > tolerance)) {
    throw loadError('VECTOR_RECONSTRUCTION_FAILURE', quantity, `${quantity} reconstruction did not qualify.`);
  }
  return { local, reconstructed, residual, tolerance };
}
