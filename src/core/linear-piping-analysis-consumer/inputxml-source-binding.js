import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { canonicalStringify, semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { inputXmlToCanonicalGeometry } from '../geometry/adapters/inputXmlToCanonicalGeometry.js';
import { conditionGeometry } from '../centerline-beam-fea/index.js';
import { validateLinearPipingAnalysisResult } from './contracts.js';
import {
  runLinearPipingAnalysisFromSourceAuthorities,
  validateLinearPipingSourceAnalysisRequest,
} from './source-orchestration.js';
import { failLinearPipingAnalysis } from './validation.js';

export const LINEAR_PIPING_INPUTXML_SOURCE_SCHEMA = 'linear-piping-inputxml-source/v1';
export const LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA =
  'linear-piping-inputxml-analysis-request/v1';
export const LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA =
  'linear-piping-inputxml-analysis-result/v1';

export const INPUTXML_SOURCE_KEYS = Object.freeze([
  'schema',
  'sourceId',
  'sourceRevision',
  'fileName',
  'mediaType',
  'content',
  'contentHash',
  'semanticHash',
]);
export const INPUTXML_INGESTION_KEYS = Object.freeze([
  'unit',
  'source',
  'componentOrigins',
  'restraintTypeCodeMap',
  'bendRadiusTolerance',
]);
export const INPUTXML_CONDITIONING_KEYS = Object.freeze([
  'requiredAttachmentPoints',
  'profile',
]);
export const INPUTXML_ANALYSIS_REQUEST_KEYS = Object.freeze([
  'schema',
  'inputXmlSource',
  'ingestionOptions',
  'conditioning',
  'sourceAnalysisRequest',
]);
export const INPUTXML_ANALYSIS_RESULT_KEYS = Object.freeze([
  'schema',
  'sourceSemanticHash',
  'contentHash',
  'conditionedTopologyHash',
  'ingestionEvidence',
  'analysisResult',
  'semanticHash',
  'evidenceHash',
]);
export const INPUTXML_INGESTION_EVIDENCE_KEYS = Object.freeze([
  'fileName',
  'unit',
  'source',
  'geometryDiagnosticCodes',
  'conditioningReport',
]);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const INPUTXML_MEDIA_TYPE = 'application/xml';
const CANONICAL_ANALYSIS_UNIT = 'm';

/**
 * Seal exact InputXML text as an immutable project-source authority.
 *
 * XML whitespace is retained. Two byte-different decoded text inputs therefore
 * receive different content identities even when an XML parser might regard
 * them as semantically equivalent.
 */
export function sealLinearPipingInputXmlSource(input) {
  requireRecord(input, 'inputXmlSourceInput');
  requireExactKeys(input, [
    'sourceId',
    'sourceRevision',
    'fileName',
    'mediaType',
    'content',
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

export function computeInputXmlContentHash(content, mediaType = INPUTXML_MEDIA_TYPE) {
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
    fail('InputXML source schema is unsupported.', 'PIPING_INPUTXML_SOURCE_INVALID');
  }
  requireText(value.sourceId, 'inputXmlSource.sourceId');
  requireText(value.sourceRevision, 'inputXmlSource.sourceRevision');
  requireText(value.fileName, 'inputXmlSource.fileName');
  requireMediaType(value.mediaType);
  requireText(value.content, 'inputXmlSource.content');
  requireHash(value.contentHash, 'inputXmlSource.contentHash');
  requireHash(value.semanticHash, 'inputXmlSource.semanticHash');
  if (value.contentHash !== computeInputXmlContentHash(value.content, value.mediaType)) {
    fail('InputXML content hash is stale.', 'PIPING_INPUTXML_CONTENT_HASH_MISMATCH');
  }
  if (value.semanticHash !== computeInputXmlSourceSemanticHash(value)) {
    fail('InputXML source semantic hash is stale.', 'PIPING_INPUTXML_SOURCE_HASH_MISMATCH');
  }
  return deepFreeze({ ...value });
}

/**
 * Recompute InputXML geometry and B-1 conditioning, bind those identities to
 * an existing Phase 2A request, then delegate B-2.5/B-3.0/T0 execution.
 *
 * Material, section, local-axis, constraint and load authorities remain
 * caller-supplied through the existing Phase 2A request. This gateway never
 * infers them from raw XML fields.
 */
export function runLinearPipingAnalysisFromInputXml(request, runtime) {
  const accepted = validateLinearPipingInputXmlAnalysisRequest(request);
  const source = accepted.inputXmlSource;
  const bendRadiusTolerance = requireDeclaredValue(
    accepted.ingestionOptions,
    'bendRadiusTolerance',
    { exclusiveMinimum: 0 },
  );
  const geometry = inputXmlToCanonicalGeometry(source.content, {
    unit: accepted.ingestionOptions.unit,
    source: accepted.ingestionOptions.source,
    componentOrigins: accepted.ingestionOptions.componentOrigins,
    restraintTypeCodeMap: accepted.ingestionOptions.restraintTypeCodeMap,
    bendRadiusTolerance,
    fileName: source.fileName,
  });
  requireValidInputXmlGeometry(geometry);
  const conditionedTopology = conditionGeometry(
    geometry,
    accepted.conditioning.requiredAttachmentPoints,
    accepted.conditioning.profile,
  );
  requireSourceRequestMatchesInputXml(
    accepted.sourceAnalysisRequest,
    source,
    conditionedTopology,
  );

  const boundSourceRequest = {
    ...accepted.sourceAnalysisRequest,
    mechanicalModelInput: {
      ...accepted.sourceAnalysisRequest.mechanicalModelInput,
      sourceSemanticHash: source.semanticHash,
      conditionedTopology,
    },
  };
  const analysisResult = runLinearPipingAnalysisFromSourceAuthorities(
    boundSourceRequest,
    runtime,
  );
  return sealInputXmlAnalysisResult({
    source,
    geometry,
    conditionedTopology,
    analysisResult,
  });
}

export function validateLinearPipingInputXmlAnalysisRequest(value) {
  requireRecord(value, 'inputXmlAnalysisRequest');
  requireExactKeys(value, INPUTXML_ANALYSIS_REQUEST_KEYS, 'inputXmlAnalysisRequest');
  if (value.schema !== LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA) {
    fail('InputXML analysis request schema is unsupported.', 'PIPING_INPUTXML_REQUEST_INVALID');
  }
  const inputXmlSource = requireLinearPipingInputXmlSource(value.inputXmlSource);
  const ingestionOptions = requireIngestionOptions(value.ingestionOptions, inputXmlSource);
  const conditioning = requireConditioning(value.conditioning);
  const sourceAnalysisRequest = validateLinearPipingSourceAnalysisRequest(
    value.sourceAnalysisRequest,
  );
  return Object.freeze({
    schema: value.schema,
    inputXmlSource,
    ingestionOptions,
    conditioning,
    sourceAnalysisRequest,
  });
}

export function requireLinearPipingInputXmlAnalysisResult(value) {
  requireRecord(value, 'inputXmlAnalysisResult');
  requireExactKeys(value, INPUTXML_ANALYSIS_RESULT_KEYS, 'inputXmlAnalysisResult');
  if (value.schema !== LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA) {
    fail('InputXML analysis result schema is unsupported.', 'PIPING_INPUTXML_RESULT_INVALID');
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
    fail('InputXML result parents are stale.', 'PIPING_INPUTXML_RESULT_PARENT_MISMATCH');
  }
  if (value.semanticHash !== computeInputXmlAnalysisResultSemanticHash(value)) {
    fail('InputXML analysis semantic hash is stale.', 'PIPING_INPUTXML_RESULT_HASH_MISMATCH');
  }
  if (value.evidenceHash !== computeInputXmlAnalysisResultEvidenceHash(value)) {
    fail('InputXML analysis evidence hash is stale.', 'PIPING_INPUTXML_RESULT_HASH_MISMATCH');
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

function sealInputXmlAnalysisResult({ source, geometry, conditionedTopology, analysisResult }) {
  const draft = {
    schema: LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA,
    sourceSemanticHash: source.semanticHash,
    contentHash: source.contentHash,
    conditionedTopologyHash: conditionedTopology.semanticHash,
    ingestionEvidence: deepFreeze({
      fileName: source.fileName,
      unit: geometry.unit,
      source: geometry.source,
      geometryDiagnosticCodes: Object.freeze(
        (geometry.diagnostics ?? []).map((row) => row.code).filter(Boolean).sort(compareAscii),
      ),
      conditioningReport: conditionedTopology.report,
    }),
    analysisResult,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeInputXmlAnalysisResultSemanticHash(draft);
  draft.evidenceHash = computeInputXmlAnalysisResultEvidenceHash(draft);
  return requireLinearPipingInputXmlAnalysisResult(draft);
}

function requireSourceRequestMatchesInputXml(sourceRequest, source, conditionedTopology) {
  const modelInput = sourceRequest.mechanicalModelInput;
  if (modelInput.sourceSemanticHash !== source.semanticHash
    || sourceRequest.expectedSourceAuthorities.sourceSemanticHash !== source.semanticHash) {
    fail(
      'Phase 2A source identity does not match the sealed InputXML authority.',
      'PIPING_INPUTXML_SOURCE_AUTHORITY_MISMATCH',
    );
  }
  const suppliedTopology = modelInput.conditionedTopology;
  if (suppliedTopology.semanticHash !== conditionedTopology.semanticHash
    || semanticHash(geometryProjection(suppliedTopology.geometry)) !== conditionedTopology.semanticHash
    || canonicalStringify(geometryProjection(suppliedTopology.geometry))
      !== canonicalStringify(geometryProjection(conditionedTopology.geometry))) {
    fail(
      'Caller-supplied conditioned topology does not match recomputed InputXML conditioning.',
      'PIPING_INPUTXML_TOPOLOGY_MISMATCH',
    );
  }
  if (sourceRequest.expectedSourceAuthorities.conditionedTopologyHash
    !== conditionedTopology.semanticHash) {
    fail(
      'Phase 2A expected topology hash does not match recomputed InputXML conditioning.',
      'PIPING_INPUTXML_TOPOLOGY_AUTHORITY_MISMATCH',
    );
  }
}

function requireIngestionOptions(value, source) {
  requireRecord(value, 'inputXmlAnalysisRequest.ingestionOptions');
  requireExactKeys(value, INPUTXML_INGESTION_KEYS, 'inputXmlAnalysisRequest.ingestionOptions');
  if (value.unit !== CANONICAL_ANALYSIS_UNIT) {
    fail(
      'InputXML analysis ingestion unit must already be metres; this gateway does not convert units.',
      'PIPING_INPUTXML_UNIT_NOT_CANONICAL',
    );
  }
  if (value.source !== source.sourceId) {
    fail('InputXML ingestion source must equal the sealed source identity.', 'PIPING_INPUTXML_SOURCE_MISMATCH');
  }
  requireRecord(value.componentOrigins, 'inputXmlAnalysisRequest.ingestionOptions.componentOrigins');
  for (const [nodeId, point] of Object.entries(value.componentOrigins)) {
    requireText(nodeId, 'inputXmlAnalysisRequest.ingestionOptions.componentOrigins node id');
    requireRecord(point, `componentOrigins.${nodeId}`);
    requireExactKeys(point, ['x', 'y', 'z'], `componentOrigins.${nodeId}`);
    for (const component of ['x', 'y', 'z']) requireFinite(point[component], `componentOrigins.${nodeId}.${component}`);
  }
  requireRecord(
    value.restraintTypeCodeMap,
    'inputXmlAnalysisRequest.ingestionOptions.restraintTypeCodeMap',
  );
  for (const [code, kind] of Object.entries(value.restraintTypeCodeMap)) {
    requireText(code, 'inputXmlAnalysisRequest.ingestionOptions restraint code');
    if (!['ANCHOR', 'GUIDE'].includes(kind)) {
      fail('InputXML restraint map contains an unsupported kind.', 'PIPING_INPUTXML_RESTRAINT_MAP_INVALID');
    }
  }
  requireDeclaredValue(value, 'bendRadiusTolerance', { exclusiveMinimum: 0 });
  return deepFreeze({
    unit: value.unit,
    source: value.source,
    componentOrigins: structuredClone(value.componentOrigins),
    restraintTypeCodeMap: { ...value.restraintTypeCodeMap },
    bendRadiusTolerance: { ...value.bendRadiusTolerance },
  });
}

function requireConditioning(value) {
  requireRecord(value, 'inputXmlAnalysisRequest.conditioning');
  requireExactKeys(value, INPUTXML_CONDITIONING_KEYS, 'inputXmlAnalysisRequest.conditioning');
  if (!Array.isArray(value.requiredAttachmentPoints)) {
    fail('InputXML required attachment points must be an array.', 'PIPING_INPUTXML_CONDITIONING_INVALID');
  }
  requireRecord(value.profile, 'inputXmlAnalysisRequest.conditioning.profile');
  for (const field of ['spanSeedingLimit', 'bendSeedingSegments', 'bendLengthErrorLimit']) {
    requireDeclaredValue(value.profile, field, field === 'bendSeedingSegments'
      ? { minimum: 2 }
      : { exclusiveMinimum: 0 });
  }
  return deepFreeze({
    requiredAttachmentPoints: structuredClone(value.requiredAttachmentPoints),
    profile: structuredClone(value.profile),
  });
}

function requireValidInputXmlGeometry(geometry) {
  const errorCodes = (geometry.diagnostics ?? [])
    .filter((row) => row.severity === 'error' || row.severity === 'ERROR')
    .map((row) => row.code);
  if (geometry.valid !== true || errorCodes.length > 0) {
    fail(
      'InputXML geometry is invalid and cannot enter B-1 conditioning.',
      'PIPING_INPUTXML_GEOMETRY_INVALID',
      { errorCodes },
    );
  }
}

function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, ...projection } = geometry;
  return projection;
}

function requireMediaType(value) {
  if (value !== INPUTXML_MEDIA_TYPE) {
    fail('InputXML media type must be application/xml.', 'PIPING_INPUTXML_SOURCE_INVALID');
  }
  return value;
}

function requireRecord(value, field) {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, 'PIPING_INPUTXML_RECORD_REQUIRED');
  return value;
}

function requireExactKeys(value, expected, field) {
  requireRecord(value, field);
  const actual = Object.keys(value).sort(compareAscii);
  const required = [...expected].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    fail(`${field} keys are invalid.`, 'PIPING_INPUTXML_KEYS_INVALID', { actual, required });
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${field} must be a non-empty string.`, 'PIPING_INPUTXML_TEXT_REQUIRED');
  }
  return value;
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail(`${field} must be a semantic hash.`, 'PIPING_INPUTXML_HASH_INVALID');
  }
  return value;
}

function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be finite.`, 'PIPING_INPUTXML_NUMBER_INVALID');
  }
  return Object.is(value, -0) ? 0 : value;
}

function fail(message, code, evidence = null) {
  failLinearPipingAnalysis(message, code, evidence);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
