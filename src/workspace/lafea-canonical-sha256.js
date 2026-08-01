/**
 * Strict canonical JSON and synchronous SHA-256 for LAFEA engineering identities.
 *
 * This module is browser/Node compatible and has no dependency on the editor's
 * FNV revision digest. It accepts JSON-safe plain data only.
 */

export const LAFEA_CANONICAL_SHA256_PROFILE = 'LAFEA_CANONICAL_JSON_SHA256_V1';

export function canonicalLafeaJson(value) {
  return stringifyValue(value, new WeakSet(), '$');
}

export function canonicalLafeaSha256(value) {
  return `sha256:${sha256Hex(utf8Bytes(canonicalLafeaJson(value)))}`;
}

function stringifyValue(value, seen, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number.`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== 'object') throw new TypeError(`${path} contains non-JSON data.`);
  if (seen.has(value)) throw new TypeError(`${path} contains a cycle.`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError(`${path} uses a custom array prototype.`);
      }
      const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
      if (keys.some((key) => typeof key === 'symbol') || keys.length !== value.length) {
        throw new TypeError(`${path} contains array holes or extra properties.`);
      }
      const rows = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        validateDescriptor(descriptor, `${path}[${index}]`);
        rows.push(stringifyValue(descriptor.value, seen, `${path}[${index}]`));
      }
      return `[${rows.join(',')}]`;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError(`${path} must contain plain JSON objects.`);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) throw new TypeError(`${path} contains symbol keys.`);
    const ordered = [...keys].sort(codeUnitCompare);
    return `{${ordered.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      validateDescriptor(descriptor, `${path}.${key}`);
      return `${JSON.stringify(key)}:${stringifyValue(descriptor.value, seen, `${path}.${key}`)}`;
    }).join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function validateDescriptor(descriptor, path) {
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)
    || 'get' in descriptor || 'set' in descriptor) {
    throw new TypeError(`${path} contains a non-JSON property.`);
  }
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function utf8Bytes(text) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text);
  const encoded = unescape(encodeURIComponent(text));
  return Uint8Array.from(encoded, (character) => character.charCodeAt(0));
}

function sha256Hex(bytes) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bitLength = bytes.length * 8;
  const totalLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(totalLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(totalLength - 4, bitLength >>> 0, false);
  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7)
        ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17)
        ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = add32(words[index - 16], s0, words[index - 7], s1);
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = add32(h, sigma1, choose, constants[index], words[index]);
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = add32(sigma0, majority);
      h = g; g = f; f = e; e = add32(d, temp1);
      d = c; c = b; b = a; a = add32(temp1, temp2);
    }
    state[0] = add32(state[0], a); state[1] = add32(state[1], b);
    state[2] = add32(state[2], c); state[3] = add32(state[3], d);
    state[4] = add32(state[4], e); state[5] = add32(state[5], f);
    state[6] = add32(state[6], g); state[7] = add32(state[7], h);
  }
  return state.map((value) => value.toString(16).padStart(8, '0')).join('');
}

function rotateRight(value, count) {
  return (value >>> count) | (value << (32 - count));
}

function add32(...values) {
  let result = 0;
  for (const value of values) result = (result + value) >>> 0;
  return result;
}
