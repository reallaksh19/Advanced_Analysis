import { deepFreeze, fail, semanticHash, stableStringify, streamCanonicalJson } from './enriched-staged-json-qualification-helpers.mjs';
import { visitSourceNodes } from './enriched-staged-json-fixtures.mjs';
import { CANONICAL_NAMESPACE, EXPORT_SCHEMA, MANIFEST_NAMESPACE } from './enriched-staged-json-export-contract.mjs';

export function exportSemanticProjection(envelope) {
  const manifest = envelope[MANIFEST_NAMESPACE];
  return { schema: envelope.schema, [MANIFEST_NAMESPACE]: {
    schema: manifest.schema, baselineId: manifest.baselineId, baselineSemanticHash: manifest.baselineSemanticHash,
    sourceModelHash: manifest.sourceModelHash, exporterVersion: manifest.exporterVersion,
    joinedRecordCount: manifest.joinedRecordCount, preservationEvidence: manifest.preservationEvidence,
  }, stagedJson: envelope.stagedJson };
}

export function canonicalTransportEvidence(envelope, { maxChunkBytes = 32768 } = {}) {
  validateExportEnvelope(envelope);
  const fileText = stableStringify(envelope);
  const fileCanonicalHash = semanticHash(JSON.parse(fileText));
  const apiCanonicalHash = semanticHash(JSON.parse(JSON.stringify(envelope)));
  if (fileCanonicalHash !== apiCanonicalHash) fail('ENRICHED_STAGED_JSON_FILE_API_PARITY_MISMATCH', 'File and API transports have different canonical hashes.', { fileCanonicalHash, apiCanonicalHash });
  const stream = streamCanonicalJson(envelope, { maxChunkBytes });
  if (stream.semanticHash !== fileCanonicalHash) fail('ENRICHED_STAGED_JSON_FILE_API_PARITY_MISMATCH', 'Streaming and file transports have different canonical hashes.', { streamCanonicalHash: stream.semanticHash, fileCanonicalHash });
  return deepFreeze({ fileCanonicalHash, apiCanonicalHash, streamCanonicalHash: stream.semanticHash,
    fileByteLength: Buffer.byteLength(fileText, 'utf8'), chunkCount: stream.chunkCount, maxChunkBytes: stream.maxChunkBytes });
}

export function preservationEvidence(sourceValue) {
  const geometry = []; const hierarchy = []; const attributes = []; const identities = [];
  let nodeCount = 0;
  visitSourceNodes(sourceValue, (node, path) => {
    nodeCount += 1;
    geometry.push({ path, APOS: node.APOS, LPOS: node.LPOS, POS: node.POS, CENTER: node.CENTER });
    hierarchy.push({ path, type: node.type, childIds: (node.children ?? []).map((child) => child.id) });
    attributes.push({ path, attributes: node.attributes });
    identities.push({ path, id: node.id, targetId: node.targetId, parentTargetId: node.parentTargetId ?? null, references: node.references ?? null, name: node.name });
  });
  return deepFreeze({ nodeCount, sourceSemanticHash: semanticHash(sourceWithoutEnrichment(sourceValue)), geometryHash: semanticHash(geometry),
    hierarchyHash: semanticHash(hierarchy), attributesHash: semanticHash(attributes), identityReferenceHash: semanticHash(identities) });
}

export function validateExportEnvelope(envelope) {
  if (envelope?.schema !== EXPORT_SCHEMA || !envelope?.[MANIFEST_NAMESPACE]) fail('ENRICHED_STAGED_JSON_EXPORT_SCHEMA_INVALID', 'Export envelope schema is invalid.');
  requirePreservation(envelope[MANIFEST_NAMESPACE].preservationEvidence, preservationEvidence(envelope.stagedJson));
  const expected = semanticHash(exportSemanticProjection(envelope));
  if (envelope[MANIFEST_NAMESPACE].exportSemanticHash !== expected) fail('ENRICHED_STAGED_JSON_FILE_API_PARITY_MISMATCH', 'Export semantic hash is stale or tampered.', { expected, actual: envelope[MANIFEST_NAMESPACE].exportSemanticHash });
  return envelope;
}

export function requirePreservation(before, after) {
  for (const field of ['nodeCount', 'sourceSemanticHash', 'geometryHash', 'hierarchyHash', 'attributesHash', 'identityReferenceHash']) {
    if (before[field] !== after[field]) fail('ENRICHED_STAGED_JSON_GEOMETRY_HASH_MISMATCH', 'Geometry, hierarchy, attributes, identity, references, or order changed.', { field, before: before[field], after: after[field] });
  }
}

export function requireSourceUnmutated(sourceValue, expectedSourceHash) {
  const actualSourceHash = semanticHash(sourceValue);
  if (actualSourceHash !== expectedSourceHash) fail('ENRICHED_STAGED_JSON_SOURCE_MUTATED', 'Source stagedJson semantic hash changed.', { expectedSourceHash, actualSourceHash });
  return sourceValue;
}

function sourceWithoutEnrichment(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sourceWithoutEnrichment);
  const output = {};
  for (const key of Object.keys(value)) if (key !== CANONICAL_NAMESPACE) output[key] = sourceWithoutEnrichment(value[key]);
  return output;
}
