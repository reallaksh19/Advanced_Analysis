import {
  deepFreeze,
  stringValue,
} from '../../core/shared-piping-model/index.js';
import {
  adaptSjsonVisualToEditDraftProjection,
  deriveEditDraftElbowCurve,
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_AUTHORITY,
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
  TOPOLOGY_EDIT_SJSON_ELBOW_CURVE_AUTHORITY,
} from './topology-edit-sjson-edit-draft-projection.js';

export {
  deriveEditDraftElbowCurve,
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_AUTHORITY,
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
  TOPOLOGY_EDIT_SJSON_ELBOW_CURVE_AUTHORITY,
};

export const TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA =
  'SjsonEditDraftProjection.v2';
export const TOPOLOGY_EDIT_SJSON_GOVERNED_RENDER_AUTHORITY =
  'TOPO_VALIDATOR_EDIT_DRAFT_SINGLE_PACKET_CENTERLINE_NODE_SUPPORT_V2';
export const TOPOLOGY_EDIT_SJSON_TEE_AUTHORITY =
  'TOPO_VALIDATOR_EDIT_DRAFT_EXACT_TEE_CENTER_TO_CONNECTIONS_V1';
export const TOPOLOGY_EDIT_SJSON_OLET_AUTHORITY =
  'TOPO_VALIDATOR_EDIT_DRAFT_EXACT_OLET_CENTER_TO_BRANCH_V1';
export const TOPOLOGY_EDIT_SJSON_POINT_EQUIPMENT_AUTHORITY =
  'TOPO_VALIDATOR_COINCIDENT_PORT_EQUIPMENT_NEIGHBOR_AXIS_V1';

const POINT_EQUIPMENT = Object.freeze({
  FLANGE_DISC: Object.freeze({ kind: 'FLANGE', colorInt: 0xb7b7b7, radiusScale: 1.25, lengthScale: 0.35 }),
  GASKET_DISC: Object.freeze({ kind: 'GASKET', colorInt: 0xe5e7eb, radiusScale: 1.12, lengthScale: 0.12 }),
  VALVE_BODY: Object.freeze({ kind: 'VALVE', colorInt: 0xcc2222, radiusScale: 1.12, lengthScale: 1.2 }),
  INSTRUMENT_MARKER: Object.freeze({ kind: 'INSTRUMENT', colorInt: 0xf59e0b, radiusScale: 0.9, lengthScale: 0.9 }),
});

/**
 * Converts the typed SJSON visual evidence into one render-only Edit Draft packet.
 * Typed primitives remain available as immutable evidence, but active render arrays
 * contain only governed centerlines, typed compact equipment and canonical nodes.
 */
