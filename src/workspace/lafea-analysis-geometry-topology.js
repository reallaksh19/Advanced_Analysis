/** Deterministic planar topology checks for mesh-independent LAFEA.3 geometry. */
const TWO_PI = Math.PI * 2;
const EPS = 1e-9;

export function validateLafeaPlanarGeometryTopology(geometry) {
  const vertices = new Map(geometry.vertices.map((row) => [row.vertexId, row]));
  const segments = new Map(geometry.segments.map((row) => [row.segmentId, row]));
  const loops = geometry.loops;
  const outer = loops.filter((row) => row.role === 'OUTER');
  const holes = loops.filter((row) => row.role === 'HOLE');
  if (outer.length !== 1) fail('LAFEA_ANALYSIS_GEOMETRY_OUTER_LOOP_COUNT_INVALID');
  const owner = new Map();
  for (const loop of loops) {
    validateLoopConnectivity(loop, segments);
    const area = signedLoopArea(loop, vertices, segments);
    if (loop.role === 'OUTER' && !(area > scaledEps(geometry))) {
      fail('LAFEA_ANALYSIS_GEOMETRY_OUTER_ORIENTATION_INVALID');
    }
    if (loop.role === 'HOLE' && !(area < -scaledEps(geometry))) {
      fail('LAFEA_ANALYSIS_GEOMETRY_HOLE_ORIENTATION_INVALID');
    }
    for (const segmentId of loop.segmentIds) {
      if (owner.has(segmentId)) fail('LAFEA_ANALYSIS_GEOMETRY_SEGMENT_MULTI_LOOP');
      owner.set(segmentId, loop.loopId);
    }
  }
  if (owner.size !== segments.size) fail('LAFEA_ANALYSIS_GEOMETRY_ORPHAN_SEGMENT');
  rejectIntersections(loops, vertices, segments);
  for (const hole of holes) {
    const point = loopInteriorProbe(hole, vertices, segments, geometry);
    if (!pointInLoop(point, outer[0], vertices, segments)) {
      fail('LAFEA_ANALYSIS_GEOMETRY_HOLE_OUTSIDE_OUTER');
    }
    for (const other of holes) {
      if (other.loopId !== hole.loopId && pointInLoop(point, other, vertices, segments)) {
        fail('LAFEA_ANALYSIS_GEOMETRY_NESTED_HOLES_UNSUPPORTED');
      }
    }
  }
  return true;
}

function validateLoopConnectivity(loop, segments) {
  if (loop.segmentIds.length < 3) fail('LAFEA_ANALYSIS_GEOMETRY_LOOP_TOO_SHORT');
  for (let index = 0; index < loop.segmentIds.length; index += 1) {
    const current = segments.get(loop.segmentIds[index]);
    const next = segments.get(loop.segmentIds[(index + 1) % loop.segmentIds.length]);
    if (!current || !next) fail('LAFEA_ANALYSIS_GEOMETRY_LOOP_SEGMENT_MISSING');
    if (current.endVertexId !== next.startVertexId) fail('LAFEA_ANALYSIS_GEOMETRY_LOOP_DISCONNECTED');
  }
}

function signedLoopArea(loop, vertices, segments) {
  let twiceArea = 0;
  for (const segmentId of loop.segmentIds) {
    const segment = segments.get(segmentId);
    const a = vertices.get(segment.startVertexId);
    const b = vertices.get(segment.endVertexId);
    twiceArea += segment.type === 'LINE'
      ? a.x * b.y - b.x * a.y
      : arcTwiceArea(segment, a, b);
  }
  return twiceArea / 2;
}

function arcTwiceArea(segment, a, b) {
  const start = Math.atan2(a.y - segment.centerY, a.x - segment.centerX);
  const end = Math.atan2(b.y - segment.centerY, b.x - segment.centerX);
  const delta = signedSweep(start, end, segment.sweep);
  return segment.radius * segment.centerX * (Math.sin(end) - Math.sin(start))
    - segment.radius * segment.centerY * (Math.cos(end) - Math.cos(start))
    + segment.radius * segment.radius * delta;
}

