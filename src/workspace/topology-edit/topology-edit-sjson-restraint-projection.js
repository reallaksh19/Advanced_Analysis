import { deepFreeze, semanticHash, stringValue } from '../../core/shared-piping-model/index.js';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from './support-restraint-family.js';

const SUPPORT_TYPES = new Set(['ATTA', 'SUPPORT']);
const EMPTY_MARKERS = new Set(['', '0', 'NONE', 'UNSET', 'FALSE', 'N/A', 'NA']);
const EXPLICIT_RESTRAINT_FIELDS = Object.freeze([
  'SUPPORT_KIND',
  'SUPPORT_MAPPER_KIND',
  'SUPPORT_TYPE',
  'CMPSUPTYPE',
  'MDSSUPPTYPE',
  'CMPSTRESSN',
]);
const RESTRAINT_TEXT = /\b(ANCHOR|FIXED|GUIDE|LINE\s*STOP|LINESTOP|SPRING|HANGER|REST|SHOE|BASE\s*PLATE|PIPE\s*SUPPORT)\b/iu;
const NON_RESTRAINT_ATTACHMENT_TEXT = /\b(FENCE|FLOOR|WALL|ROOF|SLAB)\b[\s\S]*\b(OPENING|PENETRATION|SLEEVE)\b|\b(OPENING|PENETRATION|SLEEVE)\b[\s\S]*\b(FENCE|FLOOR|WALL|ROOF|SLAB)\b/iu;
const DEFAULT_FRICTION = 0.3;

/**
 * Adapts the pinned Topo validator support pipeline exactly at the projection
 * boundary: resolve one restraint per raw support record, merge hierarchy
 * references, merge exact positions rounded to 0.001 mm, and deduplicate the
 * resulting restraint array by native restraint type. Canonical supports,
 * source identities, commands, and journals are never mutated.
 */
export function deriveSjsonTopoValidatorSupportProjection(input = {}) {
  const canonicalTopology = input.canonicalTopology;
  const dataset = input.dataset;
  if (!canonicalTopology?.supports || !canonicalTopology?.edges || !canonicalTopology?.nodes) {
    throw new TypeError('SJSON restraint projection requires canonical topology.');
  }
  if (!Array.isArray(dataset?.entities)) {
    throw new TypeError('SJSON restraint projection requires the workspace dataset.');
  }
  const markerSizeMm = positive(input.markerSizeMm);
  if (markerSizeMm === null) {
    throw new TypeError('SJSON restraint projection requires a positive markerSizeMm.');
  }

  const grouped = buildTopoValidatorSupportAnchors({
    canonicalTopology,
    dataset,
    verticalAxis: input.verticalAxis || 'Z',
  });
  const visualTopology = {
    ...canonicalTopology,
    supports: grouped.supports,
  };
  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: visualTopology,
    verticalAxis: input.verticalAxis || 'Z',
  });
  const projection = projectSupportGeometryToViewport(overlays, { markerSizeMm });
  const metrics = buildMetrics(canonicalTopology.supports, grouped, overlays, projection);
  const authorityBasis = {
    authority: 'TOPO_VALIDATOR_SUPPORT_HIERARCHY_POSITION_RESTRAINT_ARRAY',
    groupingAuthority: 'MDSSREF_MDSGUIDEREF_PREV_NAME_THEN_POSITION_0_001MM',
    restraintAuthority: 'TOPO_VALIDATOR_SJ_RESTRAINT_RESOLVER',
    canonicalTopologyHash: canonicalTopology.canonicalTopologyHash || null,
    sourceHash: canonicalTopology.sourceHash || null,
    decisions: grouped.decisions,
    anchors: grouped.anchors,
    metrics,
    projection,
  };

  return deepFreeze({
    authority: authorityBasis.authority,
    groupingAuthority: authorityBasis.groupingAuthority,
    restraintAuthority: authorityBasis.restraintAuthority,
    overlays,
    projection,
    decisions: grouped.decisions,
    anchors: grouped.anchors,
    metrics,
    authorityHash: semanticHash(authorityBasis),
  });
}