export function adaptSjsonVisualToGovernedEditDraftProjection({
  visualResult,
  dataset,
} = {}) {
  if (!visualResult?.model || !visualResult?.projection) {
    throw new TypeError('Governed SJSON Edit Draft projection requires typed visual authority.');
  }

  const legacyResult = adaptSjsonVisualToEditDraftProjection({ visualResult, dataset });
  const typedProjection = visualResult.projection;
  const typedPrimitives = Array.isArray(typedProjection.primitives)
    ? typedProjection.primitives
    : [];
  const legacySegments = legacyResult.projection.compactSegments || [];
  const legacyByPrimitive = groupSegmentsByPrimitive(legacySegments);
  const compactSegments = [];
  let exactTeeCount = 0;
  let exactTeeSegmentCount = 0;
  let exactOletCount = 0;
  let exactOletSegmentCount = 0;
  let coincidentPortEquipmentCount = 0;

  for (const primitive of typedPrimitives) {
    if (primitive?.kind === 'TEE_JUNCTION') {
      const segments = exactTeeSegments(primitive);
      compactSegments.push(...segments);
      if (segments.length === 3) exactTeeCount += 1;
      exactTeeSegmentCount += segments.length;
      continue;
    }
    if (primitive?.kind === 'OLET_BRANCH') {
      const segments = exactOletSegments(primitive);
      compactSegments.push(...segments);
      if (segments.length === 1) exactOletCount += 1;
      exactOletSegmentCount += segments.length;
      continue;
    }
    const legacy = legacyByPrimitive.get(primitiveKey(primitive)) || [];
    if (legacy.length) {
      compactSegments.push(...legacy);
      continue;
    }
    const pointEquipment = coincidentPortEquipmentSegment(primitive, legacySegments);
    if (pointEquipment) {
      compactSegments.push(pointEquipment);
      coincidentPortEquipmentCount += 1;
    }
  }

  const compactElements = (typedProjection.elements || [])
    .filter((element) => element?.type === 'node')
    .map((element) => deepFreeze({
      ...element,
      renderAuthority: TOPOLOGY_EDIT_SJSON_GOVERNED_RENDER_AUTHORITY,
    }));
  const {
    primitives: evidencePrimitives = [],
    elements: evidenceElements = [],
    segments: evidenceSegments = [],
    ...projectionMetadata
  } = typedProjection;
  const typedEvidenceProjection = deepFreeze({
    primitives: evidencePrimitives,
    elements: evidenceElements,
    segments: evidenceSegments,
  });
  const metrics = deepFreeze({
    ...(legacyResult.editDraftMetrics || {}),
    schema: TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
    renderAuthority: TOPOLOGY_EDIT_SJSON_GOVERNED_RENDER_AUTHORITY,
    compactSegmentCount: compactSegments.length,
    activeRichPrimitiveCount: 0,
    activeLegacyElementCount: 0,
    activeLegacySegmentCount: 0,
    canonicalNodeMarkerCount: compactElements.length,
    exactTeeCount,
    exactTeeSegmentCount,
    exactOletCount,
    exactOletSegmentCount,
    coincidentPortEquipmentCount,
    teeAuthority: TOPOLOGY_EDIT_SJSON_TEE_AUTHORITY,
    oletAuthority: TOPOLOGY_EDIT_SJSON_OLET_AUTHORITY,
    pointEquipmentAuthority: TOPOLOGY_EDIT_SJSON_POINT_EQUIPMENT_AUTHORITY,
  });
  const projection = deepFreeze({
    ...projectionMetadata,
    schema: TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
    renderStyle: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
    renderAuthority: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_AUTHORITY,
    governedRenderAuthority: TOPOLOGY_EDIT_SJSON_GOVERNED_RENDER_AUTHORITY,
    primitives: [],
    elements: [],
    segments: [],
    compactSegments,
    compactElements,
    typedEvidenceProjection,
    editDraftMetrics: metrics,
  });

  return deepFreeze({
    ...legacyResult,
    projection,
    editDraftMetrics: metrics,
  });
}

function exactTeeSegments(primitive) {
  const parameters = primitive?.parameters || {};
  const center = finitePoint(parameters.center);
  const runEnds = finitePointArray(parameters.runEnds);
  const branchEnd = finitePoint(parameters.branchEnd);
  if (!center || runEnds.length !== 2 || !branchEnd) return [];
  const common = primitiveSegmentCommon(primitive, TOPOLOGY_EDIT_SJSON_TEE_AUTHORITY);
  const runDiameterMm = positive(parameters.runOutsideDiameterMm);
  const branchDiameterMm = positive(parameters.branchOutsideDiameterMm);
  return [
    ...runEnds.map((end, index) => segmentRecord(primitive, `tee-run-${index}`, {
      ...common,
      kind: 'TEE_RUN_CENTERLINE',
      connectionRole: index === 0 ? 'RUN_A' : 'RUN_B',
      start: center,
      end,
      sourceOutsideDiameterMm: runDiameterMm,
    })),
    segmentRecord(primitive, 'tee-branch', {
      ...common,
      kind: 'TEE_BRANCH_CENTERLINE',
      connectionRole: 'BRANCH',
      start: center,
      end: branchEnd,
      sourceOutsideDiameterMm: branchDiameterMm,
    }),
  ];
}

function exactOletSegments(primitive) {
  const parameters = primitive?.parameters || {};
  const center = finitePoint(parameters.center);
  const branchEnd = finitePoint(parameters.branchEnd);
  if (!center || !branchEnd) return [];
  return [segmentRecord(primitive, 'olet-branch', {
    ...primitiveSegmentCommon(primitive, TOPOLOGY_EDIT_SJSON_OLET_AUTHORITY),
    kind: 'OLET_BRANCH_CENTERLINE',
    connectionRole: 'BRANCH',
    start: center,
    end: branchEnd,
    sourceOutsideDiameterMm: positive(parameters.branchOutsideDiameterMm),
  })];
}

