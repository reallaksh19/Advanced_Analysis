import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireInputXmlLinearCaseExecution } from './inputxml-linear-case-execution-contract.js';
import { InputXmlLinearRecoveryError, inputXmlRecoveryFailure as fail } from './inputxml-linear-recovery-error.js';
import { requireRecoveredCaseShape } from './inputxml-linear-recovery-validation.js';
import { requireInputXmlLinearSolveRuntime } from './inputxml-linear-solve-runtime.js';

export const INPUTXML_LINEAR_RECOVERED_CASE_SCHEMA =
  'fea-inputxml-linear-recovered-case/v1';

export const INPUTXML_LINEAR_RECOVERED_CASE_KEYS = Object.freeze([
  'schema', 'recoveredCaseId', 'analysisProfileId',
  'sourceIdentity', 'stiffnessIdentity', 'runtimeIdentity',
  'caseIdentity', 'executionIdentity', 'recoveryIdentity',
  'displacements', 'reactions', 'elementResults', 'sourceStations',
  'unrepresentedSources', 'pressureCustody', 'limitations',
  'diagnostics', 'status', 'semanticHash', 'evidenceHash',
]);

export function sealInputXmlLinearRecoveredCase(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(recoveredCaseSemanticProjection(draft));
  const evidence = semanticHash(recoveredCaseEvidenceProjection(draft, semantic));
  return requireInputXmlLinearRecoveredCase(deepFreeze({
    ...draft,
    semanticHash: semantic,
    evidenceHash: evidence,
  }));
}

export function requireInputXmlLinearRecoveredCase(value, expectedContext) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_RECOVERED_CASE_SCHEMA) {
    fail('InputXML recovered-case schema is invalid.', 'INPUTXML_RECOVERY_SCHEMA_INVALID');
  }
  requireDraft(value);
  const semantic = semanticHash(recoveredCaseSemanticProjection(value));
  if (value.semanticHash !== semantic) fail(
    'InputXML recovered-case semantic hash mismatch.', 'INPUTXML_RECOVERY_HASH_MISMATCH',
  );
  const evidence = semanticHash(recoveredCaseEvidenceProjection(value, semantic));
  if (value.evidenceHash !== evidence) fail(
    'InputXML recovered-case evidence hash mismatch.', 'INPUTXML_RECOVERY_HASH_MISMATCH',
  );
  if (expectedContext) requireCurrentContext(value, expectedContext);
  return deepFreeze(value);
}

export function recoveredCaseSemanticProjection(value) {
  return Object.fromEntries(INPUTXML_LINEAR_RECOVERED_CASE_KEYS
    .filter((key) => key !== 'semanticHash' && key !== 'evidenceHash')
    .map((key) => [key, value[key]]));
}

export function recoveredCaseEvidenceProjection(value, semanticHashValue) {
  return {
    semanticHash: semanticHashValue,
    sourceEvidence: {
      sourceBundleEvidenceHash: value.sourceIdentity.sourceBundleEvidenceHash,
      modelHealthEvidenceHash: value.sourceIdentity.modelHealthEvidenceHash,
      topologyEvidenceHash: value.sourceIdentity.topologyEvidenceHash,
      unitNormalizationEvidenceHash: value.sourceIdentity.unitNormalizationEvidenceHash,
      structuralPreparationEvidenceHash:
        value.sourceIdentity.structuralPreparationEvidenceHash,
      solvePreparationEvidenceHash: value.sourceIdentity.solvePreparationEvidenceHash,
    },
    stiffnessEvidence: {
      preflightEvidenceHash: value.stiffnessIdentity.preflightEvidenceHash,
      genericPreflightEvidenceHash: value.stiffnessIdentity.genericPreflightEvidenceHash,
    },
    executionEvidence: {
      physicalLoadCaseEvidenceHash: value.caseIdentity.physicalLoadCaseEvidenceHash,
      caseExecutionEvidenceHash: value.executionIdentity.caseExecutionEvidenceHash,
      solverExecutionEvidenceHash: value.executionIdentity.solverExecutionEvidenceHash,
    },
    recoveryEvidenceHash: value.recoveryIdentity.genericRecoveryEvidenceHash,
    diagnostics: value.diagnostics,
    status: value.status,
  };
}

function requireDraft(value) {
  requireRecoveredCaseShape(value, INPUTXML_LINEAR_RECOVERED_CASE_KEYS);
}

function requireCurrentContext(value, context) {
  const runtime = requireInputXmlLinearSolveRuntime(context.runtime);
  const execution = requireInputXmlLinearCaseExecution(context.execution, runtime);
  if (value.runtimeIdentity.runtimeId !== runtime.runtimeId
    || value.runtimeIdentity.runtimeHash !== runtime.runtimeHash
    || value.stiffnessIdentity.stiffnessRuntimeHash !== runtime.stiffnessRuntimeHash
    || value.stiffnessIdentity.stiffnessStateHash !== runtime.stiffnessStateHash
    || value.sourceIdentity.solvePreparationSemanticHash
      !== runtime.solvePreparationSemanticHash
    || value.stiffnessIdentity.preflightSemanticHash !== runtime.preflightSemanticHash
    || value.caseIdentity.caseId !== execution.caseId
    || value.caseIdentity.physicalLoadCaseHash !== execution.physicalLoadCaseHash
    || value.executionIdentity.caseExecutionId !== execution.caseExecutionId
    || value.executionIdentity.caseExecutionSemanticHash !== execution.semanticHash
    || value.executionIdentity.caseExecutionEvidenceHash !== execution.evidenceHash) {
    fail(
      'InputXML recovered case is stale for the supplied runtime or execution.',
      'INPUTXML_RECOVERY_CONTEXT_STALE',
    );
  }
}

export { InputXmlLinearRecoveryError };
