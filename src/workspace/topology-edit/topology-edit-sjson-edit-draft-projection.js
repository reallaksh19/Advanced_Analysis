import {
  deepFreeze,
  stringValue,
} from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE =
  'TOPO_VALIDATOR_EDIT_DRAFT_COMPACT';
export const TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_AUTHORITY =
  'TOPO_VALIDATOR_EDIT_DRAFT_APOS_POS_LPOS_COMPACT_GEOMETRY_V1';
export const TOPOLOGY_EDIT_SJSON_ELBOW_CURVE_AUTHORITY =
  'TOPO_VALIDATOR_EDIT_DRAFT_TANGENT_INTERSECTION_CUBIC_BEZIER_V1';

const COMPONENT_COLORS = Object.freeze({
  PIPE_CYLINDER: 0x64748b,
  ELBOW_ARC: 0x8b5cf6,
  FLANGE_DISC: 0xb7b7b7,
  GASKET_DISC: 0xe5e7eb,
  VALVE_BODY: 0xcc2222,
  INSTRUMENT_MARKER: 0xf59e0b,
  CONICAL_REDUCER: 0xa855f7,
  ECCENTRIC_REDUCER: 0xa855f7,
  TEE_JUNCTION: 0x14b8a6,
  OLET_BRANCH: 0x0ea5e9,
  DIAGNOSTIC_CENTERLINE: 0xef4444,
});

/**
 * Reuses the certified typed visual model for identity/evidence, but replaces
 * its WebGL representation with the same compact source geometry consumed by
 * Topo Validator Edit Draft. Canonical topology and command state are never
 * changed by this adapter.
 */
export function adaptSjsonVisualToEditDraftProjection({ visualResult, dataset } = {}) {
  if (!visualResult?.model || !visualResult?.projection) {
    throw new TypeError('SJSON Edit Draft projection requires typed visual authority.');
  }
  const entities = new Map(
    (dataset?.entities || []).map((entity) => [stringValue(entity.entityId), entity]),
  );
  const compactSegments = [];
  const elbowEvidence = [];
  let omittedMarkerCount = 0;

  for (const primitive of visualResult.projection.primitives || []) {
    const entity = (primitive.workspaceEntityIds || [])
      .map((id) => entities.get(stringValue(id)))
      .find(Boolean);
    const result = compactSegmentsForPrimitive(primitive, entity);
    compactSegments.push(...result.segments);
    if (result.elbowEvidence) elbowEvidence.push(result.elbowEvidence);
    if (result.omittedMarker) omittedMarkerCount += 1;
  }

  const metrics = editDraftMetrics(compactSegments, elbowEvidence, omittedMarkerCount);
  const compactElements = (visualResult.projection.elements || [])
    .filter((element) => element?.type === 'node');
  const projection = deepFreeze({
    ...visualResult.projection,
    renderStyle: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
    renderAuthority: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_AUTHORITY,
    compactSegments,
    compactElements,
    editDraftMetrics: metrics,
  });
  return deepFreeze({
    ...visualResult,
    projection,
    editDraftMetrics: metrics,
  });
}

