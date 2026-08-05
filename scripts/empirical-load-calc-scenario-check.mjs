import assert from 'node:assert/strict';
import { createSharedPipingModel, semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { buildModelLoadFoundation } from '../src/core/model-loads/index.js';
import {
  buildSjsonEmpiricalPipingRequest,
} from '../src/workspace/engineering-loads/adapters/sjson-to-empirical-piping-request.js';
import {
  EmpiricalLoadCalcScenarioController,
  EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS,
} from '../src/workspace/engineering-loads/empirical-load-calc-scenario-controller.js';
import {
  EmpiricalLoadCalcScenarioStore,
} from '../src/workspace/engineering-loads/empirical-load-calc-scenario-store.js';
import {
  createEmpiricalBeamContactRuntimeProfile,
} from '../src/workspace/engineering-loads/empirical-beam-contact-runtime-profile.js';
import {
  createEmpiricalAnalysisScenario,
  createEmpiricalCoordinateFrame,
  createEmpiricalRestraintOverride,
} from '../src/workspace/engineering-loads/contracts/empirical-sjson-contracts.js';
import {
  renderEmpiricalScenarioEvidence,
  renderEmpiricalScenarioLoadCases,
  renderEmpiricalScenarioMethods,
  renderEmpiricalScenarioModel3d,
  renderEmpiricalScenarioOverview,
  renderEmpiricalScenarioRestraints,
  renderEmpiricalScenarioResults,
} from '../src/workspace/engineering-loads/empirical-load-calc-scenario-view.js';

const fixture = buildFixture();
let executionCount = 0;
const executor = (value) => {
  executionCount += 1;
  const core = {
    status: 'CALCULATED',
    loadCases: [{
      loadCaseId: 'W-COLD',
      label: 'Cold weight',
      resultClass: 'VERTICAL_SCREENING_RESULT',
      status: 'CALCULATED',
      blockers: [],
      supportResults: [],
      semanticHash: 'fnv1a64:8888888888888888',
    }],
    semanticHash: 'fnv1a64:9999999999999999',
  };
  const base = {
    schema: 'authorized-empirical-beam-contact-execution/v1',
    method: 'EMPIRICAL_BEAM_CONTACT_V1',
    executionId: value.executionId,
    executedAt: value.executedAt,
    sourceLoadPrimitiveSetSemanticHash: value.sourceLoadPrimitiveSet.semanticHash,
    adaptedLoadPrimitiveSetSemanticHash: 'fnv1a64:7777777777777777',
    coreResult: core,
  };
  return Object.freeze({ ...base, semanticHash: semanticHash(base) });
};
const store = new EmpiricalLoadCalcScenarioStore(executor);
const proposalInput = {
  adaptedRequest: fixture.adaptedRequest,
  runtimeProfile: fixture.runtimeProfile,
  caseConfigurations: [{
    loadCaseId: 'W-COLD',
    weightPrimitiveCaseId: 'EMPTY',
    referenceTemperatureC: null,
    analysisTemperatureC: null,
  }],
  sharedModel: fixture.sharedModel,
  topologyGraph: fixture.topologyGraph,
  supportAttachmentModel: fixture.supportAttachmentModel,
  restraintCapabilityModel: fixture.restraintCapabilityModel,
  sourceLoadPrimitiveSet: fixture.loadFoundation.loadPrimitiveSet,
};

let snapshot = store.configure(proposalInput);
assert.equal(snapshot.state, 'DRAFT_READY');
assert.equal(snapshot.calculationEligible, false);
assert.equal(snapshot.overrideCount, 1);
assert.equal(executionCount, 0, 'configuration must not execute');
assert.throws(() => store.execute({
  executionId: 'PREMATURE',
  executedAt: '2026-08-05T18:20:00.000Z',
}), /current explicit authorization/i);
assert.equal(executionCount, 0, 'blocked execution must not call runtime');

snapshot = store.authorize({
  authorizationId: 'AUTH:WP3',
  authorizedAt: '2026-08-05T18:21:00.000Z',
});
assert.equal(snapshot.state, 'AUTHORIZED_CURRENT');
assert.equal(snapshot.calculationEligible, true);
assert.equal(executionCount, 0, 'authorization must not auto-execute');
assert.deepEqual(store.getAuthorization().policy, {
  explicitAuthorization: true,
  autoExecution: false,
  geometryMutationPermitted: false,
  combinedOperatingReactionPermitted: false,
});

const execution = store.execute({
  executionId: 'EXEC:WP3',
  executedAt: '2026-08-05T18:22:00.000Z',
});
assert.equal(executionCount, 1);
assert.equal(execution.executionId, 'EXEC:WP3');
assert.equal(store.getSnapshot().state, 'EXECUTED_CURRENT');

const clone = store.cloneProfile({ profileId: 'WP3-CLONE' });
assert.equal(clone.qualification, 'UNQUALIFIED');
assert.equal(clone.locked, false);
assert.equal(clone.profileVersion, fixture.runtimeProfile.profileVersion + 1);
assert.equal(store.getProposal().runtimeProfile.locked, true, 'clone must not mutate bound profile');

const staleBindings = {
  ...store.getProposal().bindings,
  loadPrimitiveSetSemanticHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
};
snapshot = store.refresh(staleBindings);
assert.equal(snapshot.state, 'EXECUTED_STALE');
assert.equal(snapshot.calculationEligible, false);
assert(snapshot.details.some((row) => row.field === 'loadPrimitiveSetSemanticHash'));
assert.throws(() => store.execute({
  executionId: 'STALE',
  executedAt: '2026-08-05T18:23:00.000Z',
}), /current explicit authorization/i);
assert.equal(executionCount, 1);

const override = store.getProposal().overrideJournal[0];
assert.equal(override.reason, 'WP3 calculation-only fixture override.');
assert.equal(override.geometryChanged, false);
assert.notEqual(override.sourceDirection, '');
assert.notEqual(override.effectiveDirection, '');

const eventBus = new FakeEventBus();
const controllerStore = new EmpiricalLoadCalcScenarioStore(executor);
const controller = new EmpiricalLoadCalcScenarioController(
  eventBus,
  () => ({
    datasetId: fixture.sharedModel.project.datasetId,
    sharedModel: fixture.sharedModel,
    topologyGraph: fixture.topologyGraph,
    supportAttachmentModel: fixture.supportAttachmentModel,
    restraintCapabilityModel: fixture.restraintCapabilityModel,
    sourceLoadPrimitiveSet: fixture.loadFoundation.loadPrimitiveSet,
  }),
  controllerStore,
);
controller.init();
const changed = [];
const failures = [];
eventBus.subscribe(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CHANGED, (payload) => changed.push(payload));
eventBus.subscribe(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.FAILED, (payload) => failures.push(payload));
eventBus.publish(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CONFIGURE_REQUESTED, proposalInput);
assert.equal(controllerStore.getSnapshot().state, 'DRAFT_READY');
assert.equal(executionCount, 1, 'configure through controller must not execute');
eventBus.publish(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.AUTHORIZE_REQUESTED, {
  authorizationId: 'AUTH:CONTROLLER',
  authorizedAt: '2026-08-05T18:24:00.000Z',
});
assert.equal(controllerStore.getSnapshot().state, 'AUTHORIZED_CURRENT');
assert.equal(executionCount, 1, 'authorize through controller must not execute');
eventBus.publish(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CALCULATE_REQUESTED, {
  executionId: 'EXEC:CONTROLLER',
  executedAt: '2026-08-05T18:25:00.000Z',
});
assert.equal(executionCount, 2);
assert.equal(controllerStore.getSnapshot().state, 'EXECUTED_CURRENT');
assert(changed.length >= 3);
assert.equal(failures.length, 0);
controller.destroy();

const viewState = {
  snapshot: store.getSnapshot(),
  proposal: store.getProposal(),
  authorization: store.getAuthorization(),
  execution,
};
const renderers = [
  renderEmpiricalScenarioOverview,
  renderEmpiricalScenarioRestraints,
  renderEmpiricalScenarioLoadCases,
  renderEmpiricalScenarioMethods,
  renderEmpiricalScenarioResults,
  renderEmpiricalScenarioEvidence,
  renderEmpiricalScenarioModel3d,
];
for (const renderer of renderers) {
  const container = { innerHTML: '' };
  renderer(container, viewState);
  assert(container.innerHTML.length > 100, `${renderer.name} must render substantive UI`);
}
const restraintsContainer = { innerHTML: '' };
renderEmpiricalScenarioRestraints(restraintsContainer, viewState);
assert.match(restraintsContainer.innerHTML, /Source/);
assert.match(restraintsContainer.innerHTML, /Effective/);
assert.match(restraintsContainer.innerHTML, /Geometry/);
assert.match(restraintsContainer.innerHTML, /WP3 calculation-only fixture override/);
const methodsContainer = { innerHTML: '' };
renderEmpiricalScenarioMethods(methodsContainer, viewState);
assert.match(methodsContainer.innerHTML, /EMPIRICAL_BEAM_CONTACT_V1/);
assert.match(methodsContainer.innerHTML, /EMPIRICAL_RESTRAINT_NETWORK_V1/);
assert.match(methodsContainer.innerHTML, /data-empirical-authorize/);
assert.match(methodsContainer.innerHTML, /data-empirical-calculate/);

console.log('empirical-load-calc-scenario-check: PASS');

function buildFixture() {
  const sharedModel = fixtureSharedModel();
  const topologyGraph = buildPipingPortTopologyGraph(sharedModel);
  const supportAttachmentModel = buildSupportAttachmentModel(sharedModel, topologyGraph);
  const restraintCapabilityModel = buildRestraintCapabilityModel(supportAttachmentModel);
  const loadFoundation = buildModelLoadFoundation(sharedModel, topologyGraph);
  const runtimeProfile = createEmpiricalBeamContactRuntimeProfile({
    profileId: 'WP3-PROFILE',
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
          section: 'WP3_SOURCE',
          elasticModulus: 'WP3_SOURCE',
          thermalExpansion: 'WP3_SOURCE',
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
      equilibriumForceN: 1e-4,
      equilibriumMomentNm: 1e-4,
    },
    numericalOptions: {
      pivotMultiplier: 100,
      minimumReciprocalCondition: 1e-12,
    },
  });
  const restraint = restraintCapabilityModel.restraints[0];
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
  const override = createEmpiricalRestraintOverride({
    overrideId: 'OVERRIDE:WP3',
    supportSiteId: restraint.supportKey,
    restraintId: restraint.restraintId,
    sourceType: 'ANCHOR',
    effectiveType: 'ANCHOR',
    sourceDirection: 'ANC',
    effectiveDirection: 'ANC',
    sourceAxis: [1, 0, 0],
    effectiveAxis: [1, 0, 0],
    sourceGapMm: null,
    effectiveGapMm: 0,
    sourceStiffnessNPerM: null,
    effectiveStiffnessNPerM: null,
    sourceFriction: null,
    effectiveFriction: 0,
    reason: 'WP3 calculation-only fixture override.',
    geometryMutation: false,
  });
  const scenario = createEmpiricalAnalysisScenario({
    scenarioId: 'SCENARIO:WP3',
    name: 'WP3 scenario fixture',
    method: 'EMPIRICAL_BEAM_CONTACT_V1',
    state: 'DRAFT',
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
    restraintOverrides: [override],
    profileRef: {
      profileId: runtimeProfile.profileId,
      profileVersion: runtimeProfile.profileVersion,
      qualification: runtimeProfile.qualification,
      locked: runtimeProfile.locked,
      semanticHash: runtimeProfile.semanticHash,
    },
    sourceBindings: {
      datasetHash: 'sha256:wp3-fixture',
      sharedModelHash: sharedModel.semanticHash,
      topologyHash: topologyGraph.semanticHash,
      attachmentHash: supportAttachmentModel.semanticHash,
      restraintHash: restraintCapabilityModel.semanticHash,
      profileHash: runtimeProfile.semanticHash,
    },
    combinationPolicy: 'SEPARATE_UNTIL_QUALIFIED',
  });
  const adaptedRequest = buildSjsonEmpiricalPipingRequest({
    dataset: { datasetId: 'WP3-FIXTURE', sourceSha256: 'sha256:wp3-fixture' },
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    scenario,
  });
  assert.equal(adaptedRequest.status, 'READY_FOR_RUNTIME_BRIDGE');
  return {
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    loadFoundation,
    runtimeProfile,
    adaptedRequest,
  };
}

