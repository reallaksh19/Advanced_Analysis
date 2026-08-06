export class InputXmlLinearRecoveryError extends Error {
  constructor(message, code, data) {
    super(message);
    this.name = 'InputXmlLinearRecoveryError';
    this.code = code;
    this.data = data ?? {};
  }
}

export function inputXmlRecoveryFailure(message, code, data) {
  throw new InputXmlLinearRecoveryError(message, code, data);
}
