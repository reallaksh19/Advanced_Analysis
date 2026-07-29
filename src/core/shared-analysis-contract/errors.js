/**
 * Rejection carrier for the contract tier shared by the centerline beam (LFEA)
 * and local shell (LAFEA) kernels.
 *
 * Every rejection carries a stable machine code so a check script can assert
 * the reason by name rather than by message text.
 */
export class SharedAnalysisContractError extends Error {
  constructor(message, code = 'REJECTED_SHARED_CONTRACT') {
    super(message);
    this.name = 'SharedAnalysisContractError';
    this.code = code;
  }
}

/**
 * Convert a camelCase profile field into the SCREAMING_SNAKE undeclared code
 * both plans quote, e.g. `spanSeedingLimit` -> `SPAN_SEEDING_LIMIT_NOT_DECLARED`.
 *
 * @param {string} field Profile field name.
 * @returns {string} Rejection code.
 */
export function undeclaredCode(field) {
  const screaming = field
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
    .toUpperCase();
  return `${screaming}_NOT_DECLARED`;
}
