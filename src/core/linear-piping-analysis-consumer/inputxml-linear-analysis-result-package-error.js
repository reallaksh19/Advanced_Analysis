export class InputXmlLinearAnalysisResultPackageError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'InputXmlLinearAnalysisResultPackageError';
    this.code = code;
  }
}

export function inputXmlAnalysisResultPackageFailure(message, code) {
  throw new InputXmlLinearAnalysisResultPackageError(message, code);
}
