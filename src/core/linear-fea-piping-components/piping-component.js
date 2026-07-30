import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  APPROXIMATION_KEYS,
  CODE_STATION_KEYS,
  COMPONENT_TYPES,
  FLEXIBILITY_OWNERSHIP_KEYS,
  FLEXIBILITY_OWNERSHIP_SCHEMA,
  FLEXIBILITY_OWNER_PACKAGE_ID,
  KINEMATIC_RELATION_KEYS,
  PIPING_COMPONENT_ELEMENT_KEYS,
  PIPING_COMPONENT_RECORD_KEYS,
  PIPING_COMPONENT_SCHEMA,
  acceptanceStateFrom,
  compareAscii,
  fail,
  requireArray,
  requireComponentFactorSet,
  requireExactKeys,
  requireFactorApplicability,
  requireHash,
  requireIdentity,
  requireMember,
  requirePipingComponentProfile,
  requirePositive,
  requireRecord,
  requireText,
  requireVector3,
  resolvePipingComponentPolicies,
} from './piping-component-contract.js';
import { buildBendComponent } from './bend-component.js';
import { buildBranchComponent } from './branch-component.js';
import {
  buildReducerComponent,
  buildRigidLinkComponent,
  buildSupportOffsetComponent,
  buildValveFlangeComponent,
} from './inline-component.js';

const INPUT_CODE = 'PIPING_COMPONENT_INPUT_INVALID';

const COMMON_KEYS = ['componentId', 'componentType', 'profile'];
const MEMBER_KEYS = ['frameElementProfile', 'localAxisProfile', 'referenceVector'];

export const PIPING_COMPONENT_INPUT_KEYS = Object.freeze({
  BEND: Object.freeze([...COMMON_KEYS, ...MEMBER_KEYS, 'arc', 'material', 'section', 'factorSet']),
  BRANCH_JUNCTION: Object.freeze([
    ...COMMON_KEYS, ...MEMBER_KEYS, 'junctionId', 'junctionPosition', 'legs', 'factorSet', 'nominalDiameters',
  ]),
  REDUCER: Object.freeze([...COMMON_KEYS, ...MEMBER_KEYS, 'start', 'end', 'material', 'stations']),
  VALVE_FLANGE: Object.freeze([
    ...COMMON_KEYS, ...MEMBER_KEYS, 'start', 'end', 'material', 'section',
    'massProperties', 'endConnections', 'bodyStiffnessMultiplier',
  ]),
  RIGID_LINK: Object.freeze([...COMMON_KEYS, 'masterNodeId', 'slaveNodeId', 'offset', 'coupledDofs']),
  SUPPORT_OFFSET: Object.freeze([
    ...COMMON_KEYS, ...MEMBER_KEYS, 'centerlineNodeId', 'supportNodeId',
    'centerlinePosition', 'supportPointPosition', 'relocateCenterline', 'material', 'section',
  ]),
});

export const BEND_ARC_KEYS = Object.freeze(['tangentStart', 'tangentEnd', 'incomingDirection', 'declaredRadius']);
export const BRANCH_LEG_KEYS = Object.freeze(['legId', 'endPoint', 'material', 'section']);
export const REDUCER_STATION_KEYS = Object.freeze(['fraction', 'section']);
export const MASS_PROPERTY_KEYS = Object.freeze(['mass', 'centreOfGravity']);
export const END_CONNECTION_KEYS = Object.freeze(['portId', 'connectionType']);

function requireMemberInputs(input) {
  requireRecord(input.frameElementProfile, 'component.frameElementProfile', INPUT_CODE);
  requireRecord(input.localAxisProfile, 'component.localAxisProfile', INPUT_CODE);
}

function requireFactorSetFor(input, componentType) {
  if (input.factorSet === null) return null;
  const accepted = requireComponentFactorSet(input.factorSet);
  if (accepted.componentType !== componentType) {
    fail(
      `component.factorSet describes a ${accepted.componentType}, not a ${componentType}.`,
      'PIPING_COMPONENT_FACTOR_SET_COMPONENT_MISMATCH',
    );
  }
  return accepted;
}

