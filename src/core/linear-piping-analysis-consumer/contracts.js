/**
 * T0 piping application-chain contracts.
 *
 * The consumer binds already qualified B-2.5/B-3.0 inputs to B-3.3/B-3.4
 * execution and recovery. It owns orchestration and currency only; it does
 * not implement stiffness, loads, reactions, stress, or interface mechanics.
 */

import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { requireFrameElement } from '../linear-fea-frame-element/index.js';
import { requirePipingComponent } from '../linear-fea-piping-components/index.js';
import {
  EXECUTION_RECORD_KEYS,
  executionSemanticProjection,
  requireSolverExecution,
  requireSolverProfile,
} from '../linear-fea-solver/index.js';
import {
  recoverySemanticProjection,
  requireRecoveryProfile,
  requireResultRecovery,
} from '../linear-fea-result-recovery/index.js';
import {
  byIdentity,
  failLinearPipingAnalysis,
  requireArray,
  requireExactKeys,
  requireHash,
  requireIdentity,
  requireRevision,
} from './validation.js';

export {
  LinearPipingAnalysisConsumerError,
  failLinearPipingAnalysis,
} from './validation.js';

export const LINEAR_PIPING_ANALYSIS_REQUEST_SCHEMA =
  'linear-piping-analysis-request/v1';
export const LINEAR_PIPING_ANALYSIS_RESULT_SCHEMA =
  'linear-piping-analysis-result-chain/v1';

export const REQUEST_KEYS = Object.freeze([
  'schema',
  'analysisIdentity',
  'analysisRevision',
  'compilation',
  'loadCase',
  'frameElements',
  'pipingComponents',
  'solverProfile',
  'recoveryProfile',
  'expectedParents',
]);

export const PARENT_KEYS = Object.freeze([
  'sourceSemanticHash',
  'conditionedTopologyHash',
  'compilationSemanticHash',
  'compilationEvidenceHash',
  'mechanicalModelSemanticHash',
  'stiffnessStateHash',
  'loadCaseSemanticHash',
  'loadCaseEvidenceHash',
  'physicalLoadCaseHash',
  'solverProfileSemanticHash',
  'recoveryProfileSemanticHash',
  'elementAuthorityHash',
]);

export const RESULT_KEYS = Object.freeze([
  'schema',
  'analysisIdentity',
  'analysisRevision',
  'status',
  'parents',
  'execution',
  'recovery',
  'interfaceLoadResults',
  'nozzleAssessments',
  'codeResults',
  'limitations',
  'notEvaluated',
  'semanticHash',
  'evidenceHash',
]);

export const NOT_EVALUATED = Object.freeze([
  'INTERFACE_LOAD_RECOVERY',
  'NOZZLE_ALLOWABLE_ASSESSMENT',
  'B31_3_APPLICATION_ORCHESTRATION',
]);

const RESULT_STATUSES = Object.freeze(['QUALIFIED', 'CONDITIONAL']);

export function deriveLinearPipingParentSet(input) {
  const compilation = requireMechanicalModelCompilation(input.compilation);
  const loadCase = requirePhysicalLoadCase(input.loadCase);
  const solverProfile = requireSolverProfile(input.solverProfile);
  const recoveryProfile = requireRecoveryProfile(input.recoveryProfile);
  const frameElements = requireArray(input.frameElements, 'frameElements')
    .map(requireFrameElement);
  const pipingComponents = requireArray(input.pipingComponents, 'pipingComponents')
    .map(requirePipingComponent);

  const elementAuthorityHash = semanticHash({
    frameElements: frameElements
      .map((entry) => ({ elementId: entry.elementId, semanticHash: entry.semanticHash }))
      .sort(byIdentity('elementId')),
    pipingComponents: pipingComponents
      .map((entry) => ({ componentId: entry.componentId, semanticHash: entry.semanticHash }))
      .sort(byIdentity('componentId')),
  });

  return deepFreeze({
    sourceSemanticHash: compilation.sourceSemanticHash,
    conditionedTopologyHash: compilation.conditionedTopologyHash,
    compilationSemanticHash: compilation.semanticHash,
    compilationEvidenceHash: compilation.evidenceHash,
    mechanicalModelSemanticHash: compilation.mechanicalModelSemanticHash,
    stiffnessStateHash: compilation.stiffnessStateHash,
    loadCaseSemanticHash: loadCase.semanticHash,
    loadCaseEvidenceHash: loadCase.evidenceHash,
    physicalLoadCaseHash: loadCase.physicalLoadCaseHash,
    solverProfileSemanticHash: solverProfile.semanticHash,
    recoveryProfileSemanticHash: recoveryProfile.semanticHash,
    elementAuthorityHash,
  });
}

