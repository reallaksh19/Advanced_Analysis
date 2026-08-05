import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  requireAuthorizedEmpiricalLoadExecutionV2,
} from './authorized-empirical-load-execution-v2.js';
import {
  requireAuthorizedEmpiricalRuntimePackageV2,
} from './authorized-empirical-runtime-package-v2.js';
import {
  EMPIRICAL_AUTHORIZATION_STATES,
} from './authorized-empirical-runtime-store.js';
import {
  compareAuthorizedEmpiricalRuntimeBindings,
} from './authorized-empirical-runtime-package.js';

/** Retains explicit method-bound authorization without altering the V1 store. */
export class AuthorizedEmpiricalRuntimeStoreV2 {
  #runtimePackage = null;
  #execution = null;
  #snapshot = snapshot(
    EMPIRICAL_AUTHORIZATION_STATES.NOT_CONFIGURED,
    false,
    'NO_ACTIVE_DATASET',
    [],
    null,
    null,
  );

  configure(runtimePackage, currentBindings) {
    this.#runtimePackage = requireAuthorizedEmpiricalRuntimePackageV2(runtimePackage);
    this.#execution = null;
    return this.refresh(currentBindings);
  }

  refresh(currentBindings) {
    if (!this.#runtimePackage) {
      this.#snapshot = currentBindings
        ? snapshot(
          EMPIRICAL_AUTHORIZATION_STATES.AWAITING_AUTHORIZATION,
          false,
          'EMPIRICAL_PACKAGE_V2_REQUIRED',
          [],
          null,
          null,
        )
        : snapshot(
          EMPIRICAL_AUTHORIZATION_STATES.NOT_CONFIGURED,
          false,
          'NO_ACTIVE_DATASET',
          [],
          null,
          null,
        );
      return this.#snapshot;
    }
    if (!currentBindings) {
      return this.#setStale('NO_ACTIVE_DATASET', [{
        code: 'EMPIRICAL_RUNTIME_V2_ACTIVE_BINDINGS_MISSING',
      }]);
    }
    const mismatches = compareAuthorizedEmpiricalRuntimeBindings(
      this.#runtimePackage.bindings,
      currentBindings,
    );
    if (mismatches.length > 0) {
      return this.#setStale('AUTHORIZATION_BINDINGS_CHANGED', mismatches);
    }
    const state = this.#execution
      ? EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_CURRENT
      : EMPIRICAL_AUTHORIZATION_STATES.AUTHORIZED_CURRENT;
    this.#snapshot = snapshot(
      state,
      true,
      null,
      [],
      this.#runtimePackage,
      this.#execution,
    );
    return this.#snapshot;
  }

  markStale(reason, details = []) {
    if (!this.#runtimePackage) {
      this.#snapshot = snapshot(
        EMPIRICAL_AUTHORIZATION_STATES.AWAITING_AUTHORIZATION,
        false,
        reason,
        normalizeDetails(details),
        null,
        null,
      );
      return this.#snapshot;
    }
    return this.#setStale(reason, normalizeDetails(details));
  }

  markBlockedNotReady(reason, details = []) {
    this.#snapshot = snapshot(
      EMPIRICAL_AUTHORIZATION_STATES.BLOCKED_NOT_READY,
      false,
      reason,
      normalizeDetails(details),
      this.#runtimePackage,
      this.#execution,
    );
    return this.#snapshot;
  }

  recordExecution(value) {
    const execution = requireAuthorizedEmpiricalLoadExecutionV2(value);
    const runtimePackage = this.requireCurrentPackage();
    const mismatches = [];
    compare('executionId', runtimePackage.executionId, execution.executionId, mismatches);
    compare('executedAt', runtimePackage.executedAt, execution.executedAt, mismatches);
    compare('method', runtimePackage.method, execution.requestedMethod, mismatches);
    compare('executedMethod', runtimePackage.method, execution.executedMethod, mismatches);
    compare('projectId', runtimePackage.bindings.projectId, execution.projectId, mismatches);
    compare('datasetId', runtimePackage.bindings.datasetId, execution.datasetId, mismatches);
    compare(
      'datasetVersion',
      runtimePackage.bindings.datasetVersion,
      execution.datasetVersion,
      mismatches,
    );
    compare(
      'authorizedInputSemanticHash',
      runtimePackage.authorizedInput.semanticHash,
      execution.authorizedInputSemanticHash,
      mismatches,
    );
    compare(
      'baselineSemanticHash',
      runtimePackage.authorizedInput.baselineSemanticHash,
      execution.baselineSemanticHash,
      mismatches,
    );
    compare(
      'handoffSemanticHash',
      runtimePackage.authorizedInput.handoffSemanticHash,
      execution.handoffSemanticHash,
      mismatches,
    );
    compare(
      'projectionPayloadSemanticHash',
      runtimePackage.authorizedInput.projectionPayloadSemanticHash,
      execution.projectionPayloadSemanticHash,
      mismatches,
    );
    if (mismatches.length > 0) {
      fail(
        'Authorized empirical V2 execution does not match the configured package.',
        'EMPIRICAL_RUNTIME_V2_EXECUTION_BINDING_MISMATCH',
        mismatches,
      );
    }
    this.#execution = execution;
    this.#snapshot = snapshot(
      EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_CURRENT,
      true,
      null,
      [],
      runtimePackage,
      execution,
    );
    return execution;
  }

  requireCurrentPackage() {
    if (!this.#runtimePackage || !this.#snapshot.calculationEligible) {
      fail(
        this.#snapshot.reasonCode || 'A current authorized empirical V2 package is required.',
        'EMPIRICAL_RUNTIME_V2_NOT_CALCULATION_ELIGIBLE',
        {
          state: this.#snapshot.state,
          reasonCode: this.#snapshot.reasonCode,
          details: this.#snapshot.details,
        },
      );
    }
    return this.#runtimePackage;
  }

  getSnapshot() { return this.#snapshot; }
  getPackage() { return this.#runtimePackage; }
  getExecution() { return this.#execution; }

  clear() {
    this.#runtimePackage = null;
    this.#execution = null;
    this.#snapshot = snapshot(
      EMPIRICAL_AUTHORIZATION_STATES.NOT_CONFIGURED,
      false,
      'NO_ACTIVE_DATASET',
      [],
      null,
      null,
    );
  }

  #setStale(reason, details) {
    const state = this.#execution
      ? EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_STALE
      : EMPIRICAL_AUTHORIZATION_STATES.AUTHORIZED_STALE;
    this.#snapshot = snapshot(
      state,
      false,
      reason,
      details,
      this.#runtimePackage,
      this.#execution,
    );
    return this.#snapshot;
  }
}

