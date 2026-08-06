import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import { discretiseBend } from './bend-geometry.js';

/**
 * Node seeding for `src/core/centerline-beam-fea/geometry-conditioning.js`.
 *
 * Two passes, run in order by `conditionGeometry`:
 *
 * 1. `seedRequiredAttachmentPoints` — insert a node wherever a support,
 *    restraint or LAFEA attachment-load extraction point falls partway along
 *    a segment. (Branch connections, free ends and equipment nozzles are
 *    already nodes by construction in canonical geometry — a segment's start
 *    and end are always distinct declared nodes — so nothing is inserted for
 *    those; `geometry-conditioning.js` verifies rather than seeds them.)
 * 2. `seedIntermediateNodes` — subdivide every segment so no element exceeds
 *    the declared span or curvature seeding limit.
 *
 * Both passes are idempotent: re-running either on their own output changes
 * nothing (LFEA B-1 test 7).
 */

export const BEND_SEGMENT_TYPES = Object.freeze(['ELBOW', 'BEND']);

export const ATTACHMENT_POINT_KINDS = Object.freeze([
  'ANCHOR',
  'GUIDE',
  'SUPPORT',
  'ATTACHMENT_LOAD_EXTRACTION',
  'EQUIPMENT_NOZZLE',
]);

/**
 * Insert a node at every required attachment point that does not already
 * have one, splitting the referenced segment. Idempotent: a point already
 * satisfied (retained in the node's attachment custody) is skipped without
 * re-resolving the segment it originally targeted, which by a second pass may
 * no longer exist under that id.
 *
 * Exact-coincident points share one topology node and retain one custody row
 * per attachment identity. No geometric tolerance is applied here: points are
 * coincident only when their declared fractions are exactly equal.
 *
 * @param {object} geometry Canonical geometry (nodes + segments).
 * @param {Array<{attachmentPointId:string, segmentId:string, fraction:number, kind:string}>} points
 * @returns {{geometry:object, inserted:Array<object>, diagnostics:Array<object>}}
 */
export function seedRequiredAttachmentPoints(geometry, points) {
  const diagnostics = [];
  const satisfied = new Set(
    geometry.nodes.flatMap(attachmentPointIdsOf),
  );
  const pending = points.filter((point) => {
    if (satisfied.has(point.attachmentPointId)) {
      diagnostics.push(info('ATTACHMENT_POINT_ALREADY_SEEDED', point.attachmentPointId, { segmentId: point.segmentId }));
      return false;
    }
    return true;
  });
  validateAttachmentPoints(pending);

  const bySegment = groupBy(pending, (point) => point.segmentId);
  let nodes = [...geometry.nodes];
  let segments = [...geometry.segments];
  const inserted = [];

  for (const [segmentId, segmentPoints] of bySegment) {
    const segmentIndex = segments.findIndex((segment) => segment.id === segmentId);
    if (segmentIndex === -1) {
      throw new SharedAnalysisContractError(
        `Required attachment point references unknown segment ${segmentId}.`,
        'ATTACHMENT_POINT_SEGMENT_NOT_FOUND',
      );
    }
    const segment = segments[segmentIndex];
    const startNode = requireNode(nodes, segment.startNodeId);
    const endNode = requireNode(nodes, segment.endNodeId);
    const outcome = insertAttachmentPointsOnSegment(segment, startNode, endNode, segmentPoints);
    nodes = [...nodes, ...outcome.newNodes];
    if (outcome.boundaryTags.length > 0) {
      const boundaryById = new Map(outcome.boundaryTags.map((node) => [node.id, node]));
      nodes = nodes.map((node) => boundaryById.get(node.id) ?? node);
    }
    segments = [...segments.slice(0, segmentIndex), ...outcome.newSegments, ...segments.slice(segmentIndex + 1)];
    inserted.push(...outcome.inserted);
    diagnostics.push(...outcome.diagnostics);
  }

  return {
    geometry: { ...geometry, nodes, segments },
    inserted,
    diagnostics,
  };
}

