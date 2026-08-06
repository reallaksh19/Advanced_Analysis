import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';
import {
  buildPipingPortTopologyGraph,
} from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import {
  buildModelLoadFoundation,
} from '../src/core/model-loads/index.js';
import {
  buildSjsonEmpiricalPipingRequest,
} from '../src/workspace/engineering-loads/adapters/sjson-to-empirical-piping-request.js';
import {
  calculateAuthorizedEmpiricalBeamContactExecution,
} from '../src/workspace/engineering-loads/authorized-empirical-beam-contact-execution.js';
import {
  createEmpiricalBeamContactRuntimeProfile,
} from '../src/workspace/engineering-loads/empirical-beam-contact-runtime-profile.js';
import {
  createEmpiricalAnalysisScenario,
  createEmpiricalCoordinateFrame,
} from '../src/workspace/engineering-loads/contracts/empirical-sjson-contracts.js';
import {
  createEmpiricalCoupledRestraintNetworkProfile,
} from '../src/workspace/engineering-loads/empirical-coupled-restraint-network-profile.js';
import {
  EMPIRICAL_COUPLED_RESTRAINT_NETWORK_EXECUTION_REQUEST_SCHEMA,
  executeEmpiricalCoupledRestraintNetworkRuntime,
} from '../src/workspace/engineering-loads/empirical-coupled-restraint-network-runtime.js';
import {
  cloneEmpiricalOperatingReactionProfile,
  createEmpiricalOperatingReactionProfile,
  EMPIRICAL_OPERATING_REACTION_RULE_ID,
} from '../src/workspace/engineering-loads/empirical-operating-reaction-profile.js';
import {
  EMPIRICAL_OPERATING_REACTION_EXECUTION_REQUEST_SCHEMA,
  executeEmpiricalOperatingReactionCombination,
} from '../src/workspace/engineering-loads/empirical-operating-reaction-combiner.js';

const DATASET_ID = 'WP7-OPERATING-FIXTURE';
const SOURCE_HASH = 'sha256:wp7-operating-fixture';
const EXECUTED_AT = '2026-08-06T02:00:00.000Z';
const sharedModel = fixtureSharedModel();
const topologyGraph = buildPipingPortTopologyGraph(sharedModel);
const supportAttachmentModel = buildSupportAttachmentModel(sharedModel, topologyGraph);
const restraintCapabilityModel = buildRestraintCapabilityModel(supportAttachmentModel);
const loadFoundation = buildModelLoadFoundation(sharedModel, topologyGraph);
const coordinateFrame = createEmpiricalCoordinateFrame({
  sourceBasis: 'SJSON_SOURCE',
  sourceLengthUnit: 'mm',
  verticalUnitVector: [0, 0, 1],
  analysisPlaneBasis: {
    u: [1, 0, 0],
    v: [0, 0, 1],
    normal: [0, -1, 0],
  },
  forceOutputConvention: 'RESTRAINT_ON_PIPE',
  momentOutputConvention: 'RESTRAINT_ON_PIPE',
});

const verticalExecution = executeVerticalResult();
const lineStopExecution = executeLineStopResult();
assert.equal(verticalExecution.status, 'CALCULATED');
assert.equal(lineStopExecution.status, 'CALCULATED');
assert.equal(verticalExecution.loadCases[0].loadCaseId, 'W-HOT');
assert.equal(lineStopExecution.loadCases[0].loadCaseId, 'EXP-THERMAL-ON-HOT-SUPPORT-SET');

const combinationProfile = createEmpiricalOperatingReactionProfile(profileInput());
const combinationProfileClone = cloneEmpiricalOperatingReactionProfile(combinationProfile, {
  profileId: 'WP7-OPERATING-CLONE',
});
assert.equal(combinationProfileClone.qualification, 'UNQUALIFIED');
assert.equal(combinationProfileClone.locked, false);
assert.notEqual(combinationProfileClone.semanticHash, combinationProfile.semanticHash);

