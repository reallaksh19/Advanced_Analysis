import { modelError, numericalError } from './errors.js';
export function strictNumber(value,path){if(typeof value!=='number'||!Number.isFinite(value))throw modelError('FINITE_NUMBER_REQUIRED',path,`${path} must be a finite number without coercion.`);return Object.is(value,-0)?0:value;}
export function positiveNumber(value,path){const result=strictNumber(value,path);if(result<=0)throw modelError('POSITIVE_NUMBER_REQUIRED',path,`${path} must be greater than zero.`);return result;}
export function canonicalNumber(value,path='calculation'){if(!Number.isFinite(value))throw numericalError('NON_FINITE_CALCULATION',path,`${path} is non-finite.`);return Object.is(value,-0)?0:value;}
export function tolerance(profile,key,...values){const rule=profile.tolerances[key];const scale=Math.max(1,...values.map((value)=>Math.abs(value)));return canonicalNumber(rule.absolute+rule.relative*scale,`tolerance.${key}`);}
export function within(actual,expected,limit){return Math.abs(actual-expected)<=limit;}
export function maxAbs(values){let maximum=0;for(const value of values.flat(Infinity))maximum=Math.max(maximum,Math.abs(value));return maximum;}
