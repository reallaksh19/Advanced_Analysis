/** Canonical mesh-independent planar geometry contract for LAFEA.3. */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { validateLafeaPlanarGeometryTopology } from './lafea-analysis-geometry-topology.js';

export const LAFEA_ANALYSIS_GEOMETRY_SCHEMA = 'lafea-analysis-geometry/v1';
export const LAFEA_ANALYSIS_GEOMETRY_STAGE_ID = 'LAFEA.3';
export const LAFEA_ANALYSIS_GEOMETRY_SEGMENT_TYPES = Object.freeze(['LINE', 'CIRCULAR_ARC']);
export const LAFEA_ANALYSIS_GEOMETRY_LOOP_ROLES = Object.freeze(['OUTER', 'HOLE']);
export const LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY = 'OUTER_CCW_HOLES_CW_V1';

const GEOMETRY_KEYS = Object.freeze([
  'schema', 'stageId', 'geometryId', 'coordinateSystemId', 'lengthUnit',
  'orientationPolicy', 'vertices', 'segments', 'loops',
]);
const VERTEX_KEYS = Object.freeze(['vertexId', 'x', 'y']);
const LINE_KEYS = Object.freeze(['segmentId', 'type', 'startVertexId', 'endVertexId']);
const ARC_KEYS = Object.freeze([
  'segmentId', 'type', 'startVertexId', 'endVertexId',
  'centerX', 'centerY', 'radius', 'sweep',
]);
const LOOP_KEYS = Object.freeze(['loopId', 'role', 'segmentIds']);

export function createLafeaAnalysisGeometry(value) {
  exact(value, GEOMETRY_KEYS, 'LAFEA_ANALYSIS_GEOMETRY_KEYS_INVALID');
  if (value.schema !== LAFEA_ANALYSIS_GEOMETRY_SCHEMA
    || value.stageId !== LAFEA_ANALYSIS_GEOMETRY_STAGE_ID) {
    fail('LAFEA_ANALYSIS_GEOMETRY_SCHEMA_OR_STAGE_INVALID');
  }
  if (value.orientationPolicy !== LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY) {
    fail('LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY_INVALID');
  }
  const vertices = array(value.vertices, 'VERTICES').map(canonicalVertex)
    .sort((a, b) => compare(a.vertexId, b.vertexId));
  unique(vertices.map((row) => row.vertexId), 'LAFEA_ANALYSIS_GEOMETRY_VERTEX_ID_DUPLICATE');
  const vertexMap = new Map(vertices.map((row) => [row.vertexId, row]));
  const segments = array(value.segments, 'SEGMENTS').map((row) => canonicalSegment(row, vertexMap))
    .sort((a, b) => compare(a.segmentId, b.segmentId));
  unique(segments.map((row) => row.segmentId), 'LAFEA_ANALYSIS_GEOMETRY_SEGMENT_ID_DUPLICATE');
  const segmentIds = new Set(segments.map((row) => row.segmentId));
  const loops = array(value.loops, 'LOOPS').map((row) => canonicalLoop(row, segmentIds))
    .sort(loopCompare);
  unique(loops.map((row) => row.loopId), 'LAFEA_ANALYSIS_GEOMETRY_LOOP_ID_DUPLICATE');
  const record = {
    schema: LAFEA_ANALYSIS_GEOMETRY_SCHEMA,
    stageId: LAFEA_ANALYSIS_GEOMETRY_STAGE_ID,
    geometryId: text(value.geometryId, 'GEOMETRY_ID'),
    coordinateSystemId: text(value.coordinateSystemId, 'COORDINATE_SYSTEM_ID'),
    lengthUnit: text(value.lengthUnit, 'LENGTH_UNIT'),
    orientationPolicy: LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY,
    vertices, segments, loops,
  };
  validateLafeaPlanarGeometryTopology(record);
  return seal(record);
}

export function validateLafeaAnalysisGeometry(value) {
  if (!value || typeof value !== 'object' || value.schema !== LAFEA_ANALYSIS_GEOMETRY_SCHEMA) {
    fail('LAFEA_ANALYSIS_GEOMETRY_SCHEMA_INVALID');
  }
  const input = Object.fromEntries(GEOMETRY_KEYS.map((key) => [key, value[key]]));
  const rebuilt = createLafeaAnalysisGeometry(input);
  if (value.semanticHash !== rebuilt.semanticHash
    || canonicalLafeaSha256(value) !== canonicalLafeaSha256(rebuilt)) {
    fail('LAFEA_ANALYSIS_GEOMETRY_TAMPERED');
  }
  return rebuilt;
}

export function lafeaAnalysisGeometryFeatureInventory(value) {
  const geometry = validateLafeaAnalysisGeometry(value);
  return freeze({
    vertexIds: geometry.vertices.map((row) => row.vertexId),
    segmentIds: geometry.segments.map((row) => row.segmentId),
    loopIds: geometry.loops.map((row) => row.loopId),
  });
}

function canonicalVertex(value) {
  exact(value, VERTEX_KEYS, 'LAFEA_ANALYSIS_GEOMETRY_VERTEX_KEYS_INVALID');
  return freeze({
    vertexId: text(value.vertexId, 'VERTEX_ID'),
    x: finite(value.x, 'VERTEX_X'),
    y: finite(value.y, 'VERTEX_Y'),
  });
}

