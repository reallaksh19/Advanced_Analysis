import { deepFreeze, semanticHash, stringValue } from '../../core/shared-piping-model/index.js';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
  restraintFamily,
} from './support-restraint-family.js';

const QUALIFICATION_RANK = Object.freeze({
  EXPLICITLY_RESOLVED: 0,
  TYPE_CLASSIFIED: 1,
  PARTIALLY_RESOLVED: 2,
  UNRESOLVED: 3,
  BLOCKED_ATTACHMENT: 4,
  CONFLICTED: 5,
});

/**
 * Topo validator projects one native restraint record per governed physical
 * site/host/family, while retaining every raw SUPPORT row as lineage. Canonical
 * supports remain untouched; consolidation exists only in the visual projection.
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

  const consolidation = consolidateNativeRestraints(canonicalTopology);
  const visualTopology = {
    ...canonicalTopology,
    supports: consolidation.representatives,
  };
  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: visualTopology,
    verticalAxis: input.verticalAxis || 'Z',
  });
  const projection = projectSupportGeometryToViewport(overlays, { markerSizeMm });
  const metrics = buildMetrics(
    canonicalTopology.supports,
    consolidation,
    overlays,
    projection,
  );
  const authorityBasis = {
    authority: 'TOPO_VALIDATOR_NATIVE_RESTRAINT_RECORDS',
    groupingAuthority: 'EXACT_SITE_HOST_AND_RESTRAINT_FAMILY',
    canonicalTopologyHash: canonicalTopology.canonicalTopologyHash || null,
    decisions: consolidation.decisions,
    groups: consolidation.groups,
    metrics,
    projection,
  };

  return deepFreeze({
    authority: authorityBasis.authority,
    groupingAuthority: authorityBasis.groupingAuthority,
    overlays,
    projection,
    decisions: consolidation.decisions,
    groups: consolidation.groups,
    metrics,
    authorityHash: semanticHash(authorityBasis),
  });
}

function consolidateNativeRestraints(canonicalTopology) {
  const nodePositions = new Map(
    canonicalTopology.nodes.map((node) => [stringValue(node.id), node.position]),
  );
  const orderedSupports = [...canonicalTopology.supports]
    .sort((left, right) => compareCodeUnits(stringValue(left.id), stringValue(right.id)));
  const grouped = new Map();

  for (const support of orderedSupports) {
    const groupDescriptor = supportGroupDescriptor(support, nodePositions);
    if (!grouped.has(groupDescriptor.groupKey)) grouped.set(groupDescriptor.groupKey, []);
    grouped.get(groupDescriptor.groupKey).push({ support, ...groupDescriptor });
  }

  const representatives = [];
  const decisions = [];
  const groups = [];
  for (const [groupKey, rows] of [...grouped.entries()]
    .sort(([left], [right]) => compareCodeUnits(left, right))) {
    const rankedRows = [...rows].sort(compareRepresentativeRows);
    const representativeRow = rankedRows[0];
    const memberSupportIds = rows.map((row) => stringValue(row.support.id)).sort(compareCodeUnits);
    const sourcePaths = uniqueSorted(rows.flatMap((row) => supportSourcePaths(row.support)));
    const representative = mergeProjectionLineage(
      representativeRow.support,
      groupKey,
      memberSupportIds,
      sourcePaths,
    );
    representatives.push(representative);
    groups.push(Object.freeze({
      groupKey,
      representativeSupportId: stringValue(representative.id),
      hostEntityId: representativeRow.hostEntityId,
      family: representativeRow.family,
      origin: representativeRow.origin,
      memberSupportIds: Object.freeze(memberSupportIds),
      sourcePaths: Object.freeze(sourcePaths),
      qualification: normalizedToken(representative.restraint?.qualification),
      solverEligible: representative.restraint?.solverEligible === true,
    }));
    for (const row of rows) {
      const supportId = stringValue(row.support.id);
      const isRepresentative = supportId === stringValue(representative.id);
      decisions.push(Object.freeze({
        supportId,
        disposition: isRepresentative ? 'REPRESENTATIVE' : 'COLLAPSED_TO_REPRESENTATIVE',
        reason: isRepresentative
          ? 'NATIVE_RESTRAINT_SITE_FAMILY_REPRESENTATIVE'
          : 'DUPLICATE_SOURCE_ROW_AT_NATIVE_RESTRAINT_SITE_FAMILY',
        groupKey,
        representativeSupportId: stringValue(representative.id),
        hostEntityId: row.hostEntityId,
        family: row.family,
        qualification: normalizedToken(row.support.restraint?.qualification),
        solverEligible: row.support.restraint?.solverEligible === true,
      }));
    }
  }

  return deepFreeze({ representatives, decisions, groups });
}

function supportGroupDescriptor(support, nodePositions) {
  const origin = finitePoint(support.origin)
    || finitePoint(nodePositions.get(stringValue(support.nodeId)));
  if (!origin) {
    throw new Error(`SJSON restraint projection cannot resolve support origin: ${stringValue(support.id)}`);
  }
  const hostEntityId = stringValue(
    support.hostEntityId || support.edgeId || support.attachedEdgeId,
  ) || 'UNRESOLVED_HOST';
  const family = restraintFamily(support.restraint || {}) || 'UNKNOWN';
  return Object.freeze({
    origin,
    hostEntityId,
    family,
    groupKey: `${pointKey(origin)}|${hostEntityId}|${family}`,
  });
}

function compareRepresentativeRows(left, right) {
  const leftRank = representativeRank(left.support);
  const rightRank = representativeRank(right.support);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return compareCodeUnits(stringValue(left.support.id), stringValue(right.support.id));
}

function representativeRank(support) {
  const qualification = normalizedToken(support.restraint?.qualification);
  const qualificationRank = QUALIFICATION_RANK[qualification] ?? 99;
  const solverRank = support.restraint?.solverEligible === true ? 0 : 1;
  return qualificationRank * 10 + solverRank;
}

function mergeProjectionLineage(support, groupKey, memberSupportIds, sourcePaths) {
  const restraint = support.restraint
    ? {
        ...support.restraint,
        sourcePaths: uniqueSorted([
          ...(Array.isArray(support.restraint.sourcePaths) ? support.restraint.sourcePaths : []),
          ...sourcePaths,
        ]),
        projectionGroupKey: groupKey,
        projectionMemberSupportIds: [...memberSupportIds],
      }
    : support.restraint;
  return {
    ...support,
    sourcePaths: [...sourcePaths],
    restraint,
    projectionGroupKey: groupKey,
    projectionMemberSupportIds: [...memberSupportIds],
    projectionAuthority: 'TOPO_VALIDATOR_NATIVE_RESTRAINT_RECORDS',
  };
}

function buildMetrics(allSupports, consolidation, overlays, projection) {
  const qualificationCounts = countBy(
    consolidation.groups,
    (row) => row.qualification || 'NONE',
  );
  const familyCounts = countBy(consolidation.groups, (row) => row.family || 'UNKNOWN');
  const distinctOrigins = new Set(
    overlays
      .filter((overlay) => overlay.origin)
      .map((overlay) => pointKey(overlay.origin)),
  );
  return Object.freeze({
    rawSupportCount: allSupports.length,
    nativeRestraintRecordCount: consolidation.groups.length,
    collapsedSourceSupportCount: allSupports.length - consolidation.groups.length,
    projectedSupportMarkerCount: projection.elements.length,
    projectedRestraintDirectionCount: projection.segments.length,
    distinctOriginCount: distinctOrigins.size,
    resolvedNativeRestraintCount: consolidation.groups.filter((row) => row.solverEligible).length,
    diagnosticNativeRestraintCount: consolidation.groups.filter((row) => !row.solverEligible).length,
    qualificationCounts,
    familyCounts,
  });
}

function supportSourcePaths(support) {
  return [
    ...(Array.isArray(support.sourcePaths) ? support.sourcePaths : []),
    stringValue(support.sourcePath),
    ...(Array.isArray(support.restraint?.sourcePaths) ? support.restraint.sourcePaths : []),
    stringValue(support.restraint?.sourcePath),
  ].filter(Boolean);
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = stringValue(selector(row)) || 'NONE';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => compareCodeUnits(left, right)),
  ));
}

function uniqueSorted(values) {
  return [...new Set(values.map(stringValue).filter(Boolean))].sort(compareCodeUnits);
}

function finitePoint(value) {
  if (!value || typeof value !== 'object') return null;
  const point = { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
  return Object.values(point).every(Number.isFinite) ? Object.freeze(point) : null;
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
