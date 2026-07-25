import { deepFreeze } from '../shared-piping-model/immutable.js';
import { SCALAR_CLASSIFICATIONS, STRESS_TRENDS } from './interpretation-constants.js';

export function scalarConvergenceEvidence(history, profile) {
  const rows = normalizedHistory(history);
  const relativeChanges = successiveRelativeChanges(rows, profile);
  const classification = classifyScalarSequence(rows.map((row) => row.value), profile);
  const classificationEvidence = sequenceEvidence(rows.map((row) => row.value), profile);
  const observedOrder = observedOrderEvidence(rows, classification, profile);
  const richardson = richardsonEvidence(rows, observedOrder);
  return deepFreeze({ history: rows, relativeChanges, classification, classificationEvidence, observedOrder, richardson });
}

export function classifyScalarSequence(values, profile) {
  assertProfile(profile);
  if (values.length < 3) return SCALAR_CLASSIFICATIONS.INSUFFICIENT_LEVELS;
  if (values.some((value) => !Number.isFinite(value))) return SCALAR_CLASSIFICATIONS.INCOMPARABLE;
  if (range(values) <= profile.scalarAbsolute) return SCALAR_CLASSIFICATIONS.EXACT_OR_INVARIANT;
  if (crossesZero(values, profile.scalarAbsolute)) return SCALAR_CLASSIFICATIONS.ZERO_CROSSING_UNRESOLVED;
  const differences = successiveDifferences(values);
  const monotonic = commonSign(differences, profile.scalarAbsolute) !== 0;
  const shrinking = shrinkingMagnitudes(differences, profile.scalarAbsolute);
  if (monotonic && shrinking) return SCALAR_CLASSIFICATIONS.MONOTONIC_CONVERGING;
  if (!monotonic && shrinking) return SCALAR_CLASSIFICATIONS.OSCILLATORY_CONVERGING;
  if (monotonic && risingMagnitude(values, profile.scalarAbsolute)) return SCALAR_CLASSIFICATIONS.NONCONVERGENT_RISING;
  return SCALAR_CLASSIFICATIONS.NONCONVERGENT_OSCILLATORY;
}

export function stressTrendEvidence(scalarEvidence, locations = [], singularFeatures = [], coordinateTolerance = 0) {
  const scalarTrend = trendFromClassification(scalarEvidence.classification);
  const migration = locationMigration(locations, coordinateTolerance);
  const trend = migration.migrating ? STRESS_TRENDS.LOCATION_MIGRATING : scalarTrend;
  const annotations = normalizedFeatures(singularFeatures);
  const suspected = scalarTrend === STRESS_TRENDS.RISING_WITH_REFINEMENT && annotations.length > 0;
  return deepFreeze({
    trend,
    scalarTrend,
    governingLocations: locations,
    locationMigrating: migration.migrating,
    locationComparisonPolicy: migration.policy,
    featureAnnotations: annotations,
    interpretation: suspected ? 'SINGULARITY_SUSPECTED' : null,
    mathematicalProof: 'NOT_CLAIMED',
  });
}



function normalizedFeatures(value) {
  return value.map((row) => typeof row === 'string'
    ? { featureId: row, featureType: row, sourceSemanticHash: null }
    : { featureId: row.featureId, featureType: row.featureType, sourceSemanticHash: row.sourceSemanticHash })
    .sort((a,b)=>compare(a.featureId,b.featureId)||compare(a.featureType,b.featureType));
}
function sequenceEvidence(values, profile) {
  const differences = successiveDifferences(values);
  return {
    successiveDifferences: differences,
    differenceMagnitudes: differences.map(Math.abs),
    monotonicSign: commonSign(differences, profile.scalarAbsolute),
    shrinkingDifferenceMagnitudes: shrinkingMagnitudes(differences, profile.scalarAbsolute),
    zeroCrossing: crossesZero(values, profile.scalarAbsolute),
    valueRange: values.length ? range(values) : null,
    rulesIdentity: 'LFEA_SCALAR_TREND_RULES_V1',
  };
}
function locationMigration(locations, tolerance) {
  if (locations.length < 2) return { migrating: false, policy: 'INSUFFICIENT_LOCATIONS' };
  const coordinates = locations.map((row) => row?.globalCoordinates);
  if (coordinates.every((row) => row && Number.isFinite(row.x) && Number.isFinite(row.y))) {
    const first = coordinates[0]; const migrating = coordinates.slice(1).some((row) => Math.hypot(row.x - first.x, row.y - first.y) > tolerance);
    return { migrating, policy: 'GLOBAL_COORDINATE_DISTANCE' };
  }
  const identities = locations.map((row) => row.locationIdentity);
  return { migrating: new Set(identities).size > 1, policy: 'LOCATION_IDENTITY_FALLBACK' };
}
function observedOrderEvidence(rows, classification, profile) {
  const inapplicable = (reason) => ({ applicability: 'NOT_APPLICABLE', reason, valuesUsed: [], observedOrder: null });
  if (rows.length < 3) return inapplicable('At least three levels are required.');
  if (classification !== SCALAR_CLASSIFICATIONS.MONOTONIC_CONVERGING) return inapplicable('Observed order requires a monotonic converging sequence.');
  const ratios = rows.slice(0, -1).map((row, index) => row.h / rows[index + 1].h);
  if (ratios.some((ratio) => !(ratio > 1))) return inapplicable('Refinement ratios must exceed one.');
  if (!constantRatios(ratios, profile.constantRatioRelative)) return inapplicable('Refinement ratios do not satisfy the approved constant-ratio condition.');
  const used = rows.slice(-3); const d12 = used[0].value - used[1].value; const d23 = used[1].value - used[2].value;
  if (Math.abs(d12) <= profile.scalarAbsolute || Math.abs(d23) <= profile.scalarAbsolute) return inapplicable('Successive differences are zero or round-off dominated.');
  if (Math.sign(d12) !== Math.sign(d23)) return inapplicable('Successive differences change sign.');
  const r = Math.sqrt((used[0].h / used[1].h) * (used[1].h / used[2].h));
  const p = Math.log(Math.abs(d12 / d23)) / Math.log(r);
  if (!Number.isFinite(p) || !(p > 0)) return inapplicable('Observed order is nonpositive or non-finite.');
  return { applicability: 'APPLICABLE', reason: null, valuesUsed: used, refinementRatio: r, numeratorDifference: d12, denominatorDifference: d23, observedOrder: p, asymptoticCheck: 'NOT_CONTRADICTED_BY_MONOTONIC_SHRINKING_DIFFERENCES' };
}

