import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  calculateAuthorizedEmpiricalLoadExecutionV2,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v2.js';
import {
  AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA,
  projectAuthorizedEmpiricalExecutionV2Request,
  requireAuthorizedEmpiricalRuntimePackageV2,
  sealAuthorizedEmpiricalRuntimePackageV2,
} from '../src/workspace/engineering-loads/authorized-empirical-runtime-package-v2.js';
import {
  AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
  sealAuthorizedEmpiricalRuntimePackage,
} from '../src/workspace/engineering-loads/authorized-empirical-runtime-package.js';
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
const context = fixture();
const authorizedInput = makeAuthorizedInput();
const bindings = makeBindings(context, authorizedInput);
const common = {
  packageId: 'PACKAGE-EMP-03CB1',
  configuredAt: '2026-08-04T20:35:00.000Z',
  executionId: 'EXECUTION-EMP-03CB1',
  executedAt: '2026-08-04T20:36:00.000Z',
  authorizedInput,
  bindings,
};

const v1 = sealAuthorizedEmpiricalRuntimePackage({
  schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
  ...common,
});
assert.equal(v1.schema, AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA);

const packageV2 = seal(EMPIRICAL_LOAD_METHOD);
const packageV2Repeated = seal(EMPIRICAL_LOAD_METHOD);
const packageV3 = seal(EMPIRICAL_LOAD_COG_METHOD);
assert.deepEqual(packageV2Repeated, packageV2);
assert.equal(packageV2.schema, AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA);
assert.equal(packageV2.method, EMPIRICAL_LOAD_METHOD);
assert.equal(packageV3.method, EMPIRICAL_LOAD_COG_METHOD);
assert.notEqual(packageV2.semanticHash, packageV3.semanticHash);
assert.deepEqual(packageV2.authorizedInput, v1.authorizedInput);
assert.deepEqual(packageV2.bindings, v1.bindings);
assert.equal(Object.isFrozen(packageV2), true);
assert.equal(Object.isFrozen(packageV3.bindings), true);

