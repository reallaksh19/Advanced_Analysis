import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { validateLinearPipingAnalysisResult } from './contracts.js';
import { failLinearPipingAnalysis } from './validation.js';

export const LINEAR_PIPING_INPUTXML_SOURCE_SCHEMA = 'linear-piping-inputxml-source/v1';
export const LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA =
  'linear-piping-inputxml-analysis-request/v1';
export const LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA =
  'linear-piping-inputxml-analysis-request/v2';
export const LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA =
  'linear-piping-inputxml-analysis-result/v1';

export const INPUTXML_SOURCE_KEYS = Object.freeze([
  'schema', 'sourceId', 'sourceRevision', 'fileName', 'mediaType',
  'content', 'contentHash', 'semanticHash',
]);
export const INPUTXML_INGESTION_KEYS = Object.freeze([
  'unit', 'source', 'componentOrigins', 'restraintTypeCodeMap',
  'restraintTypeMutation', 'bendRadiusTolerance',
]);
export const INPUTXML_INGESTION_V2_KEYS = Object.freeze([
  ...INPUTXML_INGESTION_KEYS,
  'unitNormalizationProfile',
]);
export const INPUTXML_CONDITIONING_KEYS = Object.freeze([
  'requiredAttachmentPoints', 'profile',
]);
export const INPUTXML_ANALYSIS_REQUEST_KEYS = Object.freeze([
  'schema', 'inputXmlSource', 'ingestionOptions', 'conditioning', 'sourceAnalysisRequest',
]);
export const INPUTXML_ANALYSIS_RESULT_KEYS = Object.freeze([
  'schema', 'sourceSemanticHash', 'contentHash', 'conditionedTopologyHash',
  'ingestionEvidence', 'analysisResult', 'semanticHash', 'evidenceHash',
]);
export const INPUTXML_INGESTION_EVIDENCE_KEYS = Object.freeze([
  'fileName', 'unit', 'source', 'geometryDiagnosticCodes', 'conditioningReport',
]);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
export const INPUTXML_MEDIA_TYPE = 'application/xml';
export const CANONICAL_ANALYSIS_UNIT = 'm';

export function sealLinearPipingInputXmlSource(input) {
  requireRecord(input, 'inputXmlSourceInput');
  requireExactKeys(input, [
    'sourceId', 'sourceRevision', 'fileName', 'mediaType', 'content',
  ], 'inputXmlSourceInput');
  const draft = {
    schema: LINEAR_PIPING_INPUTXML_SOURCE_SCHEMA,
    sourceId: requireText(input.sourceId, 'inputXmlSourceInput.sourceId'),
    sourceRevision: requireText(input.sourceRevision, 'inputXmlSourceInput.sourceRevision'),
    fileName: requireText(input.fileName, 'inputXmlSourceInput.fileName'),
    mediaType: requireMediaType(input.mediaType),
    content: requireText(input.content, 'inputXmlSourceInput.content'),
    contentHash: '',
    semanticHash: '',
  };
  draft.contentHash = computeInputXmlContentHash(draft.content, draft.mediaType);
  draft.semanticHash = computeInputXmlSourceSemanticHash(draft);
  return requireLinearPipingInputXmlSource(draft);
}

export function computeInputXmlContentHash(content, mediaType) {
  requireMediaType(mediaType);
  requireText(content, 'inputXmlContent');
  return semanticHash({ mediaType, content });
}

export function computeInputXmlSourceSemanticHash(record) {
  return semanticHash({
    schema: record.schema,
    sourceId: record.sourceId,
    sourceRevision: record.sourceRevision,
    fileName: record.fileName,
    mediaType: record.mediaType,
    contentHash: record.contentHash,
  });
}

export function requireLinearPipingInputXmlSource(value) {
  requireRecord(value, 'inputXmlSource');
  requireExactKeys(value, INPUTXML_SOURCE_KEYS, 'inputXmlSource');
  if (value.schema !== LINEAR_PIPING_INPUTXML_SOURCE_SCHEMA) {
    failInputXml('InputXML source schema is unsupported.', 'PIPING_INPUTXML_SOURCE_INVALID');
  }
  requireText(value.sourceId, 'inputXmlSource.sourceId');
  requireText(value.sourceRevision, 'inputXmlSource.sourceRevision');
  requireText(value.fileName, 'inputXmlSource.fileName');
  requireMediaType(value.mediaType);
  requireText(value.content, 'inputXmlSource.content');
  requireHash(value.contentHash, 'inputXmlSource.contentHash');
  requireHash(value.semanticHash, 'inputXmlSource.semanticHash');
  if (value.contentHash !== computeInputXmlContentHash(value.content, value.mediaType)) {
    failInputXml('InputXML content hash is stale.', 'PIPING_INPUTXML_CONTENT_HASH_MISMATCH');
  }
  if (value.semanticHash !== computeInputXmlSourceSemanticHash(value)) {
    failInputXml('InputXML source semantic hash is stale.', 'PIPING_INPUTXML_SOURCE_HASH_MISMATCH');
  }
  return deepFreeze({ ...value });
}