export function validateLinearPipingAnalysisRequest(value) {
  requireExactKeys(value, REQUEST_KEYS, 'request');
  if (value.schema !== LINEAR_PIPING_ANALYSIS_REQUEST_SCHEMA) {
    failLinearPipingAnalysis('request.schema is unsupported.', 'PIPING_ANALYSIS_REQUEST_INVALID');
  }
  requireIdentity(value.analysisIdentity, 'request.analysisIdentity');
  requireRevision(value.analysisRevision, 'request.analysisRevision');
  requireExactKeys(value.expectedParents, PARENT_KEYS, 'request.expectedParents');
  PARENT_KEYS.forEach((field) => requireHash(value.expectedParents[field], `request.expectedParents.${field}`));

  const derivedParents = deriveLinearPipingParentSet(value);
  requireMatchingParents(value.expectedParents, derivedParents, 'PIPING_ANALYSIS_PARENT_MISMATCH');

  return Object.freeze({
    ...value,
    frameElements: Object.freeze([...value.frameElements]),
    pipingComponents: Object.freeze([...value.pipingComponents]),
    expectedParents: deepFreeze({ ...value.expectedParents }),
  });
}

export function resultChainSemanticProjection(value) {
  const projection = {};
  RESULT_KEYS.forEach((key) => {
    if (key === 'semanticHash' || key === 'evidenceHash') return;
    if (key === 'execution') {
      projection.execution = {
        executionHash: value.execution.executionHash,
        record: executionSemanticProjection(value.execution),
      };
      return;
    }
    if (key === 'recovery') {
      projection.recovery = {
        recoveryHash: value.recovery.recoveryHash,
        record: recoverySemanticProjection(value.recovery),
      };
      return;
    }
    projection[key] = value[key];
  });
  return projection;
}

export function computeResultChainSemanticHash(value) {
  return semanticHash(resultChainSemanticProjection(value));
}

export function computeResultChainEvidenceHash(value) {
  return semanticHash({
    semanticHash: value.semanticHash,
    status: value.status,
    executionEvidenceHash: value.execution.evidenceHash,
    recoveryEvidenceHash: value.recovery.evidenceHash,
  });
}

export function validateLinearPipingAnalysisResult(value) {
  requireExactKeys(value, RESULT_KEYS, 'result');
  if (value.schema !== LINEAR_PIPING_ANALYSIS_RESULT_SCHEMA) {
    failLinearPipingAnalysis('result.schema is unsupported.', 'PIPING_ANALYSIS_RESULT_INVALID');
  }
  requireIdentity(value.analysisIdentity, 'result.analysisIdentity');
  requireRevision(value.analysisRevision, 'result.analysisRevision');
  if (!RESULT_STATUSES.includes(value.status)) {
    failLinearPipingAnalysis('result.status is unsupported.', 'PIPING_ANALYSIS_RESULT_INVALID');
  }
  requireExactKeys(value.parents, PARENT_KEYS, 'result.parents');
  PARENT_KEYS.forEach((field) => requireHash(value.parents[field], `result.parents.${field}`));

  const executionRecord = Object.fromEntries(
    EXECUTION_RECORD_KEYS.map((key) => [key, value.execution?.[key]]),
  );
  const execution = requireSolverExecution(executionRecord);
  const recovery = requireResultRecovery(value.recovery);
  requireResultRelationships(value, execution, recovery);
  requireUnevaluatedBoundary(value);
  requireArray(value.limitations, 'result.limitations').forEach(requireLimitationBinding);
  requireArray(value.notEvaluated, 'result.notEvaluated');
  if (JSON.stringify(value.notEvaluated) !== JSON.stringify(NOT_EVALUATED)) {
    failLinearPipingAnalysis('result.notEvaluated changed.', 'PIPING_ANALYSIS_RESULT_INVALID');
  }
  requireHash(value.semanticHash, 'result.semanticHash');
  requireHash(value.evidenceHash, 'result.evidenceHash');
  if (value.semanticHash !== computeResultChainSemanticHash(value)
    || value.evidenceHash !== computeResultChainEvidenceHash(value)) {
    failLinearPipingAnalysis('result hashes are stale.', 'PIPING_ANALYSIS_RESULT_HASH_MISMATCH');
  }
  return deepFreeze({ ...value });
}

