export const XML_NODE_TRACE_HEADERS = Object.freeze([
  'Branch', 'Node', 'Component Ref', 'Type', 'DTXR POS', 'DTXR PS', 'Length (mm)', 'Bore (mm)', 'Status'
]);

export function buildEvidenceTreeRows(result) {
  if (!result || !result.traceTree) return [];
  const rows = [];
  for (const branch of result.traceTree.branches || []) {
    for (const bore of branch.bores || []) {
      for (const bucket of bore.buckets || []) {
        for (const group of bucket.groups || []) {
          for (const row of group.rows || []) {
            rows.push({
              branchName: branch.branchName,
              boreKey: bore.boreKey,
              bucketLabel: bucket.label,
              groupLabel: group.label,
              ...row
            });
          }
        }
      }
    }
  }
  return rows;
}

export function buildMatchedFactsRows(result) {
  if (!result || !result.matchedFacts) return [];
  return result.matchedFacts.map(fact => [
    fact.path || '',
    fact.node || '',
    fact.ps || '',
    fact.pos || '',
    fact.hits || 0
  ]);
}

export function buildXmlNodeWiseTraceRows(result) {
  if (!result || !result.nodeWiseRows) return [];
  return result.nodeWiseRows;
}