export function requireLinearPipingInputXmlAnalysisResult(value) {
  requireRecord(value, 'inputXmlAnalysisResult');
  requireExactKeys(value, INPUTXML_ANALYSIS_RESULT_KEYS, 'inputXmlAnalysisResult');
  if (value.schema !== LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA) {
    failInputXml('InputXML analysis result schema is unsupported.', 'PIPING_INPUTXML_RESULT_INVALID');
  }
  requireHash(value.sourceSemanticHash, 'inputXmlAnalysisResult.sourceSemanticHash');
  requireHash(value.contentHash, 'inputXmlAnalysisResult.contentHash');
  requireHash(value.conditionedTopologyHash, 'inputXmlAnalysisResult.conditionedTopologyHash');
  requireRecord(value.ingestionEvidence, 'inputXmlAnalysisResult.ingestionEvidence');
  requireExactKeys(
    value.ingestionEvidence,
    INPUTXML_INGESTION_EVIDENCE_KEYS,
    'inputXmlAnalysisResult.ingestionEvidence',
  );
  const analysisResult = validateLinearPipingAnalysisResult(value.analysisResult);
  requireHash(value.semanticHash, 'inputXmlAnalysisResult.semanticHash');
  requireHash(value.evidenceHash, 'inputXmlAnalysisResult.evidenceHash');
  if (analysisResult.parents.sourceSemanticHash !== value.sourceSemanticHash
    || analysisResult.parents.conditionedTopologyHash !== value.conditionedTopologyHash) {
    failInputXml('InputXML result parents are stale.', 'PIPING_INPUTXML_RESULT_PARENT_MISMATCH');
  }
  if (value.semanticHash !== computeInputXmlAnalysisResultSemanticHash(value)
    || value.evidenceHash !== computeInputXmlAnalysisResultEvidenceHash(value)) {
    failInputXml('InputXML result hashes are stale.', 'PIPING_INPUTXML_RESULT_HASH_MISMATCH');
  }
  return deepFreeze({ ...value, analysisResult });
}

export function computeInputXmlAnalysisResultSemanticHash(value) {
  return semanticHash({
    schema: value.schema,
    sourceSemanticHash: value.sourceSemanticHash,
    contentHash: value.contentHash,
    conditionedTopologyHash: value.conditionedTopologyHash,
    analysisResultSemanticHash: value.analysisResult.semanticHash,
  });
}

export function computeInputXmlAnalysisResultEvidenceHash(value) {
  return semanticHash({
    semanticHash: value.semanticHash,
    analysisResultEvidenceHash: value.analysisResult.evidenceHash,
    ingestionEvidence: value.ingestionEvidence,
  });
}

export function requireRecord(value, field) {
  if (!isPlainRecord(value)) {
    failInputXml(`${field} must be a record.`, 'PIPING_INPUTXML_RECORD_REQUIRED');
  }
  return value;
}

export function requireExactKeys(value, expected, field) {
  requireRecord(value, field);
  const actual = Object.keys(value).sort(compareAscii);
  const required = [...expected].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    failInputXml(`${field} keys are invalid.`, 'PIPING_INPUTXML_KEYS_INVALID', {
      actual,
      required,
    });
  }
}

export function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    failInputXml(`${field} must be a non-empty string.`, 'PIPING_INPUTXML_TEXT_REQUIRED');
  }
  return value;
}

export function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    failInputXml(`${field} must be a semantic hash.`, 'PIPING_INPUTXML_HASH_INVALID');
  }
  return value;
}

export function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failInputXml(`${field} must be finite.`, 'PIPING_INPUTXML_NUMBER_INVALID');
  }
  return Object.is(value, -0) ? 0 : value;
}

export function failInputXml(message, code, evidence) {
  failLinearPipingAnalysis(message, code, evidence);
}

export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireMediaType(value) {
  if (value !== INPUTXML_MEDIA_TYPE) {
    failInputXml('InputXML media type must be application/xml.', 'PIPING_INPUTXML_SOURCE_INVALID');
  }
  return value;
}