function validateBend(input) {
  requireExactKeys(input.arc, BEND_ARC_KEYS, 'component.arc', INPUT_CODE);
  requireVector3(input.arc.tangentStart, 'component.arc.tangentStart', INPUT_CODE);
  requireVector3(input.arc.tangentEnd, 'component.arc.tangentEnd', INPUT_CODE);
  requireVector3(input.arc.incomingDirection, 'component.arc.incomingDirection', INPUT_CODE);
  requirePositive(input.arc.declaredRadius, 'component.arc.declaredRadius', INPUT_CODE);
  if (input.referenceVector !== null) {
    requireVector3(input.referenceVector, 'component.referenceVector', INPUT_CODE);
  }
  requireMemberInputs(input);
  if (input.factorSet === null) {
    fail(
      'A bend applies a component flexibility factor and therefore needs a declared factor set with its own source identity and applicability verdict.',
      'PIPING_COMPONENT_FACTOR_SET_REQUIRED',
    );
  }
  return requireFactorSetFor(input, 'BEND');
}

function validateBranch(input) {
  requireIdentity(input.junctionId, 'component.junctionId', INPUT_CODE);
  requireVector3(input.junctionPosition, 'component.junctionPosition', INPUT_CODE);
  requireVector3(input.referenceVector, 'component.referenceVector', INPUT_CODE);
  requireArray(input.legs, 'component.legs', INPUT_CODE);
  const seen = new Set();
  input.legs.forEach((leg, position) => {
    requireExactKeys(leg, BRANCH_LEG_KEYS, `component.legs[${position}]`, INPUT_CODE);
    requireIdentity(leg.legId, `component.legs[${position}].legId`, INPUT_CODE);
    if (seen.has(leg.legId)) {
      fail(`component.legs declares ${leg.legId} more than once.`, INPUT_CODE);
    }
    seen.add(leg.legId);
    requireVector3(leg.endPoint, `component.legs[${position}].endPoint`, INPUT_CODE);
  });
  if (input.nominalDiameters !== null) {
    requireRecord(input.nominalDiameters, 'component.nominalDiameters', INPUT_CODE);
    for (const [legId, value] of Object.entries(input.nominalDiameters)) {
      requirePositive(value, `component.nominalDiameters.${legId}`, INPUT_CODE);
    }
  }
  requireMemberInputs(input);
  return requireFactorSetFor(input, 'BRANCH_JUNCTION');
}

function validateStraightBody(input) {
  requireVector3(input.start, 'component.start', INPUT_CODE);
  requireVector3(input.end, 'component.end', INPUT_CODE);
  requireVector3(input.referenceVector, 'component.referenceVector', INPUT_CODE);
  requireMemberInputs(input);
}

function validateReducer(input) {
  validateStraightBody(input);
  requireArray(input.stations, 'component.stations', INPUT_CODE);
  input.stations.forEach((station, position) => {
    requireExactKeys(station, REDUCER_STATION_KEYS, `component.stations[${position}]`, INPUT_CODE);
    if (typeof station.fraction !== 'number' || !(station.fraction >= 0 && station.fraction < 1)) {
      fail(`component.stations[${position}].fraction must lie in [0, 1).`, 'PIPING_COMPONENT_REDUCER_STATIONS_INVALID');
    }
  });
}

function validateValveFlange(input) {
  validateStraightBody(input);
  requireExactKeys(input.massProperties, MASS_PROPERTY_KEYS, 'component.massProperties', INPUT_CODE);
  requireVector3(input.massProperties.centreOfGravity, 'component.massProperties.centreOfGravity', INPUT_CODE);
  requireExactKeys(input.endConnections, ['I', 'J'], 'component.endConnections', INPUT_CODE);
  for (const end of ['I', 'J']) {
    requireExactKeys(input.endConnections[end], END_CONNECTION_KEYS, `component.endConnections.${end}`, INPUT_CODE);
    requireIdentity(input.endConnections[end].portId, `component.endConnections.${end}.portId`, INPUT_CODE);
    requireText(input.endConnections[end].connectionType, `component.endConnections.${end}.connectionType`, INPUT_CODE);
  }
}

