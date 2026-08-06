import {
  INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_REQUEST_SCHEMA,
  packageInputXmlLinearAnalysisResults,
} from '../index.js';
import { evaluation } from './inputxml-analysis-result-package-code.js';
import { derived } from './inputxml-analysis-result-package-derived.js';
import {
  context, executions, preflight, recovered, runtime, solve,
} from './inputxml-analysis-result-package-source.js';

export function request(overrides = {}) {
  return {
    schema: INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_REQUEST_SCHEMA,
    packageId: 'IXRP-MHPR10', modelHealth: context.report,
    solvePreparation: solve, preflight, physicalExecutions: executions,
    recoveredResults: recovered, derivedCases: derived, codeEvaluation: evaluation,
    ...overrides,
  };
}

export const packageResult = packageInputXmlLinearAnalysisResults(request());
export { context, derived, evaluation, executions, preflight, recovered, runtime, solve };
