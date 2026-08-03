import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { requireAuthorizedStagedJsonSidecar } from './authorized-staged-json-sidecar.js';
import {
  AUTHORIZED_STAGED_JSON_WRITE_ARTIFACT_SCHEMA,
  AUTHORIZED_STAGED_JSON_WRITE_RECEIPT_SCHEMA,
  AUTHORIZED_STAGED_JSON_WRITE_REQUEST_SCHEMA,
  REQUEST_KEYS,
  computeAuthorizedStagedJsonWriteArtifactSemanticHash,
  computeAuthorizedStagedJsonWriteReceiptSemanticHash,
  fail,
  requireAuthorizedStagedJsonWriteArtifact,
  requireAuthorizedStagedJsonWriteReceipt,
  requireExactKeys,
  requireFileName,
  requireFormatting,
  requireIdentity,
  requireIsoTimestamp,
  requireMapping,
  requireSource,
  serialize,
  sha256Utf8,
  utf8ByteLength,
} from './authorized-staged-json-write-contract.js';
import { applyAuthorizedStagedJsonSidecar } from './authorized-staged-json-write-tree.js';

export {
  AUTHORIZED_STAGED_JSON_WRITE_ARTIFACT_SCHEMA,
  AUTHORIZED_STAGED_JSON_WRITE_RECEIPT_SCHEMA,
  AUTHORIZED_STAGED_JSON_WRITE_REQUEST_SCHEMA,
  authorizedStagedJsonWriteArtifactSemanticProjection,
  authorizedStagedJsonWriteReceiptSemanticProjection,
  computeAuthorizedStagedJsonWriteArtifactSemanticHash,
  computeAuthorizedStagedJsonWriteReceiptSemanticHash,
  requireAuthorizedStagedJsonWriteArtifact,
  requireAuthorizedStagedJsonWriteReceipt,
  sha256Utf8,
} from './authorized-staged-json-write-contract.js';

export async function writeAuthorizedStagedJson(input) {
  requireExactKeys(input, REQUEST_KEYS, 'authorizedStagedJsonWriteRequest');
  if (input.schema !== AUTHORIZED_STAGED_JSON_WRITE_REQUEST_SCHEMA) {
    fail('Unsupported stagedJson write request.', 'STAGED_JSON_WRITE_SCHEMA_INVALID');
  }
  const writeId = requireIdentity(input.writeId, 'writeId');
  const writtenAt = requireIsoTimestamp(input.writtenAt, 'writtenAt');
  const source = await requireSource(input.source);
  const sidecar = requireAuthorizedStagedJsonSidecar(input.sidecar);
  const mapping = requireMapping(input.mapping);
  const formatting = requireFormatting(input.formatting);
  const outputFileName = requireFileName(input.outputFileName, 'outputFileName');

  let sourceValue;
  try {
    sourceValue = JSON.parse(source.text);
  } catch (error) {
    fail('Source stagedJson is not valid JSON.', 'STAGED_JSON_WRITE_SOURCE_JSON_INVALID', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const { outputValue, summary } = applyAuthorizedStagedJsonSidecar(
    sourceValue,
    sidecar,
    mapping,
  );
  const outputText = serialize(outputValue, formatting);
  const sourceArtifact = {
    sourceId: source.sourceId,
    fileName: source.fileName,
    sha256: source.sha256,
    byteLength: source.byteLength,
    semanticHash: semanticHash(sourceValue),
  };
  const outputArtifact = {
    fileName: outputFileName,
    sha256: await sha256Utf8(outputText),
    byteLength: utf8ByteLength(outputText),
    semanticHash: semanticHash(outputValue),
  };
  const receiptDraft = {
    schema: AUTHORIZED_STAGED_JSON_WRITE_RECEIPT_SCHEMA,
    writeId,
    writtenAt,
    projectId: sidecar.projectId,
    sidecarId: sidecar.sidecarId,
    sidecarSemanticHash: sidecar.semanticHash,
    sourceArtifact,
    mapping,
    formatting,
    outputArtifact,
    summary,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  const receipt = requireAuthorizedStagedJsonWriteReceipt({
    ...receiptDraft,
    semanticHash: computeAuthorizedStagedJsonWriteReceiptSemanticHash(receiptDraft),
  });
  const artifactDraft = {
    schema: AUTHORIZED_STAGED_JSON_WRITE_ARTIFACT_SCHEMA,
    receipt,
    outputText,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedStagedJsonWriteArtifact({
    ...artifactDraft,
    semanticHash: computeAuthorizedStagedJsonWriteArtifactSemanticHash(artifactDraft),
  });
}
