export class ShellModelError extends Error {
  constructor(message, code = 'REJECTED_MODEL') {
    super(message);
    this.name = 'ShellModelError';
    this.code = code;
  }
}

export class ShellLoadCaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShellLoadCaseError';
    this.code = 'REJECTED_LOAD_CASE';
  }
}

export class ShellSingularSystemError extends Error {
  constructor(message, evidence = null) {
    super(message);
    this.name = 'ShellSingularSystemError';
    this.code = 'SINGULAR_SYSTEM';
    this.evidence = evidence;
  }
}

export class ShellNumericalError extends Error {
  constructor(message, evidence = null) {
    super(message);
    this.name = 'ShellNumericalError';
    this.code = 'NUMERICAL_FAILURE';
    this.evidence = evidence;
  }
}
