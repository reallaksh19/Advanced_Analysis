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
  EMPIRICAL_FAILURE_CODES,
  solveScaledDenseSystem,
} from '../../core/empirical-piping-mechanics/index.js';
import {
  requireSjsonEmpiricalPipingRequest,
} from './adapters/sjson-to-empirical-piping-request.js';
import {
  EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS,
  requireEmpiricalRestraintNetworkProfile,
} from './empirical-restraint-network-profile.js';
import {
  requireRegisteredEmpiricalMethod,
} from './empirical-method-registry.js';

export const EMPIRICAL_RESTRAINT_NETWORK_METHOD_ID = 'EMPIRICAL_RESTRAINT_NETWORK_V1';
export const EMPIRICAL_RESTRAINT_NETWORK_EXECUTION_REQUEST_SCHEMA =
  'empirical-restraint-network-execution-request/v1';
export const EMPIRICAL_RESTRAINT_NETWORK_EXECUTION_RESULT_SCHEMA =
  'empirical-restraint-network-execution-result/v1';

const REQUEST_KEYS = Object.freeze([
  'schema',
  'executionId',
  'executedAt',
  'adaptedRequest',
  'sharedModel',
  'topologyGraph',
  'supportAttachmentModel',
  'restraintCapabilityModel',
  'runtimeProfile',
  'analysisDirection',
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
  'status',
  'summary',
  'analysisDirection',
  'loadCases',
  'evidence',
  'semanticHash',
]);
const CASE_CONFIGURATION_KEYS = Object.freeze([
  'loadCaseId',
  'referenceTemperatureC',
  'analysisTemperatureC',
]);

export function executeEmpiricalRestraintNetworkRuntime(value) {
  exactKeys(value, REQUEST_KEYS, 'empirical restraint-network execution request');
  if (value.schema !== EMPIRICAL_RESTRAINT_NETWORK_EXECUTION_REQUEST_SCHEMA) {
    throw new TypeError('Unsupported empirical restraint-network execution request schema.');
  }
  const request = requireSjsonEmpiricalPipingRequest(value.adaptedRequest);
  const profile = requireEmpiricalRestraintNetworkProfile(value.runtimeProfile);
  requireRegisteredEmpiricalMethod(request.method);
  if (request.method !== EMPIRICAL_RESTRAINT_NETWORK_METHOD_ID) {
    throw new TypeError(`Restraint-network runtime cannot execute ${request.method}.`);
  }
  assertAuthorities(value, request, profile);
  const analysisDirection = unitVector(value.analysisDirection, 'analysisDirection');
  const configurations = requireCaseConfigurations(value.caseConfigurations, request.loadCases);
  const requestBlockers = (request.blockers || []).filter((row) => row.severity === 'ERROR');
  let network = null;
  let topologyBlockers = [];
  if (requestBlockers.length === 0) {
    try {
      network = buildRestrictedNetwork({
        request,
        profile,
        sharedModel: value.sharedModel,
        topologyGraph: value.topologyGraph,
        analysisDirection,
      });
    } catch (error) {
      topologyBlockers = [errorBlocker(error)];
    }
  }
  const globalBlockers = uniqueBlockers([
    ...requestBlockers,
    ...topologyBlockers,
    ...profileBlockers(profile),
  ]);
  const loadCases = request.loadCases.map((loadCase) => {
    const configuration = configurations.get(loadCase.loadCaseId);
    const ownership = loadOwnershipBlockers(loadCase, configuration);
    const blockers = uniqueBlockers([...globalBlockers, ...ownership]);
    if (blockers.length > 0 || !network) return blockedLoadCase(loadCase, blockers);
    try {
      return solveThermalLoadCase({
        loadCase,
        configuration,
        network,
        request,
        profile,
        analysisDirection,
      });
    } catch (error) {
      return blockedLoadCase(loadCase, [errorBlocker(error)]);
    }
  });
  const blockedCaseCount = loadCases.filter((row) => row.status === 'BLOCKED').length;
  const draft = {
    schema: EMPIRICAL_RESTRAINT_NETWORK_EXECUTION_RESULT_SCHEMA,
    method: EMPIRICAL_RESTRAINT_NETWORK_METHOD_ID,
    executionId: requiredString(value.executionId, 'executionId'),
    executedAt: timestamp(value.executedAt, 'executedAt'),
    datasetId: request.datasetId,
    adaptedRequestSemanticHash: request.semanticHash,
    runtimeProfileSemanticHash: profile.semanticHash,
    status: blockedCaseCount > 0 ? 'BLOCKED' : 'CALCULATED',
    summary: {
      loadCaseCount: loadCases.length,
      calculatedCaseCount: loadCases.length - blockedCaseCount,
      blockedCaseCount,
      nodeCount: network?.nodes.length || 0,
      segmentCount: network?.segments.length || 0,
      includedRestraintCount: network?.restraints.length || 0,
      excludedRestraintCount: network?.excludedRestraints.length || 0,
    },
    analysisDirection,
    loadCases,
    evidence: deepFreeze({
      methodRegistration: requireRegisteredEmpiricalMethod(
        EMPIRICAL_RESTRAINT_NETWORK_METHOD_ID,
      ),
      sourceBindings: request.sourceBindings,
      adapterEvidenceSemanticHash: request.adapterEvidence.semanticHash,
      coordinateFrameSemanticHash: request.coordinateFrame.semanticHash,
      profileQualification: profile.qualification,
      profileLocked: profile.locked,
      runtimeAuthority: 'NORMALIZED_AUTHORITIES_ONLY',
      compatibilitySystem: 'GLOBAL_SCALAR_NETWORK',
      independentRestraintCalculation: false,
      rawSjsonConsumed: false,
      benchmarkDataConsumed: false,
    }),
  };
  return requireEmpiricalRestraintNetworkExecutionResult({
    ...draft,
    semanticHash: semanticHash(draft),
  });
}

