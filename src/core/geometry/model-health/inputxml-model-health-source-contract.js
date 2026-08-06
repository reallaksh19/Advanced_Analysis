import { semanticHash } from '../../shared-piping-model/canonical-json.js';
import { isPlainRecord } from '../../shared-piping-model/immutable.js';
import { INPUTXML_MODEL_HEALTH_SOURCE_SCHEMA } from '../adapters/inputxml-model-health-source.js';

export function requireInputXmlModelHealthSource(value) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_MODEL_HEALTH_SOURCE_SCHEMA) {
    throw new TypeError('InputXML model-health source bundle schema is invalid.');
  }
  if (!isPlainRecord(value.unitSystem)
    || !Array.isArray(value.elementRecords)
    || !isPlainRecord(value.geometry)
    || !Array.isArray(value.geometry.nodes)
    || !Array.isArray(value.geometry.segments)
    || !Array.isArray(value.diagnostics)) {
    throw new TypeError('InputXML model-health source bundle structure is invalid.');
  }
  if (value.sourceRecordCount !== value.elementRecords.length
    || value.canonicalSegmentCount !== value.geometry.segments.length) {
    throw new TypeError('InputXML model-health source bundle counts are inconsistent.');
  }
  const sourceIds = new Set();
  const sourceIndices = new Set();
  for (const [ordinal, record] of value.elementRecords.entries()) {
    if (!isPlainRecord(record) || typeof record.sourceFeatureId !== 'string'
      || !Number.isInteger(record.sourceIndex) || record.sourceIndex < 0
      || record.sourceIndex !== ordinal
      || record.sourceFeatureId !== `PIPINGELEMENT[${record.sourceIndex}]`) {
      throw new TypeError('InputXML model-health source element identity is invalid.');
    }
    if (sourceIds.has(record.sourceFeatureId)) {
      throw new TypeError(`InputXML model-health source identity ${record.sourceFeatureId} is duplicated.`);
    }
    sourceIds.add(record.sourceFeatureId);
    if (sourceIndices.has(record.sourceIndex)) {
      throw new TypeError(`InputXML model-health source index ${record.sourceIndex} is duplicated.`);
    }
    sourceIndices.add(record.sourceIndex);
  }
  return value;
}

export function computeInputXmlModelHealthSourceSemanticHash(value) {
  const accepted = requireInputXmlModelHealthSource(value);
  return semanticHash(sourceSemanticProjection(accepted));
}

export function computeInputXmlModelHealthSourceEvidenceHash(value) {
  const accepted = requireInputXmlModelHealthSource(value);
  const semanticIdentity = computeInputXmlModelHealthSourceSemanticHash(accepted);
  return semanticHash({
    ...sourceSemanticProjection(accepted),
    semanticIdentity,
    fileName: accepted.fileName ?? null,
    diagnostics: accepted.diagnostics,
    geometryDiagnostics: accepted.geometry.diagnostics ?? [],
    geometrySummary: accepted.geometry.summary ?? null,
    geometryValid: accepted.geometry.valid ?? null,
  });
}

export function inputXmlModelHealthGeometryProjection(geometry) {
  const {
    diagnostics: _diagnostics,
    summary: _summary,
    valid: _valid,
    ...projection
  } = geometry;
  return projection;
}

function sourceSemanticProjection(value) {
  return {
    schema: value.schema,
    source: value.source ?? null,
    jobName: value.jobName ?? null,
    modelFeatureId: value.modelFeatureId ?? null,
    modelAttributes: value.modelAttributes ?? {},
    unitSystem: value.unitSystem,
    elementRecords: value.elementRecords,
    sourceRecordCount: value.sourceRecordCount,
    canonicalSegmentCount: value.canonicalSegmentCount,
    geometry: inputXmlModelHealthGeometryProjection(value.geometry),
  };
}
