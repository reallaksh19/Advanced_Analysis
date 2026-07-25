import { CANONICAL_UNITS } from './constants.js';
import { modelError } from './errors.js';
import { canonicalNumber } from './numeric.js';
const FACTORS = Object.freeze({
  length: Object.freeze({ mm: 1, m: 1000 }),
  force: Object.freeze({ N: 1, kN: 1000 }),
  moment: Object.freeze({ 'N·mm': 1, 'N*mm': 1, 'N·m': 1000, 'N*m': 1000, 'kN·m': 1_000_000, 'kN*m': 1_000_000 }),
  pressure: Object.freeze({ Pa: 1e-6, kPa: 1e-3, MPa: 1 }),
  stress: Object.freeze({ Pa: 1e-6, kPa: 1e-3, MPa: 1 }),
});
export function canonicalizeUnits(units) {
  if (!units || typeof units !== 'object' || Array.isArray(units)) {
    throw modelError('UNITS_REQUIRED', 'units', 'Explicit engineering units are required.');
  }
  const declared = {};
  const conversionFactors = {};
  for (const dimension of Object.keys(CANONICAL_UNITS)) {
    const unit = units[dimension];
    if (!Object.hasOwn(FACTORS[dimension], unit)) {
      throw modelError('UNSUPPORTED_UNIT', `units.${dimension}`, `Unsupported ${dimension} unit.`);
    }
    declared[dimension] = unit;
    conversionFactors[dimension] = FACTORS[dimension][unit];
  }
  return { declared, canonical: CANONICAL_UNITS, conversionFactors };
}
export function convertScalar(value, dimension, units, path) {
  return canonicalNumber(value * units.conversionFactors[dimension], path);
}
export function convertVector(vector, dimension, units, path) {
  return vector.map((value, index) => convertScalar(value, dimension, units, `${path}[${index}]`));
}
