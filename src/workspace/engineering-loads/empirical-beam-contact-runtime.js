import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
  validateSharedPipingModel,
} from '../../core/shared-piping-model/index.js';
import {
  canonicalLengthFactor,
  validatePipingPortTopologyGraph,
} from '../../core/piping-topology/index.js';
import {
  validateRestraintCapabilityModel,
  validateSupportAttachmentModel,
} from '../../core/support-restraints/index.js';
import {
  validateModelLoadPrimitiveSet,
} from '../../core/model-loads/index.js';
import {
  EMPIRICAL_FAILURE_CODES,
  EMPIRICAL_PIPING_METHOD_ID,
  assemblePlanarSystem,
  compileEmpiricalMember,
  compileSegmentedPlanarElbow,
  evaluatePlanarEquilibrium,
  recoverMemberActions,
  recoverUniformLoadInternalExtrema,
  resolveSectionStates,
  solvePlanarRestContact,
  verifyJointActionBalance,
} from '../../core/empirical-piping-mechanics/index.js';
import {
  requireSjsonEmpiricalPipingRequest,
} from './adapters/sjson-to-empirical-piping-request.js';
import {
  requireRegisteredEmpiricalMethod,
} from './empirical-method-registry.js';
import {
  requireEmpiricalBeamContactRuntimeProfile,
} from './empirical-beam-contact-runtime-profile.js';

export const EMPIRICAL_BEAM_CONTACT_EXECUTION_REQUEST_SCHEMA =
  'empirical-beam-contact-execution-request/v1';
export const EMPIRICAL_BEAM_CONTACT_EXECUTION_RESULT_SCHEMA =
  'empirical-beam-contact-execution-result/v1';

const REQUEST_KEYS = Object.freeze([
  'schema',
  'executionId',
  'executedAt',
  'adaptedRequest',
  'sharedModel',
  'topologyGraph',
  'supportAttachmentModel',
  'restraintCapabilityModel',
  'loadPrimitiveSet',
  'runtimeProfile',
  'caseConfigurations',
]);
const RESULT_KEYS = Object.freeze([
  'schema',
  'method',
  'executionId',
  'executedAt',
  'datasetId',
  'adaptedRequestSemanticHash',
  'runtimeProfileSemanticHash',
  'loadPrimitiveSetSemanticHash',
  'status',
  'summary',
  'loadCases',
  'evidence',
  'semanticHash',
]);
const CASE_CONFIGURATION_KEYS = Object.freeze([
  'loadCaseId',
  'weightPrimitiveCaseId',
  'referenceTemperatureC',
  'analysisTemperatureC',
]);
const WEIGHT_CASE_IDS = Object.freeze(['EMPTY', 'HYD', 'OPE']);

export function executeEmpiricalBeamContactRuntime(value) {
  exactKeys(value, REQUEST_KEYS, 'empirical beam/contact execution request');
  if (value.schema !== EMPIRICAL_BEAM_CONTACT_EXECUTION_REQUEST_SCHEMA) {
    throw new TypeError('Unsupported empirical beam/contact execution-request schema.');
  }
  const request = requireSjsonEmpiricalPipingRequest(value.adaptedRequest);
  const profile = requireEmpiricalBeamContactRuntimeProfile(value.runtimeProfile);
  requireRegisteredEmpiricalMethod(request.method);
  if (request.method !== EMPIRICAL_PIPING_METHOD_ID) {
    throw new TypeError(`Beam/contact runtime cannot execute ${request.method}.`);
  }
  assertAuthorities(value, request, profile);
  const caseConfigurations = requireCaseConfigurations(
    value.caseConfigurations,
    request.loadCases,
  );
  const topology = buildRuntimeTopology(value.sharedModel, value.topologyGraph, profile);
  const activeRegions = selectActiveRegions(
    value.topologyGraph,
    request.restraintOccurrences,
  );
  const loadCases = request.loadCases.map((loadCase) => executeLoadCase({
    loadCase,
    caseConfiguration: caseConfigurations.get(loadCase.loadCaseId),
    request,
    profile,
    sharedModel: value.sharedModel,
    topologyGraph: value.topologyGraph,
    loadPrimitiveSet: value.loadPrimitiveSet,
    topology,
    activeRegions,
  }));
  const blockedCaseCount = loadCases.filter((row) => row.status === 'BLOCKED').length;
  const status = blockedCaseCount > 0 ? 'BLOCKED' : 'CALCULATED';
  const draft = {
    schema: EMPIRICAL_BEAM_CONTACT_EXECUTION_RESULT_SCHEMA,
    method: EMPIRICAL_PIPING_METHOD_ID,
    executionId: requiredString(value.executionId, 'executionId'),
    executedAt: timestamp(value.executedAt, 'executedAt'),
    datasetId: request.datasetId,
    adaptedRequestSemanticHash: request.semanticHash,
    runtimeProfileSemanticHash: profile.semanticHash,
    loadPrimitiveSetSemanticHash: value.loadPrimitiveSet.semanticHash,
    status,
    summary: {
      loadCaseCount: loadCases.length,
      calculatedCaseCount: loadCases.length - blockedCaseCount,
      blockedCaseCount,
      regionCount: activeRegions.length,
      supportResultCount: loadCases.reduce((total, row) => (
        total + (row.supportResults?.length || 0)
      ), 0),
    },
    loadCases,
    evidence: deepFreeze({
      methodRegistration: requireRegisteredEmpiricalMethod(EMPIRICAL_PIPING_METHOD_ID),
      sourceBindings: request.sourceBindings,
      adapterEvidenceSemanticHash: request.adapterEvidence.semanticHash,
      coordinateFrameSemanticHash: request.coordinateFrame.semanticHash,
      profileQualification: profile.qualification,
      profileLocked: profile.locked,
      runtimeAuthority: 'NORMALIZED_AUTHORITIES_ONLY',
      rawSjsonConsumed: false,
      benchmarkDataConsumed: false,
    }),
  };
  return requireEmpiricalBeamContactExecutionResult({
    ...draft,
    semanticHash: semanticHash(draft),
  });
}

export function requireEmpiricalBeamContactExecutionResult(value) {
  exactKeys(value, RESULT_KEYS, 'empirical beam/contact execution result');
  if (value.schema !== EMPIRICAL_BEAM_CONTACT_EXECUTION_RESULT_SCHEMA) {
    throw new TypeError('Unsupported empirical beam/contact execution-result schema.');
  }
  if (value.method !== EMPIRICAL_PIPING_METHOD_ID) {
    throw new TypeError('Empirical beam/contact result method mismatch.');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw new TypeError('Empirical beam/contact execution result semantic hash mismatch.');
  }
  return deepFreeze(structuredClone(value));
}

