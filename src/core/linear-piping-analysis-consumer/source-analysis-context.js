import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { validateLinearPipingAnalysisResult } from './contracts.js';
import { failLinearPipingAnalysis } from './validation.js';

export const LINEAR_PIPING_SOURCE_ANALYSIS_CONTEXT_SCHEMA =
  'linear-piping-source-analysis-context/v1';
export const SOURCE_ANALYSIS_CONTEXT_KEYS = Object.freeze([
  'schema',
  'compilation',
  'loadCase',
  'analysisResult',
  'semanticHash',
  'evidenceHash',
]);

/**
 * Seal the exact B-2.5 compilation and B-3.0 load case consumed by one T0
 * result. Downstream interface recovery must use these retained objects rather
 * than reconstructing them from hashes or recompiling source inputs.
 */
export function sealLinearPipingSourceAnalysisContext(input) {
  requireRecord(input, 'sourceAnalysisContextInput');
  requireExactKeys(
    input,
    ['compilation', 'loadCase', 'analysisResult'],
    'sourceAnalysisContextInput',
  );
  const compilation = requireMechanicalModelCompilation(input.compilation);
  const loadCase = requirePhysicalLoadCase(input.loadCase);
  const analysisResult = validateLinearPipingAnalysisResult(input.analysisResult);
  requireContextParents(compilation, loadCase, analysisResult);
  const draft = {
    schema: LINEAR_PIPING_SOURCE_ANALYSIS_CONTEXT_SCHEMA,
    compilation,
    loadCase,
    analysisResult,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeSourceAnalysisContextSemanticHash(draft);
  draft.evidenceHash = computeSourceAnalysisContextEvidenceHash(draft);
  return requireLinearPipingSourceAnalysisContext(draft);
}

export function requireLinearPipingSourceAnalysisContext(value) {
  requireRecord(value, 'sourceAnalysisContext');
  requireExactKeys(value, SOURCE_ANALYSIS_CONTEXT_KEYS, 'sourceAnalysisContext');
  if (value.schema !== LINEAR_PIPING_SOURCE_ANALYSIS_CONTEXT_SCHEMA) {
    failContext(
      'Source analysis context schema is unsupported.',
      'PIPING_SOURCE_CONTEXT_INVALID',
    );
  }
  const compilation = requireMechanicalModelCompilation(value.compilation);
  const loadCase = requirePhysicalLoadCase(value.loadCase);
  const analysisResult = validateLinearPipingAnalysisResult(value.analysisResult);
  requireContextParents(compilation, loadCase, analysisResult);
  requireHash(value.semanticHash, 'sourceAnalysisContext.semanticHash');
  requireHash(value.evidenceHash, 'sourceAnalysisContext.evidenceHash');
  if (value.semanticHash !== computeSourceAnalysisContextSemanticHash(value)
    || value.evidenceHash !== computeSourceAnalysisContextEvidenceHash(value)) {
    failContext(
      'Source analysis context hashes are stale.',
      'PIPING_SOURCE_CONTEXT_HASH_MISMATCH',
    );
  }
  return deepFreeze({
    ...value,
    compilation,
    loadCase,
    analysisResult,
  });
}

export function computeSourceAnalysisContextSemanticHash(value) {
  return semanticHash({
    schema: value.schema,
    compilationSemanticHash: value.compilation.semanticHash,
    loadCaseSemanticHash: value.loadCase.semanticHash,
    analysisResultSemanticHash: value.analysisResult.semanticHash,
  });
}

export function computeSourceAnalysisContextEvidenceHash(value) {
  return semanticHash({
    semanticHash: value.semanticHash,
    compilationEvidenceHash: value.compilation.evidenceHash,
    loadCaseEvidenceHash: value.loadCase.evidenceHash,
    analysisResultEvidenceHash: value.analysisResult.evidenceHash,
  });
}

function requireContextParents(compilation, loadCase, analysisResult) {
  const expected = {
    sourceSemanticHash: compilation.sourceSemanticHash,
    conditionedTopologyHash: compilation.conditionedTopologyHash,
    compilationSemanticHash: compilation.semanticHash,
    compilationEvidenceHash: compilation.evidenceHash,
    mechanicalModelSemanticHash: compilation.mechanicalModelSemanticHash,
    stiffnessStateHash: compilation.stiffnessStateHash,
    loadCaseSemanticHash: loadCase.semanticHash,
    loadCaseEvidenceHash: loadCase.evidenceHash,
    physicalLoadCaseHash: loadCase.physicalLoadCaseHash,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (analysisResult.parents[field] !== expectedValue) {
      failContext(
        `Source analysis context parent ${field} is inconsistent.`,
        'PIPING_SOURCE_CONTEXT_PARENT_MISMATCH',
        { field, expected: expectedValue, actual: analysisResult.parents[field] },
      );
    }
  }
}

function requireRecord(value, field) {
  if (!isPlainRecord(value)) {
    failContext(`${field} must be a record.`, 'PIPING_SOURCE_CONTEXT_RECORD_REQUIRED');
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
      'PIPING_SOURCE_CONTEXT_KEYS_INVALID',
      { actual, required },
    );
  }
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    failContext(`${field} must be a semantic hash.`, 'PIPING_SOURCE_CONTEXT_HASH_INVALID');
  }
}

function failContext(message, code, evidence) {
  failLinearPipingAnalysis(message, code, evidence);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
