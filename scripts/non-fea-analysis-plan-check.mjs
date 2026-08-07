import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createNonFeaAnalysisPlan,
  createNonFeaImplementationRegistry,
  evaluateNonFeaExecutionReadiness,
} from '../src/core/non-fea-analysis-plan/index.js';
import {
  createNonFeaOperatingReactionDependencyDag,
  validateNonFeaOperatingReactionDependencyDag,
} from '../src/core/non-fea-analysis-plan/operating-reaction-dependency-dag.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';

const methodRows = [
  row('WEIGHT_AND_GRAVITY', 'READY'),
  row('VERTICAL_CONTACT', 'READY'),
  row('RESTRAINT_REACTIONS', 'READY'),
  row('SUSTAINED_STRESS', 'READY'),
  row('COMBINED_OPERATING_REACTION', 'BLOCKED', 'SUPERPOSITION_POLICY_BLOCKED'),
  row('ENRICHED_STAGED_JSON_EXPORT', 'READY'),
];
const report = checkerReport(methodRows);
const registry = createNonFeaImplementationRegistry([
  implementation('CHAINAGE_TRIBUTARY_SPAN_V2', ['WEIGHT_AND_GRAVITY', 'SUSTAINED_REACTIONS'], 'REGISTERED', 'QUALIFIED'),
  implementation('CHAINAGE_TRIBUTARY_SPAN_V3_COG', ['WEIGHT_AND_GRAVITY', 'SUSTAINED_REACTIONS'], 'REGISTERED', 'QUALIFIED'),
  implementation('EMPIRICAL_BEAM_CONTACT_V1', ['WEIGHT_AND_GRAVITY', 'SUSTAINED_REACTIONS', 'SUSTAINED_MEMBER_ACTIONS', 'VERTICAL_CONTACT'], 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
  implementation('EMPIRICAL_RESTRAINT_NETWORK_V1', ['THERMAL_FREE_DISPLACEMENT', 'RESTRAINT_REACTIONS'], 'NOT_REGISTERED', 'FUTURE_RESTRICTED_DOMAIN'),
  implementation('EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1', ['COMBINED_OPERATING_REACTION'], 'NOT_REGISTERED', 'FUTURE_RESTRICTED_DOMAIN'),
  implementation('COMMON_INPUT_EXPORT_V1', ['ENRICHED_STAGED_JSON_EXPORT'], 'INTRINSIC', 'QUALIFIED'),
]);

const readiness = evaluateNonFeaExecutionReadiness({ report, implementationRegistry: registry });
const byMethod = Object.fromEntries(readiness.methodRows.map((item) => [item.commonMethodId, item]));

assert.equal(byMethod.WEIGHT_AND_GRAVITY.inputState, 'READY');
assert.equal(byMethod.WEIGHT_AND_GRAVITY.implementationState, 'SELECTION_REQUIRED');
assert.equal(byMethod.WEIGHT_AND_GRAVITY.executionState, 'SELECTION_REQUIRED');
assert.deepEqual(byMethod.WEIGHT_AND_GRAVITY.eligibleImplementationIds, [
  'CHAINAGE_TRIBUTARY_SPAN_V2',
  'CHAINAGE_TRIBUTARY_SPAN_V3_COG',
  'EMPIRICAL_BEAM_CONTACT_V1',
]);

assert.equal(byMethod.VERTICAL_CONTACT.executionState, 'READY_TO_AUTHORIZE');
assert.equal(byMethod.VERTICAL_CONTACT.binding.implementationId, 'EMPIRICAL_BEAM_CONTACT_V1');
assert.equal(byMethod.VERTICAL_CONTACT.binding.selection, 'AUTOMATIC');

assert.equal(byMethod.RESTRAINT_REACTIONS.inputState, 'READY');
assert.equal(byMethod.RESTRAINT_REACTIONS.implementationState, 'NOT_REGISTERED');
assert.equal(byMethod.RESTRAINT_REACTIONS.executionState, 'INPUT_READY_IMPLEMENTATION_NOT_READY');
assert.equal(byMethod.RESTRAINT_REACTIONS.implementationBlockerCode, 'NON_FEA_IMPLEMENTATION_NOT_REGISTERED');

assert.equal(byMethod.SUSTAINED_STRESS.inputState, 'READY');
assert.equal(byMethod.SUSTAINED_STRESS.implementationState, 'NOT_BOUND');
assert.equal(byMethod.SUSTAINED_STRESS.executionState, 'INPUT_READY_IMPLEMENTATION_NOT_READY');

assert.equal(byMethod.COMBINED_OPERATING_REACTION.inputState, 'BLOCKED');
assert.equal(byMethod.COMBINED_OPERATING_REACTION.executionState, 'BLOCKED_INPUT');

assert.equal(byMethod.ENRICHED_STAGED_JSON_EXPORT.executionState, 'READY_TO_AUTHORIZE');
assert.equal(byMethod.ENRICHED_STAGED_JSON_EXPORT.binding.implementationId, 'COMMON_INPUT_EXPORT_V1');

const explicit = evaluateNonFeaExecutionReadiness({
  report,
  implementationRegistry: registry,
  selectedImplementations: {
    WEIGHT_AND_GRAVITY: 'CHAINAGE_TRIBUTARY_SPAN_V3_COG',
  },
});
const weight = explicit.methodRows.find((item) => item.commonMethodId === 'WEIGHT_AND_GRAVITY');
assert.equal(weight.executionState, 'READY_TO_AUTHORIZE');
assert.equal(weight.binding.implementationId, 'CHAINAGE_TRIBUTARY_SPAN_V3_COG');
assert.equal(weight.binding.selection, 'EXPLICIT');

const plan = createNonFeaAnalysisPlan({
  planId: 'PLAN:SIMULATED',
  executionReadiness: explicit,
  requestedMethodIds: ['WEIGHT_AND_GRAVITY', 'VERTICAL_CONTACT', 'RESTRAINT_REACTIONS'],
  requestedLoadCaseIds: ['EMPTY', 'OPE'],
  qualificationProfileSemanticHash: semanticHash({ profile: 'SIMULATED' }),
});
assert.equal(plan.policy.commonInputSealRequired, true);
assert.equal(plan.policy.explicitImplementationAuthorizationRequired, true);
assert.equal(plan.policy.autoExecution, false);
assert.equal(plan.executionStates.WEIGHT_AND_GRAVITY, 'READY_TO_AUTHORIZE');
assert.equal(plan.executionStates.VERTICAL_CONTACT, 'READY_TO_AUTHORIZE');
assert.equal(plan.executionStates.RESTRAINT_REACTIONS, 'INPUT_READY_IMPLEMENTATION_NOT_READY');
assert(plan.implementationBindings.some((binding) => binding.implementationId === 'EMPIRICAL_BEAM_CONTACT_V1'));

const rejectedSelectionRegistry = createNonFeaImplementationRegistry([
  implementation('CHAINAGE_TRIBUTARY_SPAN_V2', ['WEIGHT_AND_GRAVITY'], 'REGISTERED', 'QUALIFIED'),
  implementation('UNQUALIFIED_WEIGHT_ENGINE', ['WEIGHT_AND_GRAVITY'], 'REGISTERED', 'UNQUALIFIED'),
]);
const rejectedSelectionReport = checkerReport([row('WEIGHT_AND_GRAVITY', 'READY')]);
const rejectedSelection = evaluateNonFeaExecutionReadiness({
  report: rejectedSelectionReport,
  implementationRegistry: rejectedSelectionRegistry,
  selectedImplementations: { WEIGHT_AND_GRAVITY: 'UNQUALIFIED_WEIGHT_ENGINE' },
}).methodRows[0];
assert.equal(rejectedSelection.implementationState, 'UNQUALIFIED');
assert.equal(rejectedSelection.executionState, 'INPUT_READY_IMPLEMENTATION_NOT_READY');
assert.equal(rejectedSelection.binding, null);

assert.throws(() => evaluateNonFeaExecutionReadiness({
  report,
  implementationRegistry: registry,
  selectedImplementations: { RESTRAINT_REACTIONS: 'EMPIRICAL_BEAM_CONTACT_V1' },
}), /does not implement RESTRAINT_REACTIONS/u);

// Wave 14: combined operating reaction dependency DAG is preparation-only.
const currentLikeEligibility = topologyEligibilityReceipt({
  requiredImplementationId: 'EMPIRICAL_RESTRAINT_NETWORK_V1',
  topologyRequirement: 'OPEN_CHAIN_V1_CANDIDATE',
  rows: [
    eligibility('EMPIRICAL_BEAM_CONTACT_V1', 'TOPOLOGY_NOT_GATED_HERE', 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
    eligibility('EMPIRICAL_RESTRAINT_NETWORK_V1', 'TOPOLOGY_ELIGIBLE', 'NOT_REGISTERED', 'FUTURE_RESTRICTED_DOMAIN'),
    eligibility('EMPIRICAL_RESTRAINT_NETWORK_V2', 'OUTSIDE_TOPOLOGY_DOMAIN', 'NOT_REGISTERED', 'NOT_REGISTERED'),
    eligibility('EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1', 'TOPOLOGY_NOT_GATED_HERE', 'NOT_REGISTERED', 'FUTURE_RESTRICTED_DOMAIN'),
  ],
});
const readyOpeThermal = thermalBasis([
  thermalCase('OPE', 'READY'),
]);
const currentLikeDag = operatingDag(currentLikeEligibility, readyOpeThermal);
assert.equal(currentLikeDag.state, 'BLOCKED');
assert.equal(currentLikeDag.resultExecutionState, 'NOT_EXECUTED');
assert.equal(nodeById(currentLikeDag, 'LINE_STOP_IMPLEMENTATION').state, 'BLOCKED');
assert(nodeById(currentLikeDag, 'LINE_STOP_IMPLEMENTATION').blockers
  .some((item) => item.code === 'OPERATING_IMPLEMENTATION_NOT_REGISTERED'));
assert.equal(nodeById(currentLikeDag, 'SUPERPOSITION_IMPLEMENTATION').state, 'BLOCKED');
assert.equal(currentLikeDag.policy.blindVectorAdditionPermitted, false);
assert.equal(currentLikeDag.policy.resultCalculationAuthority, false);

const branchEligibility = topologyEligibilityReceipt({
  requiredImplementationId: 'EMPIRICAL_RESTRAINT_NETWORK_V2',
  topologyRequirement: 'CONNECTED_BRANCH_GRAPH_REQUIRES_V2',
  topologyClass: 'BRANCHED_TREE',
  rows: [
    eligibility('EMPIRICAL_BEAM_CONTACT_V1', 'TOPOLOGY_NOT_GATED_HERE', 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
    eligibility('EMPIRICAL_RESTRAINT_NETWORK_V1', 'OUTSIDE_TOPOLOGY_DOMAIN', 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
    eligibility('EMPIRICAL_RESTRAINT_NETWORK_V2', 'TOPOLOGY_ELIGIBLE', 'NOT_REGISTERED', 'NOT_REGISTERED'),
    eligibility('EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1', 'TOPOLOGY_NOT_GATED_HERE', 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
  ],
});
const branchDag = operatingDag(branchEligibility, readyOpeThermal);
assert.equal(branchDag.implementationSelection.lineStopImplementationId, 'EMPIRICAL_RESTRAINT_NETWORK_V2');
assert.equal(nodeById(branchDag, 'LINE_STOP_IMPLEMENTATION').state, 'BLOCKED');
assert.equal(
  nodeById(branchDag, 'LINE_STOP_IMPLEMENTATION').blockers[0].details.implementationId,
  'EMPIRICAL_RESTRAINT_NETWORK_V2',
  'branched topology must not fall back to V1',
);

const qualifiedEligibility = topologyEligibilityReceipt({
  requiredImplementationId: 'EMPIRICAL_RESTRAINT_NETWORK_V1',
  topologyRequirement: 'OPEN_CHAIN_V1_CANDIDATE',
  rows: [
    eligibility('EMPIRICAL_BEAM_CONTACT_V1', 'TOPOLOGY_NOT_GATED_HERE', 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
    eligibility('EMPIRICAL_RESTRAINT_NETWORK_V1', 'TOPOLOGY_ELIGIBLE', 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
    eligibility('EMPIRICAL_RESTRAINT_NETWORK_V2', 'OUTSIDE_TOPOLOGY_DOMAIN', 'NOT_REGISTERED', 'NOT_REGISTERED'),
    eligibility('EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1', 'TOPOLOGY_NOT_GATED_HERE', 'REGISTERED', 'QUALIFIED_RESTRICTED_DOMAIN'),
  ],
});
const partialThermal = thermalBasis([
  thermalCase('OPE', 'READY'),
  thermalCase('UNRELATED', 'BLOCKED', ['UNRELATED_THERMAL_CASE_BLOCKED']),
], 'PARTIALLY_READY');
const readyDag = operatingDag(qualifiedEligibility, partialThermal);
const readyDagAgain = operatingDag(qualifiedEligibility, partialThermal);
assert.equal(readyDag.state, 'PREPARATION_READY');
assert.equal(validateNonFeaOperatingReactionDependencyDag(readyDag).ok, true);
assert.equal(readyDag.semanticHash, readyDagAgain.semanticHash, 'operating dependency DAG must be deterministic');
assert.equal(nodeById(readyDag, 'THERMAL_FREE_MOVEMENT').state, 'SATISFIED', 'unrelated thermal case drift must not block OPE');
assert.equal(nodeById(readyDag, 'VERTICAL_RESULT').state, 'WAITING_FOR_RESULT');
assert.equal(nodeById(readyDag, 'LINE_STOP_RESULT').state, 'WAITING_FOR_RESULT');
assert.equal(nodeById(readyDag, 'SOURCE_BINDING_COMPATIBILITY').state, 'WAITING_FOR_RESULT');
assert.equal(nodeById(readyDag, 'SUPPORT_SITE_CUSTODY_COMPATIBILITY').state, 'WAITING_FOR_RESULT');
assert.equal(nodeById(readyDag, 'FORCE_COMPONENT_OWNERSHIP').state, 'WAITING_FOR_RESULT');
assert.equal(nodeById(readyDag, 'MOMENT_OWNERSHIP').state, 'WAITING_FOR_RESULT');
assert.equal(nodeById(readyDag, 'COMBINED_OPERATING_REACTION').state, 'WAITING_FOR_RESULT');
assert.equal(readyDag.policy.pressureCompatibilityIncluded, false);
assert.equal(readyDag.policy.pressureStressIncluded, false);
assert.equal(readyDag.policy.geometryMutationPermitted, false);

const noThermalDag = operatingDag(qualifiedEligibility, null);
assert.equal(noThermalDag.state, 'BLOCKED');
assert(nodeById(noThermalDag, 'THERMAL_FREE_MOVEMENT').blockers
  .some((item) => item.code === 'OPERATING_THERMAL_FREE_MOVEMENT_REQUIRED'));
const noFrameDag = operatingDag(qualifiedEligibility, partialThermal, { coordinateFrameSemanticHash: null });
assert.equal(noFrameDag.state, 'BLOCKED');
assert(nodeById(noFrameDag, 'COORDINATE_FRAME_BINDING').blockers
  .some((item) => item.code === 'OPERATING_COORDINATE_FRAME_REQUIRED'));

const tamperedPayload = structuredClone(readyDag);
delete tamperedPayload.semanticHash;
tamperedPayload.resultExecutionState = 'EXECUTED';
const tampered = { ...tamperedPayload, semanticHash: semanticHash(tamperedPayload) };
assert.equal(
  validateNonFeaOperatingReactionDependencyDag(tampered).ok,
  false,
  'DAG cannot be promoted to execution authority by rehashing',
);

const dagSource = await readFile(
  new URL('../src/core/non-fea-analysis-plan/operating-reaction-dependency-dag.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  dagSource,
  /engineering-loads|empirical-operating-reaction-combiner/iu,
  'common operating DAG must not import empirical result-combination runtime',
);
assert.doesNotMatch(
  dagSource,
  /linear-fea|lafea|lfea|solver|continuum/iu,
  'common operating DAG must remain Non-FEA only',
);
assert.doesNotMatch(
  dagSource,
  /forceN|momentNm/iu,
  'common operating DAG must not perform force/moment arithmetic',
);

console.log(JSON.stringify({
  phase: 'architecture-wave-14',
  inputReadinessSeparatedFromImplementationReadiness: true,
  ambiguousImplementationSelectionFailsClosed: true,
  unregisteredImplementationFailsClosed: true,
  explicitlySelectedUnqualifiedImplementationFailsClosed: true,
  unboundImplementationFailsClosed: true,
  blockedInputCannotBecomeRunnable: true,
  intrinsicExportImplementationBound: true,
  analysisPlanDeterministic: true,
  operatingReactionDependencyDag: true,
  topologySelectedLineStopNoFallback: true,
  methodSpecificThermalCaseCurrentness: true,
  resultCompatibilityDeferred: true,
  blindVectorAdditionPermitted: false,
  resultCalculationAuthority: false,
  autoExecution: false,
}, null, 2));

function checkerReport(rows) {
  const readyMethodIds = rows.filter((item) => item.state === 'READY').map((item) => item.methodId);
  const blockedMethodIds = rows.filter((item) => item.state !== 'READY').map((item) => item.methodId);
  const base = {
    schema: 'pre-fea-piping-check-report/v1',
    requestSemanticHash: semanticHash({ request: 'SIMULATED' }),
    candidateSemanticHash: semanticHash({ candidate: 'SIMULATED' }),
    packageState: blockedMethodIds.length ? 'PARTIALLY_READY' : 'READY',
    readyMethodIds,
    blockedMethodIds,
    methodRows: rows,
    blockers: rows.flatMap((item) => item.blockers),
    candidate: {},
  };
  return Object.freeze({ ...base, semanticHash: semanticHash(base) });
}
function row(methodId, state, blockerCode = null) {
  return Object.freeze({
    methodId,
    state,
    requirements: [],
    blockers: blockerCode ? [{ code: blockerCode, path: methodId, message: blockerCode }] : [],
  });
}
function implementation(implementationId, commonMethodIds, runtimeState, qualificationState) {
  return {
    implementationId,
    commonMethodIds,
    runtimeState,
    qualificationState,
    purpose: `SIMULATED:${implementationId}`,
    qualificationProfileId: null,
    qualificationProfileSemanticHash: null,
    sourceRegistry: 'SIMULATED',
  };
}
function eligibility(implementationId, topologyState, runtimeState, qualificationState) {
  return {
    implementationId,
    topologyState,
    runtimeState,
    qualificationState,
    selectionState: 'SIMULATED',
    blockers: [],
  };
}
function topologyEligibilityReceipt({
  requiredImplementationId,
  topologyRequirement,
  rows,
  topologyClass = 'OPEN_CHAIN_OR_SIMPLE_TREE',
}) {
  const base = {
    schema: 'non-fea-implementation-topology-eligibility/v1',
    analysisTopologySemanticHash: semanticHash({ topology: topologyClass }),
    implementationRegistrySemanticHash: semanticHash({
      registry: rows.map((item) => item.implementationId),
    }),
    topologyClass,
    restraintNetworkRecommendation: {
      requiredImplementationId,
      topologyRequirement,
      topologyOnly: true,
      boundaryQualificationStillRequired: true,
      restraintAxisQualificationStillRequired: true,
      thermalBasisStillRequired: true,
      blockers: [],
    },
    rows,
    policy: {
      topologyEligibilityIsNotRuntimeQualification: true,
      topologyEligibilityIsNotAuthorization: true,
      topologyEligibilityIsNotExecution: true,
      implementationRegistryRemainsRuntimeAuthority: true,
    },
  };
  return { ...base, semanticHash: semanticHash(base) };
}
function thermalCase(loadCaseId, state, blockerCodes = []) {
  return {
    loadCaseId,
    state,
    componentCount: state === 'READY' ? 2 : 0,
    vectorSumM: [0, 0, 0],
    blockers: blockerCodes.map((code) => ({ code, scope: loadCaseId, message: code })),
  };
}
function thermalBasis(loadCases, state = 'READY') {
  const base = {
    schema: 'thermal-free-movement-basis/v1',
    datasetId: 'SIMULATED',
    state,
    sharedModelSemanticHash: semanticHash({ model: 'SIMULATED' }),
    topologyGraphSemanticHash: semanticHash({ topology: 'SIMULATED' }),
    thermalAssignmentAuthoritySemanticHash: semanticHash({ thermal: 'SIMULATED' }),
    requestedLoadCaseIds: loadCases.map((item) => item.loadCaseId),
    components: [],
    loadCases,
    blockers: loadCases.flatMap((item) => item.blockers),
    limitations: ['THERMAL_ONLY_FREE_MOVEMENT'],
    policy: {
      exactEntityAssignmentRequired: true,
      implicitTemperatureInheritancePermitted: false,
      implicitMaterialAliasPermitted: false,
      topologyMutationPermitted: false,
      calculationAuthorizationAuthority: false,
    },
  };
  return { ...base, semanticHash: semanticHash(base) };
}
function operatingDag(topologyEligibility, thermalFreeMovementBasis, overrides = {}) {
  return createNonFeaOperatingReactionDependencyDag({
    commonInputSemanticHash: semanticHash({ commonInput: 'SIMULATED' }),
    authorityRevisionVectorSemanticHash: semanticHash({ authority: 'SIMULATED' }),
    combinedOperatingInputState: 'READY',
    topologyEligibility,
    thermalFreeMovementBasis,
    verticalLoadCaseId: 'W-HOT',
    lineStopLoadCaseId: 'OPE',
    outputLoadCaseId: 'OPERATING',
    coordinateFrameSemanticHash: semanticHash({ frame: 'SIMULATED' }),
    superpositionPolicySemanticHash: semanticHash({ superposition: 'SIMULATED' }),
    ...overrides,
  });
}
function nodeById(dag, nodeId) {
  const item = dag.nodes.find((candidate) => candidate.nodeId === nodeId);
  assert.ok(item, `missing DAG node ${nodeId}`);
  return item;
}
