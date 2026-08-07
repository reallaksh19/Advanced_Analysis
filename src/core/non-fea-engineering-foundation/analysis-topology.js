import { validatePipingPortTopologyGraph } from '../piping-topology/index.js';
import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  validateRestraintCapabilityModel,
  validateSupportAttachmentModel,
} from '../support-restraints/index.js';

export const NON_FEA_ANALYSIS_TOPOLOGY_SCHEMA = 'non-fea-analysis-topology/v1';

/**
 * Read-only common analysis projection. It consolidates reusable topology facts
 * without mutating canonical topology and without importing runtime-specific
 * solver, contact, planarity-tolerance, or qualification policy.
 */
export function createNonFeaAnalysisTopology(input = {}) {
  const topologyGraph = requireTopology(input.topologyGraph);
  const attachmentModel = requireAttachments(input.supportAttachmentModel, topologyGraph);
  const restraintModel = requireRestraints(input.restraintCapabilityModel, attachmentModel);
  const supportSiteModel = requireWorkspaceContract(
    input.supportSiteModel,
    'support-site-model/v1',
    'supportSiteModel',
    topologyGraph.datasetId,
  );
  const routePartitionModel = requireWorkspaceContract(
    input.routePartitionModel,
    'route-partition-model/v1',
    'routePartitionModel',
    topologyGraph.datasetId,
  );

  const issues = [];
  if (supportSiteModel.status !== 'READY') issues.push(issue(
    'ANALYSIS_TOPOLOGY_SUPPORT_SITES_NOT_READY',
    'supportSiteModel',
    'ERROR',
    `Support-site authority status is ${supportSiteModel.status}.`,
  ));
  if (routePartitionModel.status !== 'READY') issues.push(issue(
    'ANALYSIS_TOPOLOGY_ROUTE_PARTITIONS_NOT_READY',
    'routePartitionModel',
    'WARNING',
    `Route-partition authority status is ${routePartitionModel.status}.`,
  ));

  const componentMetrics = buildComponentMetrics(topologyGraph);
  const connectedRegions = buildConnectedRegions(topologyGraph, componentMetrics);
  const routeCrosswalk = buildRouteCrosswalk(routePartitionModel, topologyGraph);
  routeCrosswalk.filter((row) => row.state !== 'RESOLVED').forEach((row) => issues.push(issue(
    row.state === 'AMBIGUOUS'
      ? 'ANALYSIS_TOPOLOGY_ROUTE_CROSSWALK_AMBIGUOUS'
      : 'ANALYSIS_TOPOLOGY_ROUTE_CROSSWALK_UNRESOLVED',
    row.routeEdgeId,
    'WARNING',
    row.state === 'AMBIGUOUS'
      ? 'Route edge maps to multiple shared-model components by exact identity.'
      : 'Route edge has no exact identity crosswalk to a shared-model component.',
  )));

  const supportSiteCrosswalk = buildSupportSiteCrosswalk(supportSiteModel, attachmentModel);
  supportSiteCrosswalk.filter((row) => row.state !== 'RESOLVED').forEach((row) => issues.push(issue(
    'ANALYSIS_TOPOLOGY_SUPPORT_SITE_CROSSWALK_UNRESOLVED',
    row.supportSiteId,
    'WARNING',
    'Support site has no exact source-identity crosswalk to the shared-model support projection.',
  )));

  const supportStations = buildSupportStations({
    routePartitionModel,
    routeCrosswalk,
    supportSiteCrosswalk,
    attachmentModel,
  });
  supportStations.unresolved.forEach((row) => issues.push(issue(
    'ANALYSIS_TOPOLOGY_SUPPORT_STATION_UNRESOLVED',
    row.supportKey,
    'WARNING',
    row.reason,
  )));
  const memberSpans = buildMemberSpans(supportStations.resolved);
  const routeRegions = buildRouteRegions(routePartitionModel, routeCrosswalk, supportStations.resolved);
  const boundaryCandidates = buildBoundaryCandidates(topologyGraph, attachmentModel, restraintModel);
  const topologyClass = classifyTopology(connectedRegions);
  const state = issues.some((row) => row.severity === 'ERROR')
    ? 'BLOCKED'
    : issues.length ? 'PARTIALLY_READY' : 'READY';

  const base = {
    schema: NON_FEA_ANALYSIS_TOPOLOGY_SCHEMA,
    datasetId: topologyGraph.datasetId,
    state,
    sourceBindings: {
      topologyGraphSemanticHash: topologyGraph.semanticHash,
      supportAttachmentModelSemanticHash: attachmentModel.semanticHash,
      restraintCapabilityModelSemanticHash: restraintModel.semanticHash,
      supportSiteModelSemanticHash: semanticHash(supportSiteModel),
      routePartitionModelSemanticHash: semanticHash(routePartitionModel),
    },
    topologyClass,
    componentMetrics,
    connectedRegions,
    routeRegions,
    routeComponentCrosswalk: routeCrosswalk,
    supportSiteCrosswalk,
    supportStations: supportStations.resolved,
    unresolvedSupportStations: supportStations.unresolved,
    memberSpans,
    boundaryCandidates,
    planarityPolicy: {
      state: 'PROFILE_REQUIRED',
      reason: 'Planarity classification requires an explicitly governed tolerance/profile; none is common topology authority.',
    },
    capabilityMetrics: {
      connectedRegionCount: connectedRegions.length,
      branchComponentCount: componentMetrics.filter((row) => row.branchCandidate).length,
      independentCycleCount: connectedRegions.reduce((sum, row) => sum + row.independentCycleCount, 0),
      openTopologyPortCount: topologyGraph.ports.filter((row) => row.peerPortKeys.length === 0).length,
      readyRouteCount: routeRegions.filter((row) => row.status === 'READY').length,
      blockedRouteCount: routeRegions.filter((row) => row.status !== 'READY').length,
      exactRouteCrosswalkCount: routeCrosswalk.filter((row) => row.state === 'RESOLVED').length,
      unresolvedRouteCrosswalkCount: routeCrosswalk.filter((row) => row.state !== 'RESOLVED').length,
      resolvedSupportStationCount: supportStations.resolved.length,
      unresolvedSupportStationCount: supportStations.unresolved.length,
      supportSpanCount: memberSpans.length,
      topologyMutationCount: 0,
    },
    issues: uniqueIssues(issues),
    policy: {
      sourceTopologyAuthoritative: true,
      topologyMutationPermitted: false,
      supportMutationPermitted: false,
      fuzzyIdentityCrosswalkPermitted: false,
      runtimeQualificationAuthority: false,
      executionAuthority: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaAnalysisTopology(value) {
  const errors = [];
  if (!isRecord(value)) return deepFreeze({ ok: false, errors: ['Analysis topology must be an object.'] });
  if (value.schema !== NON_FEA_ANALYSIS_TOPOLOGY_SCHEMA) errors.push(`Expected ${NON_FEA_ANALYSIS_TOPOLOGY_SCHEMA}.`);
  if (!['READY', 'PARTIALLY_READY', 'BLOCKED'].includes(value.state)) errors.push('Analysis topology state is invalid.');
  if (!Array.isArray(value.connectedRegions)) errors.push('Analysis topology connectedRegions must be an array.');
  if (!Array.isArray(value.routeRegions)) errors.push('Analysis topology routeRegions must be an array.');
  if (!Array.isArray(value.supportStations)) errors.push('Analysis topology supportStations must be an array.');
  if (!Array.isArray(value.memberSpans)) errors.push('Analysis topology memberSpans must be an array.');
  if (value.policy?.topologyMutationPermitted !== false || value.policy?.supportMutationPermitted !== false) {
    errors.push('Analysis topology cannot permit topology/support mutation.');
  }
  if (value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Analysis topology semantic hash is invalid.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function buildComponentMetrics(graph) {
  const portByKey = new Map(graph.ports.map((row) => [row.portKey, row]));
  const incident = new Map(graph.components.map((row) => [row.componentKey, []]));
  graph.connections.forEach((connection) => {
    const left = portByKey.get(connection.portAKey)?.componentKey;
    const right = portByKey.get(connection.portBKey)?.componentKey;
    if (!left || !right || left === right) return;
    incident.get(left)?.push(connection.connectionId);
    incident.get(right)?.push(connection.connectionId);
  });
  return graph.components.map((component) => {
    const portKeys = component.portKeys || [];
    const openPortKeys = portKeys.filter((key) => (portByKey.get(key)?.peerPortKeys || []).length === 0).sort(ascii);
    const externalConnectionDegree = (incident.get(component.componentKey) || []).length;
    return deepFreeze({
      componentKey: component.componentKey,
      componentType: component.type,
      portCount: portKeys.length,
      externalConnectionDegree,
      openPortKeys,
      multiPortGeometry: portKeys.length > 2,
      branchCandidate: portKeys.length > 2 || externalConnectionDegree > 2,
    });
  }).sort(byField('componentKey'));
}

function buildConnectedRegions(graph, componentMetrics) {
  const metricsByComponent = new Map(componentMetrics.map((row) => [row.componentKey, row]));
  const portByKey = new Map(graph.ports.map((row) => [row.portKey, row]));
  return graph.connectedComponents.map((region) => {
    const set = new Set(region.componentKeys);
    const internalEdges = graph.connections.filter((connection) => {
      const left = portByKey.get(connection.portAKey)?.componentKey;
      const right = portByKey.get(connection.portBKey)?.componentKey;
      return left && right && left !== right && set.has(left) && set.has(right);
    });
    const cycleRank = Math.max(0, internalEdges.length - region.componentKeys.length + 1);
    const branchComponentKeys = region.componentKeys
      .filter((key) => metricsByComponent.get(key)?.branchCandidate)
      .sort(ascii);
    const openPortKeys = region.portKeys
      .filter((key) => (portByKey.get(key)?.peerPortKeys || []).length === 0)
      .sort(ascii);
    return deepFreeze({
      connectedRegionId: region.connectedComponentId,
      componentKeys: [...region.componentKeys].sort(ascii),
      portKeys: [...region.portKeys].sort(ascii),
      connectionIds: [...region.connectionIds].sort(ascii),
      branchComponentKeys,
      openPortKeys,
      cyclic: region.cyclic === true || cycleRank > 0,
      independentCycleCount: cycleRank,
      planarity: {
        state: 'PROFILE_REQUIRED',
        canonicalPointCount: region.portKeys.filter((key) => portByKey.get(key)?.positionCanonical).length,
      },
    });
  }).sort(byField('connectedRegionId'));
}

function buildRouteCrosswalk(routeModel, graph) {
  return (routeModel.edges || []).map((edge) => {
    const candidates = graph.components.flatMap((component) => {
      const basis = exactComponentIdentityBasis(edge, component);
      return basis.length ? [{ componentKey: component.componentKey, basis }] : [];
    });
    return deepFreeze({
      routeEdgeId: edge.edgeId,
      routeEntityId: edge.entityId,
      state: candidates.length === 1 ? 'RESOLVED' : candidates.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED',
      componentKey: candidates.length === 1 ? candidates[0].componentKey : null,
      exactBasis: candidates.length === 1 ? candidates[0].basis : [],
      candidateComponentKeys: candidates.map((row) => row.componentKey).sort(ascii),
    });
  }).sort(byField('routeEdgeId'));
}

function exactComponentIdentityBasis(edge, component) {
  const rows = [];
  if (text(edge.entityId) && edge.entityId === component.componentKey) rows.push('ENTITY_ID_EQUALS_COMPONENT_KEY');
  const source = edge.source || {};
  const refs = component.sourceReferences || {};
  exactIdentity(source.sourceEntityId, refs.sourceEntityId, 'SOURCE_ENTITY_ID', rows);
  exactIdentity(source.componentReference, refs.componentReference, 'COMPONENT_REFERENCE', rows);
  exactIdentity(source.sourceNodeId, refs.sourceNodeId, 'SOURCE_NODE_ID', rows);
  exactIdentity(source.sourceNodeKey, refs.sourceNodeKey, 'SOURCE_NODE_KEY', rows);
  return [...new Set(rows)].sort(ascii);
}

function buildSupportSiteCrosswalk(siteModel, attachmentModel) {
  const supports = attachmentModel.supportProjection.supports || [];
  return (siteModel.sites || []).map((site) => {
    const siteMembers = (site.assemblies || []).flatMap((assembly) => assembly.members || []);
    const entityIds = new Set(site.memberEntityIds || []);
    const sourceIds = new Set(siteMembers.map((row) => text(row.sourceEntityId)).filter(Boolean));
    const supportKeys = supports.filter((support) => (
      entityIds.has(support.supportKey)
      || (text(support.sourceEntityId) && sourceIds.has(text(support.sourceEntityId)))
    )).map((support) => support.supportKey).sort(ascii);
    return deepFreeze({
      supportSiteId: site.siteId,
      state: supportKeys.length ? 'RESOLVED' : 'UNRESOLVED',
      supportKeys,
      basis: supportKeys.length ? 'EXACT_SUPPORT_OR_SOURCE_ENTITY_ID' : null,
    });
  }).sort(byField('supportSiteId'));
}

function buildSupportStations(input) {
  const routeRows = new Map();
  (input.routePartitionModel.routes || []).forEach((route) => {
    (route.entityChainages || []).forEach((row) => routeRows.set(row.entityId, { route, row }));
  });
  const crosswalkByComponent = new Map();
  input.routeCrosswalk.filter((row) => row.state === 'RESOLVED').forEach((row) => {
    const list = crosswalkByComponent.get(row.componentKey) || [];
    list.push(row);
    crosswalkByComponent.set(row.componentKey, list);
  });
  const siteBySupport = new Map();
  input.supportSiteCrosswalk.forEach((row) => row.supportKeys.forEach((key) => {
    const list = siteBySupport.get(key) || [];
    list.push(row.supportSiteId);
    siteBySupport.set(key, list);
  }));

  const resolved = [];
  const unresolved = [];
  (input.attachmentModel.attachments || []).forEach((attachment) => {
    const routeMatches = crosswalkByComponent.get(attachment.attachedComponentKey) || [];
    const sites = siteBySupport.get(attachment.supportKey) || [];
    if (routeMatches.length !== 1) {
      unresolved.push(unresolvedStation(attachment, routeMatches.length
        ? 'Attached component maps to multiple route edges.'
        : 'Attached component has no exact route-edge crosswalk.'));
      return;
    }
    const routeData = routeRows.get(routeMatches[0].routeEntityId);
    if (!routeData || !Number.isFinite(routeData.row.sourceStartChainageMm)
      || !Number.isFinite(routeData.row.sourceEndChainageMm)
      || !Number.isFinite(attachment.segmentParameter)) {
      unresolved.push(unresolvedStation(attachment, 'Exact route chainage or attachment segment parameter is unavailable.'));
      return;
    }
    const t = attachment.segmentParameter;
    if (t < 0 || t > 1) {
      unresolved.push(unresolvedStation(attachment, 'Attachment segment parameter is outside [0,1].'));
      return;
    }
    const chainageMm = routeData.row.sourceStartChainageMm
      + t * (routeData.row.sourceEndChainageMm - routeData.row.sourceStartChainageMm);
    resolved.push(deepFreeze({
      stationId: `analysis-station:${attachment.attachmentId}`,
      routeId: routeData.route.routeId,
      supportKey: attachment.supportKey,
      supportSiteId: sites.length === 1 ? sites[0] : null,
      attachmentId: attachment.attachmentId,
      attachedComponentKey: attachment.attachedComponentKey,
      attachedPortKey: attachment.attachedPortKey || null,
      chainageMm,
      basis: 'ATTACHMENT_SEGMENT_PARAMETER_X_EXACT_ROUTE_CROSSWALK',
    }));
  });
  return {
    resolved: resolved.sort((left, right) => left.routeId === right.routeId
      ? left.chainageMm - right.chainageMm || ascii(left.stationId, right.stationId)
      : ascii(left.routeId, right.routeId)),
    unresolved: unresolved.sort(byField('supportKey')),
  };
}

function buildMemberSpans(stations) {
  const grouped = groupBy(stations, (row) => row.routeId);
  return [...grouped.entries()].flatMap(([routeId, rows]) => {
    const ordered = dedupeStations(rows);
    return ordered.slice(1).flatMap((right, index) => {
      const left = ordered[index];
      const lengthMm = right.chainageMm - left.chainageMm;
      if (!(lengthMm > 0)) return [];
      return [deepFreeze({
        spanId: `analysis-span:${semanticHash([routeId, left.stationId, right.stationId]).split(':')[1]}`,
        routeId,
        startStationId: left.stationId,
        endStationId: right.stationId,
        startChainageMm: left.chainageMm,
        endChainageMm: right.chainageMm,
        lengthMm,
      })];
    });
  }).sort(byField('spanId'));
}

function buildRouteRegions(routeModel, crosswalk, stations) {
  const crosswalkByEdge = new Map(crosswalk.map((row) => [row.routeEdgeId, row]));
  return (routeModel.routes || []).map((route) => {
    const crosswalkRows = (route.edgeIds || []).map((id) => crosswalkByEdge.get(id)).filter(Boolean);
    const stationCount = stations.filter((row) => row.routeId === route.routeId).length;
    return deepFreeze({
      routeId: route.routeId,
      branchId: route.branchId,
      lineKey: route.lineKey,
      status: route.status,
      edgeIds: [...(route.edgeIds || [])],
      physicalEdgeIds: [...(route.physicalEdgeIds || [])],
      totalLengthMm: route.totalLengthMm,
      terminalNodeIds: (route.nodes || []).filter((row) => row.degree === 1).map((row) => row.nodeId).sort(ascii),
      branchNodeIds: (route.nodes || []).filter((row) => row.degree > 2).map((row) => row.nodeId).sort(ascii),
      exactComponentCrosswalkCount: crosswalkRows.filter((row) => row.state === 'RESOLVED').length,
      unresolvedComponentCrosswalkCount: crosswalkRows.filter((row) => row.state !== 'RESOLVED').length,
      supportStationCount: stationCount,
    });
  }).sort(byField('routeId'));
}

function buildBoundaryCandidates(graph, attachmentModel, restraintModel) {
  const attachmentsBySupport = new Map((attachmentModel.attachments || []).map((row) => [row.supportKey, row]));
  const openPorts = graph.ports.filter((row) => row.peerPortKeys.length === 0).map((row) => deepFreeze({
    boundaryCandidateId: `open-port:${row.portKey}`,
    kind: 'OPEN_TOPOLOGY_PORT',
    componentKey: row.componentKey,
    portKey: row.portKey,
    topologyState: row.topologyState,
    boundaryCondition: 'UNRESOLVED',
  }));
  const anchors = (restraintModel.restraints || []).filter((row) => /ANCHOR|(^|_)ANC(HOR)?($|_)/.test(String(row.supportType || '').toUpperCase()))
    .map((row) => {
      const attachment = attachmentsBySupport.get(row.supportKey) || null;
      return deepFreeze({
        boundaryCandidateId: `anchor:${row.restraintId}`,
        kind: attachment?.attachedPortKey ? 'PORT_ATTACHED_ANCHOR' : 'COMPONENT_ATTACHED_ANCHOR',
        restraintId: row.restraintId,
        supportKey: row.supportKey,
        componentKey: attachment?.attachedComponentKey || null,
        portKey: attachment?.attachedPortKey || null,
        qualification: row.qualification,
        boundaryCondition: 'SOURCE_ANCHOR_CANDIDATE',
      });
    });
  return [...openPorts, ...anchors].sort(byField('boundaryCandidateId'));
}

function classifyTopology(regions) {
  if (regions.length !== 1) return 'DISCONNECTED_GRAPH';
  const region = regions[0];
  if (region.independentCycleCount > 0 && region.branchComponentKeys.length) return 'BRANCHED_CYCLIC_GRAPH';
  if (region.independentCycleCount > 0) return 'CYCLIC_GRAPH';
  if (region.branchComponentKeys.length) return 'BRANCHED_TREE';
  return 'OPEN_CHAIN_OR_SIMPLE_TREE';
}

function requireTopology(value) {
  const validation = validatePipingPortTopologyGraph(value);
  if (!validation.ok) throw new TypeError(`Analysis topology requires valid topology graph: ${validation.errors.join(' ')}`);
  return value;
}
function requireAttachments(value, graph) {
  const validation = validateSupportAttachmentModel(value);
  if (!validation.ok) throw new TypeError(`Analysis topology requires valid support attachments: ${validation.errors.join(' ')}`);
  if (value.topologySemanticHash !== graph.semanticHash) throw new TypeError('Support attachments are stale for analysis topology.');
  return value;
}
function requireRestraints(value, attachments) {
  const validation = validateRestraintCapabilityModel(value);
  if (!validation.ok) throw new TypeError(`Analysis topology requires valid restraint capability: ${validation.errors.join(' ')}`);
  if (value.attachmentModelSemanticHash !== attachments.semanticHash) throw new TypeError('Restraint capability is stale for analysis topology.');
  return value;
}
function requireWorkspaceContract(value, schema, field, datasetId) {
  if (!isRecord(value) || value.schema !== schema) throw new TypeError(`${field} must be ${schema}.`);
  if (value.datasetId !== datasetId) throw new TypeError(`${field} belongs to a different dataset.`);
  return value;
}
function exactIdentity(left, right, label, rows) {
  if (text(left) && text(right) && text(left) === text(right)) rows.push(label);
}
function unresolvedStation(attachment, reason) {
  return deepFreeze({ supportKey: attachment.supportKey, attachmentId: attachment.attachmentId, reason });
}
function dedupeStations(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = `${row.supportSiteId || row.supportKey}|${row.chainageMm}`;
    if (!map.has(key)) map.set(key, row);
  });
  return [...map.values()].sort((left, right) => left.chainageMm - right.chainageMm || ascii(left.stationId, right.stationId));
}
function groupBy(rows, keyOf) {
  const map = new Map();
  rows.forEach((row) => { const key = keyOf(row); const list = map.get(key) || []; list.push(row); map.set(key, list); });
  return map;
}
function issue(code, scope, severity, message) { return deepFreeze({ code, scope, severity, message }); }
function uniqueIssues(rows) {
  return [...new Map(rows.map((row) => [`${row.code}|${row.scope}|${row.message}`, row])).values()]
    .sort((left, right) => ascii(`${left.severity}|${left.code}|${left.scope}`, `${right.severity}|${right.code}|${right.scope}`));
}
function text(value) { return stringValue(value); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function byField(field) { return (left, right) => ascii(String(left[field]), String(right[field])); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function withoutHash(value) { const copy = structuredClone(value); delete copy.semanticHash; return copy; }
