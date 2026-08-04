import { lengthFactorToM } from '../../core/model-loads/units.js';
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { freezeDeep, stringValue } from '../dataset-utils.js';
import { projectDataValue } from '../project-data/project-data-contract.js';

export const EMPIRICAL_COMPONENT_LOAD_AUTHORITY_AUDIT_SCHEMA =
  'empirical-component-load-authority-audit/v1';

export const EMPIRICAL_COMPONENT_COG_CLASSIFICATION = Object.freeze({
  MIDPOINT_FALLBACK: 'MIDPOINT_FALLBACK_CANDIDATE',
  ON_ROUTE: 'ON_ROUTE_CHAINAGE_CANDIDATE',
  OFF_ROUTE: 'OFF_ROUTE_ECCENTRIC',
  AMBIGUOUS: 'AMBIGUOUS_ROUTE_PROJECTION',
  INVALID: 'INVALID_COG_EVIDENCE',
});

/**
 * Qualifies exact source-backed component CoG and explicit-moment evidence for
 * later empirical-method integration. This audit never changes application
 * chainage, force, reaction, equilibrium or the qualified V2 numerical method.
 */
export function auditEmpiricalComponentLoadAuthority(input) {
  assertInput(input);
  const toleranceMm = Number(projectDataValue(
    input.profile,
    'topology.portMatchToleranceMm',
  ));
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0) {
    fail(
      'EMPIRICAL_COMPONENT_COG_TOLERANCE_INVALID',
      'Approved nonnegative topology.portMatchToleranceMm is required.',
    );
  }

  const entityById = exactEntityIndex(input.dataset.entities);
  const sharedById = exactSharedComponentIndex(input.dataset.sharedModel.components);
  const edgeById = exactEdgeIndex(input.routePartitionModel.edges);
  const routeByEntityId = routeMembership(input.routePartitionModel.routes);
  const componentIds = [...routeByEntityId.keys()]
    .filter((entityId) => isLumpedComponent(entityById.get(entityId)))
    .sort(compareCodeUnits);
  const records = componentIds.map((entityId) => auditComponent({
    entityId,
    entity: entityById.get(entityId),
    shared: sharedById.get(entityId),
    routes: routeByEntityId.get(entityId),
    edgeById,
    toleranceMm,
    datasetLengthUnit: input.dataset.sharedModel.units?.length,
  }));

  const blockers = records.flatMap((record) => record.blockers.map((blocker) => ({
    ...blocker,
    entityId: record.entityId,
    routeId: record.routeId,
  })));
  const draft = {
    schema: EMPIRICAL_COMPONENT_LOAD_AUTHORITY_AUDIT_SCHEMA,
    datasetId: input.dataset.datasetId,
    datasetVersion: input.dataset.version ?? null,
    sourceDatasetHash: input.dataset.sourceSha256 ?? null,
    sharedModelSemanticHash: input.dataset.sharedModel.semanticHash,
    routePartitionModelSemanticHash: semanticHash(input.routePartitionModel),
    projectDataProfileSemanticHash: semanticHash(input.profile),
    toleranceMm,
    status: blockers.length === 0 ? 'READY_FOR_INTEGRATION_DESIGN' : 'BLOCKED',
    records,
    blockers: dedupeRows(blockers),
    summary: {
      componentCount: records.length,
      onRouteCogCount: count(records, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.ON_ROUTE),
      midpointFallbackCount: count(records, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.MIDPOINT_FALLBACK),
      offRouteCogCount: count(records, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.OFF_ROUTE),
      ambiguousCogCount: count(records, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.AMBIGUOUS),
      invalidCogCount: count(records, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.INVALID),
      explicitPositiveMomentCount: records.filter((row) => row.explicitMoment?.magnitudeNm > 0).length,
      integrationEligibleCount: records.filter((row) => row.integrationEligible).length,
      blockedCount: records.filter((row) => !row.integrationEligible).length,
    },
    numericalMethodChanged: false,
  };
  return requireEmpiricalComponentLoadAuthorityAudit({
    ...draft,
    semanticHash: semanticHash(draft),
  });
}

