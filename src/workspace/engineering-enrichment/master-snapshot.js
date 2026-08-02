import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';

export const MASTER_DATA_SNAPSHOT_SCHEMA = 'MasterDataSnapshot.v2';
export const SUPPORTED_MASTER_KEYS = Object.freeze([
  'lineList',
  'materialMap',
  'pipingClass',
  'weight',
]);

const INPUT_KEYS = Object.freeze([
  'masterKey',
  'source',
  'mapping',
  'normalizedRows',
  'diagnostics',
]);
const SOURCE_KEYS = Object.freeze(['fileName', 'sheetName', 'sha256', 'byteLength']);
const SNAPSHOT_KEYS = Object.freeze([
  'schema',
  'masterKey',
  'source',
  'mapping',
  'mappingHash',
  'normalizedRows',
  'normalizedRowsHash',
  'diagnostics',
  'snapshotHash',
]);

export function buildMasterDataSnapshot(input) {
  assertExactKeys(input, INPUT_KEYS, 'MasterDataSnapshot input');
  const masterKey = requireMasterKey(input.masterKey);
  const source = validateSource(input.source);
  const mapping = canonicalizeMapping(input.mapping);
  const normalizedRows = canonicalizeRows(input.normalizedRows);
  const diagnostics = canonicalizeDiagnostics(input.diagnostics);
  const base = {
    schema: MASTER_DATA_SNAPSHOT_SCHEMA,
    masterKey,
    source,
    mapping,
    normalizedRows,
    diagnostics,
  };
  return deepFreeze({
    ...base,
    mappingHash: semanticHash(mapping),
    normalizedRowsHash: semanticHash(normalizedRows),
    snapshotHash: semanticHash(base),
  });
}

export function assertMasterDataSnapshot(value) {
  assertExactKeys(value, SNAPSHOT_KEYS, 'MasterDataSnapshot');
  if (value.schema !== MASTER_DATA_SNAPSHOT_SCHEMA) {
    fail(`schema must be ${MASTER_DATA_SNAPSHOT_SCHEMA}.`);
  }
  const rebuilt = buildMasterDataSnapshot({
    masterKey: value.masterKey,
    source: value.source,
    mapping: value.mapping,
    normalizedRows: value.normalizedRows,
    diagnostics: value.diagnostics,
  });
  if (value.mappingHash !== rebuilt.mappingHash) fail('mappingHash is invalid.', RangeError);
  if (value.normalizedRowsHash !== rebuilt.normalizedRowsHash) {
    fail('normalizedRowsHash is invalid.', RangeError);
  }
  if (value.snapshotHash !== rebuilt.snapshotHash) fail('snapshotHash is invalid.', RangeError);
  return value;
}

function requireMasterKey(value) {
  const key = String(value ?? '');
  if (!SUPPORTED_MASTER_KEYS.includes(key)) fail(`unsupported masterKey: ${key || '<empty>'}.`, RangeError);
  return key;
}

function validateSource(value) {
  assertExactKeys(value, SOURCE_KEYS, 'MasterDataSnapshot source');
  const fileName = requiredText(value.fileName, 'source.fileName');
  const sheetName = requiredText(value.sheetName, 'source.sheetName');
  const sha256 = requiredText(value.sha256, 'source.sha256').toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sha256)) fail('source.sha256 must be 64 hexadecimal characters.', RangeError);
  const byteLength = Number(value.byteLength);
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    fail('source.byteLength must be a non-negative safe integer.', RangeError);
  }
  return deepFreeze({ fileName, sheetName, sha256, byteLength });
}

function canonicalizeMapping(value) {
  if (!isPlainRecord(value)) fail('mapping must be an object.');
  const result = {};
  Object.keys(value).sort(compareAscii).forEach((key) => {
    const normalizedKey = requiredText(key, 'mapping key');
    if (typeof value[key] !== 'string') fail(`mapping.${normalizedKey} must be a string.`);
    result[normalizedKey] = value[key];
  });
  return deepFreeze(canonicalizeJson(result));
}

function canonicalizeRows(value) {
  if (!Array.isArray(value)) fail('normalizedRows must be an array.');
  const rows = value.map((row, index) => canonicalRecord(row, `normalizedRows[${index}]`));
  assertNoDuplicateDeclaredIds(rows);
  rows.sort(compareCanonicalValues);
  return deepFreeze(rows);
}

function canonicalizeDiagnostics(value) {
  if (!Array.isArray(value)) fail('diagnostics must be an array.');
  const diagnostics = value.map((row, index) => canonicalRecord(row, `diagnostics[${index}]`));
  diagnostics.sort(compareCanonicalValues);
  return deepFreeze(diagnostics);
}

function canonicalRecord(value, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  return deepFreeze(canonicalizeJson(value));
}

function assertNoDuplicateDeclaredIds(rows) {
  const seen = new Set();
  rows.forEach((row, index) => {
    const id = row.semanticId ?? row.recordId ?? row.rowId;
    if (id === undefined || id === null || id === '') return;
    const key = String(id);
    if (seen.has(key)) fail(`duplicate declared row identity ${key} at normalizedRows[${index}].`, RangeError);
    seen.add(key);
  });
}

function compareCanonicalValues(left, right) {
  const leftHash = semanticHash(left);
  const rightHash = semanticHash(right);
  const hashOrder = compareAscii(leftHash, rightHash);
  return hashOrder || compareAscii(canonicalStringify(left), canonicalStringify(right));
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`MasterDataSnapshot: ${message}`);
}
