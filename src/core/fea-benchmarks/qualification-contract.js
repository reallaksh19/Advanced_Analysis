import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';

export const BENCHMARK_QUALIFICATION_REPORT_SCHEMA = 'fea-benchmark-qualification-report/v1';
export const BENCHMARK_RESULT_ROW_SCHEMA = 'fea-benchmark-result-row/v1';

export const BENCHMARK_ROW_STATUSES = Object.freeze([
  'PASS', 'FAIL', 'NOT_EXPOSED', 'NOT_COMPARED',
]);

export const BENCHMARK_ENTITY_KINDS = Object.freeze(['NODE', 'ELEMENT']);

export function normalizeBenchmarkResultRows(rows, caseId) {
  if (!Array.isArray(rows)) throw new TypeError('Benchmark result rows must be an array.');
  const acceptedCaseId = nonempty(caseId, 'caseId');
  const normalized = rows.map((row, index) => normalizeRow(row, acceptedCaseId, index));
  normalized.sort((left, right) => compareAscii(rowIdentity(left), rowIdentity(right)));
  for (let index = 1; index < normalized.length; index += 1) {
    if (rowIdentity(normalized[index - 1]) === rowIdentity(normalized[index])) {
      throw new TypeError(`Duplicate benchmark result row ${rowIdentity(normalized[index])}.`);
    }
  }
  return deepFreeze(normalized);
}

export function benchmarkResultRowIdentity(row) {
  return rowIdentity(row);
}

export function requireGovernedBenchmarkRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must return a governed record.`);
  }
  if (typeof value.semanticHash !== 'string' || value.semanticHash.trim() === '') {
    throw new TypeError(`${label} must return a record with semanticHash.`);
  }
  return value;
}

export function sealBenchmarkQualificationReport(record) {
  const base = structuredClone(record);
  base.schema = BENCHMARK_QUALIFICATION_REPORT_SCHEMA;
  base.semanticHash = '';
  const hash = semanticHash(base);
  return deepFreeze({ ...base, semanticHash: hash });
}

export function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeRow(row, caseId, index) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError(`Benchmark result row ${index} must be an object.`);
  }
  const entityKind = nonempty(row.entityKind, `rows[${index}].entityKind`).toUpperCase();
  if (!BENCHMARK_ENTITY_KINDS.includes(entityKind)) {
    throw new TypeError(`Unsupported benchmark entity kind ${entityKind}.`);
  }
  const value = Number(row.value);
  if (!Number.isFinite(value)) throw new TypeError(`rows[${index}].value must be finite.`);
  return {
    schema: BENCHMARK_RESULT_ROW_SCHEMA,
    caseId,
    entityKind,
    entityId: nonempty(row.entityId, `rows[${index}].entityId`),
    quantity: nonempty(row.quantity, `rows[${index}].quantity`).toUpperCase(),
    component: nonempty(row.component, `rows[${index}].component`).toUpperCase(),
    value: Object.is(value, -0) ? 0 : value,
    unit: nonempty(row.unit, `rows[${index}].unit`),
    required: row.required !== false,
    note: row.note === undefined || row.note === null ? null : String(row.note),
  };
}

function rowIdentity(row) {
  return [row.caseId, row.entityKind, row.entityId, row.quantity, row.component].join(':');
}

function nonempty(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${field} is required.`);
  return text;
}
