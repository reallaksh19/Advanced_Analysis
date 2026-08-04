import { freezeDeep } from '../dataset-utils.js';
import { calculateAuthorizedEmpiricalLoadExecution } from './authorized-empirical-load-execution.js';
import { calculateSupportLoadDistribution } from './support-load-distribution-v3.js';

/** Owns the last explicit engineering calculation and its edit freshness. */
export class EngineeringSupportLoadStore {
  #distribution = null;
  #authorizedExecution = null;

  /** @deprecated Ordinary production callers shall use calculateAuthorized(). */
  calculate(input) {
    this.#authorizedExecution = null;
    this.#distribution = calculateSupportLoadDistribution(input);
    return this.#distribution;
  }

  calculateAuthorized(input) {
    const execution = calculateAuthorizedEmpiricalLoadExecution(input);
    this.#authorizedExecution = execution;
    this.#distribution = execution.distribution;
    return execution;
  }

  markStale(reason, datasetVersion) {
    if (!this.#distribution) return null;
    // The active store clears its current receipt; the separate runtime store
    // retains immutable historical receipt evidence and stale authorization state.
    this.#authorizedExecution = null;
    this.#distribution = freezeDeep({
      ...this.#distribution,
      freshness: { status: 'STALE', reason, datasetVersion },
    });
    return this.#distribution;
  }

  getDistribution() { return this.#distribution; }
  getAuthorizedExecution() { return this.#authorizedExecution; }
  clear() { this.#distribution = null; this.#authorizedExecution = null; }
}

export const engineeringSupportLoadStore = new EngineeringSupportLoadStore();