export function requireEmpiricalRestraintNetworkExecutionResult(value) {
  exactKeys(value, RESULT_KEYS, 'empirical restraint-network execution result');
  if (value.schema !== EMPIRICAL_RESTRAINT_NETWORK_EXECUTION_RESULT_SCHEMA) {
    throw new TypeError('Unsupported empirical restraint-network execution result schema.');
  }
  if (value.method !== EMPIRICAL_RESTRAINT_NETWORK_METHOD_ID) {
    throw new TypeError('Empirical restraint-network result method mismatch.');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw new TypeError('Empirical restraint-network result semantic hash mismatch.');
  }
  return deepFreeze(structuredClone(value));
}

function buildRestrictedNetwork(context) {
  if (context.topologyGraph.summary.cycleCount > 0) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.TOPOLOGY_LOOP_PROFILE_REQUIRED,
      'Closed-loop topology is outside the WP5 restricted restraint-network domain.',
      { cycleCount: context.topologyGraph.summary.cycleCount },
    );
  }
  const classified = classifyOccurrences(
    context.request.restraintOccurrences,
    context.analysisDirection,
    context.profile,
  );
  if (classified.included.length < 3) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
      'The restricted network requires two terminal anchors and at least one directional restraint.',
    );
  }
  const region = selectOneRegion(context.topologyGraph, classified.included);
  const componentSet = new Set(region.componentKeys);
  const components = context.sharedModel.components.filter((row) => componentSet.has(row.componentKey));
  const allowed = new Set(context.profile.domain.allowedComponentTypes);
  components.forEach((component) => {
    const type = normalizedType(component.type);
    if (!allowed.has(type)) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Component ${component.componentKey} type ${type} is outside the WP5 straight-component domain.`,
      );
    }
    if ((component.geometry?.ports || []).length !== 2) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.TOPOLOGY_BRANCH_PROFILE_REQUIRED,
        `Component ${component.componentKey} does not have exactly two ports.`,
      );
    }
  });
  const topology = buildEndpointTopology(
    components,
    context.topologyGraph,
    context.sharedModel.units.length,
  );
  const terminalNodeIds = topology.nodeDegrees
    .filter((row) => row.degree === 1)
    .map((row) => row.nodeId)
    .sort();
  if (topology.nodeDegrees.some((row) => row.degree > 2)) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.TOPOLOGY_BRANCH_PROFILE_REQUIRED,
      'A topology junction has degree greater than two.',
      { nodeDegrees: topology.nodeDegrees },
    );
  }
  if (terminalNodeIds.length !== 2) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
      'An open chain must have exactly two terminal topology nodes.',
      { terminalNodeIds, nodeDegrees: topology.nodeDegrees },
    );
  }
  const componentById = new Map(components.map((row) => [row.componentKey, row]));
  const occurrencesByComponent = groupBy(classified.included, 'hostEntityId');
  const nodeMap = new Map(topology.endpointNodes.map((node) => [node.id, node]));
  const segments = [];
  const restraintNodeById = {};
  for (const componentKey of [...region.componentKeys].sort()) {
    compileStraightComponent({
      component: componentById.get(componentKey),
      occurrences: occurrencesByComponent.get(componentKey) || [],
      profile: context.profile,
      analysisDirection: context.analysisDirection,
      topology,
      nodeMap,
      segments,
      restraintNodeById,
    });
  }
  const restraintDefinitions = compileRestraintDefinitions({
    occurrences: classified.included,
    restraintNodeById,
    terminalNodeIds,
    profile: context.profile,
  });
  return deepFreeze({
    regionId: region.connectedComponentId,
    componentKeys: [...region.componentKeys],
    nodes: [...nodeMap.values()].sort(byField('id')),
    segments: segments.sort(byField('id')),
    terminalNodeIds,
    restraints: restraintDefinitions.restraints,
    terminalAnchorIds: restraintDefinitions.terminalAnchorIds,
    finiteGapRestraintId: restraintDefinitions.finiteGapRestraintId,
    finiteStiffnessRestraintId: restraintDefinitions.finiteStiffnessRestraintId,
    restraintNodeById,
    excludedRestraints: classified.excluded,
    topologyEvidence: {
      connectedComponentId: region.connectedComponentId,
      cycleCount: context.topologyGraph.summary.cycleCount,
      terminalNodeIds,
      nodeDegrees: topology.nodeDegrees,
      branchCount: 0,
      loopCount: 0,
    },
  });
}

function classifyOccurrences(occurrences, analysisDirection, profile) {
  const included = [];
  const excluded = [];
  for (const occurrence of occurrences) {
    const capability = occurrence.effectiveCapability || {};
    if (isAnchor(capability.type)) {
      included.push(occurrence);
      continue;
    }
    const axis = capability.axis;
    if (!Array.isArray(axis)) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.RESTRAINT_AXIS_AMBIGUOUS,
        `Restraint ${occurrence.restraintId} has no effective axis.`,
      );
    }
    const cosine = Math.abs(dot(axis, analysisDirection));
    if (cosine <= profile.tolerances.directionOrthogonalCosine) {
      excluded.push(deepFreeze({
        supportSiteId: occurrence.supportSiteId,
        restraintId: occurrence.restraintId,
        reasonCode: 'ORTHOGONAL_TO_ANALYSIS_DIRECTION',
        axis,
        directionCosine: cosine,
      }));
      continue;
    }
    if (cosine < profile.tolerances.directionParallelCosine) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.RESTRAINT_AXIS_AMBIGUOUS,
        `Restraint ${occurrence.restraintId} axis is neither parallel nor orthogonal to the analysis direction.`,
        { axis, analysisDirection, directionCosine: cosine },
      );
    }
    if (!isDirectionalRestraint(capability.type)) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Restraint ${occurrence.restraintId} type ${capability.type} is not a qualified guide/line-stop function.`,
      );
    }
    included.push(occurrence);
  }
  return deepFreeze({
    included: included.sort(byField('restraintId')),
    excluded: excluded.sort(byField('restraintId')),
  });
}

function selectOneRegion(topologyGraph, occurrences) {
  const componentToRegion = new Map();
  topologyGraph.connectedComponents.forEach((region) => {
    region.componentKeys.forEach((componentKey) => componentToRegion.set(componentKey, region));
  });
  const regions = [...new Map(occurrences.map((row) => {
    const region = componentToRegion.get(row.hostEntityId);
    return [region?.connectedComponentId || `missing:${row.hostEntityId}`, region];
  })).values()].filter(Boolean);
  if (regions.length !== 1) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
      'All included restraints must belong to one connected open-chain region.',
      { regionIds: regions.map((row) => row.connectedComponentId) },
    );
  }
  return regions[0];
}

