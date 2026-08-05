import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import { elementDofIndex, elementMatrixIndex } from '../linear-fea-contract/conventions.js';
import { discretiseBend } from '../centerline-beam-fea/index.js';
import { checkDeclaredRadius, resolveBendArcCentre } from '../geometry/adapters/inputxml-bend-arc.js';
import {
  BEND_COMPLIANCE_METHOD,
  BEND_CONVERGENCE_SCHEMA,
  BEND_FORMULATION,
  DEGREES_TO_RADIANS,
  FLEXIBILITY_GUARD_ID,
  FLEXIBILITY_GUARD_METHOD,
  SEGMENTED_BEND_APPROXIMATION,
  USER_FACTOR_APPROXIMATION,
  approximation,
  fail,
  requireFinite,
  requirePositive,
} from './piping-component-contract.js';
import {
  applyBendingFlexibilityCorrection,
  asPoint,
  asVector,
  chainUnitLoadCompliance,
  componentElementEntry,
  cross,
  generateComponentElement,
  relativeDelta,
  subtract,
  uniformMomentCompliance,
  unit,
} from './component-elements.js';

/**
 * Bend/elbow component model (sections 3.4, 3.5, 4.3).
 *
 * The bend is a deterministic chain of B-3.1 straight elements along its arc,
 * with a caller-declared flexibility factor applied to bending rigidity under
 * `PIPE_BEND_CORRECTED_FRAME_V1`. The load-bearing property of the package
 * lives here: section 3.5 requires proof that flexibility is not counted both
 * in the geometry segmentation and in the component correction, and that proof
 * is a computation on the compiled matrices, not a comment.
 */

/* The `RZ` diagonal and its across-element coupling isolate pure bending. */
const RZ_I = elementDofIndex('I', 'RZ');
const RZ_J = elementDofIndex('J', 'RZ');

/**
 * Recover the bending rigidity `E I` a compiled element actually carries.
 *
 * For the frozen frame formulation the natural pure-bending stiffness is
 * `K[RZi][RZi] - K[RZi][RZj] = 2 E I / L`, and the shear parameter cancels
 * exactly, so this reads the same quantity under Euler-Bernoulli and under
 * Timoshenko. That is what makes it usable as a guard: it measures the
 * rigidity the assembled element will really use, rather than repeating the
 * number the caller declared.
 *
 * @param {Array<number>} localStiffness Flat 12x12 local stiffness.
 * @param {number} length Element length.
 * @returns {number} Measured `E I`.
 */
export function measurePureBendingRigidity(localStiffness, length) {
  const diagonal = requireFinite(
    localStiffness[elementMatrixIndex(RZ_I, RZ_I)],
    'localStiffness[RZI][RZI]',
    'PIPING_COMPONENT_STIFFNESS_INVALID',
  );
  const coupling = requireFinite(
    localStiffness[elementMatrixIndex(RZ_I, RZ_J)],
    'localStiffness[RZI][RZJ]',
    'PIPING_COMPONENT_STIFFNESS_INVALID',
  );
  return cleanNumber(((diagonal - coupling) * length) / 2);
}

/**
 * Deterministic arc subdivision under the declared subdivision profile
 * (section 3.5).
 *
 * Three declared rules compete and the strictest wins: the maximum central
 * angle per segment, the minimum element count, and twice the minimum number
 * of elements between the tangent and the mid-arc code station. The result is
 * then raised to an even count so the mid-arc station falls exactly on a node
 * rather than inside an element — a code point interpolated from the middle of
 * a chord would be a station this package invented.
 *
 * @param {number} sweepAngle Arc sweep in radians.
 * @param {Readonly<object>} policies Resolved declared policies.
 * @returns {Readonly<object>} Subdivision decision and its governing rule.
 */
