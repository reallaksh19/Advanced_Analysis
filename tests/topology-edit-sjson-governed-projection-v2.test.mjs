import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptSjsonVisualToGovernedEditDraftProjection,
  TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
  TOPOLOGY_EDIT_SJSON_GOVERNED_RENDER_AUTHORITY,
  TOPOLOGY_EDIT_SJSON_OLET_AUTHORITY,
  TOPOLOGY_EDIT_SJSON_TEE_AUTHORITY,
} from '../src/workspace/topology-edit/topology-edit-sjson-governed-projection-v2.js';

const tee = primitive('tee:1', 'junction:tee:1', 'TEE_JUNCTION', {
  center: { x: 10, y: 20, z: 30 },
  runEnds: [{ x: -90, y: 20, z: 30 }, { x: 110, y: 20, z: 30 }],
  branchEnd: { x: 10, y: 120, z: 30 },
  runOutsideDiameterMm: 100,
  branchOutsideDiameterMm: 50,
});
const olet = primitive('olet:1', 'junction:olet:1', 'OLET_BRANCH', {
  center: { x: 200, y: 0, z: 0 },
  branchEnd: { x: 200, y: 0, z: 75 },
  branchOutsideDiameterMm: 25,
});
const node = Object.freeze({
  id: 'node:1', entityId: 'node:1', type: 'node', x: 10, y: 20, z: 30,
  pickTarget: { modelRole: 'draft', objectKind: 'node', objectId: 'node:1', nodeId: 'node:1' },
});
const visualResult = Object.freeze({
  model: Object.freeze({ visualGeometryHash: 'fixture', diagnostics: Object.freeze([]) }),
  projection: Object.freeze({
    primitives: Object.freeze([tee, olet]),
    elements: Object.freeze([node]),
    segments: Object.freeze([]),
  }),
});

test('governed SJSON projection makes rich arrays evidence-only', () => {
  const result = adaptSjsonVisualToGovernedEditDraftProjection({ visualResult, dataset: { entities: [] } });
  assert.equal(result.projection.schema, TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA);
  assert.equal(result.projection.governedRenderAuthority, TOPOLOGY_EDIT_SJSON_GOVERNED_RENDER_AUTHORITY);
  assert.deepEqual(result.projection.primitives, []);
  assert.deepEqual(result.projection.elements, []);
  assert.deepEqual(result.projection.segments, []);
  assert.equal(result.projection.typedEvidenceProjection.primitives.length, 2);
  assert.equal(result.projection.compactElements.length, 1);
  assert.equal(result.editDraftMetrics.activeRichPrimitiveCount, 0);
  assert.equal(result.editDraftMetrics.activeLegacyElementCount, 0);
  assert.equal(result.editDraftMetrics.activeLegacySegmentCount, 0);
});

test('tee and olet centerlines use exact source connection coordinates', () => {
  const result = adaptSjsonVisualToGovernedEditDraftProjection({ visualResult, dataset: { entities: [] } });
  const teeRows = result.projection.compactSegments.filter((row) => row.primitiveId === tee.primitiveId);
  const oletRows = result.projection.compactSegments.filter((row) => row.primitiveId === olet.primitiveId);
  assert.equal(teeRows.length, 3);
  assert.deepEqual(teeRows.map((row) => row.start), [tee.parameters.center, tee.parameters.center, tee.parameters.center]);
  assert.deepEqual(teeRows.map((row) => row.end), [...tee.parameters.runEnds, tee.parameters.branchEnd]);
  assert.ok(teeRows.every((row) => row.geometryAuthority === TOPOLOGY_EDIT_SJSON_TEE_AUTHORITY));
  assert.equal(oletRows.length, 1);
  assert.deepEqual(oletRows[0].start, olet.parameters.center);
  assert.deepEqual(oletRows[0].end, olet.parameters.branchEnd);
  assert.equal(oletRows[0].geometryAuthority, TOPOLOGY_EDIT_SJSON_OLET_AUTHORITY);
  assert.equal(result.editDraftMetrics.exactTeeCount, 1);
  assert.equal(result.editDraftMetrics.exactTeeSegmentCount, 3);
  assert.equal(result.editDraftMetrics.exactOletCount, 1);
  assert.equal(result.editDraftMetrics.exactOletSegmentCount, 1);
});

function primitive(primitiveId, canonicalEntityId, kind, parameters) {
  return Object.freeze({
    primitiveId,
    canonicalEntityId,
    kind,
    modelRole: 'DRAFT',
    partRole: 'body',
    sourcePaths: Object.freeze([`/fixture/${primitiveId}`]),
    workspaceEntityIds: Object.freeze([primitiveId]),
    parameters: Object.freeze(parameters),
  });
}
