import assert from 'node:assert/strict';
import {
  evaluateNonFeaImplementationTopologyEligibility,
  validateNonFeaImplementationTopologyEligibility,
} from '../src/core/non-fea-analysis-plan/topology-eligibility.js';
import {
  createNonFeaAnalysisTopology,
  validateNonFeaAnalysisTopology,
} from '../src/core/non-fea-engineering-foundation/index.js';
import { buildRestraintCapabilityModel } from '../src/core/support-restraints/index.js';
import { deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  buildBranchFixture,
  buildCycleFixture,
  buildStraightFixture,
} from './w10.5-screening-fixtures.mjs';

const straightBase = buildStraightFixture({
  lengthsM: [1, 1],
  supports: [
    { key: 'SUP-A', stationM: 0.25, verticalState: 'RESTRAINED', supportType: 'REST', attachedComponentKey: 'COMP-1' },
    { key: 'SUP-B', stationM: 1.75, verticalState: 'RESTRAINED', supportType: 'REST', attachedComponentKey: 'COMP-2' },
  ],
});
const exactStationAttachmentModel = withFixtureSegmentParameters(straightBase.attachmentModel, {
  'SUP-A': 0.25,
  'SUP-B': 0.75,
});
const exactStationRestraintModel = buildRestraintCapabilityModel(exactStationAttachmentModel);
const straight = {
  ...straightBase,
  attachmentModel: exactStationAttachmentModel,
  restraintModel: exactStationRestraintModel,
};
const sharedBefore = JSON.stringify(straight.sharedModel);
const topologyBefore = JSON.stringify(straight.topologyGraph);
const attachmentsBefore = JSON.stringify(straight.attachmentModel);

assert.deepEqual(
  straight.attachmentModel.attachments
    .map((row) => [row.supportKey, Math.round(row.segmentParameter * 100)])
    .sort(([left], [right]) => left.localeCompare(right)),
  [['SUP-A', 25], ['SUP-B', 75]],
  'fixture must declare exact upstream segment parameters before common topology projection',
);

const supportSites = supportSiteModel(straight);
const routes = straightRouteModel(straight);
const analysis = createNonFeaAnalysisTopology({
  topologyGraph: straight.topologyGraph,
  supportAttachmentModel: straight.attachmentModel,
  restraintCapabilityModel: straight.restraintModel,
  supportSiteModel: supportSites,
  routePartitionModel: routes,
});
const analysisAgain = createNonFeaAnalysisTopology({
  topologyGraph: straight.topologyGraph,
  supportAttachmentModel: straight.attachmentModel,
  restraintCapabilityModel: straight.restraintModel,
  supportSiteModel: supportSites,
  routePartitionModel: routes,
});

assert.equal(analysis.state, 'READY', JSON.stringify(analysis.issues));
assert.equal(validateNonFeaAnalysisTopology(analysis).ok, true);
assert.equal(analysis.semanticHash, analysisAgain.semanticHash, 'analysis topology must be deterministic');
assert.equal(analysis.topologyClass, 'OPEN_CHAIN_OR_SIMPLE_TREE');
assert.equal(analysis.capabilityMetrics.connectedRegionCount, 1);
assert.equal(analysis.capabilityMetrics.branchComponentCount, 0);
assert.equal(analysis.capabilityMetrics.independentCycleCount, 0);
assert.equal(analysis.capabilityMetrics.openTopologyPortCount, 2);
assert.equal(analysis.capabilityMetrics.exactRouteCrosswalkCount, 2);
assert.equal(analysis.capabilityMetrics.unresolvedRouteCrosswalkCount, 0);
assert.equal(analysis.supportStations.length, 2);
assert.deepEqual(analysis.supportStations.map((row) => Math.round(row.chainageMm)), [250, 1750]);
assert.equal(analysis.memberSpans.length, 1);
assert.equal(Math.round(analysis.memberSpans[0].lengthMm), 1500);
assert.equal(analysis.planarityPolicy.state, 'PROFILE_REQUIRED');
assert.equal(analysis.policy.topologyMutationPermitted, false);
assert.equal(analysis.policy.fuzzyIdentityCrosswalkPermitted, false);

