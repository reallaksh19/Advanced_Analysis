import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  AUTHORIZED_STAGED_JSON_ENTRY_SCHEMA,
  AUTHORIZED_STAGED_JSON_SIDECAR_SCHEMA,
  computeAuthorizedStagedJsonSidecarSemanticHash,
  computeStagedJsonSidecarEntrySemanticHash,
} from '../src/workspace/enrichment/authorized-staged-json-sidecar.js';
import {
  AUTHORIZED_STAGED_JSON_WRITE_REQUEST_SCHEMA,
  sha256Utf8,
  writeAuthorizedStagedJson,
} from '../src/workspace/enrichment/authorized-staged-json-writer.js';
import {
  AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA,
  createAuthorizedStagedJsonDownloadArtifact,
  requireAuthorizedStagedJsonDownloadArtifact,
  requireAuthorizedStagedJsonDownloadReceipt,
  triggerAuthorizedStagedJsonDownload,
} from '../src/workspace/enrichment/authorized-staged-json-download.js';

const writeArtifact = await makeWriteArtifact();
const downloadArtifact = await createAuthorizedStagedJsonDownloadArtifact(writeArtifact);
const repeated = await createAuthorizedStagedJsonDownloadArtifact(writeArtifact);
assert.deepEqual(repeated, downloadArtifact, 'download artifact must be deterministic');
assert.deepEqual(await requireAuthorizedStagedJsonDownloadArtifact(downloadArtifact), downloadArtifact);
assert.equal(downloadArtifact.fileName, writeArtifact.receipt.outputArtifact.fileName);
assert.equal(downloadArtifact.content, writeArtifact.outputText);
assert.equal(downloadArtifact.byteLength, writeArtifact.receipt.outputArtifact.byteLength);
assert.equal(downloadArtifact.sha256, writeArtifact.receipt.outputArtifact.sha256);
assert.equal(downloadArtifact.writeArtifactSemanticHash, writeArtifact.semanticHash);
assert.equal(downloadArtifact.writeReceiptSemanticHash, writeArtifact.receipt.semanticHash);
assert.equal(Object.isFrozen(downloadArtifact), true);

const state = makeRuntimeState();
const receipt = await triggerAuthorizedStagedJsonDownload({
  schema: AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA,
  downloadId: 'DOWNLOAD-P18-001',
  triggeredAt: '2026-08-03T01:35:00.000Z',
  artifact: downloadArtifact,
}, state.documentRef, state.runtime);
assert.equal(state.blobs.length, 1);
assert.deepEqual(state.blobs[0].parts, [writeArtifact.outputText]);
assert.deepEqual(state.blobs[0].options, { type: 'application/json;charset=utf-8' });
assert.deepEqual(state.createdUrls, ['blob:authorized-staged-json-p18']);
assert.deepEqual(state.revokedUrls, ['blob:authorized-staged-json-p18']);
assert.equal(state.anchor.href, 'blob:authorized-staged-json-p18');
assert.equal(state.anchor.download, downloadArtifact.fileName);
assert.equal(state.anchor.clickCount, 1);
assert.equal(receipt.status, 'TRIGGERED');
assert.equal(receipt.downloadArtifactSemanticHash, downloadArtifact.semanticHash);
assert.equal(receipt.writeArtifactSemanticHash, writeArtifact.semanticHash);
assert.equal(receipt.writeReceiptSemanticHash, writeArtifact.receipt.semanticHash);
assert.equal(Object.isFrozen(receipt), true);
assert.deepEqual(requireAuthorizedStagedJsonDownloadReceipt(receipt), receipt);

await expectCode(
  () => createAuthorizedStagedJsonDownloadArtifact({
    ...writeArtifact,
    outputText: writeArtifact.outputText.replace('LINE-S100', 'TAMPER'),
  }),
  'STAGED_JSON_WRITE_OUTPUT_MISMATCH',
);
await expectCode(
  () => requireAuthorizedStagedJsonDownloadArtifact({
    ...downloadArtifact,
    content: `${downloadArtifact.content} `,
  }),
  'STAGED_JSON_DOWNLOAD_CONTENT_MISMATCH',
);
await expectCode(
  () => triggerAuthorizedStagedJsonDownload({
    schema: AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA,
    downloadId: 'DOWNLOAD-P18-002',
    triggeredAt: '2026-08-03T01:36:00.000Z',
    artifact: downloadArtifact,
  }, {}, state.runtime),
  'STAGED_JSON_DOWNLOAD_DOCUMENT_INVALID',
);
await expectCode(
  () => triggerAuthorizedStagedJsonDownload({
    schema: AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA,
    downloadId: 'DOWNLOAD-P18-003',
    triggeredAt: '2026-08-03T01:37:00.000Z',
    artifact: downloadArtifact,
  }, state.documentRef, {}),
  'STAGED_JSON_DOWNLOAD_RUNTIME_INVALID',
);

const clickFailure = makeRuntimeState({ throwOnClick: true });
await expectCode(
  () => triggerAuthorizedStagedJsonDownload({
    schema: AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA,
    downloadId: 'DOWNLOAD-P18-004',
    triggeredAt: '2026-08-03T01:38:00.000Z',
    artifact: downloadArtifact,
  }, clickFailure.documentRef, clickFailure.runtime),
  'FAKE_CLICK_FAILURE',
);
assert.deepEqual(clickFailure.revokedUrls, ['blob:authorized-staged-json-p18']);