function buildEndpointTopology(components, topologyGraph, sourceLengthUnit) {
  const factorMm = canonicalLengthFactor(sourceLengthUnit);
  if (factorMm === null) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      'Shared-model length units cannot be converted to millimeters.',
    );
  }
  const portById = new Map(topologyGraph.ports.map((row) => [row.portKey, row]));
  const componentPorts = components.flatMap((component) => (
    (component.geometry?.ports || []).map((port) => port.portKey)
  ));
  const dsu = createDisjointSet(componentPorts);
  topologyGraph.connections.forEach((connection) => {
    if (dsu.parent.has(connection.portAKey) && dsu.parent.has(connection.portBKey)) {
      union(dsu, connection.portAKey, connection.portBKey);
    }
  });
  const groups = new Map();
  componentPorts.forEach((portId) => {
    const root = find(dsu, portId);
    const rows = groups.get(root) || [];
    rows.push(portId);
    groups.set(root, rows);
  });
  const representativeByPortId = {};
  const endpointNodes = [];
  [...groups.values()].forEach((portIds) => {
    const sorted = [...portIds].sort();
    const representative = sorted[0];
    const points = sorted.map((portId) => portById.get(portId)?.positionCanonical)
      .filter(Boolean);
    if (points.length !== sorted.length) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
        `Topology endpoint ${representative} has a missing position.`,
      );
    }
    const pointM = mmPointToM(points[0]);
    points.slice(1).forEach((point) => {
      if (distance(pointM, mmPointToM(point)) > 1e-9) {
        throw runtimeError(
          EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
          `Connected topology endpoint ${representative} has conflicting positions.`,
        );
      }
    });
    sorted.forEach((portId) => { representativeByPortId[portId] = representative; });
    endpointNodes.push(deepFreeze({ id: `NODE:${representative}`, pointM }));
  });
  const degree = new Map(endpointNodes.map((row) => [row.id, 0]));
  components.forEach((component) => {
    const ports = orientedPorts(component, portById, factorMm / 1000);
    const nodeIId = `NODE:${representativeByPortId[ports[0].portKey]}`;
    const nodeJId = `NODE:${representativeByPortId[ports[1].portKey]}`;
    if (nodeIId === nodeJId) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.TOPOLOGY_LOOP_PROFILE_REQUIRED,
        `Component ${component.componentKey} closes onto the same topology node.`,
      );
    }
    degree.set(nodeIId, (degree.get(nodeIId) || 0) + 1);
    degree.set(nodeJId, (degree.get(nodeJId) || 0) + 1);
  });
  return deepFreeze({
    factorM: factorMm / 1000,
    portById,
    representativeByPortId,
    endpointNodes,
    nodeDegrees: [...degree.entries()].map(([nodeId, value]) => ({
      nodeId,
      degree: value,
    })).sort(byField('nodeId')),
  });
}

function compileStraightComponent(state) {
  const ports = orientedPorts(
    state.component,
    state.topology.portById,
    state.topology.factorM,
  );
  const pointI = mmPointToM(ports[0].topologyPort.positionCanonical);
  const pointJ = mmPointToM(ports[1].topologyPort.positionCanonical);
  const nodeIId = `NODE:${state.topology.representativeByPortId[ports[0].portKey]}`;
  const nodeJId = `NODE:${state.topology.representativeByPortId[ports[1].portKey]}`;
  const stations = [
    { t: 0, nodeId: nodeIId, pointM: pointI, restraintIds: [] },
    { t: 1, nodeId: nodeJId, pointM: pointJ, restraintIds: [] },
  ];
  for (const occurrence of state.occurrences) {
    const pointM = mmPointToM(occurrence.attachmentPointMm);
    const projection = projectPointToSegment(pointM, pointI, pointJ);
    if (!projection || projection.distanceM > state.profile.tolerances.pointProjectionM) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
        `Restraint ${occurrence.restraintId} does not project onto host ${state.component.componentKey}.`,
        { projection },
      );
    }
    stations.push({
      t: projection.t,
      nodeId: stationNodeId(state.component.componentKey, projection.t),
      pointM: projection.pointM,
      restraintIds: [occurrence.restraintId],
    });
  }
  const merged = mergeStations(
    stations,
    state.profile.tolerances.pointProjectionM,
    distance(pointI, pointJ),
    { nodeIId, nodeJId, pointI, pointJ },
  );
  merged.forEach((station) => {
    addNode(state.nodeMap, deepFreeze({ id: station.nodeId, pointM: station.pointM }));
    station.restraintIds.forEach((restraintId) => {
      state.restraintNodeById[restraintId] = station.nodeId;
    });
  });
  const lineId = stringValue(state.component.identity?.lineId);
  const line = state.profile.lineProperties[lineId];
  if (!line) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.SECTION_INVALID,
      `Component ${state.component.componentKey} has no profile-bound line properties.`,
      { lineId },
    );
  }
  const section = annularSection(line.outsideDiameterM, line.wallThicknessM);
  for (let index = 0; index < merged.length - 1; index += 1) {
    const start = merged[index];
    const end = merged[index + 1];
    const vector = subtract(end.pointM, start.pointM);
    const lengthM = magnitude(vector);
    if (!(lengthM > 0)) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
        `Component ${state.component.componentKey} contains a zero-length network segment.`,
      );
    }
    const tangent = scale(vector, 1 / lengthM);
    const q = Math.pow(dot(tangent, state.analysisDirection), 2);
    const complianceMPerN = state.profile.compliance.topologyInteractionMultiplier * (
      state.profile.compliance.axialComplianceMultiplier
        * q * lengthM / (line.elasticModulusPa * section.areaM2)
      + state.profile.compliance.bendingComplianceMultiplier
        * (1 - q) * Math.pow(lengthM, 3)
        / (line.elasticModulusPa * section.secondMomentM4)
    );
    if (!(complianceMPerN > 0) || !Number.isFinite(complianceMPerN)) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.SECTION_INVALID,
        `Component ${state.component.componentKey} produced invalid directional compliance.`,
      );
    }
    state.segments.push(deepFreeze({
      id: `${state.component.componentKey}:S${String(index + 1).padStart(2, '0')}`,
      componentKey: state.component.componentKey,
      lineId,
      nodeIId: start.nodeId,
      nodeJId: end.nodeId,
      pointI: start.pointM,
      pointJ: end.pointM,
      tangent,
      lengthM,
      axialProjectionSquared: q,
      areaM2: section.areaM2,
      secondMomentM4: section.secondMomentM4,
      elasticModulusPa: line.elasticModulusPa,
      thermalExpansionPerK: line.thermalExpansionPerK,
      analysisDirection: state.analysisDirection,
      complianceMPerN,
      stiffnessNPerM: 1 / complianceMPerN,
      formulaTrace: [
        EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS.straightDirectionalCompliance,
      ],
    }));
  }
}

