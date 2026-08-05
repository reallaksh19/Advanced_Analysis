import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  adaptSjsonVisualToEditDraftProjection,
  deriveEditDraftElbowCurve,
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
  TOPOLOGY_EDIT_SJSON_ELBOW_CURVE_AUTHORITY,
} from '../src/workspace/topology-edit/topology-edit-sjson-edit-draft-projection.js';

const fixture = JSON.parse(await readFile(new URL('../public/Sjson.json', import.meta.url), 'utf8'));
const firstElbow = fixture[0].children.find((row) => row.type === 'ELBO');
const attributes = firstElbow.attributes;

test('Edit Draft elbow treats POS as tangent intersection for the production fixture', () => {
  const curve = deriveEditDraftElbowCurve({
    start: attributes.APOS,
    tangentIntersection: attributes.POS,
    end: attributes.LPOS,
  });
  assert.ok(curve);
  assert.equal(curve.authority, TOPOLOGY_EDIT_SJSON_ELBOW_CURVE_AUTHORITY);
  assert.deepEqual(curve.sourceStart, attributes.APOS);
  assert.deepEqual(curve.tangentIntersection, attributes.POS);
  assert.deepEqual(curve.sourceEnd, attributes.LPOS);
  assert.equal(curve.radiusMm, 229);
  assert.ok(curve.startTangentError <= 1e-14);
  assert.ok(curve.endTangentError <= 1e-14);
  assert.ok(Math.abs(curve.sweepAngleRad - (Math.PI / 2)) <= 1e-14);
  assert.deepEqual(curve.arcStart, attributes.APOS);
  assert.deepEqual(curve.arcEnd, attributes.LPOS);
});

test('SJSON adapter retains typed evidence but emits compact Edit Draft bend geometry', () => {
  const primitive = Object.freeze({
    primitiveId: 'primitive:elbow:1',
    canonicalEntityId: 'edge:elbow:1',
    kind: 'ELBOW_ARC',
    modelRole: 'DRAFT',
    partRole: 'body',
    sourcePaths: ['$[0].children[0]'],
    workspaceEntityIds: ['entity:elbow:1'],
    parameters: {
      start: attributes.APOS,
      end: attributes.LPOS,
      center: attributes.POS,
      outsideDiameterMm: 150,
    },
  });
  const visualResult = Object.freeze({
    model: Object.freeze({ visualGeometryHash: 'visual:fixture' }),
    projection: Object.freeze({
      elements: Object.freeze([
        { id: 'node:1', entityId: 'node:1', type: 'node', x: 0, y: 0, z: 0 },
        { id: 'old-bubble', entityId: 'edge:elbow:1', type: 'ELBOW_ARC', x: 1, y: 1, z: 1 },
      ]),
      segments: Object.freeze([]),
      primitives: Object.freeze([primitive]),
    }),
  });
  const dataset = Object.freeze({
    entities: Object.freeze([{
      entityId: 'entity:elbow:1',
      properties: {
        attributes,
        geometry: { start: attributes.APOS, center: attributes.POS, end: attributes.LPOS },
      },
    }]),
  });

  const result = adaptSjsonVisualToEditDraftProjection({ visualResult, dataset });
  assert.equal(result.projection.renderStyle, TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE);
  assert.equal(result.projection.primitives[0], primitive);
  assert.equal(result.projection.compactElements.length, 1);
  assert.equal(result.projection.compactElements[0].type, 'node');
  assert.equal(result.projection.compactSegments.length, 1);
  assert.equal(result.projection.compactSegments[0].curveKind, 'CUBIC_BEZIER');
  assert.equal(result.editDraftMetrics.sourceTangentElbowCount, 1);
  assert.equal(result.editDraftMetrics.omittedSceneRelativeMarkerCount, 0);
  assert.ok(result.editDraftMetrics.maxStartTangentError <= 1e-14);
  assert.ok(result.editDraftMetrics.maxEndTangentError <= 1e-14);
});