function insertAttachmentPointsOnSegment(segment, startNode, endNode, points) {
  const orderedGroups = groupByExactFraction(points);
  const newNodes = [];
  const newSegments = [];
  const inserted = [];
  const diagnostics = [];
  const boundaryById = new Map();
  const chain = [{ node: startNode, fraction: 0 }];

  orderedGroups.forEach(({ fraction, points: coincidentPoints }, index) => {
    requireCompatibleCoincidentRestraints(coincidentPoints);
    if (!(fraction > 0 && fraction < 1)) {
      const boundary = fraction <= 0 ? startNode : endNode;
      const currentBoundary = boundaryById.get(boundary.id) ?? boundary;
      boundaryById.set(boundary.id, tagNode(currentBoundary, coincidentPoints));
      coincidentPoints.forEach((point) => {
        inserted.push({ attachmentPointId: point.attachmentPointId, nodeId: boundary.id, kind: point.kind, coincidesWithBoundary: true });
        diagnostics.push(info('ATTACHMENT_POINT_AT_SEGMENT_BOUNDARY', point.attachmentPointId, { nodeId: boundary.id }));
      });
      appendCoincidentCustodyDiagnostic(diagnostics, segment.id, boundary.id, fraction, coincidentPoints);
      return;
    }
    const nodeId = `${segment.id}/AP${index + 1}`;
    const position = interpolate(startNode, endNode, fraction);
    const node = tagNode({
      id: nodeId,
      ...position,
      restraint: restraintForCoincidentPoints(coincidentPoints),
      meta: {},
    }, coincidentPoints);
    newNodes.push(node);
    coincidentPoints.forEach((point) => {
      inserted.push({ attachmentPointId: point.attachmentPointId, nodeId, kind: point.kind, coincidesWithBoundary: false });
    });
    appendCoincidentCustodyDiagnostic(diagnostics, segment.id, nodeId, fraction, coincidentPoints);
    chain.push({ node, fraction });
  });
  chain.push({ node: endNode, fraction: 1 });

  for (let index = 1; index < chain.length; index += 1) {
    const from = chain[index - 1];
    const to = chain[index];
    if (from.node.id === to.node.id) continue;
    newSegments.push(subSegment(segment, from.node, to.node, newSegments.length + 1));
  }
  if (newSegments.length === 0) newSegments.push(segment);

  return {
    newNodes,
    newSegments,
    inserted,
    diagnostics,
    boundaryTags: [...boundaryById.values()].sort((left, right) => compareAscii(left.id, right.id)),
  };
}

/**
 * Subdivide every segment so no element exceeds the declared span or
 * curvature seeding limit. `curvatureSeedingLimit` for a bend is derived as
 * `arcLength / bendSeedingSegments.value` per the plan; the governing target
 * is `min(spanSeedingLimit, curvatureSeedingLimit)`.
 *
 * A bend/elbow segment without declared arc geometry (`meta.bendArcCentre`)
 * cannot be curvature-seeded without fabricating a radius, so it is
 * span-limited only, and the model carries a diagnostic saying so rather than
 * a guessed arc.
 *
 * @param {object} geometry Canonical geometry.
 * @param {{value:number, source:string}} spanLimit Declared `spanSeedingLimit`.
 * @param {{value:number, source:string}} bendSegments Declared `bendSeedingSegments`.
 * @param {{value:number, source:string}} bendLengthErrorLimit Declared `bendLengthErrorLimit`.
 * @returns {{geometry:object, inserted:Array<object>, diagnostics:Array<object>}}
 */
