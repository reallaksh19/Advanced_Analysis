import { requireInputXmlLinearPreFeaPreparation } from './inputxml-linear-prefea-preparation.js';
import { requireInputXmlLinearSolveAuthorization } from './inputxml-linear-solve-authorization.js';
import { fail, uniqueAscii } from './inputxml-linear-prefea-contract.js';

/**
 * Authorization-only public solve gateway.
 *
 * This work package intentionally does not select or activate a default runtime.
 * A downstream activation PR must pass the production executor explicitly after
 * this function has validated the complete sealed parent chain.
 */
export function solveInputXmlLinearAnalysis(preparation, authorization, runtimeOptions) {
  const options = runtimeOptions ?? {};
  const acceptedPreparation = requireInputXmlLinearPreFeaPreparation(preparation);
  const requestedCaseIds = uniqueAscii(
    options.requestedCaseIds ?? acceptedPreparation.requestedCaseIds,
  );
  const acceptedAuthorization = requireInputXmlLinearSolveAuthorization(
    authorization,
    acceptedPreparation,
    requestedCaseIds,
  );
  if (acceptedPreparation.status === 'BLOCK') {
    fail('PREFEA_BLOCK_OVERRIDE_PROHIBITED', 'BLOCK preparation cannot create solver runtime.');
  }
  if (acceptedPreparation.status === 'WARN' && acceptedAuthorization.approverIdentity === 'SYSTEM_POLICY') {
    fail('PREFEA_WARN_REQUIRES_EXPLICIT_APPROVER', 'WARN requires explicit conditional authorization.');
  }
  const executeAuthorizedCases = options.executeAuthorizedCases;
  if (typeof executeAuthorizedCases !== 'function') {
    fail('PREFEA_RUNTIME_EXECUTOR_NOT_CONFIGURED',
      'No production runtime executor is configured; public-default activation is deferred.', {
        requestedCaseIds,
      });
  }
  const casesById = new Map(acceptedPreparation.authorizedCaseCandidates
    .map((row) => [row.caseId, row]));
  const selectedCases = requestedCaseIds.map((caseId) => {
    const row = casesById.get(caseId);
    if (row === undefined) {
      fail('PREFEA_AUTHORIZED_CASE_RECORD_MISSING', `Prepared case ${caseId} is missing.`, { caseId });
    }
    return row;
  });
  // Runtime creation is deliberately below every source, parent, case, warning,
  // status, staleness and tamper check above.
  return executeAuthorizedCases({
    preparation: acceptedPreparation,
    authorization: acceptedAuthorization,
    requestedCaseIds,
    selectedCases: Object.freeze(selectedCases),
  });
}
