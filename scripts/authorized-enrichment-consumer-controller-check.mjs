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
const stagedResult = await controller.downloadStagedJson({
  schema: AUTHORIZED_STAGED_JSON_CONSUMER_REQUEST_SCHEMA,
  operationId: 'STAGED-OP-P19',
  sidecar: makeSidecar(),
  source: {
    sourceId: 'SOURCE-P19',
    fileName: 'source.sjson.json',
    sha256: await sha256Utf8(sourceText),
    byteLength: new TextEncoder().encode(sourceText).byteLength,
    text: sourceText,
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
}, runtimeState.documentRef, runtimeState.runtime);
assert.deepEqual(requireAuthorizedStagedJsonConsumerResult(stagedResult), stagedResult);
assert.equal(stagedResult.operationId, 'STAGED-OP-P19');
assert.equal(stagedResult.projectId, 'PROJECT-P19');
assert.equal(stagedResult.status, 'TRIGGERED');
assert.equal(stagedResult.fileName, 'source.enriched.sjson.json');
assert.equal(stagedResult.sha256, await sha256Utf8(runtimeState.blobs[0].parts[0]));
assert.equal(stagedResult.byteLength, new TextEncoder().encode(runtimeState.blobs[0].parts[0]).byteLength);
assert.equal(runtimeState.anchor.clickCount, 1);
assert.deepEqual(runtimeState.revokedUrls, ['blob:authorized-enrichment-p19']);
assert.equal(Object.isFrozen(stagedResult), true);

const repeatedState = makeRuntimeState();
const repeated = await controller.downloadStagedJson({
  schema: AUTHORIZED_STAGED_JSON_CONSUMER_REQUEST_SCHEMA,
  operationId: 'STAGED-OP-P19',
  sidecar: makeSidecar(),
  source: {
    sourceId: 'SOURCE-P19', fileName: 'source.sjson.json',
    sha256: await sha256Utf8(sourceText),
    byteLength: new TextEncoder().encode(sourceText).byteLength,
    text: sourceText,
  },
  mapping: {
    sourceRecordIdField: 'id', targetIdField: 'targetId', lineKeyField: 'lineKey',
    attributesField: 'attributes', childrenField: 'children',
  },
  formatting: { indent: 2, newline: '\n', terminalNewline: true },
  outputFileName: 'source.enriched.sjson.json',
  writeId: 'WRITE-P19', writtenAt: '2026-08-03T01:47:00.000Z',
  downloadId: 'DOWNLOAD-P19', triggeredAt: '2026-08-03T01:48:00.000Z',
}, repeatedState.documentRef, repeatedState.runtime);
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
    constructor(parts, options) { this.parts = parts; this.options = options; state.blobs.push(this); }
  }
  state.anchor = {
    href: '', download: '', clickCount: 0,
    click() { this.clickCount += 1; },
  };
  state.documentRef = { createElement(tag) { assert.equal(tag, 'a'); return state.anchor; } };
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
    readinessSemanticHash: 'fnv1a64:333333333333332rÀ¢†æFöfe6VÖçF–4†6ƒ¢vfçccC£CCCCCCCCCCCCCCCBrÀ¢&ö¦V7F–öå–ÆöE6VÖçF–4†6ƒ¢vfçccC£SSSSSSSSSSSSSSSRrÀ¢FFW%fW'6–öã¢vV×—&–6ÂÖFFW"óããrÀ¢6öæf–wW&F–öä†6ƒ¢vfçccC£cccccccccccccccbrÀ¢7&VFVDC¢s##bÓ‚Ó5C£CC£ã¢rÀ¢Æ–æT&–æF–æw3¢·°¢F&vWD–C¢tÄ”äS¥3rÂ6÷W&6U&V6÷&D–C¢u3rÂÆ–æT¶W“¢u3rÀ¢&ö¦V7F–öå&V6÷&E6VÖçF–4†6ƒ¢vfçccC£sssssssssssssssrrÀ¢ÕÒÀ¢6ö×öæVçD&–æF–æw3¢·°¢F&vWD–C¢t4ôÕôäTåC¤3rÂ6÷W&6U&V6÷&D–C¢t3rÂÆ–æT¶W“¢u3rÀ¢6FÆöt¶W“¢t5bÓrÂ&ö¦V7F–öå&V6÷&E6VÖçF–4†6ƒ¢vfçccC£ƒƒƒƒƒƒƒƒƒƒƒƒƒƒƒ‚rÀ¢ÕÒÀ¢ÆöD6Æ7VÆF–öä÷fW&Æ“¢°¢—U6V7F–öå&÷W'F–W3¢°¢3¢²÷WG6–FTF–ÖWFW$ÖÓ¢ÂvÆÅF†–6¶æW74ÖÓ¢RÂÖFW&–Ä6öFS¢tÔBÓrÂ–ç7VÆF–öä6öFS¢çVÆÂÂ–ç7VÆF–öåF†–6¶æW74ÖÓ¢ÒÀ¢ÒÀ¢ÖFW&–ÄFVç6—F–W4¶uW$Ó3¢²tÔBÓs¢sƒSÒÀ¢÷W&F–ætfÇV–DFVç6—F–W4¶uW$Ó3¢²3¢ƒÒÀ¢‡–G&ôfÇV–DFVç6—F–W4¶uW$Ó3¢²3¢ÒÀ¢–ç7VÆF–öäFVç6—F–W4¶uW$Ó3¢·ÒÀ¢6ö×öæVçEvV–v‡G4¶s¢²t5bÓs¢ÒÀ¢ÒÀ¢÷fW&Æ•6VÖçF–4†6ƒ¢rrÀ¢7VÖÖ'“¢°¢Æ–æT6÷VçC¢Â6ö×öæVçD6÷VçC¢ÂÖFW&–Ä6öFT6÷VçC¢À¢–ç7VÆF–öä6öFT6÷VçC¢Â6ö×öæVçD6FÆöt6÷VçC¢À¢ÒÀ¢6VÖçF–4†6ƒ¢vfçccC£rÀ¢Ó°¢G&gBæ÷fW&Æ•6VÖçF–4†6‚Ò6VÖçF–4†6‚†G&gBæÆöD6Æ7VÆF–öä÷fW&Æ’“°¢G&gBç6VÖçF–4†6‚Ò6ö×WFTWF†÷&—¦VDV×—&–6ÄÆöD–çWE6VÖçF–4†6‚†G&gB“°¢&WGW&âG&gC°§Ğ ¦gVæ7F–öâÖ¶U6–FV6"‚’°¢6öç7BVçG'”G&gBÒ°¢66†VÖ¢UD„õ$•¤TEõ5DtTEô¥4ôåôTåE%•õ44„TÔÀ¢F&vWD–C¢tÄ”äS¥3rÂF&vWD¶–æC¢tÄ”äRrÂ6÷W&6U&V6÷&D–C¢u3rÂÆ–æT¶W“¢u3rÀ¢GG&–'WFW3¢²Æ–æTW‡÷'DÆ&VÃ¢tÄ”äRÕ3rÒÀ¢&ö¦V7F–öå&V6÷&E6VÖçF–4†6ƒ¢vfçccC¦rÀ¢6VÖçF–4†6ƒ¢vfçccC£rÀ¢Ó°¢6öç7BVçG'’Ò²ââæVçG'”G&gBÂ6VÖçF–4†6ƒ¢6ö×WFU7FvVD§6öå6–FV6$VçG'•6VÖçF–4†6‚†VçG'”G&gB’Ó°¢6öç7BG&gBÒ°¢66†VÖ¢UD„õ$•¤TEõ5DtTEô¥4ôåõ4”DT4%õ44„TÔÀ¢6–FV6$–C¢u4”DT4"Õ’rÂ&ö¦V7D–C¢u$ô¤T5BÕ’rÂ&6VÆ–æT–C¢t$4RÕ’rÂ&6VÆ–æU&Wf—6–öã¢À¢&6VÆ–æU6VÖçF–4†6ƒ¢vfçccC¦&&&&&&&&&&&&&&&"rÀ¢&VF–æW74WfÇVF–öå6VÖçF–4†6ƒ¢vfçccC¦6666666666666662rÀ¢&VF–æW756VÖçF–4†6ƒ¢vfçccC¦FFFFFFFFFFFFFFFBrÀ¢†æFöfe6VÖçF–4†6ƒ¢vfçccC¦VVVVVVVVVVVVVVVRrÀ¢&ö¦V7F–öå–ÆöE6VÖçF–4†6ƒ¢vfçccC¦fffffffffffffffbrÀ¢FFW%fW'6–öã¢w7FvVBÖ§6öâÖFFW"óããrÀ¢6öæf–wW&F–öä†6ƒ¢vfçccC£#3CScsƒ“&6FVbrÀ¢7&VFVDC¢s##bÓ‚Ó5C£C3£ã¢rÀ¢VçG&–W3¢¶VçG'•ÒÀ¢7VÖÖ'“¢²VçG'”6÷VçC¢ÂÆ–æTVçG'”6÷VçC¢Â6ö×öæVçDVçG'”6÷VçC¢ÂGG&–'WFT6÷VçC¢ÒÀ¢6VÖçF–4†6ƒ¢vfçccC£rÀ¢Ó°¢&WGW&â²ââæG&gBÂ6VÖçF–4†6ƒ¢6ö×WFTWF†÷&—¦VE7FvVD§6öå6–FV6%6VÖçF–4†6‚†G&gB’Ó°§Ğ