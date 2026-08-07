import {
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import {
  createEmpiricalResultOverlay,
} from './empirical-result-overlay.js';

export const EMPIRICAL_RESULT_OVERLAY_STORE_SNAPSHOT_SCHEMA =
  'empirical-result-overlay-store-snapshot/v1';

export class EmpiricalResultOverlayStore {
  #projection = null;
  #state = 'EMPTY';
  #reasonCode = 'EMPIRICAL_EXECUTION_REQUIRED';
  #version = 0;
  #listeners = new Set();

  sync(value = {}) {
    const snapshot = value.snapshot || null;
    const proposal = value.proposal || null;
    const execution = value.execution || null;
    if (snapshot?.state !== 'EXECUTED_CURRENT' || !proposal || !execution) {
      return this.clear(staleReason(snapshot));
    }
    try {
      this.#projection = createEmpiricalResultOverlay({
        snapshot,
        proposal,
        execution,
        displayPolicy: value.displayPolicy,
      });
      this.#state = 'CURRENT';
      this.#reasonCode = null;
      this.#emit();
      return this.getSnapshot();
    } catch (error) {
      this.#projection = null;
      this.#state = 'BLOCKED';
      this.#reasonCode = error?.code || 'EMPIRICAL_RESULT_OVERLAY_BLOCKED';
      this.#emit({
        message: error instanceof Error ? error.message : String(error),
      });
      return this.getSnapshot();
    }
  }

  clear(reasonCode = 'EMPIRICAL_EXECUTION_REQUIRED') {
    const changed = this.#projection !== null
      || this.#state !== 'EMPTY'
      || this.#reasonCode !== reasonCode;
    this.#projection = null;
    this.#state = 'EMPTY';
    this.#reasonCode = reasonCode;
    if (changed) this.#emit();
    return this.getSnapshot();
  }

  getProjection() { return this.#projection; }

  getSnapshot() {
    const base = {
      schema: EMPIRICAL_RESULT_OVERLAY_STORE_SNAPSHOT_SCHEMA,
      version: this.#version,
      state: this.#state,
      reasonCode: this.#reasonCode,
      current: this.#state === 'CURRENT' && Boolean(this.#projection),
      projectionSemanticHash: this.#projection?.semanticHash || null,
      arrowCount: this.#projection?.summary?.arrowCount || 0,
      executionId: this.#projection?.executionId || null,
      scenarioId: this.#projection?.scenarioId || null,
    };
    return deepFreeze({ ...base, semanticHash: semanticHash(base) });
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Empirical result overlay listener must be a function.');
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(details = null) {
    this.#version += 1;
    const payload = deepFreeze({
      snapshot: this.getSnapshot(),
      projection: this.#projection,
      details,
    });
    this.#listeners.forEach((listener) => listener(payload));
  }
}

function staleReason(snapshot) {
  return {
    EXECUTED_STALE: 'EMPIRICAL_RESULTS_STALE',
    AUTHORIZED_STALE: 'EMPIRICAL_AUTHORIZATION_STALE',
    AUTHORIZED_CURRENT: 'EMPIRICAL_EXECUTION_REQUIRED',
    DRAFT_READY: 'EMPIRICAL_AUTHORIZATION_REQUIRED',
    DRAFT_BLOCKED: 'EMPIRICAL_SCENARIO_BLOCKED',
    NOT_CONFIGURED: 'EMPIRICAL_SCENARIO_REQUIRED',
  }[snapshot?.state] || 'EMPIRICAL_EXECUTION_REQUIRED';
}

export const empiricalResultOverlayStore = new EmpiricalResultOverlayStore();
