import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { freezeDeep, stringValue } from '../dataset-utils.js';
import { projectDataValue } from '../project-data/project-data-contract.js';
import {
  requireEmpiricalComponentLoadAuthorityAudit,
} from './empirical-component-load-authority.js';

export const EMPIRICAL_COMPONENT_MOMENT_DEMAND_SCHEMA =
  'empirical-component-moment-demand/v1';

export const EMPIRICAL_COMPONENT_MOMENT_DISPOSITION =
  'SEPARATE_SUPPORT_CIVIL_DEMAND_NOT_DISTRIBUTED';

const RECORD_KEYS = Object.freeze([
  'demandId', 'demandKind', 'entityId', 'sourceEntityId', 'routeId',
  'loadCaseId', 'applicationChainageMm', 'axis', 'axisBasis', 'magnitudeNm',
  'vectorNm', 'offsetMm', 'componentMassKg', 'gravityForceN',
  'sourceEvidenceSemanticHash', 'disposition', 'verticalReactionDistribution',
]);

/**
 * Captures source point moments and CoG eccentric gravity couples as separate
 * downstream support/civil demands. This function never changes or distributes
 * vertical piping reactions.
 */
export function captureEmpiricalComponentMomentDemand(input) {
  assertInput(input);
  const authorityAudit = requireEmpiricalComponentLoadAuthorityAudit(
    input.authorityAudit,
  );
  verifyAuthorityBindings(input, authorityAudit);

  const entityById = new Map(
    input.dataset.entities.map((entity) => [entity.entityId, entity]),
  );
  const routeById = new Map(
    input.routePartitionModel.routes.map((route) => [route.routeId, route]),
  );
  const edgeById = new Map(
    input.routePartitionModel.edges.map((edge) => [edge.entityId, edge]),
  );
  const toleranceMm = nonnegative(
    projectDataValue(input.profile, 'topology.portMatchToleranceMm'),
  );
  const gravityMPerS2 = positive(
    projectDataValue(input.profile, 'loadCalculation.gravityMPerS2'),
  );
  const loadFactor = positive(
    projectDataValue(input.profile, 'loadCalculation.loadFactor'),
  );
  const loadCaseIds = uniqueSortedStrings(
    projectDataValue(input.profile, 'loadCalculation.activeLoadCases') || [],
  );
  const globalBlockers = [];
  if (toleranceMm === null) globalBlockers.push(blocker('EMPIRICAL_MOMENT_TOLERANCE_INVALID'));
  if (gravityMPerS2 === null) globalBlockers.push(blocker('EMPIRICAL_MOMENT_GRAVITY_INVALID'));
  if (loadFactor === null) globalBlockers.push(blocker('EMPIRICAL_MOMENT_LOAD_FACTOR_INVALID'));
  if (loadCaseIds.length === 0) globalBlockers.push(blocker('EMPIRICAL_MOMENT_LOAD_CASES_MISSING'));

  const records = [];
  const blockers = [...globalBlockers];
  let zeroEccentricityCount = 0;

  for (const authorityRecord of authorityAudit.records) {
    const entity = entityById.get(authorityRecord.entityId);
    if (!entity) {
      blockers.push(blocker('EMPIRICAL_MOMENT_ENTITY_MISSING', {
        entityId: authorityRecord.entityId,
      }));
      continue;
    }

    const explicit = sourceExplicitMomentRecord(authorityRecord);
    if (explicit.record) records.push(explicit.record);
    if (explicit.blocker) blockers.push(explicit.blocker);

    if (!authorityRecord.cogEvidence) continue;
    const route = routeById.get(authorityRecord.routeId);
    if (!route) {
      blockers.push(blocker('EMPIRICAL_MOMENT_ROUTE_MISSING', {
        entityId: authorityRecord.entityId,
        routeId: authorityRecord.routeId,
      }));
      continue;
    }
    if (globalBlockers.length > 0) continue;

    const projection = nearestUnambiguousProjection(
      authorityRecord.cogEvidence.pointMm,
      route,
      edgeById,
      toleranceMm,
    );
    if (!projection.qualified) {
      blockers.push(blocker(projection.code, {
        entityId: authorityRecord.entityId,
        routeId: authorityRecord.routeId,
        candidateChainagesMm: projection.candidateChainagesMm || [],
      }));
      continue;
    }

    const mass = resolveComponentMass(entity, input.profile);
    if (!mass.qualified) {
      blockers.push(blocker(mass.code, {
        entityId: authorityRecord.entityId,
        catalogKey: mass.catalogKey,
      }));
      continue;
    }

    const offsetMm = subtract(
      authorityRecord.cogEvidence.pointMm,
      projection.projectedPointMm,
    );
    const gravityForceN = mass.massKg * gravityMPerS2 * loadFactor;
    const vectorNm = cross(
      scale(offsetMm, 0.001),
      { x: 0, y: 0, z: -gravityForceN },
    );
    const magnitudeNm = magnitude(vectorNm);
    if (magnitudeNm <= 1e-12) {
      zeroEccentricityCount += 1;
      continue;
    }

    for (const loadCaseId of loadCaseIds) {
      records.push(freezeDeep({
        demandId: `COG_GRAVITY:${loadCaseId}:${authorityRecord.entityId}`,
        demandKind: 'COG_ECCENTRIC_GRAVITY_COUPLE',
        entityId: authorityRecord.entityId,
        sourceEntityId: authorityRecord.sourceEntityId,
        routeId: authorityRecord.routeId,
        loadCaseId,
        applicationChainageMm: projection.chainageMm,
        axis: null,
        axisBasis: 'GLOBAL_XYZ_Z_UP',
        magnitudeNm,
        vectorNm,
        offsetMm,
        componentMassKg: mass.massKg,
        gravityForceN,
        sourceEvidenceSemanticHash: semanticHash({
          cogEvidence: authorityRecord.cogEvidence,
          catalogKey: mass.catalogKey,
          massKg: mass.massKg,
          gravityMPerS2,
          loadFactor,
          projectDataProfileSemanticHash: semanticHash(input.profile),
        }),
        disposition: EMPIRICAL_COMPONENT_MOMENT_DISPOSITION,
        verticalReactionDistribution: 'NOT_PERFORMED',
      }));
    }
  }

  records.sort((left, right) => compareCodeUnits(left.demandId, right.demandId));
  const dedupedBlockers = dedupeRows(blockers);
  const draft = {
    schema: EMPIRICAL_COMPONENT_MOMENT_DEMAND_SCHEMA,
    datasetId: input.dataset.datasetId,
    datasetVersion: input.dataset.version ?? null,
    sourceDatasetHash: input.dataset.sourceSha256 ?? null,
    componentLoadAuthorityAuditSemanticHash: authorityAudit.semanticHash,
    routePartitionModelSemanticHash: semanticHash(input.routePartitionModel),
    projectDataProfileSemanticHash: semanticHash(input.profile),
    sourceAxisBasis: 'Z_UP',
    status: dedupedBlockers.length > 0
      ? 'BLOCKED'
      : (records.length > 0 ? 'CAPTURED' : 'NO_MOMENT_DEMAND'),
    records,
    blockers: dedupedBlockers,
    summary: {
      demandCount: records.length,
      sourceExplicitMomentCount: records.filter(
        (row) => row.demandKind === 'SOURCE_EXPLICIT_POINT_MOMENT',
      ).length,
      eccentricGravityCoupleCount: records.filter(
        (row) => row.demandKind === 'COG_ECCENTRIC_GRAVITY_COUPLE',
      ).length,
      zeroEccentricityCount,
      blockedCount: dedupedBlockers.length,
    },
    numericalVerticalReactionMethodChanged: false,
    verticalReactionDistributionPerformed: false,
  };
  return requireEmpiricalComponentMomentDemand({
    ...draft,
    semanticHash: semanticHash(draft),
  });
}

