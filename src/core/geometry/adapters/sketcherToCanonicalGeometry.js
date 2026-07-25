import { CANONICAL_GEOMETRY_SCHEMA_VERSION } from '../geometryTypes.js';
import { validateCanonicalGeometry } from '../validateCanonicalGeometry.js';

const toPos = (node) => (Array.isArray(node?.pos) ? node.pos : [Number(node?.x) || 0, Number(node?.y) || 0, Number(node?.z) || 0]);

export function sketcherToCanonicalGeometry(nodesById = {}, sketchSegments = [], options = {}) {
  const nodes = Object.entries(nodesById || {}).map(([id, node]) => {
    const pos = toPos(node);
    return { id, x: Number(pos[0]) || 0, y: Number(pos[1]) || 0, z: Number(pos[2]) || 0, sourceComponentUid: node.sourceComponentUid, restraint: node.type === 'anchor' ? 'ANCHOR' : node.type === 'guide' ? 'GUIDE' : 'FREE', meta: { ...(node.meta || {}), sketcherType: node.type || 'free' } };
  });

  const segments = (sketchSegments || []).map((segment, index) => ({ id: segment.id || `SK-S${String(index + 1).padStart(3, '0')}`, startNodeId: segment.startNode || segment.startNodeId, endNodeId: segment.endNode || segment.endNodeId, type: segment.properties?.type || segment.type || 'PIPE', sourceComponentUid: segment.sourceComponentUid || segment.properties?.sourceComponentUid, length: segment.length, diameter: segment.properties?.bore || segment.diameter, material: segment.properties?.material || segment.material, meta: { ...(segment.properties || {}), source: 'sketcher' } }));

  const geometry = { schemaVersion: CANONICAL_GEOMETRY_SCHEMA_VERSION, nodes, segments, source: options.source || 'sketcher', unit: options.unit || 'mm', diagnostics: [{ severity: 'info', code: 'SKETCHER_CANONICAL_ADAPTER', message: 'Converted Sketcher graph to canonical geometry.', data: { nodeCount: nodes.length, segmentCount: segments.length } }], summary: { nodeCount: nodes.length, segmentCount: segments.length, plane: options.plane || 'XY' } };
  const validation = validateCanonicalGeometry(geometry, { requireKnownUnit: false });
  geometry.valid = validation.ok;
  geometry.diagnostics = [...geometry.diagnostics, ...validation.diagnostics];
  geometry.summary = { ...geometry.summary, ...validation.summary };
  return geometry;
}

export function canonicalGeometryToSketcher(geometry) {
  const nodes = {};
  (geometry?.nodes || []).forEach((node) => {
    nodes[node.id] = { pos: [Number(node.x) || 0, Number(node.y) || 0, Number(node.z) || 0], type: node.restraint === 'ANCHOR' ? 'anchor' : node.restraint === 'GUIDE' ? 'guide' : node.meta?.sketcherType || 'free', sourceComponentUid: node.sourceComponentUid, meta: node.meta || {} };
  });
  const segments = (geometry?.segments || []).map((segment) => ({ id: segment.id, startNode: segment.startNodeId, endNode: segment.endNodeId, properties: { type: segment.type || 'PIPE', bore: segment.diameter || segment.meta?.bore || 100, material: segment.material || segment.meta?.material || 'UNKNOWN', sourceComponentUid: segment.sourceComponentUid } }));
  return { nodes, segments, warnings: (geometry?.diagnostics || []).filter((diagnostic) => diagnostic.severity === 'warn') };
}
