import { freezeDeep } from './dataset-utils.js';

export const MAX_PROPERTY_ROWS = 240;

export function flattenProperties(value, limit = MAX_PROPERTY_ROWS) {
  const boundedLimit = Number.isInteger(limit) && limit > 0 ? limit : MAX_PROPERTY_ROWS;
  const rows = [];
  visit(value, '', rows, boundedLimit);
  return freezeDeep(rows);
}

function visit(value, path, rows, limit) {
  if (rows.length >= limit) return;

  if (value === null || value === undefined || typeof value !== 'object') {
    if (path) rows.push({ path, value: displayValue(value) });
    return;
  }

  if (Array.isArray(value)) {
    if (!value.length && path) rows.push({ path, value: '[]' });
    value.forEach((entry, index) => visit(entry, `${path}[${index}]`, rows, limit));
    return;
  }

  const entries = Object.entries(value);
  if (!entries.length && path) rows.push({ path, value: '{}' });
  entries.forEach(([key, entry]) => {
    if (rows.length >= limit) return;
    visit(entry, path ? `${path}.${key}` : key, rows, limit);
  });
}

function displayValue(value) {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