function executeLoadCase(context) {
  const blockers = [
    ...context.request.blockers,
    ...loadOwnershipBlockers(context.loadCase, context.caseConfiguration),
  ];
  if (context.profile.qualification !== 'QUALIFIED' || context.profile.locked !== true) {
    blockers.push(blocker(
      EMPIRICAL_FAILURE_CODES.EMPIRICAL_PROFILE_UNQUALIFIED,
      context.profile.profileId,
      'A qualified locked runtime profile is required.',
    ));
  }
  if (blockers.some((row) => row.severity === 'ERROR')) {
    return blockedLoadCase(context.loadCase, blockers);
  }
  try {
    const regions = context.activeRegions.map((region) => solveRegion({
      ...context,
      region,
    }));
    const supportResults = regions.flatMap((region) => region.supportResults)
      .sort(byField('restraintId'));
    return deepFreeze({
      loadCaseId: context.loadCase.loadCaseId,
      label: context.loadCase.label,
      resultClass: context.loadCase.resultClass,
      status: 'CALCULATED',
      blockers: [],
      caseConfiguration: context.caseConfiguration,
      regionCount: regions.length,
      regions,
      supportResults,
      semanticHash: semanticHash({
        loadCaseId: context.loadCase.loadCaseId,
        caseConfiguration: context.caseConfiguration,
        regions,
        supportResults,
      }),
    });
  } catch (error) {
    return blockedLoadCase(context.loadCase, [errorBlocker(error)]);
  }
}

function solveRegion(context) {
  const compilation = compileRegion(context);
  const contact = solvePlanarRestContact({
    nodes: compilation.nodes,
    members: compilation.members,
    nodalLoads: compilation.nodalLoads,
    bilateralConstraints: compilation.bilateralConstraints,
    unilateralRests: compilation.unilateralRests,
    absoluteReactionToleranceN: context.profile.tolerances.absoluteReactionN,
    relativeReactionTolerance: context.profile.tolerances.relativeReaction,
    gapToleranceM: context.profile.tolerances.contactGapM,
  }, context.profile.numericalOptions);
  const finalConstraints = [
    ...compilation.bilateralConstraints,
    ...contact.activeRestIds.map((restraintId) => ({
      id: `REST:${restraintId}`,
      nodeId: compilation.supportNodeByRestraintId[restraintId],
      dof: 'UY',
      prescribedValue: 0,
      capability: 'UNILATERAL_Y_PLUS',
    })),
  ];
  const assembled = assemblePlanarSystem({
    nodes: compilation.nodes,
    members: compilation.members,
    nodalLoads: compilation.nodalLoads,
    constraints: finalConstraints,
  });
  if (assembled.semanticIdentity !== contact.result.assembledIdentity) {
    throw runtimeError(
      'EMPIRICAL_FINAL_ACTIVE_SET_IDENTITY_MISMATCH',
      'Final active-set assembly identity differs from the solved contact result.',
    );
  }
  const memberActions = recoverMemberActions(assembled, contact.result);
  const memberActionById = new Map(memberActions.map((row) => [row.memberId, row]));
  const internalExtrema = assembled.members.map((member) => (
    recoverUniformLoadInternalExtrema(member, memberActionById.get(member.id))
  ));
  const equilibrium = evaluatePlanarEquilibrium(assembled, contact.result);
  const jointBalance = verifyJointActionBalance({
    assembled,
    memberActions,
    solution: contact.result,
    toleranceN: Math.max(
      context.profile.tolerances.equilibriumForceN,
      context.profile.tolerances.equilibriumMomentNm,
    ),
  });
  verifyEquilibrium(equilibrium, context.profile.tolerances);
  if (!jointBalance.ok) {
    throw runtimeError(
      'EMPIRICAL_JOINT_ACTION_BALANCE_FAILED',
      'Recovered member actions do not close at joints.',
      jointBalance,
    );
  }
  const supportResults = buildSupportResults({
    request: context.request,
    region: context.region,
    compilation,
    contact,
    solution: contact.result,
  });
  return deepFreeze({
    regionId: context.region.connectedComponentId,
    componentIds: [...context.region.componentKeys],
    nodeCount: assembled.nodes.length,
    memberCount: assembled.members.length,
    supportResults,
    activeRestraintIds: [...contact.activeRestIds],
    liftedRestraintIds: [...contact.inactiveRestIds],
    contactHistory: {
      schema: contact.schema,
      iterations: contact.iterations,
      reactionsByRestId: contact.reactionsByRestId,
      gapsByRestId: contact.gapsByRestId,
      semanticIdentity: contact.semanticIdentity,
    },
    memberActions,
    internalExtrema,
    equilibrium,
    jointBalance,
    numericalEvidence: contact.result.numericalEvidence,
    assembledIdentity: assembled.semanticIdentity,
    solutionIdentity: contact.result.semanticIdentity,
    formulaTrace: uniqueStrings([
      ...contact.formulaTrace,
      ...contact.result.formulaTrace,
      ...assembled.members.flatMap((member) => member.formulaTrace),
      ...memberActions.flatMap((row) => row.formulaTrace),
      ...internalExtrema.flatMap((row) => row.formulaTrace),
      ...equilibrium.formulaTrace,
    ]),
  });
}

