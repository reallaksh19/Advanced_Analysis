import { QUALIFICATION_STATES } from './constants.js';

export class TrunnionFootprintError extends Error {
  constructor(state, code, path, message, evidence = null) {
    super(message);
    this.name = 'TrunnionFootprintError';
    this.state = state;
    this.code = code;
    this.path = path;
    this.evidence = evidence;
  }
}

export function sourceError(code, path, message, evidence) {
  return new TrunnionFootprintError(QUALIFICATION_STATES.REJECTED_SOURCE_EVIDENCE, code, path, message, evidence);
}
export function geometryError(code, path, message, evidence) {
  return new TrunnionFootprintError(QUALIFICATION_STATES.REJECTED_GEOMETRY, code, path, message, evidence);
}
export function footprintError(code, path, message, evidence) {
  return new TrunnionFootprintError(QUALIFICATION_STATES.REJECTED_FOOTPRINT, code, path, message, evidence);
}
export function distributionError(code, path, message, evidence) {
  return new TrunnionFootprintError(QUALIFICATION_STATES.REJECTED_LOAD_DISTRIBUTION, code, path, message, evidence);
}
export function shellModelError(code, path, message, evidence) {
  return new TrunnionFootprintError(QUALIFICATION_STATES.REJECTED_SHELL_MODEL, code, path, message, evidence);
}
export function shellResultError(code, path, message, evidence) {
  return new TrunnionFootprintError(QUALIFICATION_STATES.REJECTED_SHELL_RESULT, code, path, message, evidence);
}
export function unsupportedError(code, path, message, evidence) {
  return new TrunnionFootprintError(QUALIFICATION_STATES.UNSUPPORTED_REQUEST, code, path, message, evidence);
}