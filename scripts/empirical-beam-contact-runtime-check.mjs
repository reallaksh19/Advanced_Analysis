import assert from 'node:assert/strict';
import {
  createSharedPipingModel,
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
  getEmpiricalMethodRegistration,
} from '../src/workspace/engineering-loads/empirical-method-registry.js';

const sharedModel = fixtureSharedModel();
const topologyGraph = buildPipingPortTopologyGraph(sharedModel);
const supportAttachmentModel = buildSupportAttachmentModel(sharedModel, topologyGraph);
const restraintCapabilityModel = buildRestraintCapabilityModel(supportAttachmentModel);
const loadFoundation = buildModelLoadFoundation(sharedModel, topologyGraph);
const runtimeProfile = createEmpiricalBeamContactRuntimeProfile({
  profileId: 'WP2-BEAM-CONTACT-PROFILE',
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
        section: 'WP2_TEST_SOURCE',
        elasticModulus: 'WP2_TEST_SOURCE',
        thermalExpansion: 'WP2_TEST_SOURCE',
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
const scenario = createEmpiricalAnalysisScenario({
  scenarioId: 'WP2-SCENARIO',
  name: 'Qualified planar weight/contact bridge',
  method: 'EMPIRICAL_BEAM_CONTACT_V1',
  state: 'AUTHORIZED',
  coordinateFrame,
  loadCases: [{
    loadCaseId: 'W-COLD',
    label: 'Cold weight',
    resultClass: 'VERTICAL_SCREENING_RESULT',
    effects: {
      weight: true,
      thermalStrain: false,
      pressureCompatibility: false,
      pressureStress: false,
    },
  }],
  restraintOverrides: [],
  profileRef: {
    profileId: runtimeProfile.profileId,
    profileVersion: runtimeProfile.profileVersion,
    qualification: runtimeProfile.qualification,
    locked: runtimeProfile.locked,
    semanticHash: runtimeProfile.semanticHash,
  },
  sourceBindings: {
    datasetHash: 'sha256:wp2-fixture',
    sharedModelHash: sharedModel.semanticHash,
    topologyHash: topologyGraph.semanticHash,
    attachmentHash: supportAttachmentModel.semanticHash,
    restraintHash: restraintCapabilityModel.semanticHash,
    profileHash: runtimeProfile.semanticHash,
  },
  combinationPolicy: 'SEPARATE_UNTIL_QUALIFIED',
});
const adaptedRequest = buildSjsonEmpiricalPipingRequest({
  dataset: { datasetId: 'WP2-FIXTURE', sourceSha256: 'sha256:wp2-fixture' },
  sharedModel,
  topologyGraph,
  supportAttachmentModel,
  restraintCapabilityModel,
  scenario,
});
assert.equal(adaptedRequest.status, 'READY_FOR_RUNTIME_BRIDGE');

const execution = calculateAuthorizedEmpiricalBeamContactExecution({
  schema: 'authorized-empirical-beam-contact-execution-request/v1',
  executionId: 'WP2-EXECUTION-1',
  executedAt: '2026-08-05T17:45:00.000Z',
  adaptedRequest,
  sharedModel,
  topologyGraph,
  supportAttachmentModel,
  restraintCapabilityModel,
  sourceLoadPrimitiveSet: loadFoundation.loadPrimitiveSet,
  runtimeProfile,
  caseConfigurations: [{
    loadCaseId: 'W-COLD',
    weightPrimitiveCaseId: 'EMPTY',
    referenceTemperatureC: null,
    analysisTemperatureC: null,
  }],
});

assert.equal(execution.method, 'EMPIRICAL_BEAM_CONTACT_V1');
assert.equal(execution.coreResult.status, 'CALCULATED');
assert.equal(execution.coreResult.loadCases[0].status, 'CALCULATED');
assert.equal(execution.coreResult.loadCases[0].regions.length, 1);
assert.equal(execution.coreResult.loadCases[0].supportResults.length, 3);
assert.equal(execution.coreResult.evidence.rawSjsonConsumed, false);
assert.equal(execution.coreResult.evidence.benchmarkDataConsumed, false);
assert.notEqual(
  execution.sourceLoadPrimitiveSetSemanticHash,
  execution.adaptedLoadPrimitiveSetSemanticHash,
  'load enum normalization must remain explicitly evidenced',
);

const region = execution.coreResult.loadCases[0].regions[0];
assert(region.memberCount >= 2, 'support station must split the source member');
assert(region.jointBalance.ok);
assert(Math.hypot(
  region.equilibrium.forceResidualN.x,
  region.equilibrium.forceResidualN.y,
) <= runtimeProfile.tolerances.equilibriumForceN);
assert(Math.abs(region.equilibrium.momentResidualNm)
  <= runtimeProfile.tolerances.equilibriumMomentNm);
assert(region.numericalEvidence.reciprocalConditionEstimate > 0);

const supportBySite = new Map(execution.coreResult.loadCases[0].supportResults.map((row) => [
  row.supportSiteId,
  row,
]));
assert.equal(supportBySite.get('SUP-A').contactState, 'BILATERAL');
assert.equal(supportBySite.get('SUP-B').contactState, 'BILATERAL');
assert(['ACTIVE', 'LIFTED'].includes(supportBySite.get('SUP-M').contactState));
assert.equal(supportBySite.get('SUP-M').geometryChanged, false);

const registration = getEmpiricalMethodRegistration('EMPIRICAL_BEAM_CONTACT_V1');
assert.equal(registration.runtimeStatus, 'REGISTERED');
assert.deepEqual(registration.qualifiedDofs, ['UX', 'UY', 'RZ']);
const restraintNetworkRegistration = getEmpiricalMethodRegistration(
  'EMPIRICAL_RESTRAINT_NETWORK_V1',
);
assert.equal(restraintNetworkRegistration.runtimeStatus, 'REGISTERED');
assert.equal(
  restraintNetworkRegistration.qualificationStatus,
  'QUALIFIED_RESTRICTED_DOMAIN',
);
assert.deepEqual(
  restraintNetworkRegistration.qualifiedDofs,
  ['ONE_TRANSLATIONAL_DIRECTION'],
);

const staleScenario = createEmpiricalAnalysisScenario({
  ...stripScenarioHash(scenario),
  sourceBindings: {
    ...scenario.sourceBindings,
    profileHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
  },
  profileRef: {
    ...scenario.profileRef,
    semanticHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
  },
});
const staleRequest = buildSjsonEmpiricalPipingRequest({
  dataset: { datasetId: 'WP2-FIXTURE', sourceSha256: 'sha256:wp2-fixture' },
  sharedModel,
  topologyGraph,
  supportAttachmentModel,
  restraintCapabilityModel,
  scenario: staleScenario,
});
assert.throws(() => calculateAuthorizedEmpiricalBeamContactExecution({
  schema: 'authorized-empirical-beam-contact-execution-request/v1',
  executionId: 'WP2-EXECUTION-STALE',
  executedAt: '2026-08-05T17:46:00.000Z',
  adaptedRequest: staleRequest,
  sharedModel,
  topologyGraph,
  supportAttachmentModel,
  restraintCapabilityModel,
  sourceLoadPrimitiveSet: loadFoundation.loadPrimitiveSet,
  runtimeProfile,
  caseConfigurations: [{
    loadCaseId: 'W-COLD',
    weightPrimitiveCaseId: 'EMPTY',
    referenceTemperatureC: null,
    analysisTemperatureC: null,
  }],
}), /profileHash binding is stale|profile identity differs/i);

console.log('empirical-beam-contact-runtime-check: PASS');

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
      datasetId: 'WP2-FIXTURE',
      name: 'WP2 runtime fixture',
      sourceName: 'normalized-fixture',
    },
    units: { length: 'mm', force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId: 'WP2-FIXTURE',
      sourceSchema: 'analysis-workspace-dataset/v1',
      sourceSemanticHash: 'fnv1a64:1111111111111111',
      sourceByteHash: 'sha256:wp2-fixture',
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

function stripScenarioHash(value) {
  const { schema: _schema, semanticHash: _semanticHash, ...rest } = value;
  return rest;
}
