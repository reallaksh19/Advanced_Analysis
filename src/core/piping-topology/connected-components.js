import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';

export function buildConnectedComponents(projection, connections) {
  const dsu = createDisjointSet(projection.components.map((component) => component.componentKey));
  const portsByKey = new Map(projection.ports.map((port) => [port.portKey, port]));
  const cycleEdges = [];
  connections.forEach((connection) => {
    const pair = connectionComponents(connection, portsByKey);
    if (!pair || pair[0] === pair[1]) return;
    if (find(dsu, pair[0]) === find(dsu, pair[1])) cycleEdges.push(pair);
    else union(dsu, pair[0], pair[1]);
  });
  const groups = groupedComponents(projection.components, dsu);
  const cyclicRoots = cycleRoots(cycleEdges, dsu);
  return deepFreeze(groups.map((componentKeys) => componentRecord(
    componentKeys,
    projection,
    connections,
    portsByKey,
    cyclicRoots.has(find(dsu, componentKeys[0])),
  )).sort(componentGroupOrder));
}

function componentRecord(componentKeys, projection, connections, portsByKey, cyclic) {
  const componentSet = new Set(componentKeys);
  const portKeys = projection.ports.filter((port) => componentSet.has(port.componentKey)).map((port) => port.portKey).sort();
  const connectionIds = connections.filter((connection) => connectionTouchesSet(connection, portsByKey, componentSet))
    .map((connection) => connection.connectionId).sort();
  return {
    connectedComponentId: stableConnectedComponentId(componentKeys),
    componentKeys,
    portKeys,
    connectionIds,
    cyclic,
  };
}

function connectionTouchesSet(connection, portsByKey, componentSet) {
  const left = portsByKey.get(connection.portAKey)?.componentKey;
  const right = portsByKey.get(connection.portBKey)?.componentKey;
  return componentSet.has(left) && componentSet.has(right);
}

function groupedComponents(components, dsu) {
  const groups = new Map();
  components.forEach((component) => {
    const root = find(dsu, component.componentKey);
    const values = groups.get(root) || [];
    values.push(component.componentKey);
    groups.set(root, values.sort());
  });
  return [...groups.values()];
}

function cycleRoots(cycleEdges, dsu) {
  return new Set(cycleEdges.map(([componentKey]) => find(dsu, componentKey)));
}

function connectionComponents(connection, portsByKey) {
  const left = portsByKey.get(connection.portAKey)?.componentKey;
  const right = portsByKey.get(connection.portBKey)?.componentKey;
  return left && right ? [left, right] : null;
}

function createDisjointSet(keys) {
  return {
    parent: new Map(keys.map((key) => [key, key])),
    rank: new Map(keys.map((key) => [key, 0])),
  };
}

function find(dsu, key) {
  let root = key;
  while (dsu.parent.get(root) !== root) root = dsu.parent.get(root);
  let current = key;
  while (current !== root) {
    const next = dsu.parent.get(current);
    dsu.parent.set(current, root);
    current = next;
  }
  return root;
}

function union(dsu, left, right) {
  const rootLeft = find(dsu, left);
  const rootRight = find(dsu, right);
  if (rootLeft === rootRight) return;
  const rankLeft = dsu.rank.get(rootLeft);
  const rankRight = dsu.rank.get(rootRight);
  if (rankLeft < rankRight) dsu.parent.set(rootLeft, rootRight);
  else if (rankLeft > rankRight) dsu.parent.set(rootRight, rootLeft);
  else {
    const [parent, child] = [rootLeft, rootRight].sort();
    dsu.parent.set(child, parent);
    dsu.rank.set(parent, rankLeft + 1);
  }
}

function stableConnectedComponentId(componentKeys) {
  return `connected-component-${semanticHash(componentKeys).split(':')[1]}`;
}

function componentGroupOrder(left, right) {
  return left.componentKeys.join('|').localeCompare(right.componentKeys.join('|'));
}
