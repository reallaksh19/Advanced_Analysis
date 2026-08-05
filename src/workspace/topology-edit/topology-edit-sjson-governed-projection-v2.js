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

/**
 * Converts the typed SJSON visual evidence into one render-only Edit Draft packet.
 * Typed primitives remain available as immutable evidence, but active render arrays
 * contain only governed centerlines and canonical node descriptors.
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
  const legacyByPrimitive = groupSegmentsByPrimitive(
    legacyResult.projection.compactSegments || [],
  );
  const compactSegments = [];
  let exactTeeCount = 0;
  let exactTeeSegmentCount = 0;
  let exactOletCount = 0;
  let exactOletSegmentCount = 0;

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
    compactSegments.push(...(legacyByPrimitive.get(primitiveKey(primitive)) || []));
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
    teeAuthority: TOPOLOGY_EDIT_SJSON_TEE_AUTHORITY,
    oletAuthority: TOPOLOGY_EDIT_SJSON_OLET_AUTHORITY,
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

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
