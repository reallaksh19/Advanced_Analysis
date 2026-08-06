import { requireInputXmlLinearCaseExecution } from './inputxml-linear-case-execution-contract.js';
import { requireInputXmlLinearDerivedCase } from './inputxml-linear-derived-case-contract.js';
import { requireInputXmlLinearRecoveredCase } from './inputxml-linear-recovered-case-contract.js';
import {
  failDuplicate,
  requireExactCoverage,
} from './inputxml-linear-analysis-result-package-derived-custody.js';
import { inputXmlAnalysisResultPackageFailure as fail } from './inputxml-linear-analysis-result-package-error.js';

export function requirePackageCases(value, solve, preflight) {
  const executions = requireExecutions(value.physicalExecutions, solve, preflight);
  const recoveries = requireRecoveries(value.recoveredResults, executions, solve, preflight);
  const derived = requireDerived(value.derivedCases, recoveries);
  return { executions, recoveries, derived };
}

function requireExecutions(rows, solve, preflight) {
  const byCase = new Map();
  for (const row of rows) {
    const accepted = requireInputXmlLinearCaseExecution(row);
    if (byCase.has(accepted.caseId)) failDuplicate(`execution case ${accepted.caseId}`);
    const physical = solve.physicalCases.find((item) => item.caseId === accepted.caseId);
    if (!physical
      || accepted.analysisProfileId !== solve.analysisProfileId
      || accepted.solvePreparationSemanticHash !== solve.semanticHash
      || accepted.preflightSemanticHash !== preflight.semanticHash
      || accepted.stiffnessAssessmentHash !== preflight.stiffnessAssessmentHash
      || accepted.physicalLoadCaseHash !== physical.loadCase.physicalLoadCaseHash) fail(
      `InputXML execution ${accepted.caseId} is stale for the package.`,
      'INPUTXML_RESULT_PACKAGE_EXECUTION_STALE',
    );
    byCase.set(accepted.caseId, accepted);
  }
  requireExactCoverage(solve.physicalCases.map((row) => row.caseId), [...byCase.keys()], 'execution');
  return byCase;
}

function requireRecoveries(rows, executions, solve, preflight) {
  const byCase = new Map();
  for (const row of rows) {
    const accepted = requireInputXmlLinearRecoveredCase(row);
    const caseId = accepted.caseIdentity.caseId;
    if (byCase.has(caseId)) failDuplicate(`recovery case ${caseId}`);
    const execution = executions.get(caseId);
    if (!execution
      || accepted.analysisProfileId !== solve.analysisProfileId
      || accepted.sourceIdentity.solvePreparationSemanticHash !== solve.semanticHash
      || accepted.stiffnessIdentity.preflightSemanticHash !== preflight.semanticHash
      || accepted.executionIdentity.caseExecutionSemanticHash !== execution.semanticHash
      || accepted.executionIdentity.caseExecutionEvidenceHash !== execution.evidenceHash) fail(
      `InputXML recovery ${accepted.recoveredCaseId} is stale for the package.`,
      'INPUTXML_RESULT_PACKAGE_RECOVERY_STALE',
    );
    byCase.set(caseId, accepted);
  }
  requireExactCoverage([...executions.keys()], [...byCase.keys()], 'recovery');
  return [...byCase.values()];
}

function requireDerived(rows, recoveries) {
  const ids = new Set();
  return rows.map((row) => {
    const accepted = requireInputXmlLinearDerivedCase(row, { recoveredCases: recoveries });
    if (ids.has(accepted.derivedCaseId)) failDuplicate(`derived case ${accepted.derivedCaseId}`);
    ids.add(accepted.derivedCaseId);
    return accepted;
  });
}
