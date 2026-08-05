import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';
import {
  createDimensionAuthority,
  DIMENSION_STATUS,
} from './dimension-authority.js';
import {
  deriveTopologyVisualGeometry,
  projectVisualGeometryToViewport,
} from './topology-edit-render-model.js';
import { finalizeCanonicalTopology } from './topology-edit-canonical-state.js';
import { retainTypedTopologyEditPrimitives } from './topology-edit-typed-viewport-backend.js';
import {
  createTopologyVisualGeometryModel,
  createVisualDiagnostic,
} from './visual-geometry-contract.js';

export const TOPOLOGY_EDIT_SJSON_VISUAL_AUTHORITY =
  'TopologyEditSjsonVisualAuthority.v1';

const BASE_DIMENSION_AUTHORITY = createDimensionAuthority({
  branchInheritance: {
    enabled: true,
    allowedComponentTypes: ['TEE', 'OLET'],
  },
});

const VISUAL_POLICY = Object.freeze({
  chordErrorMm: 1,
  minimumArcSegments: 6,
  maximumArcSegments: 256,
  diagnosticRadiusMm: 2,
  radialSegments: 16,
});

/**
 * Retains exact support placement already certified by the attachment model.
 * The canonical support node remains intact for topology/edit semantics; origin
 * is additional immutable source authority used only by projection consumers.
 */
export function enrichCanonicalSupportsWithExactOrigins(
  canonicalTopology,
  dataset,
  attachmentModel,
) {
  if (!canonicalTopology?.canonicalTopologyHash) {
    throw new TypeError('Canonical topology authority is required.');
  }
  const attachments = new Map(
    [...(attachmentModel?.attachments || [])]
      .sort(byIdentity('attachmentId'))
      .map((row) => [stringValue(row.supportKey), row]),
  );
  const entities = new Map(
    (dataset?.entities || []).map((entity) => [stringValue(entity.entityId), entity]),
  );
  const nodePositions = new Map(
    (canonicalTopology.nodes || []).map((node) => [stringValue(node.id), node.position]),
  );
  const supports = (canonicalTopology.supports || []).map((support) => {
    const attachment = attachments.get(stringValue(support.entityId));
    const entity = entities.get(stringValue(support.entityId));
    const sourceOrigin = supportSourceOrigin(entity);
    const attachmentOrigin = finitePoint(attachment?.projectedPointCanonical);
    const nodeOrigin = finitePoint(nodePositions.get(stringValue(support.nodeId)));
    const origin = attachmentOrigin || sourceOrigin || nodeOrigin;
    const originAuthority = attachmentOrigin
      ? 'ATTACHMENT_PROJECTED_POINT'
      : sourceOrigin
        ? 'SOURCE_SUPPORT_POSITION'
        : nodeOrigin
          ? 'CANONICAL_NODE'
          : 'UNRESOLVED';
    return {
      ...support,
      origin,
      originAuthority,
      attachmentId: stringValue(attachment?.attachmentId) || null,
      attachmentSegmentParameter: finiteNumber(attachment?.segmentParameter),
      attachmentDistanceCanonical: finiteNumber(attachment?.distanceCanonical),
    };
  });
  return finalizeCanonicalTopology({ ...canonicalTopology, supports });
}

/**
 * Creates a non-canonical projection view that prefers exact support origins.
 * It never changes the certified topology object or its journal/hash authority.
 */
export function supportTopologyForExactOrigins(canonicalTopology) {
  return deepFreeze({
    ...canonicalTopology,
    supports: (canonicalTopology?.supports || []).map((support) => ({
      ...support,
      nodeId: support.origin && support.originAuthority !== 'CANONICAL_NODE'
        ? null
        : support.nodeId,
    })),
  });
}

/**
 * Builds deterministic source evidence for WebGL visualisation. Nominal bore
 * may be used as an explicitly labelled visual-only proxy when engineering OD
 * is absent; canonical dimensions are never modified.
 */
