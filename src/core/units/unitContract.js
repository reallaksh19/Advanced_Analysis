/**
 * Unit conversion and contract utilities for mechanical screening calculations.
 * Unknown units throw errors; valid conversions return conversion traces when requested.
 */

const conversionTable = {
  length: {
    in: { ft: (v) => v / 12, mm: (v) => v * 25.4, in: (v) => v },
    ft: { in: (v) => v * 12, mm: (v) => v * 304.8, ft: (v) => v },
    mm: { in: (v) => v / 25.4, ft: (v) => v / 304.8, mm: (v) => v }
  },
  force: {
    lbf: { N: (v) => v * 4.4482216152605, lbf: (v) => v },
    N: { lbf: (v) => v / 4.4482216152605, N: (v) => v }
  },
  stress: {
    psi: { MPa: (v) => v * 0.006894757293168, psi: (v) => v },
    MPa: { psi: (v) => v / 0.006894757293168, MPa: (v) => v }
  },
  moment: {
    'in-lbf': { 'N-mm': (v) => v * 112.9848290276167, 'in-lbf': (v) => v },
    'N-mm': { 'in-lbf': (v) => v / 112.9848290276167, 'N-mm': (v) => v }
  }
};

const quantityAliases = {
  coordinate: 'length',
  coordinates: 'length',
  deflection: 'length',
  displacement: 'length',
  span: 'length',
  diameter: 'length',
  load: 'force',
  reaction: 'force',
  bendingMoment: 'moment'
};

const acceptedUnits = new Set(Object.values(conversionTable).flatMap((map) => Object.keys(map)));

function normaliseQuantity(quantity) {
  return quantityAliases[quantity] || quantity;
}

export function assertUnitContract({ moduleId, quantity, value, unit }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid numeric value for quantity "${quantity}" in module ${moduleId}.`);
  }
  if (!acceptedUnits.has(unit)) {
    throw new Error(`Unknown unit "${unit}" for quantity "${quantity}" in module ${moduleId}.`);
  }
  return { ok: true, moduleId, quantity, value, unit };
}

export function convertUnit({ value, fromUnit, toUnit, quantity, includeTrace = false }) {
  if (fromUnit === toUnit) {
    return includeTrace ? { value, trace: { fromUnit, toUnit, quantity, factor: 1 } } : value;
  }

  const normalisedQuantity = normaliseQuantity(quantity);
  const map = conversionTable[normalisedQuantity];
  if (!map || !map[fromUnit] || !map[fromUnit][toUnit]) {
    throw new Error(`No conversion defined from ${fromUnit} to ${toUnit} for ${quantity}.`);
  }
  const converted = map[fromUnit][toUnit](value);
  return includeTrace
    ? { value: converted, trace: { fromUnit, toUnit, quantity: normalisedQuantity } }
    : converted;
}

const defaultImperialUnitsByKey = {
  length: 'in', span: 'in', L: 'in', delta: 'in', deflection: 'in', displacement: 'in',
  force: 'lbf', reaction: 'lbf', P: 'lbf',
  moment: 'in-lbf', M: 'in-lbf',
  stress: 'psi', sigma: 'psi'
};

const defaultMetricUnitsByKey = {
  length: 'mm', span: 'mm', L: 'mm', delta: 'mm', deflection: 'mm', displacement: 'mm',
  force: 'N', reaction: 'N', P: 'N',
  moment: 'N-mm', M: 'N-mm',
  stress: 'MPa', sigma: 'MPa'
};

function unitForKey(key, unitSystem) {
  const lookup = unitSystem === 'metric' ? defaultMetricUnitsByKey : defaultImperialUnitsByKey;
  return lookup[key] || lookup[key.toLowerCase?.()] || (unitSystem === 'metric' ? 'mm' : 'in');
}

export function annotateUnits(result, unitSystem = 'imperial') {
  if (result === null || typeof result !== 'object') return result;
  const annotated = Array.isArray(result) ? [] : {};
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (value && typeof value === 'object' && 'value' in value && 'unit' in value) {
      annotated[key] = value;
    } else if (typeof value === 'number') {
      annotated[key] = { value, unit: unitForKey(key, unitSystem) };
    } else if (typeof value === 'object') {
      annotated[key] = annotateUnits(value, unitSystem);
    } else {
      annotated[key] = value;
    }
  }
  return annotated;
}