export function requireEmpiricalComponentMomentDemand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('EMPIRICAL_COMPONENT_MOMENT_DEMAND_INVALID', 'Moment demand must be an object.');
  }
  if (value.schema !== EMPIRICAL_COMPONENT_MOMENT_DEMAND_SCHEMA) {
    fail('EMPIRICAL_COMPONENT_MOMENT_DEMAND_SCHEMA_INVALID', 'Unexpected moment-demand schema.');
  }
  if (!Array.isArray(value.records) || !Array.isArray(value.blockers)) {
    fail('EMPIRICAL_COMPONENT_MOMENT_DEMAND_INVALID', 'Moment records and blockers must be arrays.');
  }
  const ids = value.records.map((row) => row?.demandId);
  if (new Set(ids).size !== ids.length || !isStrictlySorted(ids)) {
    fail('EMPIRICAL_COMPONENT_MOMENT_DEMAND_ORDER_INVALID', 'Moment demand IDs must be unique and sorted.');
  }
  value.records.forEach(validateRecord);
  if (value.numericalVerticalReactionMethodChanged !== false
      || value.verticalReactionDistributionPerformed !== false) {
    fail('EMPIRICAL_COMPONENT_MOMENT_REACTION_BOUNDARY_INVALID', 'Moment demand must not alter vertical reactions.');
  }
  const { semanticHash: suppliedHash, ...projection } = value;
  if (suppliedHash !== semanticHash(projection)) {
    fail('EMPIRICAL_COMPONENT_MOMENT_DEMAND_HASH_MISMATCH', 'Moment-demand semantic hash mismatch.');
  }
  return freezeDeep(value);
}