export function resolveBendSubdivision(sweepAngle, policies) {
  const sweep = requirePositive(sweepAngle, 'arc.sweepAngle', 'PIPING_COMPONENT_BEND_ARC_DEGENERATE');
  const maximumSegmentAngle = policies.bendMaxAngleDegrees.value * DEGREES_TO_RADIANS;
  const byAngle = Math.ceil(sweep / maximumSegmentAngle);
  const byMinimum = policies.bendMinimumElements.value;
  const byStations = 2 * policies.bendMinimumElementsBetweenStations.value;
  const candidates = [
    { rule: 'MAX_CENTRAL_ANGLE', count: byAngle },
    { rule: 'MINIMUM_ELEMENTS', count: byMinimum },
    { rule: 'TANGENT_TO_MID_ARC_STATION_SEPARATION', count: byStations },
  ];
  const governing = candidates.reduce((best, entry) => (entry.count > best.count ? entry : best));
  const parityAdjusted = governing.count % 2 === 1;
  const elementCount = parityAdjusted ? governing.count + 1 : governing.count;
  return Object.freeze({
    elementCount,
    governingRule: governing.rule,
    parityAdjusted,
    parityRule: 'EVEN_COUNT_PLACES_MID_ARC_STATION_ON_A_NODE_V1',
    maximumSegmentAngle: cleanNumber(maximumSegmentAngle),
    segmentAngle: cleanNumber(sweep / elementCount),
    subdivisionPurpose: null,
    candidates: Object.freeze(candidates.map((entry) => Object.freeze({ ...entry }))),
    declared: Object.freeze({
      bendMaxAngleDegrees: policies.bendMaxAngleDegrees.value,
      bendMaxAngleDegreesSource: policies.bendMaxAngleDegrees.source,
      bendMinimumElements: policies.bendMinimumElements.value,
      bendMinimumElementsSource: policies.bendMinimumElements.source,
      bendMinimumElementsBetweenStations: policies.bendMinimumElementsBetweenStations.value,
      bendMinimumElementsBetweenStationsSource: policies.bendMinimumElementsBetweenStations.source,
    }),
  });
}

/**
 * Prove that bend flexibility is applied exactly once (section 3.5).
 *
 * Two independent quantities are measured and compared against the declaration:
 *
 *   geometricFlexibilityRatio  the compliance the arc segmentation already
 *                              carries, relative to a straight member drawn
 *                              tangent point to tangent point;
 *   appliedCorrectionRatio     the compliance the component correction adds,
 *                              read back out of the compiled element matrices.
 *
 * The guard refuses in both directions section 15.5 names. If the factor's own
 * basis says it already contains the arc geometry, then a segmented arc plus
 * that factor counts the curvature twice and the component is blocked. If the
 * correction measured on the matrices does not reproduce the declared factor,
 * the correction was omitted, applied twice, or applied to the wrong quantity,
 * and the component is blocked too.
 *
 * @returns {Readonly<object>} Guard evidence, hash-bound into the component.
 */