function compileRegion(context) {
  const regionSet = new Set(context.region.componentKeys);
  const regionOccurrences = context.request.restraintOccurrences.filter((row) => (
    regionSet.has(row.hostEntityId)
  ));
  const primitives = context.loadCase.effects.weight
    ? context.loadPrimitiveSet.primitives.filter((row) => (
      row.loadCaseId === context.caseConfiguration.weightPrimitiveCaseId
      && regionSet.has(row.componentKey)
    ))
    : [];
  const primitivesByComponent = groupBy(primitives, 'componentKey');
  const occurrencesByComponent = groupBy(regionOccurrences, 'hostEntityId');
  const nodes = new Map();
  const members = [];
  const nodalLoads = [];
  const supportNodeByRestraintId = {};
  const componentStationEvidence = [];
  const componentById = new Map(context.sharedModel.components.map((row) => [row.componentKey, row]));
  const runtimeContext = {
    ...context,
    regionPlaneOffset: determineRegionPlaneOffset(context, componentById),
  };

  for (const componentKey of [...context.region.componentKeys].sort()) {
    const component = componentById.get(componentKey);
    if (!component) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
        `Active topology component ${componentKey} is missing from the shared model.`,
      );
    }
    const type = normalizedType(component.type);
    const componentPrimitives = primitivesByComponent.get(componentKey) || [];
    const componentOccurrences = occurrencesByComponent.get(componentKey) || [];
    const lineProperties = requireLineProperties(component, context.profile);
    const sectionStates = resolveSectionStates({
      outsideDiameterM: lineProperties.outsideDiameterM,
      nominalWallM: lineProperties.nominalWallM,
      stiffnessWallM: lineProperties.stiffnessWallM,
      weightWallM: lineProperties.weightWallM,
      corrosionAllowanceM: lineProperties.corrosionAllowanceM,
      codeStressWallRule: 'NOMINAL_MINUS_CORROSION',
      authority: {
        nominalWall: lineProperties.authority.section,
        stiffnessWall: lineProperties.authority.section,
        weightWall: lineProperties.authority.section,
        codeStressWall: lineProperties.authority.section,
      },
    });
    const thermal = context.loadCase.effects.thermalStrain
      ? {
        alphaPerK: lineProperties.thermalExpansionPerK,
        deltaTK: context.caseConfiguration.analysisTemperatureC
          - context.caseConfiguration.referenceTemperatureC,
      }
      : null;
    const distributedLoad = distributedLoadFor(
      componentPrimitives,
      context.request.coordinateFrame,
      context.loadCase.effects.weight,
      componentKey,
    );

    if (isElbow(type)) {
      compileElbowComponent({
        component,
        componentOccurrences,
        componentPrimitives,
        context: runtimeContext,
        sectionStates,
        lineProperties,
        thermal,
        distributedLoad,
        nodes,
        members,
        nodalLoads,
        supportNodeByRestraintId,
        componentStationEvidence,
      });
    } else if (isStraightPipe(type)) {
      compileStraightComponent({
        component,
        componentOccurrences,
        componentPrimitives,
        context: runtimeContext,
        sectionStates,
        lineProperties,
        thermal,
        distributedLoad,
        nodes,
        members,
        nodalLoads,
        supportNodeByRestraintId,
        componentStationEvidence,
      });
    } else {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Component ${componentKey} type ${type} is outside the WP2 beam/contact runtime domain.`,
      );
    }
  }

  const restraints = compileRestraints(
    regionOccurrences,
    supportNodeByRestraintId,
    context.request.coordinateFrame.verticalUnitVector,
  );
  if (restraints.bilateralConstraints.length === 0) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
      `Region ${context.region.connectedComponentId} has no qualified bilateral boundary.`,
    );
  }
  return deepFreeze({
    nodes: [...nodes.values()].sort(byField('id')),
    members: members.sort(byField('id')),
    nodalLoads: combineNodalLoads(nodalLoads),
    bilateralConstraints: restraints.bilateralConstraints,
    unilateralRests: restraints.unilateralRests,
    supportNodeByRestraintId,
    constraintOwnerById: restraints.constraintOwnerById,
    componentStationEvidence,
  });
}

function compileStraightComponent(state) {
  const endpoints = componentEndpoints(state.component, state.context.topology);
  assertComponentPlanarity(endpoints.points, state.context.region, state.context, state.component.componentKey);
  const stationCandidates = [
    station(0, endpoints.nodeIId, endpoints.pointI, 'ENDPOINT'),
    station(1, endpoints.nodeJId, endpoints.pointJ, 'ENDPOINT'),
  ];
  for (const occurrence of state.componentOccurrences) {
    const pointM = mmPointToM(occurrence.attachmentPointMm);
    const projection = projectPointToSegment(pointM, endpoints.pointI, endpoints.pointJ);
    if (!projection || projection.distanceM > state.context.profile.tolerances.pointProjectionM) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
        `Support ${occurrence.restraintId} does not project onto host ${state.component.componentKey}.`,
        { projection },
      );
    }
    stationCandidates.push(station(
      projection.t,
      stationNodeId(state.component.componentKey, projection.t),
      projection.point,
      'SUPPORT',
      occurrence.restraintId,
    ));
  }
  for (const primitive of state.componentPrimitives) {
    if (primitive.primitiveType === 'DISTRIBUTED') continue;
    if (primitive.primitiveType === 'MOMENT') {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.LOAD_CASE_OWNERSHIP_MISMATCH,
        `Explicit point-moment primitive ${primitive.primitiveId} is not qualified in WP2.`,
      );
    }
    if (primitive.primitiveType !== 'POINT') {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.LOAD_CASE_OWNERSHIP_MISMATCH,
        `Unsupported load primitive ${primitive.primitiveType}.`,
      );
    }
    const projection = projectPointToSegment(
      pointRecordToArray(primitive.applicationPoint),
      endpoints.pointI,
      endpoints.pointJ,
    );
    if (!projection || projection.distanceM > state.context.profile.tolerances.pointProjectionM) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
        `Point load ${primitive.primitiveId} does not project onto ${state.component.componentKey}.`,
        { projection },
      );
    }
    stationCandidates.push(station(
      projection.t,
      stationNodeId(state.component.componentKey, projection.t),
      projection.point,
      'POINT_LOAD',
      primitive.primitiveId,
    ));
  }
  const stations = mergeStations(
    stationCandidates,
    state.context.profile.tolerances.pointProjectionM,
    endpoints,
  );
  stations.forEach((row) => addNode(state.nodes, projectNode(row.nodeId, row.point, state.context.request.coordinateFrame)));
  for (let index = 0; index < stations.length - 1; index += 1) {
    const nodeI = projectNode(
      stations[index].nodeId,
      stations[index].point,
      state.context.request.coordinateFrame,
    );
    const nodeJ = projectNode(
      stations[index + 1].nodeId,
      stations[index + 1].point,
      state.context.request.coordinateFrame,
    );
    state.members.push(compileEmpiricalMember({
      id: `${state.component.componentKey}:M${String(index + 1).padStart(2, '0')}`,
      nodeI,
      nodeJ,
      kind: 'STRAIGHT',
      sectionStates: state.sectionStates,
      elasticModulusPa: state.lineProperties.elasticModulusPa,
      uniformGlobalLoadNM: state.distributedLoad,
      thermal: state.thermal,
    }));
  }
  bindStations(state, stations);
}

function compileElbowComponent(state) {
  const endpoints = componentEndpoints(state.component, state.context.topology);
  const center = sourcePointToM(
    state.component.geometry?.center,
    state.context.topology.sourceLengthFactorM,
  );
  if (!center) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      `Elbow ${state.component.componentKey} requires a source-authoritative center point.`,
    );
  }
  assertComponentPlanarity(
    [...endpoints.points, center],
    state.context.region,
    state.context,
    state.component.componentKey,
  );
  const endpointBindings = new Map();
  for (const occurrence of state.componentOccurrences) {
    const pointM = mmPointToM(occurrence.attachmentPointMm);
    const endpoint = nearestEndpoint(pointM, endpoints, state.context.profile.tolerances.pointProjectionM);
    if (!endpoint) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Support ${occurrence.restraintId} lies inside elbow ${state.component.componentKey}; WP2 qualifies elbow endpoint restraints only.`,
      );
    }
    endpointBindings.set(occurrence.restraintId, endpoint.nodeId);
  }
  for (const primitive of state.componentPrimitives) {
    if (primitive.primitiveType === 'DISTRIBUTED') continue;
    if (primitive.primitiveType !== 'POINT') {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.LOAD_CASE_OWNERSHIP_MISMATCH,
        `Elbow ${state.component.componentKey} accepts distributed weight only in WP2.`,
      );
    }
    const endpoint = nearestEndpoint(
      pointRecordToArray(primitive.applicationPoint),
      endpoints,
      state.context.profile.tolerances.pointProjectionM,
    );
    if (!endpoint) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Point load ${primitive.primitiveId} lies inside an elbow and is not qualified in WP2.`,
      );
    }
    state.nodalLoads.push(pointLoad(
      primitive,
      endpoint.nodeId,
      state.context.request.coordinateFrame,
    ));
  }
  const projectedCenter = projectNode('CENTER', center, state.context.request.coordinateFrame);
  const projectedNear = projectNode(endpoints.nodeIId, endpoints.pointI, state.context.request.coordinateFrame);
  const projectedFar = projectNode(endpoints.nodeJId, endpoints.pointJ, state.context.request.coordinateFrame);
  const nearRadius = [projectedNear.xM - projectedCenter.xM, projectedNear.yM - projectedCenter.yM];
  const farRadius = [projectedFar.xM - projectedCenter.xM, projectedFar.yM - projectedCenter.yM];
  const radiusI = Math.hypot(...nearRadius);
  const radiusJ = Math.hypot(...farRadius);
  const scale = Math.max(1, radiusI, radiusJ);
  if (!(radiusI > 0) || Math.abs(radiusI - radiusJ) > (scale * 1e-8)) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      `Elbow ${state.component.componentKey} center does not define one radius.`,
      { radiusI, radiusJ },
    );
  }
  const includedAngleRad = Math.acos(clamp(
    ((nearRadius[0] * farRadius[0]) + (nearRadius[1] * farRadius[1])) / (radiusI * radiusJ),
    -1,
    1,
  ));
  if (!(includedAngleRad > 0)) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      `Elbow ${state.component.componentKey} included angle is zero.`,
    );
  }
  const crossZ = (nearRadius[0] * farRadius[1]) - (nearRadius[1] * farRadius[0]);
  const sweepSign = crossZ >= 0 ? 1 : -1;
  const elbow = compileSegmentedPlanarElbow({
    id: state.component.componentKey,
    nearNodeId: endpoints.nodeIId,
    farNodeId: endpoints.nodeJId,
    centerPoint: projectedCenter,
    nearPoint: projectedNear,
    includedAngleRad,
    sweepSign,
    segmentCount: state.context.profile.elbow.segmentCount,
    sectionStates: state.sectionStates,
    elasticModulusPa: state.lineProperties.elasticModulusPa,
    flexibilityFactor: state.context.profile.elbow.flexibilityFactor,
    uniformGlobalLoadNM: state.distributedLoad,
    thermal: state.thermal,
  });
  elbow.nodes.forEach((node) => addNode(state.nodes, node));
  state.members.push(...elbow.members);
  endpointBindings.forEach((nodeId, restraintId) => {
    state.supportNodeByRestraintId[restraintId] = nodeId;
  });
  state.componentStationEvidence.push(deepFreeze({
    componentKey: state.component.componentKey,
    kind: 'SEGMENTED_ELBOW',
    segmentCount: elbow.segmentCount,
    physicalArcLengthM: elbow.physicalArcLengthM,
    nodeIds: elbow.nodes.map((row) => row.id),
  }));
}

function bindStations(state, stations) {
  for (const row of stations) {
    for (const binding of row.bindings) {
      if (binding.kind === 'SUPPORT') {
        state.supportNodeByRestraintId[binding.id] = row.nodeId;
      }
      if (binding.kind === 'POINT_LOAD') {
        const primitive = state.componentPrimitives.find((item) => item.primitiveId === binding.id);
        state.nodalLoads.push(pointLoad(
          primitive,
          row.nodeId,
          state.context.request.coordinateFrame,
        ));
      }
    }
  }
  state.componentStationEvidence.push(deepFreeze({
    componentKey: state.component.componentKey,
    kind: 'STRAIGHT_SEGMENTED_AT_SUPPORTS_AND_POINT_LOADS',
    stations: stations.map((row) => ({
      nodeId: row.nodeId,
      t: row.t,
      bindings: row.bindings,
    })),
  }));
}

function compileRestraints(occurrences, nodeByRestraint, vertical) {
  const bilateralByDof = new Map();
  const unilateralByNode = new Map();
  const constraintOwnerById = {};
  for (const occurrence of [...occurrences].sort(byField('restraintId'))) {
    const nodeId = nodeByRestraint[occurrence.restraintId];
    if (!nodeId) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
        `No mechanics node exists for restraint ${occurrence.restraintId}.`,
      );
    }
    const capability = occurrence.effectiveCapability;
    if (isAnchor(capability.type)) {
      for (const dof of ['UX', 'UY', 'RZ']) {
        const key = `${nodeId}|${dof}`;
        if (bilateralByDof.has(key)) {
          throw runtimeError(
            EMPIRICAL_FAILURE_CODES.SUPPORT_CAPABILITY_UNKNOWN,
            `Multiple anchor constraints claim ${key}.`,
          );
        }
        const id = `ANCHOR:${occurrence.restraintId}:${dof}`;
        const constraint = deepFreeze({
          id,
          nodeId,
          dof,
          prescribedValue: 0,
          capability: 'BILATERAL_ANCHOR',
        });
        bilateralByDof.set(key, constraint);
        constraintOwnerById[id] = occurrence.restraintId;
      }
      continue;
    }
    const axis = capability.axis;
    if (capability.direction !== 'VERTICAL' || !axis || dot(axis, vertical) < 1 - 1e-8) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Restraint ${occurrence.restraintId} is not a positive-vertical planar rest.`,
      );
    }
    if ((capability.gapMm || 0) !== 0) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.CONTACT_RECONTACT_RULE_UNQUALIFIED,
        `Restraint ${occurrence.restraintId} has a finite initial gap.`,
      );
    }
    if (capability.stiffnessNPerM !== null || (capability.friction || 0) !== 0) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Restraint ${occurrence.restraintId} has finite stiffness or friction.`,
      );
    }
    if (unilateralByNode.has(nodeId)) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.SUPPORT_CAPABILITY_UNKNOWN,
        `Multiple unilateral rests claim node ${nodeId}.`,
      );
    }
    unilateralByNode.set(nodeId, deepFreeze({
      id: occurrence.restraintId,
      nodeId,
      dof: 'UY',
      normalSign: 1,
      initialGapM: 0,
    }));
  }
  return deepFreeze({
    bilateralConstraints: [...bilateralByDof.values()].sort(byField('id')),
    unilateralRests: [...unilateralByNode.values()].sort(byField('id')),
    constraintOwnerById,
  });
}

function buildSupportResults(context) {
  const occurrenceById = new Map(context.request.restraintOccurrences.map((row) => [
    row.restraintId,
    row,
  ]));
  const regionSet = new Set(context.region.componentKeys);
  const results = [];
  for (const occurrence of context.request.restraintOccurrences.filter((row) => (
    regionSet.has(row.hostEntityId)
  ))) {
    const nodeId = context.compilation.supportNodeByRestraintId[occurrence.restraintId];
    const displacement = context.solution.displacementByNode[nodeId];
    let planarForce = { x: 0, y: 0 };
    let momentNm = 0;
    let contactState = 'BILATERAL';
    let trialTensileReactionN = null;
    if (isAnchor(occurrence.effectiveCapability.type)) {
      planarForce = {
        x: context.solution.reactionByConstraint[
          `ANCHOR:${occurrence.restraintId}:UX`
        ] || 0,
        y: context.solution.reactionByConstraint[
          `ANCHOR:${occurrence.restraintId}:UY`
        ] || 0,
      };
      momentNm = context.solution.reactionByConstraint[
        `ANCHOR:${occurrence.restraintId}:RZ`
      ] || 0;
    } else {
      planarForce.y = context.contact.reactionsByRestId[occurrence.restraintId] || 0;
      contactState = context.contact.activeRestIds.includes(occurrence.restraintId)
        ? 'ACTIVE'
        : 'LIFTED';
      trialTensileReactionN = firstTrialReaction(
        context.contact.iterations,
        occurrence.restraintId,
      );
    }
    const sign = context.request.coordinateFrame.forceOutputConvention === 'RESTRAINT_ON_PIPE'
      ? 1
      : -1;
    const momentSign = context.request.coordinateFrame.momentOutputConvention === 'RESTRAINT_ON_PIPE'
      ? 1
      : -1;
    const globalForce = scale(add(
      scale(context.request.coordinateFrame.analysisPlaneBasis.u, planarForce.x),
      scale(context.request.coordinateFrame.analysisPlaneBasis.v, planarForce.y),
    ), sign);
    const globalMoment = scale(
      context.request.coordinateFrame.analysisPlaneBasis.normal,
      momentNm * momentSign,
    );
    const decomposition = occurrence.anchorBasis
      ? decomposeAnchor(globalForce, occurrence.anchorBasis)
      : null;
    results.push(deepFreeze({
      supportSiteId: occurrence.supportSiteId,
      restraintId: occurrence.restraintId,
      sourceSupportIds: occurrence.sourceSupportIds,
      sourceEntityIds: occurrence.sourceEntityIds,
      hostEntityId: occurrence.hostEntityId,
      nodeId,
      contactState,
      trialTensileReactionN,
      forceConvention: context.request.coordinateFrame.forceOutputConvention,
      momentConvention: context.request.coordinateFrame.momentOutputConvention,
      planarReaction: {
        xN: planarForce.x * sign,
        yN: planarForce.y * sign,
        rzNm: momentNm * momentSign,
      },
      globalReaction: {
        forceN: vectorRecord(globalForce),
        momentNm: vectorRecord(globalMoment),
      },
      anchorDecomposition: decomposition,
      displacement: {
        uxM: displacement.uxM,
        uyM: displacement.uyM,
        rzRad: displacement.rzRad,
        globalTranslationM: vectorRecord(add(
          scale(context.request.coordinateFrame.analysisPlaneBasis.u, displacement.uxM),
          scale(context.request.coordinateFrame.analysisPlaneBasis.v, displacement.uyM),
        )),
      },
      overrideId: occurrence.overrideId,
      geometryChanged: false,
      occurrenceIdentity: occurrenceById.get(occurrence.restraintId).restraintId,
    }));
  }
  return results.sort(byField('restraintId'));
}

function buildRuntimeTopology(sharedModel, topologyGraph, profile) {
  const sourceLengthFactorMm = canonicalLengthFactor(sharedModel.units.length);
  if (sourceLengthFactorMm === null) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      'Shared-model length units cannot be converted to meters.',
    );
  }
  const portById = new Map(topologyGraph.ports.map((row) => [row.portKey, row]));
  const disjoint = createDisjointSet(topologyGraph.ports.map((row) => row.portKey));
  topologyGraph.connections.forEach((row) => union(disjoint, row.portAKey, row.portBKey));
  const representativeByPortId = Object.fromEntries(topologyGraph.ports.map((row) => [
    row.portKey,
    [...topologyGraph.ports.map((candidate) => candidate.portKey)
      .filter((candidate) => find(disjoint, candidate) === find(disjoint, row.portKey))]
      .sort()[0],
  ]));
  return deepFreeze({
    portById,
    representativeByPortId,
    sourceLengthFactorM: sourceLengthFactorMm / 1000,
    planarityToleranceM: profile.tolerances.planarityM,
  });
}

function componentEndpoints(component, topology) {
  const ports = (component.geometry?.ports || []).map((port) => ({
    ...port,
    topologyPort: topology.portById.get(port.portKey),
  })).filter((port) => port.topologyPort?.positionCanonical);
  if (ports.length !== 2) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      `Component ${component.componentKey} requires exactly two positioned ports in WP2.`,
    );
  }
  const oriented = orientPorts(component, ports, topology.sourceLengthFactorM);
  if (!oriented) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.RESTRAINT_AXIS_AMBIGUOUS,
      `Component ${component.componentKey} port orientation is not source-authoritative.`,
    );
  }
  const pointI = mmPointToM(oriented[0].topologyPort.positionCanonical);
  const pointJ = mmPointToM(oriented[1].topologyPort.positionCanonical);
  return deepFreeze({
    pointI,
    pointJ,
    points: [pointI, pointJ],
    nodeIId: endpointNodeId(oriented[0].portKey, topology.representativeByPortId),
    nodeJId: endpointNodeId(oriented[1].portKey, topology.representativeByPortId),
  });
}

function orientPorts(component, ports, sourceLengthFactorM) {
  const start = ports.filter((row) => roleClass(row.role) === 'START');
  const end = ports.filter((row) => roleClass(row.role) === 'END');
  if (start.length === 1 && end.length === 1) return [start[0], end[0]];
  const sourceStart = sourcePointToM(component.geometry?.start, sourceLengthFactorM);
  const sourceEnd = sourcePointToM(component.geometry?.end, sourceLengthFactorM);
  if (!sourceStart || !sourceEnd) return null;
  const startPort = ports.find((row) => distance(
    mmPointToM(row.topologyPort.positionCanonical),
    sourceStart,
  ) <= 1e-9);
  const endPort = ports.find((row) => distance(
    mmPointToM(row.topologyPort.positionCanonical),
    sourceEnd,
  ) <= 1e-9);
  return startPort && endPort && startPort.portKey !== endPort.portKey
    ? [startPort, endPort]
    : null;
}

function selectActiveRegions(topologyGraph, occurrences) {
  const hostComponents = new Set(occurrences.map((row) => row.hostEntityId).filter(Boolean));
  const regions = topologyGraph.connectedComponents.filter((region) => (
    region.componentKeys.some((componentKey) => hostComponents.has(componentKey))
  ));
  if (regions.length === 0) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
      'No topology region contains a governed restraint occurrence.',
    );
  }
  return regions;
}

function assertAuthorities(value, request, profile) {
  assertValidation(validateSharedPipingModel(value.sharedModel), 'shared-piping-model/v1');
  assertValidation(
    validatePipingPortTopologyGraph(value.topologyGraph),
    'piping-port-topology-graph/v1',
  );
  assertValidation(
    validateSupportAttachmentModel(value.supportAttachmentModel),
    'support-attachment-model/v1',
  );
  assertValidation(
    validateRestraintCapabilityModel(value.restraintCapabilityModel),
    'restraint-capability-model/v1',
  );
  assertValidation(
    validateModelLoadPrimitiveSet(value.loadPrimitiveSet),
    'model-load-primitive-set/v1',
  );
  const expected = {
    datasetId: value.sharedModel.project.datasetId,
    sharedModelHash: value.sharedModel.semanticHash,
    topologyHash: value.topologyGraph.semanticHash,
    attachmentHash: value.supportAttachmentModel.semanticHash,
    restraintHash: value.restraintCapabilityModel.semanticHash,
    profileHash: profile.semanticHash,
  };
  if (request.datasetId !== expected.datasetId
    || value.loadPrimitiveSet.datasetId !== expected.datasetId) {
    throw new TypeError('Beam/contact execution authorities do not share one datasetId.');
  }
  Object.entries(expected).filter(([key]) => key !== 'datasetId').forEach(([key, hash]) => {
    if (request.sourceBindings[key] !== hash) {
      throw new TypeError(`Beam/contact execution ${key} binding is stale.`);
    }
  });
  if (request.profileRef.profileId !== profile.profileId
    || request.profileRef.profileVersion !== profile.profileVersion
    || request.profileRef.qualification !== profile.qualification
    || request.profileRef.locked !== profile.locked) {
    throw new TypeError('Runtime profile identity differs from the authorized scenario profile.');
  }
}

function requireCaseConfigurations(rows, loadCases) {
  if (!Array.isArray(rows)) throw new TypeError('caseConfigurations must be an array.');
  const map = new Map();
  rows.forEach((row) => {
    exactKeys(row, CASE_CONFIGURATION_KEYS, 'caseConfiguration');
    const loadCaseId = requiredString(row.loadCaseId, 'caseConfiguration.loadCaseId');
    if (map.has(loadCaseId)) throw new TypeError(`Duplicate case configuration ${loadCaseId}.`);
    map.set(loadCaseId, deepFreeze({
      loadCaseId,
      weightPrimitiveCaseId: row.weightPrimitiveCaseId === null
        ? null
        : oneOf(row.weightPrimitiveCaseId, WEIGHT_CASE_IDS, 'weightPrimitiveCaseId'),
      referenceTemperatureC: nullableFinite(
        row.referenceTemperatureC,
        'referenceTemperatureC',
      ),
      analysisTemperatureC: nullableFinite(
        row.analysisTemperatureC,
        'analysisTemperatureC',
      ),
    }));
  });
  const expected = loadCases.map((row) => row.loadCaseId).sort();
  const actual = [...map.keys()].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError('Case configurations must exactly match the adapted request load cases.');
  }
  return map;
}

function loadOwnershipBlockers(loadCase, configuration) {
  const rows = [];
  if (loadCase.effects.weight !== (configuration.weightPrimitiveCaseId !== null)) {
    rows.push(blocker(
      EMPIRICAL_FAILURE_CODES.LOAD_CASE_OWNERSHIP_MISMATCH,
      loadCase.loadCaseId,
      'Weight ownership does not match weightPrimitiveCaseId.',
    ));
  }
  const thermalConfigured = configuration.referenceTemperatureC !== null
    && configuration.analysisTemperatureC !== null;
  if (loadCase.effects.thermalStrain !== thermalConfigured) {
    rows.push(blocker(
      EMPIRICAL_FAILURE_CODES.LOAD_CASE_OWNERSHIP_MISMATCH,
      loadCase.loadCaseId,
      'Thermal ownership does not match the configured temperatures.',
    ));
  }
  if (loadCase.effects.pressureCompatibility) {
    rows.push(blocker(
      EMPIRICAL_FAILURE_CODES.LOAD_CASE_OWNERSHIP_MISMATCH,
      loadCase.loadCaseId,
      'Pressure thrust in compatibility is not qualified in the WP2 runtime bridge.',
    ));
  }
  if (loadCase.resultClass !== 'VERTICAL_SCREENING_RESULT') {
    rows.push(blocker(
      EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
      loadCase.loadCaseId,
      'EMPIRICAL_BEAM_CONTACT_V1 publishes vertical screening results only.',
    ));
  }
  return rows;
}

function determineRegionPlaneOffset(context, componentById) {
  const normal = context.request.coordinateFrame.analysisPlaneBasis.normal;
  for (const componentKey of [...context.region.componentKeys].sort()) {
    const component = componentById.get(componentKey);
    if (!component) continue;
    const endpoints = componentEndpoints(component, context.topology);
    return dot(endpoints.pointI, normal);
  }
  throw runtimeError(
    EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
    `Region ${context.region.connectedComponentId} has no component geometry.`,
  );
}

function assertComponentPlanarity(points, region, context, componentKey) {
  const normal = context.request.coordinateFrame.analysisPlaneBasis.normal;
  const offsets = points.map((point) => dot(point, normal));
  const regionOffset = context.regionPlaneOffset ?? offsets[0];
  offsets.forEach((offset) => {
    if (Math.abs(offset - regionOffset) > context.profile.tolerances.planarityM) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Component ${componentKey} is not planar in the authorized analysis basis.`,
        { offset, regionOffset },
      );
    }
  });
}