export function seedIntermediateNodes(geometry, spanLimit, bendSegments, bendLengthErrorLimit) {
  const nodesById = new Map(geometry.nodes.map((node) => [node.id, node]));
  const nodes = [...geometry.nodes];
  const segments = [];
  const inserted = [];
  const diagnostics = [];

  for (const segment of geometry.segments) {
    if (segment.meta?.spanSeeded || segment.meta?.bendChordOf) {
      segments.push(segment);
      continue;
    }
    const startNode = requireNode(nodesById, segment.startNodeId);
    const endNode = requireNode(nodesById, segment.endNodeId);
    const outcome = seedSegment(segment, startNode, endNode, spanLimit, bendSegments, bendLengthErrorLimit);
    outcome.newNodes.forEach((node) => nodesById.set(node.id, node));
    nodes.push(...outcome.newNodes);
    segments.push(...outcome.newSegments);
    inserted.push(...outcome.inserted);
    diagnostics.push(...outcome.diagnostics);
  }

  return { geometry: { ...geometry, nodes, segments }, inserted, diagnostics };
}

function seedSegment(segment, startNode, endNode, spanLimit, bendSegments, bendLengthErrorLimit) {
  const arc = declaredBendArc(segment);
  if (BEND_SEGMENT_TYPES.includes(segment.type) && arc) {
    return seedBendSegment(segment, startNode, endNode, arc, spanLimit, bendSegments, bendLengthErrorLimit);
  }
  const outcome = seedStraightSegment(segment, startNode, endNode, spanLimit.value);
  const diagnostics = BEND_SEGMENT_TYPES.includes(segment.type)
    ? [...outcome.diagnostics, warning('BEND_ARC_GEOMETRY_NOT_DECLARED', segment.id, { segmentId: segment.id })]
    : outcome.diagnostics;
  return { ...outcome, diagnostics };
}

function seedStraightSegment(segment, startNode, endNode, spanLimitValue) {
  const length = straightLength(startNode, endNode);
  const count = Math.max(1, Math.ceil(length / spanLimitValue));
  if (count === 1) return { newNodes: [], newSegments: [segment], inserted: [], diagnostics: [] };
  const newNodes = [];
  const chain = [startNode];
  for (let index = 1; index < count; index += 1) {
    const fraction = index / count;
    const node = { id: `${segment.id}/N${index}`, ...interpolate(startNode, endNode, fraction), restraint: 'FREE', meta: { spanSeeded: true } };
    newNodes.push(node);
    chain.push(node);
  }
  chain.push(endNode);
  const newSegments = [];
  for (let index = 1; index < chain.length; index += 1) {
    newSegments.push(subSegment(segment, chain[index - 1], chain[index], index, { spanSeeded: true }));
  }
  return {
    newNodes,
    newSegments,
    inserted: newNodes.map((node) => ({ nodeId: node.id, kind: 'SPAN_SEEDED' })),
    diagnostics: [],
  };
}

function seedBendSegment(segment, startNode, endNode, arc, spanLimit, bendSegments, bendLengthErrorLimit) {
  // arcLength is intrinsic to the geometry (radius * sweep angle) and does not
  // depend on how many chords it is split into, so a minimal first call reads
  // it off without guessing a sweep angle up front.
  const probe = discretiseBend(pointOf(startNode), pointOf(endNode), arc.centre, bendSegments.value);
  const curvatureDrivenCount = Math.ceil(probe.arcLength / spanLimit.value);
  const count = Math.max(bendSegments.value, curvatureDrivenCount);
  const discretised = count === bendSegments.value ? probe : discretiseBend(pointOf(startNode), pointOf(endNode), arc.centre, count);
  if (!(discretised.lengthErrorFraction <= bendLengthErrorLimit.value)) {
    throw new SharedAnalysisContractError(
      `Bend ${segment.id} chord length error ${discretised.lengthErrorFraction} exceeds profile.bendLengthErrorLimit ${bendLengthErrorLimit.value}.`,
      'BEND_LENGTH_ERROR_EXCEEDS_LIMIT',
    );
  }
  const chain = [startNode];
  const newNodes = [];
  for (let index = 1; index < discretised.points.length - 1; index += 1) {
    const node = {
      id: `${segment.id}/N${index}`,
      x: discretised.points[index].x,
      y: discretised.points[index].y,
      z: discretised.points[index].z,
      restraint: 'FREE',
      meta: { bendChordOf: segment.id },
    };
    newNodes.push(node);
    chain.push(node);
  }
  chain.push(endNode);
  const newSegments = [];
  for (let index = 1; index < chain.length; index += 1) {
    newSegments.push(subSegment(segment, chain[index - 1], chain[index], index, { bendChordOf: segment.id }));
  }
  return {
    newNodes,
    newSegments,
    inserted: newNodes.map((node) => ({ nodeId: node.id, kind: 'BEND_CHORD' })),
    diagnostics: [info('BEND_DISCRETISED', segment.id, {
      segmentId: segment.id,
      segments: count,
      lengthErrorFraction: discretised.lengthErrorFraction,
    })],
  };
}

