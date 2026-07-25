import { deepFreeze, stringValue } from './immutable.js';

export const DIAGNOSTIC_SEVERITY = Object.freeze({
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
});

export function createDiagnostic(code, message, details = {}) {
  const normalizedCode = requiredString(code, 'code');
  const severity = normalizeSeverity(details.severity);
  const scope = stringValue(details.scope || details.sourceNodeKey || details.path || '$');
  return deepFreeze({
    id: `${normalizedCode}:${diagnosticIdentity(details, scope)}`,
    code: normalizedCode,
    severity,
    message: requiredString(message, 'message'),
    ...cleanDetails(details),
  });
}

export function normalizeDiagnosticRows(rows, scope = 'source') {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    if (row && typeof row === 'object' && row.code && row.message) {
      return createDiagnostic(row.code, row.message, {
        ...row,
        severity: row.severity || DIAGNOSTIC_SEVERITY.WARNING,
        scope: row.scope || `${scope}:${index}`,
      });
    }
    return createDiagnostic('UNSUPPORTED_DIAGNOSTIC_RECORD', 'Source diagnostic could not be normalized.', {
      severity: DIAGNOSTIC_SEVERITY.WARNING,
      scope: `${scope}:${index}`,
    });
  });
}

export function sortDiagnostics(rows) {
  return [...rows].sort((left, right) => diagnosticKey(left).localeCompare(diagnosticKey(right)));
}

function diagnosticIdentity(details, scope) {
  return [scope, details.field, details.path, details.sourceNodeKey]
    .map(stringValue)
    .filter((value, index, rows) => value && rows.indexOf(value) === index)
    .join(':');
}

function cleanDetails(details) {
  const result = {};
  Object.keys(details).sort().forEach((key) => {
    if (!['id', 'code', 'message', 'severity'].includes(key) && details[key] !== undefined) result[key] = details[key];
  });
  return result;
}

function diagnosticKey(row) {
  return `${row.code}|${row.scope || ''}|${row.path || ''}|${row.sourceNodeKey || ''}|${row.message}`;
}

function normalizeSeverity(value) {
  const normalized = stringValue(value || DIAGNOSTIC_SEVERITY.WARNING).toUpperCase();
  if (!Object.values(DIAGNOSTIC_SEVERITY).includes(normalized)) {
    throw new TypeError(`Unsupported diagnostic severity: ${value}.`);
  }
  return normalized;
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`Diagnostic ${field} must be a non-empty string.`);
  return normalized;
}