/** Exact Edit Draft elbow rule: POS is the tangent intersection, not arc centre. */
export function deriveEditDraftElbowCurve({ start, tangentIntersection, end } = {}) {
  const sourceStart = finitePoint(start);
  const tangent = finitePoint(tangentIntersection);
  const sourceEnd = finitePoint(end);
  if (!sourceStart || !tangent || !sourceEnd) return null;

  const startRadial = vector(tangent, sourceStart);
  const endRadial = vector(tangent, sourceEnd);
  const startDistance = length(startRadial);
  const endDistance = length(endRadial);
  if (!(startDistance > 1e-9) || !(endDistance > 1e-9)) return null;
  const startDirection = scale(startRadial, 1 / startDistance);
  const endDirection = scale(endRadial, 1 / endDistance);
  const includedAngleRad = Math.acos(clamp(dot(startDirection, endDirection), -1, 1));
  const sweepAngleRad = Math.PI - includedAngleRad;
  if (!(sweepAngleRad > 1e-6) || !(sweepAngleRad < Math.PI - 1e-6)) return null;

  const radiusMm = Math.min(startDistance, endDistance);
  const arcStart = add(tangent, scale(startDirection, radiusMm));
  const arcEnd = add(tangent, scale(endDirection, radiusMm));
  const alpha = (4 / 3) * Math.tan(sweepAngleRad / 4);
  const controlPoint1 = add(arcStart, scale(startDirection, -alpha * radiusMm));
  const controlPoint2 = add(arcEnd, scale(endDirection, -alpha * radiusMm));
  const startTangent = unit(vector(arcStart, controlPoint1));
  const expectedStartTangent = unit(vector(sourceStart, tangent));
  const endTangent = unit(vector(controlPoint2, arcEnd));
  const expectedEndTangent = unit(vector(tangent, sourceEnd));

  return deepFreeze({
    authority: TOPOLOGY_EDIT_SJSON_ELBOW_CURVE_AUTHORITY,
    sourceStart,
    tangentIntersection: tangent,
    sourceEnd,
    arcStart,
    arcEnd,
    controlPoint1,
    controlPoint2,
    radiusMm,
    includedAngleRad,
    sweepAngleRad,
    startConnectorLengthMm: distance(sourceStart, arcStart),
    endConnectorLengthMm: distance(arcEnd, sourceEnd),
    startTangentError: directionError(startTangent, expectedStartTangent),
    endTangentError: directionError(endTangent, expectedEndTangent),
  });
}

