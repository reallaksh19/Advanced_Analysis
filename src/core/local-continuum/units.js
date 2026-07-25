import { CANONICAL_UNITS } from './constants.js';
import { modelError } from './errors.js';
import { canonicalNumber } from './numeric.js';
import { exactRecord } from './validation.js';
const FACTORS=Object.freeze({
  length:Object.freeze({mm:1,m:1000}), force:Object.freeze({N:1,kN:1000}),
  stress:Object.freeze({MPa:1,kPa:1e-3,Pa:1e-6}), modulus:Object.freeze({MPa:1,GPa:1000}),
});
export function canonicalizeUnits(value){const row=exactRecord(value,['length','force','stress','modulus'],'units');const declared={},conversionFactors={};for(const key of Object.keys(FACTORS)){const unit=row[key];if(typeof unit!=='string'||!Object.hasOwn(FACTORS[key],unit))throw modelError('UNSUPPORTED_UNIT',`units.${key}`,`Unsupported ${key} unit.`);declared[key]=unit;conversionFactors[key]=FACTORS[key][unit];}return {declared,canonical:CANONICAL_UNITS,conversionFactors};}
export function convert(value,dimension,units,path){return canonicalNumber(value*units.conversionFactors[dimension],path);}
