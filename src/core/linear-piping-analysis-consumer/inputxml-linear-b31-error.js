export class InputXmlLinearB31EvaluationError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'InputXmlLinearB31EvaluationError';
    this.code = code;
    this.details = details ?? {};
  }
}

export function inputXmlB31Failure(message, code, details) {
  throw new InputXmlLinearB31EvaluationError(message, code, details);
}