function compileRestraintDefinitions(context) {
  const restraints = [];
  const byNode = new Map();
  let finiteGapCount = 0;
  let finiteStiffnessCount = 0;
  for (const occurrence of context.occurrences) {
    const nodeId = context.restraintNodeById[occurrence.restraintId];
    if (!nodeId) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
        `No scalar network node exists for restraint ${occurrence.restraintId}.`,
      );
    }
    if (byNode.has(nodeId)) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.SUPPORT_CAPABILITY_UNKNOWN,
        `Multiple included restraint occurrences claim scalar node ${nodeId}.`,
      );
    }
    const capability = occurrence.effectiveCapability;
    const friction = capability.friction || 0;
    if (Math.abs(friction) > 0) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Restraint ${occurrence.restraintId} has nonzero friction.`,
      );
    }
    const gapM = (capability.gapMm || 0) / 1000;
    const supportStiffnessNPerM = capability.stiffnessNPerM;
    if (gapM > 0 && !occurrence.overrideId) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.CONTACT_RECONTACT_RULE_UNQUALIFIED,
        `Finite gap at ${occurrence.restraintId} requires an explicit mm-based scenario override.`,
      );
    }
    if (supportStiffnessNPerM !== null && !occurrence.overrideId) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Finite stiffness at ${occurrence.restraintId} requires an explicit N/m scenario override.`,
      );
    }
    if (gapM > 0 && supportStiffnessNPerM !== null) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        `Restraint ${occurrence.restraintId} combines finite gap and finite stiffness.`,
      );
    }
    let restraintClass = 'RIGID_DIRECTIONAL';
    if (isAnchor(capability.type)) restraintClass = 'ANCHOR';
    else if (gapM > 0) {
      restraintClass = 'BILATERAL_SYMMETRIC_GAP';
      finiteGapCount += 1;
    } else if (supportStiffnessNPerM !== null) {
      restraintClass = 'FINITE_GROUND_STIFFNESS';
      finiteStiffnessCount += 1;
    }
    const row = deepFreeze({
      supportSiteId: occurrence.supportSiteId,
      restraintId: occurrence.restraintId,
      sourceSupportIds: occurrence.sourceSupportIds,
      sourceEntityIds: occurrence.sourceEntityIds,
      hostEntityId: occurrence.hostEntityId,
      nodeId,
      restraintClass,
      gapM,
      supportStiffnessNPerM,
      overrideId: occurrence.overrideId,
      overrideReason: occurrence.overrideReason,
      anchorBasis: occurrence.anchorBasis,
      geometryChanged: false,
    });
    restraints.push(row);
    byNode.set(nodeId, row);
  }
  if (finiteGapCount > context.profile.domain.maximumFiniteGapCount) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
      'More than one finite bilateral gap is outside the WP5 domain.',
      { finiteGapCount },
    );
  }
  if (finiteStiffnessCount > context.profile.domain.maximumFiniteStiffnessCount) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
      'More than one finite support stiffness is outside the WP5 domain.',
      { finiteStiffnessCount },
    );
  }
  const terminalAnchorIds = context.terminalNodeIds.map((nodeId) => {
    const restraint = byNode.get(nodeId);
    if (!restraint || restraint.restraintClass !== 'ANCHOR') {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
        `Terminal node ${nodeId} requires exactly one anchor occurrence.`,
      );
    }
    return restraint.restraintId;
  });
  return deepFreeze({
    restraints: restraints.sort(byField('restraintId')),
    terminalAnchorIds: terminalAnchorIds.sort(),
    finiteGapRestraintId: restraints.find((row) => (
      row.restraintClass === 'BILATERAL_SYMMETRIC_GAP'
    ))?.restraintId || null,
    finiteStiffnessRestraintId: restraints.find((row) => (
      row.restraintClass === 'FINITE_GROUND_STIFFNESS'
    ))?.restraintId || null,
  });
}

