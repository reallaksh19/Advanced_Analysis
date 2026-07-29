import { LafeaMeshingError } from './errors.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { finiteNumber, positiveNumber } from '../shared-analysis-contract/numeric.js';

/**
 * Distance-field local refinement (spec §10.2): a target element size at any
 * point is the minimum of the global target size and every declared
 * refinement seed's own local sizing function. Geometric growth away from a
 * seed keeps the adjacent-size ratio bounded by the declared growth ratio —
 * this is the mechanism `adjacentSizeRatioMax` (spec §10.3) is checked
 * against downstream, not enforced by construction alone.
 */

const SEED_FIELDS = Object.freeze(['seedId', 'origin', 'localSize', 'label']);

export function canonicalRefinementSeed(source) {
  exactKeys(source, SEED_FIELDS, 'refinementSeed');
  const seedId = nonEmptyString(source.seedId, 'refinementSeed.seedId');
  exactKeys(source.origin, ['x', 'y'], `refinementSeed.${seedId}.origin`);
  return Object.freeze({
    seedId,
    origin: Object.freeze({ x: finiteNumber(source.origin.x, `refinementSeed.${seedId}.origin.x`), y: finiteNumber(source.origin.y, `refinementSeed.${seedId}.origin.y`) }),
    localSize: positiveNumber(source.localSize, `refinementSeed.${seedId}.localSize`),
    label: nonEmptyString(source.label, `refinementSeed.${seedId}.label`),
  });
}

export function canonicalRefinementSeedSet(source) {
  if (!Array.isArray(source)) throw new LafeaMeshingError('refinementSeeds must be an array', 'NOT_AN_ARRAY');
  const seen = new Set();
  const seeds = source.map((seed) => {
    const canonical = canonicalRefinementSeed(seed);
    if (seen.has(canonical.seedId)) throw new LafeaMeshingError(`Duplicate refinement seed: ${canonical.seedId}`, 'DUPLICATE_SEED');
    seen.add(canonical.seedId);
    return canonical;
  });
  return Object.freeze(seeds);
}

/**
 * Target element size at `point`: the minimum of the global target size and
 * every seed's geometric-growth sizing function `localSize * growthRatio ^
 * (distance / localSize)`.
 *
 * @param {{x:number,y:number}} point Query point.
 * @param {readonly object[]} seeds Canonical refinement seeds.
 * @param {number} globalTargetSize Field ceiling away from every seed.
 * @param {number} growthRatioMax The mesh profile's `adjacentSizeRatioMax`.
 * @returns {number} Target size at `point`, always positive.
 */
export function sizeAt(point, seeds, globalTargetSize, growthRatioMax) {
  positiveNumber(globalTargetSize, 'globalTargetSize');
  if (!(growthRatioMax > 1)) throw new LafeaMeshingError('growthRatioMax must exceed 1', 'INVALID_GROWTH_RATIO');
  let size = globalTargetSize;
  for (const seed of seeds) {
    const distance = Math.hypot(point.x - seed.origin.x, point.y - seed.origin.y);
    const seedSize = seed.localSize * Math.pow(growthRatioMax, distance / seed.localSize);
    size = Math.min(size, seedSize);
  }
  return size;
}
