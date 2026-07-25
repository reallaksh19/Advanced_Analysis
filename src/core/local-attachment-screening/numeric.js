import { requestError } from './errors.js';
export function strictNumber(value,path){if(typeof value!=='number'||!Number.isFinite(value))throw requestError('FINITE_NUMBER_REQUIRED',path,`${path} must be a finite number.`);return canonicalNumber(value);}
export function canonicalNumber(value){if(!Number.isFinite(value))throw new TypeError('Calculated value must be finite.');return Object.is(value,-0)?0:value;}
export function tolerance(profile,quantity,...values){const rule=profile.tolerances[quantity];if(!rule)throw new TypeError(`Missing tolerance ${quantity}.`);return canonicalNumber(rule.absolute+rule.relative*Math.max(1,...values.map((v)=>Math.abs(v))));}
export function within(actual,expected,limit){return Math.abs(actual-expected)<=limit;}
export function normalizedAngle(value){const angle=strictNumber(value,'evaluationLocations.angle');const twoPi=2*Math.PI;const normalized=((angle%twoPi)+twoPi)%twoPi;return canonicalNumber(normalized===twoPi?0:normalized);}
