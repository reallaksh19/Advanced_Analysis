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
  requireAuthorizedStagedJsonWriteArtifact,
  sha256Utf8,
  writeAuthorizedStagedJson,
} from '../src/workspace/enrichment/authorized-staged-json-writer.js';

const sidecar = makeSidecar();
const sourceValue = {
  type: 'MODEL',
  id: 'MODEL-1',
  targetId: 'MODEL:1',
  lineKey: 'MODEL-1',
  attributes: { source: 'FIXTURE' },
  children: [
    {
      type: 'BRANCH',
      id: 'S100',
      targetId: 'LINE:S100',
      lineKey: 'S100',
      attributes: { existingLabel: 'KEEP' },
      children: [
        {
          type: 'ELBOW',
          id: 'C1',
          targetId: 'COMPONENT:C1',
          lineKey: 'S100',
          attributes: { catalogKey: 'ELBOW-100-CS' },
          children: [],
        },
      ],
    },
  ],
};
const sourceText = `${JSON.stringify(sourceValue, null, 4)}\n`;
const sourceSha256 = await sha256Utf8(sourceText);
const request = {
  schema: AUTHORIZED_STAGED_JSON_WRITE_REQUEST_SCHEMA,
  writeId: 'WRITE-P17-001',
  writtenAt: '2026-08-03T01:20:00.000Z',
  source: {
    sourceId: 'SOURCE-STAGED-JSON-001',
    fileName: 'source.sjson.json',
    sha256: sourceSha256,
    byteLength: new TextEncoder().encode(sourceText).byteLength,
    text: sourceText,
  },
  sidecar,
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
};

const first = await writeAuthorizedStagedJson(request);
const second = await writeAuthorizedStagedJson(request);
assert.deepEqual(second, first, 'writer output must be deterministic');
assert.deepEqual(await requireAuthorizedStagedJsonWriteArtifact(first), first);
assert.equal(sourceText, request.source.text, 'source text was mutated');
assert.equal(first.receipt.sidecarSemanticHash, sidecar.semanticHash);
assert.equal(first.receipt.sourceArtifact.sha256, sourceSha256);
assert.equal(first.receipt.outputArtifact.sha256, await sha256Utf8(first.outputText));
assert.deepEqual(first.receipt.summary, {
  visitedNodeCount: 3,
  identifiedNodeCount: 3,
  matchedEntryCount: 2,
  addedAttributeCount: 3,
  retainedExactAttributeCount: 1,
});
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.receipt));

const output = JSON.parse(first.outputText);
const line = output.children[0];
const component = line.children[0];
assert.deepEqual(line.attributes, {
  existingLabel: 'KEEP',
  lineExportLabel: 'LINE-S100',
  materialCode: 'A106-B',
});
assert.deepEqual(component.attributes, {
  catalogKey: 'ELBOW-100-CS',
  componentExportLabel: 'ELBOW-01',
});
assert.deepEqual(output.attributes, { source: 'FIXTURE' });
assert.equal(semanticHash(sourceValue), first.receipt.sourceArtifact.semanticHash);
assert.equal(semanticHash(output), first.receipt.outputArtifact.semanticHash);

await expectCode(
  () => writeAuthorizedStagedJson({
    ...request,
    source: { ...request.source, sha256: '0'.repeat(64) },
  }),
  'STAGED_JSON_WRITE_SOURCE_HASH_MISMATCH',
);

const conflictValue = structuredClone(sourceValue);
conflictValue.children[0].attributes.materialCode = 'CONFLICT';
const conflictText = JSON.stringify(conflictValue);
const conflictSha256 = await sha256Utf8(conflictText);
await expectCode(
  () => writeAuthorizedStagedJson({
    ...request,
    source: {
      ...request.source,
      text: conflictText,
      byteLength: new TextEncoder().encode(conflictText).byteLength,
      sha256: conflictSha256,
    },
  }),
  'STAGED_JSON_WRITE_EXISTING_VALUE_CONFLICT',
);