function distributedLoadFor(primitives, frame, weightRequired, componentKey) {
  const rows = primitives.filter((row) => row.primitiveType === 'DISTRIBUTED');
  if (!weightRequired) return deepFreeze({ x: 0, y: 0 });
  if (rows.length !== 1) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.MASS_SOURCE_UNRESOLVED,
      `Component ${componentKey} requires exactly one distributed weight primitive.`,
      { primitiveCount: rows.length },
    );
  }
  const gravityGlobal = scale(frame.verticalUnitVector, -rows[0].forcePerLengthNM);
  return deepFreeze({
    x: dot(gravityGlobal, frame.analysisPlaneBasis.u),
    y: dot(gravityGlobal, frame.analysisPlaneBasis.v),
  });
}

function pointLoad(primitive, nodeId, frame) {
  const gravityGlobal = scale(frame.verticalUnitVector, -primitive.pointForceN);
  return deepFreeze({
    id: primitive.primitiveId,
    nodeId,
    xN: dot(gravityGlobal, frame.analysisPlaneBasis.u),
    yN: dot(gravityGlobal, frame.analysisPlaneBasis.v),
    momentNm: 0,
  });
}

function combineNodalLoads(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const current = map.get(row.nodeId) || {
      id: `NODE_LOAD:${row.nodeId}`,
      nodeId: row.nodeId,
      xN: 0,
      yN: 0,
      momentNm: 0,
      sourcePrimitiveIds: [],
    };
    current.xN += row.xN || 0;
    current.yN += row.yN || 0;
    current.momentNm += row.momentNm || 0;
    current.sourcePrimitiveIds.push(row.id);
    map.set(row.nodeId, current);
  });
  return [...map.values()].map((row) => deepFreeze({
    ...row,
    sourcePrimitiveIds: uniqueStrings(row.sourcePrimitiveIds),
  })).sort(byField('nodeId'));
}

