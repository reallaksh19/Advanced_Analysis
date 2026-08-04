import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import { DOF_ORDER } from '../linear-fea-contract/conventions.js';
import {
  REDUCER_APPROXIMATION,
  RIGID_LINK_APPROXIMATION,
  RIGID_LINK_RULE,
  RIGID_VALVE_APPROXIMATION,
  SUPPORT_OFFSET_APPROXIMATION,
  approximation,
  fail,
} from './piping-component-contract.js';
import {
  applyBodyRigidityMultiplier,
  applyCaesarRigidSectionCorrection,
  asPoint,
  componentElementEntry,
  dot,
  generateComponentElement,
  norm,
  subtract,
  unit,
} from './component-elements.js';

/**
 * Inline and kinematic components: reducer, valve/flange body, rigid link and
 * support offset (sections 3.4, 4.3, 11).
 */

function interpolate(start, end, fraction) {
  return [0, 1, 2].map((axis) => cleanNumber(start[axis] + (end[axis] - start[axis]) * fraction));
}

/**
 * Reducer: a stepped section chain with stated stations (sections 3.4, 4.3).
 *
 * Each station owns the span that begins at it, so the station-to-section
 * mapping is explicit and reversible rather than implied by element order. The
 * tapered formulation is a separate compiler; selecting it here is refused
 * rather than downgraded to the stepped one, because a stepped result
 * presented as a taper is exactly the hidden approximation section 1.3
 * forbids.
 */
export function buildReducerComponent(input, context) {
  const { profile } = context;
  if (profile.reducerRule === 'REDUCER_TAPERED_SECTION_V1') {
    fail(
      'profile.reducerRule selects a tapered reducer stiffness, which requires a separately versioned tapered-section compiler and is not implemented; it is blocked rather than served by the stepped approximation.',
      'PIPING_COMPONENT_REDUCER_TAPERED_NOT_IMPLEMENTED',
    );
  }
  const stations = input.stations;
  if (stations.length < 2) {
    fail(
      'A stepped reducer needs at least two stations; one station is a prismatic pipe span and belongs to B-3.1.',
      'PIPING_COMPONENT_REDUCER_STATIONS_INVALID',
    );
  }
  if (stations[0].fraction !== 0) {
    fail('reducer stations must begin at fraction 0.', 'PIPING_COMPONENT_REDUCER_STATIONS_INVALID');
  }
  for (let index = 1; index < stations.length; index += 1) {
    if (!(stations[index].fraction > stations[index - 1].fraction)) {
      fail('reducer station fractions must ascend strictly.', 'PIPING_COMPONENT_REDUCER_STATIONS_INVALID');
    }
  }
  if (!(stations[stations.length - 1].fraction < 1)) {
    fail(
      'The last reducer station must begin before the end of the body; a station at fraction 1 owns no span.',
      'PIPING_COMPONENT_REDUCER_STATIONS_INVALID',
    );
  }

  const elements = [];
  const sectionMapping = [];
  for (let index = 0; index < stations.length; index += 1) {
    const startFraction = stations[index].fraction;
    const endFraction = index + 1 < stations.length ? stations[index + 1].fraction : 1;
    const frameElement = generateComponentElement({
      elementId: `${input.componentId}.E${index + 1}`,
      nodeI: interpolate(input.start, input.end, startFraction),
      nodeJ: interpolate(input.start, input.end, endFraction),
      referenceVector: input.referenceVector,
      material: input.material,
      section: stations[index].section,
      frameElementProfile: input.frameElementProfile,
      localAxisProfile: input.localAxisProfile,
    });
    elements.push(componentElementEntry(index, 'REDUCER_STEP', frameElement, null));
    sectionMapping.push({
      elementIndex: index,
      stationId: `${input.componentId}.S${index + 1}`,
      startFraction,
      endFraction,
      sectionStateId: frameElement.section.sectionStateId,
      sectionResolutionSemanticHash: frameElement.section.resolutionSemanticHash,
    });
  }

  return {
    componentType: 'REDUCER',
    formulationId: profile.reducerRule,
    geometry: {
      start: [...input.start],
      end: [...input.end],
      length: cleanNumber(norm(subtract(asPoint(input.end), asPoint(input.start)))),
    },
    subdivision: null,
    elements,
    kinematicRelations: [],
    codeStations: sectionMapping.map((entry) => ({
      stationId: entry.stationId,
      kind: 'REDUCER_SECTION_CHANGE',
      nodeId: `${input.componentId}.N${entry.elementIndex}`,
      position: interpolate(input.start, input.end, entry.startFraction),
      arcFraction: entry.startFraction,
    })),
    massProperties: null,
    sectionMapping,
    endConnections: null,
    classification: null,
    flexibility: null,
    convergence: null,
    approximations: [approximation(
      REDUCER_APPROXIMATION,
      'REDUCER_APPROXIMATION',
      'CONDITIONAL',
      true,
      'The reducer is represented as stepped prismatic spans mapped to stated stations; the stepped section distorts local flexibility relative to a true taper and the section change is discontinuous at each station.',
      { rule: profile.reducerRule, stationCount: stations.length },
    )],
  };
}

