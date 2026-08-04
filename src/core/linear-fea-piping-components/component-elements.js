import { cross, dot, norm, scale, subtract, toArray } from '../shared-analysis-contract/vector3.js';
import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import { resolveFrameLocalAxesForSpanChain } from '../centerline-beam-fea/index.js';
import {
  compileFrameElement,
  frameLocalStiffness,
  transformStiffnessToGlobal,
} from '../linear-fea-frame-element/index.js';
import { fail, requireFinite, requirePositive } from './piping-component-contract.js';

/**
 * Element generation and stiffness correction shared by every component model.
 *
 * Nothing here derives a stiffness matrix. Every element is compiled by the
 * B-3.1 straight-element package, and every corrected matrix is produced by
 * calling that same package's `frameLocalStiffness` with modified section
 * rigidities — the flexibility correction is a change of input to the frozen
 * formulation, never a second formulation.
 */

export function asPoint(vector) {
  return { x: vector[0], y: vector[1], z: vector[2] };
}

export function asVector(point) {
  return toArray(point);
}

export function unit(point, field) {
  const length = norm(point);
  if (!(length > 0)) fail(`${field} must have non-zero length.`, 'PIPING_COMPONENT_GEOMETRY_DEGENERATE');
  return scale(point, 1 / length);
}

/**
 * Compile one straight span of a component through B-3.1.
 *
 * Component spans carry no releases, no end springs, no rigid offsets and no
 * load primitives: a component that needed an end condition would be hiding a
 * second mechanism inside a fitting, and equivalent loads belong to the load
 * compiler. Any of them arriving here is refused rather than dropped.
 */
export function generateComponentElement({
  elementId,
  nodeI,
  nodeJ,
  referenceVector,
  material,
  section,
  frameElementProfile,
  localAxisProfile,
}) {
  const [axes] = resolveFrameLocalAxesForSpanChain({
    points: [nodeI, nodeJ],
    referenceVector,
    profile: localAxisProfile,
  });
  return compileFrameElement({
    elementId,
    material,
    section,
    localAxes: { result: axes, profile: localAxisProfile },
    profile: frameElementProfile,
    distributedLoads: [],
    temperature: null,
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  });
}

function rigidityInputs(frameElement) {
  return {
    elasticModulus: frameElement.material.elasticModulus,
    shearModulus: frameElement.material.shearModulus,
    area: frameElement.section.area,
    secondMomentY: frameElement.section.secondMomentY,
    secondMomentZ: frameElement.section.secondMomentZ,
    polarMoment: frameElement.section.polarMoment,
    length: frameElement.geometry.length,
    shearDeformation: frameElement.shearDeformation,
    shearCorrectionFactorY: frameElement.shearCorrection === null
      ? undefined
      : frameElement.shearCorrection.y.value,
    shearCorrectionFactorZ: frameElement.shearCorrection === null
      ? undefined
      : frameElement.shearCorrection.z.value,
  };
}

function correctedStiffness(frameElement, overrides) {
  const local = frameLocalStiffness({ ...rigidityInputs(frameElement), ...overrides }).matrix;
  return {
    local,
    global: transformStiffnessToGlobal(local, frameElement.transformation.matrix),
  };
}

/**
 * Apply a component flexibility factor to one element's bending stiffness
 * (section 4.3 bend/elbow: corrected beam flexibility).
 *
 * The factor divides the bending rigidity, so the element's bending compliance
 * is multiplied by exactly the declared factor. It touches neither axial nor
 * torsional rigidity, because a bend flexibility factor is a bending quantity
 * and silently widening its reach would be a second, undeclared approximation.
 *
 * @param {Readonly<object>} frameElement Sealed B-3.1 element record.
 * @param {number} factor Declared flexibility factor.
 * @returns {Readonly<object>} Correction evidence and corrected matrices.
 */
export function applyBendingFlexibilityCorrection(frameElement, factor) {
  const value = requirePositive(factor, 'flexibilityFactor', 'PIPING_COMPONENT_FACTOR_SET_INVALID');
  const matrices = correctedStiffness(frameElement, {
    secondMomentY: frameElement.section.secondMomentY / value,
    secondMomentZ: frameElement.section.secondMomentZ / value,
  });
  return Object.freeze({
    kind: 'BENDING_FLEXIBILITY_CORRECTION_V1',
    factor: value,
    appliedTo: Object.freeze(['BENDING_Y', 'BENDING_Z']),
    localStiffness: matrices.local,
    globalStiffness: matrices.global,
  });
}

