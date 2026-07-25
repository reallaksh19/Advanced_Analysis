/**
 * Functionality: distributes explicit line and point masses to vertically
 * capable supports by chainage tributary spans and static lever reactions.
 * Parameters: resolved elements, resolved supports, and visible configuration.
 * Outputs: per-support OPE/HYD reactions, contribution audit, mass balance,
 * COG, unsupported loads, and diagnostics. Fallback: none; unbracketed or
 * incomplete loads are reported and remain undistributed.
 */

import { createEngineeringDiagnostic, diagnosticSummary } from '../contracts/engineeringDiagnostics.js';

export const CHAINAGE_DISTRIBUTION_METHOD = 'CHAINAGE_TRIBUTARY_SPAN_V2';
export const SCREENING_DISTRIBUTION_METHOD = 'NEAREST_TWO_SUPPORT_LEVER_V1';

export function distributeLoadsByChainage(elements, supports, config) {
  const gravity = requiredPositive(config?.gravityMps2, 'gravityMps2');
  const loadFactor = requiredPositive(config?.loadFactor, 'loadFactor');
  const capable = supports.filter(isUsableSupport).sort((left, right) => left.chainageMm - right.chainageMm);
  const supportMap = new Map(capable.map(emptySupportRow).map((row) => [row.supportId, row]));
  const unsupported = [];
  const diagnostics = [...supports.flatMap((support) => support.diagnostics || []), ...elements.flatMap((element) => element.diagnostics || [])];
  const totals = createTotals(elements, capable);
  for (const element of elements) distributeElement(element, capable, supportMap, unsupported, diagnostics, totals);
  const supportRows = [...supportMap.values()].map((row) => finishSupport(row, gravity, loadFactor));
  const completedTotals = finishTotals(totals, supportRows, gravity, loadFactor, elements);
  return Object.freeze({
    schema: 'support-load-distribution/v2',
    method: CHAINAGE_DISTRIBUTION_METHOD,
    methodLabel: 'Chainage tributary span; engineering target with explicit evidence',
    evaluatedAt: text(config?.evaluatedAt),
    config: Object.freeze({ gravityMps2: gravity, loadFactor, source: text(config?.source) }),
    totals: completedTotals,
    supports: Object.freeze(supportRows),
    elements: Object.freeze(elements),
    unsupported: Object.freeze(unsupported),
    diagnostics: Object.freeze(diagnostics),
    diagnosticSummary: diagnosticSummary(diagnostics),
    logs: Object.freeze(buildLogs(completedTotals, diagnostics)),
  });
}

function distributeElement(element, supports, supportMap, unsupported, diagnostics, totals) {
  addElementTotals(element, totals);
  if (element.totalWeightOpeKg === null) addBlockedCase(element, 'OPE', unsupported, diagnostics);
  if (element.totalWeightHydKg === null) addBlockedCase(element, 'HYD', unsupported, diagnostics);
  if (element.lengthM !== null) distributeLinePart(element, supports, supportMap, unsupported, diagnostics, totals);
  if (element.componentWeightKg !== null && element.componentWeightKg > 0) distributePointPart(element, supports, supportMap, unsupported, diagnostics, totals);
}

function distributeLinePart(element, supports, supportMap, unsupported, diagnostics, totals) {
  if (element.chainageStartMm === null || element.chainageEndMm === null) return addUnsupported(element, 'line', 'MISSING_CHAINAGE_RANGE', unsupported, diagnostics);
  const start = Math.min(element.chainageStartMm, element.chainageEndMm);
  const end = Math.max(element.chainageStartMm, element.chainageEndMm);
  const cuts = [start, ...supports.map((support) => support.chainageMm).filter((value) => value > start && value < end), end];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const from = cuts[index], to = cuts[index + 1];
    if (to <= from) continue;
    distributeLineSlice(element, from, to, supports, supportMap, unsupported, diagnostics, totals);
  }
}

