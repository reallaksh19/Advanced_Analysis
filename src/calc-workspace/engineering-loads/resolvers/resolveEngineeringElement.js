/**
 * Functionality: resolves a workspace object into an explicit engineering
 * element with geometry, chainage, OPE/HYD line weights, lump weight, COG, and
 * diagnostics. Parameters: one normalized workspace object. Outputs: immutable
 * calculation record. Fallback: missing evidence blocks the affected load case.
 */

import { isSupportLikeType, numberMaybe, readObjectEndpoints, stringValue } from '../../workspaceModel.js';
import { createEngineeringDiagnostic } from '../contracts/engineeringDiagnostics.js';
import { componentWeightKg, fluidWeightKgPerM, insulationWeightKgPerM, pipeMetalWeightKgPerM } from '../formulas/elementWeightFormulas.js';

const COMPONENT_TYPES = new Set(['BEND', 'ELBOW', 'ELBO', 'TEE', 'FLANGE', 'FLAN', 'VALVE', 'VALV', 'REDUCER', 'REDU', 'GASKET', 'GASK', 'INSTRUMENT', 'INST', 'OLET']);

export function resolveEngineeringElement(object) {
  const source = sourceFields(object);
  const enriched = enrichedFields(object);
  const geometry = resolveGeometry(object, source);
  const type = normalizedType(object);
  const hasLineLoad = geometry.lengthM !== null && geometry.lengthM > 0;
  const requiresComponent = COMPONENT_TYPES.has(type);
  const dimensions = dimensionsFrom(enriched);
  const pipe = hasLineLoad ? pipeMetalWeightKgPerM({ directKgPerM: enriched.pipeWeightKgPerM, ...dimensions }) : notApplicable();
  const insulation = hasLineLoad ? insulationWeightKgPerM({ directKgPerM: enriched.insulationWeightKgPerM, thicknessMm: enriched.insulationThicknessMm, densityKgM3: enriched.insulationDensityKgM3, outsideDiameterMm: dimensions.outsideDiameterMm }) : notApplicable();
  const fluidOpe = hasLineLoad ? fluidWeightKgPerM({ directKgPerM: enriched.fluidWeightOpeKgPerM, densityKgM3: enriched.fluidDensityOpeKgM3, densityField: 'fluidDensityOpeKgM3', insideDiameterMm: dimensions.insideDiameterMm }) : notApplicable();
  const fluidHyd = hasLineLoad ? fluidWeightKgPerM({ directKgPerM: enriched.fluidWeightHydKgPerM, densityKgM3: enriched.fluidDensityHydKgM3, densityField: 'fluidDensityHydKgM3', insideDiameterMm: dimensions.insideDiameterMm }) : notApplicable();
  const component = componentWeightKg({ directKg: enriched.componentWeightKg, required: requiresComponent });
  const diagnostics = buildDiagnostics(object, geometry, { pipe, insulation, fluidOpe, fluidHyd, component }, hasLineLoad);
  return Object.freeze({
    elementId: stringValue(object?.id || object?.name),
    name: stringValue(object?.name || object?.id),
    type,
    center: geometry.center,
    chainageStartMm: geometry.chainageStartMm,
    chainageEndMm: geometry.chainageEndMm,
    chainageCenterMm: geometry.chainageCenterMm,
    lengthM: geometry.lengthM,
    lineWeightOpeKgPerM: sumValid([pipe, insulation, fluidOpe]),
    lineWeightHydKgPerM: sumValid([pipe, insulation, fluidHyd]),
    componentWeightKg: component.value,
    totalWeightOpeKg: totalWeight(geometry.lengthM, [pipe, insulation, fluidOpe], component),
    totalWeightHydKg: totalWeight(geometry.lengthM, [pipe, insulation, fluidHyd], component),
    formulaTrace: Object.freeze({ pipe, insulation, fluidOpe, fluidHyd, component }),
    diagnostics: Object.freeze(diagnostics),
  });
}

