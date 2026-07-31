import { buildDtxrContext } from './core/dtxr-resolver-core.js';
import { buildJsonTraceTree } from './core/json-trace-tree.js';

export function runStandaloneResolverJsonTrace({ sourceText = '', stagedJsonText = '', jsonConfig = {}, supportConfigJson = '{}', dataset = null } = {}) {
  let traceRows = [];

  // If a WorkspaceState dataset is provided or staged JSON text is present, extract entity rows automatically!
  if (dataset && Array.isArray(dataset.entities)) {
    dataset.entities.forEach((entity, idx) => {
      const props = entity.engineeringProperties || {};
      const attrs = entity.attributes || {};
      traceRows.push({
        jsonNodeNo: idx + 1,
        objectType: entity.entityType || 'COMPONENT',
        nodeNumber: props.nodeNumber || props.NodeNumber || idx + 10,
        field: 'engineeringProperties',
        value: `Line: ${props.lineId || props.LineNumber || 'Unassigned'}, P1: ${props.p1 || '-'}, T1: ${props.t1 || '-'}, Material: ${props.material || '-'}`,
        componentRef: entity.id || entity.name || `REF-${idx}`,
        branchName: props.lineId || entity.branchName || 'Main Branch',
        boreKey: props.nps ? `${props.nps}"` : (entity.bore ? `${entity.bore}` : '150mm'),
        bucketLabel: entity.entityType === 'SUPPORT' ? 'DTXR-POS' : 'DTXR-PS',
        groupLabel: entity.entityType || 'PIPE',
        matched: true
      });
    });
  } else if (stagedJsonText) {
    try {
      const parsed = JSON.parse(stagedJsonText);
      const items = Array.isArray(parsed) ? parsed : (parsed.children || parsed.branches || [parsed]);
      
      const walk = (nodes, currentBranch = 'Main Branch') => {
        nodes.forEach((item, idx) => {
          const bName = item.name || item.branchName || currentBranch;
          if (item.children && Array.isArray(item.children)) {
            walk(item.children, bName);
          } else {
            traceRows.push({
              jsonNodeNo: traceRows.length + 1,
              objectType: item.type || 'COMPONENT',
              nodeNumber: item.nodeNumber || (traceRows.length + 1) * 10,
              field: 'stagedJson',
              value: JSON.stringify(item.attributes || {}).slice(0, 80),
              componentRef: item.name || item.ref || `NODE-${traceRows.length + 1}`,
              branchName: bName,
              boreKey: item.bore || item._boreValue ? `${item._boreValue}mm` : '150mm',
              bucketLabel: item.type === 'SUPP' ? 'DTXR-POS' : 'DTXR-PS',
              groupLabel: item.type || 'ELEMENT',
              matched: true
            });
          }
        });
      };
      
      walk(items);
    } catch (e) {
      console.warn('[ResolverJsonTrace] Error parsing staged JSON:', e);
    }
  }

  const dtxrContext = buildDtxrContext(stagedJsonText, jsonConfig);
  const traceTree = buildJsonTraceTree(traceRows, { ...jsonConfig, ...dtxrContext });

  const nodeWiseRows = traceRows.map(r => [
    r.branchName,
    String(r.nodeNumber),
    r.componentRef,
    r.objectType,
    r.bucketLabel,
    r.groupLabel,
    '1000.0',
    r.boreKey,
    r.matched ? '✅ Matched' : '⚠️ Pending'
  ]);

  const matchedFacts = traceRows.map(r => [
    r.branchName,
    String(r.nodeNumber),
    r.groupLabel,
    r.bucketLabel,
    '1'
  ]);

  return {
    dtxrContext,
    traceTree,
    matchedFacts,
    rejectedFacts: [],
    nodeWiseRows,
    traceRows,
    indexStats: {
      totalNodes: traceRows.length,
      matchedNodes: traceRows.length,
      rejectedNodes: 0
    }
  };
}
