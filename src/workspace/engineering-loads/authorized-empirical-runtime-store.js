import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { requireAuthorizedEmpiricalLoadExecution } from './authorized-empirical-load-execution.js';
import {
  compareAuthorizedEmpiricalRuntimeBindings,
  requireAuthorizedEmpiricalRuntimePackage,
} from './authorized-empirical-runtime-package.js';

export const EMPIRICAL_AUTHORIZATION_STATES = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  BLOCKED_NOT_READY: 'BLOCKED_NOT_READY',
  AWAITING_AUTHORIZATION: 'AWAITING_AUTHORIZATION',
  AUTHORIZED_CURRENT: 'AUTHORIZED_CURRENT',
  AUTHORIZED_STALE: 'AUTHORIZED_STALE',
  EXECUTED_CURRENT: 'EXECUTED_CURRENT',
  EXECUTED_STALE: 'EXECUTED_STALE',
});

/** Retains already-created authorization evidence without creating authority. */
export class AuthorizedEmpiricalRuntimeStore {
  #runtimePackage = null;
  #execution = null;
  #snapshot = snapshot('NOT_CONFIGURED', false, 'NO_ACTIVE_DATASET', [], null, null);

  configure(runtimePackage, currentBindings) {
    this.#runtimePackage = requireAuthorizedEmpiricalRuntimePackage(runtimePackage);
    this.#execution = null;
    return this.refresh(currentBindings);
  }

  refresh(currentBindings) {
    if (!this.#runtimePackage) {
      this.#snapshot = currentBindings
        ? snapshot('AWAITING_AUTHORIZATION', false, 'EMPIRICAL_PACKAGE_REQUIRED', [], null, null)
        : snapshot('NOT_CONFIGURED', false, 'NO_ACTIVE_DATASET', [], null, null);
      return this.#snapshot;
    }
    if (!currentBindings) {
      return this.#setStale('NO_ACTIVE_DATASET', [{ code: 'EMPIRICAL_RUNTIME_ACTIVE_BINDINGS_MISSING' }]);
    }
    const mismatches = compareAuthorizedEmpiricalRuntimeBindings(
      this.#runtimePackage.bindings,
      currentBindings,
    );
    if (mismatches.length > 0) return this.#setStale('AUTHORIZATION_BINDINGS_CHANGED', mismatches);
    const state = this.#execution ? 'EXECUTED_CURRENT' : 'AUTHORIZED_CURRENT';
    this.#snapshot = snapshot(state, true, null, [], this.#runtimePackage, this.#execution);
    return this.#snapshot;
  }

  markStale(reason, details = []) {
    if (!this.#runtimePackage) {
      this.#snapshot = snapshot('AWAITING_AUTHORIZATION', false, reason, normalizeDetails(details), null, null);
      return this.#snapshot;
    }
    return this.#setStale(reason, normalizeDetails(details));
  }

  markBlockedNotReady(reason, details = []) {
    this.#snapshot = snapshot('BLOCKED_NOT_READY', false, reason, normalizeDetails(details), this.#runtimePackage, this.#execution);
    return this.#snapshot;
  }

  recordExecution(value) {
    const execution = requireAuthorizedEmpiricalLoadExecution(value);
    const runtimePackage = this.requireCurrentPackage();
    const mismatches = [];
    compare('executionId', runtimePackage.executionId, execution.executionId, mismatches);
    compare('executedAt', runtimePackage.executedAt, execution.executedAt, mismatches);
    compare('projectId', runtimePackage.bindings.projectId, execution.projectId, mismatches);
    compare('datasetId', runtimePackage.bindings.datasetId, execution.datasetId, mismatches);
    compare('datasetVersion', runtimePackage.bindings.datasetVersion, execution.datasetVersion, mismatches);
    compare('authorizedInputSemanticHash', runtimePackage.authorizedInput.semanticHash, execution.authorizedInputSemanticHash, mismatches);
    compare('baselineSemanticHash', runtimePackage.authorizedInput.baselineSemanticHash, execution.baselineSemanticHash, mismatches);
    compare('handoffSemanticHash', runtimePackage.authorizedInput.handoffSemanticHash, execution.handoffSemanticHash, mismatches);
    compare('projectionPayloadSemanticHash', runtimePackage.authorizedInput.projectionPayloadSemanticHash, execution.projectionPayloadSemanticHash, mismatches);
    if (mismatches.length > 0) {
      fail('Authorized empirical execution does not match the configured package.', 'EMPIRICAL_RUNTIME_EXECUTION_BINDING_MISMATCH', mismatches);
    }
    this.#execution = execution;
    this.#snapshot = snapshot('EXECUTED_CURRENT', true, null, [], runtimePackage, execution);
    return execution;
  }

