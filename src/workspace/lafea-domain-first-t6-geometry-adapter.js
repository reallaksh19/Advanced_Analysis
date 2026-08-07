import { canonicalTopology } from '../core/lafea-geometry/topology.js';
import { triangulateRegion } from '../core/lafea-meshing/constrained-delaunay-t6.js';
import { validateLafeaAnalysisGeometryEvidence } from './lafea-analysis-geometry-evidence.js';
import { validateLafeaContinuumAnalysisDomain } from './lafea-continuum-analysis-domain.js';

export function triangulateLafeaDomainFirstT6({
  analysisDomain,
  analysisGeometryEvidence,
  intent,
}) {
  const evidence = validateLafeaAnalysisGeometryEvidence(analysisGeometryEvidence);
  const geometry = evidence.geometry;
  const domain = validateLafeaContinuumAnalysisDomain(analysisDomain, geometry);
  requireParents(domain, evidence, intent);
  if (geometry.loops.some((loop) => loop.role === 'HOLE')) {
    fail('LAFEA_MP3_HOLES_NOT_QUALIFIED');
  }
  if (intent.elementFamily !== 'T6') fail('LAFEA_MP3_T6_FAMILY_REQUIRED');
  if (intent.refinementFeatureIds.length) fail('LAFEA_MP3_REFINEMENT_NOT_QUALIFIED');
  if (!(intent.growthLimit >= 1)) fail('LAFEA_MP3_GROWTH_LIMIT_INVALID');
  const topology = canonicalTopology(toCoreTopology(geometry, domain.region.regionId));
  const chordErrorLimit = chordErrorFromAngularTolerance(
    geometry, intent.curvatureToleranceDegrees, intent.targetElementLength,
  );
  const elements = triangulateRegion(topology, domain.region.regionId, {
    targetSize: intent.targetElementLength,
    chordErrorLimit,
  });
  return freeze({ topology, elements, chordErrorLimit, geometry, domain, evidence });
}

function toCoreTopology(geometry, regionId) {
  const outer = geometry.loops.find((loop) => loop.role === 'OUTER');
  return {
    schema: 'lafea-geometry-topology/v1',
    vertices: geometry.vertices.map((row) => ({
      vertexId: row.vertexId, x: row.x, y: row.y,
    })),
    curves: geometry.segments.map((row) => row.type === 'LINE' ? {
      curveId: row.segmentId,
      type: 'LINE',
      startVertexId: row.startVertexId,
      endVertexId: row.endVertexId,
      arc: null,
    } : {
      curveId: row.segmentId,
      type: 'ARC',
      startVertexId: row.startVertexId,
      endVertexId: row.endVertexId,
      arc: {
        center: { x: row.centerX, y: row.centerY },
        radius: row.radius,
        direction: row.sweep,
      },
    }),
    loops: [{ loopId: outer.loopId, curveIds: [...outer.segmentIds] }],
    regions: [{ regionId, outerLoopId: outer.loopId, holeLoopIds: [] }],
  };
}

function chordErrorFromAngularTolerance(geometry, degrees, targetSize) {
  if (!(degrees > 0 && degrees < 180)) fail('LAFEA_MP3_CURVATURE_TOLERANCE_INVALID');
  const arcs = geometry.segments.filter((row) => row.type === 'CIRCULAR_ARC');
  if (!arcs.length) return Math.max(Number.EPSILON, targetSize * 1e-9);
  const half = degrees * Math.PI / 360;
  return Math.min(...arcs.map((arc) => arc.radius * (1 - Math.cos(half))));
}

function requireParents(domain, evidence, intent) {
  if (intent.stageId !== 'LAFEA.3'
    || domain.sourceHash !== intent.sourceHash
    || evidence.sourceHash !== intent.sourceHash
    || domain.semanticHash !== intent.analysisDomainHash
    || evidence.analysisDomainHash !== intent.analysisDomainHash
    || evidence.analysisGeometryHash !== intent.analysisGeometryHash) {
    fail('LAFEA_MP3_DOMAIN_GEOMETRY_PARENT_MISMATCH');
  }
  if (intent.lengthUnit !== domain.units.length
    || intent.lengthUnit !== evidence.geometry.lengthUnit) {
    fail('LAFEA_MP3_LENGTH_UNIT_MISMATCH');
  }
}
function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