function solveThermalLoadCase(context) {
  const deltaTK = context.configuration.analysisTemperatureC
    - context.configuration.referenceTemperatureC;
  const assembly = assembleScalarSystem(context.network, deltaTK);
  const terminalConstraints = constraintsFor(
    context.network.restraints.filter((row) => context.network.terminalAnchorIds.includes(row.restraintId)),
  );
  const baseline = solveConstrainedSystem(
    assembly,
    terminalConstraints,
    [],
    context.profile,
  );
  const finalState = solveFinalContactState({
    assembly,
    network: context.network,
    terminalConstraints,
    profile: context.profile,
  });
  const reactions = recoverRestraintReactions(
    context.network.restraints,
    finalState,
    assembly,
  );
  const equilibriumResidualN = reactions.reduce((sum, row) => (
    sum + row.reactionOnPipeN
  ), 0);
  if (Math.abs(equilibriumResidualN) > context.profile.tolerances.equilibriumN) {
    throw runtimeError(
      'EMPIRICAL_RESTRAINT_NETWORK_EQUILIBRIUM_FAILED',
      'Global scalar restraint reactions do not close.',
      { equilibriumResidualN, toleranceN: context.profile.tolerances.equilibriumN },
    );
  }
  const supportResults = context.network.restraints.map((restraint) => {
    const recovered = reactions.find((row) => row.restraintId === restraint.restraintId);
    const freeMovementM = baseline.displacementByNodeId[restraint.nodeId];
    const displacementM = finalState.solution.displacementByNodeId[restraint.nodeId];
    const sign = context.request.coordinateFrame.forceOutputConvention === 'RESTRAINT_ON_PIPE'
      ? 1
      : -1;
    const reportedReactionN = recovered.reactionOnPipeN * sign;
    const globalForce = scale(context.analysisDirection, reportedReactionN);
    return deepFreeze({
      supportSiteId: restraint.supportSiteId,
      restraintId: restraint.restraintId,
      sourceSupportIds: restraint.sourceSupportIds,
      sourceEntityIds: restraint.sourceEntityIds,
      hostEntityId: restraint.hostEntityId,
      nodeId: restraint.nodeId,
      contactState: recovered.contactState,
      activeFace: recovered.activeFace,
      trialFreeMovementM: freeMovementM,
      displacementM,
      gapM: restraint.gapM,
      effectiveStiffnessNPerM: restraint.supportStiffnessNPerM,
      reactionComponentN: reportedReactionN,
      forceConvention: context.request.coordinateFrame.forceOutputConvention,
      momentConvention: context.request.coordinateFrame.momentOutputConvention,
      globalReaction: {
        forceN: vectorRecord(globalForce),
        momentNm: { x: 0, y: 0, z: 0 },
      },
      anchorDecomposition: restraint.anchorBasis
        ? decomposeAnchor(globalForce, restraint.anchorBasis)
        : null,
      overrideId: restraint.overrideId,
      geometryChanged: false,
      occurrenceIdentity: restraint.restraintId,
      profileQualification: context.profile.qualification,
    });
  }).sort(byField('restraintId'));
  const memberActions = context.network.segments.map((segment) => {
    const deltaM = projectedThermalMovement(segment, deltaTK, context.analysisDirection);
    const displacementI = finalState.solution.displacementByNodeId[segment.nodeIId];
    const displacementJ = finalState.solution.displacementByNodeId[segment.nodeJId];
    return deepFreeze({
      segmentId: segment.id,
      componentKey: segment.componentKey,
      nodeIId: segment.nodeIId,
      nodeJId: segment.nodeJId,
      projectedThermalMovementM: deltaM,
      directionalForceN: segment.stiffnessNPerM
        * ((displacementJ - displacementI) - deltaM),
      complianceMPerN: segment.complianceMPerN,
      stiffnessNPerM: segment.stiffnessNPerM,
      formulaTrace: [
        EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS.straightDirectionalCompliance,
        EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS.projectedThermalMovement,
        EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS.restraintReactionRecovery,
      ],
    });
  });
  return deepFreeze({
    loadCaseId: context.loadCase.loadCaseId,
    label: context.loadCase.label,
    resultClass: context.loadCase.resultClass,
    status: 'CALCULATED',
    blockers: [],
    caseConfiguration: context.configuration,
    topologyEvidence: context.network.topologyEvidence,
    freeMovementByRestraintId: Object.fromEntries(supportResults.map((row) => [
      row.restraintId,
      row.trialFreeMovementM,
    ])),
    contactHistory: finalState.contactHistory,
    supportResults,
    memberActions,
    excludedRestraints: context.network.excludedRestraints,
    equilibrium: {
      reactionSumN: reactions.reduce((sum, row) => sum + row.reactionOnPipeN, 0),
      residualN: equilibriumResidualN,
      toleranceN: context.profile.tolerances.equilibriumN,
      closed: true,
    },
    numericalEvidence: finalState.solution.numericalEvidence,
    formulaTrace: Object.values(EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS),
    semanticHash: semanticHash({
      loadCaseId: context.loadCase.loadCaseId,
      deltaTK,
      supportResults,
      memberActions,
      equilibriumResidualN,
      contactHistory: finalState.contactHistory,
    }),
  });
}

function assembleScalarSystem(network, deltaTK) {
  const nodeIds = network.nodes.map((row) => row.id).sort();
  const indexByNodeId = Object.fromEntries(nodeIds.map((nodeId, index) => [nodeId, index]));
  const order = nodeIds.length;
  const matrix = Array.from({ length: order }, () => Array(order).fill(0));
  const rhs = Array(order).fill(0);
  for (const segment of network.segments) {
    const i = indexByNodeId[segment.nodeIId];
    const j = indexByNodeId[segment.nodeJId];
    const stiffness = segment.stiffnessNPerM;
    matrix[i][i] += stiffness;
    matrix[i][j] -= stiffness;
    matrix[j][i] -= stiffness;
    matrix[j][j] += stiffness;
    const deltaM = projectedThermalMovement(segment, deltaTK);
    rhs[i] -= stiffness * deltaM;
    rhs[j] += stiffness * deltaM;
  }
  return deepFreeze({ nodeIds, indexByNodeId, matrix, rhs, deltaTK });
}

