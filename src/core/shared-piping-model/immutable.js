export function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  return freezeValue(value, new WeakSet());
}

function freezeValue(value, seen) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((child) => freezeValue(child, seen));
  return Object.freeze(value);
}

export function stringValue(value) {
  return String(value ?? '').trim();
}

export function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
