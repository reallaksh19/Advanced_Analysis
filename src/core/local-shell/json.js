import { ShellModelError } from './errors.js';
import { normalizeZero } from './numeric.js';

export function strictClone(value) {
  return cloneValue(value, new WeakSet(), '$');
}

function cloneValue(value, seen, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return cloneNumber(value, path);
  if (typeof value !== 'object') throw new ShellModelError(`${path} must contain JSON-safe plain data`);
  if (seen.has(value)) throw new ShellModelError(`${path} must not contain a cycle`);
  seen.add(value);
  const result = Array.isArray(value) ? cloneArray(value, seen, path) : cloneRecord(value, seen, path);
  seen.delete(value);
  return result;
}

function cloneNumber(value, path) {
  if (!Number.isFinite(value)) throw new ShellModelError(`${path} must not contain a non-finite number`);
  return normalizeZero(value);
}

function cloneArray(value, seen, path) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new ShellModelError(`${path} must not use a custom array prototype`);
  }
  const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
  if (keys.some((key) => typeof key === 'symbol')) {
    throw new ShellModelError(`${path} contains a non-JSON array property`);
  }
  if (keys.length !== value.length) throw new ShellModelError(`${path} array must not contain holes or extra properties`);
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new ShellModelError(`${path} array must not contain holes`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    validateDescriptor(descriptor, `${path}[${index}]`);
    result.push(cloneValue(descriptor.value, seen, `${path}[${index}]`));
  }
  return result;
}

function cloneRecord(value, seen, path) {
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ShellModelError(`${path} must contain plain JSON objects`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol')) throw new ShellModelError(`${path} contains a non-JSON record property`);
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    validateDescriptor(descriptor, `${path}.${key}`);
    result[key] = cloneValue(descriptor.value, seen, `${path}.${key}`);
  }
  return result;
}

function validateDescriptor(descriptor, path) {
  if (!descriptor || !descriptor.enumerable || 'get' in descriptor || 'set' in descriptor) {
    throw new ShellModelError(`${path} contains a non-JSON record property`);
  }
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function canonicalStringify(value) {
  return stringifyValue(value);
}

function stringifyValue(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(normalizePrimitive(value));
  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(',')}]`;
  const keys = Object.keys(value).sort(codeUnitCompare);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stringifyValue(value[key])}`).join(',')}}`;
}

function normalizePrimitive(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot stringify non-finite number');
    return normalizeZero(value);
  }
  return value;
}

export function semanticHash(value) {
  const text = canonicalStringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