/**
 * Represent a valve or flange body as a stiffened finite-length member
 * (section 4.3 valve/flange: rigid or semi-rigid body).
 *
 * The body keeps its real length, and its rigidities are multiplied by the
 * declared multiplier. It is never collapsed to a zero-length lump here; that
 * choice belongs to the profile and is refused unless explicitly selected.
 */
export function applyBodyRigidityMultiplier(frameElement, multiplier) {
  const value = requirePositive(multiplier, 'rigidBodyStiffnessMultiplier', 'PIPING_COMPONENT_PROFILE_INVALID');
  const matrices = correctedStiffness(frameElement, {
    area: frameElement.section.area * value,
    secondMomentY: frameElement.section.secondMomentY * value,
    secondMomentZ: frameElement.section.secondMomentZ * value,
    polarMoment: frameElement.section.polarMoment * value,
  });
  return Object.freeze({
    kind: 'BODY_RIGIDITY_MULTIPLIER_V1',
    factor: value,
    appliedTo: Object.freeze(['AXIAL', 'TORSION', 'BENDING_Y', 'BENDING_Z']),
    localStiffness: matrices.local,
    globalStiffness: matrices.global,
  });
}

/**
 * Reproduce CAESAR II's finite rigid-element stiffness without changing the
 * physical pipe section carried by gravity, pressure, or code recovery.
 *
 * CAESAR retains the entered inside diameter and evaluates the rigid member
 * with ten times the entered wall thickness.  The resulting annulus controls
 * axial, torsional, and bending stiffness only; the source section remains the
 * mass/pressure authority.  This explicit geometry rule avoids the unrelated
 * scalar multiplier formerly used by the BM1 benchmark.
 */
export function applyCaesarRigidSectionCorrection(frameElement, sectionResolution) {
  const dimensions = sectionResolution?.dimensions;
  const outerDiameter = requirePositive(
    dimensions?.outerDiameter,
    'section.dimensions.outerDiameter',
    'PIPING_COMPONENT_SECTION_INVALID',
  );
  const wallThickness = requirePositive(
    dimensions?.wallThickness,
    'section.dimensions.wallThickness',
    'PIPING_COMPONENT_SECTION_INVALID',
  );
  const innerDiameter = outerDiameter - 2 * wallThickness;
  if (!(innerDiameter > 0)) {
    fail(
      'CAESAR rigid-section correction requires a positive retained inside diameter.',
      'PIPING_COMPONENT_SECTION_INVALID',
    );
  }
  const effectiveWallThickness = 10 * wallThickness;
  const effectiveOuterDiameter = innerDiameter + 2 * effectiveWallThickness;
  const area = Math.PI * (effectiveOuterDiameter ** 2 - innerDiameter ** 2) / 4;
  const secondMoment = Math.PI * (effectiveOuterDiameter ** 4 - innerDiameter ** 4) / 64;
  const polarMoment = 2 * secondMoment;
  const matrices = correctedStiffness(frameElement, {
    area,
    secondMomentY: secondMoment,
    secondMomentZ: secondMoment,
    polarMoment,
  });
  return Object.freeze({
    kind: 'CAESAR_RIGID_SECTION_CORRECTION_V1',
    rule: 'RETAIN_INSIDE_DIAMETER_TEN_TIMES_WALL_V1',
    appliedTo: Object.freeze(['AXIAL', 'TORSION', 'BENDING_Y', 'BENDING_Z']),
    sourceDimensions: Object.freeze({ outerDiameter, innerDiameter, wallThickness }),
    effectiveDimensions: Object.freeze({
      outerDiameter: effectiveOuterDiameter,
      innerDiameter,
      wallThickness: effectiveWallThickness,
    }),
    effectiveSection: Object.freeze({ area, secondMomentY: secondMoment, secondMomentZ: secondMoment, polarMoment }),
    localStiffness: matrices.local,
    globalStiffness: matrices.global,
  });
}