function solveFinalContactState(context) {
  const rigidRestraints = context.network.restraints.filter((row) => (
    row.restraintClass === 'ANCHOR' || row.restraintClass === 'RIGID_DIRECTIONAL'
  ));
  const groundSprings = context.network.restraints.filter((row) => (
    row.restraintClass === 'FINITE_GROUND_STIFFNESS'
  ));
  const gap = context.network.restraints.find((row) => (
    row.restraintClass === 'BILATERAL_SYMMETRIC_GAP'
  )) || null;
  const constraints = constraintsFor(rigidRestraints);
  const inactive = solveConstrainedSystem(
    context.assembly,
    constraints,
    groundSprings,
    context.profile,
  );
  if (!gap) {
    return deepFreeze({
      solution: inactive,
      gapState: null,
      contactHistory: [{
        iteration: 1,
        activeFace: null,
        displacementM: null,
        action: 'NO_FINITE_GAP',
      }],
    });
  }
  const trial = inactive.displacementByNodeId[gap.nodeId];
  const tolerance = context.profile.tolerances.gapM;
  if (trial <= gap.gapM + tolerance && trial >= -gap.gapM - tolerance) {
    return deepFreeze({
      solution: inactive,
      gapState: { restraintId: gap.restraintId, activeFace: null, trialMovementM: trial },
      contactHistory: [{
        iteration: 1,
        restraintId: gap.restraintId,
        activeFace: null,
        displacementM: trial,
        action: 'REMAIN_INACTIVE_WITHIN_GAP',
      }],
    });
  }
  const activeFace = trial > gap.gapM ? 'POSITIVE' : 'NEGATIVE';
  const prescribedValue = activeFace === 'POSITIVE' ? gap.gapM : -gap.gapM;
  const active = solveConstrainedSystem(
    context.assembly,
    [...constraints, {
      restraintId: gap.restraintId,
      nodeId: gap.nodeId,
      prescribedValue,
      restraintClass: gap.restraintClass,
    }],
    groundSprings,
    context.profile,
  );
  const reaction = active.reactionByNodeId[gap.nodeId] || 0;
  const validSign = activeFace === 'POSITIVE'
    ? reaction <= context.profile.tolerances.reactionN
    : reaction >= -context.profile.tolerances.reactionN;
  if (!validSign) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.CONTACT_NONCONVERGENT,
      `Finite gap ${gap.restraintId} produced a reaction inconsistent with ${activeFace} contact.`,
      { reaction, activeFace, trial, prescribedValue },
    );
  }
  return deepFreeze({
    solution: active,
    gapState: {
      restraintId: gap.restraintId,
      activeFace,
      trialMovementM: trial,
      prescribedMovementM: prescribedValue,
      reactionOnPipeN: reaction,
    },
    contactHistory: [
      {
        iteration: 1,
        restraintId: gap.restraintId,
        activeFace: null,
        displacementM: trial,
        action: 'TRIAL_WITH_GAP_INACTIVE',
      },
      {
        iteration: 2,
        restraintId: gap.restraintId,
        activeFace,
        displacementM: active.displacementByNodeId[gap.nodeId],
        reactionOnPipeN: reaction,
        action: 'ACTIVATE_BILATERAL_GAP_FACE',
      },
    ],
  });
}

function solveConstrainedSystem(assembly, constraints, groundSprings, profile) {
  const matrix = assembly.matrix.map((row) => [...row]);
  const rhs = [...assembly.rhs];
  for (const spring of groundSprings) {
    const index = assembly.indexByNodeId[spring.nodeId];
    matrix[index][index] += spring.supportStiffnessNPerM;
  }
  const prescribed = new Map();
  constraints.forEach((constraint) => {
    if (prescribed.has(constraint.nodeId)
      && Math.abs(prescribed.get(constraint.nodeId) - constraint.prescribedValue) > 1e-12) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
        `Conflicting prescribed values exist at node ${constraint.nodeId}.`,
      );
    }
    prescribed.set(constraint.nodeId, constraint.prescribedValue);
  });
  const freeNodeIds = assembly.nodeIds.filter((nodeId) => !prescribed.has(nodeId));
  const displacement = Array(assembly.nodeIds.length).fill(0);
  prescribed.forEach((value, nodeId) => {
    displacement[assembly.indexByNodeId[nodeId]] = value;
  });
  let numericalEvidence;
  if (freeNodeIds.length > 0) {
    const freeIndices = freeNodeIds.map((nodeId) => assembly.indexByNodeId[nodeId]);
    const reduced = freeIndices.map((rowIndex) => freeIndices.map((columnIndex) => (
      matrix[rowIndex][columnIndex]
    )));
    const reducedRhs = freeIndices.map((rowIndex) => {
      let value = rhs[rowIndex];
      prescribed.forEach((prescribedValue, nodeId) => {
        value -= matrix[rowIndex][assembly.indexByNodeId[nodeId]] * prescribedValue;
      });
      return value;
    });
    const solved = solveScaledDenseSystem(
      reduced,
      reducedRhs,
      profile.numericalOptions,
    );
    if (solved.scaledResidual > profile.tolerances.maximumScaledResidual) {
      throw runtimeError(
        EMPIRICAL_FAILURE_CODES.SYSTEM_ILL_CONDITIONED,
        'The restraint-network scaled residual exceeds the profile limit.',
        {
          scaledResidual: solved.scaledResidual,
          maximumScaledResidual: profile.tolerances.maximumScaledResidual,
        },
      );
    }
    freeIndices.forEach((index, position) => { displacement[index] = solved.solution[position]; });
    numericalEvidence = deepFreeze({
      rank: freeNodeIds.length,
      freeDofCount: freeNodeIds.length,
      constrainedDofCount: prescribed.size,
      minimumPivot: Math.min(...solved.pivots),
      reciprocalConditionEstimate: solved.reciprocalConditionEstimate,
      rigidModeCount: 0,
      scaledResidual: solved.scaledResidual,
      pivots: solved.pivots,
      pivotTolerance: solved.pivotTolerance,
    });
  } else {
    numericalEvidence = deepFreeze({
      rank: 0,
      freeDofCount: 0,
      constrainedDofCount: prescribed.size,
      minimumPivot: null,
      reciprocalConditionEstimate: 1,
      rigidModeCount: 0,
      scaledResidual: 0,
      pivots: [],
      pivotTolerance: 0,
    });
  }
  const residual = matrix.map((row, rowIndex) => (
    row.reduce((sum, coefficient, columnIndex) => (
      sum + coefficient * displacement[columnIndex]
    ), 0) - rhs[rowIndex]
  ));
  const reactionByNodeId = Object.fromEntries([...prescribed.keys()].map((nodeId) => [
    nodeId,
    residual[assembly.indexByNodeId[nodeId]],
  ]));
  return deepFreeze({
    displacementByNodeId: Object.fromEntries(assembly.nodeIds.map((nodeId, index) => [
      nodeId,
      displacement[index],
    ])),
    reactionByNodeId,
    residualByNodeId: Object.fromEntries(assembly.nodeIds.map((nodeId, index) => [
      nodeId,
      residual[index],
    ])),
    numericalEvidence,
    prescribedNodeIds: [...prescribed.keys()].sort(),
    groundSpringRestraintIds: groundSprings.map((row) => row.restraintId).sort(),
  });
}

