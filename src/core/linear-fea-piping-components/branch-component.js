import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import {
  BRANCH_CLASSIFICATION_RULE,
  BRANCH_FLEXIBILITY_APPROXIMATION,
  BRANCH_FLEXIBILITY_GUARD_ID,
  USER_FACTOR_APPROXIMATION,
  approximation,
  compareAscii,
  fail,
} from './piping-component-contract.js';
import {
  applyBendingFlexibilityCorrection,
  asPoint,
  asVector,
  componentElementEntry,
  dot,
  generateComponentElement,
  subtract,
  unit,
} from './component-elements.js';
import { measurePureBendingRigidity } from './bend-component.js';

/**
 * Branch/tee junction model (sections 3.2, 3.4, 4.3, 10.4).
 *
 * Two things matter here and nothing else does. Branch classification comes
 * from the connected direction vectors and the junction topology — never from
 * nominal diameter, which this package records as evidence and refuses to
 * consult. And run/branch rotational flexibility is applied by exactly one
 * owning component model, which is why the junction publishes a machine-
 * readable ownership claim that a later package can verify instead of trust.
 */

/**
 * Classify the legs meeting at a junction from their direction vectors
 * (`DIRECTION_VECTOR_TOPOLOGY_V1`).
 *
 * Every leg direction is taken outward from the junction node. Two legs form
 * the run when they leave the junction in opposite directions, so the run pair
 * is the pair whose outward directions are most nearly anti-parallel; the
 * residual `|1 + d_i . d_j|` is zero for a perfectly straight run. A second
 * pair whose residual sits within the declared collinearity tolerance of the
 * best makes the run ambiguous — a cross, or a geometry the rule cannot
 * resolve — and blocks rather than being decided by leg order or by size.
 *
 * @param {Array<object>} legs Legs with outward end points.
 * @param {Array<number>} junctionPosition Junction node position.
 * @param {Readonly<object>} tolerance Declared run-collinearity tolerance.
 * @returns {Readonly<object>} Classification evidence.
 */
export function classifyBranchLegs(legs, junctionPosition, tolerance) {
  if (legs.length < 3) {
    fail(
      'A branch junction needs at least three connected legs; two legs are a straight run and carry no branch.',
      'PIPING_COMPONENT_BRANCH_LEG_COUNT_INVALID',
    );
  }
  const junction = asPoint(junctionPosition);
  const directions = legs.map((leg) => {
    const outward = subtract(asPoint(leg.endPoint), junction);
    return { legId: leg.legId, direction: unit(outward, `legs[${leg.legId}].endPoint`) };
  });

  const candidates = [];
  for (let left = 0; left < directions.length; left += 1) {
    for (let right = left + 1; right < directions.length; right += 1) {
      const alignment = cleanNumber(dot(directions[left].direction, directions[right].direction));
      if (!(alignment < 0)) continue;
      candidates.push({
        legIds: [directions[left].legId, directions[right].legId],
        alignment,
        collinearityResidual: cleanNumber(Math.abs(1 + alignment)),
      });
    }
  }
  if (candidates.length === 0) {
    fail(
      'No pair of legs leaves the junction in opposing directions, so no run can be identified from the direction vectors.',
      'PIPING_COMPONENT_BRANCH_RUN_NOT_IDENTIFIED',
    );
  }
  candidates.sort((left, right) => (left.collinearityResidual - right.collinearityResidual)
    || compareAscii(left.legIds.join('|'), right.legIds.join('|')));
  const best = candidates[0];
  if (best.collinearityResidual > tolerance.value) {
    fail(
      `The most nearly opposed leg pair leaves a collinearity residual of ${best.collinearityResidual}, beyond the declared run-collinearity tolerance ${tolerance.value}; the run is not identifiable from the direction vectors.`,
      'PIPING_COMPONENT_BRANCH_RUN_NOT_IDENTIFIED',
    );
  }
  const rival = candidates.find((entry) => entry !== best
    && entry.legIds.every((legId) => !best.legIds.includes(legId)));
  if (rival !== undefined && rival.collinearityResidual <= tolerance.value) {
    fail(
      `Leg pairs ${best.legIds.join('/')} and ${rival.legIds.join('/')} are both collinear within the declared tolerance; the run cannot be chosen without inventing a rule.`,
      'PIPING_COMPONENT_BRANCH_CLASSIFICATION_AMBIGUOUS',
    );
  }

  const roles = directions.map((entry) => ({
    legId: entry.legId,
    role: best.legIds.includes(entry.legId) ? 'RUN' : 'BRANCH',
    direction: asVector(entry.direction),
  }));
  return Object.freeze({
    rule: BRANCH_CLASSIFICATION_RULE,
    runLegIds: Object.freeze([...best.legIds]),
    branchLegIds: Object.freeze(roles.filter((entry) => entry.role === 'BRANCH').map((entry) => entry.legId)),
    runCollinearityResidual: best.collinearityResidual,
    runAlignment: best.alignment,
    tolerance: tolerance.value,
    toleranceSource: tolerance.source,
    legs: Object.freeze(roles.map((entry) => Object.freeze({ ...entry, direction: Object.freeze(entry.direction) }))),
    diameterConsulted: false,
  });
}

