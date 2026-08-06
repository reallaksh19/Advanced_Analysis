import { requireInputXmlLinearB31Evaluation } from './inputxml-linear-b31-evaluation-contract.js';
import { requireExactCoverage } from './inputxml-linear-analysis-result-package-derived-custody.js';
import { inputXmlAnalysisResultPackageFailure as fail } from './inputxml-linear-analysis-result-package-error.js';

export function requirePackageEvaluation(value, solve, preflight, derived) {
  const evaluation = requireInputXmlLinearB31Evaluation(value.codeEvaluation, {
    solvePreparation: solve,
    preflight,
    derivedCases: derived,
  });
  requireExactCoverage(
    derived.map((row) => row.derivedCaseId),
    evaluation.derivedCaseBindings.map((row) => row.derivedCaseId),
    'code-evaluation derived-case binding',
  );
  return evaluation;
}

export function requirePackageManifest(manifest, value, health, solve, preflight) {
  if (manifest.source?.sourceBundleSemanticHash !== health.sourceBundleSemanticHash
    || manifest.source?.modelHealthSemanticHash !== health.semanticHash
    || manifest.preparation?.solvePreparationSemanticHash !== solve.semanticHash
    || manifest.preparation?.preflightSemanticHash !== preflight.semanticHash
    || manifest.preparation?.stiffnessAssessmentHash !== preflight.stiffnessAssessmentHash) fail(
    'InputXML result package evidence manifest is stale.',
    'INPUTXML_RESULT_PACKAGE_MANIFEST_STALE',
  );
  requireExactCoverage(
    value.physicalExecutions.map((row) => row.caseExecutionId),
    manifest.physicalExecutions?.map((row) => row.caseExecutionId) ?? [],
    'manifest execution',
  );
  requireExactCoverage(
    value.recoveredResults.map((row) => row.recoveredCaseId),
    manifest.recoveredResults?.map((row) => row.recoveredCaseId) ?? [],
    'manifest recovery',
  );
  requireExactCoverage(
    value.derivedCases.map((row) => row.derivedCaseId),
    manifest.derivedCases?.map((row) => row.derivedCaseId) ?? [],
    'manifest derived case',
  );
  if (manifest.codeEvaluation?.semanticHash !== value.codeEvaluation.semanticHash
    || manifest.codeEvaluation?.evidenceHash !== value.codeEvaluation.evidenceHash) fail(
    'InputXML result package code-evaluation manifest is stale.',
    'INPUTXML_RESULT_PACKAGE_MANIFEST_STALE',
  );
}
