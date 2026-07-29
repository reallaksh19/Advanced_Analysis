export class LafeaGeometryError extends Error {
  constructor(message, code = 'REJECTED_GEOMETRY') {
    super(message);
    this.name = 'LafeaGeometryError';
    this.code = code;
  }
}
