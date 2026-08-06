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
  Object.freeze({ label: 'GUI', from: '7', to: '9' }),
  Object.freeze({ label: 'GUI', from: '10', to: '9' }),
  Object.freeze({ label: 'X', from: '1', to: '2' }),
  Object.freeze({ label: 'Y', from: '2', to: '3' }),
  Object.freeze({ label: 'Z', from: '3', to: '5' }),
  Object.freeze({ label: '', from: '18', to: '15' }),
]);

/**
 * Single canonical restraintTypeCodeMap for inputXmlToCanonicalGeometry's
 * conditioning-level classification (node.restraint: 'ANCHOR' | 'GUIDE' |
 * 'UNKNOWN'). Every corrected code this project has actually observed in a
 * real CAESAR InputXML/Output.xml pair is covered here.
 *
 * This exists because, before it did, every caller hand-rolled its own
 * partial copy (e.g. `{0: 'ANCHOR', 14: 'GUIDE', 8: 'GUIDE'}`) — which is
 * exactly how the raw-TYPE=7 misclassification (LIM instead of GUI, fixed in
 * PR #725) went uncorrected in some consumers while it was being fixed in
 * others. Import this instead of writing a new literal map. If ingestion
 * reports INPUTXML_RESTRAINT_TYPE_UNKNOWN for a code not listed here, that is
 * real, new evidence to add a row — not something to guess at or suppress.
 */
export const DEFAULT_RESTRAINT_TYPE_CODE_MAP = Object.freeze({
  0: 'ANCHOR', // ANC
  2: 'GUIDE', // X
  3: 'GUIDE', // Y
  5: 'GUIDE', // Z
  8: 'GUIDE', // LIM
  9: 'GUIDE', // GUI
  10: 'GUIDE', // XSNB
  11: 'GUIDE', // YSNB
  12: 'GUIDE', // ZSNB
  13: 'GUIDE', // +X
  14: 'GUIDE', // +Y
  15: 'GUIDE', // +Z
  16: 'GUIDE', // -X
  17: 'GUIDE', // -Y
  18: 'GUIDE', // -Z
});

// CANONICAL_RESTRAINT_TYPE_CODES has more than one alias for some codes
// (ANC/A/FIXED/FIX all resolve to 0; GUI/GUIDE both resolve to 9). Prefer
// CAESAR's own short-form label for display — the form its own reports use
// (e.g. Output_BM2.xml literally prints "Rigid GUI", never "Rigid GUIDE").
const PREFERRED_RESTRAINT_TYPE_LABEL_ORDER = Object.freeze([
  'ANC', 'X', 'Y', 'Z', 'LIM', 'GUI', 'XSNB', 'YSNB', 'ZSNB',
  '+X', '+Y', '+Z', '-X', '-Y', '-Z', '+RX', '+RY', '+RZ', '-RX', '-RY', '-RZ',
  '+LIM', '-LIM', 'XROD', 'YROD', 'ZROD',
]);
const CORRECTED_RESTRAINT_TYPE_LABELS = Object.freeze((() => {
  const byCode = {};
  for (const label of PREFERRED_RESTRAINT_TYPE_LABEL_ORDER) {
    const code = String(CANONICAL_RESTRAINT_TYPE_CODES[label]);
    if (!(code in byCode)) byCode[code] = label;
  }
  for (const [label, code] of Object.entries(CANONICAL_RESTRAINT_TYPE_CODES)) {
    const key = String(code);
    if (!(key in byCode)) byCode[key] = label;
  }
  return byCode;
})());

/** Human-readable label for a corrected restraint TYPE code, or null if unrecognized. */
export function restraintTypeCodeLabel(correctedTypeCode) {
  if (correctedTypeCode === null || correctedTypeCode === undefined) return null;
  return CORRECTED_RESTRAINT_TYPE_LABELS[String(correctedTypeCode)] ?? null;
}

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