function sourceExplicitMomentRecord(authorityRecord) {
  const explicit = authorityRecord.explicitMoment;
  if (!explicit || explicit.magnitudeNm === 0) return { record: null, blocker: null };
  if (!(explicit.magnitudeNm > 0) || !stringValue(explicit.axis)) {
    return {
      record: null,
      blocker: blocker('EMPIRICAL_COMPONENT_EXPLICIT_MOMENT_INVALID', {
        entityId: authorityRecord.entityId,
      }),
    };
  }
  const chainageMm = finite(authorityRecord.candidateChainageMm)
    ?? finite(authorityRecord.currentMethodPointChainageMm);
  if (!authorityRecord.routeId || chainageMm === null) {
    return {
      record: null,
      blocker: blocker('EMPIRICAL_COMPONENT_EXPLICIT_MOMENT_LOCATION_UNRESOLVED', {
        entityId: authorityRecord.entityId,
      }),
    };
  }
  return {
    blocker: null,
    record: freezeDeep({
      demandId: `SOURCE_EXPLICIT:${authorityRecord.entityId}:${explicit.axis}`,
      demandKind: 'SOURCE_EXPLICIT_POINT_MOMENT',
      entityId: authorityRecord.entityId,
      sourceEntityId: authorityRecord.sourceEntityId,
      routeId: authorityRecord.routeId,
      loadCaseId: 'SOURCE_DECLARED_UNSCOPED',
      applicationChainageMm: chainageMm,
      axis: explicit.axis,
      axisBasis: 'SOURCE_DECLARED_AXIS',
      magnitudeNm: explicit.magnitudeNm,
      vectorNm: null,
      offsetMm: null,
      componentMassKg: null,
      gravityForceN: null,
      sourceEvidenceSemanticHash: semanticHash({
        magnitudeEvidence: explicit.magnitudeEvidence,
        axisEvidence: explicit.axisEvidence,
      }),
      disposition: EMPIRICAL_COMPONENT_MOMENT_DISPOSITION,
      verticalReactionDistribution: 'NOT_PERFORMED',
    }),
  };
}

function nearestUnambiguousProjection(pointMm, route, edgeById, toleranceMm) {
  const candidates = [];
  for (const row of route.entityChainages || []) {
    const edge = edgeById.get(row.entityId);
    if (!edge || edge.pointComponent || edge.topologyCarrier || !(edge.lengthMm > 0)) continue;
    const projected = projectToSegment(pointMm, edge.startMm, edge.endMm);
    const start = finite(row.sourceStartChainageMm) ?? finite(row.startMm);
    const end = finite(row.sourceEndChainageMm) ?? finite(row.endMm);
    if (start === null || end === null) continue;
    candidates.push({
      chainageMm: start + projected.ratio * (end - start),
      distanceMm: projected.distanceMm,
      projectedPointMm: projected.pointMm,
      edgeEntityId: edge.entityId,
    });
  }
  if (candidates.length === 0) {
    return { qualified: false, code: 'EMPIRICAL_MOMENT_ROUTE_PROJECTION_MISSING' };
  }
  candidates.sort((left, right) => (
    left.distanceMm - right.distanceMm
      || left.chainageMm - right.chainageMm
      || compareCodeUnits(left.edgeEntityId, right.edgeEntityId)
  ));
  const nearestDistanceMm = candidates[0].distanceMm;
  const tieLimit = Math.max(1e-9, Math.abs(nearestDistanceMm) * 1e-9);
  const nearest = candidates.filter(
    (row) => Math.abs(row.distanceMm - nearestDistanceMm) <= tieLimit,
  );
  const chainages = nearest.map((row) => row.chainageMm);
  if (Math.max(...chainages) - Math.min(...chainages) > Math.max(toleranceMm, 1e-9)) {
    return {
      qualified: false,
      code: 'EMPIRICAL_MOMENT_ROUTE_PROJECTION_AMBIGUOUS',
      candidateChainagesMm: chainages.sort((a, b) => a - b),
    };
  }
  return {
    qualified: true,
    chainageMm: sum(chainages) / chainages.length,
    projectedPointMm: averagePoint(nearest.map((row) => row.projectedPointMm)),
    nearestDistanceMm,
  };
}

function resolveComponentMass(entity, profile) {
  const weights = projectDataValue(profile, 'loadCalculation.componentWeightsKg') || {};
  const attributes = entity.properties?.attributes || {};
  const catalogKey = stringValue(attributes.CATALOG_KEY) || stringValue(entity.sourceEntityId);
  const raw = weights[catalogKey];
  const massKg = positive(typeof raw === 'object' ? raw?.massKg : raw);
  return massKg === null
    ? { qualified: false, code: 'EMPIRICAL_MOMENT_COMPONENT_MASS_MISSING', catalogKey }
    : { qualified: true, catalogKey, massKg };
}