function canonicalSegment(value, vertices) {
  if (!value || typeof value !== 'object') fail('LAFEA_ANALYSIS_GEOMETRY_SEGMENT_INVALID');
  const keys = value.type === 'LINE' ? LINE_KEYS : value.type === 'CIRCULAR_ARC' ? ARC_KEYS : null;
  if (!keys) fail('LAFEA_ANALYSIS_GEOMETRY_SEGMENT_TYPE_INVALID');
  exact(value, keys, 'LAFEA_ANALYSIS_GEOMETRY_SEGMENT_KEYS_INVALID');
  const startVertexId = text(value.startVertexId, 'SEGMENT_START_VERTEX_ID');
  const endVertexId = text(value.endVertexId, 'SEGMENT_END_VERTEX_ID');
  if (!vertices.has(startVertexId) || !vertices.has(endVertexId)) {
    fail('LAFEA_ANALYSIS_GEOMETRY_SEGMENT_VERTEX_MISSING');
  }
  if (startVertexId === endVertexId) fail('LAFEA_ANALYSIS_GEOMETRY_SEGMENT_DEGENERATE');
  const base = {
    segmentId: text(value.segmentId, 'SEGMENT_ID'),
    type: value.type,
    startVertexId,
    endVertexId,
  };
  if (value.type === 'LINE') {
    const a = vertices.get(startVertexId); const b = vertices.get(endVertexId);
    if (Math.hypot(b.x - a.x, b.y - a.y) <= tolerance(a.x, a.y, b.x, b.y)) {
      fail('LAFEA_ANALYSIS_GEOMETRY_LINE_ZERO_LENGTH');
    }
    return freeze(base);
  }
  const arc = {
    ...base,
    centerX: finite(value.centerX, 'ARC_CENTER_X'),
    centerY: finite(value.centerY, 'ARC_CENTER_Y'),
    radius: positive(value.radius, 'ARC_RADIUS'),
    sweep: member(value.sweep, ['CW', 'CCW'], 'ARC_SWEEP'),
  };
  validateArc(arc, vertices);
  return freeze(arc);
}

function validateArc(arc, vertices) {
  const a = vertices.get(arc.startVertexId); const b = vertices.get(arc.endVertexId);
  const ra = Math.hypot(a.x - arc.centerX, a.y - arc.centerY);
  const rb = Math.hypot(b.x - arc.centerX, b.y - arc.centerY);
  const eps = tolerance(ra, rb, arc.radius);
  if (Math.abs(ra - arc.radius) > eps || Math.abs(rb - arc.radius) > eps) {
    fail('LAFEA_ANALYSIS_GEOMETRY_ARC_RADIUS_INCONSISTENT');
  }
  const start = Math.atan2(a.y - arc.centerY, a.x - arc.centerX);
  const end = Math.atan2(b.y - arc.centerY, b.x - arc.centerX);
  const delta = arc.sweep === 'CCW' ? ccw(start, end) : ccw(end, start);
  if (delta <= 1e-12 || delta >= Math.PI * 2 - 1e-12) {
    fail('LAFEA_ANALYSIS_GEOMETRY_ARC_SWEEP_INVALID');
  }
}

function canonicalLoop(value, segmentIds) {
  exact(value, LOOP_KEYS, 'LAFEA_ANALYSIS_GEOMETRY_LOOP_KEYS_INVALID');
  const ids = array(value.segmentIds, 'LOOP_SEGMENT_IDS')
    .map((id) => text(id, 'LOOP_SEGMENT_ID'));
  unique(ids, 'LAFEA_ANALYSIS_GEOMETRY_LOOP_SEGMENT_DUPLICATE');
  if (ids.some((id) => !segmentIds.has(id))) fail('LAFEA_ANALYSIS_GEOMETRY_LOOP_SEGMENT_MISSING');
  return freeze({
    loopId: text(value.loopId, 'LOOP_ID'),
    role: member(value.role, LAFEA_ANALYSIS_GEOMETRY_LOOP_ROLES, 'LOOP_ROLE'),
    segmentIds: rotateToMinimum(ids),
  });
}

function rotateToMinimum(values) {
  if (!values.length) return [];
  let best = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (compare(values[index], values[best]) < 0) best = index;
  }
  return [...values.slice(best), ...values.slice(0, best)];
}
function loopCompare(a, b) {
  if (a.role !== b.role) return a.role === 'OUTER' ? -1 : 1;
  return compare(a.loopId, b.loopId);
}
function seal(record) {
  return freeze({ ...record, semanticHash: canonicalLafeaSha256({
    schema: 'lafea-analysis-geometry-hash-input/v1', geometry: record,
  }) });
}
function exact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code);
}
function array(value, field) {
  if (!Array.isArray(value) || value.length === 0) fail(`LAFEA_ANALYSIS_GEOMETRY_${field}_INVALID`);
  return value;
}
function unique(values, code) { if (new Set(values).size !== values.length) fail(code); }
function text(value, field) { if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_ANALYSIS_GEOMETRY_${field}_INVALID`); return value.trim(); }
function finite(value, field) { if (typeof value !== 'number' || !Number.isFinite(value)) fail(`LAFEA_ANALYSIS_GEOMETRY_${field}_INVALID`); return Object.is(value, -0) ? 0 : value; }
function positive(value, field) { const out = finite(value, field); if (!(out > 0)) fail(`LAFEA_ANALYSIS_GEOMETRY_${field}_INVALID`); return out; }
function member(value, allowed, field) { if (!allowed.includes(value)) fail(`LAFEA_ANALYSIS_GEOMETRY_${field}_INVALID`); return value; }
function tolerance(...values) { return 1e-9 * Math.max(1, ...values.map((v) => Math.abs(v))); }
function ccw(start, end) { let value = end - start; while (value < 0) value += Math.PI * 2; while (value >= Math.PI * 2) value -= Math.PI * 2; return value; }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
