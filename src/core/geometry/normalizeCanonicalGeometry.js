import { SUPPORTED_UNITS } from './geometrySchema.js';

/**
 * Normalizes canonical geometry in place or returns a normalized copy.
 * Ensures units are valid, adds missing required properties where possible,
 * and normalizes the internal structure.
 *
 * @param {object} geometry - The canonical geometry object to normalize.
 * @returns {object} The normalized canonical geometry object.
 */
export const normalizeCanonicalGeometry = (geometry) => {
  if (!geometry || typeof geometry !== 'object') {
    return geometry;
  }

  const normalized = { ...geometry };

  // Normalize units (defaulting to mm if missing or unsupported)
  if (!normalized.unit || typeof normalized.unit !== 'string' || !SUPPORTED_UNITS.LENGTH.includes(normalized.unit.toLowerCase())) {
    normalized.unit = 'mm';
  } else {
    normalized.unit = normalized.unit.toLowerCase();
  }

  // Ensure arrays exist
  normalized.nodes = Array.isArray(normalized.nodes) ? normalized.nodes : [];
  normalized.segments = Array.isArray(normalized.segments) ? normalized.segments : [];
  normalized.components = Array.isArray(normalized.components) ? normalized.components : [];
  normalized.supports = Array.isArray(normalized.supports) ? normalized.supports : [];
  normalized.loads = Array.isArray(normalized.loads) ? normalized.loads : [];
  normalized.materials = Array.isArray(normalized.materials) ? normalized.materials : [];
  normalized.diagnostics = Array.isArray(normalized.diagnostics) ? normalized.diagnostics : [];

  // Normalize segments
  normalized.segments = normalized.segments.map(segment => {
    if (!segment || typeof segment !== 'object') return segment;
    const s = { ...segment };
    // Basic sanitization
    if (typeof s.diameter === 'string') s.diameter = parseFloat(s.diameter);
    if (typeof s.thickness === 'string') s.thickness = parseFloat(s.thickness);
    if (typeof s.length === 'string') s.length = parseFloat(s.length);
    if (!s.type) s.type = 'UNKNOWN';
    return s;
  });

  // Normalize nodes
  normalized.nodes = normalized.nodes.map(node => {
     if (!node || typeof node !== 'object') return node;
     const n = { ...node };
     if (typeof n.x === 'string') n.x = parseFloat(n.x);
     if (typeof n.y === 'string') n.y = parseFloat(n.y);
     if (typeof n.z === 'string') n.z = parseFloat(n.z);
     return n;
  });

  return normalized;
};
