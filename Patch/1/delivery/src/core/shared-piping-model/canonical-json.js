import { isPlainRecord } from './immutable.js';

// FNV-1a 64-bit multiplier 0x100000001b3, split into 32-bit halves so the hash
// can be computed without BigInt. See hashBytes() for the derivation.
const FNV_PRIME_LOW = 0x000001b3;
const FNV_PRIME_HIGH = 0x00000100;

export function canonicalizeJson(value) {
  return canonicalize(value, new Set(), '$');
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalizeJson(value));
}

export function canonicalPrettyStringify(value) {
  return `${JSON.stringify(canonicalizeJson(value), null, 2)}\n`;
}

export function semanticHash(value) {
  return hashUtf8(canonicalStringify(value));
}

export function hashUtf8(value) {
  return hashBytes(new TextEncoder().encode(String(value)));
}

/**
 * FNV-1a 64-bit, computed as two uint32 halves.
 *
 * Bit-identical to the previous BigInt implementation. Proven by benchmark case
 * BM-T5-HASH, which retains the BigInt reference permanently and compares them
 * on fixed vectors plus 500 seeded pseudo-random inputs. Every committed
 * evidence bundle depends on this value, so the equality is not optional.
 *
 * Derivation. The multiplier is
 *
 *     0x100000001b3 = (FNV_PRIME_HIGH << 32) | FNV_PRIME_LOW
 *                   = (0x100 << 32) | 0x1b3
 *
 * so for a 64-bit accumulator (hi, lo) the product modulo 2^64 is
 *
 *     lo' = lo * PL                        (mod 2^32)
 *     hi' = hi * PL + lo * PH + carry      (mod 2^32)
 *
 * where `carry` is the overflow out of bit 31 of `lo * PL`. The terms
 * hi * 2^32 * PH and above fall entirely outside 64 bits and are discarded,
 * which is exactly what the BigInt mask did.
 *
 * `lo * PL` is split into 16-bit halves so that each partial product stays
 * below 2^32 and is therefore exact in float64 (which is exact to 2^53).
 * `Math.imul` is used for the `hi` terms, where only the low 32 bits are kept.
 *
 * @param {Uint8Array|Array<number>} bytes Input bytes.
 * @returns {string} `fnv1a64:` followed by 16 lowercase hex digits.
 */
export function hashBytes(bytes) {
  let hi = 0xcbf29ce4 >>> 0;
  let lo = 0x84222325 >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    lo = (lo ^ bytes[index]) >>> 0;
    const low16 = lo & 0xffff;
    const high16 = lo >>> 16;
    const partialLow = low16 * FNV_PRIME_LOW;
    const partialHigh = high16 * FNV_PRIME_LOW + (partialLow >>> 16);
    const nextLo = (((partialHigh & 0xffff) << 16) | (partialLow & 0xffff)) >>> 0;
    const carry = Math.floor(partialHigh / 0x10000);
    hi = (Math.imul(hi, FNV_PRIME_LOW) + Math.imul(lo, FNV_PRIME_HIGH) + carry) >>> 0;
    lo = nextLo;
  }
  return `fnv1a64:${hi.toString(16).padStart(8, '0')}${lo.toString(16).padStart(8, '0')}`;
}

export function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value)).length;
}

function canonicalize(value, active, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return finiteJsonNumber(value, path);
  if (Array.isArray(value)) return canonicalizeArray(value, active, path);
  if (isPlainRecord(value)) return canonicalizeRecord(value, active, path);
  throw new TypeError(`Canonical JSON does not support ${typeof value} at ${path}.`);
}

function canonicalizeArray(value, active, path) {
  assertNotActive(value, active, path);
  active.add(value);
  const result = value.map((child, index) => canonicalize(child, active, `${path}[${index}]`));
  active.delete(value);
  return result;
}

function canonicalizeRecord(value, active, path) {
  assertNotActive(value, active, path);
  active.add(value);
  const result = {};
  Object.keys(value).sort().forEach((key) => {
    if (value[key] !== undefined) result[key] = canonicalize(value[key], active, `${path}.${key}`);
  });
  active.delete(value);
  return result;
}

function finiteJsonNumber(value, path) {
  if (!Number.isFinite(value)) throw new TypeError(`Canonical JSON requires a finite number at ${path}.`);
  return Object.is(value, -0) ? 0 : value;
}

function assertNotActive(value, active, path) {
  if (active.has(value)) throw new TypeError(`Canonical JSON cannot serialize a cycle at ${path}.`);
}
