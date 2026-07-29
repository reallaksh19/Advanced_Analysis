import { SharedAnalysisContractError, undeclaredCode } from './errors.js';
import { finiteNumber } from './numeric.js';
import { exactKeys, nonEmptyString } from './validation.js';

/**
 * Profile value resolution shared by both plans.
 *
 * Both documents impose the same rule from opposite ends: LFEA rejects a
 * missing `spanSeedingLimit` with `SPAN_SEEDING_LIMIT_NOT_DECLARED` (B-1) and
 * LAFEA forbids literal mesh-extent and quality limits, requiring each to carry
 * its value, its limit and the source of the limit (S-5, AD-S2.1, AD-S5.3).
 *
 * One resolver satisfies both. A profile entry is a record
 * `{ value, source }` — the number and where it came from. There are no
 * defaults: an absent entry is a rejection, never a substitution.
 */

export const DECLARED_VALUE_FIELDS = Object.freeze(['value', 'source']);

/**
 * @param {object} profile Profile record.
 * @param {string} field Field name, camelCase.
 * @param {{minimum?:number, maximum?:number, exclusiveMinimum?:number}} [bounds]
 *        Hard caps that are properties of the method, not of the project — for
 *        example the mesh growth-ratio cap of 1.5 above which grading degrades
 *        the solution regardless of who authored the profile.
 * @returns {Readonly<{field:string, value:number, source:string}>}
 */
export function requireDeclaredValue(profile, field, bounds = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new SharedAnalysisContractError('profile must be a record', 'PROFILE_NOT_DECLARED');
  }
  const entry = profile[field];
  if (entry === undefined || entry === null) {
    throw new SharedAnalysisContractError(`profile.${field} is not declared`, undeclaredCode(field));
  }
  exactKeys(entry, DECLARED_VALUE_FIELDS, `profile.${field}`);
  const value = finiteNumber(entry.value, `profile.${field}.value`);
  const source = nonEmptyString(entry.source, `profile.${field}.source`);
  applyBounds(field, value, bounds);
  return Object.freeze({ field, value, source });
}

function applyBounds(field, value, bounds) {
  if (bounds.minimum !== undefined && !(value >= bounds.minimum)) {
    throw new SharedAnalysisContractError(
      `profile.${field}.value ${value} is below the declared minimum ${bounds.minimum}`,
      'DECLARED_VALUE_BELOW_MINIMUM',
    );
  }
  if (bounds.exclusiveMinimum !== undefined && !(value > bounds.exclusiveMinimum)) {
    throw new SharedAnalysisContractError(
      `profile.${field}.value ${value} must exceed ${bounds.exclusiveMinimum}`,
      'DECLARED_VALUE_BELOW_MINIMUM',
    );
  }
  if (bounds.maximum !== undefined && !(value <= bounds.maximum)) {
    throw new SharedAnalysisContractError(
      `profile.${field}.value ${value} exceeds the hard cap ${bounds.maximum}`,
      'DECLARED_VALUE_ABOVE_MAXIMUM',
    );
  }
}

/**
 * Record a computed quantity against a declared limit, carrying the value, the
 * limit and the source of the limit — the three things an applicability panel
 * has to show (LAFEA S-5 test 5).
 *
 * @param {string} checkId Stable check identity.
 * @param {number} actual Computed value.
 * @param {Readonly<{field:string, value:number, source:string}>} limit Declared limit.
 * @param {'AT_MOST'|'AT_LEAST'} sense Direction of the comparison.
 * @returns {Readonly<object>} Check record.
 */
export function declaredLimitCheck(checkId, actual, limit, sense) {
  const value = finiteNumber(actual, `${checkId}.actual`);
  if (sense !== 'AT_MOST' && sense !== 'AT_LEAST') {
    throw new SharedAnalysisContractError(`${checkId} sense must be AT_MOST or AT_LEAST`, 'UNSUPPORTED_VALUE');
  }
  return Object.freeze({
    checkId: nonEmptyString(checkId, 'checkId'),
    actual: value,
    limitField: limit.field,
    limit: limit.value,
    limitSource: limit.source,
    sense,
    accepted: sense === 'AT_MOST' ? value <= limit.value : value >= limit.value,
  });
}
