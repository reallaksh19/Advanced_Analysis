import { validateCanonicalGeometry } from '../validateCanonicalGeometry.js';

const UNIT_TO_FEET = Object.freeze({
  mm: 0.003280839895,
  millimeter: 0.003280839895,
  m: 3.280839895,
  meter: 3.280839895,
  in: 1 / 12,
  inch: 1 / 12,
  ft: 1,
  feet: 1,
});

/**
 * Convert CanonicalGeometry into Calc Extended's existing nodes/segments shape.
 * Calc Extended stores coordinates in feet for its current simplified formulas.
 *
 * @param {import('../geometryTypes.js').CanonicalGeometry} geometry
 * @param {{ source?: string }} options
 */
export function canonicalToExtended(geometry, options = {}) {
  const validation = validateCanonicalGeometry(geometry, { requireKnownUnit: true });
  const unit = geometry?.unit || 'unknown';
  const factor = UNIT_TO_FEET[String(unit).toLowerCase()] || 1;
  const warnings = [];

  if (!validation.ok) warnings.push('Canonical geometry failed validation before Calc Extended conversion.');
  if (!UNIT_TO_FEET[String(unit).toLowerCase()]) warnings.push(`Unknown geometry unit "${unit}"; assuming coordinates are already feet.`);

  const nodes = (geometry?.nodes || []).map((node) => ({
    id: node.id,
    x: node.x * factor,
    y: node.y * factor,
    z: node.z * factor,
    sourceComponentUid: node.sourceComponentUid,
    restraint: node.restraint || 'FREE',
    meta: node.meta || {},
  }));

  const segments = (geometry?.segments || []).map((segment) => ({
    id: segment.id,
    startNodeId: segment.startNodeId,
    endNodeId: segment.endNodeId,
    type: segment.type || 'PIPE',
    sourceComponentUid: segment.sourceComponentUid,
    material: segment.material,
    diameter: segment.diameter,
    thickness: segment.thickness,
    meta: segment.meta || {},
  }));

  return {
    schemaVersion: 'extended-calc-input-v1',
    source: options.source || geometry?.source || 'canonical',
    nodes,
    segments,
    diagnostics: [...(geometry?.diagnostics || []), ...validation.diagnostics],
    warnings,
    summary: {
      sourceUnit: unit,
      nodeCount: nodes.length,
      segmentCount: segments.length,
      validationOk: validation.ok,
    },
  };
}