export function resolveEngineeringSupport(object) {
  const source = sourceFields(object);
  const endpoints = readObjectEndpoints(object);
  const position = point(source.POS) || point(object?.pos) || endpoints.center;
  const capability = booleanValue(source.VERTICAL_CAPABILITY ?? object?.enrichedAttributes?.supportVerticalCapability);
  const diagnostics = [];
  if (!position) diagnostics.push(diag(object, 'geometry.position', 'BROKEN_GEOMETRY', 'Support position is missing.', 'POS?'));
  if (capability !== true) diagnostics.push(diag(object, 'supportVerticalCapability', 'MISSING_SUPPORT_CAPABILITY', 'Vertical support capability is not explicitly YES.', 'SUP?'));
  return Object.freeze({
    supportId: stringValue(object?.id || object?.name),
    name: stringValue(object?.name || object?.id),
    supportType: stringValue(source.SUPPORT_TYPE || object?.enrichedAttributes?.supportType || object?.type || 'SUPPORT').toUpperCase(),
    position,
    chainageMm: numberMaybe(source.CHAINAGE_CENTER_MM ?? object?.chainageMm),
    verticalCapability: capability,
    diagnostics: Object.freeze(diagnostics),
  });
}

export function isEngineeringSupport(object) {
  return isSupportLikeType(object?.type);
}

function enrichedFields(object) {
  const flat = object?.enrichedAttributes || {};
  const nested = object?.attributes?.enrichment || {};
  const line = nested.lineList || {};
  const spec = nested.pipingClass || {};
  const material = nested.material || {};
  const weight = nested.weight || {};
  return {
    pipeWeightKgPerM: first(flat.pipeWeightKgPerM, weight.unitPipeWeightKgPerM, weight.unitPipeWtKgPerM),
    componentWeightKg: first(flat.componentWeightKg, weight.componentWeightKg, weight.bestWeightKg),
    pipeOdMm: first(flat.pipeOdMm, spec.pipeOdMm, line.pipeOdMm), wallThicknessMm: first(flat.wallThicknessMm, spec.wallThicknessMm),
    materialDensityKgM3: first(flat.materialDensityKgM3, material.materialDensityKgM3),
    fluidDensityOpeKgM3: first(flat.fluidDensityOpeKgM3, flat.fluidDensityKgM3, line.fluidDensityOpeKgM3, line.fluidDensityKgM3),
    fluidDensityHydKgM3: first(flat.fluidDensityHydKgM3, line.fluidDensityHydKgM3),
    fluidWeightOpeKgPerM: first(flat.fluidWeightOpeKgPerM, line.fluidWeightOpeKgPerM),
    fluidWeightHydKgPerM: first(flat.fluidWeightHydKgPerM, line.fluidWeightHydKgPerM),
    insulationThicknessMm: first(flat.insulationThicknessMm, line.insulationThicknessMm),
    insulationDensityKgM3: first(flat.insulationDensityKgM3, line.insulationDensityKgM3),
    insulationWeightKgPerM: first(flat.insulationWeightKgPerM, weight.insulationWeightKgPerM),
  };
}

function resolveGeometry(object, source) {
  const endpoints = readObjectEndpoints(object);
  const start = first(source.CHAINAGE_START_MM, object?.chainageStartMm);
  const end = first(source.CHAINAGE_END_MM, object?.chainageEndMm);
  const centerChainage = first(source.CHAINAGE_CENTER_MM, object?.chainageCenterMm, start !== null && end !== null ? (start + end) / 2 : null);
  const lengthMm = first(source.LENGTH_MM, endpoints.lengthMm, start !== null && end !== null ? Math.abs(end - start) : null);
  const center = point(source.CENTER) || endpoints.center;
  return { center, chainageStartMm: start, chainageEndMm: end, chainageCenterMm: centerChainage, lengthM: lengthMm !== null && lengthMm > 0 ? lengthMm / 1000 : null };
}