function fixtureSharedModel() {
  const evidence = (sourcePath, value, unit = '') => ({
    sourceKind: 'FIXTURE', sourcePath, value, unit,
  });
  return createSharedPipingModel({
    project: {
      datasetId: 'WP3-FIXTURE',
      name: 'WP3 fixture',
      sourceName: 'normalized-fixture',
    },
    units: { length: 'mm', force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId: 'WP3-FIXTURE',
      sourceSchema: 'analysis-workspace-dataset/v1',
      sourceSemanticHash: 'fnv1a64:4444444444444444',
      sourceByteHash: 'sha256:wp3-fixture',
    },
    components: [{
      componentKey: 'PIPE-1',
      sourceEntityId: 'entity:PIPE-1',
      name: 'PIPE-1',
      type: 'PIPE',
      identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS', zoneId: 'Z1' },
      geometry: {
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1000, y: 0, z: 0 },
        center: null,
        points: [],
        branchPoints: [],
        ports: [
          { portKey: 'PIPE-1:START', role: 'start', position: { x: 0, y: 0, z: 0 } },
          { portKey: 'PIPE-1:END', role: 'end', position: { x: 1000, y: 0, z: 0 } },
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
    supports: [{
      supportKey: 'ANCHOR-A',
      sourceEntityId: 'entity:ANCHOR-A',
      name: 'ANCHOR-A',
      type: 'ANCHOR',
      identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS', zoneId: 'Z1' },
      position: { x: 0, y: 0, z: 0 },
      engineeringProperties: {},
      compatibilityEvidence: {},
      supportEvidence: {
        supportTypes: [evidence('ANCHOR-A/type', 'ANCHOR')],
        attachedComponentReferences: [evidence('ANCHOR-A/component', 'PIPE-1')],
        verticalCapabilities: [evidence('ANCHOR-A/vertical', 'RESTRAINED')],
        lateralCapabilities: [evidence('ANCHOR-A/lateral', 'RESTRAINED')],
        longitudinalCapabilities: [evidence('ANCHOR-A/longitudinal', 'RESTRAINED')],
        rotationalCapabilities: [evidence('ANCHOR-A/rotational', 'RESTRAINED')],
      },
      sourceReferences: {},
      diagnostics: [],
    }],
    sourceReferences: { nodes: [] },
    diagnostics: [],
  });
}

class FakeEventBus {
  constructor() { this.listeners = new Map(); }
  subscribe(topic, callback) {
    const rows = this.listeners.get(topic) || new Set();
    rows.add(callback);
    this.listeners.set(topic, rows);
    return () => rows.delete(callback);
  }
  publish(topic, payload) {
    [...(this.listeners.get(topic) || [])].forEach((callback) => callback(payload));
  }
}
