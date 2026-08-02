import { createHash } from 'node:crypto';
import {
  ENGINEERING_FIELDS,
  FIELD_STATUS,
  LINE_FLAG,
  sha256Text,
  stableStringify,
} from './enrichment-ui-phase0-fixtures.mjs';
import {
  EMPTY_ORDINALS,
  andBitsets,
  bitsetToOrdinals,
  fullBitset,
  hashTypedOrdinalList,
  orBitsets,
} from './enrichment-ui-phase0-index-core.mjs';

export function lookupNormalizedLineKey(indexes, fixture, normalizedKey) {
  const ordinals = indexes.lineOrdinalsByNormalizedKey.get(normalizedKey) ?? EMPTY_ORDINALS;
  const candidateTargetIds = Array.from(ordinals, (ordinal) => fixture.lines.targetIdByOrdinal[ordinal]).sort();
  if (candidateTargetIds.length === 0) {
    return Object.freeze({ status: 'NO_MATCH', selectedTargetId: null, candidateTargetIds: Object.freeze([]) });
  }
  if (candidateTargetIds.length === 1) {
    return Object.freeze({
      status: 'EXACT_ONE',
      selectedTargetId: candidateTargetIds[0],
      candidateTargetIds: Object.freeze(candidateTargetIds),
    });
  }
  return Object.freeze({
    status: 'BLOCKED_AMBIGUOUS',
    selectedTargetId: null,
    candidateTargetIds: Object.freeze(candidateTargetIds),
  });
}

export function lookupContainmentCandidates(query, candidates) {
  const normalizedQuery = normalizeSearchKey(query);
  const matches = candidates
    .filter((candidate) => {
      const key = normalizeSearchKey(candidate.normalizedKey);
      return normalizedQuery.length >= 3
        && key.length >= 3
        && (normalizedQuery.includes(key) || key.includes(normalizedQuery));
    })
    .map((candidate) => ({
      targetId: candidate.targetId,
      normalizedKey: candidate.normalizedKey,
    }))
    .sort((left, right) => left.targetId.localeCompare(right.targetId));

  if (matches.length === 0) {
    return Object.freeze({ status: 'NO_MATCH', selectedTargetId: null, candidates: Object.freeze([]) });
  }
  if (matches.length === 1) {
    return Object.freeze({ status: 'EXACT_ONE', selectedTargetId: matches[0].targetId, candidates: Object.freeze(matches) });
  }
  return Object.freeze({ status: 'BLOCKED_AMBIGUOUS', selectedTargetId: null, candidates: Object.freeze(matches) });
}

