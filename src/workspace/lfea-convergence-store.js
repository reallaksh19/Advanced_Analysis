/**
 * Immutable state for importing and interpreting a convergence study.
 */
import { buildConvergenceStudy } from './lfea-convergence-model.js';

export function createLfeaConvergenceStore() {
  let state = freeze({
    status: 'EMPTY',
    source: null,
    evidence: null,
    diagnostics: [],
  });
  const listeners = new Set();

  function publish(next) {
    state = freeze(next);
    listeners.forEach((listener) => listener(state));
    return state;
  }

  function importStudy(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fail(new TypeError('Convergence study must be a JSON object.'));
    }
    return publish({
      status: 'READY',
      source: structuredClone(value),
      evidence: null,
      diagnostics: [],
    });
  }

  function run() {
    if (!state.source) {
      return fail(new TypeError('Import a convergence study before running.'));
    }
    try {
      const evidence = buildConvergenceStudy(state.source);
      return publish({
        ...state,
        status: 'QUALIFIED',
        evidence,
        diagnostics: evidence.interpretation.diagnostics ?? [],
      });
    } catch (error) {
      return fail(error);
    }
  }

  function fail(error) {
    return publish({
      ...state,
      status: 'FAILED',
      evidence: null,
      diagnostics: [{
        severity: 'ERROR',
        code: error?.code ?? 'LFEA_CONVERGENCE_REJECTED',
        message: error instanceof Error
          ? error.message
          : 'Unknown convergence failure.',
      }],
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Convergence subscriber must be a function.');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    importStudy,
    run,
    subscribe,
    getState: () => state,
    destroy: () => listeners.clear(),
  });
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