function buildTopoValidatorSupportAnchors({ canonicalTopology, dataset, verticalAxis }) {
  const supportByEntityId = new Map(
    canonicalTopology.supports.map((support) => [stringValue(support.entityId), support]),
  );
  const records = dataset.entities.map((entity, sourceOrder) => sourceRecord(
    entity,
    supportByEntityId.get(stringValue(entity.entityId)) || null,
    sourceOrder,
    verticalAxis,
  ));
  const rawSupportRecords = records.filter((record) => record.support);
  if (rawSupportRecords.length !== canonicalTopology.supports.length) {
    throw new Error(
      `SJSON restraint projection crosswalk mismatch: ${rawSupportRecords.length} dataset supports versus ${canonicalTopology.supports.length} canonical supports.`,
    );
  }

  const hierarchy = groupSupportsHierarchy(records);
  const positioned = groupSupportsByPosition(hierarchy.records);
  const anchorRecords = positioned.records.filter((record) => (
    isSupportType(record.componentType) && record.projectedSupport && record.members.length
  ));
  const supports = anchorRecords.map(projectedSupportFromAnchor).sort(bySupportId);
  const supportIdToAnchor = new Map();
  const anchors = anchorRecords.map((record) => {
    const support = supports.find((candidate) => candidate.projectionAnchorKey === record.anchorKey);
    const memberSupportIds = uniqueSorted(record.members.map((member) => member.support.id));
    for (const supportId of memberSupportIds) supportIdToAnchor.set(supportId, support.id);
    return Object.freeze({
      anchorKey: record.anchorKey,
      representativeSupportId: support.id,
      representativeEntityId: support.entityId,
      position: support.origin,
      hostEntityId: stringValue(support.hostEntityId) || null,
      memberSupportIds: Object.freeze(memberSupportIds),
      memberEntityIds: Object.freeze(uniqueSorted(record.members.map((member) => member.entity.entityId))),
      sourcePaths: Object.freeze(uniqueSorted(record.members.map((member) => member.entity.sourcePath))),
      restraintTypes: Object.freeze(record.restraints.map((restraint) => restraint.type)),
      restraintCount: record.restraints.length,
      hierarchyMergeCount: record.hierarchyMergeCount,
      positionMergeCount: record.positionMergeCount,
    });
  }).sort((left, right) => compareCodeUnits(left.anchorKey, right.anchorKey));

  const deferredSupportIds = new Set(
    rawSupportRecords.filter((record) => !record.projectedSupport).map((record) => record.support.id),
  );
  const decisions = canonicalTopology.supports.map((support) => {
    const supportId = stringValue(support.id);
    const anchorSupportId = supportIdToAnchor.get(supportId) || null;
    return Object.freeze({
      supportId,
      entityId: stringValue(support.entityId),
      disposition: deferredSupportIds.has(supportId)
        ? 'DEFER_NON_RESTRAINT_ATTACHMENT'
        : anchorSupportId === supportId
          ? 'ANCHOR_REPRESENTATIVE'
          : anchorSupportId
            ? 'MERGED_INTO_SUPPORT_ANCHOR'
            : 'UNRESOLVED_SUPPORT_GROUP',
      anchorSupportId,
    });
  }).sort((left, right) => compareCodeUnits(left.supportId, right.supportId));

  return deepFreeze({
    supports,
    anchors,
    decisions,
    rawSupportRecordCount: rawSupportRecords.length,
    projectedSourceSupportCount: rawSupportRecords.filter((record) => record.projectedSupport).length,
    deferredSourceSupportCount: rawSupportRecords.filter((record) => !record.projectedSupport).length,
    hierarchyMergeCount: hierarchy.mergeCount,
    positionMergeCount: positioned.mergeCount,
  });
}

function sourceRecord(entity, support, sourceOrder, verticalAxis) {
  const attributes = entityAttributes(entity);
  const componentType = normalizeComponentType(entity.entityType);
  const supportType = isSupportType(componentType);
  const supportPolicy = supportType ? classifySupportProjection(attributes) : null;
  const projectedSupport = Boolean(support && isProjectedSupport(entity, support, supportPolicy));
  const position = bestPosition(attributes) || finitePoint(support?.origin);
  const restraint = supportType ? resolveTopoValidatorRestraint(attributes, verticalAxis) : null;
  const member = support ? Object.freeze({ entity, support }) : null;
  return {
    sourceOrder,
    entity,
    support,
    componentType,
    attributes,
    name: stringValue(attributes.NAME || entity.name),
    position,
    projectedSupport,
    supportPolicy,
    restraints: restraint ? [restraint] : [],
    members: member ? [member] : [],
    hierarchyMergeCount: 0,
    positionMergeCount: 0,
    anchorKey: position ? positionKey(position) : `UNPOSITIONED:${sourceOrder}`,
  };
}

