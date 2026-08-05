import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { configuredEmpiricalMethodControllerV2 } from '../engineering-loads/configured-empirical-method-controller-v2.js';
import { requireAuthorizedEmpiricalRuntimePackageV2 } from '../engineering-loads/authorized-empirical-runtime-package-v2.js';
import { masterDataController } from '../master-data-controller.js';

export const AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_REQUEST_SCHEMA =
  'authorized-empirical-method-consumer-request/v1';

/** Explicit method-bound consumer; it is not wired into the ordinary UI/bootstrap. */
export class AuthorizedEmpiricalMethodConsumerControllerV2 {
  constructor({
    configuredController = configuredEmpiricalMethodControllerV2,
    masters = masterDataController,
  } = {}) {
    requireFunction(configuredController, 'configure');
    requireFunction(configuredController, 'execute');
    requireFunction(configuredController, 'refresh');
    requireFunction(configuredController, 'getState');
    requireFunction(configuredController, 'markStale');
    requireFunction(configuredController, 'clear');
    requireFunction(masters, 'getMasterData');
    this.configuredController = configuredController;
    this.masters = masters;
  }

  configure(request) {
    exact(request, ['schema', 'runtimePackage'], 'request');
    if (request.schema !== AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_REQUEST_SCHEMA) {
      fail(
        'Unsupported authorized empirical method consumer request.',
        'AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_SCHEMA_INVALID',
      );
    }
    const runtimePackage = requireAuthorizedEmpiricalRuntimePackageV2(
      request.runtimePackage,
    );
    return this.configuredController.configure(
      runtimePackage,
      this.masters.getMasterData(),
    );
  }

  execute() {
    return this.configuredController.execute(this.masters.getMasterData());
  }

  refresh() {
    return this.configuredController.refresh(this.masters.getMasterData());
  }

  getState() { return this.configuredController.getState(); }

  markStale(reason, datasetVersion = null) {
    return this.configuredController.markStale(reason, datasetVersion);
  }

  clear() { this.configuredController.clear(); }
}

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(
      `${label} must be an object.`,
      'AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_TYPE_INVALID',
    );
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${label} contains unexpected or missing keys.`,
      'AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_KEYS_INVALID',
      { actual, expected },
    );
  }
}

function requireFunction(value, name) {
  if (!value || typeof value[name] !== 'function') {
    fail(
      `Authorized empirical method consumer dependency must expose ${name}().`,
      'AUTHORIZED_EMPIRICAL_METHOD_CONSUMER_DEPENDENCY_INVALID',
      { name },
    );
  }
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, code, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details === null ? null : deepFreeze(details);
  throw error;
}

export const authorizedEmpiricalMethodConsumerControllerV2 =
  new AuthorizedEmpiricalMethodConsumerControllerV2();
