import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';

const TOLERANCE = 1e-8;

/**
 * Derive finite tangent arcs and the straight-segment trims required to render
 * command-authored bends as completed geometry rather than sharp corners.
 */
export function deriveTopologyEditAuthoredBendProjection(topologyInput) {
  const topology = assertTopology(topologyInput);
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const edges = new Map(topology.edges.map((edge) => [edge.id, edge]));
  const segments = [];
  const trims = [];
  const diagnostics = [];
  for (const bend of topology.bends ?? []) {
    if (!bend.createdByCommandId) continue;
    try {
      const geometry = bendGeometry(bend, nodes, edges);
      segments.push(geometry.segment);
      trims.push(...geometry.trims);
    } catch (error) {
      diagnostics.push({
        code: 'AUTHORED_BEND_PROJECTION_BLOCKED',
        bendId: bend.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const material = {
    schema: 'TopologyEditAuthoredBendProjection.v3',
    canonicalTopologyHash: topology.canonicalTopologyHash,
    elements: [],
    segments,
    trims,
    diagnostics,
  };
  return deepFreeze({ ...material, projectionHash: semanticHash(material) });
}

/** Apply authored bend trims and arcs to an existing governed visual projection. */
export function applyTopologyEditAuthoredBendProjection(projectionInput, topologyInput) {
  const projection = normalizeProjection(projectionInput);
  const authored = deriveTopologyEditAuthoredBendProjection(topologyInput);
  if (!authored.trims.length && !authored.segments.length) return projectionInput;
  const trimByEdge = new Map(authored.trims.map((trim) => [trim.edgeId, trim]));
  const material = {
    ...projection,
    authoredBendProjectionHash: authored.projectionHash,
    authoredBendArcCount: authored.segments.length,
  };
  if (Array.isArray(projection.segments)) {
    material.segments = applyAuthoredBendsToSegments(
      projection.segments,
      trimByEdge,
      authored.segments,
    );
  }
  if (Array.isArray(projection.compactSegments)) {
    material.compactSegments = applyAuthoredBendsToSegments(
      projection.compactSegments,
      trimByEdge,
      authored.segments,
    );
  }
  return deepFreeze(material);
}

function applyAuthoredBendsToSegments(rows, trimByEdge, authoredSegments) {
  const existingIds = new Set(rows.map((row) => row?.id).filter(Boolean));
  const trimmed = rows.map((segment) => {
    const edgeId = segment.pickTarget?.objectId ?? segment.entityId ?? null;
    const trim = trimByEdge.get(edgeId);
    if (!trim) return segment;
    const next = { ...segment };
    if (trim.endpoint === 'FROM') next.start = trim.tangentPoint;
    else next.end = trim.tangentPoint;
    if (Array.isArray(next.points) && next.points.length >= 2) {
      next.points = next.points.map((point, index) => {
        if (trim.endpoint === 'FROM' && index === 0) return trim.tangentPoint;
        if (trim.endpoint === 'TO' && index === next.points.length - 1) return trim.tangentPoint;
        return point;
      });
    }
    return next;
  });
  return [
    ...trimmed,
    ...authoredSegments.filter((segment) => !existingIds.has(segment.id)),
  ];
}

function bendGeometry(bend, nodes, edges) {
  const corner = exact(nodes, bend.nodeId, 'bend node');
  const armIds = Array.isArray(bend.edgeIds) ? bend.edgeIds : [];
  if (armIds.length !== 2 || new Set(armIds).size !== 2) {
    fail(`bend ${bend.id} requires two distinct arm edges.`, RangeError);
  }
  const arms = armIds.map((id) => exact(edges, id, 'bend arm'));
  const armContexts = arms.map((edge) => {
    if (edge.fromNodeId === corner.id) {
      return { edge, endpoint: 'FROM', otherNode: exact(nodes, edge.toNodeId, 'arm node') };
    }
    if (edge.toNodeId === corner.id) {
      return { edge, endpoint: 'TO', otherNode: exact(nodes, edge.fromNodeId, 'arm node') };
    }
    fail(`edge ${edge.id} is not incident to bend node ${corner.id}.`, RangeError);
  });
  const directions = armContexts.map(({ otherNode }) => (
    unit(subtract(otherNode.position, corner.position))
  ));
  if (directions.some((row) => !row)) fail(`bend ${bend.id} has a zero-length arm.`, RangeError);
  const angleRad = Math.acos(clamp(dot(directions[0], directions[1]), -1, 1));
  if (!(angleRad > TOLERANCE && angleRad < Math.PI - TOLERANCE)) {
    fail(`bend ${bend.id} has an invalid arm angle.`, RangeError);
  }
  const radiusMm = positive(bend.radiusMm);
  if (!radiusMm) fail(`bend ${bend.id} requires a positive radius.`, RangeError);
  const tangentDistance = radiusMm / Math.tan(angleRad / 2);
  const armLengths = armContexts.map(({ otherNode }) => distance(corner.position, otherNode.position));
  if (armLengths.some((length) => length <= tangentDistance + TOLERANCE)) {
    fail(`bend ${bend.id} radius exceeds an available arm tangent.`, RangeError);
  }
  const tangentPoints = directions.map((direction) => add(corner.position, scale(direction, tangentDistance)));
  const bisector = unit(add(directions[0], directions[1]));
  if (!bisector) fail(`bend ${bend.id} bisector is unresolved.`, RangeError);
  const centerDistance = radiusMm / Math.sin(angleRad / 2);
  const center = add(corner.position, scale(bisector, centerDistance));
  const startVector = unit(subtract(tangentPoints[0], center));
  const endVector = unit(subtract(tangentPoints[1], center));
  const normal = unit(cross(startVector, endVector));
  if (!startVector || !endVector || !normal) fail(`bend ${bend.id} arc plane is unresolved.`, RangeError);
  const sweep = Math.acos(clamp(dot(startVector, endVector), -1, 1));
  const count = Math.max(8, Math.ceil((sweep * radiusMm) / 25));
  const points = Array.from({ length: count + 1 }, (_, index) => (
    add(center, scale(rodrigues(startVector, normal, sweep * (index / count)), radiusMm))
  ));
  const startTangent = unit(cross(normal, startVector));
  const endTangent = unit(cross(normal, endVector));
  if (!startTangent || !endTangent) fail(`bend ${bend.id} tangent directions are unresolved.`, RangeError);
  const controlDistance = (4 / 3) * Math.tan(sweep / 4) * radiusMm;
  const outsideDiameterMm = positive(arms[0].outsideDiameterMm)
    ?? positive(arms[0].diameterMm)
    ?? positive(arms[1].outsideDiameterMm)
    ?? positive(arms[1].diameterMm)
    ?? 20;
  return {
    segment: {
      id: `authored-bend:${bend.id}`,
      entityId: bend.id,
      canonicalEntityId: bend.id,
      type: 'ELBOW_ARC',
      kind: 'ELBOW',
      curveKind: 'CUBIC_BEZIER',
      start: points[0],
      end: points.at(-1),
      controlPoint1: add(points[0], scale(startTangent, controlDistance)),
      controlPoint2: add(points.at(-1), scale(endTangent, -controlDistance)),
      curveSegments: count,
      points,
      radiusMm: outsideDiameterMm / 2,
      outsideDiameterMm,
      sourceOutsideDiameterMm: outsideDiameterMm,
      pickTarget: {
        objectKind: 'component',
        objectId: bend.id,
        workspaceEntityIds: [],
        sourcePaths: bend.sourcePaths ?? [],
        partRole: 'authored-elbow-arc',
      },
    },
    trims: armContexts.map((context, index) => ({
      bendId: bend.id,
      edgeId: context.edge.id,
      endpoint: context.endpoint,
      tangentPoint: tangentPoints[index],
    })),
  };
}

function normalizeProjection(value) {
  const standard = value
    && Array.isArray(value.elements)
    && Array.isArray(value.segments);
  const compact = value
    && Array.isArray(value.compactElements)
    && Array.isArray(value.compactSegments);
  if (!standard && !compact) {
    fail('visual projection requires standard or compact element and segment arrays.');
  }
  return value;
}
function assertTopology(value) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail('canonical topology authority is required.');
  }
  return value;
}
function exact(map, id, label) {
  const value = map.get(id);
  if (!value) fail(`${label} ${id} is unavailable.`, RangeError);
  return value;
}
function add(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(value, scalar) { return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar }; }
function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}
function magnitude(value) { return Math.hypot(value.x, value.y, value.z); }
function unit(value) {
  const length = magnitude(value);
  return length > TOLERANCE ? scale(value, 1 / length) : null;
}
function distance(left, right) { return magnitude(subtract(left, right)); }
function rodrigues(value, axis, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    add(scale(value, cosine), scale(cross(axis, value), sine)),
    scale(axis, dot(axis, value) * (1 - cosine)),
  );
}
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditAuthoredBendGeometry: ${message}`);
}
