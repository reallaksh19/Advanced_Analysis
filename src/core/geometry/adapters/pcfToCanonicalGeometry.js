import { DEFAULT_GEOMETRY_UNIT, CANONICAL_GEOMETRY_SCHEMA_VERSION } from '../geometryTypes.js';
import { validateCanonicalGeometry } from '../validateCanonicalGeometry.js';

const parseNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizePoint = (point) => {
  if (!point || typeof point !== 'object') return null;
  const x = parseNumber(point.x);
  const y = parseNumber(point.y);
  const z = parseNumber(point.z);
  if (x === null || y === null || z === null) return null;
  const bore = parseNumber(point.bore);
  return bore === null ? { x, y, z } : { x, y, z, bore };
};

const pointDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

const makePointKey = (point, tolerance) => [
  Math.round(point.x / tolerance),
  Math.round(point.y / tolerance),
  Math.round(point.z / tolerance),
].join('|');

const inferRestraint = (component) => {
  const type = String(component?.type || '').toUpperCase();
  const skey = String(component?.attributes?.SKEY || component?.attributes?.['SUPPORT-SKEY'] || '').toUpperCase();
  const item = String(component?.attributes?.['ITEM-CODE'] || component?.attributes?.MATERIAL || '').toUpperCase();

  if (type.includes('ANCHOR') || skey.includes('ANCH') || item.includes('ANCHOR')) return 'ANCHOR';
  if (type === 'SUPPORT' || skey.includes('GUID') || item.includes('GUIDE')) return 'GUIDE';
  return 'FREE';
};

const componentUid = (component, index) => component?.id || component?.uid || `pcf-component-${index + 1}`;

const collectGeometryPoints = (component) => {
  const points = Array.isArray(component?.points) ? component.points.map(normalizePoint).filter(Boolean) : [];
  const centrePoint = normalizePoint(component?.centrePoint);
  const branch1Point = normalizePoint(component?.branch1Point);
  const branch2Point = normalizePoint(component?.branch2Point);
  const branch3Point = normalizePoint(component?.branch3Point);
  const coOrds = normalizePoint(component?.coOrds || component?.coords);

  return { points, centrePoint, branch1Point, branch2Point, branch3Point, coOrds };
};

/**
 * Convert parsed PCF components into the shared canonical geometry model.
 * @param {Array<Record<string, unknown>>} components
 * @param {{ source?: string, unit?: string, tolerance?: number }} options
 * @returns {import('../geometryTypes.js').CanonicalGeometry}
 */
