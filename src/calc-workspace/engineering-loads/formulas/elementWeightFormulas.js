/**
 * Functionality: evaluates pipe metal, fluid, insulation, and lump component
 * weights using explicit source values or traceable physical formulas.
 * Parameters: resolved dimensions, densities, and weights. Outputs: value,
 * source status, formula trace, or null. Fallback: missing inputs return null.
 */

export function pipeMetalWeightKgPerM(input) {
  const direct = finite(input?.directKgPerM);
  if (direct !== null) return sourced(direct, 'pipeWeightKgPerM');
  const od = finite(input?.outsideDiameterMm);
  const wall = finite(input?.wallThicknessMm);
  const density = finite(input?.materialDensityKgM3);
  if (od === null || wall === null || density === null || wall <= 0 || od <= 2 * wall) return missing(['outsideDiameterMm', 'wallThicknessMm', 'materialDensityKgM3'], input);
  const inside = od - 2 * wall;
  const area = Math.PI / 4 * (od ** 2 - inside ** 2) * 1e-6;
  return derived(area * density, 'pi/4 * (OD^2 - ID^2) * 1e-6 * materialDensity', { od, wall, inside, density, area });
}

export function fluidWeightKgPerM(input) {
  const direct = finite(input?.directKgPerM);
  if (direct !== null) return sourced(direct, input?.field || 'fluidWeightKgPerM');
  const inside = finite(input?.insideDiameterMm);
  const density = finite(input?.densityKgM3);
  if (inside === null || density === null || inside <= 0) return missing(['insideDiameterMm', input?.densityField || 'fluidDensityKgM3'], input);
  const area = Math.PI / 4 * inside ** 2 * 1e-6;
  return derived(area * density, 'pi/4 * ID^2 * 1e-6 * fluidDensity', { inside, density, area });
}

export function insulationWeightKgPerM(input) {
  const direct = finite(input?.directKgPerM);
  if (direct !== null) return sourced(direct, 'insulationWeightKgPerM');
  const thickness = finite(input?.thicknessMm);
  if (thickness === 0) return sourceZero('insulationThicknessMm');
  const od = finite(input?.outsideDiameterMm);
  const density = finite(input?.densityKgM3);
  if (od === null || thickness === null || density === null || thickness < 0) return missing(['outsideDiameterMm', 'insulationThicknessMm', 'insulationDensityKgM3'], input);
  const insulatedOd = od + 2 * thickness;
  const area = Math.PI / 4 * (insulatedOd ** 2 - od ** 2) * 1e-6;
  return derived(area * density, 'pi/4 * (ODins^2 - OD^2) * 1e-6 * insulationDensity', { od, thickness, insulatedOd, density, area });
}

export function componentWeightKg(input) {
  if (input?.required !== true) return Object.freeze({ value: 0, status: 'NOT_APPLICABLE', source: 'not-applicable', trace: null, missing: [] });
  const direct = finite(input?.directKg);
  if (direct === null) return missing(['componentWeightKg'], input);
  return sourced(direct, 'componentWeightKg');
}

function sourced(value, field) {
  return Object.freeze({ value, status: value === 0 ? 'OK_SOURCE_ZERO' : 'OK_SOURCE', source: field, trace: null, missing: [] });
}

function sourceZero(field) {
  return Object.freeze({ value: 0, status: 'OK_SOURCE_ZERO', source: field, trace: null, missing: [] });
}

function derived(value, formula, substitution) {
  return Object.freeze({ value: round9(value), status: 'OK_DERIVED_WITH_TRACE', source: 'calculated', trace: Object.freeze({ formula, substitution: Object.freeze(substitution), result: round9(value), fallbackUsed: false }), missing: [] });
}

function missing(fields, input) {
  const missingFields = fields.filter((field) => !hasInput(field, input));
  return Object.freeze({ value: null, status: 'MISSING_REQUIRED_SOURCE', source: '', trace: null, missing: Object.freeze(missingFields.length ? missingFields : fields) });
}

function hasInput(field, input) {
  const map = {
    outsideDiameterMm: input?.outsideDiameterMm,
    wallThicknessMm: input?.wallThicknessMm,
    materialDensityKgM3: input?.materialDensityKgM3,
    insideDiameterMm: input?.insideDiameterMm,
    fluidDensityKgM3: input?.densityKgM3,
    fluidDensityOpeKgM3: input?.densityKgM3,
    fluidDensityHydKgM3: input?.densityKgM3,
    insulationThicknessMm: input?.thicknessMm,
    insulationDensityKgM3: input?.densityKgM3,
    componentWeightKg: input?.directKg,
  };
  return finite(map[field]) !== null;
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round9(value) {
  return Math.round(value * 1e9) / 1e9;
}
