export class LafeaMeshingError extends Error {
  constructor(message, code = 'REJECTED_MESH') {
    super(message);
    this.name = 'LafeaMeshingError';
    this.code = code;
  }
}
