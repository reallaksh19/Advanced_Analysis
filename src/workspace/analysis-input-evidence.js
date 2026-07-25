import { freezeDeep } from './dataset-utils.js';

export const INPUT_EVIDENCE_SOURCES = Object.freeze([
  'source',
  'derived',
  'override',
  'missing',
]);

const SOURCE_SET = new Set(INPUT_EVIDENCE_SOURCES);

export function createInputField(definition = {}) {
  const key = nonEmptyString(definition.key, 'key');
  const kind = definition.kind === 'string' ? 'string' : 'number';
  const source = SOURCE_SET.has(definition.source) ? definition.source : 'missing';
  const value = normalizeDisplayValue(definition.value, kind);
  return freezeDeep({
    key,
    label: nonEmptyString(definition.label || key, 'label'),
    unit: String(definition.unit || ''),
    kind,
    required: definition.required !== false,
    editable: definition.editable !== false,
    value,
    source: value === null || value === '' ? 'missing' : source,
    sourcePath: String(definition.sourcePath || ''),
    validation: String(definition.validation || ''),
  });
}

export function createInspection(fields, readiness) {
  if (!Array.isArray(fields)) throw new TypeError('Analysis input inspection fields must be an array.');
  if (fields.length > 64) throw new RangeError('Analysis input inspection is limited to 64 fields.');
  const normalizedFields = fields.map(createInputField);
  const normalizedReadiness = normalizeReadiness(readiness);
  return freezeDeep({
    fields: normalizedFields,
    readiness: normalizedReadiness,
    summary: {
      fieldCount: normalizedFields.length,
      overrideCount: normalizedFields.filter((field) => field.source === 'override').length,
      missingCount: normalizedFields.filter((field) => field.required && field.source === 'missing').length,
      invalidCount: normalizedFields.filter((field) => Boolean(field.validation)).length,
    },
  });
}

export function normalizeOverride(field, rawValue) {
  if (!field?.editable) throw new TypeError(`Analysis input is not editable: ${field?.key || 'unknown'}.`);
  if (rawValue === '' || rawValue === null || rawValue === undefined) return null;
  if (field.kind === 'string') return String(rawValue).trim();
  const value = Number(rawValue);
  if (!Number.isFinite(value)) throw new TypeError(`${field.label} must be a finite number.`);
  if (field.validation === 'positive' && value <= 0) {
    throw new RangeError(`${field.label} must be greater than zero.`);
  }
  if (field.validation === 'non-negative' && value < 0) {
    throw new RangeError(`${field.label} must be zero or greater.`);
  }
  return value;
}

export function overrideValue(context, key) {
  const overrides = context?.analysisSession?.overrides;
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, key)) return undefined;
  return overrides[key];
}

export function hasOverride(context, key) {
  return overrideValue(context, key) !== undefined;
}

function normalizeReadiness(value) {
  const ready = value?.enabled === true;
  return {
    enabled: ready,
    reason: String(value?.reason || ''),
    missing: Array.isArray(value?.missing) ? value.missing.map(String) : [],
  };
}

function normalizeDisplayValue(value, kind) {
  if (value === null || value === undefined || value === '') return null;
  if (kind === 'string') return String(value);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`Analysis input ${field} must be a non-empty string.`);
  }
  return value.trim();
}