function compactSegmentsForPrimitive(primitive, entity) {
  const parameters = primitive?.parameters || {};
  const pickTarget = primitivePickTarget(primitive);
  const colorInt = COMPONENT_COLORS[primitive.kind] ?? COMPONENT_COLORS.PIPE_CYLINDER;
  const common = {
    entityId: primitive.canonicalEntityId,
    type: primitive.kind,
    colorInt,
    pickTarget,
    renderAuthority: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_AUTHORITY,
  };

  if (primitive.kind === 'ELBOW_ARC') {
    const source = sourceElbowEvidence(entity);
    const curve = source ? deriveEditDraftElbowCurve(source) : null;
    if (!curve) return { segments: fallbackStraightSegment(primitive, common), elbowEvidence: null };
    const radiusMm = outsideRadius(parameters);
    if (!(radiusMm > 0)) return { segments: [], elbowEvidence: curve };
    const segments = [];
    if (curve.startConnectorLengthMm > 1e-7) {
      segments.push(segmentRecord(primitive, 'elbow-entry', {
        ...common,
        kind: 'ELBOW_ENTRY',
        start: curve.sourceStart,
        end: curve.arcStart,
        radiusMm,
      }));
    }
    segments.push(segmentRecord(primitive, 'elbow-curve', {
      ...common,
      kind: 'ELBOW',
      start: curve.arcStart,
      end: curve.arcEnd,
      radiusMm,
      curveKind: 'CUBIC_BEZIER',
      controlPoint1: curve.controlPoint1,
      controlPoint2: curve.controlPoint2,
      tangentIntersection: curve.tangentIntersection,
      curveSegments: Math.max(12, Math.ceil(curve.sweepAngleRad * 12)),
      curveAuthority: curve.authority,
    }));
    if (curve.endConnectorLengthMm > 1e-7) {
      segments.push(segmentRecord(primitive, 'elbow-exit', {
        ...common,
        kind: 'ELBOW_EXIT',
        start: curve.arcEnd,
        end: curve.sourceEnd,
        radiusMm,
      }));
    }
    return {
      segments,
      elbowEvidence: deepFreeze({
        primitiveId: primitive.primitiveId,
        canonicalEntityId: primitive.canonicalEntityId,
        sourcePaths: [...(primitive.sourcePaths || [])],
        ...curve,
      }),
    };
  }

  if (primitive.kind === 'TEE_JUNCTION') {
    const center = finitePoint(parameters.center);
    const runEnds = finitePointArray(parameters.runEnds);
    const branchEnd = finitePoint(parameters.branchEnd);
    if (!center || runEnds.length !== 2 || !branchEnd) return { segments: [], omittedMarker: true };
    const runRadius = positive(parameters.runOutsideDiameterMm) / 2;
    const branchRadius = positive(parameters.branchOutsideDiameterMm) / 2;
    if (!(runRadius > 0) || !(branchRadius > 0)) return { segments: [], omittedMarker: true };
    return {
      segments: [
        ...runEnds.map((end, index) => segmentRecord(primitive, `tee-run-${index}`, {
          ...common,
          kind: 'TEE_COLLAR',
          start: center,
          end: compactEnd(center, end, runRadius * 2.5, 0.35),
          radiusMm: runRadius * 1.12,
        })),
        segmentRecord(primitive, 'tee-branch', {
          ...common,
          kind: 'TEE_COLLAR',
          start: center,
          end: compactEnd(center, branchEnd, branchRadius * 2.5, 0.35),
          radiusMm: branchRadius * 1.12,
        }),
      ],
    };
  }

  if (primitive.kind === 'OLET_BRANCH') {
    const center = finitePoint(parameters.center);
    const branchEnd = finitePoint(parameters.branchEnd);
    const branchRadius = positive(parameters.branchOutsideDiameterMm) / 2;
    if (!center || !branchEnd || !(branchRadius > 0)) return { segments: [], omittedMarker: true };
    return {
      segments: [segmentRecord(primitive, 'olet', {
        ...common,
        kind: 'OLET',
        start: center,
        end: compactEnd(center, branchEnd, branchRadius * 4, 0.4),
        radiusMm: branchRadius * 1.55,
        endRadiusMm: branchRadius,
      })],
    };
  }

  if (primitive.kind === 'JUNCTION_MARKER') {
    return { segments: [], omittedMarker: true };
  }

  const start = finitePoint(parameters.start);
  const end = finitePoint(parameters.end);
  if (!start || !end || distance(start, end) <= 1e-9) {
    return { segments: [], omittedMarker: true };
  }
  const radiusMm = outsideRadius(parameters);
  if (!(radiusMm > 0)) return { segments: [], omittedMarker: true };
  const radiusScale = ({
    FLANGE_DISC: 1.25,
    GASKET_DISC: 1.12,
    VALVE_BODY: 1.12,
    INSTRUMENT_MARKER: 0.9,
  })[primitive.kind] || 1;
  return {
    segments: [segmentRecord(primitive, 'body', {
      ...common,
      kind: compactKind(primitive.kind),
      start,
      end,
      radiusMm: radiusMm * radiusScale,
      endRadiusMm: reducerEndRadius(parameters),
    })],
  };
}

function sourceElbowEvidence(entity) {
  const attributes = entityAttributes(entity);
  const start = firstPoint(attributes.APOS, entity?.properties?.geometry?.start);
  const tangentIntersection = firstPoint(attributes.POS, attributes.CENTER);
  const end = firstPoint(attributes.LPOS, entity?.properties?.geometry?.end);
  return start && tangentIntersection && end ? { start, tangentIntersection, end } : null;
}

function fallbackStraightSegment(primitive, common) {
  const parameters = primitive?.parameters || {};
  const start = finitePoint(parameters.start);
  const end = finitePoint(parameters.end);
  const radiusMm = outsideRadius(parameters);
  return start && end && radiusMm > 0
    ? [segmentRecord(primitive, 'unresolved-elbow-fallback', {
      ...common,
      kind: 'UNRESOLVED_ELBOW_CENTERLINE',
      colorInt: COMPONENT_COLORS.DIAGNOSTIC_CENTERLINE,
      start,
      end,
      radiusMm: Math.min(radiusMm, 2),
    })]
    : [];
}