const unresolved = createNonFeaAnalysisTopology({
  topologyGraph: straight.topologyGraph,
  supportAttachmentModel: straight.attachmentModel,
  restraintCapabilityModel: straight.restraintModel,
  supportSiteModel: supportSites,
  routePartitionModel: {
    ...routes,
    edges: routes.edges.map((row) => ({
      ...row,
      edgeId: `legacy:${row.edgeId}`,
      entityId: `legacy:${row.entityId}`,
      source: {},
    })),
    routes: routes.routes.map((route) => ({
      ...route,
      edgeIds: route.edgeIds.map((id) => `legacy:${id}`),
      physicalEdgeIds: route.physicalEdgeIds.map((id) => `legacy:${id}`),
      entityChainages: route.entityChainages.map((row) => ({ ...row, entityId: `legacy:${row.entityId}` })),
    })),
  },
});
assert.equal(unresolved.state, 'PARTIALLY_READY');
assert.equal(unresolved.capabilityMetrics.unresolvedRouteCrosswalkCount, 2);
assert(unresolved.issues.some((row) => row.code === 'ANALYSIS_TOPOLOGY_ROUTE_CROSSWALK_UNRESOLVED'));
assert.equal(unresolved.supportStations.length, 0);
assert.equal(unresolved.unresolvedSupportStations.length, 2);

const branch = buildBranchFixture();
const branchAnalysis = createNonFeaAnalysisTopology({
  topologyGraph: branch.topologyGraph,
  supportAttachmentModel: branch.attachmentModel,
  restraintCapabilityModel: branch.restraintModel,
  supportSiteModel: emptySupportSites(branch),
  routePartitionModel: emptyRoutes(branch),
});
assert.equal(branchAnalysis.topologyClass, 'BRANCHED_TREE');
assert.equal(branchAnalysis.capabilityMetrics.branchComponentCount, 1);
assert.equal(branchAnalysis.capabilityMetrics.independentCycleCount, 0);

const cycle = buildCycleFixture();
const cycleAnalysis = createNonFeaAnalysisTopology({
  topologyGraph: cycle.topologyGraph,
  supportAttachmentModel: cycle.attachmentModel,
  restraintCapabilityModel: cycle.restraintModel,
  supportSiteModel: emptySupportSites(cycle),
  routePartitionModel: emptyRoutes(cycle),
});
assert.equal(cycleAnalysis.topologyClass, 'CYCLIC_GRAPH');
assert.equal(cycleAnalysis.capabilityMetrics.independentCycleCount, 1);

