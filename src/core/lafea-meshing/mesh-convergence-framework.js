import { LafeaMeshingError } from './errors.js';
import { exactKeys, member, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { finiteNumber } from '../shared-analysis-contract/numeric.js';

/**
 * Mesh convergence acceptance framework (spec §10.4). At least three
 * systematically refined mesh levels are required for a production code
 * assessment unless a benchmark-qualified template exemption applies. Raw
 * singular peak stress is never an accepted convergence quantity.
 */
export const CONVERGENCE_QUANTITIES = Object.freeze([
  'STRAIN_ENERGY',
  'SELECTED_DISPLACEMENT',
  'REACTION_EQUILIBRIUM',
  'SCL_MEMBRANE_STRESS',
  'SCL_MEMBRANE_PLUS_BENDING_STRESS',
  'WELD_STRUCTURAL_STRESS',
]);

export const CONVERGENCE_BEHAVIORS = Object.freeze(['MONOTONIC', 'OSCILLATORY', 'NON_CONVERGENT']);

const DEFAULT_LIMITS = Object.freeze({
  STRAIN_ENERGY: 0.02,
  SELECTED_DISPLACEMENT: 0.01,
  REACTION_EQUILIBRIUM: 0.005,
  SCL_MEMBRANE_STRESS: 0.03,
  SCL_MEMBRANE_PLUS_BENDING_STRESS: 0.03,
  WELD_STRUCTURAL_STRESS: 0.05,
});

/**
 * A quantity's value at each mesh level, in refinement order.
 * @param {string} quantity One of `CONVERGENCE_QUANTITIES` — never a raw
 *        singular peak.
 * @param {readonly number[]} valuesByLevel At least 3, finest last.
 */
export function canonicalQuantityHistory(quantity, valuesByLevel) {
  member(quantity, CONVERGENCE_QUANTITIES, 'quantity');
  if (!Array.isArray(valuesByLevel) || valuesByLevel.length < 3) {
    throw new LafeaMeshingError('A convergence quantity requires at least 3 mesh levels', 'INSUFFICIENT_MESH_LEVELS');
  }
  return Object.freeze({
    quantity,
    valuesByLevel: Object.freeze(valuesByLevel.map((value, index) => finiteNumber(value, `${quantity}[${index}]`))),
  });
}

/**
 * Classify the two-finest-level relative change against the default (or
 * caller-overridden) acceptance limit, and the whole history's shape.
 */
export function qualifyConvergence(history, limitOverride) {
  const limit = limitOverride ?? DEFAULT_LIMITS[history.quantity];
  const values = history.valuesByLevel;
  const finest = values[values.length - 1];
  const secondFinest = values[values.length - 2];
  const denominator = Math.max(Math.abs(finest), Number.EPSILON);
  const relativeChange = Math.abs(finest - secondFinest) / denominator;
  const behavior = classifyBehavior(values);
  const accepted = behavior === 'MONOTONIC' && relativeChange <= limit;
  return Object.freeze({
    quantity: history.quantity,
    relativeChange,
    limit,
    behavior,
    accepted,
  });
}

function classifyBehavior(values) {
  const deltas = [];
  for (let i = 1; i < values.length; i += 1) deltas.push(values[i] - values[i - 1]);
  const signs = deltas.map((d) => Math.sign(d));
  const nonZeroSigns = signs.filter((s) => s !== 0);
  if (nonZeroSigns.length === 0) return 'MONOTONIC';
  const allSameSign = nonZeroSigns.every((s) => s === nonZeroSigns[0]);
  if (allSameSign) return 'MONOTONIC';
  const magnitudes = deltas.map((d) => Math.abs(d));
  const isShrinking = magnitudes.every((m, i) => i === 0 || m <= magnitudes[i - 1] * 1.0001);
  return isShrinking ? 'OSCILLATORY' : 'NON_CONVERGENT';
}

const MESH_LEVEL_SET_FIELDS = Object.freeze(['levelCount', 'benchmarkTemplateExemption']);

/**
 * Fail-closed gate on the mesh-level-set itself: production code assessment
 * requires >= 3 levels unless a validated benchmark-template exemption is
 * supplied (spec §10.4).
 */
export function requireSufficientMeshLevels(source) {
  exactKeys(source, MESH_LEVEL_SET_FIELDS, 'meshLevelSet');
  const levelCount = finiteNumber(source.levelCount, 'meshLevelSet.levelCount');
  if (!Number.isInteger(levelCount) || levelCount < 1) throw new LafeaMeshingError('meshLevelSet.levelCount must be a positive integer', 'INVALID_LEVEL_COUNT');
  if (levelCount >= 3) return Object.freeze({ levelCount, exempted: false });
  if (source.benchmarkTemplateExemption === null) {
    throw new LafeaMeshingError(`Production code assessment requires >= 3 mesh levels; got ${levelCount}`, 'INSUFFICIENT_MESH_LEVELS');
  }
  exactKeys(source.benchmarkTemplateExemption, ['benchmarkId', 'qualificationEvidenceHash'], 'meshLevelSet.benchmarkTemplateExemption');
  return Object.freeze({
    levelCount,
    exempted: true,
    benchmarkId: nonEmptyString(source.benchmarkTemplateExemption.benchmarkId, 'benchmarkTemplateExemption.benchmarkId'),
    qualificationEvidenceHash: nonEmptyString(source.benchmarkTemplateExemption.qualificationEvidenceHash, 'benchmarkTemplateExemption.qualificationEvidenceHash'),
  });
}

/**
 * A raw singular peak value is never accepted as a convergence quantity —
 * reject at the type level rather than silently coercing it into one of the
 * six accepted quantities.
 */
export function rejectRawSingularPeakAsConvergenceQuantity(candidateQuantityLabel) {
  if (candidateQuantityLabel === 'RAW_SINGULAR_PEAK_STRESS' || !CONVERGENCE_QUANTITIES.includes(candidateQuantityLabel)) {
    throw new LafeaMeshingError(`${candidateQuantityLabel} is not an accepted convergence quantity`, 'UNACCEPTED_CONVERGENCE_QUANTITY');
  }
  return candidateQuantityLabel;
}

/**
 * Overall production-code-assessment acceptance: every accepted quantity's
 * history must qualify as MONOTONIC and within its limit; a NON_CONVERGENT
 * or unaccepted quantity blocks auto-acceptance (spec §10.4).
 */
export function qualifyConvergenceSet(histories, limitOverrides = {}) {
  const results = histories.map((history) => qualifyConvergence(history, limitOverrides[history.quantity]));
  const accepted = results.every((result) => result.accepted);
  return Object.freeze({ results: Object.freeze(results), accepted });
}
