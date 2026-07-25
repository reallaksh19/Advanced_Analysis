import { deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';

export function evidence(value, unit, sourcePath) {
  return deepFreeze({ value, unit, sourceKind: 'sourceAttributes', sourcePath });
}

export function component(id, type, options = {}) {
  const start = options.start ?? { x: 0, y: 0, z: 0 };
  const end = options.end ?? { x: 1000, y: 0, z: 0 };
  const center = options.center ?? null;
  return deepFreeze({
    componentKey: id,
    sourceEntityId: id,
    name: id,
    type,
    identity: { lineId: options.lineId || 'LINE-1', branchId: '', systemId: 'SYS-1', zoneId: '' },
    geometry: {
      start,
      end,
      center,
      points: [],
      branchPoints: [],
      ports: options.ports || defaultPorts(id, start, end),
      sourcePath: `/MODEL/${id}`,
      sources: center ? { center: 'fixture.explicitCenter' } : {},
    },
    engineeringProperties: options.engineeringProperties || {},
    compatibilityEvidence: options.compatibilityEvidence || {},
    loadEvidence: options.loadEvidence || {},
    sourceReferences: { sourceNodeKey: id, sourceEntityId: id, jsonPointer: `/objects/${id}`, sourcePath: `/MODEL/${id}` },
    diagnostics: [],
  });
}

export function pipeEvidence(overrides = {}) {
  return {
    outerDiameterMm: evidence(100, 'mm', 'OD'),
    wallThicknessMm: evidence(5, 'mm', 'WALL'),
    materialDensityKgM3: evidence(7850, 'kg/m3', 'DENSITY'),
    insulationThicknessMm: evidence(0, 'mm', 'INSULATION_THICKNESS'),
    fluidDensityOpeKgM3: evidence(800, 'kg/m3', 'OPE_DENSITY'),
    fluidDensityHydKgM3: evidence(1000, 'kg/m3', 'HYD_DENSITY'),
    ...overrides,
  };
}

export function sharedModel(components, unit = 'mm') {
  const sortedComponents = [...components].sort((left, right) => left.componentKey.localeCompare(right.componentKey));
  const base = {
    schema: 'shared-piping-model/v1',
    project: { datasetId: `D-${unit}`, name: `D-${unit}`, sourceName: 'fixture.json' },
    units: { length: unit, force: 'N', mass: 'kg' },
    sourceSnapshotRef: { schema: 'source-package-snapshot/v1', datasetId: `D-${unit}`, sourceSchema: 'fixture/v1', sourceSemanticHash: 'SOURCE', sourceByteHash: null },
    components: sortedComponents,
    unconnectedPorts: sortedComponents.flatMap((row) => row.geometry.ports.map((port) => ({ ...port, componentKey: row.componentKey }))),
    supports: [],
    sourceReferences: { nodes: [] },
    diagnostics: [],
    summary: {},
    indexes: {},
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function topology(model) {
  return buildPipingPortTopologyGraph(model);
}

function defaultPorts(id, start, end) {
  if (!start || !end) return [];
  return [
    { portKey: `${id}:port:start`, role: 'start', position: start, sourceReference: null },
    { portKey: `${id}:port:end`, role: 'end', position: end, sourceReference: null },
  ];
}