const currentRegistry = implementationRegistry([
  implementation('EMPIRICAL_RESTRAINT_NETWORK_V1', 'NOT_REGISTERED', 'FUTURE_RESTRICTED_DOMAIN'),
  implementation('EMPIRICAL_BEAM_CONTACT_V1', 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
]);
const chainEligibility = evaluateNonFeaImplementationTopologyEligibility({
  analysisTopology: analysis,
  implementationRegistry: currentRegistry,
});
assert.equal(validateNonFeaImplementationTopologyEligibility(chainEligibility).ok, true);
assert.equal(chainEligibility.restraintNetworkRecommendation.requiredImplementationId, 'EMPIRICAL_RESTRAINT_NETWORK_V1');
assert.equal(chainEligibility.restraintNetworkRecommendation.topologyRequirement, 'OPEN_CHAIN_V1_CANDIDATE');
assert.equal(eligibilityRow(chainEligibility, 'EMPIRICAL_RESTRAINT_NETWORK_V1').topologyState, 'TOPOLOGY_ELIGIBLE');
assert.equal(eligibilityRow(chainEligibility, 'EMPIRICAL_RESTRAINT_NETWORK_V1').selectionState, 'IMPLEMENTATION_REQUIRED_NOT_REGISTERED');
assert.equal(eligibilityRow(chainEligibility, 'EMPIRICAL_RESTRAINT_NETWORK_V2').selectionState, 'NOT_SELECTED_BY_TOPOLOGY');
assert.equal(eligibilityRow(chainEligibility, 'EMPIRICAL_BEAM_CONTACT_V1').topologyState, 'TOPOLOGY_NOT_GATED_HERE');

const branchEligibility = evaluateNonFeaImplementationTopologyEligibility({
  analysisTopology: branchAnalysis,
  implementationRegistry: currentRegistry,
});
assert.equal(branchEligibility.restraintNetworkRecommendation.requiredImplementationId, 'EMPIRICAL_RESTRAINT_NETWORK_V2');
assert.equal(branchEligibility.restraintNetworkRecommendation.topologyRequirement, 'CONNECTED_BRANCH_GRAPH_REQUIRES_V2');
assert.equal(eligibilityRow(branchEligibility, 'EMPIRICAL_RESTRAINT_NETWORK_V1').topologyState, 'OUTSIDE_TOPOLOGY_DOMAIN');
assert(eligibilityRow(branchEligibility, 'EMPIRICAL_RESTRAINT_NETWORK_V1').blockers.some((row) => row.code === 'TOPOLOGY_BRANCH_PROFILE_REQUIRED'));
assert.equal(eligibilityRow(branchEligibility, 'EMPIRICAL_RESTRAINT_NETWORK_V2').topologyState, 'TOPOLOGY_ELIGIBLE');
assert.equal(eligibilityRow(branchEligibility, 'EMPIRICAL_RESTRAINT_NETWORK_V2').selectionState, 'IMPLEMENTATION_REQUIRED_NOT_REGISTERED');

const cycleEligibility = evaluateNonFeaImplementationTopologyEligibility({
  analysisTopology: cycleAnalysis,
  implementationRegistry: currentRegistry,
});
assert.equal(cycleEligibility.restraintNetworkRecommendation.requiredImplementationId, 'EMPIRICAL_RESTRAINT_NETWORK_V2');
assert.equal(cycleEligibility.restraintNetworkRecommendation.topologyRequirement, 'CONNECTED_LOOP_GRAPH_REQUIRES_V2');
assert(eligibilityRow(cycleEligibility, 'EMPIRICAL_RESTRAINT_NETWORK_V1').blockers.some((row) => row.code === 'TOPOLOGY_LOOP_PROFILE_REQUIRED'));

const v2Registry = implementationRegistry([
  implementation('EMPIRICAL_RESTRAINT_NETWORK_V1', 'NOT_REGISTERED', 'FUTURE_RESTRICTED_DOMAIN'),
  implementation('EMPIRICAL_RESTRAINT_NETWORK_V2', 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
]);
const qualifiedV2Eligibility = evaluateNonFeaImplementationTopologyEligibility({
  analysisTopology: branchAnalysis,
  implementationRegistry: v2Registry,
});
assert.equal(eligibilityRow(qualifiedV2Eligibility, 'EMPIRICAL_RESTRAINT_NETWORK_V2').selectionState, 'TOPOLOGY_AND_REGISTRY_CANDIDATE');
assert.equal(qualifiedV2Eligibility.policy.topologyEligibilityIsNotRuntimeQualification, true);
assert.equal(qualifiedV2Eligibility.policy.topologyEligibilityIsNotAuthorization, true);
assert.equal(qualifiedV2Eligibility.policy.topologyEligibilityIsNotExecution, true);

assert.equal(JSON.stringify(straight.sharedModel), sharedBefore, 'analysis topology mutated shared model');
assert.equal(JSON.stringify(straight.topologyGraph), topologyBefore, 'analysis topology mutated topology graph');
assert.equal(JSON.stringify(straight.attachmentModel), attachmentsBefore, 'analysis topology mutated support attachments');

console.log(JSON.stringify({
  check: 'non-fea-analysis-topology',
  status: 'PASS',
  deterministic: true,
  exactIdentityCrosswalkOnly: true,
  upstreamStationEvidenceExplicit: true,
  supportStationsDerivedOnce: true,
  supportSpansDerivedOnce: true,
  branchMetrics: true,
  independentCycleMetrics: true,
  planarityProfileRequired: true,
  topologyMutationPermitted: false,
  v1OpenChainCandidate: true,
  branchAndLoopRequireV2: true,
  registryAvailabilitySeparated: true,
  topologyEligibilityAuthorizationAuthority: false,
}, null, 2));

function withFixtureSegmentParameters(model, bySupportKey) {
  const attachments = model.attachments.map((row) => {
    const segmentParameter = bySupportKey[row.supportKey];
    assert.ok(Number.isFinite(segmentParameter), `fixture segment parameter required for ${row.supportKey}`);
    assert.ok(segmentParameter >= 0 && segmentParameter <= 1, `fixture segment parameter outside [0,1] for ${row.supportKey}`);
    return { ...row, segmentParameter };
  });
  const base = { ...model, attachments };
  delete base.semanticHash;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function supportSiteModel(fixture) {
  const supports = fixture.attachmentModel.supportProjection.supports;
  return {
    schema: 'support-site-model/v1',
    datasetId: fixture.topologyGraph.datasetId,
    status: 'READY',
    blockers: [],
    sites: supports.map((support) => ({
      siteId: `site:${support.supportKey}`,
      memberEntityIds: [support.supportKey],
      assemblies: [{
        members: [{
          entityId: support.supportKey,
          sourceEntityId: support.sourceEntityId,
        }],
      }],
    })),
  };
}

function straightRouteModel(fixture) {
  const edges = fixture.topologyGraph.components.map((component) => ({
    edgeId: component.componentKey,
    entityId: component.componentKey,
    source: { sourceEntityId: component.sourceReferences?.sourceEntityId || component.componentKey },
  }));
  return {
    schema: 'route-partition-model/v1',
    datasetId: fixture.topologyGraph.datasetId,
    status: 'READY',
    blockers: [],
    edges,
    routes: [{
      routeId: 'route:LINE:1',
      branchId: 'B1',
      lineKey: 'LINE-W10.5',
      status: 'READY',
      blockers: [],
      nodes: [
        { nodeId: 'N0', degree: 1 },
        { nodeId: 'N1', degree: 2 },
        { nodeId: 'N2', degree: 1 },
      ],
      edgeIds: ['COMP-1', 'COMP-2'],
      physicalEdgeIds: ['COMP-1', 'COMP-2'],
      entityChainages: [
        { entityId: 'COMP-1', sourceStartChainageMm: 0, sourceEndChainageMm: 1000 },
        { entityId: 'COMP-2', sourceStartChainageMm: 1000, sourceEndChainageMm: 2000 },
      ],
      totalLengthMm: 2000,
    }],
  };
}

function emptySupportSites(fixture) {
  return {
    schema: 'support-site-model/v1',
    datasetId: fixture.topologyGraph.datasetId,
    status: 'READY',
    blockers: [],
    sites: [],
  };
}
function emptyRoutes(fixture) {
  return {
    schema: 'route-partition-model/v1',
    datasetId: fixture.topologyGraph.datasetId,
    status: 'READY',
    blockers: [],
    edges: [],
    routes: [],
  };
}
function implementationRegistry(implementations) {
  const base = { schema: 'non-fea-method-implementation-registry/v1', implementations };
  return { ...base, semanticHash: semanticHash(base) };
}
function implementation(implementationId, runtimeState, qualificationState) {
  return { implementationId, runtimeState, qualificationState };
}
function eligibilityRow(receipt, implementationId) {
  const row = receipt.rows.find((item) => item.implementationId === implementationId);
  assert.ok(row, `missing topology eligibility row ${implementationId}`);
  return row;
}
