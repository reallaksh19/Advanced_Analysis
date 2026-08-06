import { semanticHash } from '../../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../shared-piping-model/immutable.js';

export const INPUTXML_SOURCE_BUNDLE_SCHEMA = 'fea-inputxml-source-bundle/v1';
export const INPUTXML_SOURCE_RECORDS_SCHEMA = 'fea-inputxml-source-records/v1';

export function inputXmlSourceFeatureId(kind, sourceElementIndex, recordOrdinal) {
  const normalizedKind = String(kind ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/u.test(normalizedKind)) {
    throw new TypeError('InputXML source feature kind must be uppercase snake case.');
  }
  if (sourceElementIndex !== null && (!Number.isInteger(sourceElementIndex) || sourceElementIndex < 0)) {
    throw new TypeError('InputXML source feature element index must be null or a nonnegative integer.');
  }
  if (!Number.isInteger(recordOrdinal) || recordOrdinal < 0) {
    throw new TypeError('InputXML source feature record ordinal must be a nonnegative integer.');
  }
  const location = sourceElementIndex === null ? 'GLOBAL' : `E${sourceElementIndex}`;
  return `IXF:${normalizedKind}:${location}:R${recordOrdinal}`;
}

export function computeInputXmlBundleContentHash(xmlText) {
  if (typeof xmlText !== 'string') throw new TypeError('InputXML content must be a string.');
  return semanticHash({ schema: 'fea-inputxml-content/v1', content: xmlText });
}

export function computeInputXmlBundleSourceSemanticHash(contentHash) {
  return semanticHash({ schema: 'fea-inputxml-source/v1', contentHash });
}

export function sealInputXmlSourceBundle(value) {
  requireBundleDraft(value);
  const source = deepFreeze(structuredClone(value.source));
  const unitSystem = deepFreeze(structuredClone(value.unitSystem));
  const elementRecords = deepFreeze(structuredClone(value.elementRecords));
  const sourceRecords = deepFreeze(structuredClone(value.sourceRecords));
  const geometry = deepFreeze(structuredClone(value.geometry));
  const diagnostics = deepFreeze(structuredClone(value.diagnostics));

  const semanticProjection = {
    schema: INPUTXML_SOURCE_BUNDLE_SCHEMA,
    source: sourceSemanticProjection(source),
    unitSystem,
    elementRecords,
    sourceRecords,
    geometry: geometryProjection(geometry),
  };
  const semantic = semanticHash(semanticProjection);
  const evidence = semanticHash({
    ...semanticProjection,
    sourceEvidence: source,
    geometryDiagnostics: geometry.diagnostics ?? [],
    geometrySummary: geometry.summary ?? null,
    geometryValid: geometry.valid ?? null,
    diagnostics,
  });
  return deepFreeze({
    schema: INPUTXML_SOURCE_BUNDLE_SCHEMA,
    source,
    unitSystem,
    elementRecords,
    sourceRecords,
    geometry,
    diagnostics,
    semanticHash: semantic,
    evidenceHash: evidence,
  });
}

export function requireInputXmlSourceBundle(value) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_SOURCE_BUNDLE_SCHEMA) {
    throw new TypeError('InputXML source bundle schema is invalid.');
  }
  if (!isPlainRecord(value.source) || typeof value.source.sourceSemanticHash !== 'string') {
    throw new TypeError('InputXML source bundle source identity is invalid.');
  }
  if (!Array.isArray(value.elementRecords) || !isPlainRecord(value.sourceRecords)) {
    throw new TypeError('InputXML source bundle records are invalid.');
  }
  if (!isPlainRecord(value.geometry) || !Array.isArray(value.geometry.nodes) || !Array.isArray(value.geometry.segments)) {
    throw new TypeError('InputXML source bundle geometry is invalid.');
  }
  const expectedSemanticHash = semanticHash({
    schema: value.schema,
    source: sourceSemanticProjection(value.source),
    unitSystem: value.unitSystem,
    elementRecords: value.elementRecords,
    sourceRecords: value.sourceRecords,
    geometry: geometryProjection(value.geometry),
  });
  if (value.semanticHash !== expectedSemanticHash) {
    throw new TypeError('InputXML source bundle semantic hash mismatch.');
  }
  const expectedEvidenceHash = semanticHash({
    schema: value.schema,
    source: sourceSemanticProjection(value.source),
    unitSystem: value.unitSystem,
    elementRecords: value.elementRecords,
    sourceRecords: value.sourceRecords,
    geometry: geometryProjection(value.geometry),
    sourceEvidence: value.source,
    geometryDiagnostics: value.geometry.diagnostics ?? [],
    geometrySummary: value.geometry.summary ?? null,
    geometryValid: value.geometry.valid ?? null,
    diagnostics: value.diagnostics,
  });
  if (value.evidenceHash !== expectedEvidenceHash) {
    throw new TypeError('InputXML source bundle evidence hash mismatch.');
  }
  return value;
}

function requireBundleDraft(value) {
  if (!isPlainRecord(value)) throw new TypeError('InputXML source bundle draft must be a record.');
  if (!isPlainRecord(value.source)) throw new TypeError('InputXML source bundle source must be a record.');
  if (!isPlainRecord(value.unitSystem)) throw new TypeError('InputXML source bundle unitSystem must be a record.');
  if (!Array.isArray(value.elementRecords)) throw new TypeError('InputXML source bundle elementRecords must be an array.');
  if (!isPlainRecord(value.sourceRecords) || value.sourceRecords.schema !== INPUTXML_SOURCE_RECORDS_SCHEMA) {
    throw new TypeError('InputXML source bundle sourceRecords schema is invalid.');
  }
  if (!isPlainRecord(value.geometry)) throw new TypeError('InputXML source bundle geometry must be a record.');
  if (!Array.isArray(value.diagnostics)) throw new TypeError('InputXML source bundle diagnostics must be an array.');
}

function geometryProjection(geometry) {
  const {
    diagnostics: _diagnostics,
    summary: _summary,
    valid: _valid,
    ...projection
  } = geometry;
  return projection;
}

function sourceSemanticProjection(source) {
  return {
    sourceLabel: source.sourceLabel,
    contentHash: source.contentHash,
    sourceSemanticHash: source.sourceSemanticHash,
    declaredCounts: source.declaredCounts,
  };
}
