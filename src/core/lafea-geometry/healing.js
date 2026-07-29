import { LafeaGeometryError } from './errors.js';
import { positiveNumber } from '../shared-analysis-contract/numeric.js';
import { canonicalTopology } from './topology.js';

/**
 * Tolerance-based vertex-merge healing (spec §10.1: "Tolerance-based merge is
 * previewed and accepted; no automatic destructive merge without audit.").
 * `preview()` never mutates the source topology and never applies a merge —
 * it only reports candidate pairs. `accept()` requires the caller to have
 * seen that exact preview (by its semantic hash) before it will apply it.
 */

export function previewHealing(topology, mergeTolerance) {
  positiveNumber(mergeTolerance, 'mergeTolerance');
  const candidates = [];
  const vertices = topology.vertices;
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      const a = vertices[i];
      const b = vertices[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0 && distance <= mergeTolerance) {
        candidates.push(Object.freeze({ keepVertexId: a.vertexId, mergeVertexId: b.vertexId, distance }));
      }
    }
  }
  const preview = Object.freeze({
    sourceTopologySemanticHash: topology.semanticHash,
    mergeTolerance,
    candidates: Object.freeze(candidates),
  });
  return preview;
}

/**
 * Apply exactly the candidate merges from a previously produced preview.
 * Rejects if the topology has changed since the preview was produced (stale
 * preview) or if the caller supplies merges the preview never proposed.
 *
 * @param {Readonly<object>} topology Topology the preview was computed from.
 * @param {Readonly<object>} preview Output of `previewHealing`.
 * @returns {Readonly<object>} A new, re-canonicalized, re-hashed topology.
 */
export function acceptHealing(topology, preview) {
  if (preview.sourceTopologySemanticHash !== topology.semanticHash) {
    throw new LafeaGeometryError('Healing preview is stale for this topology', 'STALE_HEALING_PREVIEW');
  }
  if (preview.candidates.length === 0) return topology;
  const replacement = new Map();
  for (const candidate of preview.candidates) {
    const keep = replacement.get(candidate.keepVertexId) ?? candidate.keepVertexId;
    replacement.set(candidate.mergeVertexId, keep);
  }
  const resolve = (vertexId) => {
    let current = vertexId;
    while (replacement.has(current)) current = replacement.get(current);
    return current;
  };
  const survivingVertexIds = new Set(topology.vertices.map((v) => v.vertexId).filter((id) => resolve(id) === id));
  const vertices = topology.vertices.filter((v) => survivingVertexIds.has(v.vertexId)).map((v) => ({ ...v }));
  const curves = topology.curves.map((curve) => ({
    ...curve,
    startVertexId: resolve(curve.startVertexId),
    endVertexId: resolve(curve.endVertexId),
    arc: curve.arc ? { ...curve.arc, center: { ...curve.arc.center } } : null,
  }));
  const loops = topology.loops.map((loop) => ({ loopId: loop.loopId, curveIds: [...loop.curveIds] }));
  const regions = topology.regions.map((region) => ({
    regionId: region.regionId,
    outerLoopId: region.outerLoopId,
    holeLoopIds: [...region.holeLoopIds],
  }));
  return canonicalTopology({ schema: topology.schema, vertices, curves, loops, regions });
}
