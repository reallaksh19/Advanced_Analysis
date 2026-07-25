import { ShellModelError } from './errors.js';

export function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ShellModelError(`${label} must be a finite number without coercion`);
  }
  return normalizeZero(value);
}

export function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (!(number > 0)) throw new ShellModelError(`${label} must be greater than zero`);
  return number;
}

export function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

export function cleanNumber(value) {
  if (!Number.isFinite(value)) throw new Error('Calculated non-finite number');
  return normalizeZero(value);
}

export function tolerance(rule, scale) {
  return cleanNumber(rule.absolute + rule.relative * Math.abs(scale));
}

export function qualification(actual, scale, rule) {
  const limit = tolerance(rule, scale);
  return Object.freeze({
    actual: cleanNumber(actual),
    scale: cleanNumber(scale),
    tolerance: limit,
    accepted: actual <= limit,
  });
}

export function minimumQualification(actual, scale, rule) {
  return Object.freeze({
    actual: cleanNumber(actual),
    scale: cleanNumber(scale),
    minimum: cleanNumber(rule.minimum),
    accepted: actual >= rule.minimum,
  });
}

export function maxAbs(values) {
  let result = 0;
  for (const value of values.flat(Infinity)) result = Math.max(result, Math.abs(value));
  return cleanNumber(result);
}

export function sum(values) {
  let result = 0;
  for (const value of values) result += value;
  return cleanNumber(result);
}
