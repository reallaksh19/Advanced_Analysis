import { resolveFrameLocalAxesForSpanChain } from '../centerline-beam-fea/index.js';
import { compileFrameElement, requireFrameElementProfile } from '../linear-fea-frame-element/index.js';
import { requireMaterialResolutionResult } from '../linear-fea-material/index.js';
import { requirePipeSectionResolution } from '../linear-fea-section/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { classifyBranchLegs } from './branch-component.js';
import { requireRecord } from './piping-component-contract.js';

export const B31J_DIRECTIONAL_BRANCH_SCHEMA = 'fea-linear-b31j-directional-branch/v1';
export const B31J_DIRECTIONAL_BRANCH_FORMULATION = 'BRANCH_B31J_DIRECTIONAL_ROTATIONAL_SPRINGS_V1';
export const B31J_DIRECTIONAL_SPRING_RULE = 'K_EQUALS_RIGIDITY_OVER_KD_V1';
export const B31J_BRANCH_SURFACE_RULE = 'RUN_SURFACE_RIGID_OFFSET_V1';

/**
 * Derive end-condition modifiers for the existing three spans at a B31J tee.
 * Production consumers should apply these modifiers to the junction end of
 * the existing leg element; they must not add overlapping duplicate members.
 */
export function deriveB31JDirectionalBranchEndModifiers({
  componentId,
  factorResult,
  junctionPosition,
  legs,
  runCollinearityTolerance,
}) {
  requireRecord(factorResult, 'factorResult', 'PIPING_COMPONENT_FACTOR_SET_INVALID');
  if (factorResult.status !== 'QUALIFIED' || factorResult.componentType !== 'WELDING_TEE') {
    fail('PIPING_COMPONENT_BRANCH_B31J_FACTOR_RESULT_INVALID', 'Directional branch flexibility requires a qualified WELDING_TEE B31 factor result.');
  }
  const directional = factorResult.factors?.flexibility;
  requireDirectionalFactors(directional);
  if (!Array.isArray(junctionPosition) || junctionPosition.length !== 3) {
    throw new TypeError('junctionPosition must be a three-component coordinate.');
  }
  if (!Array.isArray(legs) || legs.length !== 3) {
    fail('PIPING_COMPONENT_BRANCH_LEG_COUNT_INVALID', 'B31J directional branch flexibility requires exactly three connected legs.');
  }
  if (!runCollinearityTolerance || !(runCollinearityTolerance.value >= 0)) {
    throw new TypeError('runCollinearityTolerance must be a declared nonnegative tolerance.');
  }
  for (const leg of legs) {
    if (!['I', 'J'].includes(leg.junctionEnd ?? 'I')) {
      fail('PIPING_COMPONENT_BRANCH_JUNCTION_END_INVALID', `Leg ${leg.legId} junctionEnd must be I or J.`);
    }
  }

  const classification = classifyBranchLegs(legs, junctionPosition, runCollinearityTolerance);
  const roleById = new Map(classification.legs.map((row) => [row.legId, row.role]));
  const directionById = new Map(classification.legs.map((row) => [row.legId, row.direction]));
  const runLegs = legs.filter((leg) => roleById.get(leg.legId) === 'RUN');
  const branchLegs = legs.filter((leg) => roleById.get(leg.legId) === 'BRANCH');
  if (runLegs.length !== 2 || branchLegs.length !== 1) {
    fail('PIPING_COMPONENT_BRANCH_TOPOLOGY_UNSUPPORTED', 'Directional B31J tee formulation currently requires exactly two run legs and one branch leg.');
  }

  const accepted = new Map(legs.map((leg) => [leg.legId, {
    material: requireMaterialResolutionResult(leg.material),
    section: requirePipeSectionResolution(leg.section),
  }]));
  const runOd = commonRunOuterDiameter(runLegs, accepted, runCollinearityTolerance.value);
  const runDirection = directionById.get(runLegs[0].legId);
  const branchDirection = directionById.get(branchLegs[0].legId);
  const planeNormal = unit(cross(runDirection, branchDirection), 'branch plane normal');
  const branchSurfaceOffset = scale(branchDirection, runOd / 2);
  const branchSurfacePosition = add(junctionPosition, branchSurfaceOffset);

  const modifiers = [...legs]
    .sort((left, right) => compareAscii(left.legId, right.legId))
    .map((leg) => {
      const role = roleById.get(leg.legId);
      const authorities = accepted.get(leg.legId);
      const factors = role === 'RUN' ? directional.run : directional.branch;
      const springSet = directionalRotationalSprings({
        role,
        factors,
        material: authorities.material.materialState,
        section: authorities.section.sectionState,
        diameter: authorities.section.dimensions.outerDiameter,
        end: leg.junctionEnd ?? 'I',
      });
      return Object.freeze({
        legId: leg.legId,
        role,
        junctionEnd: leg.junctionEnd ?? 'I',
        referenceVector: Object.freeze([...planeNormal]),
        rotationalSprings: Object.freeze(springSet.springs),
        factorValues: Object.freeze({ ...springSet.factorValues }),
        rigidOffset: role === 'BRANCH' ? Object.freeze([...branchSurfaceOffset]) : null,
        physicalJunctionPosition: Object.freeze(role === 'BRANCH' ? [...branchSurfacePosition] : [...junctionPosition]),
      });
    });

  const springTargets = modifiers.flatMap((entry) =>
    entry.rotationalSprings.map((spring) => `${entry.role}:${entry.legId}:${entry.junctionEnd}:${spring.dof}`));
  const draft = {
    schema: 'fea-linear-b31j-directional-branch-end-modifiers/v1',
    componentId,
    formulationId: B31J_DIRECTIONAL_BRANCH_FORMULATION,
    factorCalculationId: factorResult.calculationId,
    factorResultSemanticHash: factorResult.semanticHash,
    factorSourceIdentity: Object.freeze({ ...factorResult.sourceIdentity }),
    applicability: Object.freeze({ ...factorResult.applicability }),
    classification,
    geometry: Object.freeze({
      junctionPosition: Object.freeze([...junctionPosition]),
      planeNormal: Object.freeze([...planeNormal]),
      runOuterDiameter: runOd,
      branchSurfacePosition: Object.freeze([...branchSurfacePosition]),
      branchSurfaceOffset: Object.freeze([...branchSurfaceOffset]),
      branchSurfaceRule: B31J_BRANCH_SURFACE_RULE,
    }),
    directionalFlexibilityFactors: deepFreezeDirectional(directional),
    springRule: B31J_DIRECTIONAL_SPRING_RULE,
    modifiers: Object.freeze(modifiers),
    flexibilityOwnership: Object.freeze({
      ownerPackageId: 'LFEA-B3.2',
      applied: springTargets.length > 0,
      targets: Object.freeze(springTargets.sort(compareAscii)),
      rigidWhenFactorAtMostOne: true,
    }),
    limitations: Object.freeze([
      'Modifiers apply to existing adjacent spans; no duplicate tee leg element is introduced in production assembly.',
      'B31J directional flexibility modifies rotational stiffness only; translations remain connected through the original frame span.',
      'Run flexibility acts at the centerline intersection; branch flexibility acts at the run surface through a rigid offset.',
    ]),
  };
  return Object.freeze({ ...draft, semanticHash: semanticHash(draft) });
}