function rejectIntersections(loops, vertices, segments) {
  for (let li = 0; li < loops.length; li += 1) {
    for (let lj = li; lj < loops.length; lj += 1) {
      const left = loops[li]; const right = loops[lj];
      for (let i = 0; i < left.segmentIds.length; i += 1) {
        for (let j = 0; j < right.segmentIds.length; j += 1) {
          if (li === lj && (i === j || j < i)) continue;
          const a = segments.get(left.segmentIds[i]);
          const b = segments.get(right.segmentIds[j]);
          const result = intersections(a, b, vertices);
          if (result.overlap) fail('LAFEA_ANALYSIS_GEOMETRY_SEGMENT_OVERLAP');
          if (!result.points.length) continue;
          const adjacent = li === lj && (
            (i + 1) % left.segmentIds.length === j
            || (j + 1) % left.segmentIds.length === i
          );
          if (!adjacent || result.points.some((point) => !sharedEndpoint(point, a, b, vertices))) {
            fail(li === lj
              ? 'LAFEA_ANALYSIS_GEOMETRY_SELF_INTERSECTION'
              : 'LAFEA_ANALYSIS_GEOMETRY_LOOP_INTERSECTION');
          }
        }
      }
    }
  }
}

function intersections(a, b, vertices) {
  if (a.type === 'LINE' && b.type === 'LINE') return lineLine(a, b, vertices);
  if (a.type === 'LINE') return lineArc(a, b, vertices);
  if (b.type === 'LINE') return lineArc(b, a, vertices);
  return arcArc(a, b, vertices);
}

function lineLine(a, b, vertices) {
  const p = vertices.get(a.startVertexId); const p2 = vertices.get(a.endVertexId);
  const q = vertices.get(b.startVertexId); const q2 = vertices.get(b.endVertexId);
  const r = sub(p2, p); const s = sub(q2, q); const rxs = cross(r, s); const qmp = sub(q, p);
  if (nearZero(rxs, p, p2, q, q2)) {
    if (!nearZero(cross(qmp, r), p, p2, q, q2)) return { points: [], overlap: false };
    const axis = Math.abs(r.x) >= Math.abs(r.y) ? 'x' : 'y';
    const denom = r[axis];
    const t0 = (q[axis] - p[axis]) / denom; const t1 = (q2[axis] - p[axis]) / denom;
    const lo = Math.max(0, Math.min(t0, t1)); const hi = Math.min(1, Math.max(t0, t1));
    if (hi < lo - EPS) return { points: [], overlap: false };
    if (hi - lo > EPS) return { points: [], overlap: true };
    return { points: [lerp(p, p2, clamp((lo + hi) / 2))], overlap: false };
  }
  const t = cross(qmp, s) / rxs; const u = cross(qmp, r) / rxs;
  return unitRange(t) && unitRange(u)
    ? { points: [lerp(p, p2, clamp(t))], overlap: false }
    : { points: [], overlap: false };
}

function lineArc(line, arc, vertices) {
  const p = vertices.get(line.startVertexId); const q = vertices.get(line.endVertexId);
  const d = sub(q, p); const f = { x: p.x - arc.centerX, y: p.y - arc.centerY };
  const A = dot(d, d); const B = 2 * dot(f, d); const C = dot(f, f) - arc.radius * arc.radius;
  const disc = B * B - 4 * A * C;
  if (disc < -scaledEpsValues(A, B, C)) return { points: [], overlap: false };
  const roots = disc <= 0
    ? [-B / (2 * A)]
    : [(-B - Math.sqrt(Math.max(0, disc))) / (2 * A), (-B + Math.sqrt(Math.max(0, disc))) / (2 * A)];
  return {
    points: uniquePoints(roots.filter(unitRange).map((t) => lerp(p, q, clamp(t)))
      .filter((point) => pointOnArc(point, arc, vertices))),
    overlap: false,
  };
}