const result = combine({ combinationProfile });
assert.equal(result.status, 'CALCULATED');
assert.equal(result.method, 'EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1');
assert.equal(result.loadCases.length, 1);
const operatingCase = result.loadCases[0];
assert.equal(operatingCase.loadCaseId, 'OPE-HOT');
assert.equal(operatingCase.resultClass, 'COMBINED_OPERATING_REACTION');
assert.equal(operatingCase.status, 'CALCULATED');
assert.equal(operatingCase.combinationPolicy, 'SUPERPOSITION_RULE_QUALIFIED');
assert.equal(result.summary.supportResultCount, 3);
assert.equal(result.summary.overlappingSiteCount, 2);
assert.equal(result.summary.verticalOnlySiteCount, 1);
assert.equal(result.summary.lineStopOnlySiteCount, 0);
assert.equal(result.evidence.combinationAuthority, 'QUALIFIED_COMPONENT_WISE_SUPERPOSITION');
assert.equal(result.evidence.blindVectorAddition, false);
assert.equal(result.evidence.pressureCompatibilityIncluded, false);
assert.equal(result.evidence.pressureStressIncluded, false);
assert.equal(result.evidence.inputRuntimeResultsRecalculated, false);
assert.equal(result.evidence.geometryMutation, false);

const verticalBySite = indexBySite(verticalExecution.loadCases[0].supportResults);
const lineStopBySite = indexBySite(lineStopExecution.loadCases[0].supportResults);
const combinedBySite = indexBySite(operatingCase.supportResults);
for (const supportSiteId of ['SUP-A', 'SUP-M', 'SUP-B']) {
  const combined = combinedBySite.get(supportSiteId);
  const vertical = verticalBySite.get(supportSiteId);
  const lineStop = lineStopBySite.get(supportSiteId);
  assert(combined, `${supportSiteId} combined result is required.`);
  close(combined.globalReaction.forceN.x, lineStop?.globalReaction.forceN.x || 0, 1e-9, `${supportSiteId} X`);
  close(combined.globalReaction.forceN.y, 0, 1e-9, `${supportSiteId} Y`);
  close(combined.globalReaction.forceN.z, vertical?.globalReaction.forceN.z || 0, 1e-9, `${supportSiteId} Z`);
  close(combined.globalReaction.momentNm.x, vertical?.globalReaction.momentNm.x || 0, 1e-9, `${supportSiteId} Mx`);
  close(combined.globalReaction.momentNm.y, vertical?.globalReaction.momentNm.y || 0, 1e-9, `${supportSiteId} My`);
  close(combined.globalReaction.momentNm.z, vertical?.globalReaction.momentNm.z || 0, 1e-9, `${supportSiteId} Mz`);
  assert.equal(combined.componentBreakdown.pressureCompatibility, 'EXCLUDED');
  assert.equal(combined.componentBreakdown.pressureStress, 'EXCLUDED');
  close(vectorMagnitude(combined.componentBreakdown.verticalWeight.excludedForceN), 0, 1e-9, `${supportSiteId} vertical excluded force`);
  close(vectorMagnitude(combined.componentBreakdown.thermalLineStop.excludedForceN), 0, 1e-9, `${supportSiteId} line-stop excluded force`);
  close(vectorMagnitude(combined.componentBreakdown.thermalLineStop.excludedMomentNm), 0, 1e-9, `${supportSiteId} line-stop excluded moment`);
  assert.equal(combined.geometryChanged, false);
  assert.equal(combined.pressureEffectsIncluded, false);
}
assert.equal(combinedBySite.get('SUP-M').componentBreakdown.siteClass, 'VERTICAL_ONLY');
assert.equal(combinedBySite.get('SUP-A').componentBreakdown.siteClass, 'OVERLAPPING');
assert.equal(combinedBySite.get('SUP-B').componentBreakdown.siteClass, 'OVERLAPPING');
assert.equal(combine({ combinationProfile }).semanticHash, result.semanticHash);

const unqualified = combine({ combinationProfile: combinationProfileClone });
assert.equal(unqualified.status, 'BLOCKED');
assert(hasBlocker(unqualified, 'EMPIRICAL_OPERATING_PROFILE_UNQUALIFIED'));
assert.equal(unqualified.loadCases[0].supportResults.length, 0);

const nonOrthogonal = combine({
  combinationProfile,
  lineStopExecutionResult: mutateExecution(lineStopExecution, (copy) => {
    copy.analysisDirection = [0, 0, 1];
  }),
});
assert.equal(nonOrthogonal.status, 'BLOCKED');
assert(hasBlocker(nonOrthogonal, 'EMPIRICAL_OPERATING_DIRECTIONS_NOT_ORTHOGONAL'));

assert.throws(() => combine({
  combinationProfile,
  lineStopExecutionResult: mutateExecution(lineStopExecution, (copy) => {
    copy.evidence.sourceBindings.sharedModelHash = 'fnv1a64:aaaaaaaaaaaaaaaa';
  }),
}), /common source bindings/i);