function recoverRestraintReactions(restraints, finalState, assembly) {
  return restraints.map((restraint) => {
    let reactionOnPipeN = 0;
    let contactState = 'BILATERAL';
    let activeFace = null;
    if (restraint.restraintClass === 'FINITE_GROUND_STIFFNESS') {
      const displacement = finalState.solution.displacementByNodeId[restraint.nodeId];
      reactionOnPipeN = -restraint.supportStiffnessNPerM * displacement;
      contactState = 'ELASTIC';
    } else if (restraint.restraintClass === 'BILATERAL_SYMMETRIC_GAP') {
      if (finalState.gapState?.activeFace) {
        reactionOnPipeN = finalState.solution.reactionByNodeId[restraint.nodeId] || 0;
        contactState = 'ACTIVE';
        activeFace = finalState.gapState.activeFace;
      } else {
        reactionOnPipeN = 0;
        contactState = 'FREE_GAP';
      }
    } else {
      reactionOnPipeN = finalState.solution.reactionByNodeId[restraint.nodeId] || 0;
      contactState = restraint.restraintClass === 'ANCHOR' ? 'BILATERAL' : 'ACTIVE';
      activeFace = restraint.restraintClass === 'RIGID_DIRECTIONAL' ? 'ZERO_GAP' : null;
    }
    return deepFreeze({
      restraintId: restraint.restraintId,
      nodeId: restraint.nodeId,
      reactionOnPipeN,
      contactState,
      activeFace,
      formulaTrace: [
        EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS.restraintReactionRecovery,
      ],
    });
  }).sort(byField('restraintId'));
}

function constraintsFor(restraints) {
  return restraints.map((row) => ({
    restraintId: row.restraintId,
    nodeId: row.nodeId,
    prescribedValue: 0,
    restraintClass: row.restraintClass,
  }));
}

function projectedThermalMovement(segment, deltaTK) {
  return dot(segment.tangent, segmentAnalysisDirection(segment))
    * segment.thermalExpansionPerK * deltaTK * segment.lengthM;
}

function segmentAnalysisDirection(segment) {
  const direction = segment.analysisDirection;
  if (!Array.isArray(direction) || direction.length !== 3
    || direction.some((item) => !Number.isFinite(item))) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.RESTRAINT_AXIS_AMBIGUOUS,
      `Segment ${segment.id} has no immutable analysis direction.`,
    );
  }
  return direction;
}

function loadOwnershipBlockers(loadCase, configuration) {
  const rows = [];
  if (loadCase.resultClass !== 'THERMAL_LINE_STOP_SCREENING_RESULT') {
    rows.push(blocker(
      EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
      loadCase.loadCaseId,
      'The restraint-network method publishes thermal line-stop screening results only.',
    ));
  }
  if (!loadCase.effects.thermalStrain
    || loadCase.effects.weight
    || loadCase.effects.pressureCompatibility
    || loadCase.effects.pressureStress) {
    rows.push(blocker(
      EMPIRICAL_FAILURE_CODES.LOAD_CASE_OWNERSHIP_MISMATCH,
      loadCase.loadCaseId,
      'The WP5 network accepts thermal strain only.',
    ));
  }
  if (configuration.referenceTemperatureC === null
    || configuration.analysisTemperatureC === null) {
    rows.push(blocker(
      EMPIRICAL_FAILURE_CODES.LOAD_CASE_OWNERSHIP_MISMATCH,
      loadCase.loadCaseId,
      'Reference and analysis temperatures are required.',
    ));
  }
  return rows;
}

function profileBlockers(profile) {
  return profile.qualification === 'QUALIFIED' && profile.locked === true
    ? []
    : [blocker(
      EMPIRICAL_FAILURE_CODES.EMPIRICAL_PROFILE_UNQUALIFIED,
      profile.profileId,
      'A qualified locked restraint-network profile is required.',
    )];
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
    topologyEvidence: null,
    freeMovementByRestraintId: {},
    contactHistory: [],
    supportResults: [],
    memberActions: [],
    excludedRestraints: [],
    equilibrium: null,
    numericalEvidence: null,
    formulaTrace: [],
    semanticHash: semanticHash({
      loadCaseId: loadCase.loadCaseId,
      status: 'BLOCKED',
      blockers: normalized,
    }),
  });
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
  if (request.datasetId !== value.sharedModel.project.datasetId
    || request.datasetId !== value.topologyGraph.datasetId
    || request.datasetId !== value.supportAttachmentModel.datasetId
    || request.datasetId !== value.restraintCapabilityModel.datasetId) {
    throw new TypeError('Restraint-network authorities do not share one datasetId.');
  }
  const expected = {
    sharedModelHash: value.sharedModel.semanticHash,
    topologyHash: value.topologyGraph.semanticHash,
    attachmentHash: value.supportAttachmentModel.semanticHash,
    restraintHash: value.restraintCapabilityModel.semanticHash,
    profileHash: profile.semanticHash,
  };
  Object.entries(expected).forEach(([field, hash]) => {
    if (request.sourceBindings[field] !== hash) {
      throw new TypeError(`Restraint-network ${field} binding is stale.`);
    }
  });
  if (request.profileRef.profileId !== profile.profileId
    || request.profileRef.profileVersion !== profile.profileVersion
    || request.profileRef.qualification !== profile.qualification
    || request.profileRef.locked !== profile.locked) {
    throw new TypeError('Restraint-network profile identity differs from the scenario profile.');
  }
}

function requireCaseConfigurations(rows, loadCases) {
  if (!Array.isArray(rows)) throw new TypeError('caseConfigurations must be an array.');
  const map = new Map();
  rows.forEach((row) => {
    exactKeys(row, CASE_CONFIGURATION_KEYS, 'restraint-network caseConfiguration');
    const loadCaseId = requiredString(row.loadCaseId, 'caseConfiguration.loadCaseId');
    if (map.has(loadCaseId)) throw new TypeError(`Duplicate case configuration ${loadCaseId}.`);
    map.set(loadCaseId, deepFreeze({
      loadCaseId,
      referenceTemperatureC: finiteOrNull(
        row.referenceTemperatureC,
        'referenceTemperatureC',
      ),
      analysisTemperatureC: finiteOrNull(
        row.analysisTemperatureC,
        'analysisTemperatureC',
      ),
    }));
  });
  const expected = loadCases.map((row) => row.loadCaseId).sort();
  const actual = [...map.keys()].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError('Case configurations must exactly match restraint-network load cases.');
  }
  return map;
}