export function bendFlexibilityDoubleCountGuard({
  directChordLength,
  segmentedLength,
  arcLength,
  bendingRigidity,
  measuredUncorrectedRigidity,
  measuredCorrectedRigidity,
  declaredFactor,
  geometryBasis,
  tolerance,
  toleranceSource,
}) {
  const directCompliance = uniformMomentCompliance(directChordLength, bendingRigidity);
  const segmentedGeometricCompliance = uniformMomentCompliance(segmentedLength, bendingRigidity);
  const arcReferenceCompliance = uniformMomentCompliance(arcLength, bendingRigidity);
  const correctedSegmentedCompliance = uniformMomentCompliance(segmentedLength, measuredCorrectedRigidity);
  const geometricFlexibilityRatio = cleanNumber(segmentedGeometricCompliance / directCompliance);
  const appliedCorrectionRatio = cleanNumber(measuredUncorrectedRigidity / measuredCorrectedRigidity);
  const totalFlexibilityRatio = cleanNumber(correctedSegmentedCompliance / directCompliance);
  const expectedTotalFlexibilityRatio = cleanNumber(geometricFlexibilityRatio * appliedCorrectionRatio);
  const segmentationSurplus = cleanNumber(geometricFlexibilityRatio - 1);
  const correctionResidual = cleanNumber(
    Math.abs(appliedCorrectionRatio - declaredFactor) / Math.max(declaredFactor, 1),
  );
  const totalRatioIdentityResidual = cleanNumber(
    Math.abs(totalFlexibilityRatio - expectedTotalFlexibilityRatio)
      / Math.max(expectedTotalFlexibilityRatio, 1),
  );

  if (geometryBasis.endsWith('GEOMETRY_INCLUDED_V1') && segmentationSurplus > tolerance) {
    fail(
      `The declared factor basis ${geometryBasis} already contains the curved geometry, but the arc is also represented geometrically and contributes a further ${segmentationSurplus} of compliance; applying the factor here would count bend flexibility twice.`,
      'PIPING_COMPONENT_BEND_FLEXIBILITY_DOUBLE_COUNT',
    );
  }
  if (correctionResidual > tolerance) {
    const code = appliedCorrectionRatio < declaredFactor
      ? 'PIPING_COMPONENT_BEND_FLEXIBILITY_OMITTED'
      : 'PIPING_COMPONENT_BEND_FLEXIBILITY_DOUBLE_COUNT';
    fail(
      `The bending rigidity measured on the compiled elements reproduces a flexibility correction of ${appliedCorrectionRatio}, not the declared ${declaredFactor}; the component correction is not applied exactly once.`,
      code,
    );
  }
  if (totalRatioIdentityResidual > tolerance) {
    fail(
      `The total chord-referenced flexibility ratio ${totalFlexibilityRatio} does not equal the independent geometry ratio ${geometricFlexibilityRatio} multiplied by the applied matrix correction ${appliedCorrectionRatio}.`,
      'PIPING_COMPONENT_BEND_FLEXIBILITY_EVIDENCE_INCONSISTENT',
    );
  }

  return Object.freeze({
    guardId: FLEXIBILITY_GUARD_ID,
    method: FLEXIBILITY_GUARD_METHOD,
    geometryBasis,
    declaredFactor,
    directChordLength: cleanNumber(directChordLength),
    segmentedLength: cleanNumber(segmentedLength),
    arcLength: cleanNumber(arcLength),
    directCompliance,
    segmentedGeometricCompliance,
    arcReferenceCompliance,
    correctedSegmentedCompliance,
    geometricFlexibilityRatio,
    segmentationSurplus,
    appliedCorrectionRatio,
    correctionResidual,
    declaredFactorApplicationBasis: 'DEVELOPED_ARC_ELEMENT_BENDING_RIGIDITY_V1',
    totalFlexibilityRatio,
    totalFlexibilityReferenceBasis: 'DIRECT_TANGENT_CHORD_COMPLIANCE_V1',
    totalFlexibilityIdentity: 'TOTAL_EQUALS_GEOMETRIC_RATIO_TIMES_APPLIED_CORRECTION_V1',
    expectedTotalFlexibilityRatio,
    totalRatioIdentityResidual,
    tolerance,
    toleranceSource,
    accepted: true,
  });
}

function arcChain(tangentStart, tangentEnd, centre, elementCount) {
  const discretised = discretiseBend(asPoint(tangentStart), asPoint(tangentEnd), asPoint(centre), elementCount);
  return {
    points: discretised.points.map(asVector),
    arcLength: discretised.arcLength,
    chordLength: discretised.chordLength,
    lengthErrorFraction: discretised.lengthErrorFraction,
    radius: discretised.radius,
    sweepAngle: discretised.sweepAngle,
  };
}

