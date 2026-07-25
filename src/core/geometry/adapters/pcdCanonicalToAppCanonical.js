import {
  fromCsv,
  enrichWithPipeData,
  resolveConnectivity,
  toCanonicalGeometry,
} from '../../../vendors/pipe-component-data/src/index.js';

/**
 * Map a pipe-component-data canonical projection (simplified-canonical-geometry/v1)
 * plus its source AdapterGraph into this app's canonical-geometry-v1 shape
 * accepted by useAppStore.setCanonicalGeometry().
 *
 * The package projection carries lengths/masses per segment; node topology is
 * recovered from the AdapterGraph anchors referenced by each graph segment.
 *
 * @param {Object} pcdCanonical Output of pipe-component-data toCanonicalGeometry().
 * @param {Object} adapterGraph The AdapterGraph the projection was built from.
 * @param {Object} [options]    { source } label for provenance.
 * @returns {Object} canonical-geometry-v1 document.
 */
export function pcdCanonicalToAppCanonical(pcdCanonical, adapterGraph, options = {}) {
  const anchorsById = new Map((adapterGraph?.anchors || []).map((a) => [a.id, a]));
  const graphSegmentsById = new Map((adapterGraph?.segments || []).map((s) => [s.id, s]));

  const nodes = [];
  const nodeIdByAnchor = new Map();
  function nodeFor(anchorId) {
    if (nodeIdByAnchor.has(anchorId)) return nodeIdByAnchor.get(anchorId);
    const anchor = anchorsById.get(anchorId);
    const id = `N${nodes.length + 1}`;
    nodes.push({
      id,
      label: anchorId,
      x_mm: Number(anchor?.point?.x ?? 0),
      y_mm: Number(anchor?.point?.y ?? 0),
      z_mm: Number(anchor?.point?.z ?? 0),
    });
    nodeIdByAnchor.set(anchorId, id);
    return id;
  }

  const segments = (pcdCanonical?.segments || []).map((segment) => {
    const graphSegment = graphSegmentsById.get(segment.id) || {};
    return {
      id: segment.id,
      type: segment.componentType,
      startNodeId: graphSegment.startAnchorId ? nodeFor(graphSegment.startAnchorId) : null,
      endNodeId: graphSegment.endAnchorId ? nodeFor(graphSegment.endAnchorId) : null,
      length_mm: Number(segment.length_mm ?? 0),
      bore_mm: Number(segment.pipe?.bore_mm ?? segment.pipe?.innerDiameter_mm ?? 0) || null,
      attributes: {
        od_mm: segment.pipe?.outerDiameter_mm ?? null,
        wall_mm: segment.pipe?.wallThickness_mm ?? null,
        componentWeight_kg: segment.component?.componentWeight_kg ?? 0,
        metalMass_kg: segment.metalMass_kg ?? null,
        totalMass_kg: segment.totalMass_kg ?? null,
        provenance: segment.provenance || {},
      },
    };
  });

  return {
    schemaVersion: 'canonical-geometry-v1',
    source: options.source || 'pipe-component-data',
    unit: 'mm',
    nodes,
    segments,
    diagnostics: [...(pcdCanonical?.diagnostics || [])],
    summary: {
      componentCount: (adapterGraph?.components || []).length,
      nodeCount: nodes.length,
      segmentCount: segments.length,
    },
    valid: segments.length > 0,
  };
}

/**
 * Convenience pipeline: CSV text → AdapterGraph (enriched + connected) →
 * package canonical projection → this app's canonical-geometry-v1.
 *
 * @param {string} csvText Piping CSV in pipe-component-data column format.
 * @param {Object} [options] { source, fluidDensityKgM3 }
 * @returns {{ canonical: Object, adapterGraph: Object, pcdCanonical: Object }}
 */
export function buildCanonicalGeometryFromCsv(csvText, options = {}) {
  const parsed = fromCsv(String(csvText || ''), { now: options.now });
  const enriched = enrichWithPipeData(parsed);
  const connected = resolveConnectivity(enriched);
  const pcdCanonical = toCanonicalGeometry(connected, {
    fluidDensityKgM3: options.fluidDensityKgM3,
  });
  const canonical = pcdCanonicalToAppCanonical(pcdCanonical, connected, options);
  return { canonical, adapterGraph: connected, pcdCanonical };
}
