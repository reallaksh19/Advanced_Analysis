/**
 * Section 7.2 / section 8 "Reuse": one factorization reused across load cases
 * sharing `stiffnessStateHash` and constrained partition, not load-case or
 * evidence hash. The cache key is built by the caller from exactly those two
 * identities (see `solve.js`); this module only stores and returns whatever
 * object was factorized under that key, so reuse is a plain object-identity
 * fact a test can assert with `===`, not a claim.
 */
export function createFactorizationCache() {
  return new Map();
}

/**
 * @param {Map<string, object>} cache
 * @param {string} key `${stiffnessStateHash}:${partitionHash}`.
 * @param {() => object} factorize Builds a fresh factorization; called only on a cache miss.
 * @returns {{factorization:object, reused:boolean}}
 */
export function getOrFactorize(cache, key, factorize) {
  if (cache.has(key)) return { factorization: cache.get(key), reused: true };
  const factorization = factorize();
  cache.set(key, factorization);
  return { factorization, reused: false };
}
