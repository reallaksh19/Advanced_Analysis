import { cloneJson, codePointCompare, deepFreeze, fail, semanticHash } from './enriched-staged-json-qualification-helpers.mjs';
import { visitSourceNodes } from './enriched-staged-json-fixtures.mjs';
import { CANONICAL_NAMESPACE, EXPORTER_VERSION, EXPORT_SCHEMA, FORBIDDEN_AUTHORITY_NAMESPACES, MANIFEST_NAMESPACE, RECORD_SCHEMA } from './enriched-staged-json-export-contract.mjs';
import { exportSemanticProjection, preservationEvidence, requirePreservation, validateExportEnvelope } from './enriched-staged-json-preservation-parity.mjs';

export { CANONICAL_NAMESPACE, EXPORTER_VERSION, EXPORT_SCHEMA, FORBIDDEN_AUTHORITY_NAMESPACES, MANIFEST_NAMESPACE, RECORD_SCHEMA } from './enriched-staged-json-export-contract.mjs';
export { canonicalTransportEvidence, exportSemanticProjection, preservationEvidence, requirePreservation, requireSourceUnmutated, validateExportEnvelope } from './enriched-staged-json-preservation-parity.mjs';

export function exportEnrichedStagedJson(sourceValue, baselineValue) {
  const sourceBeforeHash = semanticHash(sourceValue);
  const sourceModelHash = semanticHash(sourceValue);
  const baseline = validateBaseline(baselineValue, sourceModelHash);
  const preservationBefore = preservationEvidence(sourceValue);
  const joinIndex = buildExactJoinIndex(baseline.targetRecords);
  const source = cloneJson(sourceValue);
  const consumed = new Set();
  let joinedRecordCount = 0;
  visitSourceNodes(source, (node, path) => {
    rejectExistingAuthorityNamespace(node, path);
    const targetId = requireTargetId(node, path);
    if (consumed.has(targetId)) fail('ENRICHED_STAGED_JSON_TARGET_JOIN_DUPLICATE', 'Source target ID occurs more than once.', { targetId, path });
    const targetRecord = joinIndex.get(targetId);
    if (!targetRecord) fail('ENRICHED_STAGED_JSON_TARGET_JOIN_MISSING', 'No baseline record exists for source target ID.', { targetId, path });
    const canonicalProperties = canonicalPropertiesFromFields(targetRecord.fields, targetId);
    const recordDraft = { schema: RECORD_SCHEMA, baselineId: baseline.baselineId, baselineSemanticHash: baseline.semanticHash, targetId,
      canonicalProperties, blockers: canonicalProperties.filter((field) => field.status.startsWith('BLOCKED_')), statusSummary: targetRecord.statusSummary };
    node[CANONICAL_NAMESPACE] = { ...recordDraft, recordSemanticHash: semanticHash(recordDraft) };
    consumed.add(targetId); joinedRecordCount += 1;
  });
  if (consumed.size !== joinIndex.size) fail('ENRICHED_STAGED_JSON_TARGET_JOIN_MISSING', 'Baseline contains targets that are absent from stagedJson.', {
    missingFromSource: [...joinIndex.keys()].filter((targetId) => !consumed.has(targetId)).sort(codePointCompare),
  });
  const preservationAfter = preservationEvidence(source);
  requirePreservation(preservationBefore, preservationAfter);
  if (semanticHash(sourceValue) !== sourceBeforeHash) fail('ENRICHED_STAGED_JSON_SOURCE_MUTATED', 'Source stagedJson was mutated by export.');
  const manifestDraft = { schema: EXPORT_SCHEMA, baselineId: baseline.baselineId, baselineSemanticHash: baseline.semanticHash, sourceModelHash,
    exporterVersion: EXPORTER_VERSION, joinedRecordCount, preservationEvidence: preservationAfter };
  const envelopeDraft = { schema: EXPORT_SCHEMA, [MANIFEST_NAMESPACE]: { ...manifestDraft, exportSemanticHash: 'sha256:pending' }, stagedJson: source };
  envelopeDraft[MANIFEST_NAMESPACE].exportSemanticHash = semanticHash(exportSemanticProjection(envelopeDraft));
  const output = deepFreeze(envelopeDraft);
  validateExportEnvelope(output);
  return output;
}

function validateBaseline(value, sourceModelHash) {
  if (!value || value.schema !== 'common-enriched-properties-baseline/v1') fail('ENRICHED_STAGED_JSON_BASELINE_HASH_MISMATCH', 'Baseline schema is invalid.');
  const projection = { schema: value.schema, baselineId: value.baselineId, projectId: value.projectId, revision: value.revision,
    publishedAt: value.publishedAt, sourceModelHash: value.sourceModelHash, targetRecords: value.targetRecords };
  const expectedHash = semanticHash(projection);
  if (value.semanticHash !== expectedHash || value.sourceModelHash !== sourceModelHash) fail('ENRICHED_STAGED_JSON_BASELINE_HASH_MISMATCH', 'Baseline semantic or source-model hash is stale.', {
    expectedHash, actualHash: value.semanticHash, expectedSourceModelHash: sourceModelHash, actualSourceModelHash: value.sourceModelHash,
  });
  return value;
}

function buildExactJoinIndex(records) {
  const index = new Map();
  for (const record of records) {
    if (index.has(record.targetId)) fail('ENRICHED_STAGED_JSON_TARGET_JOIN_DUPLICATE', 'Baseline target ID is duplicated.', { targetId: record.targetId });
    index.set(record.targetId, record);
  }
  return index;
}

function requireTargetId(node, path) {
  if (typeof node.targetId !== 'string' || node.targetId.length === 0) fail('ENRICHED_STAGED_JSON_TARGET_JOIN_MISSING', 'Source node lacks an exact stable target ID.', { path });
  return node.targetId;
}

function rejectExistingAuthorityNamespace(node, path) {
  if (Object.prototype.hasOwnProperty.call(node, CANONICAL_NAMESPACE)) fail('ENRICHED_STAGED_JSON_DUPLICATE_AUTHORITY_NAMESPACE', 'Source already contains engineeringEnrichment.', { path });
  for (const namespace of FORBIDDEN_AUTHORITY_NAMESPACES) if (Object.prototype.hasOwnProperty.call(node, namespace)) {
    fail('ENRICHED_STAGED_JSON_DUPLICATE_AUTHORITY_NAMESPACE', 'Source contains a competing enrichment authority namespace.', { path, namespace });
  }
}

function canonicalPropertiesFromFields(fields, targetId) {
  return fields.map((field) => {
    if (field.status.startsWith('BLOCKED_') && field.value !== null) fail('ENRICHED_STAGED_JSON_BLOCKER_VALUE_INVENTED', 'Blocked field carries an invented value.', { targetId, field: field.field });
    return cloneJson(field);
  });
}
