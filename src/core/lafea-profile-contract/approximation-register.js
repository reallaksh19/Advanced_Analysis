import { LafeaProfileContractError } from './errors.js';
import { exactKeys, member, nonEmptyString } from '../shared-analysis-contract/validation.js';

/**
 * The nine named approximations spec §14 requires disclosure for, each with
 * its mandatory disclosure text taken verbatim from the spec table. The text
 * is authoritative and is never supplied by a caller — an approximation
 * cannot be silently disclosed with different words per document.
 */
export const APPROXIMATION_IDS = Object.freeze({
  PLANE_STRESS: 'PLANE_STRESS',
  PLANE_STRAIN: 'PLANE_STRAIN',
  SHELL_MIDSURFACE: 'SHELL_MIDSURFACE',
  WELD_FOOTPRINT: 'WELD_FOOTPRINT',
  RIGID_SPIDER_MPC: 'RIGID_SPIDER_MPC',
  SYMMETRY: 'SYMMETRY',
  TRUNCATED_DOMAIN: 'TRUNCATED_DOMAIN',
  LINEAR_ELASTICITY: 'LINEAR_ELASTICITY',
  STRESS_LINEARIZATION: 'STRESS_LINEARIZATION',
});

export const APPROXIMATION_DISCLOSURES = Object.freeze({
  PLANE_STRESS: 'Valid for thin planar regions with negligible out-of-plane stress; thickness and load conversion required.',
  PLANE_STRAIN: 'Valid for long/prismatic constrained regions with negligible out-of-plane strain; end effects excluded.',
  SHELL_MIDSURFACE: 'Through-thickness stress is reconstructed from shell resultants; local 3D notch/contact effects are excluded.',
  WELD_FOOTPRINT: 'Weld represented by line/patch stiffness or tie; weld-root/toe notch stress requires separate method.',
  RIGID_SPIDER_MPC: 'May introduce local artificial stress; code SCLs shall be placed outside the coupling singular zone.',
  SYMMETRY: 'Requires geometric, material, loading and boundary symmetry for each evaluated case.',
  TRUNCATED_DOMAIN: 'Cut-boundary distance and constraint type require convergence/sensitivity evidence.',
  LINEAR_ELASTICITY: 'No load redistribution, yielding, contact or large-deformation effects.',
  STRESS_LINEARIZATION: 'SCL orientation and category assignment are engineering decisions; automatic suggestions are advisory.',
});

/**
 * Spec §14.1 status enum. `UNRESOLVED` blocks solve or code acceptance.
 */
export const APPROXIMATION_STATUSES = Object.freeze(['ACCEPTED', 'CONDITIONAL', 'OUTSIDE_SCOPE', 'UNRESOLVED']);

const ENTRY_FIELDS = Object.freeze(['approximationId', 'status', 'statusRationale']);

function canonicalApproximationEntry(source) {
  exactKeys(source, ENTRY_FIELDS, 'approximationEntry');
  const approximationId = member(source.approximationId, Object.values(APPROXIMATION_IDS), 'approximationEntry.approximationId');
  return Object.freeze({
    approximationId,
    status: member(source.status, APPROXIMATION_STATUSES, 'approximationEntry.status'),
    statusRationale: nonEmptyString(source.statusRationale, 'approximationEntry.statusRationale'),
    disclosure: APPROXIMATION_DISCLOSURES[approximationId],
  });
}

/**
 * Canonicalize a full approximation register: exactly one entry per named
 * approximation, in canonical (declaration) order. Missing or duplicated
 * entries are rejected — every approximation must be explicitly addressed,
 * never left implicit.
 *
 * @param {object[]} source Candidate entries, any order.
 * @returns {Readonly<{entries: readonly object[], blocksAcceptance: boolean}>}
 */
export function canonicalApproximationRegister(source) {
  if (!Array.isArray(source)) {
    throw new LafeaProfileContractError('approximationRegister must be an array', 'NOT_AN_ARRAY');
  }
  const seen = new Set();
  const canonicalEntries = source.map((entry) => {
    const canonical = canonicalApproximationEntry(entry);
    if (seen.has(canonical.approximationId)) {
      throw new LafeaProfileContractError(`Duplicate approximation entry: ${canonical.approximationId}`, 'DUPLICATE_APPROXIMATION');
    }
    seen.add(canonical.approximationId);
    return canonical;
  });
  const allIds = Object.values(APPROXIMATION_IDS);
  const missing = allIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new LafeaProfileContractError(`approximationRegister is missing ${missing.join(', ')}`, 'MISSING_APPROXIMATION');
  }
  const ordered = Object.freeze(allIds.map((id) => canonicalEntries.find((entry) => entry.approximationId === id)));
  const blocksAcceptance = ordered.some((entry) => entry.status === 'UNRESOLVED');
  return Object.freeze({ entries: ordered, blocksAcceptance });
}

/**
 * Fail closed at result-acceptance time when any approximation remains
 * `UNRESOLVED` (spec §14.1: "Blocks solve or code acceptance.").
 *
 * @param {Readonly<{entries: readonly object[], blocksAcceptance: boolean}>} register
 * @returns {Readonly<object>} The same register, on acceptance.
 */
export function requireAcceptableApproximationRegister(register) {
  if (register.blocksAcceptance) {
    const unresolved = register.entries.filter((entry) => entry.status === 'UNRESOLVED').map((entry) => entry.approximationId);
    throw new LafeaProfileContractError(`Unresolved approximations block acceptance: ${unresolved.join(', ')}`, 'UNRESOLVED_APPROXIMATION');
  }
  return register;
}
