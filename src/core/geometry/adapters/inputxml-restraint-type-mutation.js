/**
 * Governed CAESAR II InputXML restraint TYPE export-correction authority.
 *
 * Numeric InputXML TYPE values are exported source codes and pass through the
 * controlled seven-row correction exactly once. Textual aliases already state
 * canonical intent and resolve directly to the corrected code system; they are
 * never fed through the numeric export-correction table.
 */

export const CANONICAL_RESTRAINT_TYPE_CODES = Object.freeze({
  ANC: 0,
  ANCHOR: 0,
  A: 0,
  FIXED: 0,
  FIX: 0,
  X: 2,
  Y: 3,
  Z: 5,
  LIM: 8,
  LIMIT: 8,
  GUI: 9,
  GUIDE: 9,
  XSNB: 10,
  YSNB: 11,
  ZSNB: 12,
  '+X': 13,
  '+Y': 14,
  '+Z': 15,
  '-X': 16,
  '-Y': 17,
  '-Z': 18,
  '+RX': 19,
  '+RY': 20,
  '+RZ': 21,
  '-RX': 22,
  '-RY': 23,
  '-RZ': 24,
  '+LIM': 25,
  '-LIM': 26,
  XROD: 27,
  YROD: 28,
  ZROD: 29,
  '+XROD': 30,
  '+YROD': 31,
  '+ZROD': 32,
  '-XROD': 33,
  '-YROD': 34,
  '-ZROD': 35,
  X2: 36,
  Y2: 37,
  Z2: 38,
  RX2: 39,
  RY2: 40,
  RZ2: 41,
  '+X2': 42,
  '+Y2': 43,
  '+Z2': 44,
  '-X2': 45,
  '-Y2': 46,
  '-Z2': 47,
  '+RX2': 48,
  '+RY2': 49,
  '+RZ2': 50,
  '-RX2': 51,
  '-RY2': 52,
  '-RZ2': 53,
  XSPR: 54,
  YSPR: 55,
  ZSPR: 56,
  '+XSNB': 57,
  '+YSNB': 58,
  '+ZSNB': 59,
  '-XSNB': 60,
  '-YSNB': 61,
  '-ZSNB': 62,
});

// Compatibility export. These are corrected canonical codes, not raw export codes.
export const NATIVE_RESTRAINT_TYPE_CODES = CANONICAL_RESTRAINT_TYPE_CODES;

export const DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS = Object.freeze([
  Object.freeze({ label: '+Y', from: '17', to: '14' }),
  Object.freeze({ label: 'LIM', from: '7', to: '8' }),
  Object.freeze({ label: 'GUI', from: '10', to: '9' }),
  Object.freeze({ label: 'X', from: '1', to: '2' }),
  Object.freeze({ label: 'Y', from: '2', to: '3' }),
  Object.freeze({ label: 'Z', from: '3', to: '5' }),
  Object.freeze({ label: '', from: '18', to: '15' }),
]);

export const CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_SCHEMA =
  'caesar-inputxml-restraint-type-correction/v1';
export const CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID =
  'CAESAR_INPUTXML_RESTRAINT_TYPE_EXPORT_CORRECTION_V1';
export const CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_AUTHORITY =
  'PROJECT_CONTROLLED_CAESAR_INPUTXML_EXPORT_DEFECT_CORRECTION';

export const CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE = Object.freeze({
  schema: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_SCHEMA,
  profileId: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
  authority: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_AUTHORITY,
  requiredForGovernedBenchmarks: true,
  applicationRule: 'NORMALIZE_NUMERIC_SOURCE_THEN_APPLY_AT_MOST_ONE_MATCHING_ROW_V1',
  rows: DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS,
});

export const RESTRAINT_TYPE_MUTATION_INFO = [
  'Numeric InputXML restraint TYPE values are retained as exported source evidence.',
  `Controlled profile: ${CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID}.`,
  'The owner-confirmed seven-row table is applied exactly once before classification.',
  'Textual aliases resolve directly to corrected canonical codes and are never re-mutated.',
].join('\n');

const text = (value) => String(value ?? '').trim();

function mutationFailure(message, code = 'INPUTXML_RESTRAINT_TYPE_MUTATION_INVALID') {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function normalizeNumberText(value) {
  const raw = text(value);
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric)) return raw;
  return Math.abs(numeric - Math.round(numeric)) < 1e-9
    ? String(Math.round(numeric))
    : raw.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
}

function integerCodeOrNull(value) {
  const raw = text(value);
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric) || Math.abs(numeric - Math.round(numeric)) >= 1e-6) {
    return null;
  }
  const rounded = Math.round(numeric);
  return rounded >= 0 && rounded <= 62 ? rounded : null;
}

function requireMutationCode(value, field, index) {
  const code = integerCodeOrNull(value);
  if (code === null) {
    mutationFailure(`InputXML restraint mutation row ${index} ${field} must be an integer code from 0 through 62.`);
  }
  return String(code);
}