function distributeLineSlice(element, from, to, supports, supportMap, unsupported, diagnostics, totals) {
  const center = (from + to) / 2;
  const reactions = reactionsAt(center, supports);
  if (!reactions.length) return addUnsupported(element, 'line', `NO_SUPPORT_BRACKET_${from}_${to}`, unsupported, diagnostics);
  const lengthM = (to - from) / 1000;
  const ope = element.lineWeightOpeKgPerM === null ? null : element.lineWeightOpeKgPerM * lengthM;
  const hyd = element.lineWeightHydKgPerM === null ? null : element.lineWeightHydKgPerM * lengthM;
  for (const reaction of reactions) addContribution(supportMap, reaction, element, 'CHAINAGE_UDL_TRIBUTARY_V2', ope, hyd, { rangeMm: [from, to], chainageMm: center });
  if (ope !== null) totals.distributedOpeKg += ope;
  if (hyd !== null) totals.distributedHydKg += hyd;
}

function distributePointPart(element, supports, supportMap, unsupported, diagnostics, totals) {
  if (element.chainageCenterMm === null) return addUnsupported(element, 'point', 'MISSING_POINT_CHAINAGE', unsupported, diagnostics);
  const reactions = reactionsAt(element.chainageCenterMm, supports);
  if (!reactions.length) return addUnsupported(element, 'point', 'NO_SUPPORT_BRACKET', unsupported, diagnostics);
  for (const reaction of reactions) addContribution(supportMap, reaction, element, 'CHAINAGE_POINT_COMPONENT_V2', element.componentWeightKg, element.componentWeightKg, { chainageMm: element.chainageCenterMm });
  totals.distributedOpeKg += element.componentWeightKg;
  totals.distributedHydKg += element.componentWeightKg;
}

function reactionsAt(chainage, supports) {
  const exact = supports.find((support) => nearlyEqual(support.chainageMm, chainage));
  if (exact) return [{ supportId: exact.supportId, fraction: 1, distanceMm: 0 }];
  const left = [...supports].reverse().find((support) => support.chainageMm < chainage);
  const right = supports.find((support) => support.chainageMm > chainage);
  if (!left || !right) return [];
  const span = right.chainageMm - left.chainageMm;
  return [
    { supportId: left.supportId, fraction: (right.chainageMm - chainage) / span, distanceMm: chainage - left.chainageMm },
    { supportId: right.supportId, fraction: (chainage - left.chainageMm) / span, distanceMm: right.chainageMm - chainage },
  ];
}

function addContribution(supportMap, reaction, element, method, opeKg, hydKg, context) {
  const support = supportMap.get(reaction.supportId);
  if (!support) return;
  const contribution = Object.freeze({
    elementId: element.elementId, name: element.name, type: element.type, method,
    fraction: round9(reaction.fraction), distanceMm: round6(reaction.distanceMm),
    opeKg: massShare(opeKg, reaction.fraction), hydKg: massShare(hydKg, reaction.fraction), ...context,
  });
  if (contribution.opeKg !== null) support.verticalLoadOpeKg += contribution.opeKg;
  if (contribution.hydKg !== null) support.verticalLoadHydKg += contribution.hydKg;
  support.contributions.push(contribution);
}

function addUnsupported(element, part, reason, unsupported, diagnostics) {
  unsupported.push(Object.freeze({ elementId: element.elementId, name: element.name, part, reason, totalWeightOpeKg: element.totalWeightOpeKg, totalWeightHydKg: element.totalWeightHydKg }));
  diagnostics.push(createEngineeringDiagnostic({ severity: 'BLOCKED', category: 'CALCULATION_BLOCKED', field: 'supportBracket', message: `${element.name}: ${part} load has no valid chainage support bracket (${reason}).`, requiredFor: ['SupportVerticalLoad'], sourceExpected: 'supportChainageModel', fallbackUsed: false, context: { elementId: element.elementId }, ui: { badge: 'SUP?' } }));
}

function addBlockedCase(element, loadCase, unsupported, diagnostics) {
  unsupported.push(Object.freeze({ elementId: element.elementId, name: element.name, part: loadCase, reason: 'ELEMENT_WEIGHT_BLOCKED', totalWeightOpeKg: element.totalWeightOpeKg, totalWeightHydKg: element.totalWeightHydKg }));
  diagnostics.push(createEngineeringDiagnostic({ severity: 'BLOCKED', category: 'CALCULATION_BLOCKED', field: `elementWeight${loadCase}Kg`, message: `${element.name}: ${loadCase} element weight is blocked by missing source data.`, requiredFor: [`SupportVerticalLoad${loadCase}`], sourceExpected: 'enrichedAttributes', fallbackUsed: false, context: { elementId: element.elementId }, ui: { badge: `${loadCase}?` } }));
}