/**
 * Prove that junction flexibility is applied exactly once (sections 3.4, 4.3).
 *
 * Under `BRANCH_JUNCTION_ROTATIONAL_FLEXIBILITY_V1` the junction's local
 * geometry is represented explicitly by refinement elements, so a factor whose
 * own basis already contains that geometry would be counted twice. The applied
 * correction is then measured back off the compiled matrices, exactly as the
 * bend does, so an omitted or twice-applied factor cannot pass.
 */
export function branchFlexibilityGuard({
  geometryBasis,
  declaredFactor,
  measuredUncorrectedRigidity,
  measuredCorrectedRigidity,
  refinementElementCount,
  tolerance,
  toleranceSource,
}) {
  if (geometryBasis === 'JUNCTION_GEOMETRY_INCLUDED_V1' && refinementElementCount > 0) {
    fail(
      `The declared factor basis ${geometryBasis} already contains the junction geometry, but ${refinementElementCount} refinement elements represent that geometry as well; applying the factor here would count branch flexibility twice.`,
      'PIPING_COMPONENT_BRANCH_FLEXIBILITY_DOUBLE_COUNT',
    );
  }
  const appliedCorrectionRatio = cleanNumber(measuredUncorrectedRigidity / measuredCorrectedRigidity);
  const correctionResidual = cleanNumber(
    Math.abs(appliedCorrectionRatio - declaredFactor) / Math.max(declaredFactor, 1),
  );
  if (correctionResidual > tolerance) {
    fail(
      `The bending rigidity measured on the compiled branch elements reproduces a flexibility correction of ${appliedCorrectionRatio}, not the declared ${declaredFactor}.`,
      appliedCorrectionRatio < declaredFactor
        ? 'PIPING_COMPONENT_BRANCH_FLEXIBILITY_OMITTED'
        : 'PIPING_COMPONENT_BRANCH_FLEXIBILITY_DOUBLE_COUNT',
    );
  }
  return Object.freeze({
    guardId: BRANCH_FLEXIBILITY_GUARD_ID,
    method: 'MEASURED_JUNCTION_CORRECTION_V1',
    geometryBasis,
    declaredFactor,
    refinementElementCount,
    appliedCorrectionRatio,
    correctionResidual,
    tolerance,
    toleranceSource,
    accepted: true,
  });
}

/**
 * Compile one branch/tee junction into classified refinement elements,
 * flexibility evidence and its ownership claim.
 */