function coincidentPortEquipmentSegment(primitive, neighborSegments) {
  const policy = POINT_EQUIPMENT[primitive?.kind];
  if (!policy) return null;
  const parameters = primitive?.parameters || {};
  const start = finitePoint(parameters.start);
  const end = finitePoint(parameters.end);
  const center = finitePoint(parameters.center) || start || end;
  const outsideDiameterMm = positive(parameters.outsideDiameterMm);
  if (!center || !(outsideDiameterMm > 0)) return null;
  if (start && end && pointDistance(start, end) > 1e-9) return null;

  const axisEvidence = neighboringAxis(center, neighborSegments, primitive.canonicalEntityId);
  const axis = axisEvidence.axis;
  const lengthMm = Math.max(outsideDiameterMm * policy.lengthScale, 1);
  const half = lengthMm / 2;
  return segmentRecord(primitive, 'coincident-port-equipment', {
    ...primitiveSegmentCommon(primitive, TOPOLOGY_EDIT_SJSON_POINT_EQUIPMENT_AUTHORITY),
    kind: policy.kind,
    colorInt: policy.colorInt,
    start: add(center, scale(axis, -half)),
    end: add(center, scale(axis, half)),
    radiusMm: (outsideDiameterMm / 2) * policy.radiusScale,
    sourceOutsideDiameterMm: outsideDiameterMm,
    sourceCoincidentPorts: true,
    presentationOnlyExtent: true,
    axisInference: axisEvidence.authority,
    sourceCenter: center,
  });
}

function neighboringAxis(center, segments, excludedEntityId) {
  const candidates = [];
  for (const segment of segments || []) {
    if (stringValue(segment?.canonicalEntityId || segment?.entityId) === stringValue(excludedEntityId)) continue;
    const start = finitePoint(segment?.start);
    const end = finitePoint(segment?.end);
    if (!start || !end) continue;
    const length = pointDistance(start, end);
    if (!(length > 1e-9)) continue;
    const startDistance = pointDistance(center, start);
    const endDistance = pointDistance(center, end);
    if (startDistance <= endDistance) {
      candidates.push({
        distance: startDistance,
        id: stringValue(segment.id),
        axis: unit(vector(start, end)),
      });
    } else {
      candidates.push({
        distance: endDistance,
        id: stringValue(segment.id),
        axis: unit(vector(end, start)),
      });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
  const selected = candidates.find((row) => row.axis && Number.isFinite(row.distance));
  return selected
    ? { axis: selected.axis, authority: 'NEAREST_GOVERNED_ROUTE_SEGMENT' }
    : { axis: deepFreeze({ x: 1, y: 0, z: 0 }), authority: 'DETERMINISTIC_WORLD_X_FALLBACK' };
}

function primitiveSegmentCommon(primitive, geometryAuthority) {
  return {
    entityId: primitive.canonicalEntityId,
    type: primitive.kind,
    colorInt: primitive.kind === 'TEE_JUNCTION' ? 0x14b8a6 : 0x0ea5e9,
    pickTarget: primitivePickTarget(primitive),
    renderAuthority: TOPOLOGY_EDIT_SJSON_GOVERNED_RENDER_AUTHORITY,
    geometryAuthority,
  };
}

function segmentRecord(primitive, role, values) {
  return deepFreeze({
    id: `${primitive.primitiveId}:governed-edit-draft:${role}`,
    primitiveId: primitive.primitiveId,
    canonicalEntityId: primitive.canonicalEntityId,
    ...values,
  });
}

function primitivePickTarget(primitive) {
  return deepFreeze({
    modelRole: stringValue(primitive.modelRole).toLowerCase(),
    objectKind: 'component',
    objectId: primitive.canonicalEntityId,
    sourcePaths: [...(primitive.sourcePaths || [])],
    workspaceEntityIds: [...(primitive.workspaceEntityIds || [])],
    partRole: primitive.partRole || 'body',
  });
}

function groupSegmentsByPrimitive(segments) {
  const result = new Map();
  for (const segment of segments || []) {
    const key = primitiveKey(segment);
    const rows = result.get(key) || [];
    rows.push(segment);
    result.set(key, rows);
  }
  return result;
}

function primitiveKey(value) {
  return stringValue(value?.primitiveId || value?.canonicalEntityId || value?.id);
}

function finitePointArray(values) {
  return Array.isArray(values) ? values.map(finitePoint).filter(Boolean) : [];
}

function finitePoint(value) {
  if (!value || ![value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))) {
    return null;
  }
  return deepFreeze({
    x: Number(value.x),
    y: Number(value.y),
    z: Number(value.z),
  });
}

function pointDistance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function vector(from, to) {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

function unit(value) {
  const magnitude = Math.hypot(value.x, value.y, value.z);
  return magnitude > 1e-12
    ? deepFreeze({ x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude })
    : null;
}

function scale(value, multiplier) {
  return { x: value.x * multiplier, y: value.y * multiplier, z: value.z * multiplier };
}

function add(left, right) {
  return deepFreeze({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
