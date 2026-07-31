/**
 * Phase 2A source-authority orchestration for the linear piping application.
 *
 * This gateway starts before the existing T0 boundary: it compiles explicit
 * B-2.5 mechanical-model inputs and B-3.0 physical-load-case inputs through
 * their production APIs, then delegates execution and recovery to T0. It does
 * not parse raw project files, resolve materials/sections/axes, recover
 * interface loads, assess nozzles, or compile B31.3 application results.
 */

import { deepFreeze } from '../shared-piping-model/immutable.js';
import { compileMechanicalModel } from '../linear-fea-model-compiler/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../linear-fea-load-case/index.js';
import {
  deriveLinearPipingParentSet,
} from './contracts.js';
import { runLinearPipingAnalysis } from './consumer.js';
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

/**
 * Compile explicit upstream authorities and run the bounded T0 chain.
 *
 * @param {object} request Closed `linear-piping-source-analysis-request/v1`.
 * @param {{factorizationCache: Map|null}} runtime Existing T0 runtime.
 * @returns {Readonly<object>} Existing T0 result-chain schema.
 */
export function runLinearPipingAnalysisFromSourceAuthorities(request, runtime) {
  const accepted = validateLinearPipingSourceAnalysisRequest(request);
  const compilation = compileMechanicalModel(accepted.mechanicalModelInput);
  const loadCase = compilePhysicalLoadCase({
    ...accepted.physicalLoadCaseInput,
    modelReference: modelReferenceFromCompilation(compilation),
  });

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
    frameElements: accepted.frameElements,
    pipingComponents: accepted.pipingComponents,
    solverProfile: accepted.solverProfile,
    recoveryProfile: accepted.recoveryProfile,
  };

  return runLinearPipingAnalysis({
    schema: 'linear-piping-analysis-request/v1',
    analysisIdentity: accepted.analysisIdentity,
    analysisRevision: accepted.analysisRevision,
    ...parentInput,
    expectedParents: deriveLinearPipingParentSet(parentInput),
  }, runtime);
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
