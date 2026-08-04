import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  computeAuthorizedEmpiricalLoadExecutionSemanticHash,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution.js';
import {
  AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
  compareAuthorizedEmpiricalRuntimeBindings,
  sealAuthorizedEmpiricalRuntimePackage,
} from '../src/workspace/engineering-loads/authorized-empirical-runtime-package.js';
import {
  AuthorizedEmpiricalRuntimeStore,
  EMPIRICAL_AUTHORIZATION_STATES,
} from '../src/workspace/engineering-loads/authorized-empirical-runtime-store.js';

const authorizedInput = makeAuthorizedInput();
const bindings = makeBindings();
const runtimePackage = sealAuthorizedEmpiricalRuntimePackage({
  schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
  packageId: 'EMP01-PACKAGE-001',
  configuredAt: '2026-08-04T12:10:00.000Z',
  executionId: 'EMP01-EXECUTION-001',
  executedAt: '2026-08-04T12:11:00.000Z',
  authorizedInput,
  bindings,
});

assert.equal(Object.isFrozen(runtimePackage), true);
assert.equal(runtimePackage.authorizedInput.semanticHash, authorizedInput.semanticHash);
assert.deepEqual(compareAuthorizedEmpiricalRuntimeBindings(bindings, bindings), []);
const changedBindings = {
  ...bindings,
  supportSiteModelSemanticHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
};
assert.deepEqual(
  compareAuthorizedEmpiricalRuntimeBindings(bindings, changedBindings).map((row) => row.field),
  ['supportSiteModelSemanticHash'],
);

const freshnessChanges = [
  ['projectId', { projectId: 'OTHER-PROJECT' }],
  ['datasetId', { datasetId: 'OTHER-DATASET' }],
  ['datasetVersion', { datasetVersion: 8 }],
  ['sourceDatasetHash', { sourceDatasetHash: '9'.repeat(64), masterSourceHashes: { ...bindings.masterSourceHashes, dataset: '9'.repeat(64) } }],
  ['sharedModelSemanticHash', { sharedModelSemanticHash: 'fnv1a64:eeeeeeeeeeeeeeee' }],
  ['supportSiteModelSemanticHash', { supportSiteModelSemanticHash: 'fnv1a64:ffffffffffffffff' }],
  ['routePartitionModelSemanticHash', { routePartitionModelSemanticHash: 'fnv1a64:1010101010101010' }],
  ['projectDataProfileSemanticHash', { projectDataProfileSemanticHash: 'fnv1a64:2020202020202020' }],
  ['masterSourceHashes.lineList', { masterSourceHashes: { ...bindings.masterSourceHashes, lineList: '5'.repeat(64) } }],
  ['masterSourceHashes.pipingClass', { masterSourceHashes: { ...bindings.masterSourceHashes, pipingClass: '6'.repeat(64) } }],
  ['masterSourceHashes.componentWeight', { masterSourceHashes: { ...bindings.masterSourceHashes, componentWeight: '7'.repeat(64) } }],
];
for (const [field, patch] of freshnessChanges) {
  const actual = { ...bindings, ...patch };
  const mismatches = compareAuthorizedEmpiricalRuntimeBindings(bindings, actual);
  assert.ok(mismatches.some((row) => row.field === field), `freshness change not detected: ${field}`);
}

const store = new AuthorizedEmpiricalRuntimeStore();
assert.equal(store.getSnapshot().state, EMPIRICAL_AUTHORIZATION_STATES.NOT_CONFIGURED);
assert.equal(store.getSnapshot().authorizationFreshness, 'NOT_APPLICABLE');
assert.equal(store.getSnapshot().executionFreshness, 'NOT_APPLICABLE');
assert.equal(store.refresh(bindings).state, EMPIRICAL_AUTHORIZATION_STATES.AWAITING_AUTHORIZATION);
assert.throws(
  () => store.requireCurrentPackage(),
  (error) => error.code === 'EMPIRICAL_RUNTIME_NOT_CALCULATION_ELIGIBLE',
);
assert.equal(store.configure(runtimePackage, bindings).state, EMPIRICAL_AUTHORIZATION_STATES.AUTHORIZED_CURRENT);
assert.equal(store.getSnapshot().calculationEligible, true);

const execution = makeExecution(runtimePackage);
assert.equal(store.recordExecution(execution).semanticHash, execution.semanticHash);
assert.equal(store.getSnapshot().state, EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_CURRENT);
assert.equal(store.getSnapshot().authorizationFreshness, 'CURRENT');
assert.equal(store.getSnapshot().executionFreshness, 'CURRENT');
assert.equal(store.getExecution().semanticHash, execution.semanticHash);

const stale = store.refresh(changedBindings);
assert.equal(stale.state, EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_STALE);
assert.equal(stale.calculationEligible, false);
assert.equal(stale.reasonCode, 'AUTHORIZATION_BINDINGS_CHANGED');
assert.equal(stale.authorizationFreshness, 'STALE');
assert.equal(stale.executionFreshness, 'STALE');
assert.equal(store.getExecution().semanticHash, execution.semanticHash, 'historical execution was discarded');
assert.throws(
  () => store.requireCurrentPackage(),
  (error) => error.code === 'EMPIRICAL_RUNTIME_NOT_CALCULATION_ELIGIBLE',
);