function richardsonEvidence(rows, order) {
  if (order.applicability !== 'APPLICABLE') return { applicability: 'NOT_APPLICABLE', reason: order.reason, label: null, estimatedValue: null };
  const [middle, fine] = rows.slice(-2); const denominator = order.refinementRatio ** order.observedOrder - 1;
  if (!(Math.abs(denominator) > 0) || !Number.isFinite(denominator)) return { applicability: 'NOT_APPLICABLE', reason: 'Richardson denominator is invalid.', label: null, estimatedValue: null };
  return { applicability: 'APPLICABLE', reason: null, label: 'ESTIMATED_ASYMPTOTIC_VALUE', estimatedValue: fine.value + (fine.value - middle.value) / denominator, denominator };
}

function successiveRelativeChanges(rows, profile) {
  assertProfile(profile);
  return rows.slice(1).map((row, index) => {
    const previous = rows[index]; const scale = Math.max(Math.abs(previous.value), Math.abs(row.value), profile.relativeScaleFloor);
    return { coarseLevelId: previous.levelId, fineLevelId: row.levelId, absoluteChange: row.value - previous.value, relativeChange: Math.abs(row.value - previous.value) / scale, scale };
  });
}
function normalizedHistory(history) {
  if (!Array.isArray(history) || history.some((row) => !row || !Number.isFinite(row.h) || !Number.isFinite(row.value) || typeof row.levelId !== 'string')) throw new TypeError('Scalar history must contain finite h/value rows.');
  return history.map((row) => ({ levelId: row.levelId, h: row.h, value: row.value, ...(row.location ? { location: row.location } : {}), ...(row.evidence ? { evidence: row.evidence } : {}) }));
}
function trendFromClassification(classification) {
  if ([SCALAR_CLASSIFICATIONS.EXACT_OR_INVARIANT, SCALAR_CLASSIFICATIONS.MONOTONIC_CONVERGING, SCALAR_CLASSIFICATIONS.OSCILLATORY_CONVERGING].includes(classification)) return STRESS_TRENDS.BOUNDED_AND_STABILIZING;
  if (classification === SCALAR_CLASSIFICATIONS.NONCONVERGENT_RISING) return STRESS_TRENDS.RISING_WITH_REFINEMENT;
  if ([SCALAR_CLASSIFICATIONS.NONCONVERGENT_OSCILLATORY, SCALAR_CLASSIFICATIONS.ZERO_CROSSING_UNRESOLVED].includes(classification)) return STRESS_TRENDS.OSCILLATORY;
  if (classification === SCALAR_CLASSIFICATIONS.INCOMPARABLE) return STRESS_TRENDS.INCOMPARABLE;
  return STRESS_TRENDS.INSUFFICIENT_EVIDENCE;
}
function shrinkingMagnitudes(differences, tolerance) { const values = differences.map(Math.abs); return values.slice(1).every((value, index) => value <= values[index] + tolerance) && values.at(-1) < values[0] - tolerance; }
function commonSign(values, tolerance) { const signs = values.filter((value) => Math.abs(value) > tolerance).map(Math.sign); return signs.length && new Set(signs).size === 1 ? signs[0] : 0; }
function risingMagnitude(values, tolerance) { return values.slice(1).every((value, index) => Math.abs(value) >= Math.abs(values[index]) - tolerance); }
function crossesZero(values, tolerance) { return values.some((value) => value > tolerance) && values.some((value) => value < -tolerance); }
function successiveDifferences(values) { return values.slice(1).map((value, index) => value - values[index]); }
function constantRatios(ratios, tolerance) { const reference = ratios.reduce((sum, value) => sum + value, 0) / ratios.length; return ratios.every((value) => Math.abs(value - reference) / reference <= tolerance); }
function range(values) { return Math.max(...values) - Math.min(...values); }
function assertProfile(profile) {
  for (const key of ['scalarAbsolute','relativeScaleFloor','constantRatioRelative']) if (!(profile?.[key] > 0) || !Number.isFinite(profile[key])) throw new TypeError(`Convergence profile ${key} must be explicit and positive.`);
}
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
