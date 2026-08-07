import { semanticHash } from '../core/shared-piping-model/index.js';
import {
  assessMethodConsumptionStaleness,
  commonMethodsForImplementation,
  createCommonInputBoundMethodAuthorization,
  createCommonInputBoundMethodExecution,
} from '../core/non-fea-method-consumption/index.js';
import {
  createNonFeaEngineeringFoundationHandoff,
} from '../core/non-fea-engineering-foundation/index.js';
import { nonFeaCommonInputStore } from './non-fea-common-input-store.js';
import { requireCurrentNonFeaMethods } from './non-fea-common-input-runtime.js';
import { requireCurrentNonFeaImplementationBindings } from './non-fea-analysis-plan-runtime.js';
import {
  buildCurrentNonFeaEngineeringFoundation,
} from './non-fea-engineering-foundation-runtime.js';

export class NonFeaMethodExecutionCoordinator {
  constructor({
    commonInputStore = nonFeaCommonInputStore,
    commonInputProvider = requireCurrentNonFeaMethods,
    implementationBindingProvider = requireCurrentNonFeaImplementationBindings,
    engineeringFoundationProvider = buildCurrentNonFeaEngineeringFoundation,
  } = {}) {
    if (!commonInputStore
        || typeof commonInputStore.getSnapshot !== 'function'
        || typeof commonInputStore.recordConsumptionAuthorization !== 'function'
        || typeof commonInputStore.recordConsumptionExecution !== 'function') {
      throw new TypeError('Non-FEA execution coordinator requires a compatible common-input store.');
    }
    if (typeof commonInputProvider !== 'function') {
      throw new TypeError('Non-FEA execution coordinator requires a common-input provider.');
    }
    if (typeof implementationBindingProvider !== 'function') {
      throw new TypeError('Non-FEA execution coordinator requires an implementation-binding provider.');
    }
    if (typeof engineeringFoundationProvider !== 'function') {
      throw new TypeError('Non-FEA execution coordinator requires an Engineering Foundation provider.');
    }
    this.commonInputStore = commonInputStore;
    this.commonInputProvider = commonInputProvider;
    this.implementationBindingProvider = implementationBindingProvider;
    this.engineeringFoundationProvider = engineeringFoundationProvider;
  }

  prepareAuthorization(input) {
    const implementationId = requiredText(input?.implementationId, 'implementationId');
    const requiredCommonMethodIds = commonMethodsForImplementation(implementationId);
    const commonInput = this.commonInputProvider(requiredCommonMethodIds);
    const implementationBindings = this.implementationBindingProvider(
      implementationId,
      requiredCommonMethodIds,
    );
    const engineeringFoundation = this.engineeringFoundationProvider();
    const engineeringFoundationHandoff = createNonFeaEngineeringFoundationHandoff({
      implementationId,
      commonInput,
      foundation: engineeringFoundation,
    });
    const receipt = createCommonInputBoundMethodAuthorization({
      authorizationId: requiredText(input.authorizationId, 'authorizationId'),
      authorizedAt: requiredText(input.authorizedAt, 'authorizedAt'),
      implementationId,
      scenarioId: requiredText(input.scenarioId, 'scenarioId'),
      methodRequestSemanticHash: requiredText(
        input.methodRequestSemanticHash,
        'methodRequestSemanticHash',
      ),
      analysisPlanSemanticHash: input.analysisPlanSemanticHash || null,
      implementationBindings,
      engineeringFoundationHandoff,
      commonInput,
    });
    return Object.freeze({
      receipt,
      commonInput,
      implementationBindings,
      engineeringFoundation,
      engineeringFoundationHandoff,
    });
  }

  recordAuthorization(receipt) {
    this.commonInputStore.recordConsumptionAuthorization(receipt);
    return receipt;
  }

  requireCurrentAuthorization(input) {
    const authorizationId = requiredText(input?.authorizationId, 'authorizationId');
    const implementationId = requiredText(input?.implementationId, 'implementationId');
    const receipt = this.commonInputStore.getSnapshot().consumptionAuthorizations
      .find((row) => row.authorizationId === authorizationId);
    if (!receipt) {
      throw codedError(
        `No common-input authorization receipt exists for ${authorizationId}.`,
        'COMMON_INPUT_METHOD_AUTHORIZATION_RECEIPT_REQUIRED',
      );
    }
    if (receipt.implementationId !== implementationId) {
      throw codedError(
        `Authorization ${authorizationId} belongs to ${receipt.implementationId}, not ${implementationId}.`,
        'COMMON_INPUT_METHOD_IMPLEMENTATION_MISMATCH',
      );
    }
    const commonInput = this.commonInputProvider(receipt.requiredCommonMethodIds);
    const engineeringFoundation = this.engineeringFoundationProvider();
    const engineeringFoundationHandoff = createNonFeaEngineeringFoundationHandoff({
      implementationId,
      commonInput,
      foundation: engineeringFoundation,
    });
    const freshness = assessMethodConsumptionStaleness(
      receipt,
      commonInput,
      engineeringFoundationHandoff,
    );
    if (freshness.stale) {
      const error = codedError(
        'The Non-FEA implementation authorization is stale against current engineering authority.',
        'COMMON_INPUT_METHOD_AUTHORIZATION_STALE',
      );
      error.details = freshness;
      throw error;
    }
    const implementationBindings = this.implementationBindingProvider(
      implementationId,
      receipt.requiredCommonMethodIds,
    );
    const currentBindingSemanticHash = semanticHash({ implementationId, implementationBindings });
    if (currentBindingSemanticHash !== receipt.implementationBindingSemanticHash) {
      const error = codedError(
        'The selected Non-FEA implementation qualification or registry binding changed after authorization.',
        'COMMON_INPUT_METHOD_IMPLEMENTATION_BINDING_STALE',
      );
      error.details = Object.freeze({
        expected: receipt.implementationBindingSemanticHash,
        actual: currentBindingSemanticHash,
      });
      throw error;
    }
    if (input.analysisPlanSemanticHash
        && receipt.analysisPlanSemanticHash !== input.analysisPlanSemanticHash) {
      throw codedError(
        'The retained authorization belongs to a different analysis plan.',
        'COMMON_INPUT_METHOD_ANALYSIS_PLAN_MISMATCH',
      );
    }
    return Object.freeze({
      receipt,
      commonInput,
      implementationBindings,
      engineeringFoundation,
      engineeringFoundationHandoff,
      freshness,
    });
  }

  recordExecution(input) {
    const current = this.requireCurrentAuthorization({
      authorizationId: input.authorizationId,
      implementationId: input.implementationId,
      analysisPlanSemanticHash: input.analysisPlanSemanticHash || null,
    });
    const receipt = createCommonInputBoundMethodExecution({
      executionId: requiredText(input.executionId, 'executionId'),
      executedAt: requiredText(input.executedAt, 'executedAt'),
      authorization: current.receipt,
      commonInput: current.commonInput,
      engineeringFoundationHandoff: current.engineeringFoundationHandoff,
      engineExecutionSemanticHash: requiredText(
        input.engineExecutionSemanticHash,
        'engineExecutionSemanticHash',
      ),
      resultSemanticHash: input.resultSemanticHash || null,
      status: requiredText(input.status, 'status'),
    });
    this.commonInputStore.recordConsumptionExecution(receipt);
    return receipt;
  }
}

export const nonFeaMethodExecutionCoordinator = new NonFeaMethodExecutionCoordinator();

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}
function codedError(message, code) { const error = new Error(message); error.code = code; return error; }