function arcArc(a, b, vertices) {
  const c1 = { x: a.centerX, y: a.centerY }; const c2 = { x: b.centerX, y: b.centerY };
  const d = distance(c1, c2);
  if (d <= scaledEpsValues(a.radius, b.radius)
    && Math.abs(a.radius - b.radius) <= scaledEpsValues(a.radius, b.radius)) {
    return { points: [], overlap: sameCircleOverlap(a, b, vertices) };
  }
  if (d > a.radius + b.radius + EPS || d < Math.abs(a.radius - b.radius) - EPS || d <= EPS) {
    return { points: [], overlap: false };
  }
  const x = (a.radius ** 2 - b.radius ** 2 + d ** 2) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.radius ** 2 - x ** 2));
  const ux = (c2.x - c1.x) / d; const uy = (c2.y - c1.y) / d;
  const base = { x: c1.x + x * ux, y: c1.y + x * uy };
  const candidates = [{ x: base.x - h * uy, y: base.y + h * ux }];
  if (h > EPS) candidates.push({ x: base.x + h * uy, y: base.y - h * ux });
  return {
    points: uniquePoints(candidates.filter((point) =>
      pointOnArc(point, a, vertices) && pointOnArc(point, b, vertices))),
    overlap: false,
  };
}

function sameCircleOverlap(a, b, vertices) {
  const ae = arcEndpointAngles(a, vertices); const be = arcEndpointAngles(b, vertices);
  return angleOnArc(ae.start, b, vertices, false)
    || angleOnArc(ae.end, b, vertices, false)
    || angleOnArc(be.start, a, vertices, false)
    || angleOnArc(be.end, a, vertices, false)
    || angleOnArc(midpointAngle(ae.start, ae.end, a.sweep), b, vertices, false)
    || angleOnArc(midpointAngle(be.start, be.end, b.sweep), a, vertices, false);
}

function pointOnArc(point, arc, vertices) {
  const radial = Math.hypot(point.x - arc.centerX, point.y - arc.centerY);
  return Math.abs(radial - arc.radius) <= scaledEpsValues(radial, arc.radius)
    && angleOnArc(Math.atan2(point.y - arc.centerY, point.x - arc.centerX), arc, vertices, true);
}

function angleOnArc(angle, arc, vertices, includeEnds) {
  const { start, end } = arcEndpointAngles(arc, vertices);
  const total = Math.abs(signedSweep(start, end, arc.sweep));
  const delta = arc.sweep === 'CCW' ? ccwDelta(start, angle) : ccwDelta(angle, start);
  return includeEnds ? delta <= total + EPS : delta > EPS && delta < total - EPS;
}

function arcEndpointAngles(arc, vertices) {
  const a = vertices.get(arc.startVertexId); const b = vertices.get(arc.endVertexId);
  return {
    start: Math.atan2(a.y - arc.centerY, a.x - arc.centerX),
    end: Math.atan2(b.y - arc.centerY, b.x - arc.centerX),
  };
}

function loopInteriorProbe(loop, vertices, segments, geometry) {
  const segment = segments.get(loop.segmentIds[0]); let point; let tangent;
  if (segment.type === 'LINE') {
    const a = vertices.get(segment.startVertexId); const b = vertices.get(segment.endVertexId);
    point = lerp(a, b, 0.5); tangent = sub(b, a);
  } else {
    const angles = arcEndpointAngles(segment, vertices);
    const mid = midpointAngle(angles.start, angles.end, segment.sweep);
    point = { x: segment.centerX + segment.radius * Math.cos(mid), y: segment.centerY + segment.radius * Math.sin(mid) };
    const sign = segment.sweep === 'CCW' ? 1 : -1;
    tangent = { x: -sign * Math.sin(mid), y: sign * Math.cos(mid) };
  }
  const length = Math.hypot(tangent.x, tangent.y);
  const shift = Math.max(1, geometryScale(geometry)) * 1e-7;
  const inward = loop.role === 'OUTER'
    ? { x: -tangent.y / length, y: tangent.x / length }
    : { x: tangent.y / length, y: -tangent.x / length };
  return { x: point.x + inward.x * shift, y: point.y + inward.y * shift };
}