const duplicateValue = structuredClone(sourceValue);
duplicateValue.children.push({
  type: 'DUPLICATE', id: 'S100', targetId: 'OTHER', lineKey: 'OTHER', attributes: {}, children: [],
});
await expectSourceValue(duplicateValue, 'STAGED_JSON_WRITE_DUPLICATE_SOURCE_RECORD');

const missingValue = structuredClone(sourceValue);
missingValue.children[0].children = [];
await expectSourceValue(missingValue, 'STAGED_JSON_WRITE_SOURCE_RECORD_MISSING');

const targetMismatchValue = structuredClone(sourceValue);
targetMismatchValue.children[0].targetId = 'LINE:OTHER';
await expectSourceValue(targetMismatchValue, 'STAGED_JSON_WRITE_TARGET_MISMATCH');

const lineMismatchValue = structuredClone(sourceValue);
lineMismatchValue.children[0].lineKey = 'OTHER';
await expectSourceValue(lineMismatchValue, 'STAGED_JSON_WRITE_LINE_MISMATCH');

const badAttributesValue = structuredClone(sourceValue);
badAttributesValue.children[0].attributes = [];
await expectSourceValue(badAttributesValue, 'STAGED_JSON_WRITE_ATTRIBUTES_INVALID');

const tampered = {
  ...first,
  outputText: first.outputText.replace('LINE-S100', 'LINE-TAMPERED'),
};
await expectCode(
  () => requireAuthorizedStagedJsonWriteArtifact(tampered),
  'STAGED_JSON_WRITE_OUTPUT_MISMATCH',
);

console.log(JSON.stringify({
  status: 'PASS',
  schema: first.schema,
  semanticHash: first.semanticHash,
  receiptSemanticHash: first.receipt.semanticHash,
  sourceSha256: first.receipt.sourceArtifact.sha256,
  outputSha256: first.receipt.outputArtifact.sha256,
  summary: first.receipt.summary,
}, null, 2));

async function expectSourceValue(value, code) {
  const text = JSON.stringify(value);
  const sha256 = await sha256Utf8(text);
  await expectCode(
    () => writeAuthorizedStagedJson({
      ...request,
      source: {
        ...request.source,
        text,
        byteLength: new TextEncoder().encode(text).byteLength,
        sha256,
      },
    }),
    code,
  );
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

function makeSidecar() {
  const entries = [
    makeEntry({
      targetId: 'COMPONENT:C1',
      targetKind: 'COMPONENT',
      sourceRecordId: 'C1',
      lineKey: 'S100',
      attributes: {
        catalogKey: 'ELBOW-100-CS',
        componentExportLabel: 'ELBOW-01',
      },
      projectionRecordSemanticHash: 'fnv1a64:1111111111111111',
    }),
    makeEntry({
      targetId: 'LINE:S100',
      targetKind: 'LINE',
      sourceRecordId: 'S100',
      lineKey: 'S100',
      attributes: {
        lineExportLabel: 'LINE-S100',
        materialCode: 'A106-B',
      },
      projectionRecordSemanticHash: 'fnv1a64:2222222222222222',
    }),
  ];
  const draft = {
    schema: AUTHORIZED_STAGED_JSON_SIDECAR_SCHEMA,
    sidecarId: 'SIDECAR-P17',
    projectId: 'PROJECT-P17',
    baselineId: 'BASE-P17',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:3333333333333333',
    readinessEvaluationSemanticHash: 'fnv1a64:4444444444444444',
    readinessSemanticHash: 'fnv1a64:5555555555555555',
    handoffSemanticHash: 'fnv1a64:6666666666666666',
    projectionPayloadSemanticHash: 'fnv1a64:7777777777777777',
    adapterVersion: 'staged-json-adapter/1.0.0',
    configurationHash: 'fnv1a64:8888888888888888',
    createdAt: '2026-08-03T01:19:00.000Z',
    entries,
    summary: {
      entryCount: 2,
      lineEntryCount: 1,
      componentEntryCount: 1,
      attributeCount: 4,
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