export function buildBranchComponent(input, context) {
  const { profile, policies, factorSet, applicability } = context;
  const applyFlexibility = profile.branchFlexibilityMethod === 'BRANCH_JUNCTION_ROTATIONAL_FLEXIBILITY_V1';
  if (applyFlexibility && factorSet === null) {
    fail(
      `profile.branchFlexibilityMethod is ${profile.branchFlexibilityMethod} but no factor set was supplied; the junction flexibility has no source.`,
      'PIPING_COMPONENT_FACTOR_SET_REQUIRED',
    );
  }
  if (!applyFlexibility && factorSet !== null) {
    fail(
      'profile.branchFlexibilityMethod applies no junction flexibility, so a factor set cannot be consumed here; a factor that is supplied but not applied invites a second application elsewhere.',
      'PIPING_COMPONENT_FACTOR_SET_NOT_APPLICABLE',
    );
  }

  const classification = classifyBranchLegs(input.legs, input.junctionPosition, policies.runCollinearityTolerance);
  const roleOf = new Map(classification.legs.map((entry) => [entry.legId, entry.role]));
  const declaredFactor = factorSet === null ? null : factorSet.flexibilityFactor.value;

  const ordered = [...input.legs].sort((left, right) => compareAscii(left.legId, right.legId));
  const elements = ordered.map((leg, index) => {
    const role = roleOf.get(leg.legId);
    const frameElement = generateComponentElement({
      elementId: `${input.componentId}.E${index + 1}`,
      nodeI: input.junctionPosition,
      nodeJ: leg.endPoint,
      referenceVector: input.referenceVector,
      material: leg.material,
      section: leg.section,
      frameElementProfile: input.frameElementProfile,
      localAxisProfile: input.localAxisProfile,
    });
    /*
     * Section 4.3: the rotational flexibility of a tee belongs to the branch
     * connection. Applying it to the run legs as well would spread one
     * component's flexibility across three members and make the total depend
     * on how far the refinement stubs happen to reach.
     */
    const correction = applyFlexibility && role === 'BRANCH'
      ? applyBendingFlexibilityCorrection(frameElement, declaredFactor)
      : null;
    return componentElementEntry(index, `${role}_REFINEMENT`, frameElement, correction);
  });

  let flexibility = null;
  const approximations = [];
  if (applyFlexibility) {
    const corrected = elements.find((entry) => entry.stiffnessCorrection !== null);
    if (corrected === undefined) {
      fail(
        'The selected branch flexibility method applies junction flexibility, but no branch leg received a correction.',
        'PIPING_COMPONENT_BRANCH_FLEXIBILITY_OMITTED',
      );
    }
    const measuredUncorrectedRigidity = measurePureBendingRigidity(
      corrected.frameElement.localStiffness,
      corrected.frameElement.geometry.length,
    );
    const measuredCorrectedRigidity = measurePureBendingRigidity(
      corrected.stiffnessCorrection.localStiffness,
      corrected.frameElement.geometry.length,
    );
    const guard = branchFlexibilityGuard({
      geometryBasis: factorSet.flexibilityGeometryBasis,
      declaredFactor,
      measuredUncorrectedRigidity,
      measuredCorrectedRigidity,
      refinementElementCount: elements.length,
      tolerance: policies.flexibilityDoubleCountTolerance.value,
      toleranceSource: policies.flexibilityDoubleCountTolerance.source,
    });
    flexibility = {
      factorSetId: factorSet.factorSetId,
      factorSetSemanticHash: factorSet.semanticHash,
      sourceIdentity: { ...factorSet.sourceIdentity },
      applicability,
      factor: declaredFactor,
      factorSource: factorSet.flexibilityFactor.source,
      geometryBasis: factorSet.flexibilityGeometryBasis,
      pressureStiffeningRule: null,
      pressureBasis: factorSet.pressureBasis,
      appliedTo: ['BRANCH_ROTATIONAL'],
      measuredUncorrectedRigidity,
      measuredCorrectedRigidity,
      doubleCountGuard: guard,
    };
    if (factorSet.userOverride !== null) {
      approximations.push(approximation(
        USER_FACTOR_APPROXIMATION,
        'CODE_SIF_METHOD',
        'CONDITIONAL',
        true,
        'The applied junction flexibility factor is a user override rather than a factor taken directly from the declared edition.',
        { ...factorSet.userOverride, factorSetId: factorSet.factorSetId },
      ));
    }
  }

  approximations.push(approximation(
    BRANCH_FLEXIBILITY_APPROXIMATION,
    'CODE_SIF_METHOD',
    'CONDITIONAL',
    applyFlexibility,
    'Junction local flexibility is represented by refinement elements and, where the method selects it, one rotational flexibility factor on the branch connection; crotch-region shell behaviour is not modelled.',
    {
      method: profile.branchFlexibilityMethod,
      runLegIds: [...classification.runLegIds],
      branchLegIds: [...classification.branchLegIds],
    },
  ));

  return {
    componentType: 'BRANCH_JUNCTION',
    formulationId: profile.branchFlexibilityMethod,
    geometry: {
      junctionId: input.junctionId,
      junctionPosition: [...input.junctionPosition],
      legs: ordered.map((leg) => ({
        legId: leg.legId,
        endPoint: [...leg.endPoint],
        role: roleOf.get(leg.legId),
      })),
      nominalDiameters: input.nominalDiameters === null ? null : { ...input.nominalDiameters },
    },
    subdivision: null,
    elements,
    kinematicRelations: [],
    codeStations: ordered.map((leg, index) => ({
      stationId: `${input.componentId}.CP${index + 1}`,
      kind: `${roleOf.get(leg.legId)}_CONNECTION`,
      nodeId: `${input.componentId}.N${index + 1}`,
      position: [...leg.endPoint],
      arcFraction: null,
    })),
    massProperties: null,
    sectionMapping: null,
    endConnections: null,
    classification,
    flexibility,
    convergence: null,
    approximations,
  };
}
