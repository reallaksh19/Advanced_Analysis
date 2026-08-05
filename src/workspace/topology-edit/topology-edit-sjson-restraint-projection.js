import { deepFreeze, semanticHash, stringValue } from '../../core/shared-piping-model/index.js';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from './support-restraint-family.js';

const RENDERABLE_QUALIFICATIONS = new Set([
  'EXPLICITLY_RESOLVED',
  'TYPE_CLASSIFIED',
  'PARTIALLY_RESOLVED',
]);
const ACTIVE_RESTRAINT_STATES = new Set(['RESTRAINED', 'GAP', 'SPRING']);
const RESTRAINT_DIRECTION_FIELDS = Object.freeze([
  'vertical',
  'lateral',
  'longitudinal',
  'rotational',
]);

/**
 * Topo validator projects native restraint records, not every raw SUPPORT row.
 * Keep canonical supports untouched and build a visual-only subset from the
 * certified restraint capability model.
 */
export function deriveSjsonTopoValidatorSupportProjection(input = {}) {
  const canonicalTopology = input.canonicalTopology;
  if (!canonicalTopology?.supports || !canonicalTopology?.edges || !canonicalTopology?.nodes) {
    throw new TypeError('SJSON restraint projection requires canonical topology.');
  }
  const markerSizeMm = positive(input.markerSizeMm);
  if (markerSizeMm === null) {
    throw new TypeError('SJSON restraint projection requires a positive markerSizeMm.');
  }

  const decisions = [...canonicalTopology.supports]
    .sort((left, right) => compareCodeUnits(stringValue(left.id), stringValue(right.id)))
    .map(classifySupportProjection);
  const includedSupportIds = new Set(
    decisions.filter((row) => row.disposition === 'INCLUDE').map((row) => row.supportId),
  );
  const visualTopology = {
    ...canonicalTopology,
    supports: canonicalTopology.supports.filter((support) => includedSupportIds.has(stringValue(support.id))),
  };
  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: visualTopology,
    verticalAxis: input.verticalAxis || 'Z',
  });
  const projection = projectSupportGeometryToViewport(overlays, { markerSizeMm });
  const metrics = buildMetrics(canonicalTopology.supports, decisions, overlays, projection);
  const authorityBasis = {
    authority: 'TOPO_VALIDATOR_NATIVE_RESTRAINT_RECORDS',
    canonicalTopologyHash: canonicalTopology.canonicalTopologyHash || null,
    decisions,
    metrics,
    projection,
  };

  return deepFreeze({
    authority: authorityBasis.authority,
    overlays,
    projection,
    decisions,
    metrics,
    authorityHash: semanticHash(authorityBasis),
  });
}

export function isSjsonTopoValidatorRenderableSupport(support = {}) {
  return classifySupportProjection(support).disposition === 'INCLUDE';
}

function classifySupportProjection(support = {}) {
  const supportId = stringValue(support.id);
  const restraint = support.restraint || null;
  if (!restraint) return decision(supportId, 'EXCLUDE', 'NO_RESTRAINT_RECORD', null, []);

  const qualification = normalizedToken(restraint.qualification);
  const activeDirections = RESTRAINT_DIRECTION_FIELDS.filter((field) => (
    ACTIVE_RESTRAINT_STATES.has(normalizedToken(restraint?.[field]?.state))
  ));
  if (restraint.solverEligible !== true) {
    return decision(supportId, 'EXCLUDE', 'NOT_SOLVER_ELIGIBLE', qualification, activeDirections);
  }
  if (!RENDERABLE_QUALIFICATIONS.has(qualification)) {
    return decision(supportId, 'EXCLUDE', 'UNQUALIFIED_RESTRAINT', qualification, activeDirections);
  }
  if (!activeDirections.length) {
    return decision(supportId, 'EXCLUDE', 'NO_ACTIVE_RESTRAINT_DIRECTION', qualification, activeDirections);
  }
  return decision(supportId, 'INCLUDE', 'QUALIFIED_ACTIVE_RESTRAINT', qualification, activeDirections);
}

function decision(supportId, disposition, reason, qualification, activeDirections) {
  return Object.freeze({
    supportId,
    disposition,
    reason,
    qualification,
    activeDirections: Object.freeze([...activeDirections]),
  });
}

function buildMetrics(allSupports, decisions, overlays, projection) {
  const included = decisions.filter((row) => row.disposition === 'INCLUDE');
  const reasonCounts = countBy(decisions, (row) => row.reason);
  const qualificationCounts = countBy(decisions, (row) => row.qualification || 'NONE');
  const distinctOrigins = new Set(
    overlays
      .filter((overlay) => overlay.origin)
      .map((overlay) => pointKey(overlay.origin)),
  );
  return Object.freeze({
    rawSupportCount: allSupports.length,
    nativeRestraintRecordCount: included.length,
    excludedSupportCount: decisions.length - included.length,
    projectedSupportMarkerCount: projection.elements.length,
    projectedRestraintDirectionCount: projection.segments.length,
    distinctOriginCount: distinctOrigins.size,
    reasonCounts,
    qualificationCounts,
  });
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = stringValue(selector(row)) || 'NONE';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.freeze(Object.fromEntries(Object.entries(counts).sort(([left], [right]) => compareCodeUnits(left, right))));
}

function pointKey(point) {
  return [point.x, point.y, point.z]
    .map((value) => Number(value).toFixed(6))
    .join('|');
}

function normalizedToken(value) {
  return stringValue(value).toUpperCase().replace(/[\s-]+/gu, '_');
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
