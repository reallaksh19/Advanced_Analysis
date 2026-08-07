import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  buildTopologyEditSourceRepresentability,
  createTopologyEditSourceCapabilityProfile,
  SOURCE_CAPABILITY,
  SOURCE_REPRESENTABILITY,
} from '../src/workspace/topology-edit/export/topology-edit-source-representability.js';

function fixture() {
  const topology = finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'dataset-source', datasetVersion: 4,
    sourceHash: 'sha256:source', topologyGraphHash: 'sha256:graph',
    nodes: [
      node('node:n1', 0), node('node:n2', 1000), node('node:n3', 1200), node('node:n4', 1550),
    ],
    edges: [
      {
        ...edge('edge:reducer', 'node:n1', 'node:n2', 'REDUCER'),
        diameterMm: 100, secondaryNominalSizeMm: 80,
        reducerType: 'ECCENTRIC', reducerOrientation: 'FLAT_TOP',
      },
      {
        ...edge('edge:valve', 'node:n2', 'node:n3', 'VALVE'),
        diameterMm: 80, componentLengthMm: 200,
        catalogueBinding: {
          catalogueId: 'VALVES', catalogueVersion: 'A', catalogueHash: 'sha256:cat',
          sourceHash: 'sha256:cat-source', recordId: 'BALL-80-150', recordHash: 'sha256:rec',
          sourceReference: { documentId: 'spec', revision: 'A', path: '/ball/80' },
        },
      },
      {
        ...edge('edge:native', 'node:n3', 'node:n4', 'PIPE'), diameterMm: 80,
        identityKind: 'NATIVE_COMMAND',
      },
    ],
    junctions: [],
    supports: [{
      id: 'support:s1', entityId: 'support-source', nodeId: 'node:n3', hostEntityId: 'valve-source',
      resolved: true, restraint: { type: 'GUIDE', gapMm: 3, travelMm: 12 },
    }],
    boundaries: [], rigids: [],
  });
  const dataset = {
    entities: [{
      entityId: 'valve-source', sourceEntityId: 'V-10', sourcePath: '/objects/valve',
      properties: {
        sourceAttributes: { VENDOR_CUSTOM_FIELD: 'KEEP-ME' }, enrichedAttributes: {}, nativeParams: {},
      },
    }],
  };
  return { topology, dataset };
}
function node(id, x) { return { id, position: { x, y: 0, z: 0 }, portKeys: [] }; }
function edge(id, fromNodeId, toNodeId, entityType) {
  return { id, componentKey: id.replace('edge:', ''), fromNodeId, toNodeId, entityType };
}
function inputXmlProfile(overrides = {}) {
  return createTopologyEditSourceCapabilityProfile({
    family: 'INPUT_XML', version: 'fixture-v1',
    capabilities: {
      [SOURCE_CAPABILITY.TOPOLOGY_IDENTITY]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.CONNECTIVITY]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.COORDINATES_MM]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.ELEMENT_TYPE]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.PRIMARY_SIZE_MM]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.SECONDARY_SIZE_MM]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.COMPONENT_LENGTH_MM]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.CATALOGUE_BINDING]: SOURCE_REPRESENTABILITY.INTERNAL_METADATA,
      [SOURCE_CAPABILITY.SUPPORT_ATTACHMENT]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.SUPPORT_GAP_MM]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.SUPPORT_TRAVEL_MM]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.NATIVE_IDENTITY]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.OPAQUE_SOURCE_FIELDS]: SOURCE_REPRESENTABILITY.PRESERVED_OPAQUE,
      ...overrides,
    },
  });
}

test('unspecified eccentric reducer orientation is a blocking engineering loss', () => {
  const { topology, dataset } = fixture();
  const report = buildTopologyEditSourceRepresentability({
    canonicalTopology: topology, dataset, profile: inputXmlProfile(),
  });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.blockingCount, 1);
  assert.equal(report.blockers[0].canonicalId, 'edge:reducer');
  assert.equal(report.blockers[0].property, 'reducerOrientation');
  assert.equal(report.blockers[0].capability, SOURCE_CAPABILITY.REDUCER_ORIENTATION);
});

test('explicit source capability turns the same model representable without downgrading catalogue or opaque custody', () => {
  const { topology, dataset } = fixture();
  const report = buildTopologyEditSourceRepresentability({
    canonicalTopology: topology,
    dataset,
    profile: inputXmlProfile({
      [SOURCE_CAPABILITY.REDUCER_ORIENTATION]: SOURCE_REPRESENTABILITY.EXACT,
    }),
  });
  assert.equal(report.status, 'REPRESENTABLE');
  assert.equal(report.blockingCount, 0);
  const catalogue = report.rows.find((row) => row.property === 'catalogueBinding');
  const opaque = report.rows.find((row) => row.property === 'opaqueSourceFields');
  const native = report.rows.find((row) => row.property === 'nativeIdentity');
  assert.equal(catalogue.classification, 'INTERNAL_METADATA');
  assert.equal(catalogue.blockingReason, null);
  assert.equal(opaque.classification, 'PRESERVED_OPAQUE');
  assert.equal(native.classification, 'EXACT');
});

test('partial catalogue custody blocks even when the target claims catalogue support', () => {
  const { topology, dataset } = fixture();
  const raw = structuredClone(topology);
  delete raw.canonicalTopologyHash;
  const valve = raw.edges.find((row) => row.id === 'edge:valve');
  assert.ok(valve?.catalogueBinding);
  delete valve.catalogueBinding.sourceHash;
  const partial = finalizeCanonicalTopology(raw);
  const report = buildTopologyEditSourceRepresentability({
    canonicalTopology: partial,
    dataset,
    profile: inputXmlProfile({
      [SOURCE_CAPABILITY.REDUCER_ORIENTATION]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.CATALOGUE_BINDING]: SOURCE_REPRESENTABILITY.EXACT,
    }),
  });
  const blocker = report.blockers.find((row) => row.property === 'catalogueBinding');
  assert.equal(report.status, 'BLOCKED');
  assert.equal(blocker?.canonicalId, 'edge:valve');
  assert.equal(blocker?.blockingReason, 'CATALOGUE_CUSTODY_INCOMPLETE');
});

test('engineering capabilities default to BLOCKING rather than hidden loss', () => {
  const { topology } = fixture();
  const profile = createTopologyEditSourceCapabilityProfile({
    family: 'INPUT_XML', version: 'empty', capabilities: {},
  });
  const report = buildTopologyEditSourceRepresentability({ canonicalTopology: topology, profile });
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.blockingCount > 5);
  assert.ok(report.blockers.some((row) => row.capability === SOURCE_CAPABILITY.CONNECTIVITY));
  assert.ok(report.blockers.some((row) => row.capability === SOURCE_CAPABILITY.SUPPORT_GAP_MM));
});
