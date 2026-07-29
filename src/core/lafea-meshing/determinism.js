/**
 * Deterministic ordering primitives (spec §10.2: "Seed order, tie-breaks and
 * element numbering use canonical geometry identity; no random meshing.").
 * No PRNG exists anywhere in this package — every tie-break here is a total
 * order over declared identity strings, never `Math.random()`.
 */

export function codeUnitCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Stable sort by a caller-declared identity key, breaking remaining ties by
 * a second declared key so the result is a total order (never dependent on
 * input array position or engine sort stability alone).
 */
export function canonicalSort(items, primaryKeyOf, secondaryKeyOf) {
  return [...items].sort((a, b) => {
    const primary = codeUnitCompare(primaryKeyOf(a), primaryKeyOf(b));
    if (primary !== 0) return primary;
    if (!secondaryKeyOf) return 0;
    return codeUnitCompare(secondaryKeyOf(a), secondaryKeyOf(b));
  });
}

/**
 * Deterministic sequential numbering: assigns `1..n` to items already in
 * canonical order, with an explicit, caller-declared prefix so numbering
 * never collides across independently generated collections (e.g. nodes vs.
 * elements).
 */
export function assignCanonicalNumbers(orderedItems, prefix) {
  return orderedItems.map((item, index) => ({ ...item, canonicalId: `${prefix}${index + 1}` }));
}
