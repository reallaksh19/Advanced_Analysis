import { requireInputXmlLinearAnalysisResultPackage } from './inputxml-linear-analysis-result-package-contract.js';

export function exportInputXmlLinearAnalysisResultPackageJson(value) {
  const accepted = requireInputXmlLinearAnalysisResultPackage(value);
  return `${JSON.stringify(accepted, null, 2)}\n`;
}

export function exportInputXmlLinearAnalysisResultEvidenceCsv(value) {
  const accepted = requireInputXmlLinearAnalysisResultPackage(value);
  const rows = [['layer', 'record_id', 'semantic_hash', 'evidence_hash', 'parent_id', 'status']];
  rows.push([
    'model_health', 'MODEL_HEALTH', accepted.modelHealth.semanticHash,
    accepted.modelHealth.evidenceHash, accepted.sourceIdentity.sourceBundleSemanticHash,
    accepted.modelHealth.summary.strictLinearStaticStatus,
  ]);
  rows.push([
    'solve_preparation', accepted.solvePreparation.preparationId,
    accepted.solvePreparation.semanticHash, accepted.solvePreparation.evidenceHash,
    accepted.modelHealth.semanticHash, accepted.solvePreparation.summary.status ?? '',
  ]);
  rows.push([
    'stiffness_preflight', accepted.preflight.preflightId,
    accepted.preflight.semanticHash, accepted.preflight.evidenceHash,
    accepted.solvePreparation.semanticHash, accepted.preflight.status,
  ]);
  accepted.physicalExecutions.forEach((row) => rows.push([
    'physical_execution', row.caseExecutionId, row.semanticHash, row.evidenceHash,
    accepted.preflight.semanticHash, row.status,
  ]));
  accepted.recoveredResults.forEach((row) => rows.push([
    'recovered_result', row.recoveredCaseId, row.semanticHash, row.evidenceHash,
    row.executionIdentity.caseExecutionSemanticHash, row.status,
  ]));
  accepted.derivedCases.forEach((row) => rows.push([
    'derived_case', row.derivedCaseId, row.semanticHash, row.evidenceHash,
    row.compatibilityIdentity.stiffnessRuntimeHash, row.status,
  ]));
  rows.push([
    'code_evaluation', accepted.codeEvaluation.evaluationId,
    accepted.codeEvaluation.semanticHash, accepted.codeEvaluation.evidenceHash,
    accepted.preflight.semanticHash, accepted.codeEvaluation.status,
  ]);
  rows.push([
    'analysis_result_package', accepted.packageId, accepted.semanticHash,
    accepted.evidenceHash, accepted.evidenceManifest.manifestId, accepted.status,
  ]);
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