function requireLineProperties(component, profile) {
  const lineId = stringValue(component.identity?.lineId);
  const value = profile.lineProperties[lineId];
  if (!lineId || !value) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.SECTION_INVALID,
      `Component ${component.componentKey} has no profile-bound line properties.`,
      { lineId },
    );
  }
  return value;
}

function station(t, nodeId, point, kind, bindingId = null) {
  return {
    t: clamp(t, 0, 1),
    nodeId,
    point,
    bindings: bindingId ? [{ kind, id: bindingId }] : [],
  };
}

function mergeStations(rows, toleranceM, endpoints) {
  const lengthM = distance(endpoints.pointI, endpoints.pointJ);
  const tTolerance = toleranceM / Math.max(lengthM, toleranceM);
  const sorted = [...rows].sort((left, right) => left.t - right.t || left.nodeId.localeCompare(right.nodeId));
  const merged = [];
  for (const row of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && Math.abs(previous.t - row.t) <= tTolerance) {
      previous.bindings.push(...row.bindings);
      if (row.t <= tTolerance) {
        previous.nodeId = endpoints.nodeIId;
        previous.point = endpoints.pointI;
        previous.t = 0;
      } else if (1 - row.t <= tTolerance) {
        previous.nodeId = endpoints.nodeJId;
        previous.point = endpoints.pointJ;
        previous.t = 1;
      }
    } else {
      merged.push({
        ...row,
        bindings: [...row.bindings],
      });
    }
  }
  merged.forEach((row) => {
    row.bindings = row.bindings.sort((left, right) => (
      `${left.kind}|${left.id}`.localeCompare(`${right.kind}|${right.id}`)
    ));
  });
  return merged;
}

