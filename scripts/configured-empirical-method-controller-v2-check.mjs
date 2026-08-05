import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA,
  sealAuthorizedEmpiricalRuntimePackageV2,
} from '../src/workspace/engineering-loads/authorized-empirical-runtime-package-v2.js';
import {
  AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
  sealAuthorizedEmpiricalRuntimePackage,
} from '../src/workspace/engineering-loads/authorized-empirical-runtime-package.js';
import {
  AuthorizedEmpiricalRuntimeStoreV2,
} from '../src/workspace/engineering-loads/authorized-empirical-runtime-store-v2.js';
import {
  AuthorizedEmpiricalRuntimeStore,
  EMPIRICAL_AUTHORIZATION_STATES,
} from '../src/workspace/engineering-loads/authorized-empirical-runtime-store.js';
import {
  ConfiguredEmpiricalMethodControllerV2,
} from '../src/workspace/engineering-loads/configured-empirical-method-controller-v2.js';
import {
  EngineeringSupportLoadStore,
} from '../src/workspace/engineering-loads/engineering-support-load-store.js';
import { EMPIRICAL_LOAD_COG_METHOD } from '../src/workspace/engineering-loads/support-load-distribution-v3.js';
import {
  AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_REQUEST_SCHEMA,
  AuthorizedEmpiricalMethodConsumerControllerV2,
} from '../src/workspace/enrichment/authorized-empirical-method-consumer-controller-v2.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
});
const fixture = makeFixture();
let activeProfile = fixture.profile;
const modelStore = {
  getDataset: () => fixture.dataset,
  getSupportSiteModel: () => fixture.supportSiteModel,
  getRoutePartitionModel: () => fixture.routePartitionModel,
};
const profileStore = { getProfile: () => activeProfile };
const supportLoadStore = new EngineeringSupportLoadStore();
const runtimeStoreV2 = new AuthorizedEmpiricalRuntimeStoreV2();
const configured = new ConfiguredEmpiricalMethodControllerV2({
  modelStore,
  profileStore,
  supportLoadStore,
  runtimeStore: runtimeStoreV2,
});
const masters = { getMasterData: () => fixture.masterData };
const consumer = new AuthorizedEmpiricalMethodConsumerControllerV2({
  configuredController: configured,
  masters,
});
const authorizedInput = makeAuthorizedInput();
const bindings = currentBindings(fixture, activeProfile, authorizedInput);
const runtimePackageV2 = sealAuthorizedEmpiricalRuntimePackageV2({
  schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA,
  packageId: 'PACKAGE-EMP-03CB2',
  configuredAt: '2026-08-04T20:45:00.000Z',
  executionId: 'EXECUTION-EMP-03CB2',
  executedAt: '2026-08-04T20:46:00.000Z',
  method: EMPIRICAL_LOAD_COG_METHOD,
  authorizedInput,
  bindings,
});

const runtimeStoreV1 = new AuthorizedEmpiricalRuntimeStore();
const runtimePackageV1 = sealAuthorizedEmpiricalRuntimePackage({
  schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
  packageId: 'PACKAGE-EMP-03CB2-V1',
  configuredAt: '2026-08-04T20:44:00.000Z',
  executionId: 'EXECUTION-EMP-03CB2-V1',
  executedAt: '2026-08-04T20:44:30.000Z',
  authorizedInput,
  bindings,
});
const v1State = runtimeStoreV1.configure(runtimePackageV1, bindings);
assert.equal(v1State.state, EMPIRICAL_AUTHORIZATION_STATES.AUTHORIZED_CURRENT);

