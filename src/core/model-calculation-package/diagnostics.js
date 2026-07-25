import { deepFreeze, stringValue } from '../shared-piping-model/index.js';
export function createPackageDiagnostic(code, message, details = {}) {
  return deepFreeze({ code: stringValue(code), severity: details.severity || 'WARNING', scope: details.scope || 'model-calculation-package', message: stringValue(message), ...details });
}
export function normalizeDiagnostics(rows = []) {
  const seen = new Set();
  return rows.filter(Boolean).map((row) => ({ ...row })).sort(diagnosticOrder).filter((row) => {
    const key = diagnosticKey(row); if (seen.has(key)) return false; seen.add(key); return true;
  }).map(deepFreeze);
}
export function uniqueSorted(values = []) { return [...new Set(values.filter(Boolean).map(String))].sort(); }
export function diagnosticOrder(left, right) { return diagnosticKey(left).localeCompare(diagnosticKey(right)); }
function diagnosticKey(row) { return [row.code || '', row.scope || '', row.pathId || '', row.loadCaseId || '', row.supportKey || '', row.message || ''].join('|'); }
