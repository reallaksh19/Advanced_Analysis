import { WORKSPACE_DATASET_SCHEMA } from './dataset-adapter.js';
import { freezeDeep } from './dataset-utils.js';
import {
  assertResolvedEngineeringGeometry,
  buildResolvedEngineeringGeometry,
  RESOLVED_ENGINEERING_GEOMETRY_SCHEMA,
} from './resolved-engineering-geometry.js';

export const VIEWPORT_RENDER_MODEL_SCHEMA = 'viewport-render-model/v2';

export function buildViewportRenderModel(source) {
  const resolved = normalizeSource(source);
  const items = resolved.items.map(toRenderItem);
  const segmentCount = items.filter((item) => hasLinearExtent(item)).length;
  const pointCount = items.length - segmentCount;

  return freezeDeep({
    schema: VIEWPORT_RENDER_MODEL_SCHEMA,
    datasetId: resolved.datasetId,
    sourceSchema: RESOLVED_ENGINEERING_GEOMETRY_SCHEMA,
    items,
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
  if (!model || model.schema !== VIEWPORT_RENDER_MODEL_SCHEMA || !Array.isArray(model.items)) {
    throw new TypeError(`Viewport renderer requires ${VIEWPORT_RENDER_MODEL_SCHEMA}.`);
  }
}

function normalizeSource(source) {
  if (source?.schema === WORKSPACE_DATASET_SCHEMA) return buildResolvedEngineeringGeometry(source);
  assertResolvedEngineeringGeometry(source);
  return source;
}

function toRenderItem(item) {
  const primitive = item.primitive;
  return freezeDeep({
    entityId: item.entityId,
    entityType: item.entityType,
    category: item.category,
    componentKind: item.componentKind,
    resolutionStatus: item.resolutionStatus,
    resolutionReason: item.resolutionReason,
    kind: primitive.kind,
    primitive,
    start: primitive.start || primitive.axisStart || primitive.path?.[0] || primitive.legs?.[0]?.start || null,
    end: primitive.end || primitive.axisEnd || primitive.path?.at(-1) || primitive.legs?.[0]?.end || null,
    center: primitive.center || midpoint(primitive.start, primitive.end) || null,
    path: primitive.path || null,
    legs: primitive.legs || null,
  });
}

function hasLinearExtent(item) {
  return Boolean(
    (item.start && item.end)
    || (Array.isArray(item.path) && item.path.length > 1)
    || (Array.isArray(item.legs) && item.legs.length > 0),
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
