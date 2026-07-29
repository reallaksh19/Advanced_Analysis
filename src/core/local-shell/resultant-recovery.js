import { matrixVector } from './matrix.js';
import { surfaceStressEquivalents } from './surface-stress.js';

/**
 * Membrane and bending resultant recovery — LAFEA S-4.
 *
 * A shell element already computes stress resultants directly: membrane forces
 * from the CST part, bending moments from the DKT part. This module reads
 * those resultants from evidence `src/core/local-shell/` already produces
 * (`meshEvidence.elements[].membraneConstitutiveMatrix` /
 * `.bendingConstitutiveMatrix`, and each load case's recovered
 * `membraneStrain` / integration-point `curvature`) and reports them. It does
 * not touch the DKT or CST formulation, and it does not re-derive strain or
 * curvature: every function here is a matrix-vector product against an
 * already-computed matrix and an already-recovered strain or curvature
 * vector, or a direct read of an already-recovered stress.
 *
 * Deliberately NOT provided: per-node values. The kernel declares
 * `NO_NODAL_STRESS`, `NO_STRESS_EXTRAPOLATION` and
 * `NO_STRESS_AVERAGING_OR_SMOOTHING` in `BASE_LIMITATIONS`
 * (`src/core/local-shell/constants.js`) — producing a nodal value from
 * per-element, per-integration-point resultants would require exactly the
 * extrapolation or averaging those limitations forbid. Reporting stays at the
 * finest resolution the kernel itself supports: per element, per DKT
 * integration point, per surface.
 */

export const RESULTANT_FORMULA_IDS = Object.freeze({
  MEMBRANE_RESULTANT: 'LAFEA4.MEMBRANE_FORCE_RESULTANT_N_EQUALS_Dt_EPSILON/v1',
  BENDING_RESULTANT: 'LAFEA4.BENDING_MOMENT_RESULTANT_M_EQUALS_Dtcubed_KAPPA/v1',
});

/**
 * Membrane force resultants `N_xx, N_yy, N_xy` for one element, in the
 * element's declared local basis, plus the membrane stress and both
 * invariants the kernel already recovered for it.
 *
 * `membraneConstitutiveMatrix` is `D * t` (built once per element by
 * `constitutiveEvidence` in `./element.js`); `membraneStrain` is the strain
 * `./recovery.js` already recovered from the solved displacement. Their
 * product is the resultant — no independent computation path.
 *
 * @param {object} meshElement Entry from `result.meshEvidence.elements`.
 * @param {object} elementResult Entry from a load case's `elementResults`.
 * @returns {Readonly<object>} N resultants, thickness, membrane stress and invariants.
 */
export function membraneResultant(meshElement, elementResult) {
  requireSameElement(meshElement, elementResult);
  const strain = [
    elementResult.membraneStrain.epsilonX,
    elementResult.membraneStrain.epsilonY,
    elementResult.membraneStrain.gammaXY,
  ];
  const [Nxx, Nyy, Nxy] = matrixVector(meshElement.membraneConstitutiveMatrix, strain);
  const stress = elementResult.membraneStress;
  return Object.freeze({
    elementId: meshElement.elementId,
    thickness: meshElement.thickness,
    Nxx,
    Nyy,
    Nxy,
    membraneStress: stress,
    membraneStressEquivalents: surfaceStressEquivalents(stress.sigmaX, stress.sigmaY, stress.tauXY),
    formulaIds: Object.freeze([RESULTANT_FORMULA_IDS.MEMBRANE_RESULTANT]),
  });
}

/**
 * Bending moment resultants `M_xx, M_yy, M_xy` at one DKT integration point.
 *
 * `bendingConstitutiveMatrix` is `D * t^3 / 12`; `curvature` is what
 * `./recovery.js` already recovered at this point from the bending B-matrix
 * `./dkt.js` already built. Their product is the resultant.
 *
 * @param {object} meshElement Entry from `result.meshEvidence.elements`.
 * @param {object} elementResult Entry from a load case's `elementResults`.
 * @param {number} integrationPointIndex Index into `elementResult.integrationPoints`.
 * @returns {Readonly<object>} M resultants, thickness and the integration point identity.
 */
export function bendingResultant(meshElement, elementResult, integrationPointIndex) {
  requireSameElement(meshElement, elementResult);
  const point = elementResult.integrationPoints[integrationPointIndex];
  if (!point) {
    throw new RangeError(`Element ${meshElement.elementId} has no integration point at index ${integrationPointIndex}`);
  }
  const curvature = [point.curvature.kappaX, point.curvature.kappaY, point.curvature.kappaXY];
  const [Mxx, Myy, Mxy] = matrixVector(meshElement.bendingConstitutiveMatrix, curvature);
  return Object.freeze({
    elementId: meshElement.elementId,
    integrationPointId: point.integrationPointId,
    thickness: meshElement.thickness,
    Mxx,
    Myy,
    Mxy,
    formulaIds: Object.freeze([RESULTANT_FORMULA_IDS.BENDING_RESULTANT]),
  });
}

