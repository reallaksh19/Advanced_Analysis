/**
 * Rejection carrier for the LAFEA upgrade-spec profile contract (spec §15).
 *
 * Every rejection carries a stable machine code so a check script can assert
 * the reason by name rather than by message text, matching the convention in
 * `shared-analysis-contract/errors.js`.
 */
export class LafeaProfileContractError extends Error {
  constructor(message, code = 'REJECTED_PROFILE') {
    super(message);
    this.name = 'LafeaProfileContractError';
    this.code = code;
  }
}
