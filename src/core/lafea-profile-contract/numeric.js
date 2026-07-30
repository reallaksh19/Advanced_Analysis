import { LafeaProfileContractError } from './errors.js';
import { finiteNumber, positiveNumber } from '../shared-analysis-contract/numeric.js';

export { finiteNumber, positiveNumber };

export function integerAtLeast(value, minimum, label) {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number < minimum) {
    throw new LafeaProfileContractError(`${label} must be an integer of at least ${minimum}`, 'INVALID_INTEGER_BOUND');
  }
  return number;
}

export function boundedNumber(value, { exclusiveMinimum, maximum } = {}, label) {
  const number = finiteNumber(value, label);
  if (exclusiveMinimum !== undefined && !(number > exclusiveMinimum)) {
    throw new LafeaProfileContractError(`${label} must exceed ${exclusiveMinimum}`, 'INVALID_NUMERIC_BOUND');
  }
  if (maximum !== undefined && !(number <= maximum)) {
    throw new LafeaProfileContractError(`${label} must not exceed ${maximum}`, 'INVALID_NUMERIC_BOUND');
  }
  return number;
}
