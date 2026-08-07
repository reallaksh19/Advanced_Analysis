import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { inputXmlToCanonicalGeometry } from '../../../core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import { DEFAULT_RESTRAINT_TYPE_CODE_MAP } from '../../../core/geometry/adapters/inputxml-restraint-type-mutation.js';
import { finalizeCanonicalTopology } from '../topology-edit-canonical-state.js';
import {
  assertTopologyEditRoundTripSemantics,
  compareTopologyEditRoundTripSemantics,
} from './topology-edit-roundtrip-semantics.js';
import {
  assertTopologyEditInputXmlWriteback,
  prepareTopologyEditInputXmlWriteback,
} from './topology-edit-inputxml-writeback.js';

export const TOPOLOGY_EDIT_INPUTXML_ROUNDTRIP_SCHEMA =
  'TopologyEditInputXmlRoundTrip.v1';

const LENGTH_TO_METRES = Object.freeze({
  m: 1,
  mm: 1e-3,
  cm: 1e-2,
  in: 0.0254,
  ft: 0.3048,
});

export function qualifyTopologyEditInputXmlRoundTrip(input = {}) {
  const writeback = prepareTopologyEditInputXmlWriteback(input);
  assertTopologyEditInputXmlWriteback(writeback);
  const reimportedGeometry = inputXmlToCanonicalGeometry(writeback.resultingInputXml, {
    unit: input.fallbackInputXmlLengthUnit ?? undefined,
    source: input.sourceId ?? 'topology-edit-inputxml-roundtrip',
    restraintTypeCodeMap: input.restraintTypeCodeMap ?? DEFAULT_RESTRAINT_TYPE_CODE_MAP,
    bendRadiusTolerance: input.bendRadiusTolerance,
  });
  if (!reimportedGeometry.valid) {
    const codes = reimportedGeometry.diagnostics
      .filter((row) => String(row.severity).toLowerCase() === 'error')
      .map((row) => row.code)
      .slice(0, 8)
      .join(', ');
    throw new RangeError(`InputXML roundtrip: production re-import is invalid: ${codes}.`);
  }
  const expectedProjection = expectedGeometryProjection(input.canonicalTopology);
  const actualProjection = reimportedGeometryProjection({
    expectedTopology: input.canonicalTopology,
    geometry: reimportedGeometry,
    bindings: writeback.bindings,
    sourceLengthUnit: writeback.sourceLengthUnit,
    canonicalLengthUnit: writeback.canonicalLengthUnit,
  });
  const comparison = compareTopologyEditRoundTripSemantics({
    expectedTopology: expectedProjection,
    actualTopology: actualProjection,
    coordinateToleranceMm: input.coordinateToleranceMm ?? 0,
    compareCatalogueEvidence: false,
  });
  assertTopologyEditRoundTripSemantics(comparison);
  if (comparison.status !== 'EQUIVALENT') {
    const summary = comparison.mismatches
      .slice(0, 5)
      .map((row) => `${row.collection}:${row.canonicalId}:${row.kind}`)
      .join(', ');
    throw new RangeError(`InputXML roundtrip: geometry semantics changed after production re-import: ${summary}.`);
  }
  const material = {
    schema: TOPOLOGY_EDIT_INPUTXML_ROUNDTRIP_SCHEMA,
    canonicalTopologyHash: input.canonicalTopology.canonicalTopologyHash,
    writebackHash: writeback.writebackHash,
    resultingSourceHash: writeback.resultingSourceHash,
    expectedProjectionHash: expectedProjection.canonicalTopologyHash,
    actualProjectionHash: actualProjection.canonicalTopologyHash,
    comparisonHash: comparison.comparisonHash,
    qualificationScope: 'EXISTING_INPUTXML_NODE_COORDINATES_EDGE_CONNECTIVITY_ELEMENT_TYPE',
    status: 'QUALIFIED',
  };
  return deepFreeze({
    ...material,
    roundTripHash: semanticHash(material),
    writeback,
    comparison,
    expectedProjection,
    actualProjection,
    reimportedGeometry,
  });
}