function projectPointToSegment(point, start, end) {
  if (!point) return null;
  const vector = subtract(end, start);
  const lengthSquared = dot(vector, vector);
  if (!(lengthSquared > 0)) return null;
  const rawT = dot(subtract(point, start), vector) / lengthSquared;
  const t = clamp(rawT, 0, 1);
  const projected = add(start, scale(vector, t));
  return deepFreeze({ t, point: projected, distanceM: distance(point, projected), rawT });
}

function nearestEndpoint(point, endpoints, tolerance) {
  const candidates = [
    { nodeId: endpoints.nodeIId, point: endpoints.pointI },
    { nodeId: endpoints.nodeJId, point: endpoints.pointJ },
  ].map((row) => ({ ...row, distanceM: distance(point, row.point) }))
    .sort((left, right) => left.distanceM - right.distanceM || left.nodeId.localeCompare(right.nodeId));
  return candidates[0].distanceM <= tolerance ? candidates[0] : null;
}

function projectNode(id, point, frame) {
  return deepFreeze({
    id,
    xM: dot(point, frame.analysisPlaneBasis.u),
    yM: dot(point, frame.analysisPlaneBasis.v),
  });
}

function addNode(map, node) {
  const existing = map.get(node.id);
  if (existing) {
    const difference = Math.hypot(existing.xM - node.xM, existing.yM - node.yM);
    if (difference > 1e-9) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
        `Mechanics node ${node.id} has conflicting coordinates.`,
      );
    }
    return;
  }
  map.set(node.id, node);
}

