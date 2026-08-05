import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';
import {
  deriveSjsonTypedVisualGeometry,
} from './topology-edit-sjson-visual-authority.js';
import {
  createTopologyVisualGeometryModel,
  createVisualComponent,
  createVisualDiagnostic,
  createVisualPrimitive,
  visualPrimitiveId,
} from './visual-geometry-contract.js';

export const TOPOLOGY_EDIT_SJSON_TEE_PROJECTION =
  'TopologyEditSjsonTwoPortTeeProjection.v1';

/**
 * Promotes source TEE records that are correctly retained by the canonical
 * editor as two-port edges into a three-leg WebGL-only primitive. Direct
 * branch points are preferred; otherwise a bounded source branch-endpoint
 * match supplies direction and the existing run-face length bounds the leg.
 * Canonical topology, IDs, command targets, journal state, and Undo/Redo
 * ownership are unchanged.
 */
export function deriveSjsonFidelityVisualGeometry(input = {}) {
  const canonicalTopology = input.canonicalTopology;
  const dataset = input.dataset;
  const base = deriveSjsonTypedVisualGeometry(input);
  const nodes = new Map(
    (canonicalTopology?.nodes || []).map((node) => [stringValue(node.id), node.position]),
  );
  const entities = new Map(
    (dataset?.entities || []).map((entity) => [stringValue(entity.entityId), entity]),
  );
  const branchDirectionIndex = buildReferencedBranchDirections(
    dataset?.sourceSnapshot?.sourcePackage,
  );
  const replacements = new Map();
  const evidence = Object.fromEntries(
    Object.entries(base.componentEvidence || {}).map(([key, value]) => [key, { ...value }]),
  );
  const promotions = [];

  for (const edge of canonicalTopology?.edges || []) {
    if (canonicalType(edge.entityType) !== 'TEE') continue;
    const entity = entities.get(stringValue(edge.componentKey));
    const sourceEvidence = evidence[edge.componentKey] || evidence[edge.id] || {};
    const attributes = entityAttributes(entity);
    const center = finitePoint(sourceEvidence.center)
      || firstPoint(attributes.POS, attributes.CENTER);
    const canonicalEnds = [
      finitePoint(nodes.get(stringValue(edge.fromNodeId))),
      finitePoint(nodes.get(stringValue(edge.toNodeId))),
    ];
    const directBranchEnd = firstPoint(
      attributes.BPOS,
      attributes.BRANCH_POS,
      attributes.BRANCH_POSITION,
      entity?.properties?.geometry?.branchPoints?.[0],
    );
    const sourceReference = stringValue(
      attributes.REF || attributes.NAME || entity?.sourceEntityId || edge.componentKey,
    );
    const inferredBranch = inferReferencedBranchEnd({
      center,
      runEnds: canonicalEnds,
      candidates: branchCandidatesForTee(
        branchDirectionIndex,
        sourceReference,
        center,
        canonicalEnds,
      ),
    });
    const thirdEnd = directBranchEnd || inferredBranch?.branchEnd || null;
    const branchPlacementAuthority = directBranchEnd
      ? 'SOURCE_BRANCH_POINT'
      : inferredBranch?.matchAuthority === 'REFERENCE'
        ? 'SOURCE_BRANCH_REFERENCE_DIRECTION_WITH_RUN_FACE_LENGTH'
        : inferredBranch?.matchAuthority === 'FACE_RADIUS_MATCH'
          ? 'SOURCE_BRANCH_FACE_RADIUS_MATCH_WITH_RUN_FACE_LENGTH'
          : 'UNRESOLVED';
    const runOutsideDiameterMm = firstPositive(
      sourceEvidence.outsideDiameterMm,
      sourceEvidence.visualOutsideDiameterMm,
      sourceEvidence.boreMm,
      attributes.ABORE,
      attributes.LBORE,
    );
    const branchOutsideDiameterMm = firstPositive(
      sourceEvidence.branchOutsideDiameterMm,
      sourceEvidence.visualBranchOutsideDiameterMm,
      sourceEvidence.branchBoreMm,
      attributes.BRANCH_BORE,
      attributes.CBORE,
      branchNominalSize(attributes.SPRE),
      branchNominalSize(attributes.DTXR),
      runOutsideDiameterMm,
    );
    if (!validPromotion(
      center,
      canonicalEnds,
      thirdEnd,
      runOutsideDiameterMm,
      branchOutsideDiameterMm,
    )) continue;

    const thirdPortNodeId = `visual-node:${semanticHash({
      authority: TOPOLOGY_EDIT_SJSON_TEE_PROJECTION,
      canonicalTopologyHash: canonicalTopology.canonicalTopologyHash,
      edgeId: edge.id,
      thirdEnd,
    }).slice(0, 24)}`;
    const teePorts = classifyTeePorts(center, [
      { nodeId: edge.fromNodeId, point: canonicalEnds[0], source: 'CANONICAL_FROM' },
      { nodeId: edge.toNodeId, point: canonicalEnds[1], source: 'CANONICAL_TO' },
      { nodeId: thirdPortNodeId, point: thirdEnd, source: branchPlacementAuthority },
    ]);
    if (!teePorts) continue;
    const runEnds = teePorts.run.map((port) => port.point);
    const runNodeIds = teePorts.run.map((port) => port.nodeId);
    const branchEnd = teePorts.branch.point;
    const branchNodeId = teePorts.branch.nodeId;
    const promotionPolicyHash = semanticHash({
      authority: TOPOLOGY_EDIT_SJSON_TEE_PROJECTION,
      canonicalTopologyHash: canonicalTopology.canonicalTopologyHash,
      edgeId: edge.id,
      center,
      canonicalEnds,
      thirdEnd,
      runNodeIds,
      branchNodeId,
      runOutsideDiameterMm,
      branchOutsideDiameterMm,
    });
    const oldComponent = base.model.components.find(
      (component) => component.canonicalEntityId === edge.id,
    );
    const sourcePaths = oldComponent?.sourcePaths || [entity?.sourcePath].filter(Boolean);
    const workspaceEntityIds = oldComponent?.workspaceEntityIds
      || [edge.componentKey].filter(Boolean);
    const primitive = createVisualPrimitive({
      primitiveId: visualPrimitiveId(edge.id, 'body', promotionPolicyHash),
      canonicalEntityId: edge.id,
      canonicalType: 'TEE',
      modelRole: base.model.modelRole,
      partRole: 'body',
      kind: 'TEE_JUNCTION',
      sourcePaths,
      workspaceEntityIds,
      parameters: {
        center,
        runNodeIds,
        branchNodeId,
        runEnds,
        branchEnd,
        runDirections: runEnds.map((point) => unitVector(center, point)),
        branchDirection: unitVector(center, branchEnd),
        runOutsideDiameterMm,
        branchOutsideDiameterMm,
        dimensionBasis: 'SOURCE_NOMINAL_BORE_VISUAL_PROXY',
        placementAuthority: branchPlacementAuthority,
        branchReferenceId: inferredBranch?.referenceId || null,
        portRoleAuthority: teePorts.authority,
        branchEndpointDistanceMm: inferredBranch?.endpointDistanceMm ?? null,
        branchFaceLengthMismatchMm: inferredBranch?.faceLengthMismatchMm ?? null,
      },
    });
    const diagnostics = (oldComponent?.diagnostics || [])
      .filter((row) => row.code !== 'VISUAL_COMPONENT_TYPE_UNSUPPORTED');
    diagnostics.push(createVisualDiagnostic({
      code: 'VISUAL_TWO_PORT_TEE_PROMOTED',
      severity: 'WARNING',
      message: 'Source TEE geometry was restored for WebGL display from a deterministic third-port direction, governed connection-face length, and three-port role classification while canonical topology remained a two-port editable edge.',
      canonicalEntityId: edge.id,
      sourceEvidenceIds: sourcePaths,
      details: {
        promotionPolicyHash,
        branchNodeId,
        branchPlacementAuthority,
        branchReferenceId: inferredBranch?.referenceId || null,
        portRoleAuthority: teePorts.authority,
        branchEndpointDistanceMm: inferredBranch?.endpointDistanceMm ?? null,
        branchFaceLengthMismatchMm: inferredBranch?.faceLengthMismatchMm ?? null,
        authorityBoundary: 'VISUAL_ONLY_DO_NOT_MUTATE_TOPOLOGY',
      },
    }));
    replacements.set(edge.id, createVisualComponent({
      canonicalEntityId: edge.id,
      canonicalType: 'TEE',
      sourcePaths,
      workspaceEntityIds,
      primitives: [primitive],
      diagnostics,
    }));
    const promotedEvidence = {
      ...sourceEvidence,
      branchPoint: branchEnd,
      runNodeIds,
      branchNodeId,
      visualTwoPortTeePromoted: true,
      visualBranchPointAuthority: branchPlacementAuthority,
    };
    evidence[edge.componentKey] = promotedEvidence;
    evidence[edge.id] = promotedEvidence;
    promotions.push({
      edgeId: edge.id,
      componentKey: edge.componentKey,
      promotionPolicyHash,
      branchNodeId,
      center,
      branchEnd,
      branchPlacementAuthority,
      portRoleAuthority: teePorts.authority,
      branchReferenceId: inferredBranch?.referenceId || null,
      branchEndpointDistanceMm: inferredBranch?.endpointDistanceMm ?? null,
      branchFaceLengthMismatchMm: inferredBranch?.faceLengthMismatchMm ?? null,
    });
  }

  if (!replacements.size) return base;
  const promotionHash = semanticHash({
    authority: TOPOLOGY_EDIT_SJSON_TEE_PROJECTION,
    canonicalTopologyHash: canonicalTopology.canonicalTopologyHash,
    promotions,
  });
  const components = base.model.components.map((component) => (
    replacements.get(component.canonicalEntityId) || component
  ));
  const model = createTopologyVisualGeometryModel({
    canonicalTopologyHash: canonicalTopology.canonicalTopologyHash,
    geometryPolicyHash: semanticHash({
      baseGeometryPolicyHash: base.model.geometryPolicyHash,
      authority: TOPOLOGY_EDIT_SJSON_TEE_PROJECTION,
      promotionHash,
    }),
    modelRole: base.model.modelRole,
    components,
  });
  const promotedIds = new Set(replacements.keys());
  const promotedPrimitives = [...replacements.values()]
    .flatMap((component) => component.primitives);
  const promotedElements = promotedPrimitives.map((primitive) => ({
    id: primitive.primitiveId,
    entityId: primitive.canonicalEntityId,
    type: primitive.kind,
    x: primitive.parameters.center.x,
    y: primitive.parameters.center.y,
    z: primitive.parameters.center.z,
    pickTarget: {
      objectKind: 'component',
      objectId: primitive.canonicalEntityId,
      sourcePaths: primitive.sourcePaths,
      workspaceEntityIds: primitive.workspaceEntityIds,
      partRole: primitive.partRole,
    },
  }));
  const projection = deepFreeze({
    ...base.projection,
    elements: [
      ...(base.projection.elements || []).filter((row) => (
        row.type === 'node' || !promotedIds.has(row.entityId)
      )),
      ...promotedElements,
    ],
    segments: (base.projection.segments || []).filter(
      (row) => !promotedIds.has(row.entityId),
    ),
    primitives: [
      ...(base.projection.primitives || []).filter(
        (primitive) => !promotedIds.has(primitive.canonicalEntityId),
      ),
      ...promotedPrimitives,
    ].sort(comparePrimitiveIdentity),
  });
  return deepFreeze({
    ...base,
    model,
    projection,
    componentEvidence: deepFreeze(evidence),
    promotionHash,
  });
}