export function requireEmpiricalComponentLoadAuthorityAudit(value) {
  if (!value || typeof value !== 'object') {
    fail('EMPIRICAL_COMPONENT_LOAD_AUTHORITY_INVALID', 'Authority audit must be an object.');
  }
  if (value.schema !== EMPIRICAL_COMPONENT_LOAD_AUTHORITY_AUDIT_SCHEMA) {
    fail('EMPIRICAL_COMPONENT_LOAD_AUTHORITY_SCHEMA_INVALID', 'Unexpected authority-audit schema.');
  }
  if (!Array.isArray(value.records) || !Array.isArray(value.blockers)) {
    fail('EMPIRICAL_COMPONENT_LOAD_AUTHORITY_INVALID', 'Audit records and blockers must be arrays.');
  }
  const ids = value.records.map((row) => row?.entityId);
  if (new Set(ids).size !== ids.length || !isStrictlySorted(ids)) {
    fail('EMPIRICAL_COMPONENT_LOAD_AUTHORITY_ORDER_INVALID', 'Component records must be uniquely code-unit sorted.');
  }
  for (const record of value.records) validateRecord(record);
  const { semanticHash: suppliedHash, ...projection } = value;
  if (suppliedHash !== semanticHash(projection)) {
    fail('EMPIRICAL_COMPONENT_LOAD_AUTHORITY_HASH_MISMATCH', 'Authority-audit semantic hash mismatch.');
  }
  return freezeDeep(value);
}

function auditComponent(context) {
  const blockers = [];
  const routeId = uniqueRouteId(context.routes, blockers);
  const route = routeId === null
    ? null
    : context.routes.find((candidate) => candidate.routeId === routeId);
  const chainage = route?.entityChainages?.find((row) => row.entityId === context.entityId);
  const fallbackChainageMm = finite(chainage?.pointMm);
  if (fallbackChainageMm === null) {
    blockers.push(blocker('EMPIRICAL_COMPONENT_ROUTE_CHAINAGE_MISSING'));
  }
  if (!context.shared) {
    blockers.push(blocker('EMPIRICAL_COMPONENT_LOAD_IDENTITY_MISSING'));
  }

  const cog = context.shared
    ? qualifyCog(context.shared.loadEvidence?.componentCog, context.datasetLengthUnit)
    : null;
  let cogClassification = EMPIRICAL_COMPONENT_COG_CLASSIFICATION.MIDPOINT_FALLBACK;
  let candidateChainageMm = fallbackChainageMm;
  let projection = null;

  if (cog?.status === 'INVALID') {
    cogClassification = EMPIRICAL_COMPONENT_COG_CLASSIFICATION.INVALID;
    candidateChainageMm = null;
    blockers.push(blocker(cog.code));
  } else if (cog?.status === 'QUALIFIED' && route) {
    projection = projectCogToRoute(
      cog.pointMm,
      route,
      context.edgeById,
      context.toleranceMm,
    );
    cogClassification = projection.classification;
    candidateChainageMm = projection.chainageMm;
    if (projection.classification === EMPIRICAL_COMPONENT_COG_CLASSIFICATION.OFF_ROUTE) {
      blockers.push(blocker('EMPIRICAL_COMPONENT_COG_OFF_ROUTE', {
        nearestDistanceMm: projection.nearestDistanceMm,
      }));
    }
    if (projection.classification === EMPIRICAL_COMPONENT_COG_CLASSIFICATION.AMBIGUOUS) {
      blockers.push(blocker('EMPIRICAL_COMPONENT_COG_ROUTE_AMBIGUOUS', {
        candidateChainagesMm: projection.candidates.map((row) => row.chainageMm),
      }));
    }
  }

  const explicitMoment = qualifyExplicitMoment(context.shared?.loadEvidence);
  if (explicitMoment?.status === 'INVALID') {
    blockers.push(blocker(explicitMoment.code));
  } else if (explicitMoment?.magnitudeNm > 0) {
    blockers.push(blocker('EMPIRICAL_COMPONENT_EXPLICIT_MOMENT_UNSUPPORTED', {
      magnitudeNm: explicitMoment.magnitudeNm,
      axis: explicitMoment.axis,
    }));
  }

  const dedupedBlockers = dedupeRows(blockers);
  return freezeDeep({
    entityId: context.entityId,
    sourceEntityId: context.entity?.sourceEntityId ?? null,
    entityType: stringValue(context.entity?.entityType).toUpperCase() || 'UNKNOWN',
    routeId,
    currentMethodPointChainageMm: fallbackChainageMm,
    cogClassification,
    cogEvidence: cog?.status === 'QUALIFIED' ? cog : null,
    projection,
    candidateChainageMm,
    explicitMoment: explicitMoment?.status === 'QUALIFIED' ? explicitMoment : null,
    integrationEligible: dedupedBlockers.length === 0,
    integrationDisposition: dedupedBlockers.length === 0
      ? (cogClassification === EMPIRICAL_COMPONENT_COG_CLASSIFICATION.ON_ROUTE
        ? 'COG_CHAINAGE_CANDIDATE_ONLY'
        : 'CURRENT_METHOD_MIDPOINT_PARITY_ONLY')
      : 'BLOCKED_PENDING_POLICY_OR_EVIDENCE',
    blockers: dedupedBlockers,
  });
}

