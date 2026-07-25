import { deepFreeze } from '../shared-piping-model/index.js';
import { canonicalDiagnostics, sortedStrings } from './projection-model.js';

export function projectConnections(topologyGraph) {
  const portByKey = new Map(topologyGraph.ports.map((row) => [row.portKey, row]));
  return deepFreeze(topologyGraph.connections.map((row) => deepFreeze({
    connectionId: row.connectionId,
    fromPortKey: row.portAKey,
    toPortKey: row.portBKey,
    fromComponentKey: portByKey.get(row.portAKey)?.componentKey || null,
    toComponentKey: portByKey.get(row.portBKey)?.componentKey || null,
    evidenceType: row.evidenceType,
    resolutionState: 'CONNECTED',
    identityCompatibility: row.identityCompatibility,
    distanceCanonical: row.distanceCanonical ?? null,
    alternativeTargetIds: sortedStrings(row.alternativeCandidatePortKeys),
    diagnostics: canonicalDiagnostics(row.diagnostics),
  })).sort((a, b) => a.connectionId.localeCompare(b.connectionId)));
}

export function projectTopologyComponents(topologyGraph, topologyAudit) {
  const stateByPort = new Map(topologyAudit.portStates.map((row) => [row.portKey, row]));
  return deepFreeze(topologyGraph.connectedComponents.map((row) => {
    const terminalPortKeys = row.portKeys.filter((key) => (topologyGraph.ports.find((port) => port.portKey === key)?.peerPortKeys || []).length === 0);
    const junctionPortKeys = row.portKeys.filter((key) => (topologyGraph.ports.find((port) => port.portKey === key)?.peerPortKeys || []).length > 1);
    const blockers = row.portKeys.flatMap((key) => {
      const state = stateByPort.get(key)?.state;
      return state && state !== 'CONNECTED' ? [state] : [];
    });
    return deepFreeze({
      connectedComponentId: row.connectedComponentId,
      componentKeys: sortedStrings(row.componentKeys),
      portKeys: sortedStrings(row.portKeys),
      connectionIds: sortedStrings(row.connectionIds),
      terminalEvidence: deepFreeze({ portKeys: sortedStrings(terminalPortKeys) }),
      junctionEvidence: deepFreeze({ portKeys: sortedStrings(junctionPortKeys) }),
      cycleEvidence: deepFreeze({ cyclic: Boolean(row.cyclic) }),
      qualification: blockers.length ? 'BLOCKED' : 'READY',
      blockers: sortedStrings(blockers),
      diagnostics: deepFreeze([]),
    });
  }).sort((a, b) => a.connectedComponentId.localeCompare(b.connectedComponentId)));
}

export function projectTopologyDiagnostics(graph, audit) {
  return canonicalDiagnostics([...(graph.topologyAudit?.diagnostics || []), ...(audit.diagnostics || [])]);
}
