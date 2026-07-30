import {
  EXACT_MATCH_TEMPERATURE_POLICY,
  LINEAR_BRACKET_TEMPERATURE_POLICY,
  fail,
  requireFinite,
} from './code-engine-contract.js';

/**
 * Section 10.5 temperature resolution: the *method* is generic and declared
 * (exact match, or a linear bracket between two declared points); the
 * underlying allowable values always come from `dataset.allowablePoints`,
 * never from a value embedded in this module. Extrapolation is never
 * implemented under either policy — section 10.5 permits interpolation only
 * "with a versioned policy and source-supported temperature range", and no
 * range-extension policy exists here, so a temperature outside the declared
 * table is always refused rather than extrapolated.
 *
 * @param {Array<{absoluteTemperature:number, allowableStress:{value:number,source:string}}>} points
 *        Sorted ascending, strictly increasing (guaranteed by `validateAllowablePoints`).
 * @param {number} temperature Declared evaluation temperature.
 * @param {string} policy One of `TEMPERATURE_INTERPOLATION_POLICIES`.
 * @returns {{value:number, method:'EXACT_MATCH'|'LINEAR_BRACKET_INTERPOLATION_V1', lowerTemperature:number, upperTemperature:number}}
 */
export function resolveAllowableAtTemperature(points, temperature, policy) {
  requireFinite(temperature, 'temperature', 'CODE_ENGINE_TEMPERATURE_INVALID');
  const first = points[0];
  const last = points[points.length - 1];
  if (temperature < first.absoluteTemperature || temperature > last.absoluteTemperature) {
    fail(
      `Evaluation temperature ${temperature} lies outside the declared edition-dataset allowable range [${first.absoluteTemperature}, ${last.absoluteTemperature}]; extrapolation is not implemented under any policy and is refused rather than approximated.`,
      'CODE_ENGINE_ALLOWABLE_TEMPERATURE_EXTRAPOLATION_PROHIBITED',
    );
  }
  const exact = points.find((point) => point.absoluteTemperature === temperature);
  if (exact !== undefined) {
    return {
      value: exact.allowableStress.value,
      method: 'EXACT_MATCH',
      lowerTemperature: exact.absoluteTemperature,
      upperTemperature: exact.absoluteTemperature,
    };
  }
  if (policy === EXACT_MATCH_TEMPERATURE_POLICY) {
    fail(
      `Evaluation temperature ${temperature} does not exactly match a declared edition-dataset point and the profile's temperatureInterpolationPolicy is ${EXACT_MATCH_TEMPERATURE_POLICY}; interpolation is not permitted under this policy.`,
      'CODE_ENGINE_TEMPERATURE_NOT_EXACT_MATCH',
    );
  }
  let lower = null;
  let upper = null;
  for (const point of points) {
    if (point.absoluteTemperature < temperature) lower = point;
    if (point.absoluteTemperature > temperature && upper === null) upper = point;
  }
  const fraction = (temperature - lower.absoluteTemperature) / (upper.absoluteTemperature - lower.absoluteTemperature);
  const value = lower.allowableStress.value + fraction * (upper.allowableStress.value - lower.allowableStress.value);
  return {
    value,
    method: LINEAR_BRACKET_TEMPERATURE_POLICY,
    lowerTemperature: lower.absoluteTemperature,
    upperTemperature: upper.absoluteTemperature,
  };
}
