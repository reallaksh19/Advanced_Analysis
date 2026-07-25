import { test } from 'node:test';
import assert from 'node:assert';
import { validateCanonicalGeometry } from './validateCanonicalGeometry.js';

test('validateCanonicalGeometry - valid geometry', () => {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    unit: 'mm',
    nodes: [
      { id: 'n1', x: 0, y: 0, z: 0 },
      { id: 'n2', x: 1000, y: 0, z: 0 }
    ],
    segments: [
      { id: 's1', startNodeId: 'n1', endNodeId: 'n2', type: 'PIPE', diameter: 100, thickness: 5 }
    ]
  };
  const result = validateCanonicalGeometry(geometry);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errors.length, 0);
});

test('validateCanonicalGeometry - missing unit defaults to mm', () => {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    nodes: [
      { id: 'n1', x: 0, y: 0, z: 0 },
      { id: 'n2', x: 1000, y: 0, z: 0 }
    ],
    segments: [
      { id: 's1', startNodeId: 'n1', endNodeId: 'n2', type: 'PIPE', diameter: 100, thickness: 5 }
    ]
  };
  const result = validateCanonicalGeometry(geometry);
  assert.strictEqual(result.errors.some(e => e.code === 'GEOM_UNIT_MISSING'), true);
  assert.strictEqual(result.ok, false);
});

test('validateCanonicalGeometry - duplicate node', () => {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    unit: 'mm',
    nodes: [
      { id: 'n1', x: 0, y: 0, z: 0 },
      { id: 'n1', x: 1000, y: 0, z: 0 }
    ],
    segments: []
  };
  const result = validateCanonicalGeometry(geometry);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors.some(e => e.code === 'NODE_ID_DUPLICATE'), true);
});

test('validateCanonicalGeometry - missing calculation properties', () => {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    unit: 'mm',
    nodes: [
      { id: 'n1', x: 0, y: 0, z: 0 },
      { id: 'n2', x: 1000, y: 0, z: 0 }
    ],
    segments: [
      { id: 's1', startNodeId: 'n1', endNodeId: 'n2', type: 'PIPE' }
    ]
  };
  const result = validateCanonicalGeometry(geometry);
  assert.strictEqual(result.warnings.some(w => w.code === 'SEGMENT_DIAMETER_MISSING'), true);
  assert.strictEqual(result.warnings.some(w => w.code === 'SEGMENT_THICKNESS_MISSING'), true);
});

test('validateCanonicalGeometry - zero-length segment', () => {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    unit: 'mm',
    nodes: [
      { id: 'n1', x: 0, y: 0, z: 0 },
      { id: 'n2', x: 0, y: 0, z: 0 }
    ],
    segments: [
      { id: 's1', startNodeId: 'n1', endNodeId: 'n2', type: 'PIPE', length: 0, diameter: 100, thickness: 5 }
    ]
  };
  const result = validateCanonicalGeometry(geometry);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors.some(e => e.code === 'SEGMENT_ZERO_LENGTH'), true);
});

test('validateCanonicalGeometry - zero-length segment as support is valid', () => {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    unit: 'mm',
    nodes: [
      { id: 'n1', x: 0, y: 0, z: 0 },
      { id: 'n2', x: 0, y: 0, z: 0 }
    ],
    segments: [
      { id: 's1', startNodeId: 'n1', endNodeId: 'n2', type: 'SUPPORT', length: 0 }
    ]
  };
  const result = validateCanonicalGeometry(geometry);
  assert.strictEqual(result.ok, true);
});

test('validateCanonicalGeometry - orphan segment references missing node', () => {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    unit: 'mm',
    nodes: [
      { id: 'n1', x: 0, y: 0, z: 0 }
    ],
    segments: [
      { id: 's1', startNodeId: 'n1', endNodeId: 'n2', type: 'PIPE', diameter: 100, thickness: 5 }
    ]
  };
  const result = validateCanonicalGeometry(geometry);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors.some(e => e.code === 'SEGMENT_END_MISSING'), true);
});

test('validateCanonicalGeometry - component references missing segment', () => {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    unit: 'mm',
    nodes: [],
    segments: [],
    components: [
      { id: 'c1', segmentId: 's1' }
    ]
  };
  const result = validateCanonicalGeometry(geometry);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors.some(e => e.code === 'COMPONENT_SEGMENT_MISSING'), true);
});

test('validateCanonicalGeometry - support references missing node', () => {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    unit: 'mm',
    nodes: [],
    segments: [],
    supports: [
      { id: 'sup1', nodeId: 'n1' }
    ]
  };
  const result = validateCanonicalGeometry(geometry);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors.some(e => e.code === 'SUPPORT_NODE_MISSING'), true);
});