/**
 * Compare the bend against a finer arc subdivision (section 3.5 convergence
 * profile).
 *
 * The comparison is a cantilevered unit-load chain: fixed at the first tangent
 * point, loaded in plane at the second. Tip displacement, fixed-end moment and
 * developed length are reported at the declared subdivision and at the refined
 * one. The fixed-end moment is statically determinate and therefore converged
 * by construction — it is reported anyway, because a subdivision change that
 * moved it would mean the arc itself had moved.
 *
 * @returns {Readonly<object>} `fea-linear-bend-convergence-report/v1`.
 */
export function evaluateBendSubdivisionConvergence({
  tangentStart,
  tangentEnd,
  centre,
  elementCount,
  bendingRigidity,
  planeNormal,
  policies,
}) {
  const refinementFactor = policies.bendConvergenceRefinementFactor.value;
  const refinedCount = elementCount * refinementFactor;
  const chord = subtract(asPoint(tangentEnd), asPoint(tangentStart));
  const loadDirection = asVector(unit(cross(asPoint(planeNormal), chord), 'bend in-plane load direction'));

  const level = (count) => {
    const chain = arcChain(tangentStart, tangentEnd, centre, count);
    const response = chainUnitLoadCompliance(chain.points, bendingRigidity, loadDirection, planeNormal);
    return Object.freeze({
      elementCount: count,
      tipDisplacement: response.compliance,
      fixedEndMoment: response.fixedEndMoment,
      developedLength: response.developedLength,
      lengthErrorFraction: chain.lengthErrorFraction,
    });
  };

  const base = level(elementCount);
  const refined = level(refinedCount);
  const displacementRelativeDelta = relativeDelta(base.tipDisplacement, refined.tipDisplacement);
  const endMomentRelativeDelta = relativeDelta(base.fixedEndMoment, refined.fixedEndMoment);
  const developedLengthRelativeDelta = relativeDelta(base.developedLength, refined.developedLength);
  const tolerance = policies.convergenceRelativeTolerance.value;
  return Object.freeze({
    schema: BEND_CONVERGENCE_SCHEMA,
    method: BEND_COMPLIANCE_METHOD,
    refinementFactor,
    refinementFactorSource: policies.bendConvergenceRefinementFactor.source,
    loadDirection: Object.freeze([...loadDirection]),
    base,
    refined,
    displacementRelativeDelta,
    endMomentRelativeDelta,
    developedLengthRelativeDelta,
    tolerance,
    toleranceSource: policies.convergenceRelativeTolerance.source,
    accepted: displacementRelativeDelta <= tolerance
      && endMomentRelativeDelta <= tolerance
      && developedLengthRelativeDelta <= tolerance,
  });
}

/**
 * Compile one bend/elbow into its element chain, code stations, flexibility
 * evidence and disclosures.
 *
 * @param {object} input Bend component input.
 * @param {Readonly<object>} context Accepted profile, policies and factor set.
 * @returns {object} Draft component payload for sealing.
 */
