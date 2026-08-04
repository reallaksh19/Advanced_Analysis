import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  EMPIRICAL_COMPONENT_LOAD_AUTHORITY_AUDIT_SCHEMA,
} from '../src/workspace/engineering-loads/empirical-component-load-authority.js';
import { EMPIRICAL_FORMULA_REGISTER } from '../src/workspace/engineering-loads/empirical-formula-register.js';
import { computeAuthorizedEmpiricalLoadInputSemanticHash } from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v2.js';
import {
  AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
  sealAuthorizedEmpiricalRuntimePackage,
} from '../src/workspace/engineering-loads/authorized-empirical-runtime-package.js';
import {
  EMPIRICAL_LOAD_COG_METHOD,
  SUPPORT_LOAD_DISTRIBUTION_COG_SCHEMA,
} from '../src/workspace/engineering-loads/support-load-distribution-v3.js';
import {
  AUTHORIZED_EMPIRICAL_CONSUMER_REQUEST_SCHEMA,
  AuthorizedEnrichmentConsumerController,
} from '../src/workspace/enrichment/authorized-enrichment-consumer-controller.js';

const sharedRunner = await readFile(
  new URL('./run-authorized-enrichment-consumer-controller-checks.mjs', import.meta.url),
  'utf8',
);
assert.equal(
  sharedRunner.includes('run-empirical-authorized-cutover-checks.mjs'),
  false,
  'branch-specific EMP-01 cutover manifest leaked into the shared controller suite',
);
assert.equal(
  sharedRunner.includes('run-authorized-empirical-load-execution-checks.mjs'),
  true,
  'shared controller suite no longer qualifies authorized empirical execution',
);
assert.equal(EMPIRICAL_FORMULA_REGISTER.schema, 'empirical-formula-register/v1');
assert.equal(EMPIRICAL_FORMULA_REGISTER.method, 'CHAINAGE_TRIBUTARY_SPAN_V2');
assert.equal(EMPIRICAL_FORMULA_REGISTER.validation.detailedAnalysisSubstitution, false);
assert.equal(
  EMPIRICAL_COMPONENT_LOAD_AUTHORITY_AUDIT_SCHEMA,
  'empirical-component-load-authority-audit/v1',
);
assert.equal(SUPPORT_LOAD_DISTRIBUTION_COG_SCHEMA, 'support-load-distribution/v4');
assert.equal(EMPIRICAL_LOAD_COG_METHOD, 'CHAINAGE_TRIBUTARY_SPAN_V3_COG');
assert.equal(
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  'authorized-empirical-load-execution-request/v2',
);
assert.equal(
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA,
  'authorized-empirical-load-execution/v2',
);

const masterData = Object.freeze({ marker: 'MASTER-DATA-EMP01' });
const runtimePackage = makeRuntimePackage();
const authorizationState = Object.freeze({ state: 'AUTHORIZED_CURRENT', calculationEligible: true });
const execution = Object.freeze({
  schema: 'authorized-empirical-load-execution/v1',
  executionId: runtimePackage.executionId,
  distribution: Object.freeze({ status: 'CALCULATED' }),
});
const calls = [];
const engineeringModelStore = {
  configureAuthorizedEmpiricalPackage(value, actualMasterData) {
    calls.push({ kind: 'CONFIGURE', value, masterData: actualMasterData });
    return authorizationState;
  },
  executeConfiguredAuthorized(actualMasterData) {
    calls.push({ kind: 'EXECUTE', masterData: actualMasterData });
    return execution;
  },
  refreshAuthorizedEmpiricalPackage(actualMasterData) {
    calls.push({ kind: 'REFRESH', masterData: actualMasterData });
    return authorizationState;
  },
  markEmpiricalStale(reason, datasetVersion) {
    calls.push({ kind: 'STALE', reason, datasetVersion });
    return Object.freeze({ state: 'AUTHORIZED_STALE', calculationEligible: false, reasonCode: reason });
  },
  getEmpiricalAuthorizationState() { return authorizationState; },
};
const controller = new AuthorizedEnrichmentConsumerController({
  engineeringModelStore,
  masterDataController: { getMasterData() { return masterData; } },
});

const request = Object.freeze({
  schema: AUTHORIZED_EMPIRICAL_CONSUMER_REQUEST_SCHEMA,
  runtimePackage,
});
assert.equal(controller.configureEmpirical(request), authorizationState);
assert.equal(controller.executeEmpirical(), execution);
assert.equal(controller.refreshEmpirical(), authorizationState);
assert.equal(controller.getEmpiricalAuthorizationState(), authorizationState);
assert.equal(controller.markEmpiricalStale('PROJECT_DATA_CHANGED', 8).state, 'AUTHORIZED_STALE');
assert.deepEqual(calls.map((row) => row.kind), ['CONFIGURE', 'EXECUTE', 'REFRESH', 'STALE']);
assert.equal(calls[0].value.semanticHash, runtimePackage.semanticHash);
assert.equal(calls[0].masterData, masterData);
assert.equal(calls[1].masterData, masterData);