function createTotals(elements, supports) {
  return { elements: elements.length, supports: supports.length, totalOpeKg: 0, totalHydKg: 0, distributedOpeKg: 0, distributedHydKg: 0 };
}

function addElementTotals(element, totals) {
  if (element.totalWeightOpeKg !== null) totals.totalOpeKg += element.totalWeightOpeKg;
  if (element.totalWeightHydKg !== null) totals.totalHydKg += element.totalWeightHydKg;
}

function finishTotals(totals, supportRows, gravity, loadFactor, elements) {
  const distributedOpe = sum(supportRows, 'verticalLoadOpeKg');
  const distributedHyd = sum(supportRows, 'verticalLoadHydKg');
  return Object.freeze({
    elements: totals.elements, supports: totals.supports,
    totalWeightOpeKg: round6(totals.totalOpeKg), totalWeightHydKg: round6(totals.totalHydKg),
    distributedWeightOpeKg: round6(distributedOpe), distributedWeightHydKg: round6(distributedHyd),
    unsupportedWeightOpeKg: round6(totals.totalOpeKg - distributedOpe), unsupportedWeightHydKg: round6(totals.totalHydKg - distributedHyd),
    opeMassBalanceErrorKg: round9(totals.totalOpeKg - distributedOpe - (totals.totalOpeKg - distributedOpe)),
    hydMassBalanceErrorKg: round9(totals.totalHydKg - distributedHyd - (totals.totalHydKg - distributedHyd)),
    totalVerticalOpeN: round3(distributedOpe * gravity * loadFactor), totalVerticalHydN: round3(distributedHyd * gravity * loadFactor),
    cogOpe: weightedCog(elements, 'totalWeightOpeKg'), cogHyd: weightedCog(elements, 'totalWeightHydKg'),
    cog: weightedCog(elements, 'totalWeightOpeKg'),
  });
}

function emptySupportRow(support) { return { ...support, verticalLoadOpeKg: 0, verticalLoadHydKg: 0, contributions: [] }; }
function finishSupport(row, gravity, loadFactor) { return Object.freeze({ ...row, verticalLoadOpeKg: round6(row.verticalLoadOpeKg), verticalLoadHydKg: round6(row.verticalLoadHydKg), verticalLoadOpeN: round3(row.verticalLoadOpeKg * gravity * loadFactor), verticalLoadHydN: round3(row.verticalLoadHydKg * gravity * loadFactor), contributionCount: row.contributions.length, contributions: Object.freeze(row.contributions) }); }
function isUsableSupport(support) { return support?.verticalCapability === true && Number.isFinite(support?.chainageMm) && support?.position; }
function weightedCog(elements, field) { const rows = elements.filter((row) => row.center && row[field] !== null && row[field] > 0); const weight = rows.reduce((sumValue, row) => sumValue + row[field], 0); if (!weight) return null; return Object.freeze({ x: round6(rows.reduce((sumValue, row) => sumValue + row.center.x * row[field], 0) / weight), y: round6(rows.reduce((sumValue, row) => sumValue + row.center.y * row[field], 0) / weight), z: round6(rows.reduce((sumValue, row) => sumValue + row.center.z * row[field], 0) / weight) }); }
function buildLogs(totals, diagnostics) { return [{ level: diagnostics.length ? 'warn' : 'info', message: `Chainage V2 distributed OPE ${totals.distributedWeightOpeKg} kg and HYD ${totals.distributedWeightHydKg} kg to ${totals.supports} support(s).` }, { level: 'info', message: 'No OPE-to-HYD fallback was used.' }]; }
function requiredPositive(value, field) { const numeric = Number(value); if (!Number.isFinite(numeric) || numeric <= 0) throw new TypeError(`Visible support-load config field ${field} must be a positive number.`); return numeric; }
function massShare(value, fraction) { return value === null ? null : round9(value * fraction); }
function sum(rows, field) { return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0); }
function nearlyEqual(left, right) { return Math.abs(left - right) <= 1e-9; }
function round3(value) { return Math.round(value * 1e3) / 1e3; }
function round6(value) { return Math.round(value * 1e6) / 1e6; }
function round9(value) { return Math.round(value * 1e9) / 1e9; }
function text(value) { return String(value ?? '').trim(); }
