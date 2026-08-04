import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecution,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV2,
  requireAuthorizedEmpiricalLoadExecutionV2,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v2.js';
import {
  EMPIRICAL_LOAD_COG_METHOD,
  EMPIRICAL_LOAD_METHOD,
} from '../src/workspace/engineering-loads/support-load-distribution-v3.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';

const onRoute = fixture(componentCog({ x: 250, y: 0, z: 0 }, 'mm', 'fixture.cog250'));
const authorizedInput = makeAuthorizedInput();
const requestBase = {
  executionId: 'EXECUTION-EMP-03CA',
  executedAt: '2026-08-04T20:20:00.000Z',
  authorizedInput,
  dataset: onRoute.dataset,
  profile: onRoute.profile,
  supportSiteModel: onRoute.supportSiteModel,
  routePartitionModel: onRoute.routePartitionModel,
  masterData: onRoute.masterData,
};
const before = semanticHash(requestBase);

const v1 = calculateAuthorizedEmpiricalLoadExecution({
  schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  ...requestBase,
});
const v2Method = calculateAuthorizedEmpiricalLoadExecutionV2({
  schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  method: EMPIRICAL_LOAD_METHOD,
  ...requestBase,
});
const v2Repeated = calculateAuthorizedEmpiricalLoadExecutionV2({
  schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  method: EMPIRICAL_LOAD_METHOD,
  ...requestBase,
});
assert.deepEqual(v2Repeated, v2Method);
assert.equal(semanticHash(requestBase), before, 'authorized method execution mutated inputs');
assert.equal(v2Method.schema, AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA);
assert.equal(v2Method.requestedMethod, EMPIRICAL_LOAD_METHOD);
assert.equal(v2Method.executedMethod, EMPIRICAL_LOAD_METHOD);
assert.equal(v2Method.distribution.method, EMPIRICAL_LOAD_METHOD);
assert.equal(v2Method.status, 'CALCULATED');
assert.deepEqual(v2Method.distribution, v1.distribution);
assert.equal(v2Method.distributionSemanticHash, v1.distributionSemanticHash);

const v3Method = calculateAuthorizedEmpiricalLoadExecutionV2({
  schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  method: EMPIRICAL_LOAD_COG_METHOD,
  ...requestBase,
});
assert.equal(v3Method.requestedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(v3Method.executedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(v3Method.distribution.method, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(v3Method.status, 'CALCULATED');
assert.deepEqual(reactions(v2Method), [
  108.54227332218605,
  108.54227332218605,
]);
assert.deepEqual(reactions(v3Method), [
  133.06727332218605,
  84.01727332218604,
]);
assert.equal(v3Method.distribution.loadCases[0].equilibrium.forceResidualN, 0);
assert.equal(v3Method.distribution.loadCases[0].equilibrium.momentResidualNmm, 0);
assert.equal(
  v3Method.distribution.loadCases[0].contributionLedger
    .find((row) => row.entityId === 'VALVE-1').chainageMm,
  250,
);

const offRoute = fixture(componentCog({ x: 250, y: 25, z: 0 }, 'mm', 'fixture.offRoute'));
const blockedV3 = calculateAuthorizedEmpiricalLoadExecutionV2({
  schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  method: EMPIRICAL_LOAD_COG_METHOD,
  ...requestBase,
  dataset: offRoute.dataset,
  profile: offRoute.profile,
  supportSiteModel: offRoute.supportSiteModel,
  routePartitionModel: offRoute.routePartitionModel,
  masterData: offRoute.masterData,
});
assert.equal(blockedV3.status, 'BLOCKED');
assert.equal(blockedV3.summary.blockedCaseCount, 1);
assert.equal(
  blockedV3.distribution.loadCases[0].supportResults.every((row) => row.verticalForceN === null),
  true,
);
assert.equal(
  blockedV3.distribution.loadCases[0].excludedInputs.some((row) => (
    row.code === 'EMPIRICAL_COMPONENT_COG_OFF_ROUTE'
  )),
  true,
);

assert.throws(
  () => calculateAuthorizedEmpiricalLoadExecutionV2({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
    method: 'UNAUTHORIZED_METHOD',
    ...requestBase,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V2_METHOD_INVALID',
);

const methodTamper = structuredClone(v3Method);
methodTamper.executedMethod = EMPIRICAL_LOAD_METHOD;
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV2(methodTamper),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V2_METHOD_MISMATCH',
);

const hashTamper = structuredClone(v3Method);
hashTamper.distribution.loadCases[0].supportResults[0].verticalForceN += 1;
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV2(hashTamper),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V2_HASH_MISMATCH',
);

const keyTamper = { ...v3Method, unexpected: true };
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV2(keyTamper),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V2_KEYS_INVALID',
);

console.log(JSON.stringify({
  status: 'PASS',
  v1ReceiptSchema: v1.schema,
  v1DistributionSemanticHash: v1.distributionSemanticHash,
  v2ReceiptSchema: v2Method.schema,
  v2ReceiptSemanticHash: v2Method.semanticHash,
  v2RequestedMethod: v2Method.requestedMethod,
  v2DistributionSemanticHash: v2Method.distributionSemanticHash,
  v3ReceiptSemanticHash: v3Method.semanticHash,
  v3RequestedMethod: v3Method.requestedMethod,
  v3DistributionSemanticHash: v3Method.distributionSemanticHash,
  v2ReactionsN: reactions(v2Method),
  v3ReactionsN: reactions(v3Method),
  blockedV3Status: blockedV3.status,
  ordinaryRuntimeCutover: false,
  v1ContractChanged: false,
}, null, 2));

function reactions(execution) {
  return execution.distribution.loadCases[0].supportResults
    .map((row) => row.verticalForceN);
}

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
});