export function componentElementEntry(index, role, frameElement, stiffnessCorrection) {
  return {
    index,
    elementId: frameElement.elementId,
    role,
    frameElement,
    stiffnessCorrection,
    effectiveLocalStiffness: stiffnessCorrection === null
      ? frameElement.localStiffness
      : stiffnessCorrection.localStiffness,
    effectiveGlobalStiffness: stiffnessCorrection === null
      ? frameElement.globalStiffness
      : stiffnessCorrection.globalStiffness,
  };
}

/**
 * Bending compliance of a member chain under a constant unit moment
 * (`UNIT_MOMENT_BENDING_COMPLIANCE_V1`).
 *
 * Under a constant moment the internal moment is unity everywhere, so virtual
 * work reduces to the sum of `L / EI` over the chain. This is the compliance
 * measure the double-count guard uses, because it isolates exactly what arc
 * segmentation contributes — developed length — from what a component factor
 * contributes — reduced rigidity.
 *
 * @param {number} developedLength Sum of member lengths along the chain.
 * @param {number} bendingRigidity `E * I`.
 * @returns {number} Rotational compliance.
 */
export function uniformMomentCompliance(developedLength, bendingRigidity) {
  const length = requirePositive(developedLength, 'developedLength', 'PIPING_COMPONENT_GEOMETRY_DEGENERATE');
  const rigidity = requirePositive(bendingRigidity, 'bendingRigidity', 'PIPING_COMPONENT_GEOMETRY_DEGENERATE');
  return cleanNumber(length / rigidity);
}

/* Two-point Gauss is exact for the quadratic M^2 of a straight member. */
const GAUSS_ABSCISSA = 1 / Math.sqrt(3);

/**
 * Tip bending compliance of a cantilevered chord chain under a unit tip force
 * (`CHAIN_UNIT_LOAD_BENDING_COMPLIANCE_V1`).
 *
 * The chain is fixed at its first point and loaded at its last with a unit
 * force along `loadDirection`. The internal moment about the arc plane normal
 * at a station `p` is `((pEnd - p) x f) . n`, and virtual work with the same
 * unit load gives the tip deflection as the integral of `M^2 / EI`.
 *
 * This is component evidence — the convergence and double-count report — and
 * not the analysis stiffness. The analysis stiffness is the compiled B-3.1
 * element chain; this scalar exists so a reviewer can see the arc converging.
 *
 * @param {Array<Array<number>>} points Chain points in order.
 * @param {number} bendingRigidity `E * I`.
 * @param {Array<number>} loadDirection Unit load direction.
 * @param {Array<number>} planeNormal Unit arc-plane normal.
 * @returns {{compliance:number, fixedEndMoment:number, developedLength:number}}
 */
export function chainUnitLoadCompliance(points, bendingRigidity, loadDirection, planeNormal) {
  const rigidity = requirePositive(bendingRigidity, 'bendingRigidity', 'PIPING_COMPONENT_GEOMETRY_DEGENERATE');
  const force = asPoint(loadDirection);
  const normal = asPoint(planeNormal);
  const tip = asPoint(points[points.length - 1]);
  const momentAt = (station) => dot(cross(subtract(tip, station), force), normal);
  let compliance = 0;
  let developedLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = asPoint(points[index - 1]);
    const end = asPoint(points[index]);
    const span = subtract(end, start);
    const length = norm(span);
    developedLength += length;
    for (const sign of [-GAUSS_ABSCISSA, GAUSS_ABSCISSA]) {
      const parameter = 0.5 * (1 + sign);
      const station = {
        x: start.x + span.x * parameter,
        y: start.y + span.y * parameter,
        z: start.z + span.z * parameter,
      };
      const moment = momentAt(station);
      compliance += ((moment * moment) / rigidity) * (length / 2);
    }
  }
  return {
    compliance: cleanNumber(compliance),
    fixedEndMoment: cleanNumber(momentAt(asPoint(points[0]))),
    developedLength: cleanNumber(developedLength),
  };
}

export function relativeDelta(coarse, fine) {
  const scaleValue = Math.max(Math.abs(fine), Math.abs(coarse), Number.MIN_VALUE);
  return cleanNumber(Math.abs(coarse - fine) / scaleValue);
}

export function chainDevelopedLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += norm(subtract(asPoint(points[index]), asPoint(points[index - 1])));
  }
  return cleanNumber(requireFinite(total, 'developedLength', 'PIPING_COMPONENT_GEOMETRY_DEGENERATE'));
}

export { cross, dot, norm, scale, subtract };
