import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  applyTopologyEditAuthoredBendProjection,
  deriveTopologyEditAuthoredBendProjection,
} from '../src/workspace/topology-edit/authoring/topology-edit-authored-bend-geometry.js';

function topology(radiusMm = 100) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'bend-visual', datasetVersion: 1,
    sourceHash: 'source:bend-visual', topologyGraphHash: 'graph:bend-visual',
    nodes: [
      { id: 'node:left', position: { x: -500, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:corner', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:up', position: { x: 0, y: 500, z: 0 }, portKeys: [] },
    ],
    edges: [
      { id: 'edge:left', fromNodeId: 'node:left', toNodeId: 'node:corner', diameterMm: 100, entityType: 'PIPE', createdByCommandId: 'command:edge-left' },
      { id: 'edge:up', fromNodeId: 'node:corner', toNodeId: 'node:up', diameterMm: 100, entityType: 'PIPE', createdByCommandId: 'command:edge-up' },
    ],
    bends: [{
      id: 'bend:corner', nodeId: 'node:corner', edgeIds: ['edge:left', 'edge:up'],
      position: { x: 0, y: 0, z: 0 }, radiusMm, angleDeg: 90,
      radiusAuthority: 'TEST', createdByCommandId: 'command:bend',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}

function projection() {
  return Object.freeze({
    elements: Object.freeze([]),
    segments: Object.freeze(routeSegments()),
  });
}

function routeSegments() {
  return [
    Object.freeze({
      id: 'visual:left', entityId: 'edge:left', kind: 'PIPE',
      start: { x: -500, y: 0, z: 0 }, end: { x: 0, y: 0, z: 0 },
      radiusMm: 50, pickTarget: { objectId: 'edge:left' },
    }),
    Object.freeze({
      id: 'visual:up', entityId: 'edge:up', kind: 'PIPE',
      start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 500, z: 0 },
      radiusMm: 50, pickTarget: { objectId: 'edge:up' },
    }),
  ];
}

test('authored bend projection trims both route arms and inserts one pickable arc', () => {
  const canonical = topology();
  const before = projection();
  const result = applyTopologyEditAuthoredBendProjection(before, canonical);
  assert.deepEqual(before.segments[0].end, { x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(result.segments[0].end.x + 100) < 1e-9);
  assert.ok(Math.abs(result.segments[0].end.y) < 1e-9);
  assert.ok(Math.abs(result.segments[1].start.x) < 1e-9);
  assert.ok(Math.abs(result.segments[1].start.y - 100) < 1e-9);
  const arc = result.segments.find((row) => row.pickTarget?.objectId === 'bend:corner');
  assert.ok(arc);
  assert.equal(arc.type, 'ELBOW_ARC');
  assert.equal(arc.curveKind, 'CUBIC_BEZIER');
  assert.ok(arc.points.length >= 9);
  assert.equal(Object.isFrozen(result), true);
});

test('authored bend projection preserves governed compact packet authority', () => {
  const before = Object.freeze({
    schema: 'TopologyEditSjsonGovernedProjection.v2',
    renderStyle: 'TOPO_VALIDATOR_EDIT_DRAFT_COMPACT',
    renderAuthority: 'TEST_GOVERNED_RENDER_AUTHORITY',
    governedRenderAuthority: 'TEST_SINGLE_PACKET_AUTHORITY',
    compactElements: Object.freeze([]),
    compactSegments: Object.freeze(routeSegments()),
    editDraftMetrics: Object.freeze({ exactTeeCount: 0 }),
  });
  const result = applyTopologyEditAuthoredBendProjection(before, topology());
  assert.equal(result.schema, before.schema);
  assert.equal(result.renderStyle, before.renderStyle);
  assert.equal(result.renderAuthority, before.renderAuthority);
  assert.equal(result.governedRenderAuthority, before.governedRenderAuthority);
  assert.equal(result.editDraftMetrics, before.editDraftMetrics);
  assert.equal(result.compactSegments.length, 3);
  assert.ok(Math.abs(result.compactSegments[0].end.x + 100) < 1e-9);
  const arc = result.compactSegments.find((row) => row.pickTarget?.partRole === 'authored-elbow-arc');
  assert.ok(arc);
  assert.equal(arc.curveKind, 'CUBIC_BEZIER');
  assert.ok(arc.controlPoint1);
  assert.ok(arc.controlPoint2);
  assert.equal(result.authoredBendArcCount, 1);
  assert.match(result.authoredBendProjectionHash, /^fnv1a64:[a-f0-9]{16}$/);

  const repeated = applyTopologyEditAuthoredBendProjection(result, topology());
  assert.equal(repeated.compactSegments.length, 3);
  assert.equal(
    repeated.compactSegments.filter((row) => row.pickTarget?.partRole === 'authored-elbow-arc').length,
    1,
  );
});

test('authored bend derivation fails closed when radius exceeds arm tangency', () => {
  const result = deriveTopologyEditAuthoredBendProjection(topology(600));
  assert.equal(result.segments.length, 0);
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0].message, /exceeds an available arm tangent/);
});