export function restraintTypeToCaesarCode(restraintType) {
  const numeric = integerCodeOrNull(restraintType);
  if (numeric !== null) return numeric;
  const normalized = text(restraintType).toUpperCase();
  if (!normalized) return null;
  return Object.prototype.hasOwnProperty.call(CANONICAL_RESTRAINT_TYPE_CODES, normalized)
    ? CANONICAL_RESTRAINT_TYPE_CODES[normalized]
    : null;
}

export function normalizeRestraintTypeMutationRows(rows = DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS) {
  const source = Array.isArray(rows) ? rows : DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS;
  const seen = new Map();
  return source.map((row, index) => {
    const normalized = {
      label: text(row?.label),
      from: requireMutationCode(row?.from, 'from', index),
      to: requireMutationCode(row?.to, 'to', index),
    };
    if (seen.has(normalized.from)) {
      const prior = seen.get(normalized.from);
      const detail = prior.to === normalized.to ? 'duplicate' : 'conflicting';
      mutationFailure(
        `InputXML restraint mutation row ${index} is ${detail} for source TYPE ${normalized.from}.`,
        detail === 'duplicate'
          ? 'INPUTXML_RESTRAINT_TYPE_MUTATION_DUPLICATE'
          : 'INPUTXML_RESTRAINT_TYPE_MUTATION_CONFLICT',
      );
    }
    seen.set(normalized.from, normalized);
    return normalized;
  });
}

export function defaultRestraintTypeMutationConfig() {
  return {
    enabled: true,
    rows: normalizeRestraintTypeMutationRows(DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS),
  };
}

export function normalizeRestraintTypeMutationConfig(config = {}) {
  return {
    enabled: config?.enabled !== false,
    rows: normalizeRestraintTypeMutationRows(config?.rows),
  };
}

/** Normalize without applying the numeric export correction. */
export function normalizeRestraintTypeValue(value) {
  const code = restraintTypeToCaesarCode(value);
  if (code !== null && code !== undefined) return String(code);
  return normalizeNumberText(value);
}

/** Resolve one source TYPE with complete, reviewable correction evidence. */
export function resolveRestraintTypeMutation(value, config = {}) {
  const rawExportedType = text(value) || null;
  const numericSourceCode = integerCodeOrNull(rawExportedType);
  const normalizedConfig = normalizeRestraintTypeMutationConfig(config);

  if (numericSourceCode === null) {
    const aliasCode = restraintTypeToCaesarCode(rawExportedType);
    const typeCode = aliasCode === null ? (normalizeNumberText(rawExportedType) || null) : String(aliasCode);
    return Object.freeze({
      schema: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_SCHEMA,
      profileId: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
      authority: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_AUTHORITY,
      rawExportedType,
      sourceTypeRaw: rawExportedType,
      sourceTypeCode: typeCode,
      correctedTypeCode: typeCode,
      typeCode,
      sourceKind: aliasCode === null ? 'UNRESOLVED_TEXT' : 'CANONICAL_ALIAS',
      mutationEnabled: normalizedConfig.enabled,
      mutationMatched: false,
      mutationApplied: false,
      mutationRuleId: null,
      mutationLabel: null,
      mutationFrom: null,
      mutationTo: null,
      applicationRule: 'TEXT_ALIAS_RESOLVES_DIRECTLY_TO_CANONICAL_CODE_V1',
    });
  }

  const sourceTypeCode = String(numericSourceCode);
  const matchingRow = normalizedConfig.rows.find((row) => row.from === sourceTypeCode) ?? null;
  const correctedTypeCode = normalizedConfig.enabled && matchingRow !== null
    ? matchingRow.to
    : sourceTypeCode;
  const mutationApplied = normalizedConfig.enabled
    && matchingRow !== null
    && correctedTypeCode !== sourceTypeCode;

  return Object.freeze({
    schema: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_SCHEMA,
    profileId: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
    authority: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_AUTHORITY,
    rawExportedType,
    sourceTypeRaw: rawExportedType,
    sourceTypeCode,
    correctedTypeCode,
    typeCode: correctedTypeCode,
    sourceKind: 'EXPORTED_NUMERIC',
    mutationEnabled: normalizedConfig.enabled,
    mutationMatched: matchingRow !== null,
    mutationApplied,
    mutationRuleId: matchingRow === null
      ? null
      : `CAESAR_EXPORT_FIX_${matchingRow.from}_TO_${matchingRow.to}`,
    mutationLabel: matchingRow?.label ?? null,
    mutationFrom: matchingRow?.from ?? null,
    mutationTo: matchingRow?.to ?? null,
    applicationRule: 'NORMALIZE_NUMERIC_SOURCE_THEN_APPLY_AT_MOST_ONE_MATCHING_ROW_V1',
  });
}

export function mutateRestraintType(value, config = {}) {
  const resolved = resolveRestraintTypeMutation(value, config);
  return resolved.correctedTypeCode ?? normalizeRestraintTypeValue(value);
}
