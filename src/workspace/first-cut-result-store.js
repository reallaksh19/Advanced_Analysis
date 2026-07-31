/**
 * Functionality: Holds the current sealed first-cut package for read-only
 * workspace presenters. It never calculates or mutates engineering results.
 */

import { validateFirstCutCalculationPackage } from '../core/first-cut-load-estimation/index.js';

let calculationPackage = null;
let stale = false;

export const FirstCutResultStore = Object.freeze({
  setPackage(value) {
    const validation = validateFirstCutCalculationPackage(value);
    if (!validation.ok) throw new TypeError(`Invalid first-cut result package: ${validation.errors.join(' ')}`);
    calculationPackage = value;
    stale = false;
    return calculationPackage;
  },
  markStale() { if (calculationPackage) stale = true; },
  clear() { calculationPackage = null; stale = false; },
  isStale() { return stale || calculationPackage?.status === 'STALE'; },
  getPackage() { return calculationPackage; },
  findSupportResult(supportId, loadCaseId) {
    if (!calculationPackage || this.isStale()) return null;
    const rows = calculationPackage.supportScreening?.supportResults
      || calculationPackage.beamScreening?.supportResults || [];
    return rows.find((row) => row.supportId === supportId && row.loadCaseId === loadCaseId)
      || rows.find((row) => row.supportId === supportId) || null;
  },
});