/**
 * Valve or flange: a finite-length body with weight, centre of gravity and end
 * connection identity (sections 3.4, 4.3).
 *
 * Section 3.4 forbids a zero-length weight lump unless it is explicitly
 * selected, so a body of zero length is refused under the finite-length rule
 * instead of being quietly turned into a point mass on the run.
 */
export function buildValveFlangeComponent(input, context) {
  const { profile, policies } = context;
  const axis = subtract(asPoint(input.end), asPoint(input.start));
  const length = cleanNumber(norm(axis));
  const lumped = length === 0;
  if (lumped && profile.weightLumpRule !== 'ZERO_LENGTH_WEIGHT_LUMP_EXPLICITLY_SELECTED_V1') {
    fail(
      'The valve/flange body has zero length while the profile requires a finite-length body; a zero-length weight lump must be selected explicitly, never produced as a fallback.',
      'PIPING_COMPONENT_ZERO_LENGTH_WEIGHT_LUMP_NOT_SELECTED',
    );
  }

  const multiplierRigid = profile.valveBodyRule === 'VALVE_RIGID_BODY_V1';
  const caesarRigid = profile.valveBodyRule === 'VALVE_CAESAR_RIGID_BODY_V1';
  let multiplier = null;
  if (multiplierRigid || caesarRigid) {
    if (input.bodyStiffnessMultiplier !== null) {
      fail(
        'profile.valveBodyRule selects a rigid body, whose stiffness multiplier is the declared profile policy; a component-level multiplier would be a second authority.',
        'PIPING_COMPONENT_BODY_MULTIPLIER_CONFLICT',
      );
    }
    multiplier = caesarRigid ? null : policies.rigidBodyStiffnessMultiplier;
  } else {
    multiplier = requireDeclaredValue(input, 'bodyStiffnessMultiplier', { minimum: 1 });
  }

  const mass = requireDeclaredValue(input.massProperties, 'mass', { exclusiveMinimum: 0 });
  const centreOfGravity = input.massProperties.centreOfGravity;
  let centreOfGravityFraction = 0;
  if (!lumped) {
    const axisUnit = unit(axis, 'valve body axis');
    const along = dot(subtract(asPoint(centreOfGravity), asPoint(input.start)), axisUnit);
    centreOfGravityFraction = cleanNumber(along / length);
    if (!(centreOfGravityFraction >= 0 && centreOfGravityFraction <= 1)) {
      fail(
        `The declared centre of gravity projects to ${centreOfGravityFraction} along the body, outside its two end connections.`,
        'PIPING_COMPONENT_CENTRE_OF_GRAVITY_OUTSIDE_BODY',
      );
    }
  }

  const elements = [];
  if (!lumped) {
    const frameElement = generateComponentElement({
      elementId: `${input.componentId}.E1`,
      nodeI: input.start,
      nodeJ: input.end,
      referenceVector: input.referenceVector,
      material: input.material,
      section: input.section,
      frameElementProfile: input.frameElementProfile,
      localAxisProfile: input.localAxisProfile,
    });
    const stiffnessCorrection = caesarRigid
      ? applyCaesarRigidSectionCorrection(frameElement, input.section)
      : applyBodyRigidityMultiplier(frameElement, multiplier.value);
    elements.push(componentElementEntry(
      0,
      'VALVE_BODY',
      frameElement,
      stiffnessCorrection,
    ));
  }

  return {
    componentType: 'VALVE_FLANGE',
    formulationId: profile.valveBodyRule,
    geometry: {
      start: [...input.start],
      end: [...input.end],
      length,
      weightLumpRule: profile.weightLumpRule,
      lumped,
    },
    subdivision: null,
    elements,
    kinematicRelations: [],
    codeStations: [
      { stationId: `${input.componentId}.CP-I`, kind: 'COMPONENT_END_I', nodeId: `${input.componentId}.N0`, position: [...input.start], arcFraction: 0 },
      { stationId: `${input.componentId}.CP-J`, kind: 'COMPONENT_END_J', nodeId: `${input.componentId}.N1`, position: [...input.end], arcFraction: 1 },
    ],
    massProperties: {
      mass: mass.value,
      massSource: mass.source,
      centreOfGravity: [...centreOfGravity],
      centreOfGravityFraction,
      lumped,
    },
    sectionMapping: null,
    endConnections: {
      I: { ...input.endConnections.I },
      J: { ...input.endConnections.J },
    },
    classification: null,
    flexibility: null,
    convergence: null,
    approximations: [approximation(
      RIGID_VALVE_APPROXIMATION,
      'RIGID_VALVE_FLANGE',
      'CONDITIONAL',
      true,
      'The valve/flange body is represented as a stiffened prismatic member; body deformation is neglected, while finite length, mass and centre of gravity are retained and reported.',
      caesarRigid
        ? {
          rule: profile.valveBodyRule,
          sectionRule: 'RETAIN_INSIDE_DIAMETER_TEN_TIMES_WALL_V1',
          stiffnessMultiplier: null,
          stiffnessMultiplierSource: null,
          lumped,
        }
        : {
          rule: profile.valveBodyRule,
          stiffnessMultiplier: multiplier.value,
          stiffnessMultiplierSource: multiplier.source,
          lumped,
        },
    )],
  };
}