function snapshot(state, calculationEligible, reasonCode, details, runtimePackage, execution) {
  const current = state === EMPIRICAL_AUTHORIZATION_STATES.AUTHORIZED_CURRENT
    || state === EMPIRICAL_AUTHORIZATION_STATES.EXECUTED_CURRENT;
  const configured = Boolean(runtimePackage);
  const executed = Boolean(execution);
  return deepFreeze({
    schema: 'authorized-empirical-runtime-state/v2',
    state,
    calculationEligible,
    reasonCode,
    details,
    method: runtimePackage?.method || null,
    authorizationStatus: configured ? 'AUTHORIZED' : (
      state === EMPIRICAL_AUTHORIZATION_STATES.AWAITING_AUTHORIZATION
        ? 'AWAITING_AUTHORIZATION'
        : 'NOT_CONFIGURED'
    ),
    authorizationFreshness: configured
      ? (current ? 'CURRENT' : 'STALE')
      : 'NOT_APPLICABLE',
    executionStatus: executed ? 'EXECUTED' : 'NOT_EXECUTED',
    executionFreshness: executed
      ? (current ? 'CURRENT' : 'STALE')
      : 'NOT_APPLICABLE',
    packageId: runtimePackage?.packageId || null,
    packageSemanticHash: runtimePackage?.semanticHash || null,
    authorizedInputSemanticHash: runtimePackage?.authorizedInput?.semanticHash || null,
    executionId: execution?.executionId || null,
    executionSemanticHash: execution?.semanticHash || null,
    requestedMethod: execution?.requestedMethod || runtimePackage?.method || null,
    executedMethod: execution?.executedMethod || null,
  });
}

function normalizeDetails(value) {
  if (!Array.isArray(value)) return [{ code: String(value) }];
  return value.map((row) => (
    row && typeof row === 'object' && !Array.isArray(row)
      ? { ...row }
      : { code: String(row) }
  ));
}

function compare(field, expected, actual, mismatches) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    mismatches.push({ field, expected, actual });
  }
}

function fail(message, code, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details === null ? null : deepFreeze(details);
  throw error;
}

export const authorizedEmpiricalRuntimeStoreV2 =
  new AuthorizedEmpiricalRuntimeStoreV2();
