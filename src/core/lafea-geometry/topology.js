import { LafeaGeometryError } from './errors.js';
import { canonicalCurve, canonicalVertex, curveGreenContribution } from './vertex-curve.js';
import { exactKeys, nonEmptyString, stringArray } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

/**
 * Explicit planar topology (spec §10.1): vertices, analytic curves, closed
 * loops, and regions bounded by an outer loop minus zero or more hole loops.
 * Named locations and partitions live in `feature-tags.js`, layered on top of
 * an accepted topology rather than mixed into it.
 */
export const TOPOLOGY_SCHEMA = 'lafea-geometry-topology/v1';

const TOPOLOGY_FIELDS = Object.freeze(['schema', 'vertices', 'curves', 'loops', 'regions']);
const LOOP_FIELDS = Object.freeze(['loopId', 'curveIds']);
const REGION_FIELDS = Object.freeze(['regionId', 'outerLoopId', 'holeLoopIds']);

export function canonicalTopology(source) {
  exactKeys(source, TOPOLOGY_FIELDS, 'topology');
  if (source.schema !== TOPOLOGY_SCHEMA) throw new LafeaGeometryError(`topology.schema must be ${TOPOLOGY_SCHEMA}`, 'UNSUPPORTED_SCHEMA');
  if (!Array.isArray(source.vertices) || source.vertices.length === 0) throw new LafeaGeometryError('topology.vertices must be a non-empty array', 'MISSING_VERTICES');
  const vertices = canonicalUniqueList(source.vertices, canonicalVertex, (v) => v.vertexId, 'topology.vertices');
  const vertexById = new Map(vertices.map((v) => [v.vertexId, v]));

  if (!Array.isArray(source.curves) || source.curves.length === 0) throw new LafeaGeometryError('topology.curves must be a non-empty array', 'MISSING_CURVES');
  const curves = canonicalUniqueList(source.curves, (c) => canonicalCurve(c, vertexById), (c) => c.curveId, 'topology.curves');
  const curveById = new Map(curves.map((c) => [c.curveId, c]));

  if (!Array.isArray(source.loops) || source.loops.length === 0) throw new LafeaGeometryError('topology.loops must be a non-empty array', 'MISSING_LOOPS');
  const loops = canonicalUniqueList(source.loops, (l) => canonicalLoop(l, curveById, vertexById), (l) => l.loopId, 'topology.loops');
  const loopById = new Map(loops.map((l) => [l.loopId, l]));

  if (!Array.isArray(source.regions) || source.regions.length === 0) throw new LafeaGeometryError('topology.regions must be a non-empty array', 'MISSING_REGIONS');
  const regions = canonicalUniqueList(source.regions, (r) => canonicalRegion(r, loopById), (r) => r.regionId, 'topology.regions');

  const envelope = { schema: TOPOLOGY_SCHEMA, vertices, curves, loops, regions };
  return Object.freeze({ ...envelope, semanticHash: semanticHash(envelope) });
}

function canonicalLoop(source, curveById, vertexById) {
  exactKeys(source, LOOP_FIELDS, 'loop');
  const loopId = nonEmptyString(source.loopId, 'loop.loopId');
  const curveIds = stringArray(source.curveIds, `loop.${loopId}.curveIds`);
  if (curveIds.length < 1) throw new LafeaGeometryError(`loop.${loopId} must reference at least one curve`, 'EMPTY_LOOP');
  const resolved = curveIds.map((id) => {
    const curve = curveById.get(id);
    if (!curve) throw new LafeaGeometryError(`loop.${loopId} references an unresolved curve: ${id}`, 'UNRESOLVED_CURVE');
    return curve;
  });
  for (let index = 0; index < resolved.length; index += 1) {
    const current = resolved[index];
    const next = resolved[(index + 1) % resolved.length];
    if (current.endVertexId !== next.startVertexId) {
      throw new LafeaGeometryError(`loop.${loopId} is not closed between ${current.curveId} and ${next.curveId}`, 'OPEN_LOOP');
    }
  }
  let raw = 0;
  for (const curve of resolved) raw += curveGreenContribution(curve, vertexById);
  const signedArea = raw / 2;
  if (Math.abs(signedArea) < 1e-12) throw new LafeaGeometryError(`loop.${loopId} has zero or ill-conditioned area`, 'DEGENERATE_LOOP');
  return Object.freeze({ loopId, curveIds: Object.freeze([...curveIds]), signedArea });
}

function canonicalRegion(source, loopById) {
  exactKeys(source, REGION_FIELDS, 'region');
  const regionId = nonEmptyString(source.regionId, 'region.regionId');
  const outerLoop = requireLoop(source.outerLoopId, loopById, `region.${regionId}.outerLoopId`);
  if (!(outerLoop.signedArea > 0)) {
    throw new LafeaGeometryError(`region.${regionId} outer loop must be counter-clockwise (positive signed area); found ${outerLoop.signedArea}`, 'OUTER_LOOP_NOT_CCW');
  }
  const holeLoopIds = stringArray(source.holeLoopIds, `region.${regionId}.holeLoopIds`);
  const holeLoops = holeLoopIds.map((id) => requireLoop(id, loopById, `region.${regionId}.holeLoopIds`));
  for (const hole of holeLoops) {
    if (!(hole.signedArea < 0)) {
      throw new LafeaGeometryError(`region.${regionId} hole loop ${hole.loopId} must be clockwise (negative signed area); found ${hole.signedArea}`, 'HOLE_LOOP_NOT_CW');
    }
  }
  const netArea = outerLoop.signedArea + holeLoops.reduce((sum, hole) => sum + hole.signedArea, 0);
  if (!(netArea > 0)) throw new LafeaGeometryError(`region.${regionId} net area is non-positive after removing holes`, 'DEGENERATE_REGION');
  return Object.freeze({
    regionId,
    outerLoopId: outerLoop.loopId,
    holeLoopIds: Object.freeze([...holeLoopIds]),
    netArea,
  });
}

function requireLoop(loopId, loopById, label) {
  const loop = loopById.get(loopId);
  if (!loop) throw new LafeaGeometryError(`${label} references an unresolved loop: ${loopId}`, 'UNRESOLVED_LOOP');
  return loop;
}

function canonicalUniqueList(items, canonicalize, keyOf, label) {
  const canonicalItems = items.map((item) => canonicalize(item));
  const seen = new Set();
  for (const item of canonicalItems) {
    const key = keyOf(item);
    if (seen.has(key)) throw new LafeaGeometryError(`${label} contains a duplicate identity: ${key}`, 'DUPLICATE_IDENTITY');
    seen.add(key);
  }
  return Object.freeze(canonicalItems.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0)));
}