export function buildSjsonVisualEvidence(dataset, canonicalTopology) {
  const topologyNodes = new Map(
    (canonicalTopology?.nodes || []).map((node) => [stringValue(node.id), node.position]),
  );
  const junctionByComponent = new Map(
    (canonicalTopology?.junctions || []).map((junction) => [
      stringValue(junction.componentKey),
      junction,
    ]),
  );
  const incidentEdgesByNode = incidentEdges(canonicalTopology?.edges || []);
  const evidence = {};

  for (const entity of dataset?.entities || []) {
    const attributes = entityAttributes(entity);
    const geometry = entity.properties?.geometry || {};
    const boreMm = firstPositive(
      entity.boreMm,
      geometry.boreMm,
      attributes.BORE,
      attributes.ABORE,
      attributes.LBORE,
      attributes.NOMINAL_BORE_MM,
    );
    const wallThicknessMm = firstPositive(
      entity.wallThicknessMm,
      attributes.WALL_THICKNESS,
      attributes.WALL_THICKNESS_MM,
    );
    const startBoreMm = firstPositive(attributes.ABORE, boreMm);
    const endBoreMm = firstPositive(attributes.LBORE, boreMm);
    const branchBoreMm = firstPositive(
      attributes.BRANCH_BORE,
      attributes.CBORE,
      branchNominalSize(attributes.SPRE),
      branchNominalSize(attributes.DTXR),
      boreMm,
    );
    const outsideDiameterMm = firstPositive(
      entity.outsideDiameterMm,
      attributes.OUTSIDE_DIAMETER,
      attributes.OUTSIDE_DIAMETER_MM,
    );
    const explicitCenter = firstPoint(
      attributes.POS,
      attributes.CENTER,
      geometry.explicitCenter ? geometry.center : null,
    );
    const center = explicitCenter || finitePoint(geometry.center);
    const junction = junctionByComponent.get(stringValue(entity.entityId));
    const inferred = junction
      ? inferJunctionVisualRoles(junction, topologyNodes, center, incidentEdgesByNode)
      : null;
    const proxyDimensions = {};
    if (!outsideDiameterMm && boreMm && !(wallThicknessMm > 0)) {
      proxyDimensions.outsideDiameterMm = boreMm;
    }
    if (!firstPositive(attributes.START_OUTSIDE_DIAMETER) && startBoreMm) {
      proxyDimensions.startOutsideDiameterMm = startBoreMm;
    }
    if (!firstPositive(attributes.END_OUTSIDE_DIAMETER) && endBoreMm) {
      proxyDimensions.endOutsideDiameterMm = endBoreMm;
    }
    if (!firstPositive(attributes.BRANCH_OUTSIDE_DIAMETER) && branchBoreMm) {
      proxyDimensions.branchOutsideDiameterMm = branchBoreMm;
    }

    evidence[entity.entityId] = {
      workspaceEntityIds: [entity.entityId],
      sourcePath: entity.sourcePath,
      sourceEvidenceId: entity.sourcePath || entity.entityId,
      outsideDiameterMm,
      boreMm,
      wallThicknessMm,
      center,
      centerlineRadiusMm: firstPositive(
        attributes.CENTERLINE_RADIUS,
        attributes.BEND_RADIUS,
        attributes.RADI,
      ),
      reducerType: attributes.REDUCER_TYPE ?? attributes.reducerType,
      startOutsideDiameterMm: firstPositive(attributes.START_OUTSIDE_DIAMETER),
      endOutsideDiameterMm: firstPositive(attributes.END_OUTSIDE_DIAMETER),
      startDimensions: { boreMm: startBoreMm, wallThicknessMm },
      endDimensions: { boreMm: endBoreMm, wallThicknessMm },
      eccentricOffsetDirection: firstPoint(attributes.ECCENTRIC_OFFSET_DIRECTION),
      branchOutsideDiameterMm: firstPositive(attributes.BRANCH_OUTSIDE_DIAMETER),
      branchBoreMm,
      visualOutsideDiameterMm: proxyDimensions.outsideDiameterMm,
      visualBranchOutsideDiameterMm: proxyDimensions.branchOutsideDiameterMm,
      hostEntityId: attributes.HOST_ENTITY_ID
        ?? attributes.hostEntityId
        ?? inferred?.hostEntityId,
      branchNodeId: attributes.BRANCH_NODE_ID
        ?? attributes.branchNodeId
        ?? inferred?.branchNodeId,
      runNodeIds: Array.isArray(attributes.runNodeIds)
        ? attributes.runNodeIds
        : inferred?.runNodeIds,
      visualProxyDimensions: proxyDimensions,
      visualRolesInferred: Boolean(inferred?.rolesInferred),
      visualHostInferred: Boolean(inferred?.hostInferred),
    };
  }
  return deepFreeze(evidence);
}

