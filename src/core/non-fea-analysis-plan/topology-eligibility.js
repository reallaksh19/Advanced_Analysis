import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';

export const NON_FEA_IMPLEMENTATION_TOPOLOGY_ELIGIBILITY_SCHEMA =
  'non-fea-implementation-topology-eligibility/v1';

const RESTRAINT_NETWORK_V1 = 'EMPIRICAL_RESTRAINT_NETWORK_V1';
const RESTRAINT_NETWORK_V2 = 'EMPIRICAL_RESTRAINT_NETWORK_V2';

/**
 * Evaluates only topology-domain suitability. It deliberately does not turn a
 * registered/unregistered or qualified/unqualified implementation into a
 * runnable method. Runtime/profile state is reported alongside topology state
 * so the two readiness dimensions remain explicit.
 */
export function evaluateNonFeaImplementationTopologyEligibility(input = {}) {
  const topology = requireAnalysisTopology(input.analysisTopology);
  const registry = requireImplementationRegistry(input.implementationRegistry);
  const recommendation = restraintNetworkRecommendation(topology);
  const implementationIds = [...new Set([
    ...registry.implementations.map((row) => row.implementationId),
    RESTRAINT_NETWORK_V1,
    RESTRAINT_NETWORK_V2,
  ])].sort(ascii);
  const rows = implementationIds.map((implementationId) => eligibilityRow(
    implementationId,
    topology,
    registry,
    recommendation,
  ));
  const base = {
    schema: NON_FEA_IMPLEMENTATION_TOPOLOGY_ELIGIBILITY_SCHEMA,
    analysisTopologySemanticHash: topology.semanticHash,
    implementationRegistrySemanticHash: registry.semanticHash,
    topologyClass: topology.topologyClass,
    restraintNetworkRecommendation: recommendation,
    rows,
    policy: {
      topologyEligibilityIsNotRuntimeQualification: true,
      topologyEligibilityIsNotAuthorization: true,
      topologyEligibilityIsNotExecution: true,
      implementationRegistryRemainsRuntimeAuthority: true,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaImplementationTopologyEligibility(value) {
  const errors = [];
  if (!isRecord(value)) return deepFreeze({ ok: false, errors: ['Topology eligibility receipt must be an object.'] });
  if (value.schema !== NON_FEA_IMPLEMENTATION_TOPOLOGY_ELIGIBILITY_SCHEMA) {
    errors.push(`Expected ${NON_FEA_IMPLEMENTATION_TOPOLOGY_ELIGIBILITY_SCHEMA}.`);
  }
  if (!validHash(value.analysisTopologySemanticHash)) errors.push('Analysis-topology hash is required.');
  if (!validHash(value.implementationRegistrySemanticHash)) errors.push('Implementation-registry hash is required.');
  if (!Array.isArray(value.rows)) errors.push('Topology eligibility rows must be an array.');
  else if (new Set(value.rows.map((row) => row.implementationId)).size !== value.rows.length) {
    errors.push('Topology eligibility implementation IDs must be unique.');
  }
  if (value.policy?.topologyEligibilityIsNotAuthorization !== true
      || value.policy?.topologyEligibilityIsNotExecution !== true) {
    errors.push('Topology eligibility policy cannot become authorization/execution authority.');
  }
  if (value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Topology eligibility semantic hash is invalid.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function eligibilityRow(implementationId, topology, registry, recommendation) {
  const registration = registry.implementations.find((row) => row.implementationId === implementationId) || null;
  if (![RESTRAINT_NETWORK_V1, RESTRAINT_NETWORK_V2].includes(implementationId)) {
    return deepFreeze({
      implementationId,
      topologyState: 'TOPOLOGY_NOT_GATED_HERE',
      runtimeState: registration?.runtimeState || 'NOT_REGISTERED',
      qualificationState: registration?.qualificationState || 'NOT_REGISTERED',
      selectionState: 'NOT_APPLICABLE',
      blockers: [],
    });
  }

  const blockers = restraintNetworkTopologyBlockers(implementationId, topology);
  const topologyErrors = blockers.filter((row) => row.severity === 'ERROR');
  const topologyState = topologyErrors.length ? 'OUTSIDE_TOPOLOGY_DOMAIN' : 'TOPOLOGY_ELIGIBLE';
  const runtimeState = registration?.runtimeState || 'NOT_REGISTERED';
  const qualificationState = registration?.qualificationState || 'NOT_REGISTERED';
  const selectedByTopology = recommendation.requiredImplementationId === implementationId;
  let selectionState = 'NOT_SELECTED_BY_TOPOLOGY';
  if (selectedByTopology) {
    if (topologyState !== 'TOPOLOGY_ELIGIBLE') selectionState = 'TOPOLOGY_BLOCKED';
    else if (!registration || runtimeState !== 'REGISTERED') selectionState = 'IMPLEMENTATION_REQUIRED_NOT_REGISTERED';
    else if (!['QUALIFIED', 'QUALIFIED_RESTRICTED_DOMAIN'].includes(qualificationState)) {
      selectionState = 'IMPLEMENTATION_REQUIRED_NOT_QUALIFIED';
    } else selectionState = 'TOPOLOGY_AND_REGISTRY_CANDIDATE';
  }
  return deepFreeze({
    implementationId,
    topologyState,
    runtimeState,
    qualificationState,
    selectionState,
    blockers,
  });
}

function restraintNetworkRecommendation(topology) {
  const metrics = topology.capabilityMetrics || {};
  const disconnected = metrics.connectedRegionCount !== 1;
  const branched = metrics.branchComponentCount > 0;
  const cyclic = metrics.independentCycleCount > 0;
  const openPortCount = metrics.openTopologyPortCount;
  let requiredImplementationId = null;
  let topologyRequirement = 'UNSUPPORTED_TOPOLOGY';
  const blockers = [];

  if (disconnected) {
    blockers.push(blocker(
      'TOPOLOGY_CONNECTED_REGION_REQUIRED',
      `Restraint reactions require one connected analysis region; found ${metrics.connectedRegionCount}.`,
    ));
  } else if (branched || cyclic) {
    requiredImplementationId = RESTRAINT_NETWORK_V2;
    topologyRequirement = branched && cyclic
      ? 'CONNECTED_BRANCH_LOOP_GRAPH_REQUIRES_V2'
      : branched ? 'CONNECTED_BRANCH_GRAPH_REQUIRES_V2' : 'CONNECTED_LOOP_GRAPH_REQUIRES_V2';
  } else if (openPortCount === 2) {
    requiredImplementationId = RESTRAINT_NETWORK_V1;
    topologyRequirement = 'OPEN_CHAIN_V1_CANDIDATE';
  } else {
    blockers.push(blocker(
      'TOPOLOGY_OPEN_CHAIN_TERMINALS_REQUIRED',
      `V1 open-chain topology requires exactly two open terminal ports; found ${openPortCount}.`,
    ));
  }

  return deepFreeze({
    requiredImplementationId,
    topologyRequirement,
    topologyOnly: true,
    boundaryQualificationStillRequired: true,
    restraintAxisQualificationStillRequired: true,
    thermalBasisStillRequired: true,
    blockers,
  });
}

function restraintNetworkTopologyBlockers(implementationId, topology) {
  const metrics = topology.capabilityMetrics || {};
  const rows = [];
  if (metrics.connectedRegionCount !== 1) rows.push(blocker(
    'TOPOLOGY_CONNECTED_REGION_REQUIRED',
    'Implementation requires one connected analysis region.',
  ));
  if (implementationId === RESTRAINT_NETWORK_V1) {
    if (metrics.independentCycleCount > 0) rows.push(blocker(
      'TOPOLOGY_LOOP_PROFILE_REQUIRED',
      'V1 does not accept closed-loop topology.',
    ));
    if (metrics.branchComponentCount > 0) rows.push(blocker(
      'TOPOLOGY_BRANCH_PROFILE_REQUIRED',
      'V1 does not accept branch topology.',
    ));
    if (metrics.openTopologyPortCount !== 2) rows.push(blocker(
      'TOPOLOGY_OPEN_CHAIN_TERMINALS_REQUIRED',
      'V1 requires exactly two open terminal topology ports.',
    ));
  } else if (implementationId === RESTRAINT_NETWORK_V2) {
    if (metrics.connectedRegionCount === 1 && metrics.branchComponentCount === 0
        && metrics.independentCycleCount === 0) {
      rows.push(blocker(
        'TOPOLOGY_V2_NOT_REQUIRED',
        'V2 is not topology-required for a simple open-chain region.',
        'INFO',
      ));
    }
  }
  return deepFreeze(rows.sort((left, right) => ascii(`${left.severity}|${left.code}`, `${right.severity}|${right.code}`)));
}

function requireAnalysisTopology(value) {
  if (!isRecord(value) || value.schema !== 'non-fea-analysis-topology/v1' || !validHash(value.semanticHash)) {
    throw new TypeError('Topology eligibility requires non-fea-analysis-topology/v1.');
  }
  return value;
}
function requireImplementationRegistry(value) {
  if (!isRecord(value) || value.schema !== 'non-fea-method-implementation-registry/v1'
      || !Array.isArray(value.implementations) || !validHash(value.semanticHash)) {
    throw new TypeError('Topology eligibility requires non-fea-method-implementation-registry/v1.');
  }
  return value;
}
function blocker(code, message, severity = 'ERROR') { return deepFreeze({ code, severity, message }); }
function validHash(value) { return typeof value === 'string' && value.includes(':'); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function withoutHash(value) { const copy = structuredClone(value); delete copy.semanticHash; return copy; }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
