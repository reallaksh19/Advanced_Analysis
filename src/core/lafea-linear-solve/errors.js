export class LafeaLinearSolveError extends Error {
  constructor(message, code = 'REJECTED_SOLVE', evidence = null) {
    super(message);
    this.name = 'LafeaLinearSolveError';
    this.code = code;
    this.evidence = evidence;
  }
}
