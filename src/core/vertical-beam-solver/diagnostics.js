import { deepFreeze } from '../shared-piping-model/index.js';
export function diagnostic(code, scope, message, details = {}, severity = 'ERROR') {
  return deepFreeze({ code, severity, scope, message, ...details });
}
export function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}|${left.primitiveId || ''}`
    .localeCompare(`${right.code}|${right.scope}|${right.primitiveId || ''}`);
}
export function uniqueSorted(values) { return [...new Set(values.filter(Boolean))].sort(); }