const invalidAnchor = makeRuntimeState({ invalidAnchor: true });
await expectCode(
  () => triggerAuthorizedStagedJsonDownload({
    schema: AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA,
    downloadId: 'DOWNLOAD-P18-005',
    triggeredAt: '2026-08-03T01:39:00.000Z',
    artifact: downloadArtifact,
  }, invalidAnchor.documentRef, invalidAnchor.runtime),
  'STAGED_JSON_DOWNLOAD_DOCUMENT_INVALID',
);
assert.deepEqual(invalidAnchor.revokedUrls, ['blob:authorized-staged-json-p18']);

const tamperedReceipt = {
  ...receipt,
  sha256: '0'.repeat(64),
};
await expectCode(
  () => requireAuthorizedStagedJsonDownloadReceipt(tamperedReceipt),
  'STAGED_JSON_DOWNLOAD_HASH_MISMATCH',
);

console.log(JSON.stringify({
  status: 'PASS',
  schema: downloadArtifact.schema,
  artifactSemanticHash: downloadArtifact.semanticHash,
  receiptSemanticHash: receipt.semanticHash,
  outputSha256: receipt.sha256,
  byteLength: receipt.byteLength,
  clickCount: state.anchor.clickCount,
  revokedUrlCount: state.revokedUrls.length,
}, null, 2));

function makeRuntimeState(options = {}) {
  const state = {
    blobs: [],
    createdUrls: [],
    revokedUrls: [],
    anchor: null,
  };
  class FakeBlob {
    constructor(parts, blobOptions) {
      this.parts = parts;
      this.options = blobOptions;
      state.blobs.push(this);
    }
  }
  const anchor = options.invalidAnchor ? {} : {
    href: '',
    download: '',
    clickCount: 0,
    click() {
      this.clickCount += 1;
      if (options.throwOnClick) {
        const error = new Error('fake click failure');
        error.code = 'FAKE_CLICK_FAILURE';
        throw error;
      }
    },
  };
  state.anchor = anchor;
  state.documentRef = {
    createElement(tag) {
      assert.equal(tag, 'a');
      return anchor;
    },
  };
  state.runtime = {
    BlobCtor: FakeBlob,
    createObjectURL(blob) {
      assert.equal(blob, state.blobs[0]);
      const url = 'blob:authorized-staged-json-p18';
      state.createdUrls.push(url);
      return url;
    },
    revokeObjectURL(url) {
      state.revokedUrls.push(url);
    },
  };
  return state;
}

async function expectCode(factory, code) {
  let thrown = null;
  try {
    await factory();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `expected ${code}`);
  assert.equal(thrown.code, code);
}

async function makeWriteArtifact() {
  const sourceValue = {
    id: 'S100',
    targetId: 'LINE:S100',
    lineKey: 'S100',
    attributes: {},
    children: [],
  };
  const sourceText = JSON.stringify(sourceValue);
  const sourceSha256 = await sha256Utf8(sourceText);
  return writeAuthorizedStagedJson({
    schema: AUTHORIZED_STAGED_JSON_WRITE_REQUEST_SCHEMA,
    writeId: 'WRITE-P18-001',
    writtenAt: '2026-08-03T01:34:00.000Z',
    source: {
      sourceId: 'SOURCE-P18-001',
      fileName: 'source.sjson.json',
      sha256: sourceSha256,
      byteLength: new TextEncoder().encode(sourceText).byteLength,
      text: sourceText,
    },
    sidecar: makeSidecar(),
    mapping: {
      sourceRecordIdField: 'id',
      targetIdField: 'targetId',
      lineKeyField: 'lineKey',
      attributesField: 'attributes',
      childrenField: 'children',
    },
    formatting: {
      indent: 2,
      newline: '\n',
      terminalNewline: true,
    },
    outputFileName: 'source.enriched.sjson.json',
  });
}

function makeSidecar() {
  const entryDraft = {
    schema: AUTHORIZED_STAGED_JSON_ENTRY_SCHEMA,
    targetId: 'LINE:S100',
    targetKind: 'LINE',
    sourceRecordId: 'S100',
    lineKey: 'S100',
    attributes: { lineExportLabel: 'LINE-S100' },
    projectionRecordSemanticHash: 'fnv1a64:1111111111111111',
    semanticHash: 'fnv1a64:0000000000000000',
  };
  const entry = {
    ...entryDraft,
    semanticHash: computeStagedJsonSidecarEntrySemanticHash(entryDraft),
  };
  const draft = {
    schema: AUTHORIZED_STAGED_JSON_SIDECAR_SCHEMA,
    sidecarId: 'SIDECAR-P18',
    projectId: 'PROJECT-P18',
    baselineId: 'BASE-P18',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:2222222222222222',
    readinessEvaluationSemanticHash: 'fnv1a64:3333333333333333',
    readinessSemanticHash: 'fnv1a64:4444444444444444',
    handoffSemanticHash: 'fnv1a64:5555555555555555',
    projectionPayloadSemanticHash: 'fnv1a64:6666666666666666',
    adapterVersion: 'staged-json-adapter/1.0.0',
    configurationHash: 'fnv1a64:7777777777777777',
    createdAt: '2026-08-03T01:33:00.000Z',
    entries: [entry],
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