function endpointNodeId(portKey, representativeByPortId) {
  return `NODE:${representativeByPortId[portKey] || portKey}`;
}

function stationNodeId(componentKey, t) {
  if (t <= 1e-12) return `${componentKey}:START`;
  if (1 - t <= 1e-12) return `${componentKey}:END`;
  return `NODE:${componentKey}:S${t.toFixed(12)}`;
}

function sourcePointToM(point, factorM) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || !Number.isFinite(point.z)) return null;
  return [point.x * factorM, point.y * factorM, point.z * factorM];
}

function mmPointToM(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || !Number.isFinite(point.z)) return null;
  return [point.x / 1000, point.y / 1000, point.z / 1000];
}

function pointRecordToArray(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || !Number.isFinite(point.z)) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      'Load application point is missing or invalid.',
    );
  }
  return [point.x, point.y, point.z];
}

function decomposeAnchor(force, basis) {
  const labels = basis.labels;
  const values = [
    dot(force, basis.lineStop),
    dot(force, basis.rest),
    dot(force, basis.guide),
  ];
  return deepFreeze({
    labels,
    componentsN: Object.fromEntries(labels.map((label, index) => [label, values[index]])),
    basis: {
      lineStop: basis.lineStop,
      transverse1: basis.rest,
      transverse2: basis.guide,
    },
  });
}

