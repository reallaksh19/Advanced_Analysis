import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeTopologyEditTableIntent,
  renderTopologyEditTableEngineeringEditor,
} from '../src/workspace/viewport-productivity/topology-edit-table-engineering-editor.js';
import {
  topologyEditTableTypeSummary,
  topologyEditTableVisibleColumns,
} from '../src/workspace/viewport-productivity/topology-edit-table-properties-view.js';

function valveRow(type = 'GATE') {
  return {
    elementType: 'VALVE', targetRevision: 'sha256:valve-r1',
    identity: { canonicalKind: 'EDGE', canonicalId: 'edge:valve', nodeIds: [], portBindings: [] },
    fields: { tag: 'V-101', valveType: type, lengthMm: 200 },
    custody: { sourceStatus: 'IMPORTED', catalogueAuthority: 'EXACT' },
  };
}
function teeRow() {
  return {
    elementType: 'TEE', targetRevision: 'sha256:tee-r1',
    identity: {
      canonicalKind: 'JUNCTION', canonicalId: 'junction:tee',
      nodeIds: ['node:a', 'node:b', 'node:c'],
      portBindings: [
        { nodeId: 'node:a', portKey: 'tee:port:a' },
        { nodeId: 'node:b', portKey: 'tee:port:b' },
        { nodeId: 'node:c', portKey: 'tee:port:c' },
      ],
    },
    fields: { tag: 'TEE-1', runDnMm: 150, branchDnMm: 100 },
    custody: { sourceStatus: 'IMPORTED', catalogueAuthority: 'UNRESOLVED' },
  };
}
function reducerRow(exact = true) {
  return {
    elementType: 'REDUCER', targetRevision: 'sha256:red-r1',
    identity: { canonicalKind: 'EDGE', canonicalId: 'edge:reducer', nodeIds: [], portBindings: [] },
    fields: { tag: 'RED-1', dnInMm: 100, dnOutMm: 80 },
    custody: {
      sourceStatus: 'IMPORTED', catalogueAuthority: exact ? 'EXACT' : 'UNRESOLVED',
      catalogue: exact ? { recordHash: 'sha256:red-record' } : null,
    },
  };
}

const BALL = Object.freeze({
  catalogueHash: 'sha256:cat', sourceHash: 'sha256:source', recordId: 'BALL-80',
  recordHash: 'sha256:ball', componentType: 'VALVE', nominalSizeMm: 80,
  outsideDiameterMm: 88.9, pipingClass: 'PCL-80', pressureClass: '150',
  materialSpecification: 'A216-WCB', componentMassKg: 24,
  endConnectionFrom: 'FLANGED', endConnectionTo: 'FLANGED', valveType: 'BALL',
  valveFaceToFaceMm: 300,
  sourceReference: { documentId: 'VALVES', revision: 'R2', path: '/BALL/80' },
});

test('M06 editor requires supplied exact BALL record and never pre-populates current GATE custody', () => {
  const empty = renderTopologyEditTableEngineeringEditor(valveRow(), null, { rows: [] });
  assert.match(empty, /data-table-edit-valve-catalogue/);
  assert.match(empty, /Stage GATE → BALL/);
  assert.doesNotMatch(empty, /GATE-RECORD/);
  assert.doesNotMatch(empty, /disabled>Stage GATE/);

  const staged = renderTopologyEditTableEngineeringEditor(valveRow(), {
    intentKind: 'VALVE_REPLACEMENT', requestedValue: { catalogueBinding: BALL },
    geometryPolicy: { anchor: 'TO', propagation: 'UPSTREAM' },
  }, { rows: [] });
  assert.match(staged, /sha256:ball/);
  assert.match(staged, /<option selected>TO<\/option>/);
  assert.match(staged, /<option selected>UPSTREAM<\/option>/);

  const nongate = renderTopologyEditTableEngineeringEditor(valveRow('BALL'), null, { rows: [] });
  assert.match(nongate, /disabled>Stage GATE → BALL/);
});

test('M10 editor exposes explicit branch ports and only exact-custody reducer rows', () => {
  const html = renderTopologyEditTableEngineeringEditor(teeRow(), null, {
    rows: [teeRow(), reducerRow(true), { ...reducerRow(false), identity: { ...reducerRow(false).identity, canonicalId: 'edge:unresolved' } }],
  });
  assert.match(html, /tee:port:a · node:a/);
  assert.match(html, /tee:port:b · node:b/);
  assert.match(html, /tee:port:c · node:c/);
  assert.match(html, /value="edge:reducer"/);
  assert.doesNotMatch(html, /edge:unresolved/);
  assert.match(html, /No branch role or reducer size is guessed/);
});

test('staged descriptions disclose exact M06 and M10 engineering intent', () => {
  assert.match(describeTopologyEditTableIntent({
    intentKind: 'VALVE_REPLACEMENT', priorValue: { valveType: 'GATE', lengthMm: 200 },
    requestedValue: { catalogueBinding: BALL }, geometryPolicy: { anchor: 'FROM', propagation: 'DOWNSTREAM' },
  }), /GATE → BALL/);
  assert.match(describeTopologyEditTableIntent({
    intentKind: 'TEE_REDUCER_RELATION', requestedValue: {
      branchPortKey: 'tee:port:c', reducerEdgeId: 'edge:reducer',
      runNominalSizeMm: 150, teeBranchNominalSizeMm: 100, downstreamNominalSizeMm: 80,
    },
  }), /DN run 150 \/ branch 100 \/ downstream 80/);
});

test('Table property surface exposes support, flange, valve, tee and bend engineering columns', () => {
  const projection = {
    rows: [
      { elementType: 'SUPPORT', fields: { supportType: 'GUIDE', direction: { x: 0, y: 1, z: 0 }, gapMm: 2, travelMm: 4 } },
      { elementType: 'FLANGE', fields: { flangeType: 'WN', flangeFacing: 'RF', rating: '300' } },
      { elementType: 'VALVE', fields: { valveType: 'GATE', operator: 'HANDWHEEL', flowDirection: 'FROM_TO' } },
      { elementType: 'TEE', fields: { runDnMm: 150, branchDnMm: 100, branchAngleDeg: 90 } },
      { elementType: 'ELBOW', fields: { angleDeg: 90, radiusMm: 228.6, turnIntent: 'LONG_RADIUS' } },
    ],
  };
  const columns = new Set(topologyEditTableVisibleColumns(projection).map((column) => column.key));
  for (const key of [
    'supportType', 'direction', 'gapMm', 'travelMm',
    'flangeType', 'flangeFacing', 'rating',
    'valveType', 'operator', 'flowDirection',
    'runDnMm', 'branchDnMm', 'branchAngleDeg',
    'angleDeg', 'radiusMm', 'turnIntent',
  ]) assert.equal(columns.has(key), true, `missing visible engineering column ${key}`);

  const summary = topologyEditTableTypeSummary(projection.rows);
  assert.match(summary, /SUPPORT 1/);
  assert.match(summary, /FLANGE 1/);
  assert.match(summary, /VALVE 1/);
  assert.match(summary, /TEE 1/);
  assert.match(summary, /BEND\/ELBOW 1/);
});