function buildReferencedBranchDirections(sourcePackage) {
  const byReference = new Map();
  const endpoints = [];
  const visit = (value, path = '$') => {
    if (Array.isArray(value)) {
      value.forEach((row, index) => visit(row, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const type = canonicalType(value.type || value.attributes?.TYPE);
    const attributes = value.attributes || {};
    if (type === 'BRANCH') {
      const head = firstPoint(attributes.HPOS);
      const tail = firstPoint(attributes.TPOS);
      if (head && tail && distance(head, tail) > 1e-9) {
        registerBranchDirection(byReference, endpoints, attributes.HREF, {
          point: head,
          direction: unitVector(head, tail),
          referenceId: `${path}:HREF`,
        });
        registerBranchDirection(byReference, endpoints, attributes.TREF, {
          point: tail,
          direction: unitVector(tail, head),
          referenceId: `${path}:TREF`,
        });
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'attributes') continue;
      if (child && typeof child === 'object') visit(child, `${path}.${key}`);
    }
  };
  visit(sourcePackage);
  for (const [key, rows] of byReference) {
    rows.sort((left, right) => left.referenceId.localeCompare(right.referenceId));
    byReference.set(key, deepFreeze(rows));
  }
  endpoints.sort((left, right) => left.referenceId.localeCompare(right.referenceId));
  return deepFreeze({ byReference, endpoints });
}

function registerBranchDirection(byReference, endpoints, reference, candidate) {
  if (!candidate.direction || !candidate.point) return;
  const frozen = deepFreeze(candidate);
  endpoints.push(frozen);
  const key = stringValue(reference);
  if (!key) return;
  const rows = byReference.get(key) || [];
  rows.push(frozen);
  byReference.set(key, rows);
}

function branchCandidatesForTee(index, sourceReference, center, runEnds) {
  if (!center || runEnds.some((point) => !point)) return [];
  const faceLength = Math.min(...runEnds.map((point) => distance(center, point)));
  if (!(faceLength > 1e-9)) return [];
  const exact = (index?.byReference?.get(sourceReference) || []).map((candidate) => ({
    ...candidate,
    matchAuthority: 'REFERENCE',
    matchRank: 0,
    endpointDistanceMm: distance(candidate.point, center),
    faceLengthMismatchMm: Math.abs(distance(candidate.point, center) - faceLength),
  }));
  const coincident = (index?.endpoints || [])
    .map((candidate) => ({
      ...candidate,
      matchAuthority: 'FACE_RADIUS_MATCH',
      matchRank: 1,
      endpointDistanceMm: distance(candidate.point, center),
      faceLengthMismatchMm: Math.abs(distance(candidate.point, center) - faceLength),
    }))
    .filter((candidate) => candidate.faceLengthMismatchMm <= 1);
  const deduplicated = new Map();
  for (const candidate of [...exact, ...coincident]) {
    const current = deduplicated.get(candidate.referenceId);
    if (!current || candidate.matchRank < current.matchRank) {
      deduplicated.set(candidate.referenceId, candidate);
    }
  }
  return [...deduplicated.values()];
}

function inferReferencedBranchEnd({ center, runEnds, candidates }) {
  if (!center || runEnds.some((point) => !point) || !candidates.length) return null;
  const runDirections = runEnds.map((point) => unitVector(center, point)).filter(Boolean);
  const faceLength = Math.min(...runEnds.map((point) => distance(center, point)));
  if (!(faceLength > 1e-9) || runDirections.length !== 2) return null;
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      sameDirectionScore: Math.max(...runDirections.map((run) => dot(run, candidate.direction))),
    }))
    .filter((candidate) => candidate.sameDirectionScore < 0.98)
    .sort((left, right) => (
      left.matchRank - right.matchRank
      || left.faceLengthMismatchMm - right.faceLengthMismatchMm
      || left.endpointDistanceMm - right.endpointDistanceMm
      || left.sameDirectionScore - right.sameDirectionScore
      || left.referenceId.localeCompare(right.referenceId)
    ));
  const selected = ranked[0];
  if (!selected) return null;
  return deepFreeze({
    branchEnd: addScaledPoint(center, selected.direction, faceLength),
    referenceId: selected.referenceId,
    matchAuthority: selected.matchAuthority,
    endpointDistanceMm: selected.endpointDistanceMm,
    faceLengthMismatchMm: selected.faceLengthMismatchMm,
    sameDirectionScore: selected.sameDirectionScore,
  });
}