/**
 * Rigid element/link: a kinematic relation, not a stiff beam (section 4.3).
 *
 * The link produces no frame element and therefore no element end actions of
 * its own, and it is marked ineligible for code stress: a code point on a
 * rigid link would report a stress the component does not physically carry.
 */
export function buildRigidLinkComponent(input) {
  if (input.masterNodeId === input.slaveNodeId) {
    fail(
      'A rigid link must relate two distinct nodes.',
      'PIPING_COMPONENT_RIGID_LINK_DEGENERATE',
    );
  }
  for (const dof of input.coupledDofs) {
    if (!DOF_ORDER.includes(dof)) {
      fail(`rigidLink.coupledDofs names ${dof}, which is not a frozen local DOF.`, 'PIPING_COMPONENT_RIGID_LINK_DOF_INVALID');
    }
  }
  if (input.coupledDofs.length === 0) {
    fail('A rigid link that couples no DOF relates nothing.', 'PIPING_COMPONENT_RIGID_LINK_DOF_INVALID');
  }
  const coupledDofs = DOF_ORDER.filter((dof) => input.coupledDofs.includes(dof));
  return {
    componentType: 'RIGID_LINK',
    formulationId: RIGID_LINK_RULE,
    geometry: { offset: [...input.offset], offsetLength: cleanNumber(norm(asPoint(input.offset))) },
    subdivision: null,
    elements: [],
    kinematicRelations: [{
      relationId: `${input.componentId}.K1`,
      method: RIGID_LINK_RULE,
      masterNodeId: input.masterNodeId,
      slaveNodeId: input.slaveNodeId,
      offset: [...input.offset],
      coupledDofs,
      codeStressEligible: false,
    }],
    codeStations: [],
    massProperties: null,
    sectionMapping: null,
    endConnections: null,
    classification: null,
    flexibility: null,
    convergence: null,
    approximations: [approximation(
      RIGID_LINK_APPROXIMATION,
      'RIGID_COMPONENT',
      'CONDITIONAL',
      true,
      'The link is a kinematic relation between two nodes with no elastic deformation; it carries reactions and transferred end forces but no code stress of its own.',
      { method: RIGID_LINK_RULE, coupledDofCount: coupledDofs.length },
    )],
  };
}