export function requireCurrentLinearPipingAnalysisResult(value, currentParents) {
  const result = validateLinearPipingAnalysisResult(value);
  requireExactKeys(currentParents, PARENT_KEYS, 'currentParents');
  PARENT_KEYS.forEach((field) => requireHash(currentParents[field], `currentParents.${field}`));
  requireMatchingParents(result.parents, currentParents, 'PIPING_ANALYSIS_RESULT_STALE');
  return result;
}

function requireResultRelationships(value, execution, recovery) {
  const matches = [
    ['mechanicalModelSemanticHash', execution.mechanicalModelSemanticHash],
    ['stiffnessStateHash', execution.stiffnessStateHash],
    ['physicalLoadCaseHash', execution.physicalLoadCaseHash],
    ['solverProfileSemanticHash', execution.solverProfileSemanticHash],
    ['recoveryProfileSemanticHash', recovery.recoveryProfileSemanticHash],
  ];
  matches.forEach(([field, actual]) => {
    if (value.parents[field] !== actual) {
      failLinearPipingAnalysis(`result parent ${field} is inconsistent.`, 'PIPING_ANALYSIS_RESULT_CHAIN_BROKEN');
    }
  });
  if (recovery.executionHash !== execution.executionHash
    || recovery.executionStatus !== execution.status
    || (execution.status === 'CONDITIONAL' && value.status !== 'CONDITIONAL')) {
    failLinearPipingAnalysis('execution and recovery statuses or identities disagree.', 'PIPING_ANALYSIS_RESULT_CHAIN_BROKEN');
  }
}

function requireUnevaluatedBoundary(value) {
  for (const field of ['interfaceLoadResults', 'nozzleAssessments', 'codeResults']) {
    if (value[field] !== null) {
      failLinearPipingAnalysis(`${field} must remain null in T0.`, 'PIPING_ANALYSIS_SCOPE_BOUNDARY_BROKEN');
    }
  }
}

function requireLimitationBinding(entry, index) {
  requireExactKeys(
    entry,
    ['sourceKind', 'sourceId', 'sourceSemanticHash', 'limitation'],
    `result.limitations[${index}]`,
  );
  requireIdentity(entry.sourceKind, `result.limitations[${index}].sourceKind`);
  requireIdentity(entry.sourceId, `result.limitations[${index}].sourceId`);
  requireHash(entry.sourceSemanticHash, `result.limitations[${index}].sourceSemanticHash`);
  if (!isPlainRecord(entry.limitation)) {
    failLinearPipingAnalysis('limitation must be a record.', 'PIPING_ANALYSIS_RESULT_INVALID');
  }
}

function requireMatchingParents(expected, actual, code) {
  PARENT_KEYS.forEach((field) => {
    if (expected[field] !== actual[field]) {
      failLinearPipingAnalysis(`${field} does not match current authority.`, code, {
        field,
        expected: expected[field],
        actual: actual[field],
      });
    }
  });
}
