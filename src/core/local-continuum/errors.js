import { QUALIFICATION_STATES } from './constants.js';
export class ContinuumError extends Error {
  constructor(state, code, path, message) {
    super(message); this.name = 'ContinuumError';
    this.state = state; this.code = code; this.path = path;
  }
}
export function modelError(code,path,message){return new ContinuumError(QUALIFICATION_STATES.REJECTED_MODEL,code,path,message);}
export function loadError(code,path,message){return new ContinuumError(QUALIFICATION_STATES.REJECTED_LOAD_CASE,code,path,message);}
export function unsupportedError(code,path,message){return new ContinuumError(QUALIFICATION_STATES.UNSUPPORTED_REQUEST,code,path,message);}
export function singularError(code,path,message){return new ContinuumError(QUALIFICATION_STATES.SINGULAR_SYSTEM,code,path,message);}
export function numericalError(code,path,message){return new ContinuumError(QUALIFICATION_STATES.NUMERICAL_FAILURE,code,path,message);}
