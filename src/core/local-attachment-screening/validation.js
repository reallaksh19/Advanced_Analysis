import { isPlainRecord } from '../shared-piping-model/index.js';
import { requestError } from './errors.js';
export function exactRecord(value,keys,path){if(!isPlainRecord(value))throw requestError('RECORD_REQUIRED',path,`${path} must be a plain record.`);const actual=Object.keys(value).sort(),expected=[...keys].sort();if(JSON.stringify(actual)!==JSON.stringify(expected))throw requestError('EXACT_KEYS_REQUIRED',path,`${path} keys must be ${expected.join(', ')}.`);return value;}
export function nonEmptyString(value,path){if(typeof value!=='string'||!value.trim())throw requestError('STRING_REQUIRED',path,`${path} must be a non-empty string.`);return value.trim();}
export function uniqueIdentities(rows,key,path){const seen=new Set();rows.forEach((row,index)=>{const value=row[key];if(seen.has(value))throw requestError('DUPLICATE_IDENTITY',`${path}[${index}].${key}`,`Duplicate ${key} ${value}.`);seen.add(value);});}
export function codeSort(left,right){return left<right?-1:left>right?1:0;}
export function deepClone(value,path='request') {
  try { assertJsonSafe(value,path,new Set()); return JSON.parse(JSON.stringify(value)); }
  catch(error){if(error?.state)throw error;throw requestError('JSON_SAFE_PLAIN_DATA_REQUIRED',path,`${path} must contain JSON-safe plain data only.`);}
}
function assertJsonSafe(value,path,seen) {
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'){if(!Number.isFinite(value))throw requestError('FINITE_NUMBER_REQUIRED',path,`${path} must be finite.`);return;}
  if(Array.isArray(value)){assertUnseen(value,path,seen);value.forEach((row,index)=>assertJsonSafe(row,`${path}[${index}]`,seen));seen.delete(value);return;}
  if(!isPlainRecord(value))throw requestError('JSON_SAFE_PLAIN_DATA_REQUIRED',path,`${path} must contain JSON-safe plain data only.`);
  assertUnseen(value,path,seen);for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')throw requestError('JSON_SAFE_PLAIN_DATA_REQUIRED',path,`${path} must not contain symbol keys.`);assertJsonSafe(value[key],`${path}.${key}`,seen);}seen.delete(value);
}
function assertUnseen(value,path,seen){if(seen.has(value))throw requestError('CYCLIC_INPUT_FORBIDDEN',path,`${path} must not contain cyclic references.`);seen.add(value);}
