import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_STAGED_JSON_ENTRY_SCHEMA,
  AUTHORIZED_STAGED_JSON_SIDECAR_SCHEMA,
  computeAuthorizedStagedJsonSidecarSemanticHash,
  computeStagedJsonSidecarEntrySemanticHash,
} from '../src/workspace/enrichment/authorized-staged-json-sidecar.js';
import { sha256Utf8 } from '../src/workspace/enrichment/authorized-staged-json-writer.js';
import {
  AUTHORIZED_EMPIRICAL_CONSUMER_REQUEST_SCHEMA,
  AUTHORIZED_STAGED_JSON_CONSUMER_REQUEST_SCHEMA,
  AuthorizedEnrichmentConsumerController,
  requireAuthorizedStagedJsonConsumerResult,
} from '../src/workspace/enrichment/authorized-enrichment-consumer-controller.js';

const authorizedInput = makeAuthorizedInput();
const masterData = { marker: 'MASTER-DATA-P19' };
const execution = Object.freeze({
  schema: 'authorized-empirical-load-execution/v1',
  executionId: 'EXECUTION-P19',
  semanticHash: 'fnv1a64:9999999999999999',
  status: 'CALCULATED',
});
const empiricalCalls = [];
const controller = new AuthorizedEnrichmentConsumerController({
  engineeringModelStore: {
    calculateAuthorized(value) {
      empiricalCalls.push(value);
      return execution;
    },
  },
  masterDataController: {
    getMasterData() { return masterData; },
  },
});

const empiricalResult = controller.executeEmpirical({
  schema: AUTHORIZED_EMPIRICAL_CONSUMER_REQUEST_SCHEMA,
  executionId: 'EXECUTION-P19',
  executedAt: '2026-08-03T01:45:00.000Z',
  authorizedInput,
});
assert.equal(empiricalResult, execution);
assert.equal(empiricalCalls.length, 1);
assert.deepEqual(empiricalCalls[0], {
  executionId: 'EXECUTION-P19',
  executedAt: '2026-08-03T01:45:00.000Z',
  authorizedInput,
  masterData,
});
assert.equal(Object.isFrozen(empiricalCalls[0].authorizedInput), true);

assert.throws(
  () => controller.executeEmpirical({
    schema: AUTHORIZED_EMPIRICAL_CONSUMER_REQUEST_SCHEMA,
    executionId: 'EXECUTION-P19-BAD',
    executedAt: '2026-08-03T01:46:00.000Z',
    authorizedInput: { ...authorizedInput, projectId: 'TAMPERED' },
  }),
  (error) => error.code === 'EMPIRICAL_INPUT_HASH_MISMATCH',
);
assert.equal(empiricalCalls.length, 1, 'invalid input reached the empirical store');

const sourceValue = {
  id: 'S100', targetId: 'LINE:S100', lineKey: 'S100', attributes: {}, children: [],
};
const sourceText = JSON.stringify(sourceValue);
const runtimeState = makeRuntimeState();
const sourceSha256 = await sha256Utf8(sourceText);
const stagedRequest = makeStagedRequest(sourceText, sourceSha256);
const stagedResult = await controller.downloadStagedJson(
  stagedRequest,
  runtimeState.documentRef,
  runtimeState.runtime,
);
assert.deepEqual(requireAuthorizedStagedJsonConsumerResult(stagedResult), stagedResult);
assert.equal(stagedResult.operationId, 'STAGED-OP-P19');
assert.equal(stagedResult.projectId, 'PROJECT-P19');
assert.equal(stagedResult.status, 'TRIGGERED');
assert.equal(stagedResult.fileName, 'source.enriched.sjson.json');
assert.equal(stagedResult.sha256, await sha256Utf8(runtimeState.blobs[0].parts[0]));
assert.equal(
  stagedResult.byteLength,
  new TextEncoder().encode(runtimeState.blobs[0].parts[0]).byteLength,
);
assert.equal(runtimeState.anchor.clickCount, 1);
assert.deepEqual(runtimeState.revokedUrls, ['blob:authorized-enrichment-p19']);
assert.equal(Object.isFrozen(stagedResult), true);

const repeatedState = makeRuntimeState();
const repeated = await controller.downloadStagedJson(
  stagedRequest,
  repeatedState.documentRef,
  repeatedState.runtime,
);
assert.deepEqual(repeated, stagedResult, 'consumer operation must be deterministic');

const tampered = { ...stagedResult, fileName: 'tampered.json' };
assert.throws(
  () => requireAuthorizedStagedJsonConsumerResult(tampered),
  (error) => error.code === 'AUTHORIZED_ENRICHMENT_HASH_MISMATCH',
);
assert.throws(
  () => new AuthorizedEnrichmentConsumerController({
    engineeringModelStore: {}, masterDataController: { getMasterData() {} },
  }),
  (error) => error.code === 'AUTHORIZED_ENRICHMENT_EMPIRICAL_STORE_INVALID',
);
assert.throws(
  () => new AuthorizedEnrichmentConsumerController({
    engineeringModelStore: { calculateAuthorized() {} }, masterDataController: {},
  }),
  (error) => error.code === 'AUTHORIZED_ENRICHMENT_MASTER_DATA_INVALID',
);

