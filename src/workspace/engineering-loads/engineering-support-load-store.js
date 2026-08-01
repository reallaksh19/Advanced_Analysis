import { freezeDeep } from '../dataset-utils.js';
import { calculateSupportLoadDistribution } from './support-load-distribution-v3.js';

/** Owns the last explicit engineering calculation and its edit freshness. */
export class EngineeringSupportLoadStore {
  #distribution = null;

  calculate(input) {
    this.#distribution = calculateSupportLoadDistribution(input);
    return this.#distribution;
  }

  markStale(reason, datasetVersion) {
    if (!this.#distribution) return null;
    this.#distribution = freezeDeep({
      ...this.#distribution,
      freshness: { status: 'STALE', reason, datasetVersion },
    });
    return this.#distribution;
  }

  getDistribution() { return this.#distribution; }
  clear() { this.#distribution = null; }
}

export const engineeringSupportLoadStore = new EngineeringSupportLoadStore();