function pointInLoop(point, loop, vertices, segments) {
  let crossings = 0;
  for (const segmentId of loop.segmentIds) {
    const segment = segments.get(segmentId);
    if (segment.type === 'LINE') {
      const a = vertices.get(segment.startVertexId); const b = vertices.get(segment.endVertexId);
      if ((a.y > point.y) !== (b.y > point.y)) {
        const x = a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y);
        if (x > point.x) crossings += 1;
      }
      continue;
    }
    const dy = point.y - segment.centerY;
    if (Math.abs(dy) > segment.radius) continue;
    const dx = Math.sqrt(Math.max(0, segment.radius ** 2 - dy ** 2));
    for (const x of [segment.centerX - dx, segment.centerX + dx]) {
      if (x <= point.x) continue;
      const angle = Math.atan2(dy, x - segment.centerX);
      if (angleOnArcHalfOpen(angle, segment, vertices)) crossings += 1;
    }
  }
  return crossings % 2 === 1;
}

function angleOnArcHalfOpen(angle, arc, vertices) {
  const { start, end } = arcEndpointAngles(arc, vertices);
  const total = Math.abs(signedSweep(start, end, arc.sweep));
  const delta = arc.sweep === 'CCW' ? ccwDelta(start, angle) : ccwDelta(angle, start);
  if (delta < -EPS || delta >= total - EPS) return false;
  const tangentY = arc.sweep === 'CCW' ? Math.cos(angle) : -Math.cos(angle);
  return Math.abs(tangentY) > EPS;
}

function sharedEndpoint(point, a, b, vertices) {
  const ids = [a.startVertexId, a.endVertexId]
    .filter((id) => id === b.startVertexId || id === b.endVertexId);
  return ids.some((id) => distance(point, vertices.get(id)) <= scaledEpsValues(point.x, point.y));
}
function midpointAngle(start, end, sweep) { return start + signedSweep(start, end, sweep) / 2; }
function signedSweep(start, end, sweep) { return sweep === 'CCW' ? ccwDelta(start, end) : -ccwDelta(end, start); }
function ccwDelta(start, end) { let value = normalize(end) - normalize(start); if (value < 0) value += TWO_PI; return value; }
function normalize(value) { let out = value % TWO_PI; if (out < 0) out += TWO_PI; return out; }
function geometryScale(geometry) { return Math.max(1, ...geometry.vertices.flatMap((v) => [Math.abs(v.x), Math.abs(v.y)]), ...geometry.segments.filter((s) => s.type === 'CIRCULAR_ARC').map((s) => s.radius)); }
function scaledEps(geometry) { return EPS * geometryScale(geometry) ** 2; }
function scaledEpsValues(...values) { return EPS * Math.max(1, ...values.map((v) => Math.abs(v))); }
function nearZero(value, ...points) { return Math.abs(value) <= EPS * Math.max(1, ...points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])); }
function uniquePoints(points) { const out = []; for (const p of points) if (!out.some((q) => distance(p, q) <= scaledEpsValues(p.x, p.y, q.x, q.y))) out.push(p); return out; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function cross(a, b) { return a.x * b.y - a.y * b.x; }
function dot(a, b) { return a.x * b.x + a.y * b.y; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function unitRange(value) { return value >= -EPS && value <= 1 + EPS; }
function clamp(value) { return Math.max(0, Math.min(1, value)); }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