function groupSupportsHierarchy(records) {
  const byName = new Map();
  for (const record of records) {
    if (record.name) byName.set(record.name, record);
  }
  const removed = new Set();
  let mergeCount = 0;
  for (const record of records) {
    if (!isSupportType(record.componentType)) continue;
    const root = hierarchyRoot(record, byName);
    if (!root || root === record) continue;
    mergeRecord(root, record, 'HIERARCHY');
    removed.add(record);
    mergeCount += 1;
  }
  for (const record of records) deduplicateRestraints(record);
  return {
    records: records.filter((record) => !removed.has(record)),
    mergeCount,
  };
}

function hierarchyRoot(record, byName) {
  let current = record;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    const currentName = stringValue(current.attributes.NAME || current.entity.name);
    const reference = ['MDSSREF', 'MDSGUIDEREF', 'PREV-NAME']
      .map((field) => stringValue(current.attributes[field]))
      .find((value) => value && value !== currentName && byName.has(value));
    current = reference ? byName.get(reference) : null;
  }
  return current || record;
}

function groupSupportsByPosition(records) {
  const byPosition = new Map();
  const removed = new Set();
  let mergeCount = 0;
  for (const record of records) {
    if (!isSupportType(record.componentType) || !record.position) continue;
    const key = positionKey(record.position);
    const root = byPosition.get(key);
    if (!root) {
      record.anchorKey = key;
      byPosition.set(key, record);
      continue;
    }
    mergeRecord(root, record, 'POSITION');
    if (record.componentType === 'SUPPORT' && root.componentType === 'ATTA') {
      root.componentType = 'SUPPORT';
    }
    removed.add(record);
    mergeCount += 1;
  }
  for (const record of records) deduplicateRestraints(record);
  return {
    records: records.filter((record) => !removed.has(record)),
    mergeCount,
  };
}

function mergeRecord(root, record, mode) {
  root.restraints.push(...record.restraints);
  root.members.push(...record.members);
  root.projectedSupport = root.projectedSupport || record.projectedSupport;
  root.hierarchyMergeCount += record.hierarchyMergeCount + (mode === 'HIERARCHY' ? 1 : 0);
  root.positionMergeCount += record.positionMergeCount + (mode === 'POSITION' ? 1 : 0);
}

