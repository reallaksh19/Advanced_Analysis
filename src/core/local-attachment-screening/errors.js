import { QUALIFICATION_STATES } from './constants.js';
export class ScreeningError extends Error {
  constructor(state,code,path,message){super(message);this.name='ScreeningError';this.state=state;this.code=code;this.path=path;}
}
export function sourceError(code,path,message){return new ScreeningError(QUALIFICATION_STATES.REJECTED_SOURCE_EVIDENCE,code,path,message);}
export function requestError(code,path,message){return new ScreeningError(QUALIFICATION_STATES.REJECTED_REQUEST,code,path,message);}
export function unsupportedError(code,path,message){return new ScreeningError(QUALIFICATION_STATES.UNSUPPORTED_REQUEST,code,path,message);}