function classifyTeePorts(center, ports) {
  if (!center || ports.length !== 3 || ports.some((port) => !port.point || !port.nodeId)) {
    return null;
  }
  const normalized = ports.map((port) => ({
    ...port,
    direction: unitVector(center, port.point),
    key: `${stringValue(port.nodeId)}|${pointKey(port.point)}`,
  }));
  if (normalized.some((port) => !port.direction)) return null;
  const pairs = [];
  for (let left = 0; left < normalized.length - 1; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      const first = normalized[left];
      const second = normalized[right];
      pairs.push({
        run: [first, second].sort((a, b) => a.key.localeCompare(b.key)),
        opposition: dot(first.direction, second.direction),
        key: [first.key, second.key].sort().join('|'),
      });
    }
  }
  pairs.sort((left, right) => (
    left.opposition - right.opposition
    || left.key.localeCompare(right.key)
  ));
  const selected = pairs[0];
  if (!selected || selected.opposition > -0.5) return null;
  const runIds = new Set(selected.run.map((port) => port.nodeId));
  const branch = normalized.find((port) => !runIds.has(port.nodeId));
  if (!branch) return null;
  return deepFreeze({
    run: selected.run,
    branch,
    authority: 'MOST_OPPOSED_PORT_PAIR_THEN_LEXICAL_TIE_BREAK',
    runOpposition: selected.opposition,
  });
}

