import { deepFreeze } from '../shared-piping-model/index.js';

export function projectModelSummary(sharedModel, topologyGraph) {
  return deepFreeze({
    project: sharedModel.project,
    units: sharedModel.units,
    componentCount: sharedModel.summary.componentCount,
    supportCount: sharedModel.summary.supportCount,
    portCount: topologyGraph.summary.portCount,
    connectionCount: topologyGraph.summary.connectionCount,
    connectedComponentCount: topologyGraph.summary.connectedComponentCount,
  });
}

export function projectComponents(sharedModel) {
  return deepFreeze(sharedModel.components.map((row) => deepFreeze({
    componentKey: row.componentKey,
    sourceEntityId: row.sourceEntityId,
    componentType: row.type,
    sourcePath: row.sourceReferences?.sourcePath || null,
    lineIdentity: row.identity?.lineId || null,
    systemIdentity: row.identity?.systemId || null,
    zoneIdentity: row.identity?.zoneId || null,
    startPoint: row.geometry?.start ?? null,
    endPoint: row.geometry?.end ?? null,
    centerPoint: row.geometry?.center ?? null,
    portKeys: (row.geometry?.ports || []).map((port) => port.portKey).sort(),
    sourceReferences: row.sourceReferences || null,
    diagnostics: canonicalDiagnostics(row.diagnostics),
  })).sort((a, b) => a.componentKey.localeCompare(b.componentKey)));
}

export function projectPorts(topologyGraph) {
  return deepFreeze(topologyGraph.ports.map((row) => deepFreeze({
    portKey: row.portKey,
    componentKey: row.componentKey,
    role: row.role,
    position: row.position ?? null,
    sourceReference: row.sourceReference || null,
    diagnostics: canonicalDiagnostics(row.diagnostics),
  })).sort((a, b) => a.portKey.localeCompare(b.portKey)));
}

export function canonicalDiagnostics(rows) {
  return deepFreeze([...(rows || [])].sort((a, b) => diagnosticKey(a).localeCompare(diagnosticKey(b))));
}

export function sortedStrings(rows) {
  return deepFreeze([...new Set(rows || [])].sort());
}

function diagnosticKey(row) {
  return `${row?.scope || ''}\0${row?.code || ''}\0${row?.severity || ''}\0${row?.message || ''}`;
}