function declaredBendArc(segment) {
  const centre = segment.meta?.bendArcCentre;
  if (!centre || typeof centre !== 'object') return null;
  if (![centre.x, centre.y, centre.z].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  return { centre };
}

function subSegment(parent, fromNode, toNode, index, extraMeta = {}) {
  return {
    ...parent,
    id: `${parent.id}/${extraMeta.bendChordOf ? 'B' : 'S'}${index}`,
    startNodeId: fromNode.id,
    endNodeId: toNode.id,
    length: cleanNumber(straightLength(fromNode, toNode)),
    meta: { ...(parent.meta || {}), ...extraMeta, parentSegmentId: parent.id },
  };
}

function interpolate(startNode, endNode, fraction) {
  return {
    x: cleanNumber(startNode.x + (endNode.x - startNode.x) * fraction),
    y: cleanNumber(startNode.y + (endNode.y - startNode.y) * fraction),
    z: cleanNumber(startNode.z + (endNode.z - startNode.z) * fraction),
  };
}

function straightLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function pointOf(node) {
  return { x: node.x, y: node.y, z: node.z };
}

function attachmentPointIdsOf(node) {
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  const ids = Array.isArray(meta.attachmentPoints)
    ? meta.attachmentPoints.map((entry) => entry?.attachmentPointId).filter(Boolean)
    : [];
  if (typeof meta.attachmentPointId === 'string' && meta.attachmentPointId.length > 0) {
    ids.push(meta.attachmentPointId);
  }
  return [...new Set(ids)];
}

function tagNode(node, points) {
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  const custodyById = new Map();
  const existing = Array.isArray(meta.attachmentPoints) ? meta.attachmentPoints : [];
  for (const entry of existing) addCustodyEntry(custodyById, entry, node.id);
  if (typeof meta.attachmentPointId === 'string' && meta.attachmentPointId.length > 0) {
    addCustodyEntry(custodyById, {
      attachmentPointId: meta.attachmentPointId,
      kind: meta.attachmentPointKind,
    }, node.id);
  }
  for (const point of points) addCustodyEntry(custodyById, point, node.id);
  const attachmentPoints = [...custodyById.values()]
    .sort((left, right) => compareAscii(left.attachmentPointId, right.attachmentPointId));
  requireCompatibleCoincidentRestraints(attachmentPoints);
  const primary = attachmentPoints[0];
  return {
    ...node,
    meta: {
      ...meta,
      attachmentPointId: primary.attachmentPointId,
      attachmentPointKind: primary.kind,
      attachmentPoints,
    },
  };
}

function addCustodyEntry(custodyById, entry, nodeId) {
  if (!entry || typeof entry.attachmentPointId !== 'string' || entry.attachmentPointId.length === 0) return;
  const candidate = {
    attachmentPointId: entry.attachmentPointId,
    kind: entry.kind ?? null,
  };
  const current = custodyById.get(candidate.attachmentPointId);
  if (current) {
    if (current.kind !== null && candidate.kind !== null && current.kind !== candidate.kind) {
      throw new SharedAnalysisContractError(
        `Attachment point ${candidate.attachmentPointId} has conflicting custody kinds at node ${nodeId}.`,
        'ATTACHMENT_POINT_CUSTODY_CONFLICT',
      );
    }
    custodyById.set(candidate.attachmentPointId, {
      attachmentPointId: candidate.attachmentPointId,
      kind: current.kind ?? candidate.kind,
    });
    return;
  }
  custodyById.set(candidate.attachmentPointId, candidate);
}

function groupByExactFraction(points) {
  const byFraction = new Map();
  const ordered = [...points].sort((left, right) => (
    left.fraction - right.fraction
    || compareAscii(left.attachmentPointId, right.attachmentPointId)
  ));
  for (const point of ordered) {
    if (!byFraction.has(point.fraction)) byFraction.set(point.fraction, []);
    byFraction.get(point.fraction).push(point);
  }
  return [...byFraction.entries()].map(([fraction, groupedPoints]) => ({
    fraction,
    points: groupedPoints,
  }));
}

function requireCompatibleCoincidentRestraints(points) {
  const behaviors = new Set(points.map(restraintFor));
  if (behaviors.has('ANCHOR') && behaviors.has('GUIDE')) {
    throw new SharedAnalysisContractError(
      `Exact-coincident attachment points ${points.map((point) => point.attachmentPointId).join(', ')} declare incompatible ANCHOR and GUIDE/SUPPORT restraint behavior.`,
      'ATTACHMENT_POINT_RESTRAINT_CONFLICT',
    );
  }
}

function restraintForCoincidentPoints(points) {
  const behaviors = new Set(points.map(restraintFor));
  if (behaviors.has('ANCHOR')) return 'ANCHOR';
  if (behaviors.has('GUIDE')) return 'GUIDE';
  return 'FREE';
}

function appendCoincidentCustodyDiagnostic(diagnostics, segmentId, nodeId, fraction, points) {
  if (points.length < 2) return;
  diagnostics.push(info('ATTACHMENT_POINT_COINCIDENT_CUSTODY', nodeId, {
    segmentId,
    nodeId,
    fraction,
    attachmentPointIds: points.map((point) => point.attachmentPointId),
  }));
}

function restraintFor(point) {
  if (point.kind === 'ANCHOR') return 'ANCHOR';
  if (point.kind === 'GUIDE' || point.kind === 'SUPPORT') return 'GUIDE';
  return 'FREE';
}

function requireNode(nodesOrMap, nodeId) {
  const node = nodesOrMap instanceof Map ? nodesOrMap.get(nodeId) : nodesOrMap.find((item) => item.id === nodeId);
  if (!node) throw new SharedAnalysisContractError(`Node ${nodeId} referenced by a segment does not exist.`, 'NODE_NOT_FOUND');
  return node;
}

function validateAttachmentPoints(points) {
  const byId = new Map();
  for (const point of points) {
    if (!ATTACHMENT_POINT_KINDS.includes(point.kind)) {
      throw new SharedAnalysisContractError(`Attachment point ${point.attachmentPointId} has unsupported kind ${point.kind}.`, 'ATTACHMENT_POINT_KIND_UNSUPPORTED');
    }
    if (!(point.fraction >= 0 && point.fraction <= 1)) {
      throw new SharedAnalysisContractError(`Attachment point ${point.attachmentPointId} fraction must be in [0, 1].`, 'ATTACHMENT_POINT_FRACTION_OUT_OF_RANGE');
    }
    if (byId.has(point.attachmentPointId)) {
      throw new SharedAnalysisContractError(
        `Attachment point identity ${point.attachmentPointId} is declared more than once.`,
        'ATTACHMENT_POINT_ID_DUPLICATE',
      );
    }
    byId.set(point.attachmentPointId, point);
  }
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].sort((a, b) => compareAscii(a[0], b[0]));
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function info(code, scope, data) {
  return { severity: 'info', code, message: `${code} (${scope})`, data };
}

function warning(code, scope, data) {
  return { severity: 'warn', code, message: `${code} (${scope})`, data };
}