function orientedPorts(component, portById, factorM) {
  const ports = (component.geometry?.ports || []).map((port) => ({
    ...port,
    topologyPort: portById.get(port.portKey),
  })).filter((port) => port.topologyPort?.positionCanonical);
  if (ports.length !== 2) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      `Component ${component.componentKey} requires exactly two positioned ports.`,
    );
  }
  const starts = ports.filter((row) => roleClass(row.role) === 'START');
  const ends = ports.filter((row) => roleClass(row.role) === 'END');
  if (starts.length === 1 && ends.length === 1) return [starts[0], ends[0]];
  const sourceStart = sourcePointToM(component.geometry?.start, factorM);
  const sourceEnd = sourcePointToM(component.geometry?.end, factorM);
  if (!sourceStart || !sourceEnd) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.RESTRAINT_AXIS_AMBIGUOUS,
      `Component ${component.componentKey} port orientation is not source-authoritative.`,
    );
  }
  const start = ports.find((row) => distance(
    mmPointToM(row.topologyPort.positionCanonical),
    sourceStart,
  ) <= 1e-9);
  const end = ports.find((row) => distance(
    mmPointToM(row.topologyPort.positionCanonical),
    sourceEnd,
  ) <= 1e-9);
  if (!start || !end || start.portKey === end.portKey) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.RESTRAINT_AXIS_AMBIGUOUS,
      `Component ${component.componentKey} source start/end do not orient its ports.`,
    );
  }
  return [start, end];
}

function mergeStations(rows, toleranceM, componentLengthM, endpoints) {
  const tTolerance = toleranceM / Math.max(componentLengthM, toleranceM);
  const sorted = [...rows].sort((left, right) => left.t - right.t || left.nodeId.localeCompare(right.nodeId));
  const result = [];
  for (const row of sorted) {
    const previous = result[result.length - 1];
    if (previous && Math.abs(previous.t - row.t) <= tTolerance) {
      previous.restraintIds.push(...row.restraintIds);
      if (row.t <= tTolerance) Object.assign(previous, {
        t: 0, nodeId: endpoints.nodeIId, pointM: endpoints.pointI,
      });
      if (1 - row.t <= tTolerance) Object.assign(previous, {
        t: 1, nodeId: endpoints.nodeJId, pointM: endpoints.pointJ,
      });
    } else {
      result.push({ ...row, restraintIds: [...row.restraintIds] });
    }
  }
  result.forEach((row) => { row.restraintIds = [...new Set(row.restraintIds)].sort(); });
  return result;
}

function projectPointToSegment(point, start, end) {
  if (!point) return null;
  const vector = subtract(end, start);
  const lengthSquared = dot(vector, vector);
  if (!(lengthSquared > 0)) return null;
  const rawT = dot(subtract(point, start), vector) / lengthSquared;
  const t = clamp(rawT, 0, 1);
  const pointM = add(start, scale(vector, t));
  return deepFreeze({ t, rawT, pointM, distanceM: distance(point, pointM) });
}

function annularSection(outsideDiameterM, wallThicknessM) {
  const insideDiameterM = outsideDiameterM - 2 * wallThicknessM;
  return deepFreeze({
    areaM2: Math.PI * (outsideDiameterM ** 2 - insideDiameterM ** 2) / 4,
    secondMomentM4: Math.PI * (outsideDiameterM ** 4 - insideDiameterM ** 4) / 64,
  });
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

function addNode(map, node) {
  const existing = map.get(node.id);
  if (existing && distance(existing.pointM, node.pointM) > 1e-9) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      `Scalar network node ${node.id} has conflicting coordinates.`,
    );
  }
  if (!existing) map.set(node.id, node);
}

function stationNodeId(componentKey, t) {
  if (t <= 1e-12) return `NODE:${componentKey}:START`;
  if (1 - t <= 1e-12) return `NODE:${componentKey}:END`;
  return `NODE:${componentKey}:S${t.toFixed(12)}`;
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

function errorBlocker(error) {
  return blocker(
    error?.code || EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
    error?.details?.scope || 'runtime',
    error instanceof Error ? error.message : String(error),
    error?.details || null,
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
    bucket.sort(byField('restraintId'));
    map.set(row[field], bucket);
  });
  return map;
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

function finiteOrNull(value, field) {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new TypeError(`${field} must be finite or null.`);
  return value;
}

function unitVector(value, field) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new TypeError(`${field} must contain three finite numbers.`);
  }
  const length = magnitude(value);
  if (Math.abs(length - 1) > 1e-8) throw new TypeError(`${field} must be a unit vector.`);
  return deepFreeze(value.map((item) => Object.is(item, -0) ? 0 : item));
}

function normalizedType(value) {
  return stringValue(value).toUpperCase().replace(/[ -]+/g, '_') || 'UNKNOWN';
}

function isAnchor(value) {
  const type = normalizedType(value);
  return type.includes('ANCHOR') || /(^|_)ANC(HOR)?($|_)/.test(type);
}

function isDirectionalRestraint(value) {
  const type = normalizedType(value);
  return type.includes('LINE_STOP')
    || type.includes('LINESTOP')
    || type.includes('LIMIT')
    || type.includes('GUIDE');
}

function roleClass(value) {
  const role = normalizedType(value);
  if (['START', 'FROM', 'INLET', 'BEGIN', 'PORT_A', 'A'].includes(role)) return 'START';
  if (['END', 'TO', 'OUTLET', 'FINISH', 'PORT_B', 'B'].includes(role)) return 'END';
  return 'UNKNOWN';
}

function sourcePointToM(point, factorM) {
  if (!isPlainRecord(point) || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
  return [point.x * factorM, point.y * factorM, point.z * factorM];
}

function mmPointToM(point) {
  if (!isPlainRecord(point) || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
  return [point.x / 1000, point.y / 1000, point.z / 1000];
}

function vectorRecord(vector) {
  return deepFreeze({ x: vector[0], y: vector[1], z: vector[2] });
}

function byField(field) {
  return (left, right) => String(left[field]).localeCompare(String(right[field]));
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

function magnitude(vector) {
  return Math.hypot(...vector);
}

function distance(left, right) {
  return magnitude(subtract(left, right));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
