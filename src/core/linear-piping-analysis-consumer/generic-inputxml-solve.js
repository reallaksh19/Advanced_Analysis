/**
 * Legacy raw-InputXML solve entry point retained as a fail-closed compatibility
 * boundary. Raw XML may no longer be parsed and solved through this function.
 */
export function solveInputXmlGeneric() {
  const error = new Error(
    'Raw InputXML solve is disabled. Diagnose, prepare, authorize, then call solveInputXmlLinearAnalysis().',
  );
  error.name = 'InputXmlLinearSolveAuthorizationRequiredError';
  error.code = 'PREFEA_SOLVE_AUTHORIZATION_REQUIRED';
  error.data = Object.freeze({
    requiredSequence: Object.freeze([
      'diagnoseInputXmlLinearPreFea',
      'prepareInputXmlLinearPreFea',
      'authorizeInputXmlLinearSolve',
      'solveInputXmlLinearAnalysis',
    ]),
    solverRuntimeCreated: false,
    rawSourceParsed: false,
  });
  throw error;
}
