import { sourceError } from './errors.js';

export function strictClone(value) {
  return cloneValue(value, new Set(), '$');
}

function cloneValue(value, ancestors, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw sourceError('NONFINITE_VALUE', path, `${path} must be finite.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw sourceError('UNSUPPORTED_VALUE', path, `${path} contains unsupported data.`);
  if (ancestors.has(value)) throw sourceError('CYCLIC_VALUE', path, `${path} contains a cycle.`);
  ancestors.add(value);
  const result = Array.isArray(value) ? cloneArray(value, ancestors, path) : cloneRecord(value, ancestors, path);
  ancestors.delete(value);
  return result;
}

function cloneArray(value, ancestors, path) {
  if (Object.getPrototypeOf(value) !== Array.prototype) throw sourceError('CUSTOM_ARRAY', path, `${path} must use Array.prototype.`);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol')) throw sourceError('SYMBOL_KEY', path, `${path} contains a symbol key.`);
  const expected = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
  if (keys.some((key) => !expected.has(key))) throw sourceError('ARRAY_EXTRA_PROPERTY', path, `${path} contains an extra array property.`);
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw sourceError('SPARSE_OR_ACCESSOR_ARRAY', `${path}[${index}]`, `${path} must be dense data.`);
    output.push(cloneValue(descriptor.value, ancestors, `${path}[${index}]`));
  }
  return output;
}

function cloneRecord(value, ancestors, path) {
  if (Object.getPrototypeOf(value) !== Object.prototype) throw sourceError('NONPLAIN_OBJECT', path, `${path} must be a plain object.`);
  const output = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') throw sourceError('SYMBOL_KEY', path, `${path} contains a symbol key.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) throw sourceError('NONENUMERABLE_PROPERTY', `${path}.${key}`, `${path}.${key} must be enumerable.`);
    if (!('value' in descriptor)) throw sourceError('ACCESSOR_PROPERTY', `${path}.${key}`, `${path}.${key} must not be an accessor.`);
    output[key] = cloneValue(descriptor.value, ancestors, `${path}.${key}`);
  }
  return output;
}

export function canonicalStringify(value) {
  return stringify(value);
}
function stringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stringify).join(',')}]`;
  return `{${Object.keys(value).sort(codeUnitCompare).map((key) => `${JSON.stringify(key)}:${stringify(value[key])}`).join(',')}}`;
}
export function semanticHash(value) {
  const bytes = new TextEncoder().encode(canonicalStringify(value));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) { hash ^= BigInt(byte); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}
export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}
export function codeUnitCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
export function equalCanonical(left, right) { return canonicalStringify(left) === canonicalStringify(right); }