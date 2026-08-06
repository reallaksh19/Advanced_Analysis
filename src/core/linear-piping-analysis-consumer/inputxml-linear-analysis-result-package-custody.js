import { semanticHash } from '../shared-piping-model/canonical-json.js';

export function buildInputXmlAnalysisResultEvidenceManifest(value) {
  return Object.freeze({
    manifestId: `IXRM-${semanticHash({
      modelHealth: value.modelHealth.semanticHash,
      solvePreparation: value.solvePreparation.semanticHash,
      preflight: value.preflight.semanticHash,
      physicalExecutions: value.physicalExecutions.map((row) => row.semanticHash),
      recoveredResults: value.recoveredResults.map((row) => row.semanticHash),
      derivedCases: value.derivedCases.map((row) => row.semanticHash),
      codeEvaluation: value.codeEvaluation.semanticHash,
    })}`,
    source: Object.freeze({
      sourceBundleSemanticHash: value.modelHealth.sourceBundleSemanticHash,
      sourceBundleEvidenceHash: value.modelHealth.sourceBundleEvidenceHash,
      topologySemanticHash: value.modelHealth.topologySemanticHash,
      topologyEvidenceHash: value.modelHealth.topologyEvidenceHash,
      modelHealthSemanticHash: value.modelHealth.semanticHash,
      modelHealthEvidenceHash: value.modelHealth.evidenceHash,
    }),
    preparation: Object.freeze({
      solvePreparationSemanticHash: value.solvePreparation.semanticHash,
      solvePreparationEvidenceHash: value.solvePreparation.evidenceHash,
      preflightSemanticHash: value.preflight.semanticHash,
      preflightEvidenceHash: value.preflight.evidenceHash,
      stiffnessAssessmentHash: value.preflight.stiffnessAssessmentHash,
      stiffnessStateHash: value.preflight.stiffnessStateHash,
    }),
    physicalExecutions: Object.freeze(value.physicalExecutions.map((row) => Object.freeze({
      caseId: row.caseId,
      caseExecutionId: row.caseExecutionId,
      semanticHash: row.semanticHash,
      evidenceHash: row.evidenceHash,
      solverExecutionSemanticHash: row.execution.semanticHash,
      solverExecutionEvidenceHash: row.execution.evidenceHash,
    }))),
    recoveredResults: Object.freeze(value.recoveredResults.map((row) => Object.freeze({
      caseId: row.caseIdentity.caseId,
      recoveredCaseId: row.recoveredCaseId,
      semanticHash: row.semanticHash,
      evidenceHash: row.evidenceHash,
      caseExecutionSemanticHash: row.executionIdentity.caseExecutionSemanticHash,
      genericRecoverySemanticHash: row.recoveryIdentity.genericRecoverySemanticHash,
      genericRecoveryEvidenceHash: row.recoveryIdentity.genericRecoveryEvidenceHash,
    }))),
    derivedCases: Object.freeze(value.derivedCases.map((row) => Object.freeze({
      derivedCaseId: row.derivedCaseId,
      semanticHash: row.semanticHash,
      evidenceHash: row.evidenceHash,
    }))),
    codeEvaluation: Object.freeze({
      evaluationId: value.codeEvaluation.evaluationId,
      semanticHash: value.codeEvaluation.semanticHash,
      evidenceHash: value.codeEvaluation.evidenceHash,
    }),
  });
}

export function inputXmlAnalysisResultPackageLimitations(value) {
  const entries = [
    ...value.modelHealth.capabilities.flatMap((row) => row.limitationCodes),
    ...value.solvePreparation.limitations,
    ...value.physicalExecutions.flatMap((row) => row.limitations),
    ...value.recoveredResults.flatMap((row) => row.limitations),
    ...value.derivedCases.flatMap((row) => row.limitations),
    ...value.codeEvaluation.limitations,
    ...value.codeEvaluation.results.flatMap((row) => row.limitations),
  ];
  return Object.freeze([...new Set(entries)].sort(compareAscii));
}

export function inputXmlAnalysisResultPackageStatus(value) {
  const conditional = value.preflight.status === 'WARN'
    || value.physicalExecutions.some((row) => row.status === 'CONDITIONAL')
    || value.recoveredResults.some((row) => row.status === 'CONDITIONAL')
    || value.derivedCases.some((row) => row.status === 'CONDITIONAL')
    || value.codeEvaluation.status === 'CONDITIONAL';
  return conditional ? 'CONDITIONAL' : 'QUALIFIED';
}

export function inputXmlAnalysisResultPackageSummary(value, limitations, status) {
  return Object.freeze({
    physicalCaseCount: value.physicalExecutions.length,
    recoveredCaseCount: value.recoveredResults.length,
    derivedCaseCount: value.derivedCases.length,
    codeResultCount: value.codeEvaluation.results.length,
    modelHealthFindingCount: value.modelHealth.findings.length,
    limitationCount: limitations.length,
    status,
    runtimeStateRetained: false,
  });
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