export function createSjsonVisualDimensionAuthority() {
  return deepFreeze({
    schema: TOPOLOGY_EDIT_SJSON_VISUAL_AUTHORITY,
    version: semanticHash({
      schema: TOPOLOGY_EDIT_SJSON_VISUAL_AUTHORITY,
      baseVersion: BASE_DIMENSION_AUTHORITY.version,
    }),
    resolveBore: BASE_DIMENSION_AUTHORITY.resolveBore,
    resolveOutsideDiameter(evidence = {}, context = {}) {
      const resolved = BASE_DIMENSION_AUTHORITY.resolveOutsideDiameter(evidence, context);
      if (resolved.status !== DIMENSION_STATUS.MISSING) return resolved;
      return visualProxyResolution(
        resolved,
        firstPositive(evidence.visualOutsideDiameterMm, evidence.boreMm),
        evidence.sourceEvidenceId,
        'VISUAL_NOMINAL_BORE_PROXY',
      );
    },
    resolveBranchOutsideDiameter(evidence = {}, context = {}) {
      const resolved = BASE_DIMENSION_AUTHORITY.resolveBranchOutsideDiameter(
        evidence,
        context,
      );
      if (resolved.status !== DIMENSION_STATUS.MISSING) return resolved;
      return visualProxyResolution(
        resolved,
        firstPositive(
          evidence.visualBranchOutsideDiameterMm,
          evidence.branchBoreMm,
          evidence.boreMm,
        ),
        evidence.sourceEvidenceId,
        'VISUAL_BRANCH_NOMINAL_BORE_PROXY',
      );
    },
  });
}

export function deriveSjsonTypedVisualGeometry({
  canonicalTopology,
  dataset,
  modelRole = 'DRAFT',
} = {}) {
  const componentEvidence = buildSjsonVisualEvidence(dataset, canonicalTopology);
  const baseModel = deriveTopologyVisualGeometry({
    canonicalTopology,
    componentEvidence,
    dimensionAuthority: createSjsonVisualDimensionAuthority(),
    visualPolicy: { ...VISUAL_POLICY, modelRole },
  });
  const model = addVisualAuthorityDiagnostics(baseModel, componentEvidence);
  const projection = retainTypedTopologyEditPrimitives(
    model,
    projectVisualGeometryToViewport(model, canonicalTopology),
  );
  return deepFreeze({ model, projection, componentEvidence });
}

export function visualPrimitiveKindCounts(model) {
  const counts = {};
  for (const primitive of (model?.components || []).flatMap((row) => row.primitives || [])) {
    counts[primitive.kind] = (counts[primitive.kind] || 0) + 1;
  }
  return deepFreeze(counts);
}

export function distinctExactSupportOriginCount(canonicalTopology) {
  return new Set(
    (canonicalTopology?.supports || [])
      .filter((support) => support.origin && support.originAuthority !== 'CANONICAL_NODE')
      .map((support) => pointKey(support.origin)),
  ).size;
}

function addVisualAuthorityDiagnostics(model, componentEvidence) {
  const components = model.components.map((component) => {
    const rows = component.workspaceEntityIds
      .map((id) => componentEvidence[id])
      .filter(Boolean);
    const proxyDimensions = Object.assign({}, ...rows.map((row) => row.visualProxyDimensions || {}));
    const diagnostics = [...component.diagnostics];
    if (Object.keys(proxyDimensions).length) {
      diagnostics.push(createVisualDiagnostic({
        code: 'VISUAL_NOMINAL_BORE_PROXY_USED',
        severity: 'WARNING',
        message: '3D display uses source nominal bore as a visual-only size proxy because certified outside diameter is unavailable.',
        canonicalEntityId: component.canonicalEntityId,
        sourceEvidenceIds: component.sourcePaths,
        details: {
          proxyDimensions,
          authorityBoundary: 'VISUAL_ONLY_DO_NOT_USE_FOR_ENGINEERING',
        },
      }));
    }
    if (rows.some((row) => row.visualRolesInferred)) {
      diagnostics.push(createVisualDiagnostic({
        code: 'VISUAL_JUNCTION_PORT_ROLES_INFERRED',
        severity: 'WARNING',
        message: 'Junction run and branch roles were inferred deterministically for display only.',
        canonicalEntityId: component.canonicalEntityId,
        sourceEvidenceIds: component.sourcePaths,
        details: { authorityBoundary: 'VISUAL_ONLY_DO_NOT_MUTATE_TOPOLOGY' },
      }));
    }
    if (rows.some((row) => row.visualHostInferred)) {
      diagnostics.push(createVisualDiagnostic({
        code: 'VISUAL_OLET_HOST_INFERRED',
        severity: 'WARNING',
        message: 'Olet host identity was inferred from incident canonical edges for display only.',
        canonicalEntityId: component.canonicalEntityId,
        sourceEvidenceIds: component.sourcePaths,
        details: { authorityBoundary: 'VISUAL_ONLY_DO_NOT_MUTATE_TOPOLOGY' },
      }));
    }
    return {
      canonicalEntityId: component.canonicalEntityId,
      canonicalType: component.canonicalType,
      sourcePaths: component.sourcePaths,
      workspaceEntityIds: component.workspaceEntityIds,
      primitives: component.primitives,
      diagnostics,
    };
  });
  return createTopologyVisualGeometryModel({
    canonicalTopologyHash: model.canonicalTopologyHash,
    geometryPolicyHash: semanticHash({
      baseGeometryPolicyHash: model.geometryPolicyHash,
      visualAuthority: TOPOLOGY_EDIT_SJSON_VISUAL_AUTHORITY,
    }),
    modelRole: model.modelRole,
    components,
  });
}

