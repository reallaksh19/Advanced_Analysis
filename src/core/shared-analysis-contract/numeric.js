import { SharedAnalysisContractError } from './errors.js';

/**
 * Numeric guards for the shared contract tier.
 *
 * These mirror the guards `src/core/local-shell/numeric.js` applies inside the
 * shell kernel. They are repeated here rather than imported so that a shared
 * contract rejection carries `SharedAnalysisContractError`, not a shell error:
 * a load set is rejected by the contract, not by a kernel that never saw it.
 * No arithmetic is duplicated — only type refusal.
 */

export function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SharedAnalysisContractError(`${label} must be a finite number without coercion`, 'NON_FINITE_VALUE');
  }
  return normalizeZero(value);
}

export function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (!(number > 0)) {
    throw new SharedAnalysisContractError(`${label} must be greater than zero`, 'NON_POSITIVE_VALUE');
  }
  return number;
}

export function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

export function cleanNumber(value) {
  if (!Number.isFinite(value)) {
    throw new SharedAnalysisContractError('Calculated a non-finite number', 'NON_FINITE_RESULT');
  }
  return normalizeZero(value);
}