function fixture(cog) {
  const dataset = {
    schema: 'analysis-workspace-dataset/v1',
    datasetId: 'EMP-PROD-03CA-DATASET',
    version: 1,
    sourceSha256: HASHES.dataset,
    sharedModel: sealSharedModel([sharedComponent('VALVE-1', cog)]),
    entities: [
      {
        entityId: 'PIPE-1', entityType: 'PIPE', category: 'pipe', lineKey: 'L-1',
        sourceEntityId: 'SOURCE-PIPE-1', jsonPointer: '/entities/0',
        componentReference: 'PIPE-1', properties: {},
      },
      {
        entityId: 'VALVE-1', entityType: 'VALVE', category: 'component', lineKey: 'L-1',
        sourceEntityId: 'SOURCE-VALVE-1', jsonPointer: '/entities/1',
        componentReference: 'VALVE-1',
        properties: { attributes: { CATALOG_KEY: 'CV-1' } },
      },
    ],
  };
  return {
    dataset,
    profile: makeProfile(),
    supportSiteModel: {
      schema: 'support-site-model/v1',
      sites: [support('S-0', 0), support('S-1', 1000)],
    },
    routePartitionModel: {
      schema: 'route-partition-model/v1',
      routes: [{
        routeId: 'ROUTE-1', status: 'READY', blockers: [],
        physicalEdgeIds: ['PIPE-1', 'VALVE-1'],
        entityChainages: [
          chainage('PIPE-1', 0, 1000, 500),
          chainage('VALVE-1', 500, 500, 500),
        ],
      }],
      edges: [
        {
          entityId: 'PIPE-1', entityType: 'PIPE',
          startMm: { x: 0, y: 0, z: 0 }, endMm: { x: 1000, y: 0, z: 0 },
          lengthMm: 1000, pointComponent: false, topologyCarrier: false,
        },
        {
          entityId: 'VALVE-1', entityType: 'VALVE',
          startMm: { x: 500, y: 0, z: 0 }, endMm: { x: 500, y: 0, z: 0 },
          lengthMm: 0, pointComponent: true, topologyCarrier: false,
        },
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
    intakeId: 'INTAKE-EMP-03CA',
    projectId: 'EMP-PROD-03CA-PROJECT',
    baselineId: 'BASELINE-EMP-03CA',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-04T20:19:00.000Z',
    lineBindings: [{
      targetId: 'line:001', sourceRecordId: 'SOURCE-PIPE-1', lineKey: 'L-1',
      projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
    }],
    componentBindings: [{
      targetId: 'component:001', sourceRecordId: 'SOURCE-VALVE-1', lineKey: 'L-1',
      catalogKey: 'CV-1', projectionRecordSemanticHash: 'fnv1a64:8888888888888888',
    }],
    loadCalculationOverlay: overlay,
    overlaySemanticHash: semanticHash(overlay),
    summary: {
      lineCount: 1, componentCount: 1, materialCodeCount: 1,
      insulationCodeCount: 1, componentCatalogCount: 1,
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
  const source = (value, sourceKey, sourceHash) => createEvidenceValue(
    value,
    { source: 'EMP_PROD_03CA_FIXTURE', sourceKey, sourceHash },
    true,
  );
  return {
    ...empty,
    projectId: 'EMP-PROD-03CA-PROJECT',
    revision: 1,
    updatedAt: '2026-08-04T20:18:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: source({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: source({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: source({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_03CA_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_03CA_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_03CA_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_03CA_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP_PROD_03CA_TOPOLOGY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_03CA_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP_PROD_03CA_LOAD_POLICY'),
      equilibriumTolerances: approved({ forceN: 1e-8, momentNmm: 1e-5 }, 'EMP_PROD_03CA_EQUILIBRIUM'),
      activeLoadCases: approved(['EMPTY'], 'EMP_PROD_03CA_CASES'),
    },
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
    entityId, startMm, endMm, pointMm,
    sourceStartChainageMm: startMm,
    sourceEndChainageMm: endMm,
  };
}

function sharedComponent(componentKey, cog) {
  return {
    componentKey,
    sourceEntityId: `SOURCE-${componentKey}`,
    type: 'VALVE',
    loadEvidence: { componentCog: cog },
  };
}

function componentCog(value, unit, sourcePath) {
  return {
    value, unit, sourceKind: 'COMPOSITE_EXPLICIT_SOURCE_EVIDENCE', sourcePath,
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

function sealSharedModel(components) {
  const base = {
    schema: 'shared-piping-model/v1',
    units: { length: 'mm', force: 'N', mass: 'kg' },
    components,
    supports: [],
  };
  return { ...base, semanticHash: semanticHash(base) };
}
