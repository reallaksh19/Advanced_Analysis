import { requireSolverExecution } from '../linear-fea-solver/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireInputXmlLinearSolveRuntime } from './inputxml-linear-solve-runtime.js';

export const INPUTXML_LINEAR_CASE_EXECUTION_SCHEMA =
  'fea-inputxml-linear-case-execution/v1';

export function sealInputXmlLinearCaseExecution(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(semanticProjection(draft));
  const evidence = semanticHash(evidenceProjection(draft, semantic));
  return deepFreeze({ ...draft, semanticHash: semantic, evidenceHash: evidence });
}

export function requireInputXmlLinearCaseExecution(value, expectedRuntime) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_CASE_EXECUTION_SCHEMA) {
    throw new TypeError('InputXML linear case execution schema is invalid.');
  }
  requireDraft(value);
  const semantic = semanticHash(semanticProjection(value));
  if (value.semanticHash !== semantic) {
    throw new TypeError('InputXML linear case execution semantic hash mismatch.');
  }
  if (value.evidenceHash !== semanticHash(evidenceProjection(value, semantic))) {
    throw new TypeError('InputXML linear case execution evidence hash mismatch.');
  }
  if (expectedRuntime) requireCurrentRuntime(value, expectedRuntime);
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_CASE_EXECUTION_SCHEMA) {
    throw new TypeError('InputXML case execution record is invalid.');
  }
  for (const key of [
    'caseExecutionId', 'runtimeId', 'runtimeHash', 'analysisProfileId',
    'solvePreparationSemanticHash', 'preflightSemanticHash',
    'stiffnessAssessmentHash', 'stiffnessRuntimeHash', 'caseId', 'caseRole',
    'physicalLoadCaseHash',
  ]) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
      throw new TypeError(`InputXML case execution ${key} is invalid.`);
    }
  }
  const execution = requireSolverExecution(value.execution);
  if (execution.physicalLoadCaseHash !== value.physicalLoadCaseHash
    || execution.status !== value.status
    || execution.factorization.reused !== true) {
    throw new TypeError('InputXML case execution solver custody is inconsistent.');
  }
  if (!Array.isArray(value.sourceSetIds) || !Array.isArray(value.sourceFeatureIds)
    || !Array.isArray(value.elementLedger) || value.elementLedger.length === 0
    || !Array.isArray(value.limitations) || !isPlainRecord(value.summary)) {
    throw new TypeError('InputXML case execution collections are invalid.');
  }
  if (Object.hasOwn(value, 'factorizationHandle')
    || Object.hasOwn(value, 'factorizationCache')) {
    throw new TypeError('InputXML sealed case execution cannot retain runtime factors.');
  }
  requireElementLedger(value.elementLedger);
}

function requireElementLedger(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!isPlainRecord(row) || typeof row.elementId !== 'string' || ids.has(row.elementId)
      || typeof row.frameElementSemanticHash !== 'string'
      || typeof row.globalStiffnessHash !== 'string'
      || row.globalStiffnessHash !== row.qualifiedStiffnessHash
      || !Array.isArray(row.distributedPrimitiveIds)
      || !Array.isArray(row.codeOnlyPrimitiveIds)) {
      throw new TypeError('InputXML case execution element ledger is malformed or duplicated.');
    }
    ids.add(row.elementId);
  }
}

function requireCurrentRuntime(value, runtime) {
  const accepted = requireInputXmlLinearSolveRuntime(runtime);
  if (value.runtimeId !== accepted.runtimeId
    || value.runtimeHash !== accepted.runtimeHash
    || value.solvePreparationSemanticHash !== accepted.solvePreparationSemanticHash
    || value.preflightSemanticHash !== accepted.preflightSemanticHash
    || value.stiffnessRuntimeHash !== accepted.stiffnessRuntimeHash
    || !accepted.authorizedCaseIds.includes(value.caseId)) {
    throw new TypeError('InputXML case execution is stale for the supplied runtime.');
  }
}

function semanticProjection(value) {
  return {
    schema: value.schema,
    caseExecutionId: value.caseExecutionId,
    runtimeId: value.runtimeId,
    runtimeHash: value.runtimeHash,
    analysisProfileId: value.analysisProfileId,
    solvePreparationSemanticHash: value.solvePreparationSemanticHash,
    preflightSemanticHash: value.preflightSemanticHash,
    stiffnessAssessmentHash: value.stiffnessAssessmentHash,
    stiffnessRuntimeHash: value.stiffnessRuntimeHash,
    caseId: value.caseId,
    caseRole: value.caseRole,
    sourceSetIds: value.sourceSetIds,
    sourceFeatureIds: value.sourceFeatureIds,
    physicalLoadCaseHash: value.physicalLoadCaseHash,
    execution: value.execution,
    elementLedger: value.elementLedger,
    limitations: value.limitations,
    summary: value.summary,
    status: value.status,
  };
}

function evidenceProjection(value, semantic) {
  return {
    ...semanticProjection(value),
    semanticHash: semantic,
    solverExecutionEvidenceHash: value.execution.evidenceHash,
  };
}