function verifyAuthorityBindings(input, audit) {
  const mismatches = [];
  compare('datasetId', input.dataset.datasetId, audit.datasetId, mismatches);
  compare('datasetVersion', input.dataset.version ?? null, audit.datasetVersion, mismatches);
  compare('sourceDatasetHash', input.dataset.sourceSha256 ?? null, audit.sourceDatasetHash, mismatches);
  compare('sharedModelSemanticHash', input.dataset.sharedModel.semanticHash, audit.sharedModelSemanticHash, mismatches);
  compare('routePartitionModelSemanticHash', semanticHash(input.routePartitionModel), audit.routePartitionModelSemanticHash, mismatches);
  compare('projectDataProfileSemanticHash', semanticHash(input.profile), audit.projectDataProfileSemanticHash, mismatches);
  if (mismatches.length > 0) {
    fail('EMPIRICAL_COMPONENT_MOMENT_AUTHORITY_BINDING_MISMATCH', 'Moment-demand inputs do not match the authority audit.', mismatches);
  }
}

function validateRecord(record) {
  exact(record, RECORD_KEYS, 'momentDemandRecord');
  if (!stringValue(record.demandId) || !stringValue(record.demandKind)
      || !stringValue(record.entityId) || !stringValue(record.routeId)) {
    fail('EMPIRICAL_COMPONENT_MOMENT_RECORD_INVALID', 'Moment demand identity is invalid.');
  }
  if (!(record.magnitudeNm > 0) || !Number.isFinite(record.applicationChainageMm)) {
    fail('EMPIRICAL_COMPONENT_MOMENT_RECORD_INVALID', 'Moment magnitude and chainage must be finite and positive.');
  }
  if (record.disposition !== EMPIRICAL_COMPONENT_MOMENT_DISPOSITION
      || record.verticalReactionDistribution !== 'NOT_PERFORMED') {
    fail('EMPIRICAL_COMPONENT_MOMENT_REACTION_BOUNDARY_INVALID', 'Moment record crossed the vertical-reaction boundary.');
  }
}

function projectToSegment(point, start, end) {
  const vector = subtract(end, start);
  const denominator = dot(vector, vector);
  if (!(denominator > 0)) {
    return { ratio: 0, distanceMm: Number.POSITIVE_INFINITY, pointMm: start };
  }
  const raw = dot(subtract(point, start), vector) / denominator;
  const ratio = Math.max(0, Math.min(1, raw));
  const pointMm = add(start, scale(vector, ratio));
  return { ratio, pointMm, distanceMm: magnitude(subtract(point, pointMm)) };
}

function assertInput(input) {
  if (!input?.dataset || !input?.profile || !input?.routePartitionModel || !input?.authorityAudit) {
    fail('EMPIRICAL_COMPONENT_MOMENT_INPUT_INVALID', 'Dataset, profile, route model and authority audit are required.');
  }
  if (!Array.isArray(input.dataset.entities)
      || !input.dataset.sharedModel
      || !Array.isArray(input.routePartitionModel.routes)
      || !Array.isArray(input.routePartitionModel.edges)) {
    fail('EMPIRICAL_COMPONENT_MOMENT_INPUT_INVALID', 'Moment-demand model inputs are incomplete.');
  }
}

function exact(value, keys, label) {
  const actual = Object.keys(value || {}).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('EMPIRICAL_COMPONENT_MOMENT_KEYS_INVALID', `${label} has unexpected keys.`, { actual, expected });
  }
}
function uniqueSortedStrings(values) {
  return [...new Set(values.map((value) => stringValue(value)).filter(Boolean))]
    .sort(compareCodeUnits);
}
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function positive(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}
function nonnegative(value) {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
}
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale(value, factor) { return { x: value.x * factor, y: value.y * factor, z: value.z * factor }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function magnitude(value) { return Math.hypot(value.x, value.y, value.z); }
function averagePoint(points) {
  return scale(points.reduce(add, { x: 0, y: 0, z: 0 }), 1 / points.length);
}
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function compare(field, expected, actual, mismatches) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) mismatches.push({ field, expected, actual });
}
function blocker(code, details = {}) { return freezeDeep({ code, ...details }); }
function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => compareCodeUnits(JSON.stringify(left), JSON.stringify(right)));
}
function isStrictlySorted(values) {
  return values.every((value, index) => index === 0 || compareCodeUnits(values[index - 1], value) < 0);
}
function compareCodeUnits(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details === null ? null : freezeDeep(details);
  throw error;
}