const alternateFrame = createEmpiricalCoordinateFrame({
  sourceBasis: 'SJSON_SOURCE',
  sourceLengthUnit: 'mm',
  verticalUnitVector: [0, 1, 0],
  analysisPlaneBasis: {
    u: [1, 0, 0],
    v: [0, 1, 0],
    normal: [0, 0, 1],
  },
  forceOutputConvention: 'RESTRAINT_ON_PIPE',
  momentOutputConvention: 'RESTRAINT_ON_PIPE',
});
assert.throws(() => combine({
  combinationProfile,
  coordinateFrame: alternateFrame,
}), /coordinate-frame binding is stale/i);

const unownedVerticalForce = combine({
  combinationProfile,
  verticalExecutionResult: mutateExecution(verticalExecution, (copy) => {
    copy.loadCases[0].supportResults[0].globalReaction.forceN.x = 25;
  }),
});
assert.equal(unownedVerticalForce.status, 'BLOCKED');
assert(hasBlocker(unownedVerticalForce, 'EMPIRICAL_OPERATING_VERTICAL_FORCE_OWNERSHIP_VIOLATION'));

const lineStopMoment = combine({
  combinationProfile,
  lineStopExecutionResult: mutateExecution(lineStopExecution, (copy) => {
    copy.loadCases[0].supportResults[0].globalReaction.momentNm.y = 2;
  }),
});
assert.equal(lineStopMoment.status, 'BLOCKED');
assert(hasBlocker(lineStopMoment, 'EMPIRICAL_OPERATING_LINE_STOP_MOMENT_OWNERSHIP_VIOLATION'));

const custodyMismatch = combine({
  combinationProfile,
  lineStopExecutionResult: mutateExecution(lineStopExecution, (copy) => {
    copy.loadCases[0].supportResults[0].sourceSupportIds = ['MISMATCH'];
  }),
});
assert.equal(custodyMismatch.status, 'BLOCKED');
assert(hasBlocker(custodyMismatch, 'EMPIRICAL_OPERATING_SUPPORT_CUSTODY_MISMATCH'));

const conventionMismatch = combine({
  combinationProfile,
  lineStopExecutionResult: mutateExecution(lineStopExecution, (copy) => {
    copy.loadCases[0].supportResults[0].forceConvention = 'PIPE_ON_RESTRAINT';
  }),
});
assert.equal(conventionMismatch.status, 'BLOCKED');
assert(hasBlocker(conventionMismatch, 'EMPIRICAL_OPERATING_FORCE_CONVENTION_MISMATCH'));

