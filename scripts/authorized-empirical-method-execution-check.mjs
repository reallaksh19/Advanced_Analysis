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

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
});

const authorizedInput = makeAuthorizedInput();
const onRoute = fixture({ x: 250, y: 0, z: 0 });
const requestBase = {
  executionId: 'EXECUTION-EMP-03CA',
  executedAt: '2026-08-04T20:20:00.000Z',
  authorizedInput,
  ...onRoute,
};
const before = semanticHash(requestBase);

const v1 = calculateAuthorizedEmpiricalLoadExecution({
  schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  ...requestBase,
});
const v2 = execute(EMPIRICAL_LOAD_METHOD, requestBase);
const v2Repeated = execute(EMPIRICAL_LOAD_METHOD, requestBase);
assert.deepEqual(v2Repeated, v2);
assert.equal(semanticHash(requestBase), before, 'method execution mutated inputs');
assert.equal(v2.schema, AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA);
assert.equal(v2.requestedMethod, EMPIRICAL_LOAD_METHOD);
assert.equal(v2.executedMethod, EMPIRICAL_LOAD_METHOD);
assert.equal(v2.distribution.method, EMPIRICAL_LOAD_METHOD);
assert.equal(v2.status, 'CALCULATED');
assert.deepEqual(v2.distribution, v1.distribution);
assert.equal(v2.distributionSemanticHash, v1.distributionSemanticHash);

const v3 = execute(EMPIRICAL_LOAD_COG_METHOD, requestBase);
assert.equal(v3.requestedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(v3.executedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(v3.distribution.method, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(v3.status, 'CALCULATED');
assert.deepEqual(reactions(v2), [
  108.54227332218605,
  108.54227332218605,
]);
assert.deepEqual(reactions(v3), [
  133.06727332218605,
  84.01727332218604,
]);
assert.equal(v3.distribution.loadCases[0].equilibrium.forceResidualN, 0);
assert.equal(v3.distribution.loadCases[0].equilibrium.momentResidualNmm, 0);
assert.equal(componentContribution(v3).chainageMm, 250);

const offRoute = fixture({ x: 250, y: 25, z: 0 });
const blockedV3 = execute(EMPIRICAL_LOAD_COG_METHOD, {
  ...requestBase,
  ...offRoute,
});
assert.equal(blockedV3.status, 'BLOCKED');
assert.equal(blockedV3.summary.blockedCaseCount, 1);
assert.equal(
  blockedV3.distribution.loadCases[0].supportResults
    .every((row) => row.verticalForceN === null),
  true,
);
assert.equal(
  blockedV3.distribution.loadCases[0].excludedInputs
    .some((row) => row.code === 'EMPIRICAL_COMPONENT_COG_OFF_ROUTE'),
  true,
);

assert.throws(
  () => execute('UNAUTHORIZED_METHOD', requestBase),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V2_METHOD_INVALID',
);

const methodTamper = structuredClone(v3);
methodTamper.executedMethod = EMPIRICAL_LOAD_METHOD;
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV2(methodTamper),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V2_METHOD_MISMATCH',
);

const distributionTamper = structuredClone(v3);
distributionTamper.distribution.loadCases[0].supportResults[0].verticalForceN += 1;
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV2(distributionTamper),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V2_HASH_MISMATCH',
);

assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV2({ ...v3, unexpected: true }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V2_KEYS_INVALID',
);

console.log(JSON.stringify({
  status: 'PASS',
  v1ReceiptSchema: v1.schema,
  v1DistributionSemanticHash: v1.distributionSemanticHash,
  v2ReceiptSchema: v2.schema,
  v2ReceiptSemanticHash: v2.semanticHash,
  v2RequestedMethod: v2.requestedMethod,
  v2DistributionSemanticHash: v2.distributionSemanticHash,
  v3ReceiptSemanticHash: v3.semanticHash,
  v3RequestedMethod: v3.requestedMethod,
  v3DistributionSemanticHash: v3.distributionSemanticHash,
  v2ReactionsN: reactions(v2),
  v3ReactionsN: reactions(v3),
  blockedV3Status: blockedV3.status,
  ordinaryRuntimeCutover: false,
  v1ContractChanged: false,
}, null, 2));

function execute(method, input) {
  return calculateAuthorizedEmpiricalLoadExecutionV2({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
    method,
    ...input,
  });
}

function reactions(execution) {
  return execution.distribution.loadCases[0].supportResults
    .map((row) => row.verticalForceN);
}

function componentContribution(execution) {
  return execution.distribution.loadCases[0].contributionLedger
    .find((row) => row.entityId === 'VALVE-1');
}

function fixture(cogPointMm) {
  return {
    dataset: {
      schema: 'analysis-workspace-dataset/v1',
      datasetId: 'EMP-PROD-03CA-DATASET',
      version: 1,
      sourceSha256: HASHES.dataset,
      sharedModel: sharedModel(cogPointMm),
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
      lineListSource: sourced({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: sourced({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: sourced({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
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
      equilibriumTolerances: approved(
        { forceN: 1e-8, momentNmm: 1e-5 },
        'EMP_PROD_03CA_EQUILIBRIUM',
      ),
      activeLoadCases: approved(['EMPTY'], 'EMP_PROD_03CA_CASES'),
    },
  };
}

function sharedModel(cogPointMm) {
  const base = {
    schema: 'shared-piping-model/v1',
    units: { length: 'mm', force: 'N', mass: 'kg' },
    components: [{
      componentKey: 'VALVE-1',
      sourceEntityId: 'SOURCE-VALVE-1',
      type: 'VALVE',
      loadEvidence: {
        componentCog: componentCog(cogPointMm, 'mm', 'fixture.componentCog'),
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