function deduplicateRestraints(record) {
  const seen = new Set();
  record.restraints = record.restraints.filter((restraint) => {
    const key = stringValue(restraint.type || restraint.kind);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function projectedSupportFromAnchor(record) {
  const members = [...record.members].sort(compareMembers);
  const representative = members[0];
  if (!representative?.support) {
    throw new Error(`SJSON support anchor ${record.anchorKey} has no canonical representative.`);
  }
  const memberSupportIds = uniqueSorted(members.map((member) => member.support.id));
  const memberEntityIds = uniqueSorted(members.map((member) => member.entity.entityId));
  const memberHostEntityIds = uniqueSorted(members.map((member) => member.support.hostEntityId));
  const sourcePaths = uniqueSorted(members.map((member) => member.entity.sourcePath));
  const origin = finitePoint(record.position) || finitePoint(representative.support.origin);
  const restraints = record.restraints.map((restraint, index) => ({
    ...restraintForViewport(restraint),
    id: stableRestraintId(representative.support.id, restraint.type, index),
    restraintId: stableRestraintId(representative.support.id, restraint.type, index),
    sourcePaths,
    sourceSupportIds: memberSupportIds,
    sourceEntityIds: memberEntityIds,
  }));
  return {
    ...representative.support,
    nodeId: null,
    origin,
    originAuthority: 'TOPO_VALIDATOR_GROUPED_SOURCE_POSITION',
    sourcePaths,
    restraints,
    projectionAnchorKey: record.anchorKey,
    projectionMemberSupportIds: memberSupportIds,
    projectionMemberEntityIds: memberEntityIds,
    projectionMemberHostEntityIds: memberHostEntityIds,
    projectionAuthority: 'TOPO_VALIDATOR_SUPPORT_HIERARCHY_POSITION_RESTRAINT_ARRAY',
  };
}

function compareMembers(left, right) {
  const leftHost = stringValue(left.support.hostEntityId) ? 0 : 1;
  const rightHost = stringValue(right.support.hostEntityId) ? 0 : 1;
  if (leftHost !== rightHost) return leftHost - rightHost;
  const leftResolved = left.support.resolved === true ? 0 : 1;
  const rightResolved = right.support.resolved === true ? 0 : 1;
  if (leftResolved !== rightResolved) return leftResolved - rightResolved;
  return compareCodeUnits(stringValue(left.support.id), stringValue(right.support.id));
}

function classifySupportProjection(attributes) {
  const explicit = explicitRestraintEvidence(attributes);
  if (explicit) {
    return Object.freeze({
      disposition: 'EMIT_SUPPORT_ATTACHMENT',
      authority: `ATTRIBUTE:${explicit.field}`,
    });
  }
  const description = [attributes.DTXR, attributes.ISONOTE, attributes.DESCRIPTION]
    .map(stringValue).filter(Boolean).join(' | ');
  if (NON_RESTRAINT_ATTACHMENT_TEXT.test(description) && !RESTRAINT_TEXT.test(description)) {
    return Object.freeze({
      disposition: 'DEFER_SUPPORT',
      authority: 'NON_RESTRAINT_ATTACHMENT_DESCRIPTION',
    });
  }
  return Object.freeze({
    disposition: 'EMIT_SUPPORT_ATTACHMENT',
    authority: RESTRAINT_TEXT.test(description)
      ? 'DESCRIPTION_RESTRAINT_SEMANTICS'
      : 'LEGACY_ATTA_FALLBACK',
  });
}

function explicitRestraintEvidence(attributes) {
  for (const field of EXPLICIT_RESTRAINT_FIELDS) {
    if (meaningful(attributes[field])) return { field, value: stringValue(attributes[field]) };
  }
  const nodeType = Number(attributes.NODETYPE);
  if (Number.isFinite(nodeType) && nodeType > 0) return { field: 'NODETYPE', value: String(nodeType) };
  const stiffness = numericAttribute(attributes, ['NODESTIFF']);
  return stiffness !== null && stiffness > 0
    ? { field: 'NODESTIFF', value: String(stiffness) }
    : null;
}

function isProjectedSupport(entity, support, policy) {
  if (policy?.disposition !== 'DEFER_SUPPORT') return true;
  const enriched = entity.properties?.enrichedAttributes || {};
  const managedAuthority = stringValue(enriched.schema) === 'stagedjson-cii2019-enriched-attributes/v1'
    && stringValue(enriched.componentType).toUpperCase() === 'SUPPORT'
    && stringValue(enriched.status).toLowerCase() === 'resolved'
    && enriched.needsReview === false;
  return managedAuthority && (Boolean(stringValue(support.hostEntityId)) || support.resolved === true);
}

function resolveTopoValidatorRestraint(attributes, verticalAxis) {
  const kind = classifySupportKind(attributes);
  const gap = numericAttribute(attributes, ['NODEGAP', 'CMPSUPGAP', 'GAP_MM']) ?? 0;
  const stiffness = numericAttribute(attributes, ['NODESTIFF', 'STIFFNESS']) ?? 0;
  const friction = numericAttribute(attributes, ['NODEFRICTION', 'FRICTION'])
    ?? (kind === 'REST' ? DEFAULT_FRICTION : 0);
  if (kind === 'ANCHOR') {
    return Object.freeze({ kind, type: 'ANC', direction: 'A', gap, friction: 0, stiffness: 0 });
  }
  if (kind === 'GUIDE') {
    return Object.freeze({ kind, type: 'GUI', direction: 'GUI', gap, friction: 0, stiffness });
  }
  if (kind === 'LINESTOP') {
    return Object.freeze({ kind, type: 'LIM', direction: 'LIM', gap, friction: 0, stiffness });
  }
  if (kind === 'SPRING') {
    const zUp = stringValue(verticalAxis).toUpperCase() === 'Z';
    return Object.freeze({
      kind,
      type: zUp ? 'ZSPR' : 'YSPR',
      direction: zUp ? '+Z' : '+Y',
      gap: 0,
      friction: 0,
      stiffness,
    });
  }
  const zUp = stringValue(verticalAxis).toUpperCase() === 'Z';
  return Object.freeze({
    kind: 'REST',
    type: zUp ? '+Z' : '+Y',
    direction: zUp ? '+Z' : '+Y',
    gap,
    friction,
    stiffness: 0,
  });
}

function classifySupportKind(attributes) {
  const raw = firstText(attributes, [
    'SUPPORT_KIND',
    'SUPPORT_MAPPER_KIND',
    'SUPPORT_TYPE',
    'CMPSUPTYPE',
    'NODETYPE',
    'MDSSUPPTYPE',
  ]) || firstText(attributes, ['DTXR']);
  const token = raw.toUpperCase();
  if (!token) return 'REST';
  if (/ANCHOR|FIXED|FIX|ANCI/u.test(token)) return 'ANCHOR';
  if (/GUIDE|GT01/u.test(token)) return 'GUIDE';
  if (/LINE\s*STOP|LINESTOP|ST06|LS[-_]/u.test(token)) return 'LINESTOP';
  if (/SPRING|HANG|HANGER/u.test(token)) return 'SPRING';
  return 'REST';
}

function restraintForViewport(restraint) {
  if (restraint.kind === 'ANCHOR') {
    return { kind: 'ANCHOR', type: restraint.type, direction: '', gapMm: restraint.gap };
  }
  if (restraint.kind === 'GUIDE') {
    return { kind: 'GUIDE', type: restraint.type, direction: 'LOCAL_Y', gapMm: restraint.gap };
  }
  if (restraint.kind === 'LINESTOP') {
    return { kind: 'LINE_STOP', type: restraint.type, direction: 'LOCAL_X', gapMm: restraint.gap };
  }
  if (restraint.kind === 'SPRING') {
    return {
      kind: 'SPRING_HANGER',
      type: restraint.type,
      direction: restraint.direction,
      gapMm: restraint.gap,
      stiffness: restraint.stiffness,
    };
  }
  return {
    kind: 'REST',
    type: restraint.type,
    direction: restraint.direction,
    gapMm: restraint.gap,
    friction: restraint.friction,
  };
}

function buildMetrics(allSupports, grouped, overlays, projection) {
  const restraintTypes = grouped.anchors.flatMap((anchor) => anchor.restraintTypes);
  const distinctOrigins = new Set(
    overlays.filter((overlay) => overlay.origin).map((overlay) => positionKey(overlay.origin)),
  );
  return Object.freeze({
    rawSupportCount: allSupports.length,
    projectedSourceSupportCount: grouped.projectedSourceSupportCount,
    deferredSourceSupportCount: grouped.deferredSourceSupportCount,
    supportAnchorCount: grouped.anchors.length,
    nativeRestraintRecordCount: restraintTypes.length,
    collapsedSourceSupportCount: grouped.projectedSourceSupportCount - grouped.anchors.length,
    hierarchyMergeCount: grouped.hierarchyMergeCount,
    positionMergeCount: grouped.positionMergeCount,
    projectedSupportMarkerCount: projection.elements.length,
    projectedRestraintDirectionCount: projection.segments.length,
    distinctOriginCount: distinctOrigins.size,
    restraintTypeCounts: countBy(restraintTypes),
  });
}

function entityAttributes(entity) {
  return entity?.properties?.attributes || {};
}

function normalizeComponentType(value) {
  const token = stringValue(value).toUpperCase();
  return ({ ANCI: 'ATTA' })[token] || token;
}

function isSupportType(value) {
  return SUPPORT_TYPES.has(stringValue(value).toUpperCase());
}

function bestPosition(attributes) {
  for (const key of ['APOS', 'POS', 'LPOS', 'HPOS', 'TPOS', 'BPOS']) {
    const point = parsePoint(attributes[key]);
    if (point) return point;
  }
  return null;
}

function parsePoint(value) {
  const direct = finitePoint(value);
  if (direct) return direct;
  if (typeof value !== 'string') return null;
  const numbers = value.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/gu)?.map(Number) || [];
  return numbers.length >= 3 && numbers.slice(0, 3).every(Number.isFinite)
    ? Object.freeze({ x: numbers[0], y: numbers[1], z: numbers[2] })
    : null;
}

function finitePoint(value) {
  if (!value || typeof value !== 'object') return null;
  const point = {
    x: Number(value.x ?? value.X),
    y: Number(value.y ?? value.Y),
    z: Number(value.z ?? value.Z),
  };
  return Object.values(point).every(Number.isFinite) ? Object.freeze(point) : null;
}

function positionKey(point) {
  return [point.x, point.y, point.z].map((value) => Number(value).toFixed(3)).join(' ');
}

function stableRestraintId(supportId, type, index) {
  const token = stringValue(type).replace(/[^A-Za-z0-9+_-]+/gu, '_') || `R${index + 1}`;
  return `restraint:${stringValue(supportId)}:${token}`;
}

function meaningful(value) {
  return !EMPTY_MARKERS.has(stringValue(value).toUpperCase());
}

function firstText(attributes, keys) {
  for (const key of keys) {
    const value = stringValue(attributes?.[key]);
    if (value) return value;
  }
  return '';
}

function numericAttribute(attributes, keys) {
  for (const key of keys) {
    const raw = attributes?.[key];
    if (raw === null || raw === undefined) continue;
    const parsed = Number(String(raw).replace(/[^0-9.-]/gu, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = stringValue(value) || 'UNKNOWN';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => compareCodeUnits(left, right)),
  ));
}

function uniqueSorted(values) {
  return [...new Set(values.map(stringValue).filter(Boolean))].sort(compareCodeUnits);
}

function bySupportId(left, right) {
  return compareCodeUnits(stringValue(left.id), stringValue(right.id));
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