const source = readFileSync(
  new URL('../src/workspace/engineering-loads/empirical-operating-reaction-combiner.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(source, /benchmarks\//);
assert.doesNotMatch(source, /Input_BM|Output_BM|CAESAR/i);
assert.match(source, /QUALIFIED_COMPONENT_WISE_SUPERPOSITION/);
assert.match(source, /blindVectorAddition: false/);
assert.match(source, /pressureCompatibilityIncluded: false/);
assert.match(source, /inputRuntimeResultsRecalculated: false/);

console.log(JSON.stringify({
  ruleId: EMPIRICAL_OPERATING_REACTION_RULE_ID,
  outputLoadCaseId: operatingCase.loadCaseId,
  supportResults: operatingCase.supportResults.map((row) => ({
    supportSiteId: row.supportSiteId,
    siteClass: row.componentBreakdown.siteClass,
    forceN: row.globalReaction.forceN,
    momentNm: row.globalReaction.momentNm,
  })),
  pressureCompatibilityIncluded: result.evidence.pressureCompatibilityIncluded,
  pressureStressIncluded: result.evidence.pressureStressIncluded,
}, null, 2));
console.log('empirical-operating-reaction-check: PASS');

function combine({
  combinationProfile: profile,
  coordinateFrame: frame = coordinateFrame,
  verticalExecutionResult = verticalExecution,
  lineStopExecutionResult = lineStopExecution,
}) {
  return executeEmpiricalOperatingReactionCombination({
    schema: EMPIRICAL_OPERATING_REACTION_EXECUTION_REQUEST_SCHEMA,
    executionId: `WP7-COMBINATION:${profile.profileId}`,
    executedAt: EXECUTED_AT,
    coordinateFrame: frame,
    verticalExecutionResult,
    lineStopExecutionResult,
    combinationProfile: profile,
  });
}

function executeVerticalResult() {
  const profile = createEmpiricalBeamContactRuntimeProfile({
    profileId: 'WP7-BEAM-CONTACT-PROFILE',
    profileVersion: 1,
    qualification: 'QUALIFIED',
    locked: true,
    lineProperties: {
      L1: {
        outsideDiameterM: 0.1,
        nominalWallM: 0.005,
        stiffnessWallM: 0.005,
        weightWallM: 0.005,
        corrosionAllowanceM: 0,
        elasticModulusPa: 200e9,
        thermalExpansionPerK: 12e-6,
        authority: {
          section: 'WP7_TEST_SOURCE',
          elasticModulus: 'WP7_TEST_SOURCE',
          thermalExpansion: 'WP7_TEST_SOURCE',
        },
      },
    },
    elbow: { segmentCount: 8, flexibilityFactor: 1 },
    tolerances: {
      planarityM: 1e-9,
      pointProjectionM: 1e-8,
      contactGapM: 1e-9,
      absoluteReactionN: 1e-6,
      relativeReaction: 1e-10,
      equilibriumForceN: 1e-5,
      equilibriumMomentNm: 1e-5,
    },
    numericalOptions: {
      pivotMultiplier: 100,
      minimumReciprocalCondition: 1e-12,
    },
  });
  const scenario = createEmpiricalAnalysisScenario({
    scenarioId: 'WP7-VERTICAL-SCENARIO',
    name: 'Qualified hot weight/contact result',
    method: 'EMPIRICAL_BEAM_CONTACT_V1',
    state: 'AUTHORIZED',
    coordinateFrame,
    loadCases: [{
      loadCaseId: 'W-HOT',
      label: 'Hot weight support set',
      resultClass: 'VERTICAL_SCREENING_RESULT',
      effects: {
        weight: true,
        thermalStrain: false,
        pressureCompatibility: false,
        pressureStress: false,
      },
    }],
    restraintOverrides: [],
    profileRef: profileRef(profile),
    sourceBindings: sourceBindings(profile),
    combinationPolicy: 'SEPARATE_UNTIL_QUALIFIED',
  });
  const adaptedRequest = buildSjsonEmpiricalPipingRequest({
    dataset: { datasetId: DATASET_ID, sourceSha256: SOURCE_HASH },
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    scenario,
  });
  const execution = calculateAuthorizedEmpiricalBeamContactExecution({
    schema: 'authorized-empirical-beam-contact-execution-request/v1',
    executionId: 'WP7-VERTICAL-EXECUTION',
    executedAt: EXECUTED_AT,
    adaptedRequest,
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    sourceLoadPrimitiveSet: loadFoundation.loadPrimitiveSet,
    runtimeProfile: profile,
    caseConfigurations: [{
      loadCaseId: 'W-HOT',
      weightPrimitiveCaseId: 'OPE',
      referenceTemperatureC: null,
      analysisTemperatureC: null,
    }],
  });
  return execution.coreResult;
}

function executeLineStopResult() {
  const profile = createEmpiricalCoupledRestraintNetworkProfile({
    profileId: 'WP7-LINE-STOP-PROFILE',
    profileVersion: 1,
    qualification: 'QUALIFIED',
    locked: true,
    lineProperties: {
      L1: {
        outsideDiameterM: 0.1,
        wallThicknessM: 0.005,
        elasticModulusPa: 200e9,
        thermalExpansionPerK: 12e-6,
        authority: {
          section: 'WP7_TEST_SOURCE',
          elasticModulus: 'WP7_TEST_SOURCE',
          thermalExpansion: 'WP7_TEST_SOURCE',
        },
      },
    },
    componentComplianceMultipliers: { PIPE: 1 },
    compliance: {
      axialComplianceMultiplier: 1,
      bendingComplianceMultiplier: 1,
      topologyInteractionMultiplier: 1,
    },
    domain: {
      allowedComponentTypes: ['PIPE'],
      requireAtLeastOneAnchor: true,
      requireTwoPortComponents: true,
      maximumNodeDegree: 2,
      maximumCycleCount: 0,
      allowFriction: false,
      allowFiniteGaps: false,
      allowFiniteStiffness: false,
      allowBranches: true,
      allowClosedLoops: true,
    },
    tolerances: {
      pointProjectionM: 1e-8,
      directionParallelCosine: 0.999999,
      directionOrthogonalCosine: 1e-6,
      reactionN: 1e-6,
      equilibriumN: 1e-3,
      maximumScaledResidual: 1e-12,
    },
    numericalOptions: {
      pivotMultiplier: 100,
      minimumReciprocalCondition: 1e-14,
    },
  });
  const scenario = createEmpiricalAnalysisScenario({
    scenarioId: 'WP7-LINE-STOP-SCENARIO',
    name: 'Qualified hot thermal line-stop result',
    method: 'EMPIRICAL_RESTRAINT_NETWORK_V2',
    state: 'AUTHORIZED',
    coordinateFrame,
    loadCases: [{
      loadCaseId: 'EXP-THERMAL-ON-HOT-SUPPORT-SET',
      label: 'Hot thermal line-stop support set',
      resultClass: 'THERMAL_LINE_STOP_SCREENING_RESULT',
      effects: {
        weight: false,
        thermalStrain: true,
        pressureCompatibility: false,
        pressureStress: false,
      },
    }],
    restraintOverrides: [],
    profileRef: profileRef(profile),
    sourceBindings: sourceBindings(profile),
    combinationPolicy: 'SEPARATE_UNTIL_QUALIFIED',
  });
  const adaptedRequest = buildSjsonEmpiricalPipingRequest({
    dataset: { datasetId: DATASET_ID, sourceSha256: SOURCE_HASH },
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    scenario,
  });
  return executeEmpiricalCoupledRestraintNetworkRuntime({
    schema: EMPIRICAL_COUPLED_RESTRAINT_NETWORK_EXECUTION_REQUEST_SCHEMA,
    executionId: 'WP7-LINE-STOP-EXECUTION',
    executedAt: EXECUTED_AT,
    adaptedRequest,
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    runtimeProfile: profile,
    analysisDirection: [1, 0, 0],
    caseConfigurations: [{
      loadCaseId: 'EXP-THERMAL-ON-HOT-SUPPORT-SET',
      referenceTemperatureC: 20,
      analysisTemperatureC: 120,
    }],
  });
}

function profileInput() {
  return {
    profileId: 'WP7-OPERATING-W-PLUS-T-R1',
    profileVersion: 1,
    qualification: 'QUALIFIED',
    locked: true,
    ruleId: EMPIRICAL_OPERATING_REACTION_RULE_ID,
    ownership: {
      verticalLoadCaseId: 'W-HOT',
      lineStopLoadCaseId: 'EXP-THERMAL-ON-HOT-SUPPORT-SET',
      outputLoadCaseId: 'OPE-HOT',
      verticalResultClass: 'VERTICAL_SCREENING_RESULT',
      lineStopResultClass: 'THERMAL_LINE_STOP_SCREENING_RESULT',
      outputResultClass: 'COMBINED_OPERATING_REACTION',
      verticalForceOwner: 'VERTICAL_AXIS_ONLY',
      lineStopForceOwner: 'ONE_ORTHOGONAL_LINE_STOP_AXIS_ONLY',
      verticalOwnsMoments: true,
      lineStopOwnsMoments: false,
      pressureCompatibilityIncluded: false,
      pressureStressIncluded: false,
    },
    domain: {
      requireSameDataset: true,
      requireSameSourceBindings: true,
      requireSameCoordinateFrame: true,
      requireSameForceConvention: true,
      requireSameMomentConvention: true,
      requireSharedCustodyForOverlappingSites: true,
      allowVerticalOnlySites: true,
      allowLineStopOnlySites: true,
      allowPressureEffects: false,
      allowBlindVectorAddition: false,
    },
    tolerances: {
      directionOrthogonalityCosine: 1e-8,
      unownedForceN: 1e-5,
      unownedMomentNm: 1e-8,
      zeroForceN: 1e-9,
    },
  };
}

function sourceBindings(profile) {
  return {
    datasetHash: SOURCE_HASH,
    sharedModelHash: sharedModel.semanticHash,
    topologyHash: topologyGraph.semanticHash,
    attachmentHash: supportAttachmentModel.semanticHash,
    restraintHash: restraintCapabilityModel.semanticHash,
    profileHash: profile.semanticHash,
  };
}

function profileRef(profile) {
  return {
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    qualification: profile.qualification,
    locked: profile.locked,
    semanticHash: profile.semanticHash,
  };
}

function fixtureSharedModel() {
  const evidence = (sourcePath, value, unit = '') => ({
    sourceKind: 'FIXTURE', sourcePath, value, unit,
  });
  const support = (supportKey, type, x, capabilities) => ({
    supportKey,
    sourceEntityId: `entity:${supportKey}`,
    name: supportKey,
    type,
    identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS', zoneId: 'Z1' },
    position: { x, y: 0, z: 0 },
    engineeringProperties: {},
    compatibilityEvidence: {},
    supportEvidence: {
      supportTypes: [evidence(`${supportKey}/type`, type)],
      attachedComponentReferences: [evidence(`${supportKey}/component`, 'PIPE-1')],
      verticalCapabilities: [evidence(`${supportKey}/vertical`, capabilities.vertical)],
      lateralCapabilities: [evidence(`${supportKey}/lateral`, capabilities.lateral)],
      longitudinalCapabilities: [evidence(`${supportKey}/longitudinal`, capabilities.longitudinal)],
      rotationalCapabilities: [evidence(`${supportKey}/rotational`, capabilities.rotational)],
    },
    sourceReferences: {},
    diagnostics: [],
  });
  return createSharedPipingModel({
    project: {
      datasetId: DATASET_ID,
      name: 'WP7 operating reaction fixture',
      sourceName: 'normalized-fixture',
    },
    units: { length: 'mm', force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId: DATASET_ID,
      sourceSchema: 'analysis-workspace-dataset/v1',
      sourceSemanticHash: 'fnv1a64:7777777777777777',
      sourceByteHash: SOURCE_HASH,
    },
    components: [{
      componentKey: 'PIPE-1',
      sourceEntityId: 'entity:PIPE-1',
      name: 'PIPE-1',
      type: 'PIPE',
      identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS', zoneId: 'Z1' },
      geometry: {
        start: { x: 0, y: 0, z: 0 },
        end: { x: 10000, y: 0, z: 0 },
        center: null,
        points: [],
        branchPoints: [],
        ports: [
          { portKey: 'PIPE-1:START', role: 'start', position: { x: 0, y: 0, z: 0 } },
          { portKey: 'PIPE-1:END', role: 'end', position: { x: 10000, y: 0, z: 0 } },
        ],
      },
      engineeringProperties: {
        outerDiameterMm: evidence('PIPE-1/od', 100, 'mm'),
        wallThicknessMm: evidence('PIPE-1/wall', 5, 'mm'),
        materialDensityKgM3: evidence('PIPE-1/density', 7850, 'kg/m3'),
        insulationThicknessMm: evidence('PIPE-1/insulation', 0, 'mm'),
        fluidDensityOpeKgM3: evidence('PIPE-1/ope-fluid', 1000, 'kg/m3'),
        fluidDensityHydKgM3: evidence('PIPE-1/hyd-fluid', 1000, 'kg/m3'),
      },
      compatibilityEvidence: {},
      loadEvidence: {},
      sourceReferences: {},
      diagnostics: [],
    }],
    supports: [
      support('SUP-A', 'ANCHOR', 0, {
        vertical: 'RESTRAINED', lateral: 'RESTRAINED',
        longitudinal: 'RESTRAINED', rotational: 'RESTRAINED',
      }),
      support('SUP-M', 'REST', 5000, {
        vertical: 'RESTRAINED', lateral: 'FREE',
        longitudinal: 'FREE', rotational: 'FREE',
      }),
      support('SUP-B', 'ANCHOR', 10000, {
        vertical: 'RESTRAINED', lateral: 'RESTRAINED',
        longitudinal: 'RESTRAINED', rotational: 'RESTRAINED',
      }),
    ],
    sourceReferences: { nodes: [] },
    diagnostics: [],
  });
}

function mutateExecution(execution, mutate) {
  const copy = structuredClone(execution);
  mutate(copy);
  delete copy.semanticHash;
  return { ...copy, semanticHash: semanticHash(copy) };
}

function indexBySite(rows) {
  return new Map(rows.map((row) => [row.supportSiteId, row]));
}

function hasBlocker(result, code) {
  return result.loadCases.some((row) => row.blockers.some((blocker) => blocker.code === code));
}

function vectorMagnitude(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function close(actual, expected, absoluteTolerance, label) {
  assert(
    Math.abs(actual - expected) <= absoluteTolerance,
    `${label}: expected ${expected}, received ${actual}, tolerance ${absoluteTolerance}`,
  );
}
