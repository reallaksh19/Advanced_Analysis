/**
 * Governed CAESAR II InputXML restraint TYPE normalization/mutation authority.
 *
 * CAESAR II InputXML exports in the benchmark corpus contain known numeric TYPE
 * mutations. Numeric values are retained as source evidence and corrected once
 * before classification. Textual aliases already name the intended canonical
 * restraint and therefore resolve directly to the post-mutation code system.
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

// Compatibility export retained for standalone consumers. The values are the
// governed post-mutation canonical codes, not raw InputXML export codes.
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

export const RESTRAINT_TYPE_MUTATION_INFO = [
  'Numeric InputXML restraint TYPE values are retained as exported source evidence.',
  'The owner-confirmed seven-row mutation table is applied exactly once before classification.',
  'Textual aliases resolve directly to the post-mutation canonical code system and are never re-mutated.',
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

/**
 * Normalize a source value without applying the export correction. Numeric
 * InputXML values remain numeric source codes; textual labels resolve to the
 * canonical post-mutation code system.
 */
export function normalizeRestraintTypeValue(value) {
  const code = restraintTypeToCaesarCode(value);
  if (code !== null && code !== undefined) return String(code);
  return normalizeNumberText(value);
}

/**
 * Resolve one restraint TYPE with reviewable mutation evidence.
 */
export function resolveRestraintTypeMutation(value, config = {}) {
  const sourceTypeRaw = text(value);
  const numericSourceCode = integerCodeOrNull(sourceTypeRaw);
  const normalizedConfig = normalizeRestraintTypeMutationConfig(config);

  // Textual labels already express canonical intent. Applying an InputXML
  // numeric export mutation to them would turn ANCHOR into X and swap GUI/LIM.
  if (numericSourceCode === null) {
    const aliasCode = restraintTypeToCaesarCode(sourceTypeRaw);
    const typeCode = aliasCode === null ? normalizeNumberText(sourceTypeRaw) : String(aliasCode);
    return Object.freeze({
      sourceTypeRaw,
      sourceTypeCode: typeCode || null,
      typeCode: typeCode || null,
      sourceKind: aliasCode === null ? 'UNRESOLVED_TEXT' : 'CANONICAL_ALIAS',
      mutationApplied: false,
      mutationLabel: null,
      mutationFrom: null,
      mutationTo: null,
    });
  }

  const sourceTypeCode = String(numericSourceCode);
  const match = normalizedConfig.enabled === false
    ? null
    : normalizedConfig.rows.find((row) => row.from === sourceTypeCode) ?? null;
  const typeCode = match?.to ?? sourceTypeCode;
  return Object.freeze({
    sourceTypeRaw,
    sourceTypeCode,
    typeCode,
    sourceKind: 'EXPORTED_NUMERIC',
    mutationApplied: match !== null,
    mutationLabel: match?.label ?? null,
    mutationFrom: match?.from ?? null,
    mutationTo: match?.to ?? null,
  });
}

export function mutateRestraintType(value, config = {}) {
  return resolveRestraintTypeMutation(value, config).typeCode;
}
