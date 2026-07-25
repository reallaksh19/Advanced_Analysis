import { modelError, numericalError } from './errors.js';
export function canonicalNumber(value, path = 'calculation') {
  if (!Number.isFinite(value)) throw numericalError('NON_FINITE_CALCULATION', path, `${path} is non-finite.`);
  return Object.is(value, -0) ? 0 : value;
}
export function finiteNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw modelError('FINITE_NUMBER_REQUIRED', path, `${path} must be a finite number.`);
  }
  return Object.is(value, -0) ? 0 : value;
}
export function positiveNumber(value, path) {
  const number = finiteNumber(value, path);
  if (number <= 0) throw modelError('POSITIVE_NUMBER_REQUIRED', path, `${path} must be greater than zero.`);
  return number;
}
export function nonNegativeNumber(value, path) {
  const number = finiteNumber(value, path);
  if (number < 0) throw modelError('NON_NEGATIVE_NUMBER_REQUIRED', path, `${path} must be zero or greater.`);
  return number;
}
export function toleranceFor(profile, quantity, ...values) {
  const rule = profile.tolerances[quantity];
  const scale = Math.max(1, ...values.map((value) => Math.abs(value)));
  return canonicalNumber(rule.absolute + rule.relative * scale, `tolerance.${quantity}`);
}
export function withinTolerance(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}