function validateRigidLink(input) {
  requireIdentity(input.masterNodeId, 'component.masterNodeId', INPUT_CODE);
  requireIdentity(input.slaveNodeId, 'component.slaveNodeId', INPUT_CODE);
  requireVector3(input.offset, 'component.offset', INPUT_CODE);
  requireArray(input.coupledDofs, 'component.coupledDofs', INPUT_CODE);
}

function validateSupportOffset(input) {
  requireIdentity(input.centerlineNodeId, 'component.centerlineNodeId', INPUT_CODE);
  requireIdentity(input.supportNodeId, 'component.supportNodeId', INPUT_CODE);
  requireVector3(input.centerlinePosition, 'component.centerlinePosition', INPUT_CODE);
  requireVector3(input.supportPointPosition, 'component.supportPointPosition', INPUT_CODE);
  requireVector3(input.referenceVector, 'component.referenceVector', INPUT_CODE);
  if (typeof input.relocateCenterline !== 'boolean') {
    fail('component.relocateCenterline must be declared true or false.', INPUT_CODE);
  }
  requireMemberInputs(input);
}

function ownershipClaim(componentId, componentType, factorSet, flexibility) {
  const applied = flexibility !== null;
  return {
    schema: FLEXIBILITY_OWNERSHIP_SCHEMA,
    ownerPackageId: FLEXIBILITY_OWNER_PACKAGE_ID,
    componentId,
    componentType,
    flexibilityTargets: applied
      ? flexibility.appliedTo.map((target) => `${componentId}:${target}`)
      : [],
    applied,
    factorSetId: applied ? factorSet.factorSetId : null,
    factorSourceIdentity: applied ? { ...factorSet.sourceIdentity } : null,
    doubleCountGuardId: applied ? flexibility.doubleCountGuard.guardId : null,
  };
}

/**
 * Compile one piping component into an immutable
 * `fea-linear-piping-component/v1` record (sections 3.4, 3.5, 4.3, 10.4, 11).
 *
 * Every generated span is a B-3.1 element compiled by B-3.1; this package adds
 * component geometry, subdivision authority, declared flexibility, code
 * stations, kinematic relations and disclosures. It assembles nothing, and it
 * evaluates no code stress: the flexibility it applies is recorded as an
 * ownership claim precisely so the code package can consume factors without
 * touching stiffness.
 *
 * @param {object} input See `PIPING_COMPONENT_INPUT_KEYS`.
 * @returns {Readonly<object>} Sealed `fea-linear-piping-component/v1` record.
 */