const configuredState = consumer.configure({
  schema: AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_REQUEST_SCHEMA,
  runtimePackage: runtimePackageV2,
});
assert.equal(configuredState.state, EMPIRICAL_AUTHORIZATION_STATES.AUTHORIZED_CURRENT);
assert.equal(configuredState.calculationEligible, true);
assert.equal(configuredState.method, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(configuredState.packageSemanticHash, runtimePackageV2.semanticHash);

const execution = consumer.execute();
assert.equal(execution.schema, 'authorized-empirical-load-execution/v2');
assert.equal(execution.executedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.deepEqual(reactions(execution), [
  133.06727332218605,
  84.01727332218604,
]);
assert.equal(execution.distribution.loadCases[0].equilibrium.forceResidualN, 0);
assert.equal(execution.distribution.loadCases[0].equilibrium.momentResidualNmm, 0);
assert.equal(
  supportLoadStore.getAuthorizedExecution().semanticHash,
  execution.semanticHash,
);
assert.equal(
  supportLoadStore.getDistribution().method,
  EMPIRICAL_LOAD_COG_METHOD,
);
const executedState = consumer.getState();
assert.equal(executedState.state, EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_CURRENT);
assert.equal(executedState.executionSemanticHash, execution.semanticHash);
assert.equal(executedState.requestedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(executedState.executedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(runtimeStoreV1.getSnapshot().state, EMPIRICAL_AUTHORIZATION_STATES.AUTHORIZED_CURRENT);

assert.equal(consumer.refresh().state, EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_CURRENT);
activeProfile = {
  ...activeProfile,
  revision: activeProfile.revision + 1,
  updatedAt: '2026-08-04T20:47:00.000Z',
};
const staleByBinding = consumer.refresh();
assert.equal(staleByBinding.state, EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_STALE);
assert.equal(staleByBinding.calculationEligible, false);
assert.equal(staleByBinding.reasonCode, 'AUTHORIZATION_BINDINGS_CHANGED');
assert.throws(
  () => consumer.execute(),
  (error) => error.code === 'EMPIRICAL_RUNTIME_V2_NOT_CALCULATION_ELIGIBLE',
);
const staleEvent = consumer.markStale('PROJECT_DATA_CHANGED', 2);
assert.equal(staleEvent.state, EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_STALE);
assert.equal(supportLoadStore.getAuthorizedExecution(), null);
assert.equal(supportLoadStore.getDistribution().freshness.status, 'STALE');

assert.throws(
  () => consumer.configure({
    schema: AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_REQUEST_SCHEMA,
    runtimePackage: runtimePackageV2,
    unexpected: true,
  }),
  (error) => error.code === 'AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_KEYS_INVALID',
);
assert.throws(
  () => consumer.configure({
    schema: 'unsupported',
    runtimePackage: runtimePackageV2,
  }),
  (error) => error.code === 'AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_SCHEMA_INVALID',
);

consumer.clear();
assert.equal(consumer.getState().state, EMPIRICAL_AUTHORIZATION_STATES.NOT_CONFIGURED);
assert.equal(supportLoadStore.getDistribution(), null);
assert.equal(runtimeStoreV1.getSnapshot().state, EMPIRICAL_AUTHORIZATION_STATES.AUTHORIZED_CURRENT);

const bootstrapSource = await readFile(
  new URL('../src/workspace/bootstrap.js', import.meta.url),
  'utf8',
);
assert.equal(
  bootstrapSource.includes('authorizedEmpiricalMethodConsumerControllerV2'),
  false,
  'V2 method controller leaked into the ordinary workspace bootstrap',
);

console.log(JSON.stringify({
  status: 'PASS',
  consumerRequestSchema: AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_REQUEST_SCHEMA,
  configuredState: configuredState.state,
  executedState: executedState.state,
  runtimePackageMethod: runtimePackageV2.method,
  runtimePackageSemanticHash: runtimePackageV2.semanticHash,
  executionSemanticHash: execution.semanticHash,
  distributionSemanticHash: execution.distributionSemanticHash,
  reactionsN: reactions(execution),
  staleState: staleByBinding.state,
  staleReason: staleByBinding.reasonCode,
  v1Coexists: runtimeStoreV1.getSnapshot().state === EMPIRICAL_AUTHORIZATION_STATES.AUTHORIZED_CURRENT,
  ordinaryBootstrapExposure: false,
}, null, 2));

function reactions(value) {
  return value.distribution.loadCases[0].supportResults
    .map((row) => row.verticalForceN);
}

function currentBindings(value, profile, input) {
  return {
    projectId: input.projectId,
    datasetId: value.dataset.datasetId,
    datasetVersion: value.dataset.version,
    sourceDatasetHash: value.dataset.sourceSha256,
    sharedModelSemanticHash: semanticHash(value.dataset.sharedModel),
    supportSiteModelSemanticHash: semanticHash(value.supportSiteModel),
    routePartitionModelSemanticHash: semanticHash(value.routePartitionModel),
    projectDataProfileSemanticHash: semanticHash(profile),
    masterSourceHashes: {
      dataset: HASHES.dataset,
      lineList: HASHES.lineList,
      pipingClass: HASHES.pipingClass,
      componentWeight: HASHES.componentWeight,
    },
  };
}

function makeFixture() {
  return {
    dataset: {
      schema: 'analysis-workspace-dataset/v1',
      datasetId: 'EMP-PROD-03CB2-DATASET',
      version: 1,
      sourceSha256: HASHES.dataset,
      sharedModel: sharedModel(),
      entities: [
        entity('PIPE-1', 'PIPE', 'pipe', 'SOURCE-PIPE-1', {}),
        entity('VALVE-1', 'VALVE', 'component', 'SOURCE-VALVE-1', {
          attributes: { CATALOG_KEY: 'CV-1' },
        }),
      ],
    },
    profile: makeProfile(),
    supportSiteModel: {
      schema: 'support-site-model/v1',
      sites: [support('S-0', 0), support('S-1', 1000)],
    },
    routePartitionModel: {
      schema: 'route-partition-model/v1',
      routes: [{
        routeId: 'ROUTE-1',
        status: 'READY',
        blockers: [],
        physicalEdgeIds: ['PIPE-1', 'VALVE-1'],
        entityChainages: [
          chainage('PIPE-1', 0, 1000, 500),
          chainage('VALVE-1', 500, 500, 500),
        ],
      }],
      edges: [
        edge('PIPE-1', 'PIPE', { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }, 1000, false),
        edge('VALVE-1', 'VALVE', { x: 500, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, 0, true),
      ],
    },
    masterData: {
      lineList: { sourceHash: HASHES.lineList },
      pipingClass: { sourceHash: HASHES.pipingClass },
      weight: { sourceHash: HASHES.componentWeight },
    },
  };
}

function makeAuthorizedInput() {
  const overlay = {
    pipeSectionProperties: {
      'L-1': {
        outsideDiameterMm: 100,
        wallThicknessMm: 5,
        materialCode: 'MAT-1',
        insulationCode: 'INS-1',
        insulationThicknessMm: 10,
      },
    },
    materialDensitiesKgPerM3: { 'MAT-1': 7850 },
    operatingFluidDensitiesKgPerM3: { 'L-1': 800 },
    hydroFluidDensitiesKgPerM3: { 'L-1': 1000 },
    insulationDensitiesKgPerM3: { 'INS-1': 120 },
    componentWeightsKg: { 'CV-1': 10 },
  };
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: 'INTAKE-EMP-03CB2',
    projectId: 'EMP-PROD-03CB2-PROJECT',
    baselineId: 'BASELINE-EMP-03CB2',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-04T20:44:00.000Z',
    lineBindings: [{
      targetId: 'line:001',
      sourceRecordId: 'SOURCE-PIPE-1',
      lineKey: 'L-1',
      projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
    }],
    componentBindings: [{
      targetId: 'component:001',
      sourceRecordId: 'SOURCE-VALVE-1',
      lineKey: 'L-1',
      catalogKey: 'CV-1',
      projectionRecordSemanticHash: 'fnv1a64:8888888888888888',
    }],
    loadCalculationOverlay: overlay,
    overlaySemanticHash: semanticHash(overlay),
    summary: {
      lineCount: 1,
      componentCount: 1,
      materialCodeCount: 1,
      insulationCodeCount: 1,
      componentCatalogCount: 1,
    },
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalLoadInput({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalLoadInputSemanticHash(draft),
  });
}

function makeProfile() {
  const empty = createEmptyProjectDataProfile();
  const approved = (value, source) => createEvidenceValue(value, { source }, true);
  const sourced = (value, sourceKey, sourceHash) => createEvidenceValue(
    value,
    { source: 'EMP_PROD_03CB2_FIXTURE', sourceKey, sourceHash },
    true,
  );
  return {
    ...empty,
    projectId: 'EMP-PROD-03CB2-PROJECT',
    revision: 1,
    updatedAt: '2026-08-04T20:43:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: sourced({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: sourced({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: sourced({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_03CB2_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_03CB2_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_03CB2_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_03CB2_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP_PROD_03CB2_TOPOLOGY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_03CB2_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP_PROD_03CB2_LOAD_POLICY'),
      equilibriumTolerances: approved(
        { forceN: 1e-8, momentNmm: 1e-5 },
        'EMP_PROD_03CB2_EQUILIBRIUM',
      ),
      activeLoadCases: approved(['EMPTY'], 'EMP_PROD_03CB2_CASES'),
    },
  };
}

function sharedModel() {
  const base = {
    schema: 'shared-piping-model/v1',
    units: { length: 'mm', force: 'N', mass: 'kg' },
    components: [{
      componentKey: 'VALVE-1',
      sourceEntityId: 'SOURCE-VALVE-1',
      type: 'VALVE',
      loadEvidence: {
        componentCog: componentCog(
          { x: 250, y: 0, z: 0 },
          'mm',
          'fixture.componentCog',
        ),
      },
    }],
    supports: [],
  };
  return { ...base, semanticHash: semanticHash(base) };
}

function componentCog(value, unit, sourcePath) {
  return {
    value,
    unit,
    sourceKind: 'COMPOSITE_EXPLICIT_SOURCE_EVIDENCE',
    sourcePath,
    axes: {
      x: evidence(value.x, unit, `${sourcePath}.x`),
      y: evidence(value.y, unit, `${sourcePath}.y`),
      z: evidence(value.z, unit, `${sourcePath}.z`),
    },
  };
}

function evidence(value, unit, sourcePath) {
  return { value, unit, sourcePath, sourceKind: 'EXPLICIT_SOURCE_EVIDENCE' };
}

function entity(entityId, entityType, category, sourceEntityId, properties) {
  return {
    entityId,
    entityType,
    category,
    lineKey: 'L-1',
    sourceEntityId,
    jsonPointer: `/entities/${entityId}`,
    componentReference: entityId,
    properties,
  };
}

function support(siteId, x) {
  return {
    siteId,
    tags: [siteId],
    positionMm: { x, y: 0, z: 0 },
    assemblies: [{ members: [{ sourceType: 'REST' }] }],
  };
}

function chainage(entityId, startMm, endMm, pointMm) {
  return {
    entityId,
    startMm,
    endMm,
    pointMm,
    sourceStartChainageMm: startMm,
    sourceEndChainageMm: endMm,
  };
}

function edge(entityId, entityType, startMm, endMm, lengthMm, pointComponent) {
  return {
    entityId,
    entityType,
    startMm,
    endMm,
    lengthMm,
    pointComponent,
    topologyCarrier: false,
  };
}
