export const TRACE_TABLE_FIELDS = Object.freeze([
  { id: 'componentRef', label: 'Component Ref' },
  { id: 'lineId', label: 'Line ID' },
  { id: 'nps', label: 'NPS' },
  { id: 'wt', label: 'Wall Thickness' }
]);

export function headersFromTraceRows(rows = []) {
  if (!rows.length) return [];
  return Object.keys(rows[0] || {});
}

export function compareTraceResultsByComponentRef(left = [], right = []) {
  return {
    matchingCount: 0,
    mismatches: []
  };
}