export function buildBendComponent(input, context) {
  const { profile, policies, factorSet, applicability } = context;

  /*
   * Section 3.5 hash-binds the pressure-stiffening rule. The rule and the
   * factor set must agree: a profile that excludes pressure stiffening cannot
   * consume a pressure-corrected factor, and a profile that relies on one
   * cannot consume a factor that has no pressure basis. Either mismatch is a
   * modelling conflict, not something to resolve in one direction.
   */
  const pressureExpected = profile.bendPressureStiffeningRule === 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1';
  if (factorSet.pressureCorrectionApplied !== pressureExpected) {
    fail(
      `profile.bendPressureStiffeningRule is ${profile.bendPressureStiffeningRule} but the factor set declares pressureCorrectionApplied=${factorSet.pressureCorrectionApplied}.`,
      'PIPING_COMPONENT_PRESSURE_STIFFENING_RULE_MISMATCH',
    );
  }

  const arc = input.arc;
  const resolved = resolveBendArcCentre(asPoint(arc.incomingDirection), asPoint(arc.tangentStart), asPoint(arc.tangentEnd));
  if (resolved === null) {
    fail(
      'The bend tangent points, radius and sweep do not define a unique finite arc.',
      'PIPING_COMPONENT_BEND_ARC_DEGENERATE',
    );
  }
  const radiusCheck = checkDeclaredRadius(
    resolved.computedRadius,
    arc.declaredRadius,
    policies.bendRadiusRelativeTolerance.value,
  );
  if (!radiusCheck.accepted) {
    fail(
      `The declared bend radius ${arc.declaredRadius} disagrees with the radius ${resolved.computedRadius} implied by the tangent geometry (relative deviation ${radiusCheck.relativeDeviation}).`,
      'PIPING_COMPONENT_BEND_RADIUS_CONFLICT',
    );
  }

  const centre = asVector(resolved.centre);
  const startRadial = subtract(asPoint(arc.tangentStart), resolved.centre);
  const endRadial = subtract(asPoint(arc.tangentEnd), resolved.centre);
  const planeNormal = asVector(unit(cross(startRadial, endRadial), 'bend plane normal'));

  const subdivision = {
    ...resolveBendSubdivision(resolved.sweepAngle, policies),
    subdivisionPurpose: profile.bendSubdivisionPurpose,
  };
  const chain = arcChain(arc.tangentStart, arc.tangentEnd, centre, subdivision.elementCount);
  const referenceVector = input.referenceVector === null ? planeNormal : input.referenceVector;
  const referenceVectorRule = input.referenceVector === null ? 'BEND_PLANE_NORMAL_V1' : 'DECLARED_V1';

  const declaredFactor = factorSet.flexibilityFactor.value;
  const elements = [];
  for (let index = 0; index < subdivision.elementCount; index += 1) {
    const frameElement = generateComponentElement({
      elementId: `${input.componentId}.E${index + 1}`,
      nodeI: chain.points[index],
      nodeJ: chain.points[index + 1],
      referenceVector,
      material: input.material,
      section: input.section,
      frameElementProfile: input.frameElementProfile,
      localAxisProfile: input.localAxisProfile,
    });
    const correction = applyBendingFlexibilityCorrection(frameElement, declaredFactor);
    elements.push(componentElementEntry(index, 'BEND_ARC_SEGMENT', frameElement, correction));
  }

  const first = elements[0];
  const measuredUncorrectedRigidity = measurePureBendingRigidity(
    first.frameElement.localStiffness,
    first.frameElement.geometry.length,
  );
  const measuredCorrectedRigidity = measurePureBendingRigidity(
    first.stiffnessCorrection.localStiffness,
    first.frameElement.geometry.length,
  );
  const directChordLength = cleanNumber(
    Math.hypot(
      arc.tangentEnd[0] - arc.tangentStart[0],
      arc.tangentEnd[1] - arc.tangentStart[1],
      arc.tangentEnd[2] - arc.tangentStart[2],
    ),
  );
  const doubleCountGuard = bendFlexibilityDoubleCountGuard({
    directChordLength,
    segmentedLength: chain.chordLength,
    arcLength: chain.arcLength,
    bendingRigidity: first.frameElement.material.elasticModulus * first.frameElement.section.secondMomentZ,
    measuredUncorrectedRigidity,
    measuredCorrectedRigidity,
    declaredFactor,
    geometryBasis: factorSet.flexibilityGeometryBasis,
    tolerance: policies.flexibilityDoubleCountTolerance.value,
    toleranceSource: policies.flexibilityDoubleCountTolerance.source,
  });

  const convergence = evaluateBendSubdivisionConvergence({
    tangentStart: arc.tangentStart,
    tangentEnd: arc.tangentEnd,
    centre,
    elementCount: subdivision.elementCount,
    bendingRigidity: first.frameElement.material.elasticModulus * first.frameElement.section.secondMomentZ,
    planeNormal,
    policies,
  });

  const midIndex = subdivision.elementCount / 2;
  const codeStations = [
    { kind: 'BEND_TANGENT_START', index: 0, arcFraction: 0 },
    { kind: 'BEND_MID_ARC', index: midIndex, arcFraction: 0.5 },
    { kind: 'BEND_TANGENT_END', index: subdivision.elementCount, arcFraction: 1 },
  ].map((station) => ({
    stationId: `${input.componentId}.CP${station.index}`,
    kind: station.kind,
    nodeId: `${input.componentId}.N${station.index}`,
    position: [...chain.points[station.index]],
    arcFraction: station.arcFraction,
  }));

  /*
   * Section 11: the segmented bend is an approximation whose status depends on
   * the convergence evidence. When the profile requires convergence and the
   * comparison does not meet the declared tolerance, the disclosure is
   * UNRESOLVED, which section 11.1 defines as blocking — the bend is not
   * quietly accepted with a finer mesh recommended in prose.
   */
  const approximations = [
    approximation(
      SEGMENTED_BEND_APPROXIMATION,
      'SEGMENTED_BEND',
      profile.convergenceRequired
        ? (convergence.accepted ? 'ACCEPTED' : 'UNRESOLVED')
        : 'CONDITIONAL',
      true,
      'The curved centreline is represented by straight elements along the arc under the declared subdivision profile; ovalization and local shell flexibility enter only through the declared component flexibility factor.',
      {
        elementCount: subdivision.elementCount,
        segmentAngle: subdivision.segmentAngle,
        subdivisionPurpose: profile.bendSubdivisionPurpose,
        pressureStiffeningRule: profile.bendPressureStiffeningRule,
        convergenceRequired: profile.convergenceRequired,
        convergenceAccepted: convergence.accepted,
        lengthErrorFraction: chain.lengthErrorFraction,
      },
    ),
  ];
  if (factorSet.userOverride !== null) {
    approximations.push(approximation(
      USER_FACTOR_APPROXIMATION,
      'CODE_SIF_METHOD',
      'CONDITIONAL',
      true,
      'The applied flexibility factor is a user override rather than a factor taken directly from the declared edition; the override carries its own reason, source, revision and approver.',
      { ...factorSet.userOverride, factorSetId: factorSet.factorSetId },
    ));
  }

  return {
    componentType: 'BEND',
    formulationId: BEND_FORMULATION,
    geometry: {
      tangentStart: [...arc.tangentStart],
      tangentEnd: [...arc.tangentEnd],
      incomingDirection: [...arc.incomingDirection],
      centre: [...centre],
      planeNormal: [...planeNormal],
      radius: chain.radius,
      declaredRadius: arc.declaredRadius,
      radiusRelativeDeviation: radiusCheck.relativeDeviation,
      sweepAngle: chain.sweepAngle,
      arcLength: chain.arcLength,
      chordChainLength: chain.chordLength,
      directChordLength,
      lengthErrorFraction: chain.lengthErrorFraction,
      referenceVectorRule,
      referenceVector: [...referenceVector],
    },
    subdivision,
    elements,
    kinematicRelations: [],
    codeStations,
    massProperties: null,
    sectionMapping: null,
    endConnections: null,
    classification: null,
    flexibility: {
      factorSetId: factorSet.factorSetId,
      factorSetSemanticHash: factorSet.semanticHash,
      sourceIdentity: { ...factorSet.sourceIdentity },
      applicability,
      factor: declaredFactor,
      factorSource: factorSet.flexibilityFactor.source,
      geometryBasis: factorSet.flexibilityGeometryBasis,
      pressureStiffeningRule: profile.bendPressureStiffeningRule,
      pressureBasis: factorSet.pressureBasis,
      appliedTo: ['BENDING_Y', 'BENDING_Z'],
      measuredUncorrectedRigidity,
      measuredCorrectedRigidity,
      doubleCountGuard,
    },
    convergence,
    approximations,
  };
}
