/**
 * Section 7.2 / section 8 "Reuse": one factorization reused across load cases
 * sharing `stiffnessStateHash` and constrained partition, never load-case or
 * evidence hash. Backend variants are segregated inside that engineering key
 * so a sparse request can never receive a cached dense factorization (or vice
 * versa), while repeated solves on the same declared backend retain object
 * identity for the existing reuse proof.
 */
export function createFactorizationCache() {
  return new Map();
}

/**
 * @param {Map<string, Map<string, object>>} cache
 * @param {string} key `${stiffnessStateHash}:${partitionHash}`.
 * @param {string} backend Declared backend identity.
 * @param {() => object} factorize Builds a fresh factorization; called only on a cache miss.
 * @returns {{factorization:object, reused:boolean}}
 */
export function getOrFactorize(cache, key, backend, factorize) {
  let variants = cache.get(key);
  if (variants === undefined) {
    variants = new Map();
    cache.set(key, variants);
  }
  if (variants.has(backend)) return { factorization: variants.get(backend), reused: true };
  const factorization = factorize();
  variants.set(backend, factorization);
  return { factorization, reused: false };
}
