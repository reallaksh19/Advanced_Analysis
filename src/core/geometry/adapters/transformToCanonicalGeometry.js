import { CANONICAL_GEOMETRY_SCHEMA_VERSION } from '../geometryTypes.js';
import { validateCanonicalGeometry } from '../validateCanonicalGeometry.js';

const pointKey = (point, tolerance) => [Math.round(Number(point[0] || 0) / tolerance), Math.round(Number(point[1] || 0) / tolerance), 0].join('|');

export function transformPayloadToCanonicalGeometry(payload, options = {}) {
  const tolerance = options.tolerance ?? 1e-6;
  const segments2D = payload?.segments2D || payload?.segments || [];
  const nodes = [];
  const segments = [];
  const nodeMap = new Map();
  const diagnostics = [{ severity: 'info', code: 'TRANSFORM_CANONICAL_ADAPTER', message: 'Converted Transform 2D payload to canonical geometry.', data: { source: payload?.source || payload?.name || 'transform' } }];

  const getNodeId = (point, sourceSegmentId, role) => {
    const key = pointKey(point, tolerance);
    if (nodeMap.has(key)) return nodeMap.get(key);
    const id = `T2D-N${String(nodes.length + 1).padStart(3, '0')}`;
    nodeMap.set(key, id);
    nodes.push({ id, x: Number(point[0]) || 0, y: Number(point[1]) || 0, z: Number(point[2]) || 0, sourceComponentUid: sourceSegmentId, restraint: 'UNKNOWN', meta: { role, source: 'transform' } });
    return id;
  };

  segments2D.forEach((segment, index) => {
    const start = segment.start2D;
    const end = segment.end2D;
    if (!Array.isArray(start) || !Array.isArray(end)) {
      diagnostics.push({ severity: 'warn', code: 'TRANSFORM_SEGMENT_MISSING_2D_POINTS', message: `Skipped transform segment at index ${index}; missing start2D/end2D.`, data: { segmentId: segment?.id } });
      return;
    }
    const startNodeId = getNodeId(start, segment.sourceComponentUid || segment.id, 'start');
    const endNodeId = getNodeId(end, segment.sourceComponentUid || segment.id, 'end');
    segments.push({ id: `T2D-S${String(segments.length + 1).padStart(3, '0')}`, startNodeId, endNodeId, type: segment.type || segment.properties?.type || 'PIPE', sourceComponentUid: segment.sourceComponentUid || segment.sourceSegmentId || segment.id, length: Number(segment.trueLength) || Math.hypot(end[0] - start[0], end[1] - start[1]), diameter: segment.diameter || segment.bore || segment.properties?.bore, material: segment.material || segment.properties?.material, meta: { ...segment, source: 'transform-2d' } });
  });

  const geometry = { schemaVersion: CANONICAL_GEOMETRY_SCHEMA_VERSION, nodes, segments, source: options.source || payload?.source || 'transform', unit: options.unit || payload?.unit || 'mm', diagnostics, summary: { nodeCount: nodes.length, segmentCount: segments.length, plane: payload?.plane, sourcePayloadName: payload?.name } };
  const validation = validateCanonicalGeometry(geometry, { requireKnownUnit: false });
  geometry.valid = validation.ok;
  geometry.diagnostics = [...geometry.diagnostics, ...validation.diagnostics];
  geometry.summary = { ...geometry.summary, ...validation.summary };
  return geometry;
}
