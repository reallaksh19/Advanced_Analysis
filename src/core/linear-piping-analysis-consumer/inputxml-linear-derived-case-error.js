export class InputXmlLinearDerivedCaseError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'InputXmlLinearDerivedCaseError';
    this.code = code;
    this.details = details;
  }
}

export function inputXmlDerivedCaseFailure(message, code, details) {
  throw new InputXmlLinearDerivedCaseError(message, code, details);
}
