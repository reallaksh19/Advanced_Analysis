export const AUTHORIZED_ENRICHMENT_WORKSPACE_API_METHODS = Object.freeze([
  'configureAuthorizedEmpiricalLoads',
  'executeAuthorizedEmpiricalLoads',
  'getAuthorizedEmpiricalLoadState',
  'downloadAuthorizedEnrichedStagedJson',
]);

export function createAuthorizedEnrichmentWorkspaceApi({
  documentRef,
  controller,
  onEmpiricalAuthorizationChanged = () => {},
  onEmpiricalChanged,
  onEmpiricalFailed,
}) {
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw codedTypeError(
      'A document is required for the authorized enrichment workspace API.',
      'AUTHORIZED_ENRICHMENT_WORKSPACE_DOCUMENT_INVALID',
    );
  }
  if (!controller
      || typeof controller.configureEmpirical !== 'function'
      || typeof controller.executeEmpirical !== 'function'
      || typeof controller.getEmpiricalAuthorizationState !== 'function') {
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
  requireCallback(onEmpiricalAuthorizationChanged, 'onEmpiricalAuthorizationChanged');
  requireCallback(onEmpiricalChanged, 'onEmpiricalChanged');
  requireCallback(onEmpiricalFailed, 'onEmpiricalFailed');

  function configure(request) {
    let state;
    try {
      state = controller.configureEmpirical(request);
    } catch (error) {
      onEmpiricalFailed(error);
      throw error;
    }
    onEmpiricalAuthorizationChanged(state);
    return state;
  }

  return Object.freeze({
    configureAuthorizedEmpiricalLoads(request) {
      return configure(request);
    },
    executeAuthorizedEmpiricalLoads(request = undefined) {
      if (request !== undefined) configure(request);
      let result;
      try {
        result = controller.executeEmpirical();
      } catch (error) {
        onEmpiricalFailed(error);
        throw error;
      }
      onEmpiricalChanged(result);
      onEmpiricalAuthorizationChanged(controller.getEmpiricalAuthorizationState());
      return result;
    },
    getAuthorizedEmpiricalLoadState() {
      return controller.getEmpiricalAuthorizationState();
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