/**
 * Compile isolated leg elements from the production modifiers. This is useful
 * for mechanics qualification and matrix tests; production model assembly
 * should normally consume `deriveB31JDirectionalBranchEndModifiers` instead.
 */
export function compileB31JDirectionalBranchFlexibility({
  componentId,
  factorResult,
  junctionPosition,
  legs,
  frameElementProfile,
  localAxisProfile,
  runCollinearityTolerance,
}) {
  const frameProfile = requireFrameElementProfile(frameElementProfile);
  const modifierResult = deriveB31JDirectionalBranchEndModifiers({
    componentId,
    factorResult,
    junctionPosition,
    legs,
    runCollinearityTolerance,
  });
  const modifierByLeg = new Map(modifierResult.modifiers.map((entry) => [entry.legId, entry]));
  const ordered = [...legs].sort((left, right) => compareAscii(left.legId, right.legId));
  const elements = ordered.map((leg, index) => {
    const modifier = modifierByLeg.get(leg.legId);
    const material = requireMaterialResolutionResult(leg.material);
    const section = requirePipeSectionResolution(leg.section);
    const physicalJunction = modifier.physicalJunctionPosition;
    const points = modifier.junctionEnd === 'I'
      ? [physicalJunction, leg.endPoint]
      : [leg.endPoint, physicalJunction];
    const [axes] = resolveFrameLocalAxesForSpanChain({
      points,
      referenceVector: modifier.referenceVector,
      profile: localAxisProfile,
    });
    const rigidOffsets = modifier.rigidOffset === null
      ? null
      : modifier.junctionEnd === 'I'
        ? { I: asOffsetRecord(modifier.rigidOffset), J: null }
        : { I: null, J: asOffsetRecord(modifier.rigidOffset) };
    const frameElement = compileFrameElement({
      elementId: `${componentId}.E${index + 1}`,
      material,
      section,
      localAxes: { result: axes, profile: localAxisProfile },
      profile: frameProfile,
      distributedLoads: [],
      temperature: null,
      releases: [],
      endSprings: modifier.rotationalSprings,
      rigidOffsets,
    });
    return Object.freeze({
      legId: leg.legId,
      role: modifier.role,
      junctionEnd: modifier.junctionEnd,
      frameElement,
      factorValues: modifier.factorValues,
      rotationalSprings: modifier.rotationalSprings,
      rigidOffset: modifier.rigidOffset,
    });
  });
  const draft = {
    schema: B31J_DIRECTIONAL_BRANCH_SCHEMA,
    componentId,
    formulationId: B31J_DIRECTIONAL_BRANCH_FORMULATION,
    factorCalculationId: factorResult.calculationId,
    factorResultSemanticHash: factorResult.semanticHash,
    factorSourceIdentity: modifierResult.factorSourceIdentity,
    applicability: modifierResult.applicability,
    classification: modifierResult.classification,
    geometry: modifierResult.geometry,
    directionalFlexibilityFactors: modifierResult.directionalFlexibilityFactors,
    springRule: modifierResult.springRule,
    endModifierSemanticHash: modifierResult.semanticHash,
    elements: Object.freeze(elements),
    flexibilityOwnership: modifierResult.flexibilityOwnership,
    limitations: modifierResult.limitations,
  };
  return Object.freeze({ ...draft, semanticHash: semanticHash(draft) });
}