/**
 * Support offset: the transfer between the pipe centreline and the support
 * steel point, with the centreline left where it is (section 3.4).
 *
 * Moving the centreline to the support point is the modelling error this
 * component exists to prevent, so a request to do it is refused by name rather
 * than accepted with a warning.
 */
export function buildSupportOffsetComponent(input, context) {
  const { profile } = context;
  if (input.relocateCenterline) {
    fail(
      'Support offsets transfer to the support steel point; the pipe centreline is never moved to it, because the centreline geometry is the analysis model.',
      'PIPING_COMPONENT_CENTERLINE_RELOCATION_PROHIBITED',
    );
  }
  const offset = [0, 1, 2].map((axis) => cleanNumber(input.supportPointPosition[axis] - input.centerlinePosition[axis]));
  const offsetLength = cleanNumber(norm(asPoint(offset)));
  if (!(offsetLength > 0)) {
    fail(
      'The support point coincides with the centreline node, so there is no offset to represent.',
      'PIPING_COMPONENT_SUPPORT_OFFSET_DEGENERATE',
    );
  }

  const explicitBeam = profile.supportOffsetRule === 'EXPLICIT_BEAM_LINK_V1';
  const elements = [];
  const kinematicRelations = [];
  if (explicitBeam) {
    if (input.material === null || input.section === null) {
      fail(
        'profile.supportOffsetRule selects an explicit beam link, which needs its own material and section states.',
        'PIPING_COMPONENT_SUPPORT_OFFSET_LINK_INCOMPLETE',
      );
    }
    const frameElement = generateComponentElement({
      elementId: `${input.componentId}.E1`,
      nodeI: input.centerlinePosition,
      nodeJ: input.supportPointPosition,
      referenceVector: input.referenceVector,
      material: input.material,
      section: input.section,
      frameElementProfile: input.frameElementProfile,
      localAxisProfile: input.localAxisProfile,
    });
    elements.push(componentElementEntry(0, 'SUPPORT_OFFSET_LINK', frameElement, null));
  } else {
    if (input.material !== null || input.section !== null) {
      fail(
        'profile.supportOffsetRule selects a rigid kinematic offset, which has no member and therefore no material or section state.',
        'PIPING_COMPONENT_SUPPORT_OFFSET_LINK_INCOMPLETE',
      );
    }
    kinematicRelations.push({
      relationId: `${input.componentId}.K1`,
      method: 'RIGID_OFFSET_KINEMATIC_V1',
      masterNodeId: input.centerlineNodeId,
      slaveNodeId: input.supportNodeId,
      offset: [...offset],
      coupledDofs: [...DOF_ORDER],
      codeStressEligible: false,
    });
  }

  return {
    componentType: 'SUPPORT_OFFSET',
    formulationId: profile.supportOffsetRule,
    geometry: {
      centerlineNodeId: input.centerlineNodeId,
      supportNodeId: input.supportNodeId,
      centerlinePosition: [...input.centerlinePosition],
      supportPointPosition: [...input.supportPointPosition],
      offset,
      offsetLength,
      centerlineRetained: true,
    },
    subdivision: null,
    elements,
    kinematicRelations,
    codeStations: [],
    massProperties: null,
    sectionMapping: null,
    endConnections: null,
    classification: null,
    flexibility: null,
    convergence: null,
    approximations: [approximation(
      SUPPORT_OFFSET_APPROXIMATION,
      explicitBeam ? 'STRAIGHT_BEAM_REPRESENTATION' : 'RIGID_COMPONENT',
      explicitBeam ? 'ACCEPTED' : 'CONDITIONAL',
      true,
      explicitBeam
        ? 'The offset between the pipe centreline and the support point is an explicit beam link with retained geometry and real flexibility.'
        : 'The offset between the pipe centreline and the support point is kinematically rigid; the offset carries no flexibility, and the pipe centreline geometry is retained unchanged.',
      { rule: profile.supportOffsetRule, offsetLength },
    )],
  };
}