const tampered = { ...runtimePackage, executionId: 'TAMPERED' };
assert.throws(
  () => store.configure(tampered, bindings),
  (error) => error.code === 'EMPIRICAL_RUNTIME_PACKAGE_HASH_MISMATCH',
);

const secondStore = new AuthorizedEmpiricalRuntimeStore();
secondStore.configure(runtimePackage, bindings);
assert.throws(
  () => secondStore.recordExecution({ ...execution, executionId: 'OTHER-EXECUTION', semanticHash: execution.semanticHash }),
  (error) => ['EMPIRICAL_EXECUTION_HASH_MISMATCH', 'EMPIRICAL_RUNTIME_EXECUTION_BINDING_MISMATCH'].includes(error.code),
);

console.log(JSON.stringify({
  status: 'PASS',
  packageSemanticHash: runtimePackage.semanticHash,
  authorizedInputSemanticHash: authorizedInput.semanticHash,
  executionSemanticHash: execution.semanticHash,
  currentState: EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_CURRENT,
  staleState: stale.state,
  retainedHistoricalExecution: true,
}, null, 2));

function makeBindings() {
  return {
    projectId: 'PROJECT-EMP01',
    datasetId: 'DATASET-EMP01',
    datasetVersion: 7,
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
  };
}

function makeAuthorizedInput() {
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: 'INTAKE-EMP01',
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
    createdAt: '2026-08-04T12:09:00.000Z',
    lineBindings: [{
      targetId: 'line:001',
      sourceRecordId: 'source-line-001',
      lineKey: 'L-1',
      projectionRecordSemanticHash: 'fnv1a64:bbbbbbbbbbbbbbbb',
    }],
    componentBindings: [{
      targetId: 'component:001',
      sourceRecordId: 'source-component-001',
      lineKey: 'L-1',
      catalogKey: 'VALVE-1',
      projectionRecordSemanticHash: 'fnv1a64:cccccccccccccccc',
    }],
    loadCalculationOverlay: {
      pipeSectionProperties: {
        'L-1': {
          outsideDiameterMm: 100,
          wallThicknessMm: 5,
          materialCode: 'MAT-1',
          insulationCode: null,
          insulationThicknessMm: 0,
        },
      },
      materialDensitiesKgPerM3: { 'MAT-1': 7850 },
      operatingFluidDensitiesKgPerM3: { 'L-1': 800 },
      hydroFluidDensitiesKgPerM3: { 'L-1': 1000 },
      insulationDensitiesKgPerM3: {},
      componentWeightsKg: { 'VALVE-1': 10 },
    },
    overlaySemanticHash: '',
    summary: {
      lineCount: 1,
      componentCount: 1,
      materialCodeCount: 1,
      insulationCodeCount: 0,
      componentCatalogCount: 1,
    },
    semanticHash: 'fnv1a64:0000000000000000',
  };
  draft.overlaySemanticHash = semanticHash(draft.loadCalculationOverlay);
  draft.semanticHash = computeAuthorizedEmpiricalLoadInputSemanticHash(draft);
  return draft;
}

function makeExecution(runtimePackage) {
  const distribution = {
    schema: 'support-load-distribution/v3',
    method: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    status: 'CALCULATED',
    loadCases: [{
      loadCaseId: 'EMPTY',
      status: 'CALCULATED',
      contributionLedger: [],
      excludedInputs: [],
    }],
  };
  const draft = {
    schema: 'authorized-empirical-load-execution/v1',
    executionId: runtimePackage.executionId,
    executedAt: runtimePackage.executedAt,
    projectId: runtimePackage.bindings.projectId,
    datasetId: runtimePackage.bindings.datasetId,
    datasetVersion: runtimePackage.bindings.datasetVersion,
    authorizedInputSemanticHash: runtimePackage.authorizedInput.semanticHash,
    overlaySemanticHash: runtimePackage.authorizedInput.overlaySemanticHash,
    baselineSemanticHash: runtimePackage.authorizedInput.baselineSemanticHash,
    handoffSemanticHash: runtimePackage.authorizedInput.handoffSemanticHash,
    projectionPayloadSemanticHash: runtimePackage.authorizedInput.projectionPayloadSemanticHash,
    ephemeralProfileSemanticHash: 'fnv1a64:dddddddddddddddd',
    distributionSemanticHash: semanticHash(distribution),
    status: 'CALCULATED',
    summary: {
      loadCaseCount: 1,
      calculatedCaseCount: 1,
      blockedCaseCount: 0,
      contributionCount: 0,
      excludedInputCount: 0,
    },
    distribution,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return {
    ...draft,
    semanticHash: computeAuthorizedEmpiricalLoadExecutionSemanticHash(draft),
  };
}