function firstTrialReaction(iterations, restraintId) {
  const first = iterations[0]?.reactionsByRestId?.[restraintId];
  return Number.isFinite(first) && first < 0 ? first : null;
}

function verifyEquilibrium(equilibrium, tolerances) {
  const force = Math.hypot(
    equilibrium.forceResidualN.x,
    equilibrium.forceResidualN.y,
  );
  if (force > tolerances.equilibriumForceN
    || Math.abs(equilibrium.momentResidualNm) > tolerances.equilibriumMomentNm) {
    throw runtimeError(
      'EMPIRICAL_EQUILIBRIUM_FAILED',
      'Planar force or moment closure exceeds the runtime profile tolerance.',
      { equilibrium, tolerances },
    );
  }
}

function blockedLoadCase(loadCase, blockers) {
  const normalized = uniqueBlockers(blockers);
  return deepFreeze({
    loadCaseId: loadCase.loadCaseId,
    label: loadCase.label,
    resultClass: loadCase.resultClass,
    status: 'BLOCKED',
    blockers: normalized,
    caseConfiguration: null,
    regionCount: 0,
    regions: [],
    supportResults: [],
    semanticHash: semanticHash({
      loadCaseId: loadCase.loadCaseId,
      status: 'BLOCKED',
      blockers: normalized,
    }),
  });
}

function errorBlocker(error) {
  return blocker(
    error?.code || EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
    error?.evidence?.scope || error?.details?.scope || 'runtime',
    error instanceof Error ? error.message : String(error),
    error?.evidence || error?.details || null,
  );
}

function blocker(code, scope, message, details = null) {
  return deepFreeze({
    code,
    severity: 'ERROR',
    scope: String(scope || 'runtime'),
    message,
    details,
  });
}

function uniqueBlockers(rows) {
  return [...new Map(rows.map((row) => [
    `${row.code}|${row.scope}|${row.message}`,
    row,
  ])).values()].sort((left, right) => (
    `${left.severity}|${left.code}|${left.scope}`
      .localeCompare(`${right.severity}|${right.code}|${right.scope}`)
  ));
}

function runtimeError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function assertValidation(validation, label) {
  if (!validation.ok) throw new TypeError(`${label} is invalid: ${validation.errors.join(' ')}`);
}

function groupBy(rows, field) {
  const map = new Map();
  rows.forEach((row) => {
    const bucket = map.get(row[field]) || [];
    bucket.push(row);
    bucket.sort((left, right) => (
      String(left.primitiveId || left.restraintId || '').localeCompare(
        String(right.primitiveId || right.restraintId || ''),
      )
    ));
    map.set(row[field], bucket);
  });
  return map;
}

function createDisjointSet(keys) {
  return { parent: new Map(keys.map((key) => [key, key])) };
}

function find(dsu, key) {
  let root = key;
  while (dsu.parent.get(root) !== root) root = dsu.parent.get(root);
  let current = key;
  while (current !== root) {
    const next = dsu.parent.get(current);
    dsu.parent.set(current, root);
    current = next;
  }
  return root;
}

function union(dsu, left, right) {
  const leftRoot = find(dsu, left);
  const rightRoot = find(dsu, right);
  if (leftRoot === rightRoot) return;
  const [parent, child] = [leftRoot, rightRoot].sort();
  dsu.parent.set(child, parent);
}

function normalizedType(value) {
  return stringValue(value).toUpperCase().replace(/[ -]+/g, '_') || 'UNKNOWN';
}

function isStraightPipe(type) {
  return ['PIPE', 'STRAIGHT', 'TUBE'].includes(type);
}

function isElbow(type) {
  return type.includes('ELBOW') || type === 'BEND';
}

function isAnchor(type) {
  const normalized = normalizedType(type);
  return normalized.includes('ANCHOR') || /(^|_)ANC(HOR)?($|_)/.test(normalized);
}

function roleClass(value) {
  const role = normalizedType(value);
  if (['START', 'FROM', 'INLET', 'BEGIN', 'PORT_A', 'A'].includes(role)) return 'START';
  if (['END', 'TO', 'OUTLET', 'FINISH', 'PORT_B', 'B'].includes(role)) return 'END';
  return 'UNKNOWN';
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function timestamp(value, field) {
  const normalized = requiredString(value, field);
  if (!Number.isFinite(Date.parse(normalized))) throw new TypeError(`${field} must be an ISO timestamp.`);
  return normalized;
}

function nullableFinite(value, field) {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new TypeError(`${field} must be finite or null.`);
  return value;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

function byField(field) {
  return (left, right) => String(left[field]).localeCompare(String(right[field]));
}

function uniqueStrings(rows) {
  return [...new Set(rows.filter(Boolean))].sort();
}

function vectorRecord(value) {
  return deepFreeze({ x: value[0], y: value[1], z: value[2] });
}

function add(left, right) {
  return left.map((item, index) => item + right[index]);
}

function subtract(left, right) {
  return left.map((item, index) => item - right[index]);
}

function scale(vector, factor) {
  return vector.map((item) => item * factor);
}

function dot(left, right) {
  return left.reduce((sum, item, index) => sum + item * right[index], 0);
}

function distance(left, right) {
  return Math.hypot(...subtract(left, right));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