const requestV2 = project(packageV2);
const requestV3 = project(packageV3);
assert.equal(requestV2.method, EMPIRICAL_LOAD_METHOD);
assert.equal(requestV3.method, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(requestV3.executionId, packageV3.executionId);
assert.equal(requestV3.executedAt, packageV3.executedAt);
assert.equal(requestV3.authorizedInput.semanticHash, authorizedInput.semanticHash);
assert.equal(Object.isFrozen(requestV3), true);
assert.equal(Object.isFrozen(requestV3.dataset), true);

const executionV2 = calculateAuthorizedEmpiricalLoadExecutionV2(requestV2);
const executionV3 = calculateAuthorizedEmpiricalLoadExecutionV2(requestV3);
assert.deepEqual(reactions(executionV2), [
  108.54227332218605,
  108.54227332218605,
]);
assert.deepEqual(reactions(executionV3), [
  133.06727332218605,
  84.01727332218604,
]);
assert.equal(executionV2.requestedMethod, packageV2.method);
assert.equal(executionV3.requestedMethod, packageV3.method);

assert.throws(
  () => sealAuthorizedEmpiricalRuntimePackageV2({
    schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA,
    method: 'UNAUTHORIZED_METHOD',
    ...common,
  }),
  (error) => error.code === 'EMPIRICAL_RUNTIME_PACKAGE_V2_METHOD_INVALID',
);
assert.throws(
  () => sealAuthorizedEmpiricalRuntimePackageV2({
    schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA,
    ...common,
  }),
  (error) => error.code === 'EMPIRICAL_RUNTIME_PACKAGE_V2_KEYS_INVALID',
);

const methodTamper = structuredClone(packageV3);
methodTamper.method = EMPIRICAL_LOAD_METHOD;
assert.throws(
  () => requireAuthorizedEmpiricalRuntimePackageV2(methodTamper),
  (error) => error.code === 'EMPIRICAL_RUNTIME_PACKAGE_V2_HASH_MISMATCH',
);
const bindingTamper = structuredClone(packageV3);
bindingTamper.bindings.datasetId = 'TAMPERED-DATASET';
assert.throws(
  () => requireAuthorizedEmpiricalRuntimePackageV2(bindingTamper),
  (error) => error.code === 'EMPIRICAL_RUNTIME_PACKAGE_V2_HASH_MISMATCH',
);
const inputTamper = structuredClone(packageV3);
inputTamper.authorizedInput.projectId = 'TAMPERED-PROJECT';
assert.throws(
  () => requireAuthorizedEmpiricalRuntimePackageV2(inputTamper),
  (error) => error.code === 'EMPIRICAL_INPUT_HASH_MISMATCH',
);
assert.throws(
  () => requireAuthorizedEmpiricalRuntimePackageV2({
    ...packageV3,
    unexpected: true,
  }),
  (error) => error.code === 'EMPIRICAL_RUNTIME_PACKAGE_V2_KEYS_INVALID',
);
assert.throws(
  () => projectAuthorizedEmpiricalExecutionV2Request({
    runtimePackage: packageV3,
    ...context,
    unexpected: true,
  }),
  (error) => error.code === 'EMPIRICAL_RUNTIME_PACKAGE_V2_KEYS_INVALID',
);

console.log(JSON.stringify({
  status: 'PASS',
  v1Schema: v1.schema,
  v1SemanticHash: v1.semanticHash,
  v2Schema: packageV2.schema,
  v2Method: packageV2.method,
  v2SemanticHash: packageV2.semanticHash,
  v3Method: packageV3.method,
  v3SemanticHash: packageV3.semanticHash,
  packageHashesDistinct: packageV2.semanticHash !== packageV3.semanticHash,
  projectedV2RequestMethod: requestV2.method,
  projectedV3RequestMethod: requestV3.method,
  v2ReactionsN: reactions(executionV2),
  v3ReactionsN: reactions(executionV3),
  storeControllerUiCutover: false,
  v1PackageChanged: false,
}, null, 2));

function seal(method) {
  return sealAuthorizedEmpiricalRuntimePackageV2({
    schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA,
    method,
    ...common,
  });
}

function project(runtimePackage) {
  return projectAuthorizedEmpiricalExecutionV2Request({
    runtimePackage,
    ...context,
  });
}

function reactions(execution) {
  return execution.distribution.loadCases[0].supportResults
    .map((row) => row.verticalForceN);
}

function makeBindings(value, input) {
  return {
    projectId: input.projectId,
    datasetId: value.dataset.datasetId,
    datasetVersion: value.dataset.version,
    sourceDatasetHash: value.dataset.sourceSha256,
    sharedModelSemanticHash: semanticHash(value.dataset.sharedModel),
    supportSiteModelSemanticHash: semanticHash(value.supportSiteModel),
    routePartitionModelSemanticHash: semanticHash(value.routePartitionModel),
    projectDataProfileSemanticHash: semanticHash(value.profile),
    masterSourceHashes: {
      dataset: HASHES.dataset,
      lineList: HASHES.lineList,
      pipingClass: HASHES.pipingClass,
      componentWeight: HASHES.componentWeight,
    },
  };
}

function fixture() {
  return {
    dataset: {
      schema: 'analysis-workspace-dataset/v1',
      datasetId: 'EMP-PROD-03CB1-DATASET',
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
    intakeId: 'INTAKE-EMP-03CB1',
    projectId: 'EMP-PROD-03CB1-PROJECT',
    baselineId: 'BASELINE-EMP-03CB1',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-04T20:34:00.000Z',
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
    { source: 'EMP_PROD_03CB1_FIXTURE', sourceKey, sourceHash },
    true,
  );
  return {
    ...empty,
    projectId: 'EMP-PROD-03CB1-PROJECT',
    revision: 1,
    updatedAt: '2026-08-04T20:33:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: sourced({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: sourced({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: sourced({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_03CB1_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_03CB1_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_03CB1_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_03CB1_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP_PROD_03CB1_TOPOLOGY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_03CB1_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP_PROD_03CB1_LOAD_POLICY'),
      equilibriumTolerances: approved(
        { forceN: 1e-8, momentNmm: 1e-5 },
        'EMP_PROD_03CB1_EQUILIBRIUM',
      ),
      activeLoadCases: approved(['EMPTY'], 'EMP_PROD_03CB1_CASES'),
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