export function compilePipingComponent(input) {
  requireRecord(input, 'component', INPUT_CODE);
  requireMember(input.componentType, COMPONENT_TYPES, 'component.componentType', INPUT_CODE);
  requireExactKeys(input, PIPING_COMPONENT_INPUT_KEYS[input.componentType], 'component', INPUT_CODE);
  const componentId = requireIdentity(input.componentId, 'component.componentId', INPUT_CODE);
  const profile = requirePipingComponentProfile(input.profile);
  const policies = resolvePipingComponentPolicies(profile);

  let factorSet = null;
  let draft = null;
  if (input.componentType === 'BEND') {
    factorSet = validateBend(input);
    draft = buildBendComponent(input, {
      profile, policies, factorSet, applicability: requireFactorApplicability(factorSet),
    });
  } else if (input.componentType === 'BRANCH_JUNCTION') {
    factorSet = validateBranch(input);
    draft = buildBranchComponent(input, {
      profile,
      policies,
      factorSet,
      applicability: factorSet === null ? null : requireFactorApplicability(factorSet),
    });
  } else if (input.componentType === 'REDUCER') {
    validateReducer(input);
    draft = buildReducerComponent(input, { profile, policies });
  } else if (input.componentType === 'VALVE_FLANGE') {
    validateValveFlange(input);
    draft = buildValveFlangeComponent(input, { profile, policies });
  } else if (input.componentType === 'RIGID_LINK') {
    validateRigidLink(input);
    draft = buildRigidLinkComponent(input);
  } else {
    validateSupportOffset(input);
    draft = buildSupportOffsetComponent(input, { profile, policies });
  }

  const approximations = [...draft.approximations].sort((left, right) => compareAscii(left.code, right.code));
  const record = {
    schema: PIPING_COMPONENT_SCHEMA,
    componentId,
    componentType: draft.componentType,
    formulationId: draft.formulationId,
    profileSemanticHash: profile.semanticHash,
    geometry: draft.geometry,
    subdivision: draft.subdivision,
    elements: draft.elements,
    kinematicRelations: draft.kinematicRelations,
    codeStations: draft.codeStations,
    massProperties: draft.massProperties,
    sectionMapping: draft.sectionMapping,
    endConnections: draft.endConnections,
    classification: draft.classification,
    flexibility: draft.flexibility,
    /*
     * A bend and a branch junction always publish a claim, even when the
     * selected method applies no flexibility: "this junction's rotational
     * flexibility is unowned" is exactly the fact a later package needs in
     * order to notice that nobody applied it.
     */
    flexibilityOwnership: ['BEND', 'BRANCH_JUNCTION'].includes(draft.componentType)
      ? ownershipClaim(componentId, draft.componentType, factorSet, draft.flexibility)
      : null,
    convergence: draft.convergence,
    approximations,
    acceptanceState: acceptanceStateFrom(approximations),
    semanticHash: '',
  };
  record.semanticHash = computePipingComponentSemanticHash(record);
  return requirePipingComponent(record);
}

export function pipingComponentSemanticProjection(record) {
  const projection = {};
  for (const key of PIPING_COMPONENT_RECORD_KEYS) {
    if (key === 'semanticHash') continue;
    projection[key] = record[key];
  }
  return projection;
}

export function computePipingComponentSemanticHash(record) {
  return semanticHash(pipingComponentSemanticProjection(record));
}

/**
 * Re-accept a sealed component record: exact keys, frozen schema, structurally
 * complete element and station entries and a semantic hash that still matches
 * the content. Mechanics are not re-derived here; the record is evidence.
 */
export function requirePipingComponent(record) {
  requireExactKeys(record, PIPING_COMPONENT_RECORD_KEYS, 'pipingComponent', INPUT_CODE);
  if (record.schema !== PIPING_COMPONENT_SCHEMA) {
    fail(`pipingComponent.schema must be ${PIPING_COMPONENT_SCHEMA}.`, INPUT_CODE);
  }
  requireIdentity(record.componentId, 'pipingComponent.componentId', INPUT_CODE);
  requireMember(record.componentType, COMPONENT_TYPES, 'pipingComponent.componentType', INPUT_CODE);
  requireArray(record.elements, 'pipingComponent.elements', INPUT_CODE);
  record.elements.forEach((entry, position) => {
    requireExactKeys(entry, PIPING_COMPONENT_ELEMENT_KEYS, `pipingComponent.elements[${position}]`, INPUT_CODE);
    if (entry.effectiveLocalStiffness.length !== 144 || entry.effectiveGlobalStiffness.length !== 144) {
      fail(`pipingComponent.elements[${position}] must carry 12x12 effective stiffness matrices.`, INPUT_CODE);
    }
  });
  requireArray(record.kinematicRelations, 'pipingComponent.kinematicRelations', INPUT_CODE);
  record.kinematicRelations.forEach((entry, position) => {
    requireExactKeys(entry, KINEMATIC_RELATION_KEYS, `pipingComponent.kinematicRelations[${position}]`, INPUT_CODE);
    if (entry.codeStressEligible !== false) {
      fail(
        `pipingComponent.kinematicRelations[${position}] claims code-stress eligibility; a kinematic relation carries no artificial code stress.`,
        'PIPING_COMPONENT_RIGID_RELATION_CODE_STRESS_PROHIBITED',
      );
    }
  });
  requireArray(record.codeStations, 'pipingComponent.codeStations', INPUT_CODE);
  record.codeStations.forEach((entry, position) => {
    requireExactKeys(entry, CODE_STATION_KEYS, `pipingComponent.codeStations[${position}]`, INPUT_CODE);
  });
  requireArray(record.approximations, 'pipingComponent.approximations', INPUT_CODE);
  record.approximations.forEach((entry, position) => {
    requireExactKeys(entry, APPROXIMATION_KEYS, `pipingComponent.approximations[${position}]`, INPUT_CODE);
  });
  if (record.flexibilityOwnership !== null) {
    requireExactKeys(
      record.flexibilityOwnership,
      FLEXIBILITY_OWNERSHIP_KEYS,
      'pipingComponent.flexibilityOwnership',
      INPUT_CODE,
    );
  }
  if (record.acceptanceState !== acceptanceStateFrom(record.approximations)) {
    fail(
      'pipingComponent.acceptanceState disagrees with its own disclosures.',
      'PIPING_COMPONENT_ACCEPTANCE_STATE_INCONSISTENT',
    );
  }
  requireHash(record.semanticHash, 'pipingComponent.semanticHash', INPUT_CODE);
  if (record.semanticHash !== computePipingComponentSemanticHash(record)) {
    fail('pipingComponent.semanticHash is stale.', 'PIPING_COMPONENT_HASH_MISMATCH');
  }
  return deepFreeze({
    ...pipingComponentSemanticProjection(record),
    semanticHash: record.semanticHash,
  });
}