function visualProxyResolution(baseResult, value, sourceEvidenceId, ruleId) {
  const valueMm = firstPositive(value);
  if (!valueMm) return baseResult;
  return deepFreeze({
    status: DIMENSION_STATUS.RESOLVED,
    valueMm,
    authority: ruleId,
    ruleId,
    sourceEvidenceIds: [stringValue(sourceEvidenceId) || `${ruleId}:${valueMm}`],
    diagnostics: [],
  });
}

function supportSourceOrigin(entity) {
  const attributes = entityAttributes(entity);
  return firstPoint(
    attributes.POS,
    attributes.APOS,
    entity?.properties?.geometry?.center,
    entity?.properties?.geometry?.start,
  );
}

function inferJunctionVisualRoles(junction, nodePositions, centerValue, edgesByNode) {
  const center = finitePoint(centerValue)
    || averagePoints((junction.nodeIds || []).map((id) => nodePositions.get(id)).filter(Boolean));
  const rows = (junction.nodeIds || [])
    .map((id) => ({ id: stringValue(id), point: finitePoint(nodePositions.get(id)) }))
    .filter((row) => row.id && row.point && center && distance(row.point, center) > 1e-9)
    .sort(byIdentity('id'));
  if (rows.length < 3) return null;
  const pairs = [];
  for (let left = 0; left < rows.length - 1; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      const a = unitVector(center, rows[left].point);
      const b = unitVector(center, rows[right].point);
      pairs.push({
        left: rows[left],
        right: rows[right],
        opposition: dot(a, b),
        key: `${rows[left].id}|${rows[right].id}`,
      });
    }
  }
  pairs.sort((a, b) => a.opposition - b.opposition || a.key.localeCompare(b.key));
  const run = pairs[0];
  const runIds = new Set([run.left.id, run.right.id]);
  const branch = rows.find((row) => !runIds.has(row.id));
  if (!branch) return null;
  const hostCandidates = [...new Set([
    ...(edgesByNode.get(run.left.id) || []),
    ...(edgesByNode.get(run.right.id) || []),
  ])].sort((a, b) => (
    (firstPositive(b.outsideDiameterMm, b.diameterMm) || 0)
      - (firstPositive(a.outsideDiameterMm, a.diameterMm) || 0)
      || stringValue(a.componentKey || a.id).localeCompare(stringValue(b.componentKey || b.id))
  ));
  return {
    runNodeIds: [run.left.id, run.right.id],
    branchNodeId: branch.id,
    hostEntityId: stringValue(hostCandidates[0]?.componentKey || hostCandidates[0]?.id) || null,
    rolesInferred: true,
    hostInferred: Boolean(hostCandidates.length),
  };
}

function incidentEdges(edges) {
  const result = new Map();
  for (const edge of edges) {
    for (const nodeId of [edge.fromNodeId, edge.toNodeId]) {
      const key = stringValue(nodeId);
      const rows = result.get(key) || [];
      rows.push(edge);
      result.set(key, rows);
    }
  }
  return result;
}

function entityAttributes(entity) {
  return {
    ...(entity?.properties?.sourceAttributes || {}),
    ...(entity?.properties?.attributes || {}),
    ...(entity?.properties?.enrichedAttributes || {}),
    ...(entity?.properties?.nativeParams || {}),
  };
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
    ? Object.freeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) })
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

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function averagePoints(points) {
  if (!points.length) return null;
  return points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    y: sum.y + point.y / points.length,
    z: sum.z + point.z / points.length,
  }), { x: 0, y: 0, z: 0 });
}

function unitVector(from, to) {
  const vector = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return length > 1e-12
    ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
    : null;
}

function dot(left, right) {
  return left && right
    ? (left.x * right.x) + (left.y * right.y) + (left.z * right.z)
    : 1;
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function pointKey(point) {
  return [point.x, point.y, point.z].map((value) => Number(value).toFixed(6)).join('|');
}

function byIdentity(key) {
  return (left, right) => stringValue(left?.[key]).localeCompare(stringValue(right?.[key]));
}