function qualifyCog(evidence, fallbackUnit) {
  if (!evidence) return null;
  const factorToM = lengthFactorToM(evidence.unit || fallbackUnit);
  if (factorToM === null) {
    return freezeDeep({
      status: 'INVALID',
      code: 'EMPIRICAL_COMPONENT_COG_UNIT_UNSUPPORTED',
    });
  }
  const point = evidence.value;
  const x = finite(point?.x);
  const y = finite(point?.y);
  const z = finite(point?.z);
  if ([x, y, z].some((value) => value === null)) {
    return freezeDeep({
      status: 'INVALID',
      code: 'EMPIRICAL_COMPONENT_COG_INVALID',
    });
  }
  const factorToMm = factorToM * 1000;
  return freezeDeep({
    status: 'QUALIFIED',
    pointMm: { x: x * factorToMm, y: y * factorToMm, z: z * factorToMm },
    sourceUnit: evidence.unit || fallbackUnit,
    sourceKind: evidence.sourceKind || null,
    sourcePath: evidence.sourcePath || null,
    axes: evidence.axes || null,
  });
}

function qualifyExplicitMoment(loadEvidence) {
  const magnitudeEvidence = loadEvidence?.explicitPointMomentNm;
  const axisEvidence = loadEvidence?.momentAxis;
  if (!magnitudeEvidence && !axisEvidence) return null;
  const magnitudeNm = finite(magnitudeEvidence?.value);
  const axis = stringValue(axisEvidence?.value);
  if (magnitudeNm === null || magnitudeNm < 0 || !axis) {
    return freezeDeep({
      status: 'INVALID',
      code: 'EMPIRICAL_COMPONENT_EXPLICIT_MOMENT_INVALID',
    });
  }
  return freezeDeep({
    status: 'QUALIFIED',
    magnitudeNm,
    axis,
    magnitudeEvidence,
    axisEvidence,
  });
}

function projectCogToRoute(pointMm, route, edgeById, toleranceMm) {
  const candidates = [];
  const distances = [];
  for (const row of route.entityChainages || []) {
    const edge = edgeById.get(row.entityId);
    if (!edge || edge.pointComponent || edge.topologyCarrier || !(edge.lengthMm > 0)) continue;
    const projected = projectToSegment(pointMm, edge.startMm, edge.endMm);
    distances.push(projected.distanceMm);
    if (projected.distanceMm > toleranceMm) continue;
    const chainageMm = row.sourceStartChainageMm
      + projected.ratio * (row.sourceEndChainageMm - row.sourceStartChainageMm);
    candidates.push({
      edgeEntityId: edge.entityId,
      distanceMm: projected.distanceMm,
      ratio: projected.ratio,
      chainageMm,
      projectedPointMm: projected.pointMm,
    });
  }
  candidates.sort((left, right) => (
    left.chainageMm - right.chainageMm
      || compareCodeUnits(left.edgeEntityId, right.edgeEntityId)
  ));
  if (candidates.length === 0) {
    return freezeDeep({
      classification: EMPIRICAL_COMPONENT_COG_CLASSIFICATION.OFF_ROUTE,
      chainageMm: null,
      nearestDistanceMm: distances.length ? Math.min(...distances) : null,
      candidates: [],
    });
  }
  const chainages = candidates.map((row) => row.chainageMm);
  const spread = Math.max(...chainages) - Math.min(...chainages);
  const scale = Math.max(1, ...chainages.map(Math.abs));
  if (spread > Math.max(toleranceMm, scale * 1e-9)) {
    return freezeDeep({
      classification: EMPIRICAL_COMPONENT_COG_CLASSIFICATION.AMBIGUOUS,
      chainageMm: null,
      nearestDistanceMm: Math.min(...candidates.map((row) => row.distanceMm)),
      candidates,
    });
  }
  return freezeDeep({
    classification: EMPIRICAL_COMPONENT_COG_CLASSIFICATION.ON_ROUTE,
    chainageMm: sum(chainages) / chainages.length,
    nearestDistanceMm: Math.min(...candidates.map((row) => row.distanceMm)),
    candidates,
  });
}

function projectToSegment(point, start, end) {
  const ax = end.x - start.x;
  const ay = end.y - start.y;
  const az = end.z - start.z;
  const denominator = ax ** 2 + ay ** 2 + az ** 2;
  if (!(denominator > 0)) {
    return { ratio: 0, distanceMm: Number.POSITIVE_INFINITY, pointMm: start };
  }
  const raw = (
    (point.x - start.x) * ax
      + (point.y - start.y) * ay
      + (point.z - start.z) * az
  ) / denominator;
  const ratio = Math.max(0, Math.min(1, raw));
  const projectedPointMm = {
    x: start.x + ratio * ax,
    y: start.y + ratio * ay,
    z: start.z + ratio * az,
  };
  return {
    ratio,
    distanceMm: Math.hypot(
      point.x - projectedPointMm.x,
      point.y - projectedPointMm.y,
      point.z - projectedPointMm.z,
    ),
    pointMm: projectedPointMm,
  };
}