function dimensionsFrom(enriched) {
  const od = enriched.pipeOdMm;
  const wall = enriched.wallThicknessMm;
  return { outsideDiameterMm: od, wallThicknessMm: wall, materialDensityKgM3: enriched.materialDensityKgM3, insideDiameterMm: od !== null && wall !== null && od > 2 * wall ? od - 2 * wall : null };
}

function buildDiagnostics(object, geometry, values, hasLineLoad) {
  const rows = [...(Array.isArray(object?.diagnostics) ? object.diagnostics : []), ...(Array.isArray(object?.enrichedAttributes?.diagnostics) ? object.enrichedAttributes.diagnostics : [])];
  if (!geometry.center) rows.push(diag(object, 'geometry.center', 'BROKEN_GEOMETRY', 'Element COG/center is missing.', 'COG?'));
  if ((hasLineLoad || values.component.value !== null) && geometry.chainageCenterMm === null) rows.push(diag(object, 'chainageCenterMm', 'BROKEN_GEOMETRY', 'Element chainage is missing.', 'CH?'));
  for (const [key, value] of Object.entries(values)) for (const field of value.missing || []) rows.push(diag(object, field, categoryFor(key, field), `${field} is required for ${key}.`, badgeFor(key)));
  return rows;
}

function diag(object, field, category, message, badge) {
  return createEngineeringDiagnostic({ severity: category === 'BROKEN_GEOMETRY' ? 'BLOCKED' : 'BLOCKED', category, field, message, requiredFor: ['ElementWeight', 'SupportVerticalLoad'], sourceExpected: sourceFor(field), fallbackUsed: false, context: { elementId: stringValue(object?.id || object?.name) }, ui: { badge } });
}

function categoryFor(key, field) {
  if (field.includes('componentWeight')) return 'MISSING_WEIGHT';
  if (field.includes('fluidDensity')) return 'MISSING_ATTRIBUTE';
  if (key === 'insulation') return 'MISSING_ATTRIBUTE';
  return 'MISSING_ATTRIBUTE';
}

function badgeFor(key) { return key === 'component' ? 'CW?' : key === 'fluidHyd' ? 'HYDρ?' : key === 'insulation' ? 'INS?' : 'WT?'; }
function sourceFor(field) { return field.includes('componentWeight') ? 'componentWeightMaster' : field.includes('fluid') ? 'lineList' : field.includes('insulation') ? 'lineListOrInsulationMaster' : 'pipingClassMaster'; }
function sourceFields(object) { return { ...(object?.attributes || {}), ...(object?.sourceAttributes || {}) }; }
function normalizedType(object) { return stringValue(object?.type || object?.kind || object?.sourceAttributes?.TYPE || 'OBJECT').toUpperCase(); }
function first(...values) { for (const value of values) { const numeric = numberMaybe(value); if (numeric !== null) return numeric; } return null; }
function notApplicable() { return Object.freeze({ value: 0, status: 'NOT_APPLICABLE', source: 'not-applicable', trace: null, missing: [] }); }
function sumValid(values) { return values.every((item) => item.value !== null) ? values.reduce((sum, item) => sum + item.value, 0) : null; }
function totalWeight(lengthM, distributed, component) { const line = sumValid(distributed); if (component.value === null || (lengthM !== null && line === null)) return null; return (lengthM !== null ? line * lengthM : 0) + component.value; }
function booleanValue(value) { if (value === true) return true; if (value === false) return false; const key = stringValue(value).toUpperCase(); return ['YES', 'Y', 'TRUE', '1', 'VERTICAL'].includes(key) ? true : ['NO', 'N', 'FALSE', '0'].includes(key) ? false : null; }
function point(value) { let source = value; if (typeof source === 'string' && source.trim().startsWith('{')) { try { source = JSON.parse(source); } catch { return null; } } if (!source || typeof source !== 'object') return null; const x = numberMaybe(source.x ?? source.X), y = numberMaybe(source.y ?? source.Y), z = numberMaybe(source.z ?? source.Z); return x !== null && y !== null && z !== null ? Object.freeze({ x, y, z }) : null; }
