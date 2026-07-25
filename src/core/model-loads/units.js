import { deepFreeze, finiteNumber, stringValue } from '../shared-piping-model/index.js';

const LENGTH_TO_M = Object.freeze({ mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 });
const UNIT_ALIASES = Object.freeze({
  mm: 'mm', millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm',
  cm: 'cm', centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm',
  m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  in: 'in', inch: 'in', inches: 'in', ft: 'ft', foot: 'ft', feet: 'ft',
});

export function normalizeLengthUnit(value) {
  return UNIT_ALIASES[stringValue(value).toLowerCase()] || 'unknown';
}

export function lengthFactorToM(unit) {
  return LENGTH_TO_M[normalizeLengthUnit(unit)] ?? null;
}

export function pointToMeters(point, unit) {
  const factor = lengthFactorToM(unit);
  if (!point || factor === null) return null;
  const x = finiteNumber(point.x), y = finiteNumber(point.y), z = finiteNumber(point.z);
  return x === null || y === null || z === null ? null : deepFreeze({ x: x * factor, y: y * factor, z: z * factor });
}

export function distanceM(start, end) {
  if (!start || !end) return null;
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

export function evidenceNumber(evidence) {
  return evidence && Object.prototype.hasOwnProperty.call(evidence, 'value')
    ? finiteNumber(evidence.value)
    : null;
}

export function isExplicitZero(evidence) {
  return evidenceNumber(evidence) === 0;
}