export function assertTopologyEditInputXmlRoundTrip(value) {
  if (value?.schema !== TOPOLOGY_EDIT_INPUTXML_ROUNDTRIP_SCHEMA) {
    throw new TypeError(`InputXML roundtrip must use ${TOPOLOGY_EDIT_INPUTXML_ROUNDTRIP_SCHEMA}.`);
  }
  const {
    roundTripHash,
    writeback: _writeback,
    comparison: _comparison,
    expectedProjection: _expected,
    actualProjection: _actual,
    reimportedGeometry: _geometry,
    ...material
  } = value;
  if (semanticHash(material) !== roundTripHash || value.status !== 'QUALIFIED') {
    throw new Error('InputXML roundtrip: qualification authority mismatch.');
  }
  assertTopologyEditInputXmlWriteback(value.writeback);
  assertTopologyEditRoundTripSemantics(value.comparison);
  if (value.comparison.status !== 'EQUIVALENT') {
    throw new Error('InputXML roundtrip: non-equivalent comparison cannot be qualified.');
  }
  return value;
}

function expectedGeometryProjection(topology) {
  assertSupportedTopology(topology);
  return finalizeCanonicalTopology({
    schema: 'topology-edit-inputxml-geometry-projection/v1',
    datasetId: topology.datasetId,
    datasetVersion: topology.datasetVersion ?? 0,
    sourceHash: topology.sourceHash ?? null,
    topologyGraphHash: null,
    nodes: topology.nodes.map((node) => ({ id: node.id, position: node.position })),
    edges: topology.edges.map((edge) => ({
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      entityType: normalizeType(edge.entityType),
    })),
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}

function reimportedGeometryProjection({
  expectedTopology,
  geometry,
  bindings,
  sourceLengthUnit,
  canonicalLengthUnit,
}) {
  const parsedNodes = new Map(geometry.nodes.map((node) => [String(node.id), node]));
  const reverseNodes = new Map(Object.entries(bindings.nodes).map(([canonicalId, sourceId]) => [String(sourceId), canonicalId]));
  const nodes = expectedTopology.nodes.map((expected) => {
    const sourceId = bindings.nodes[expected.id];
    const parsed = parsedNodes.get(String(sourceId));
    if (!parsed || !['x', 'y', 'z'].every((axis) => Number.isFinite(parsed[axis]))) {
      throw new RangeError(`InputXML roundtrip: re-imported node ${sourceId} is missing or unresolved.`);
    }
    return {
      id: expected.id,
      position: {
        x: convertLength(parsed.x, sourceLengthUnit, canonicalLengthUnit),
        y: convertLength(parsed.y, sourceLengthUnit, canonicalLengthUnit),
        z: convertLength(parsed.z, sourceLengthUnit, canonicalLengthUnit),
      },
    };
  });
  const segments = new Map(geometry.segments.map((segment) => [Number(segment.meta?.sourceIndex), segment]));
  const edges = expectedTopology.edges.map((expected) => {
    const binding = bindings.edges[expected.id];
    const segment = segments.get(binding.sourceIndex);
    if (!segment) throw new RangeError(`InputXML roundtrip: source segment ${binding.sourceIndex} is missing.`);
    const fromNodeId = reverseNodes.get(String(segment.startNodeId));
    const toNodeId = reverseNodes.get(String(segment.endNodeId));
    if (!fromNodeId || !toNodeId) {
      throw new RangeError(`InputXML roundtrip: source segment ${binding.sourceIndex} has unmapped node identity.`);
    }
    return {
      id: expected.id,
      fromNodeId,
      toNodeId,
      entityType: normalizeType(segment.type),
    };
  });
  return finalizeCanonicalTopology({
    schema: 'topology-edit-inputxml-geometry-projection/v1',
    datasetId: expectedTopology.datasetId,
    datasetVersion: expectedTopology.datasetVersion ?? 0,
    sourceHash: semanticHash(geometry),
    topologyGraphHash: null,
    nodes,
    edges,
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}

function assertSupportedTopology(topology) {
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    if ((topology?.[collection] ?? []).length) {
      throw new RangeError(`InputXML roundtrip: ${collection} are outside this qualification scope.`);
    }
  }
}
function normalizeType(value) {
  const type = String(value ?? '').trim().toUpperCase();
  return ({ ELBO: 'BEND', ELBOW: 'BEND' })[type] ?? type;
}
function convertLength(value, fromUnit, toUnit) {
  const from = LENGTH_TO_METRES[fromUnit];
  const to = LENGTH_TO_METRES[toUnit];
  if (!from || !to) throw new RangeError(`InputXML roundtrip: unsupported length conversion ${fromUnit}->${toUnit}.`);
  return value * from / to;
}