export function pcfToCanonicalGeometry(components, options = {}) {
  const source = options.source || 'pcf';
  const unit = options.unit || DEFAULT_GEOMETRY_UNIT;
  const tolerance = options.tolerance ?? 0.001;
  const diagnostics = [];
  const nodes = [];
  const segments = [];
  const nodeByKey = new Map();
  const supportPoints = [];

  const addDiagnostic = (severity, code, message, data = {}) => {
    diagnostics.push({ severity, code, message, data });
  };

  const addNode = (point, component, index, role = 'endpoint') => {
    const normalized = normalizePoint(point);
    if (!normalized) {
      addDiagnostic('warn', 'PCF_POINT_INVALID', 'Skipped invalid PCF coordinate while building canonical geometry.', { componentId: componentUid(component, index), role, point });
      return null;
    }

    const key = makePointKey(normalized, tolerance);
    const existing = nodeByKey.get(key);
    if (existing) {
      if (existing.restraint === 'FREE') {
        const inferred = inferRestraint(component);
        if (inferred !== 'FREE') existing.restraint = inferred;
      }
      existing.meta = {
        ...(existing.meta || {}),
        sourceRoles: [...(existing.meta?.sourceRoles || []), role],
      };
      return existing.id;
    }

    const id = `N${nodes.length + 1}`;
    const node = {
      id,
      x: normalized.x,
      y: normalized.y,
      z: normalized.z,
      sourceComponentUid: componentUid(component, index),
      restraint: inferRestraint(component),
      meta: {
        bore: normalized.bore,
        sourceType: component?.type || 'UNKNOWN',
        sourceRoles: [role],
      },
    };
    nodes.push(node);
    nodeByKey.set(key, node);
    return id;
  };

  const addSegment = (startPoint, endPoint, component, index, meta = {}) => {
    const startNodeId = addNode(startPoint, component, index, meta.startRole || 'start');
    const endNodeId = addNode(endPoint, component, index, meta.endRole || 'end');
    if (!startNodeId || !endNodeId) return null;

    const start = normalizePoint(startPoint);
    const end = normalizePoint(endPoint);
    const length = pointDistance(start, end);
    const type = component?.type || 'UNKNOWN';
    const sourceComponentUid = componentUid(component, index);
    const segment = {
      id: `S${segments.length + 1}`,
      startNodeId,
      endNodeId,
      type,
      sourceComponentUid,
      length,
      diameter: Number(component?.bore || start?.bore || end?.bore || 0) || undefined,
      material: component?.attributes?.MATERIAL || component?.attributes?.['ITEM-CODE'] || component?.attributes?.['COMPONENT-ATTRIBUTE3'],
      meta: {
        sourceType: type,
        sourceIndex: index,
        ...meta,
      },
    };
    segments.push(segment);
    return segment;
  };

  if (!Array.isArray(components) || components.length === 0) {
    addDiagnostic('warn', 'PCF_COMPONENTS_EMPTY', 'No PCF components supplied for canonical geometry conversion.');
  }

  (components || []).forEach((component, index) => {
    const type = String(component?.type || 'UNKNOWN').toUpperCase();
    const uid = componentUid(component, index);
    const { points, centrePoint, branch1Point, branch2Point, branch3Point, coOrds } = collectGeometryPoints(component);

    if (type === 'SUPPORT') {
      const supportPoint = coOrds || points[0] || centrePoint;
      if (supportPoint) {
        const nodeId = addNode(supportPoint, component, index, 'support');
        if (nodeId) supportPoints.push({ nodeId, sourceComponentUid: uid });
      } else {
        addDiagnostic('warn', 'PCF_SUPPORT_NO_COORDS', 'Support component has no usable coordinate.', { componentId: uid });
      }
      return;
    }

    if ((type === 'ELBOW' || type === 'BEND') && points.length >= 2 && centrePoint) {
      addSegment(points[0], centrePoint, component, index, { segmentRole: 'fitting-leg', parentType: type, startRole: 'end-point-1', endRole: 'centre-point' });
      addSegment(centrePoint, points[1], component, index, { segmentRole: 'fitting-leg', parentType: type, startRole: 'centre-point', endRole: 'end-point-2' });
      return;
    }

    if (type === 'TEE') {
      if (points.length >= 2) {
        addSegment(points[0], points[1], component, index, { segmentRole: 'tee-run', startRole: 'run-start', endRole: 'run-end' });
      }
      [branch1Point, branch2Point, branch3Point].filter(Boolean).forEach((branchPoint, branchIndex) => {
        const teeOrigin = centrePoint || points[0];
        if (teeOrigin) {
          addSegment(teeOrigin, branchPoint, component, index, { segmentRole: `tee-branch-${branchIndex + 1}`, startRole: 'tee-origin', endRole: `branch-${branchIndex + 1}` });
        }
      });
      if (points.length < 2 && !branch1Point && !branch2Point && !branch3Point) {
        addDiagnostic('warn', 'PCF_TEE_INCOMPLETE', 'TEE component has insufficient points for canonical segments.', { componentId: uid });
      }
      return;
    }

    if (points.length >= 2) {
      for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
        addSegment(points[pointIndex], points[pointIndex + 1], component, index, { segmentRole: points.length > 2 ? 'multi-point-chain' : 'component-run', startRole: `point-${pointIndex + 1}`, endRole: `point-${pointIndex + 2}` });
      }
      return;
    }

    if (points.length === 1 || centrePoint || coOrds) {
      addNode(points[0] || centrePoint || coOrds, component, index, 'single-point-component');
      addDiagnostic('info', 'PCF_SINGLE_POINT_COMPONENT', 'Component contributed a node but no segment.', { componentId: uid, type });
      return;
    }

    addDiagnostic('warn', 'PCF_COMPONENT_NO_GEOMETRY', 'Component has no usable geometry points.', { componentId: uid, type });
  });

  const geometry = {
    schemaVersion: CANONICAL_GEOMETRY_SCHEMA_VERSION,
    nodes,
    segments,
    source,
    unit,
    diagnostics,
    summary: {
      componentCount: Array.isArray(components) ? components.length : 0,
      nodeCount: nodes.length,
      segmentCount: segments.length,
      supportPointCount: supportPoints.length,
      tolerance,
    },
  };

  const validation = validateCanonicalGeometry(geometry, { tolerance, requireKnownUnit: false });
  geometry.diagnostics = [...diagnostics, ...validation.diagnostics];
  geometry.summary = {
    ...geometry.summary,
    ...validation.summary,
    supportPointCount: supportPoints.length,
    tolerance,
  };
  geometry.valid = validation.ok;

  return geometry;
}

export const buildCanonicalGeometryFromPcf = pcfToCanonicalGeometry;
