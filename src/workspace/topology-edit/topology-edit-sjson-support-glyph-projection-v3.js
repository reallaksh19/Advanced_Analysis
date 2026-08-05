import { deepFreeze, stringValue } from '../../core/shared-piping-model/index.js';
import { restraintColor } from './support-restraint-family.js';

export const SJSON_SUPPORT_GLYPH_PLACEMENT_AUTHORITY =
  'HOST_OD_HALF_CONTACT_PLUS_TWO_OD_GLYPH_V2';

/**
 * Projects one stable restraint record into one or two screen glyph arrows.
 * Radial contacts begin at OD/2 plus the governed gap. Arrow length is 2*OD,
 * three times the previous compact presentation, without changing contact truth.
 */
export function projectGovernedSjsonSupportGlyphs({
  overlays,
  supportTopology,
  markerSizeMm,
} = {}) {
  if (!Array.isArray(overlays) || !supportTopology?.edges) {
    throw new TypeError('Governed SJSON support glyph projection requires overlays and topology.');
  }
  const markerSize = positive(markerSizeMm);
  if (markerSize === null) {
    throw new TypeError('Governed SJSON support glyph projection requires markerSizeMm.');
  }
  const edgeIndex = hostEdgeIndex(supportTopology.edges);
  const elements = [];
  const segments = [];
  let directionalArrowCount = 0;
  let bidirectionalRestraintCount = 0;

  for (const overlay of overlays) {
    const origin = finitePoint(overlay.origin);
    if (!origin) continue;
    elements.push(deepFreeze({
      id: overlay.supportId,
      entityId: overlay.supportId,
      type: 'SUPPORT',
      x: origin.x,
      y: origin.y,
      z: origin.z,
      sizeMm: markerSize,
      pickTarget: {
        objectKind: 'support',
        objectId: overlay.supportId,
        supportId: overlay.supportId,
        sourcePaths: [...(overlay.sourcePaths || [])],
      },
    }));

    const host = edgeIndex.get(stringValue(overlay.hostEntityId));
    const outsideDiameterMm = positive(host?.outsideDiameterMm);
    if (outsideDiameterMm === null) continue;
    const glyphLengthMm = outsideDiameterMm * 2;
    for (const restraint of overlay.restraints || []) {
      const arrows = directionalArrows(restraint, glyphLengthMm, outsideDiameterMm);
      if (!arrows.length) continue;
      directionalArrowCount += arrows.length;
      if (arrows.length > 1) bidirectionalRestraintCount += 1;
      const first = arrows[0];
      segments.push(deepFreeze({
        id: `${restraint.restraintId}:direction`,
        entityId: restraint.restraintId,
        type: 'RESTRAINT_DIRECTION',
        start: first.start,
        end: first.end,
        directionalArrows: arrows,
        hostOutsideDiameterMm: outsideDiameterMm,
        contactOffsetMm: outsideDiameterMm / 2,
        glyphLengthMm,
        placementAuthority: SJSON_SUPPORT_GLYPH_PLACEMENT_AUTHORITY,
        colorInt: restraintColor(restraint.family),
        pickTarget: {
          objectKind: 'restraint',
          objectId: restraint.restraintId,
          supportId: overlay.supportId,
          restraintId: restraint.restraintId,
          restraintFamily: restraint.family,
          sourcePaths: [...(restraint.sourcePaths || [])],
        },
      }));
    }
  }

  return deepFreeze({
    elements,
    segments,
    glyphOverlays: [...overlays],
    glyphMetrics: {
      placementAuthority: SJSON_SUPPORT_GLYPH_PLACEMENT_AUTHORITY,
      restraintGlyphCount: segments.length,
      directionalArrowCount,
      bidirectionalRestraintCount,
      markerCount: elements.length,
    },
  });
}

function directionalArrows(restraint, glyphLengthMm, outsideDiameterMm) {
  const direction = unit(restraint?.direction);
  if (!direction) return [];
  const rows = [];
  const positive = finitePoint(restraint.positiveContactPoint);
  const negative = finitePoint(restraint.negativeContactPoint);
  if (positive) {
    rows.push(arrow('POSITIVE', positive, direction, glyphLengthMm, outsideDiameterMm));
  }
  if (negative) {
    rows.push(arrow('NEGATIVE', negative, scale(direction, -1), glyphLengthMm, outsideDiameterMm));
  }
  return rows;
}

function arrow(polarity, start, direction, glyphLengthMm, outsideDiameterMm) {
  return deepFreeze({
    polarity,
    start,
    end: add(start, scale(direction, glyphLengthMm)),
    hostOutsideDiameterMm: outsideDiameterMm,
    glyphLengthMm,
    placementAuthority: SJSON_SUPPORT_GLYPH_PLACEMENT_AUTHORITY,
  });
}

function hostEdgeIndex(edges) {
  const result = new Map();
  for (const edge of edges || []) {
    for (const key of [edge.id, edge.componentKey, edge.sourceComponentKey]) {
      const value = stringValue(key);
      if (value) result.set(value, edge);
    }
  }
  return result;
}

function finitePoint(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? deepFreeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) })
    : null;
}

function unit(value) {
  const point = finitePoint(value);
  if (!point) return null;
  const length = Math.hypot(point.x, point.y, point.z);
  return length > 1e-12 ? scale(point, 1 / length) : null;
}

function add(left, right) {
  return deepFreeze({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
}

function scale(value, factor) {
  return deepFreeze({ x: value.x * factor, y: value.y * factor, z: value.z * factor });
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
