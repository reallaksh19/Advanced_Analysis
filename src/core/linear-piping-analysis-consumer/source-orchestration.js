/**
 * Phase 2A/2C source-authority orchestration for the linear piping application.
 *
 * The gateway compiles explicit B-2.5 and B-3.0 inputs through production
 * APIs, delegates B-3.3/B-3.4 to T0 and may retain the exact compilation and
 * load case for downstream interface recovery. It does not parse project
 * files, resolve engineering properties or perform interface/code mechanics.
 */

import { deepFreeze } from '../shared-piping-model/immutable.js';
import { compileMechanicalModel } from '../linear-fea-model-compiler/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../linear-fea-load-case/index.js';
import { deriveLinearPipingParentSet } from './contracts.js';
import { runLinearPipingAnalysis } from './consumer.js';
import { expandPipeWallGravitySourceAuthorities } from './gravity-expansion.js';
import { sealLinearPipingSourceAnalysisContext } from './source-analysis-context.js';
import {
  failLinearPipingAnalysis,
  requireArray,
  requireExactKeys,
  requireHash,
  requireIdentity,
  requireRevision,
} from './validation.js';

export const LINEAR_PIPING_SOURCE_ANALYSIS_REQUEST_SCHEMA =
  'linear-piping-source-analysis-request/v1';

export const SOURCE_ANALYSIS_REQUEST_KEYS = Object.freeze([
  'schema',
  'analysisIdentity',
  'analysisRevision',
  'mechanicalModelInput',
  'physicalLoadCaseInput',
  'frameElements',
  'pipingComponents',
  'solverProfile',
  'recoveryProfile',
  'expectedSourceAuthorities',
]);

export const SOURCE_LOAD_CASE_INPUT_KEYS = Object.freeze([
  'loadCaseId',
  'loadCaseClass',
  'presentation',
  'primitives',
  'profile',
]);

export const SOURCE_AUTHORITY_KEYS = Object.freeze([
  'sourceSemanticHash',
  'conditionedTopologyHash',
  'compilerProfileSemanticHash',
  'loadCaseProfileSemanticHash',
]);

/** Existing behavior-compatible Phase 2A result-only boundary. */
export function runLinearPipingAnalysisFromSourceAuthorities(request, runtime) {
  return compileLinearPipingSourceAnalysisContext(request, runtime).analysisResult;
}

/**
 * Compile source authorities once and retain the exact B-2.5/B-3.0/T0 chain.
 * Phase 3 callers consume `compilation`, `loadCase` and `analysisResult`
 * directly from this context instead of reconstructing governed parents.
 */
export function compileLinearPipingSourceAnalysisContext(request, runtime) {
  const accepted = validateLinearPipingSourceAnalysisRequest(request);
  const compilation = compileMechanicalModel(accepted.mechanicalModelInput);
  const declaredLoadCase = compilePhysicalLoadCase({
    ...accepted.physicalLoadCaseInput,
    modelReference: modelReferenceFromCompilation(compilation),
  });
  const expanded = expandPipeWallGravitySourceAuthorities({
    compilation,
    loadCase: declaredLoadCase,
    frameElements: accepted.frameElements,
    pipingComponents: accepted.pipingComponents,
  });
  const loadCase = expanded.loadCase;
  const currentSourceAuthorities = deriveLinearPipingSourceAuthoritySet({
    compilation,
    loadCase,
  });
  requireMatchingSourceAuthorities(
    accepted.expectedSourceAuthorities,
    currentSourceAuthorities,
  );
  const parentInput = {
    compilation,
    loadCase,
    frameElements: expanded.frameElements,
    pipingComponents: expanded.pipingComponents,
    solverProfile: accepted.solverProfile,
    recoveryProfile: accepted.recoveryProfile,
  };
  const analysisResult = runLinearPipingAnalysis({
    schema: 'linear-piping-analysis-request/v1',
    analysisIdentity: accepted.analysisIdentity,
    analysisRevision: accepted.analysisRevision,
    ...parentInput,
    expectedParents: deriveLinearPipingParentSet(parentInput),
  }, runtime);
  return sealLinearPipingSourceAnalysisContext({
    compilation,
    loadCase,
    analysisResult,
  });
}

export function validateLinearPipingSourceAnalysisRequest(value) {
  requireExactKeys(value, SOURCE_ANALYSIS_REQUEST_KEYS, 'sourceRequest');
  if (value.schema !== LINEAR_PIPING_SOURCE_ANALYSIS_REQUEST_SCHEMA) {
    failLinearPipingAnalysis(
      'sourceRequest.schema is unsupported.',
      'PIPING_SOURCE_REQUEST_INVALID',
    );
  }
  requireIdentity(value.analysisIdentity, 'sourceRequest.analysisIdentity');
  requireRevision(value.analysisRevision, 'sourceRequest.analysisRevision');
  requireExactKeys(
    value.physicalLoadCaseInput,
    SOURCE_LOAD_CASE_INPUT_KEYS,
    'sourceRequest.physicalLoadCaseInput',
  );
  requireArray(value.frameElements, 'sourceRequest.frameElements');
  requireArray(value.pipingComponents, 'sourceRequest.pipingComponents');
  requireExactKeys(
    value.expectedSourceAuthorities,
    SOURCE_AUTHORITY_KEYS,
    'sourceRequest.expectedSourceAuthorities',
  );
  SOURCE_AUTHORITY_KEYS.forEach((field) => requireHash(
    value.expectedSourceAuthorities[field],
    `sourceRequest.expectedSourceAuthorities.${field}`,
  ));
  return Object.freeze({
    ...value,
    physicalLoadCaseInput: Object.freeze({ ...value.physicalLoadCaseInput }),
    frameElements: Object.freeze([...value.frameElements]),
    pipingComponents: Object.freeze([...value.pipingComponents]),
    expectedSourceAuthorities: deepFreeze({ ...value.expectedSourceAuthorities }),
  });
}

export function deriveLinearPipingSourceAuthoritySet({ compilation, loadCase }) {
  const authority = {
    sourceSemanticHash: compilation.sourceSemanticHash,
    conditionedTopologyHash: compilation.conditionedTopologyHash,
    compilerProfileSemanticHash: compilation.compilerProfileSemanticHash,
    loadCaseProfileSemanticHash: loadCase.loadCaseProfileSemanticHash,
  };
  SOURCE_AUTHORITY_KEYS.forEach((field) => requireHash(authority[field], field));
  return deepFreeze(authority);
}

function requireMatchingSourceAuthorities(expected, actual) {
  SOURCE_AUTHORITY_KEYS.forEach((field) => {
    if (expected[field] !== actual[field]) {
      failLinearPipingAnalysis(
        `${field} does not match the compiled source authority.`,
        'PIPING_SOURCE_AUTHORITY_MISMATCH',
        { field, expected: expected[field], actual: actual[field] },
      );
    }
  });
}