function uniqueRouteId(routes, blockers) {
  const routeIds = [...new Set((routes || []).map((route) => route.routeId))]
    .sort(compareCodeUnits);
  if (routeIds.length === 1) return routeIds[0];
  blockers.push(blocker(
    routeIds.length === 0
      ? 'EMPIRICAL_COMPONENT_ROUTE_MISSING'
      : 'EMPIRICAL_COMPONENT_ROUTE_AMBIGUOUS',
    { routeIds },
  ));
  return null;
}

function routeMembership(routes) {
  const result = new Map();
  for (const route of routes || []) {
    for (const entityId of route.physicalEdgeIds || []) {
      const rows = result.get(entityId) || [];
      rows.push(route);
      result.set(entityId, rows);
    }
  }
  return result;
}

function exactEntityIndex(entities) {
  const result = new Map();
  for (const entity of entities || []) {
    const entityId = stringValue(entity?.entityId);
    if (!entityId || result.has(entityId)) {
      fail('EMPIRICAL_COMPONENT_ENTITY_IDENTITY_INVALID', 'Dataset entity IDs must be unique and non-empty.');
    }
    result.set(entityId, entity);
  }
  return result;
}

function exactSharedComponentIndex(components) {
  const result = new Map();
  for (const component of components || []) {
    const componentKey = stringValue(component?.componentKey);
    if (!componentKey || result.has(componentKey)) {
      fail('EMPIRICAL_COMPONENT_SHARED_IDENTITY_INVALID', 'Shared component IDs must be unique and non-empty.');
    }
    result.set(componentKey, component);
  }
  return result;
}

function exactEdgeIndex(edges) {
  const result = new Map();
  for (const edge of edges || []) {
    const entityId = stringValue(edge?.entityId);
    if (!entityId || result.has(entityId)) {
      fail('EMPIRICAL_COMPONENT_ROUTE_EDGE_IDENTITY_INVALID', 'Route edge IDs must be unique and non-empty.');
    }
    result.set(entityId, edge);
  }
  return result;
}

function isLumpedComponent(entity) {
  if (!entity || entity.category === 'support') return false;
  return stringValue(entity.entityType).toUpperCase() !== 'PIPE';
}

function validateRecord(record) {
  if (!record || typeof record !== 'object'
    || !stringValue(record.entityId)
    || !Object.values(EMPIRICAL_COMPONENT_COG_CLASSIFICATION).includes(record.cogClassification)
    || !Array.isArray(record.blockers)
    || typeof record.integrationEligible !== 'boolean'
    || typeof record.integrationDisposition !== 'string') {
    fail('EMPIRICAL_COMPONENT_LOAD_AUTHORITY_RECORD_INVALID', 'Authority-audit record is invalid.');
  }
  if (record.integrationEligible !== (record.blockers.length === 0)) {
    fail('EMPIRICAL_COMPONENT_LOAD_AUTHORITY_RECORD_INVALID', 'Integration eligibility disagrees with blockers.');
  }
}

function assertInput(input) {
  if (!input?.dataset || !Array.isArray(input.dataset.entities)
    || !input.dataset.sharedModel || !Array.isArray(input.dataset.sharedModel.components)) {
    fail('EMPIRICAL_COMPONENT_LOAD_DATASET_INVALID', 'Dataset with shared-model components is required.');
  }
  if (!input.routePartitionModel || !Array.isArray(input.routePartitionModel.routes)
    || !Array.isArray(input.routePartitionModel.edges)) {
    fail('EMPIRICAL_COMPONENT_LOAD_ROUTE_MODEL_INVALID', 'Route-partition model is required.');
  }
  if (!input.profile || typeof input.profile !== 'object') {
    fail('EMPIRICAL_COMPONENT_LOAD_PROFILE_INVALID', 'Project Data profile is required.');
  }
}

function count(records, classification) {
  return records.filter((row) => row.cogClassification === classification).length;
}

function blocker(code, details = null) {
  return details === null ? { code } : { code, ...details };
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = semanticHash(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function isStrictlySorted(values) {
  for (let index = 1; index < values.length; index += 1) {
    if (compareCodeUnits(values[index - 1], values[index]) >= 0) return false;
  }
  return true;
}

function compareCodeUnits(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}
