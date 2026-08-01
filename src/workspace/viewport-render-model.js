import { WORKSPACE_DATASET_SCHEMA } from './dataset-adapter.js';
import { freezeDeep } from './dataset-utils.js';
import {
  assertResolvedEngineeringGeometry,
  buildResolvedEngineeringGeometry,
  RESOLVED_ENGINEERING_GEOMETRY_SCHEMA,
} from './resolved-engineering-geometry.js';

export const VIEWPORT_RENDER_MODEL_SCHEMA = 'viewport-render-model/v3';

export function buildViewportRenderModel(source) {
  const resolved = normalizeSource(source);
  
  const physicalPrimitives = [];
  const supportOverlayPrimitives = [];
  const diagnosticPrimitives = [];
  
  let segmentCount = 0;
  let pointCount = 0;

  resolved.items.forEach((item) => {
    if (!item.primitives || !item.primitives.length) return;
    
    item.primitives.forEach((primitive, index) => {
      const isSupport = item.category === 'support' || item.componentKind === 'SUPPORT';
      const isDiagnostic = primitive.kind === 'FALLBACK_MARKER' || primitive.kind === 'marker';
      
      const layer = isDiagnostic ? 'DIAGNOSTIC' : (isSupport ? 'SUPPORT' : 'PHYSICAL');
      
      let primitiveId = `visual:${item.entityId}`;
      if (item.primitives.length > 1) {
        if (primitive.kind === 'TEE_BRANCH') primitiveId += ':branch';
        else if (primitive.kind === 'TEE_LEG') primitiveId += `:leg-${index}`;
        else primitiveId += `:${index}`;
      } else {
        primitiveId += `:${primitive.kind.toLowerCase()}`;
      }
      
      const renderItem = freezeDeep({
        primitiveId,
        objectId: item.entityId,
        entityType: item.entityType,
        category: item.category,
        componentKind: item.componentKind,
        layer,
        resolutionStatus: item.resolutionStatus,
        resolutionReason: item.resolutionReason,
        renderSettings: resolved.webglNavigation,
        kind: primitive.kind,
        primitive,
        start: primitive.start || primitive.axisStart || primitive.path?.[0] || primitive.legs?.[0]?.start || null,
        end: primitive.end || primitive.axisEnd || primitive.path?.at(-1) || primitive.legs?.[0]?.end || null,
        center: primitive.center || midpoint(primitive.start, primitive.end) || null,
      });
      
      if (hasLinearExtent(renderItem)) segmentCount++;
      else pointCount++;
      
      if (layer === 'DIAGNOSTIC') diagnosticPrimitives.push(renderItem);
      else if (layer === 'SUPPORT') supportOverlayPrimitives.push(renderItem);
      else physicalPrimitives.push(renderItem);
    });
  });

  return freezeDeep({
    schema: VIEWPORT_RENDER_MODEL_SCHEMA,
    datasetId: resolved.datasetId,
    sourceSchema: RESOLVED_ENGINEERING_GEOMETRY_SCHEMA,
    coordinateTransform: resolved.coordinateTransform,
    webglNavigation: resolved.webglNavigation,
    physicalPrimitives,
    supportOverlayPrimitives,
    diagnosticPrimitives,
    skippedEntityIds: resolved.skippedEntityIds,
    bounds: resolved.bounds,
    summary: {
      ...resolved.summary,
      segmentCount,
      pointCount,
    },
  });
}

export function assertViewportRenderModel(model) {
  if (!model || model.schema !== VIEWPORT_RENDER_MODEL_SCHEMA) {
    throw new TypeError(`Viewport renderer requires ${VIEWPORT_RENDER_MODEL_SCHEMA}.`);
  }
}

function normalizeSource(source) {
  if (source?.schema === WORKSPACE_DATASET_SCHEMA) return buildResolvedEngineeringGeometry(source);
  assertResolvedEngineeringGeometry(source);
  return source;
}

function hasLinearExtent(item) {
  const p = item.primitive;
  return Boolean(
    (item.start && item.end)
    || (Array.isArray(p.path) && p.path.length > 1)
    || (Array.isArray(p.legs) && p.legs.length > 0),
  );
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return freezeDeep({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  });
}