function pointKey(point) {
  return [point.x, point.y, point.z]
    .map((value) => Number(value).toFixed(6))
    .join('|');
}

function addScaledPoint(point, direction, length) {
  return deepFreeze({
    x: point.x + direction.x * length,
    y: point.y + direction.y * length,
    z: point.z + direction.z * length,
  });
}

function dot(left, right) {
  return left && right
    ? (left.x * right.x) + (left.y * right.y) + (left.z * right.z)
    : 1;
}

function validPromotion(center, runEnds, branchEnd, runDiameter, branchDiameter) {
  if (!center || !branchEnd || runEnds.some((point) => !point)) return false;
  if (!(runDiameter > 0) || !(branchDiameter > 0)) return false;
  if (distance(center, branchEnd) <= 1e-9) return false;
  if (runEnds.some((point) => distance(center, point) <= 1e-9)) return false;
  if (distance(runEnds[0], runEnds[1]) <= 1e-9) return false;
  return true;
}

function entityAttributes(entity) {
  return {
    ...(entity?.properties?.sourceAttributes || {}),
    ...(entity?.properties?.attributes || {}),
    ...(entity?.properties?.enrichedAttributes || {}),
    ...(entity?.properties?.nativeParams || {}),
  };
}

function canonicalType(value) {
  const token = stringValue(value).toUpperCase().replace(/[\s/-]+/gu, '_');
  return ({ REDUCING_TEE: 'TEE', TEE_BRANCH: 'TEE' })[token] || token;
}

function branchNominalSize(value) {
  const text = stringValue(value);
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/gu)];
  return matches.length ? firstPositive(matches.at(-1)?.[2]) : null;
}

function firstPoint(...values) {
  for (const value of values) {
    const point = parsePoint(value);
    if (point) return point;
  }
  return null;
}

function parsePoint(value) {
  if (!value) return null;
  if (Array.isArray(value)) return finitePoint({ x: value[0], y: value[1], z: value[2] });
  if (typeof value === 'object') {
    return finitePoint({
      x: value.x ?? value.X,
      y: value.y ?? value.Y,
      z: value.z ?? value.Z,
    });
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

function firstPositive(...values) {
  for (const value of values) {
    const match = stringValue(value).replace(/,/gu, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/iu);
    const number = typeof value === 'number' ? value : Number(match?.[0]);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function unitVector(from, to) {
  const vector = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return length > 1e-12
    ? deepFreeze({ x: vector.x / length, y: vector.y / length, z: vector.z / length })
    : null;
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function comparePrimitiveIdentity(left, right) {
  return stringValue(left?.primitiveId).localeCompare(stringValue(right?.primitiveId));
}
