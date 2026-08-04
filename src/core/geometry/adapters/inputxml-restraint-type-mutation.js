/**
 * Pure CAESAR II InputXML restraint TYPE normalization/mutation authority.
 *
 * This lives in `src/core` so geometry ingestion can consume the same
 * project-configurable correction that the standalone CII workspace exposes,
 * without creating a core -> workspace dependency.
 */

export const NATIVE_RESTRAINT_TYPE_CODES = Object.freeze({
  ANC: 1, GUI: 8, GUIDE: 8, LIM: 9, LIMIT: 9, XSNB: 10, YSNB: 11, ZSNB: 12,
  '+X': 13, '+Y': 14, '+Z': 15, '-X': 16, '-Y': 17, '-Z': 18,
  '+RX': 19, '+RY': 20, '+RZ': 21, '-RX': 22, '-RY': 23, '-RZ': 24,
  '+LIM': 25, '-LIM': 26, XROD: 27, YROD: 28, ZROD: 29,
  '+XROD': 30, '+YROD': 31, '+ZROD': 32, '-XROD': 33, '-YROD': 34,
  '-ZROD': 35, X2: 36, Y2: 37, Z2: 38, RX2: 39, RY2: 40,
  RZ2: 41, '+X2': 42, '+Y2': 43, '+Z2': 44, '-X2': 45, '-Y2': 46,
  '-Z2': 47, '+RX2': 48, '+RY2': 49, '+RZ2': 50, '-RX2': 51,
  '-RY2': 52, '-RZ2': 53, XSPR: 54, YSPR: 55, ZSPR: 56,
  '+XSNB': 57, '+YSNB': 58, '+ZSNB': 59, '-XSNB': 60, '-YSNB': 61,
  '-ZSNB': 62,
});

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
  'Restraint TYPE is first normalized with the Python XML->CII native code table.',
  'Numeric TYPE values pass through when they are in the CAESAR II 1-62 range.',
  'The editable rows then mutate specific source TYPE codes into target TYPE codes before enrichment.',
].join('\n');

const text = (value) => String(value ?? '').trim();

function normalizeNumberText(value) {
  const raw = text(value);
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric)) return raw;
  return Math.abs(numeric - Math.round(numeric)) < 1e-9
    ? String(Math.round(numeric))
    : raw.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
}

export function restraintTypeToCaesarCode(restraintType) {
  const normalized = text(restraintType).toUpperCase();
  if (!normalized) return null;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && Math.abs(numeric - Math.round(numeric)) < 1e-6) {
    const rounded = Math.round(numeric);
    if (rounded >= 1 && rounded <= 62) return rounded;
  }

  if (Object.prototype.hasOwnProperty.call(NATIVE_RESTRAINT_TYPE_CODES, normalized)) {
    return NATIVE_RESTRAINT_TYPE_CODES[normalized];
  }
  if (['A', 'ANCHOR', 'FIXED', 'FIX'].includes(normalized)) return 1;

  const bare = normalized.replace(/^[+-]/u, '');
  if (bare === 'X') return 17;
  if (bare === 'Y') return 19;
  if (bare === 'Z') return 18;
  return null;
}

export function normalizeRestraintTypeMutationRows(rows = DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS) {
  const source = Array.isArray(rows) ? rows : DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS;
  return source.map((row) => ({
    label: text(row?.label),
    from: text(row?.from),
    to: text(row?.to),
  }));
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

export function normalizeRestraintTypeValue(value) {
  const code = restraintTypeToCaesarCode(value);
  if (code !== null && code !== undefined) return String(code);
  return normalizeNumberText(value);
}

export function mutateRestraintType(value, config = {}) {
  const base = normalizeRestraintTypeValue(value);
  if (!base) return base;
  const normalizedConfig = normalizeRestraintTypeMutationConfig(config);
  if (normalizedConfig.enabled === false) return base;
  const match = normalizedConfig.rows.find(
    (row) => normalizeRestraintTypeValue(row.from) === base,
  );
  return match ? normalizeRestraintTypeValue(match.to) || base : base;
}