function editDraftMetrics(compactSegments, elbowEvidence, omittedMarkerCount) {
  const startErrors = elbowEvidence.map((row) => row.startTangentError);
  const endErrors = elbowEvidence.map((row) => row.endTangentError);
  return deepFreeze({
    authority: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_AUTHORITY,
    elbowCurveAuthority: TOPOLOGY_EDIT_SJSON_ELBOW_CURVE_AUTHORITY,
    compactSegmentCount: compactSegments.length,
    compactElbowCount: compactSegments.filter((row) => row.curveKind === 'CUBIC_BEZIER').length,
    sourceTangentElbowCount: elbowEvidence.length,
    maxStartTangentError: startErrors.length ? Math.max(...startErrors) : null,
    maxEndTangentError: endErrors.length ? Math.max(...endErrors) : null,
    omittedSceneRelativeMarkerCount: omittedMarkerCount,
    firstElbow: elbowEvidence[0] || null,
  });
}

function segmentRecord(primitive, role, values) {
  return deepFreeze({
    id: `${primitive.primitiveId}:edit-draft:${role}`,
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

function compactKind(kind) {
  return ({
    PIPE_CYLINDER: 'PIPE',
    FLANGE_DISC: 'FLANGE',
    GASKET_DISC: 'GASKET',
    VALVE_BODY: 'VALVE',
    INSTRUMENT_MARKER: 'INSTRUMENT',
    CONICAL_REDUCER: 'REDUCER',
    ECCENTRIC_REDUCER: 'REDUCER',
    DIAGNOSTIC_CENTERLINE: 'DIAGNOSTIC_CENTERLINE',
  })[kind] || kind;
}

function outsideRadius(parameters) {
  return firstPositive(
    parameters.outsideDiameterMm,
    parameters.startOutsideDiameterMm,
    parameters.runOutsideDiameterMm,
  ) / 2;
}

function reducerEndRadius(parameters) {
  const value = positive(parameters.endOutsideDiameterMm);
  return value ? value / 2 : null;
}

function compactEnd(start, end, maximumLength, fraction) {
  const fullLength = distance(start, end);
  if (!(fullLength > 1e-9)) return end;
  const lengthMm = Math.min(maximumLength, fullLength * fraction);
  return add(start, scale(unit(vector(start, end)), lengthMm));
}

function entityAttributes(entity) {
  return {
    ...(entity?.properties?.sourceAttributes || {}),
    ...(entity?.properties?.attributes || {}),
    ...(entity?.properties?.enrichedAttributes || {}),
    ...(entity?.properties?.nativeParams || {}),
  };
}

function firstPoint(...values) {
  for (const value of values) {
    const result = parsePoint(value);
    if (result) return result;
  }
  return null;
}

function parsePoint(value) {
  if (!value) return null;
  if (Array.isArray(value)) return finitePoint({ x: value[0], y: value[1], z: value[2] });
  if (typeof value === 'object') {
    return finitePoint({ x: value.x ?? value.X, y: value.y ?? value.Y, z: value.z ?? value.Z });
  }
  const numbers = stringValue(value).match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/giu) || [];
  return numbers.length >= 3
    ? finitePoint({ x: numbers[0], y: numbers[1], z: numbers[2] })
    : null;
}

function finitePoint(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? deepFreeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) })
    : null;
}

function finitePointArray(value) {
  return Array.isArray(value) ? value.map(finitePoint).filter(Boolean) : [];
}

function firstPositive(...values) {
  for (const value of values) {
    const result = positive(value);
    if (result) return result;
  }
  return 0;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function vector(from, to) {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

function add(point, direction) {
  return deepFreeze({
    x: point.x + direction.x,
    y: point.y + direction.y,
    z: point.z + direction.z,
  });
}

function scale(value, factor) {
  return deepFreeze({ x: value.x * factor, y: value.y * factor, z: value.z * factor });
}

function length(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function unit(value) {
  const magnitude = length(value);
  return magnitude > 1e-12 ? scale(value, 1 / magnitude) : null;
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function dot(left, right) {
  return (left.x * right.x) + (left.y * right.y) + (left.z * right.z);
}

function directionError(actual, expected) {
  if (!actual || !expected) return Number.POSITIVE_INFINITY;
  return Math.max(0, 1 - clamp(dot(actual, expected), -1, 1));
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