  requireCurrentPackage() {
    if (!this.#runtimePackage || !this.#snapshot.calculationEligible) {
      fail(
        this.#snapshot.reasonCode || 'A current authorized empirical package is required.',
        'EMPIRICAL_RUNTIME_NOT_CALCULATION_ELIGIBLE',
        { state: this.#snapshot.state, reasonCode: this.#snapshot.reasonCode, details: this.#snapshot.details },
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
    this.#snapshot = snapshot('NOT_CONFIGURED', false, 'NO_ACTIVE_DATASET', [], null, null);
  }

  #setStale(reason, details) {
    const state = this.#execution ? 'EXECUTED_STALE' : 'AUTHORIZED_STALE';
    this.#snapshot = snapshot(state, false, reason, details, this.#runtimePackage, this.#execution);
    return this.#snapshot;
  }
}

function snapshot(state, calculationEligible, reasonCode, details, runtimePackage, execution) {
  const freshness = stateFreshness(state, runtimePackage, execution);
  return deepFreeze({
    state,
    calculationEligible,
    reasonCode,
    details,
    authorizationStatus: freshness.authorizationStatus,
    authorizationFreshness: freshness.authorizationFreshness,
    executionStatus: freshness.executionStatus,
    executionFreshness: freshness.executionFreshness,
    packageId: runtimePackage?.packageId || null,
    packageSemanticHash: runtimePackage?.semanticHash || null,
    authorizedInputSemanticHash: runtimePackage?.authorizedInput?.semanticHash || null,
    executionId: execution?.executionId || null,
    executionSemanticHash: execution?.semanticHash || null,
  });
}

function stateFreshness(state, runtimePackage, execution) {
  if (state === 'NOT_CONFIGURED') return {
    authorizationStatus: 'NOT_CONFIGURED', authorizationFreshness: 'NOT_APPLICABLE',
    executionStatus: 'NOT_EXECUTED', executionFreshness: 'NOT_APPLICABLE',
  };
  if (state === 'AWAITING_AUTHORIZATION') return {
    authorizationStatus: 'AWAITING_AUTHORIZATION', authorizationFreshness: 'NOT_APPLICABLE',
    executionStatus: 'NOT_EXECUTED', executionFreshness: 'NOT_APPLICABLE',
  };
  const current = state === 'AUTHORIZED_CURRENT' || state === 'EXECUTED_CURRENT';
  return {
    authorizationStatus: runtimePackage ? 'AUTHORIZED' : 'NOT_CONFIGURED',
    authorizationFreshness: runtimePackage ? (current ? 'CURRENT' : 'STALE') : 'NOT_APPLICABLE',
    executionStatus: execution ? 'EXECUTED' : 'NOT_EXECUTED',
    executionFreshness: execution ? (current ? 'CURRENT' : 'STALE') : 'NOT_APPLICABLE',
  };
}

function normalizeDetails(value) {
  if (!Array.isArray(value)) return [{ code: String(value) }];
  return value.map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? { ...row } : { code: String(row) }));
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

export const authorizedEmpiricalRuntimeStore = new AuthorizedEmpiricalRuntimeStore();
