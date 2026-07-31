import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import {
  INPUTXML_INGESTION_EVIDENCE_KEYS,
  requireLinearPipingInputXmlSource,
} from './inputxml-source-contract.js';
import { requireLinearPipingSourceAnalysisContext } from './source-analysis-context.js';
import { failLinearPipingAnalysis } from './validation.js';

export const LINEAR_PIPING_INPUTXML_ANALYSIS_CONTEXT_SCHEMA =
  'linear-piping-inputxml-analysis-context/v1';
export const INPUTXML_ANALYSIS_CONTEXT_KEYS = Object.freeze([
  'schema',
  'inputXmlSource',
  'conditionedTopologyHash',
  'ingestionEvidence',
  'sourceAnalysisContext',
  'semanticHash',
  'evidenceHash',
]);

/**
 * Seal exact raw-source provenance with the retained B-2.5/B-3.0/T0 context.
 * This record owns identity/currency only; it does not parse, compile or solve.
 */
export function sealLinearPipingInputXmlAnalysisContext(input) {
  requireRecord(input, 'inputXmlAnalysisContextInput');
  requireExactKeys(input, [
    'inputXmlSource',
    'conditionedTopologyHash',
    'ingestionEvidence',
    'sourceAnalysisContext',
  ], 'inputXmlAnalysisContextInput');
  const inputXmlSource = requireLinearPipingInputXmlSource(input.inputXmlSource);
  const sourceAnalysisContext = requireLinearPipingSourceAnalysisContext(
    input.sourceAnalysisContext,
  );
  const ingestionEvidence = requireIngestionEvidence(input.ingestionEvidence);
  requireContextParents(
    inputXmlSource,
    input.conditionedTopologyHash,
    sourceAnalysisContext,
  );
  const draft = {
    schema: LINEAR_PIPING_INPUTXML_ANALYSIS_CONTEXT_SCHEMA,
    inputXmlSource,
    conditionedTopologyHash: requireHash(
      input.conditionedTopologyHash,
      'inputXmlAnalysisContextInput.conditionedTopologyHash',
    ),
    ingestionEvidence,
    sourceAnalysisContext,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeInputXmlAnalysisContextSemanticHash(draft);
  draft.evidenceHash = computeInputXmlAnalysisContextEvidenceHash(draft);
  return requireLinearPipingInputXmlAnalysisContext(draft);
}

export function requireLinearPipingInputXmlAnalysisContext(value) {
  requireRecord(value, 'inputXmlAnalysisContext');
  requireExactKeys(value, INPUTXML_ANALYSIS_CONTEXT_KEYS, 'inputXmlAnalysisContext');
  if (value.schema !== LINEAR_PIPING_INPUTXML_ANALYSIS_CONTEXT_SCHEMA) {
    failContext(
      'InputXML analysis context schema is unsupported.',
      'PIPING_INPUTXML_CONTEXT_INVALID',
    );
  }
  const inputXmlSource = requireLinearPipingInputXmlSource(value.inputXmlSource);
  const sourceAnalysisContext = requireLinearPipingSourceAnalysisContext(
    value.sourceAnalysisContext,
  );
  const conditionedTopologyHash = requireHash(
    value.conditionedTopologyHash,
    'inputXmlAnalysisContext.conditionedTopologyHash',
  );
  const ingestionEvidence = requireIngestionEvidence(value.ingestionEvidence);
  requireContextParents(
    inputXmlSource,
    conditionedTopologyHash,
    sourceAnalysisContext,
  );
  requireHash(value.semanticHash, 'inputXmlAnalysisContext.semanticHash');
  requireHash(value.evidenceHash, 'inputXmlAnalysisContext.evidenceHash');
  if (value.semanticHash !== computeInputXmlAnalysisContextSemanticHash(value)
    || value.evidenceHash !== computeInputXmlAnalysisContextEvidenceHash(value)) {
    failContext(
      'InputXML analysis context hashes are stale.',
      'PIPING_INPUTXML_CONTEXT_HASH_MISMATCH',
    );
  }
  return deepFreeze({
    ...value,
    inputXmlSource,
    conditionedTopologyHash,
    ingestionEvidence,
    sourceAnalysisContext,
  });
}

export function computeInputXmlAnalysisContextSemanticHash(value) {
  return semanticHash({
    schema: value.schema,
    inputXmlSourceSemanticHash: value.inputXmlSource.semanticHash,
    conditionedTopologyHash: value.conditionedTopologyHash,
    sourceAnalysisContextSemanticHash: value.sourceAnalysisContext.semanticHash,
  });
}

export function computeInputXmlAnalysisContextEvidenceHash(value) {
  return semanticHash({
    semanticHash: value.semanticHash,
    inputXmlContentHash: value.inputXmlSource.contentHash,
    ingestionEvidence: value.ingestionEvidence,
    sourceAnalysisContextEvidenceHash: value.sourceAnalysisContext.evidenceHash,
  });
}

function requireContextParents(source, conditionedTopologyHash, context) {
  if (context.compilation.sourceSemanticHash !== source.semanticHash
    || context.analysisResult.parents.sourceSemanticHash !== source.semanticHash) {
    failContext(
      'InputXML source identity does not match the retained source context.',
      'PIPING_INPUTXML_CONTEXT_SOURCE_MISMATCH',
    );
  }
  if (context.compilation.conditionedTopologyHash !== conditionedTopologyHash
    || context.analysisResult.parents.conditionedTopologyHash !== conditionedTopologyHash) {
    failContext(
      'InputXML conditioned topology does not match the retained source context.',
      'PIPING_INPUTXML_CONTEXT_TOPOLOGY_MISMATCH',
    );
  }
}

function requireIngestionEvidence(value) {
  requireRecord(value, 'inputXmlAnalysisContext.ingestionEvidence');
  requireExactKeys(
    value,
    INPUTXML_INGESTION_EVIDENCE_KEYS,
    'inputXmlAnalysisContext.ingestionEvidence',
  );
  if (typeof value.fileName !== 'string' || value.fileName.length === 0
    || typeof value.unit !== 'string' || value.unit.length === 0
    || typeof value.source !== 'string' || value.source.length === 0
    || !Array.isArray(value.geometryDiagnosticCodes)
    || !isPlainRecord(value.conditioningReport)) {
    failContext(
      'InputXML ingestion evidence is invalid.',
      'PIPING_INPUTXML_CONTEXT_EVIDENCE_INVALID',
    );
  }
  return deepFreeze(structuredClone(value));
}

function requireRecord(value, field) {
  if (!isPlainRecord(value)) {
    failContext(`${field} must be a record.`, 'PIPING_INPUTXML_CONTEXT_RECORD_REQUIRED');
  }
  return value;
}

function requireExactKeys(value, expected, field) {
  requireRecord(value, field);
  const actual = Object.keys(value).sort(compareAscii);
  const required = [...expected].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    failContext(
      `${field} keys are invalid.`,
      'PIPING_INPUTXML_CONTEXT_KEYS_INVALID',
      { actual, required },
    );
  }
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    failContext(`${field} must be a semantic hash.`, 'PIPING_INPUTXML_CONTEXT_HASH_INVALID');
  }
  return value;
}

function failContext(message, code, evidence) {
  failLinearPipingAnalysis(message, code, evidence);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
