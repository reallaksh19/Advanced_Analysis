import { canonicalPointToMeters, distanceM } from './geometry.js';
import { AUDIT_CODES } from './constants.js';
import { diagnostic } from './diagnostics.js';

export function qualifyAndOrderComponent(graph, sharedModel, connectedComponent) {
  if (connectedComponent.cyclic) return blocked(AUDIT_CODES.TOPOLOGY_CYCLE_BLOCKED, 'Connected component contains a cycle.');
  const components = componentRows(graph, connectedComponent.componentKeys);
  if (components.some((row) => row.portKeys.length !== 2)) {
    return blocked(AUDIT_CODES.TOPOLOGY_BRANCH_BLOCKED, 'Eligible paths require exactly two ports per component.');
  }
  const context = buildContext(graph, connectedComponent, components);
  if (context.terminals.length !== 2 || [...context.adjacency.values()].some((rows) => rows.length > 2)) {
    return blocked(AUDIT_CODES.TOPOLOGY_BRANCH_BLOCKED, 'Eligible topology must have exactly two terminals and no degree above two.');
  }
  const ordered = traverseChain(context, context.terminals[0]);
  if (!ordered || ordered.componentKeys.length !== components.length) {
    return blocked(AUDIT_CODES.PATH_GEOMETRY_BLOCKED, 'Topology component cannot be ordered as one continuous chain.');
  }
  return buildIntervals(ordered, context, sharedModel);
}

function buildContext(graph, connectedComponent, components) {
  const ports = new Map(graph.ports.filter((row) => connectedComponent.portKeys.includes(row.portKey)).map((row) => [row.portKey, row]));
  const connections = graph.connections.filter((row) => connectedComponent.connectionIds.includes(row.connectionId));
  const adjacency = new Map(components.map((row) => [row.componentKey, []]));
  connections.forEach((connection) => addAdjacency(connection, ports, adjacency));
  const terminals = [...ports.values()].filter((port) => !(port.peerPortKeys || []).length)
    .map((port) => port.portKey).sort();
  return { ports, connections, adjacency, terminals };
}

function addAdjacency(connection, ports, adjacency) {
  const left = ports.get(connection.portAKey), right = ports.get(connection.portBKey);
  if (!left || !right || left.componentKey === right.componentKey) return;
  adjacency.get(left.componentKey).push({ componentKey: right.componentKey, connectionId: connection.connectionId, localPortKey: left.portKey, peerPortKey: right.portKey });
  adjacency.get(right.componentKey).push({ componentKey: left.componentKey, connectionId: connection.connectionId, localPortKey: right.portKey, peerPortKey: left.portKey });
  adjacency.get(left.componentKey).sort(edgeOrder);
  adjacency.get(right.componentKey).sort(edgeOrder);
}

function traverseChain(context, terminalPortKey) {
  const firstPort = context.ports.get(terminalPortKey);
  if (!firstPort) return null;
  const componentKeys = [], connectionIds = [], orientedPorts = [];
  let componentKey = firstPort.componentKey, entryPortKey = terminalPortKey, previous = '';
  while (componentKey) {
    componentKeys.push(componentKey);
    const componentPorts = [...context.ports.values()].filter((row) => row.componentKey === componentKey).map((row) => row.portKey).sort();
    const exitPortKey = componentPorts.find((key) => key !== entryPortKey);
    if (!exitPortKey) return null;
    orientedPorts.push([entryPortKey, exitPortKey]);
    const next = (context.adjacency.get(componentKey) || []).find((row) => row.componentKey !== previous);
    if (!next) break;
    connectionIds.push(next.connectionId);
    previous = componentKey;
    componentKey = next.componentKey;
    entryPortKey = next.peerPortKey;
    if (componentKeys.includes(componentKey)) return null;
  }
  return { componentKeys, connectionIds, orientedPorts };
}

function buildIntervals(ordered, context, sharedModel) {
  let station = 0;
  const sharedByKey = new Map(sharedModel.components.map((row) => [row.componentKey, row]));
  const intervals = [];
  const diagnostics = [];
  ordered.componentKeys.forEach((componentKey, index) => {
    const [entryKey, exitKey] = ordered.orientedPorts[index];
    const entry = canonicalPointToMeters(context.ports.get(entryKey)?.positionCanonical);
    const exit = canonicalPointToMeters(context.ports.get(exitKey)?.positionCanonical);
    const lengthM = distanceM(entry, exit);
    if (!(lengthM > 0)) {
      diagnostics.push(diagnostic(AUDIT_CODES.PATH_GEOMETRY_BLOCKED, componentKey, 'Component geometry is missing or zero-length.'));
      return;
    }
    const shared = sharedByKey.get(componentKey);
    intervals.push({
      componentKey,
      startStationM: station,
      endStationM: station + lengthM,
      lengthM,
      orientationRelativeToComponent: orientation(context.ports.get(entryKey), context.ports.get(exitKey)),
      sourceGeometryEvidence: {
        entryPortKey: entryKey,
        exitPortKey: exitKey,
        entryPointM: entry,
        exitPointM: exit,
        componentSources: shared?.geometry?.sources || {},
      },
    });
    station += lengthM;
  });
  if (diagnostics.length || intervals.length !== ordered.componentKeys.length) {
    return { ok: false, code: AUDIT_CODES.PATH_GEOMETRY_BLOCKED, diagnostics };
  }
  return { ok: true, ...ordered, intervals, stationEndM: station, diagnostics: [] };
}

function orientation(entry, exit) {
  if (entry?.role === 'start' && exit?.role === 'end') return 'FORWARD';
  if (entry?.role === 'end' && exit?.role === 'start') return 'REVERSED';
  return entry?.portKey?.localeCompare(exit?.portKey) <= 0 ? 'PORT_KEY_FORWARD' : 'PORT_KEY_REVERSED';
}

function componentRows(graph, keys) {
  const set = new Set(keys);
  return graph.components.filter((row) => set.has(row.componentKey)).sort((a, b) => a.componentKey.localeCompare(b.componentKey));
}
function blocked(code, message) { return { ok: false, code, diagnostics: [diagnostic(code, 'topology', message)] }; }
function edgeOrder(left, right) { return `${left.componentKey}|${left.connectionId}`.localeCompare(`${right.componentKey}|${right.connectionId}`); }
