export const AUTHORIZED_ENRICHMENT_WORKSPACE_API_METHODS = Object.freeze([
  'executeAuthorizedEmpiricalLoads',
  'downloadAuthorizedEnrichedStagedJson',
]);

export function createAuthorizedEnrichmentWorkspaceApi({
  documentRef,
  controller,
  onEmpiricalChanged,
  onEmpiricalFailed,
}) {
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw codedTypeError(
      'A document is required for the authorized enrichment workspace API.',
      'AUTHORIZED_ENRICHMENT_WORKSPACE_DOCUMENT_INVALID',
    );
  }
  if (!controller || typeof controller.executeEmpirical !== 'function') {
    throw codedTypeError(
      'An authorized empirical consumer controller is required.',
      'AUTHORIZED_ENRICHMENT_WORKSPACE_CONTROLLER_INVALID',
    );
  }
  if (typeof controller.downloadStagedJson !== 'function') {
    throw codedTypeError(
      'An authorized stagedJson consumer controller is required.',
      'AUTHORIZED_ENRICHMENT_WORKSPACE_CONTROLLER_INVALID',
    );
  }
  requireCallback(onEmpiricalChanged, 'onEmpiricalChanged');
  requireCallback(onEmpiricalFailed, 'onEmpiricalFailed');

  return Object.freeze({
    executeAuthorizedEmpiricalLoads(request) {
      let result;
      try {
        result = controller.executeEmpirical(request);
      } catch (error) {
        onEmpiricalFailed(error);
        throw error;
      }
      onEmpiricalChanged(result);
      return result;
    },
    downloadAuthorizedEnrichedStagedJson(request, runtime) {
      return controller.downloadStagedJson(request, documentRef, runtime);
    },
  });
}

function requireCallback(value, label) {
  if (typeof value !== 'function') {
    throw codedTypeError(
      `${label} must be a function.`,
      'AUTHORIZED_ENRICHMENT_WORKSPACE_CALLBACK_INVALID',
    );
  }
}

function codedTypeError(message, code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