export function buildGroups(indexes, fixture) {
  const groups = new Map();
  for (let ordinal = 0; ordinal < fixture.manifest.lineCount; ordinal += 1) {
    const serviceId = fixture.lines.serviceIdByOrdinal[ordinal];
    const ratingId = fixture.lines.ratingIdByOrdinal[ordinal];
    const classId = fixture.lines.classIdByOrdinal[ordinal];
    const key = `${serviceId}:${ratingId}:${classId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        groupId: `GROUP:${key}`,
        serviceId,
        ratingId,
        classId,
        lineOrdinals: [],
        statusCounts: new Uint32Array(9),
      };
      groups.set(key, group);
    }
    group.lineOrdinals.push(ordinal);
    group.statusCounts[dominantLineStatus(fixture, ordinal)] += 1;
  }

  const result = Array.from(groups.values(), (group) => Object.freeze({
    groupId: group.groupId,
    serviceId: group.serviceId,
    ratingId: group.ratingId,
    classId: group.classId,
    lineCount: group.lineOrdinals.length,
    lineOrdinals: new Uint32Array(group.lineOrdinals),
    statusCounts: group.statusCounts,
  })).sort((left, right) => left.groupId.localeCompare(right.groupId));

  return Object.freeze({
    groups: Object.freeze(result),
    digest: hashGroups(result),
    lineCount: indexes.counts.lineCount,
  });
}

export function applyFilter(indexes, filter = {}) {
  const bitsets = [];
  if (filter.serviceIds?.length) {
    bitsets.push(orBitsets(filter.serviceIds.map((id) => indexes.facetBitsets.byServiceId.get(id))));
  }
  if (filter.ratingIds?.length) {
    bitsets.push(orBitsets(filter.ratingIds.map((id) => indexes.facetBitsets.byRatingId.get(id))));
  }
  if (filter.classIds?.length) {
    bitsets.push(orBitsets(filter.classIds.map((id) => indexes.facetBitsets.byClassId.get(id))));
  }
  if (filter.lineFlags?.length) {
    bitsets.push(orBitsets(filter.lineFlags.map((flag) => indexes.facetBitsets.byLineFlag.get(flag))));
  }

  const selected = bitsets.length === 0
    ? fullBitset(indexes.counts.lineCount)
    : bitsets.reduce((left, right) => andBitsets(left, right));
  const ordinals = bitsetToOrdinals(selected, indexes.counts.lineCount);
  return Object.freeze({
    ordinals,
    count: ordinals.length,
    digest: hashTypedOrdinalList(ordinals),
  });
}

export function buildExceptionQueues(indexes, fixture) {
  const queues = {
    duplicateIdentities: [],
    missingMasters: [],
    ambiguousContainment: [],
    staleHashes: [],
    blockedFields: [],
  };

  for (const bucket of indexes.lineOrdinalsByNormalizedKey.values()) {
    if (bucket.length > 1) queues.duplicateIdentities.push(...bucket);
  }

  for (let ordinal = 0; ordinal < fixture.manifest.lineCount; ordinal += 1) {
    const flags = fixture.lines.flagsByOrdinal[ordinal];
    if ((flags & LINE_FLAG.MISSING_MASTER) !== 0) queues.missingMasters.push(ordinal);
    if ((flags & LINE_FLAG.AMBIGUOUS_CONTAINMENT) !== 0) queues.ambiguousContainment.push(ordinal);
    if ((flags & LINE_FLAG.STALE_HASH) !== 0) queues.staleHashes.push(ordinal);
    if ((flags & LINE_FLAG.BLOCKED_FIELD) !== 0) queues.blockedFields.push(ordinal);
  }

  const frozenQueues = Object.fromEntries(Object.entries(queues).map(([name, values]) => {
    values.sort((left, right) => left - right);
    return [name, new Uint32Array(values)];
  }));
  const membershipDigests = Object.fromEntries(Object.entries(frozenQueues).map(([name, values]) => [
    name,
    hashTypedOrdinalList(values),
  ]));

  return Object.freeze({
    queues: Object.freeze(frozenQueues),
    counts: Object.freeze(Object.fromEntries(Object.entries(frozenQueues).map(([name, values]) => [name, values.length]))),
    membershipDigests: Object.freeze(membershipDigests),
    digest: sha256Text(stableStringify(membershipDigests)),
  });
}

export function buildVisibleOrder(filteredOrdinals, fixture, sort = []) {
  const values = Array.from(filteredOrdinals);
  values.sort((left, right) => {
    for (const rule of sort) {
      const direction = rule.direction === 'desc' ? -1 : 1;
      const delta = compareSortField(fixture, left, right, rule.fieldId);
      if (delta !== 0) return delta * direction;
    }
    return fixture.lines.targetIdByOrdinal[left].localeCompare(fixture.lines.targetIdByOrdinal[right]);
  });
  return new Uint32Array(values);
}


function normalizeSearchKey(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/gu, '');
}

function dominantLineStatus(fixture, ordinal) {
  let status = FIELD_STATUS.RESOLVED_EXACT;
  for (const fieldId of ENGINEERING_FIELDS) {
    const candidate = fixture.lines.engineeringColumns[fieldId].statuses[ordinal];
    if (candidate > status) status = candidate;
  }
  return status;
}

function compareSortField(fixture, left, right, fieldId) {
  if (fieldId === 'targetId') return fixture.lines.targetIdByOrdinal[left].localeCompare(fixture.lines.targetIdByOrdinal[right]);
  if (fieldId === 'normalizedLineKey') return fixture.lines.normalizedLineKeyByOrdinal[left].localeCompare(fixture.lines.normalizedLineKeyByOrdinal[right]);
  if (fieldId === 'serviceId') return fixture.lines.serviceIdByOrdinal[left] - fixture.lines.serviceIdByOrdinal[right];
  if (fieldId === 'ratingId') return fixture.lines.ratingIdByOrdinal[left] - fixture.lines.ratingIdByOrdinal[right];
  if (fieldId === 'classId') return fixture.lines.classIdByOrdinal[left] - fixture.lines.classIdByOrdinal[right];
  const column = fixture.lines.engineeringColumns[fieldId];
  if (!column) throw new RangeError(`Unknown sort field: ${fieldId}`);
  const leftValue = column.values[left];
  const rightValue = column.values[right];
  if (Number.isNaN(leftValue) && Number.isNaN(rightValue)) return 0;
  if (Number.isNaN(leftValue)) return 1;
  if (Number.isNaN(rightValue)) return -1;
  return leftValue - rightValue;
}


function hashGroups(groups) {
  const hash = createHash('sha256');
  for (const group of groups) {
    hash.update(group.groupId);
    hash.update(Buffer.from(group.lineOrdinals.buffer, group.lineOrdinals.byteOffset, group.lineOrdinals.byteLength));
    hash.update(Buffer.from(group.statusCounts.buffer, group.statusCounts.byteOffset, group.statusCounts.byteLength));
  }
  return hash.digest('hex');
}

