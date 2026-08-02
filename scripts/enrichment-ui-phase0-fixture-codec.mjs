import { createHash } from 'node:crypto';

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (ArrayBuffer.isView(value)) return stableStringify(Array.from(value));
  const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

export function sha256Text(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

export function hashTypedArray(array) {
  return createHash('sha256')
    .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
    .digest('hex');
}