/**
 * Membrane, bending and combined surface stress tensors at one DKT
 * integration point and one fixed surface (`BOTTOM`, `MIDSURFACE` or `TOP`),
 * each with both invariants.
 *
 * All three stress tensors are read directly from
 * `elementResult.integrationPoints[i].surfaces[]`, which `./recovery.js`
 * already computed. Nothing here recomputes a stress; `surfaceStressEquivalents`
 * is applied to each tensor to add the invariants LAFEA S-4 requires but the
 * kernel does not itself expose for the membrane- and bending-only tensors
 * (only the combined tensor carries invariants in the base kernel result).
 *
 * @param {object} meshElement Entry from `result.meshEvidence.elements`.
 * @param {object} elementResult Entry from a load case's `elementResults`.
 * @param {number} integrationPointIndex Index into `elementResult.integrationPoints`.
 * @param {'BOTTOM'|'MIDSURFACE'|'TOP'} surfaceName Fixed surface identity.
 * @returns {Readonly<object>} Membrane, bending and surface stress with invariants.
 */
export function surfaceResultant(meshElement, elementResult, integrationPointIndex, surfaceName) {
  requireSameElement(meshElement, elementResult);
  const point = elementResult.integrationPoints[integrationPointIndex];
  if (!point) {
    throw new RangeError(`Element ${meshElement.elementId} has no integration point at index ${integrationPointIndex}`);
  }
  const surface = point.surfaces.find((item) => item.surface === surfaceName);
  if (!surface) {
    throw new RangeError(`Element ${meshElement.elementId} integration point ${point.integrationPointId} has no surface ${surfaceName}`);
  }
  return Object.freeze({
    elementId: meshElement.elementId,
    integrationPointId: point.integrationPointId,
    surface: surface.surface,
    z: surface.z,
    thickness: meshElement.thickness,
    membraneStress: surface.membraneStress,
    membraneStressEquivalents: surfaceStressEquivalents(surface.membraneStress.sigmaX, surface.membraneStress.sigmaY, surface.membraneStress.tauXY),
    bendingStress: surface.bendingStress,
    bendingStressEquivalents: surfaceStressEquivalents(surface.bendingStress.sigmaX, surface.bendingStress.sigmaY, surface.bendingStress.tauXY),
    surfaceStress: surface.combinedStress,
    surfaceStressEquivalents: surfaceStressEquivalents(surface.combinedStress.sigmaX, surface.combinedStress.sigmaY, surface.combinedStress.tauXY),
    formulaIds: Object.freeze([RESULTANT_FORMULA_IDS.MEMBRANE_RESULTANT, RESULTANT_FORMULA_IDS.BENDING_RESULTANT]),
  });
}

/**
 * Full resultant recovery for one accepted `calculateLocalShell` result: every
 * element, every DKT integration point, every fixed surface, for every load
 * case.
 *
 * @param {Readonly<object>} result Accepted output of `calculateLocalShell`.
 * @returns {Readonly<object[]>} One record per load case.
 */
export function recoverShellResultants(result) {
  if (!result || result.qualification?.accepted !== true) {
    throw new TypeError('recoverShellResultants requires an accepted local-shell result');
  }
  const elementIndex = new Map(result.meshEvidence.elements.map((element) => [element.elementId, element]));
  return Object.freeze(result.loadCaseResults.map((loadCase) => Object.freeze({
    loadCaseId: loadCase.loadCaseId,
    elementResultants: Object.freeze(loadCase.elementResults.map((elementResult) => recoverElementResultants(
      elementIndex.get(elementResult.elementId),
      elementResult,
    ))),
  })));
}

function recoverElementResultants(meshElement, elementResult) {
  return Object.freeze({
    elementId: elementResult.elementId,
    thickness: meshElement.thickness,
    membrane: membraneResultant(meshElement, elementResult),
    integrationPoints: Object.freeze(elementResult.integrationPoints.map((point, pointIndex) => Object.freeze({
      integrationPointId: point.integrationPointId,
      bending: bendingResultant(meshElement, elementResult, pointIndex),
      surfaces: Object.freeze(point.surfaces.map((surface) => surfaceResultant(meshElement, elementResult, pointIndex, surface.surface))),
    }))),
  });
}

function requireSameElement(meshElement, elementResult) {
  if (!meshElement || meshElement.elementId !== elementResult.elementId) {
    throw new TypeError(`Mesh evidence element does not match result element ${elementResult?.elementId}`);
  }
}
