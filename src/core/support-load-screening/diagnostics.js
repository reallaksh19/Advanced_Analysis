import { deepFreeze } from '../shared-piping-model/index.js';

export function diagnostic(code, scope, message, details = {}, severity = 'WARNING') {
  return deepFreeze({ code, severity, scope, message, ...details });
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

export function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}|${left.loadCaseId || ''}|${left.primitiveId || ''}`
    .localeCompare(`${right.code}|${right.scope}|${right.loadCaseId || ''}|${right.primitiveId || ''}`);
}