console.log(JSON.stringify({
  status: 'PASS',
  empiricalExecutionId: empiricalResult.executionId,
  stagedResultSemanticHash: stagedResult.semanticHash,
  writeArtifactSemanticHash: stagedResult.writeArtifactSemanticHash,
  downloadReceiptSemanticHash: stagedResult.downloadReceiptSemanticHash,
  outputSha256: stagedResult.sha256,
  outputByteLength: stagedResult.byteLength,
}, null, 2));

function makeRuntimeState() {
  const state = { blobs: [], revokedUrls: [], anchor: null };
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
      state.blobs.push(this);
    }
  }
  state.anchor = {
    href: '',
    download: '',
    clickCount: 0,
    click() { this.clickCount += 1; },
  };
  state.documentRef = {
    createElement(tag) {
      assert.equal(tag, 'a');
      return state.anchor;
    },
  };
  state.runtime = {
    BlobCtor: FakeBlob,
    createObjectURL() { return 'blob:authorized-enrichment-p19'; },
    revokeObjectURL(url) { state.revokedUrls.push(url); },
  };
  return state;
}

function makeAuthorizedInput() {
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: 'INTAKE-P19',
    projectId: 'PROJECT-P19',
    baselineId: 'BASE-P19',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-03T01:44:00.000Z',
    lineBindings: [{
      targetId: 'line:001',
      sourceRecordId: 'src-line-001',
      lineKey: 'L-1',
      projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
    }],
    componentBindings: [{
      targetId: 'component:001',
      sourceRecordId: 'src-component-001',
      lineKey: 'L-1',
      catalogKey: 'CV-1',
      projectionRecordSemanticHash: 'fnv1a64:8888888888888888',
    }],
    loadCalculationOverlay: {
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
    },
    overlaySemanticHash: '',
    summary: {
      lineCount: 1,
      componentCount: 1,
      materialCodeCount: 1,
      insulationCodeCount: 1,
      componentCatalogCount: 1,
    },
    semanticHash: 'fnv1a64:0000000000000000',
  };
  draft.overlaySemanticHash = semanticHash(draft.loadCalculationOverlay);
  draft.semanticHash = computeAuthorizedEmpiricalLoadInputSemanticHash(draft);
  return draft;
}

function makeStagedRequest(text, sourceSha256) {
  return {
    schema: AUTHORIZED_STAGED_JSON_CONSUMER_REQUEST_SCHEMA,
    operationId: 'STAGED-OP-P19',
    sidecar: makeSidecar(),
    source: {
      sourceId: 'SOURCE-P19',
      fileName: 'source.sjson.json',
      sha256: sourceSha256,
      byteLength: new TextEncoder().encode(text).byteLength,
      text,
    },
    mapping: {
      sourceRecordIdField: 'id',
      targetIdField: 'targetId',
      lineKeyField: 'lineKey',
      attributesField: 'attributes',
      childrenField: 'children',
    },
    formatting: { indent: 2, newline: '\n', terminalNewline: true },
    outputFileName: 'source.enriched.sjson.json',
    writeId: 'WRITE-P19',
    writtenAt: '2026-08-03T01:47:00.000Z',
    downloadId: 'DOWNLOAD-P19',
    triggeredAt: '2026-08-03T01:48:00.000Z',
  };
}

function makeSidecar() {
  const entries = [makeEntry({
    targetId: 'LINE:S100',
    targetKind: 'LINE',
    sourceRecordId: 'S100',
    lineKey: 'S100',
    attributes: { lineExportLabel: 'LINE-S100' },
    projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
  })];
  const draft = {
    schema: AUTHORIZED_STAGED_JSON_SIDECAR_SCHEMA,
    sidecarId: 'SIDECAR-P19',
    projectId: 'PROJECT-P19',
    baselineId: 'BASE-P19',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'staged-json-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-03T01:44:00.000Z',
    entries,
    summary: {
      entryCount: 1,
      lineEntryCount: 1,
      componentEntryCount: 0,
      attributeCount: 1,
    },
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return {
    ...draft,
    semanticHash: computeAuthorizedStagedJsonSidecarSemanticHash(draft),
  };
}

function makeEntry(value) {
  const draft = {
    schema: AUTHORIZED_STAGED_JSON_ENTRY_SCHEMA,
    ...value,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return {
    ...draft,
    semanticHash: computeStagedJsonSidecarEntrySemanticHash(draft),
  };
}