/**
 * Section 10.4 Ownership: only one component package may apply flexibility,
 * and within it only one component model may apply it to a given target.
 *
 * This is the check B-4.0 runs before consuming resultants and factors. It
 * refuses two things: a second claim on a target already claimed, and a claim
 * from any package other than this one that says it applied flexibility —
 * because a code package that changed stiffness would have left the solver
 * solving a different structure than the one it reports on.
 *
 * @param {Array<object>} claims Ownership claims from component records.
 * @returns {Readonly<object>} Ownership registry evidence.
 */
export function assertSingleFlexibilityOwnership(claims) {
  requireArray(claims, 'flexibilityOwnershipClaims', INPUT_CODE);
  const owned = new Map();
  const accepted = [];
  for (const [position, claim] of claims.entries()) {
    const field = `flexibilityOwnershipClaims[${position}]`;
    requireExactKeys(claim, FLEXIBILITY_OWNERSHIP_KEYS, field, INPUT_CODE);
    if (claim.schema !== FLEXIBILITY_OWNERSHIP_SCHEMA) {
      fail(`${field}.schema must be ${FLEXIBILITY_OWNERSHIP_SCHEMA}.`, INPUT_CODE);
    }
    if (claim.applied && claim.ownerPackageId !== FLEXIBILITY_OWNER_PACKAGE_ID) {
      fail(
        `${field} reports that ${claim.ownerPackageId} applied component flexibility; only ${FLEXIBILITY_OWNER_PACKAGE_ID} may change stiffness, and the code package consumes resultants and factors without doing so.`,
        'PIPING_COMPONENT_FLEXIBILITY_OWNERSHIP_FOREIGN',
      );
    }
    for (const target of claim.flexibilityTargets) {
      if (owned.has(target)) {
        fail(
          `${field} applies flexibility to ${target}, which ${owned.get(target)} already owns; run and branch rotational flexibility is applied by exactly one component model.`,
          'PIPING_COMPONENT_FLEXIBILITY_OWNERSHIP_CONFLICT',
        );
      }
      owned.set(target, claim.componentId);
    }
    accepted.push(claim);
  }
  return deepFreeze({
    ownerPackageId: FLEXIBILITY_OWNER_PACKAGE_ID,
    claimCount: accepted.length,
    targets: [...owned.keys()].sort(compareAscii),
    appliedComponentIds: accepted
      .filter((claim) => claim.applied)
      .map((claim) => claim.componentId)
      .sort(compareAscii),
  });
}