function directionalRotationalSprings({ role, factors, material, section, diameter, end }) {
  const factorValues = {
    torsional: positiveFactor(factors.torsional, `${role}.torsional`),
    inPlane: positiveFactor(factors.inPlane, `${role}.inPlane`),
    outOfPlane: positiveFactor(factors.outOfPlane, `${role}.outOfPlane`),
  };
  const rigidity = {
    RX: material.shearModulus * section.polarMoment,
    RY: material.elasticModulus * section.secondMomentY,
    RZ: material.elasticModulus * section.secondMomentZ,
  };
  const factorByDof = { RX: factorValues.torsional, RY: factorValues.inPlane, RZ: factorValues.outOfPlane };
  const springs = [];
  for (const dof of ['RX', 'RY', 'RZ']) {
    const k = factorByDof[dof];
    if (k <= 1) continue;
    springs.push(Object.freeze({
      end,
      dof,
      stiffness: rigidity[dof] / (k * diameter),
    }));
  }
  return { factorValues, springs };
}

function requireDirectionalFactors(value) {
  if (!value || typeof value !== 'object') {
    fail('PIPING_COMPONENT_BRANCH_DIRECTIONAL_FACTORS_MISSING', 'B31J tee result has no directional flexibility factors.');
  }
  for (const role of ['run', 'branch']) {
    if (!value[role] || typeof value[role] !== 'object') {
      fail('PIPING_COMPONENT_BRANCH_DIRECTIONAL_FACTORS_MISSING', `B31J tee result has no ${role} flexibility factors.`);
    }
    for (const direction of ['inPlane', 'outOfPlane', 'torsional']) {
      positiveFactor(value[role][direction], `${role}.${direction}`);
    }
  }
}

function commonRunOuterDiameter(runLegs, accepted, tolerance) {
  const diameters = runLegs.map((leg) => accepted.get(leg.legId).section.dimensions.outerDiameter);
  const scaleValue = Math.max(...diameters);
  if (Math.abs(diameters[0] - diameters[1]) > tolerance * Math.max(scaleValue, Number.MIN_VALUE)) {
    fail('PIPING_COMPONENT_BRANCH_RUN_SECTION_MISMATCH', 'The two run legs must share one outside diameter to locate the branch surface deterministically.');
  }
  return diameters.reduce((sum, value) => sum + value, 0) / diameters.length;
}

function positiveFactor(value, field) {
  if (!(typeof value === 'number' && Number.isFinite(value) && value > 0)) {
    fail('PIPING_COMPONENT_BRANCH_DIRECTIONAL_FACTOR_INVALID', `${field} flexibility factor must be a positive finite number.`);
  }
  return value;
}

function deepFreezeDirectional(value) {
  return Object.freeze({
    run: Object.freeze({ ...value.run }),
    branch: Object.freeze({ ...value.branch }),
  });
}

function asOffsetRecord(vector) { return { x: vector[0], y: vector[1], z: vector[2] }; }
function add(a, b) { return a.map((value, index) => value + b[index]); }
function scale(a, factor) { return a.map((value) => value * factor); }
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function norm(a) { return Math.hypot(...a); }
function unit(a, field) {
  const length = norm(a);
  if (!(length > 0)) fail('PIPING_COMPONENT_BRANCH_PLANE_DEGENERATE', `${field} is degenerate.`);
  return scale(a, 1 / length);
}
function compareAscii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
