import { createSharedPipingModel } from '../src/core/shared-piping-model/index.js';

export function sharedModelFixture(components = [], options = {}) {
  const datasetId = options.datasetId || 'W10.2-FIXTURE';
  return createSharedPipingModel({
    project: { datasetId, name: datasetId, sourceName: 'w10.2-fixture.json' },
    units: { length: options.unit || 'mm', force: 'unknown', mass: 'unknown' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId,
      sourceSchema: 'w10.2-fixture/v1',
      sourceSemanticHash: 'fnv1a64:0000000000000001',
      sourceByteHash: null,
    },
    components,
    supports: [],
    sourceReferences: { nodes: [] },
    diagnostics: [],
  });
}

export function component(componentKey, ports, options = {}) {
  const normalizedPorts = ports.map((port, index) => ({
    portKey: port.portKey || `${componentKey}:port:${port.role || index + 1}`,
    role: port.role || `port-${index + 1}`,
    position: fixturePosition(port.position),
    sourceReference: port.sourceReference || null,
  }));
  return {
    componentKey,
    sourceEntityId: componentKey,
    name: options.name || componentKey,
    type: options.type || 'PIPE',
    identity: identity(options.identity),
    geometry: {
      start: normalizedPorts[0]?.position || null,
      end: normalizedPorts[1]?.position || null,
      center: null,
      points: [],
      branchPoints: normalizedPorts.slice(2).map((port) => port.position),
      sources: {},
      sourcePath: options.sourcePath || `/${componentKey}`,
      ports: normalizedPorts,
    },
    engineeringProperties: {},
    compatibilityEvidence: {},
    sourceReferences: { sourceEntityId: componentKey },
    diagnostics: [],
  };
}

export function pipe(componentKey, start, end, options = {}) {
  return component(componentKey, [
    { role: 'start', position: start, sourceReference: options.startReference || null },
    { role: 'end', position: end, sourceReference: options.endReference || null },
  ], options);
}

export function point(x, y, z = 0) {
  return { x, y, z };
}

export function exactChain(count, options = {}) {
  return Array.from({ length: count }, (_, index) => pipe(
    `CHAIN-${index + 1}`,
    point(index * 1000, 0, 0),
    point((index + 1) * 1000, 0, 0),
    options,
  ));
}

export function closedLoop() {
  return [
    pipe('LOOP-A', point(0, 0), point(1000, 0)),
    pipe('LOOP-B', point(1000, 0), point(1000, 1000)),
    pipe('LOOP-C', point(1000, 1000), point(0, 1000)),
    pipe('LOOP-D', point(0, 1000), point(0, 0)),
  ];
}

export function teeFixture() {
  return [
    component('TEE', [
      { role: 'run-a', position: point(-100, 0) },
      { role: 'run-b', position: point(100, 0) },
      { role: 'branch', position: point(0, 100) },
    ], { type: 'TEE' }),
    pipe('TEE-LEFT', point(-200, 0), point(-100, 0)),
    pipe('TEE-RIGHT', point(100, 0), point(200, 0)),
    pipe('TEE-BRANCH', point(0, 100), point(0, 200)),
  ];
}

export function crossFixture() {
  return [
    component('CROSS', [
      { role: 'west', position: point(-100, 0) },
      { role: 'east', position: point(100, 0) },
      { role: 'south', position: point(0, -100) },
      { role: 'north', position: point(0, 100) },
    ], { type: 'CROSS' }),
    pipe('CROSS-W', point(-200, 0), point(-100, 0)),
    pipe('CROSS-E', point(100, 0), point(200, 0)),
    pipe('CROSS-S', point(0, -200), point(0, -100)),
    pipe('CROSS-N', point(0, 100), point(0, 200)),
  ];
}

export function translatedComponents(components, delta) {
  return components.map((item) => ({
    ...item,
    geometry: {
      ...item.geometry,
      ports: item.geometry.ports.map((port) => ({
        ...port,
        position: port.position ? point(
          port.position.x + delta.x,
          port.position.y + delta.y,
          port.position.z + delta.z,
        ) : port.position,
      })),
    },
  }));
}

function fixturePosition(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) return null;
  return value;
}

function identity(value = {}) {
  return {
    lineId: value.lineId || '',
    branchId: value.branchId || '',
    systemId: value.systemId || '',
    zoneId: value.zoneId || '',
  };
}