assert.throws(
  () => controller.configureEmpirical({ ...request, runtimePackage: { ...runtimePackage, packageId: 'TAMPERED' } }),
  (error) => error.code === 'EMPIRICAL_RUNTIME_PACKAGE_HASH_MISMATCH',
);
assert.equal(calls.length, 4, 'invalid runtime package reached the engineering store');
assert.equal(typeof controller.downloadStagedJson, 'function', 'stagedJson authorized path was removed');

assert.throws(
  () => new AuthorizedEnrichmentConsumerController({
    engineeringModelStore: {}, masterDataController: { getMasterData() {} },
  }),
  (error) => error.code === 'AUTHORIZED_ENRICHMENT_EMPIRICAL_STORE_INVALID',
);
assert.throws(
  () => new AuthorizedEnrichmentConsumerController({
    engineeringModelStore, masterDataController: {},
  }),
  (error) => error.code === 'AUTHORIZED_ENRICHMENT_MASTER_DATA_INVALID',
);

console.log(JSON.stringify({
  status: 'PASS',
  requestSchema: AUTHORIZED_EMPIRICAL_CONSUMER_REQUEST_SCHEMA,
  runtimePackageSemanticHash: runtimePackage.semanticHash,
  configuredState: authorizationState.state,
  executionId: execution.executionId,
  stagedJsonPathRetained: true,
  sharedSuiteBranchAgnostic: true,
  formulaRegisterSchema: EMPIRICAL_FORMULA_REGISTER.schema,
  formulaRegisterMethod: EMPIRICAL_FORMULA_REGISTER.method,
  formulaRegisterSemanticHash: EMPIRICAL_FORMULA_REGISTER.semanticHash,
  componentLoadAuthorityAuditSchema: EMPIRICAL_COMPONENT_LOAD_AUTHORITY_AUDIT_SCHEMA,
  cogDistributionSchema: SUPPORT_LOAD_DISTRIBUTION_COG_SCHEMA,
  cogDistributionMethod: EMPIRICAL_LOAD_COG_METHOD,
  methodSelectingRequestSchema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  methodSelectingReceiptSchema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA,
}, null, 2));

function makeRuntimePackage() {
  const authorizedInput = makeAuthorizedInput();
  return sealAuthorizedEmpiricalRuntimePackage({
    schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
    packageId: 'PACKAGE-EMP01-CONTROLLER',
    configuredAt: '2026-08-04T12:30:00.000Z',
    executionId: 'EXECUTION-EMP01-CONTROLLER',
    executedAt: '2026-08-04T12:31:00.000Z',
    authorizedInput,
    bindings: {
      projectId: authorizedInput.projectId,
      datasetId: 'DATASET-EMP01',
      datasetVersion: 8,
      sourceDatasetHash: '1'.repeat(64),
      sharedModelSemanticHash: 'fnv1a64:1111111111111111',
      supportSiteModelSemanticHash: 'fnv1a64:2222222222222222',
      routePartitionModelSemanticHash: 'fnv1a64:3333333333333333',
      projectDataProfileSemanticHash: 'fnv1a64:4444444444444444',
      masterSourceHashes: {
        dataset: '1'.repeat(64),
        lineList: '2'.repeat(64),
        pipingClass: '3'.repeat(64),
        componentWeight: '4'.repeat(64),
      },
    },
  });
}

function makeAuthorizedInput() {
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: 'INTAKE-EMP01-CONTROLLER',
    projectId: 'PROJECT-EMP01',
    baselineId: 'BASELINE-EMP01',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:5555555555555555',
    readinessEvaluationSemanticHash: 'fnv1a64:6666666666666666',
    readinessSemanticHash: 'fnv1a64:7777777777777777',
    handoffSemanticHash: 'fnv1a64:8888888888888888',
    projectionPayloadSemanticHash: 'fnv1a64:9999999999999999',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
    createdAt: '2026-08-04T12:29:00.000Z',
    lineBindings: [{ targetId: 'line:001', sourceRecordId: 'source-line-001', lineKey: 'L-1', projectionRecordSemanticHash: 'fnv1a64:bbbbbbbbbbbbbbbb' }],
    componentBindings: [{ targetId: 'component:001', sourceRecordId: 'source-component-001', lineKey: 'L-1', catalogKey: 'VALVE-1', projectionRecordSemanticHash: 'fnv1a64:cccccccccccccccc' }],
    loadCalculationOverlay: {
      pipeSectionProperties: { 'L-1': { outsideDiameterMm: 100, wallThicknessMm: 5, materialCode: 'MAT-1', insulationCode: null, insulationThicknessMm: 0 } },
      materialDensitiesKgPerM3: { 'MAT-1': 7850 },
      operatingFluidDensitiesKgPerM3: { 'L-1': 800 },
      hydroFluidDensitiesKgPerM3: { 'L-1': 1000 },
      insulationDensitiesKgPerM3: {},
      componentWeightsKg: { 'VALVE-1': 10 },
    },
    overlaySemanticHash: '',
    summary: { lineCount: 1, componentCount: 1, materialCodeCount: 1, insulationCodeCount: 0, componentCatalogCount: 1 },
    semanticHash: 'fnv1a64:0000000000000000',
  };
  draft.overlaySemanticHash = semanticHash(draft.loadCalculationOverlay);
  draft.semanticHash = computeAuthorizedEmpiricalLoadInputSemanticHash(draft);
  return draft;
}
