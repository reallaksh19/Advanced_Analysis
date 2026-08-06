import { getPipeDimensions } from '../../../core/geometry/pipeSchedules.js';

const FITTING_TYPE = /ELBO|BEND|FLAN|VALV|GASK|OLET|REDU|TEE|COUP|CAP|INST/;
const EXPLICIT_SCHEDULE_FIELDS = Object.freeze([
  'SCHEDULE', 'SCH', 'PIPE_SCHEDULE', 'PIPING_SCHEDULE', 'SCHEDULE_CODE',
]);
const TEXT_EVIDENCE_FIELDS = Object.freeze([
  'DTXR', 'DESP', 'DESC', 'DESCRIPTION', 'SDTE', 'SPRE', 'LSTU', 'ISPE', 'TSPE',
]);

export function buildBranchScheduleIndex(root) {
  const items = [];
  walkSource(root, ({ item, branchName, branchPath, sourcePath }) => {
    const attrs = item.attributes || item.engineeringProperties || {};
    const enriched = item.enrichedAttributes || {};
    const type = String(item.type || item.entityType || attrs.TYPE || enriched.componentType || '').toUpperCase();
    const sourceGlobalIndex = finiteOrNull(enriched.sourceGlobalIndex ?? attrs.sourceGlobalIndex);
    const position = firstPoint(attrs.POS, attrs.LPOS, attrs.APOS, item.position);
    const direct = extractScheduleEvidence(attrs);
    const record = {
      item,
      name: String(item.name || attrs.NAME || `${type}-${items.length + 1}`),
      type,
      branchName,
      branchPath: String(enriched.sourceBranchPath || attrs.sourceBranchPath || branchPath || branchName || 'ROOT'),
      sourcePath: String(enriched.sourcePath || attrs.sourcePath || sourcePath || ''),
      sourceGlobalIndex,
      position,
      directSchedule: direct.schedule,
      directScheduleRaw: direct.raw,
      directScheduleField: direct.field,
      nominalBoreMm: resolveNominalBoreMm(item),
    };
    items.push(record);
  });

  const candidatesByBranch = new Map();
  for (const record of items) {
    if (!FITTING_TYPE.test(record.type) || !record.directSchedule) continue;
    if (!candidatesByBranch.has(record.branchPath)) candidatesByBranch.set(record.branchPath, []);
    candidatesByBranch.get(record.branchPath).push(record);
  }
  for (const candidates of candidatesByBranch.values()) candidates.sort(compareEvidence);

  const resolutions = new Map();
  for (const record of items) {
    const resolution = resolveRecordSchedule(record, candidatesByBranch.get(record.branchPath) || []);
    resolutions.set(record, resolution);
  }

  return Object.freeze({
    items: Object.freeze(items),
    candidatesByBranch,
    resolutions,
    summary: summarizeScheduleResolutions(items, resolutions),
  });
}

export function resolveRecordSchedule(record, branchCandidates = []) {
  if (record.directSchedule) {
    return makeResolved(record, record, 'SOURCE_EXPLICIT_SCHEDULE');
  }

  const ranked = branchCandidates
    .map((candidate) => ({ candidate, rank: evidenceRank(record, candidate) }))
    .sort((a, b) => compareRank(a.rank, b.rank) || compareEvidence(a.candidate, b.candidate));

  if (ranked.length === 0) {
    const enrichedFallback = resolveEnrichedSchedule(record.item);
    if (enrichedFallback) {
      return makeResolved(record, {
        ...record,
        directSchedule: enrichedFallback.schedule,
        directScheduleRaw: enrichedFallback.raw,
        directScheduleField: enrichedFallback.field,
      }, 'ENRICHED_SELECTED_SCHEDULE');
    }
    return Object.freeze({
      status: 'BLOCKED_MISSING_SAME_BRANCH_FITTING_SCHEDULE',
      schedule: null,
      sourceName: null,
      sourceType: null,
      sourceBranchPath: record.branchPath,
      sourceGlobalIndex: null,
      sourcePosition: null,
      sourceRaw: null,
      sourceField: null,
      basis: 'NO_SAME_BRANCH_SCHEDULE_EVIDENCE',
      nominalBoreMm: record.nominalBoreMm,
      nps: null,
      outsideDiameterMm: null,
      wallThicknessMm: null,
      diagnostics: Object.freeze(['BRANCH_SCHEDULE_EVIDENCE_MISSING']),
    });
  }

  const bestRank = ranked[0].rank;
  const nearest = ranked.filter((entry) => compareRank(entry.rank, bestRank) === 0);
  const schedules = [...new Set(nearest.map((entry) => entry.candidate.directSchedule))];
  if (schedules.length > 1) {
    return Object.freeze({
      status: 'BLOCKED_CONFLICTING_NEAREST_FITTING_SCHEDULES',
      schedule: null,
      sourceName: null,
      sourceType: null,
      sourceBranchPath: record.branchPath,
      sourceGlobalIndex: null,
      sourcePosition: null,
      sourceRaw: nearest.map((entry) => entry.candidate.directScheduleRaw).join(' | '),
      sourceField: null,
      basis: 'NEAREST_SAME_BRANCH_FITTING_CONFLICT',
      nominalBoreMm: record.nominalBoreMm,
      nps: null,
      outsideDiameterMm: null,
      wallThicknessMm: null,
      diagnostics: Object.freeze(['BRANCH_SCHEDULE_NEAREST_CONFLICT']),
    });
  }

  return makeResolved(record, nearest[0].candidate, 'NEAREST_SAME_BRANCH_FITTING_DTXR');
}

export function extractScheduleEvidence(attrs = {}) {
  for (const field of EXPLICIT_SCHEDULE_FIELDS) {
    const value = attrs[field];
    const schedule = normalizeSchedule(value, true);
    if (schedule) return Object.freeze({ schedule, raw: String(value), field });
  }
  for (const field of TEXT_EVIDENCE_FIELDS) {
    const value = attrs[field];
    const schedule = normalizeSchedule(value, false);
    if (schedule) return Object.freeze({ schedule, raw: String(value), field });
  }
  for (const [field, value] of Object.entries(attrs)) {
    if (typeof value !== 'string') continue;
    const schedule = normalizeSchedule(value, false);
    if (schedule) return Object.freeze({ schedule, raw: value, field });
  }
  return Object.freeze({ schedule: null, raw: null, field: null });
}

export function normalizeSchedule(value, allowBare = false) {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return null;
  const explicit = text.match(/(?:SCH(?:EDULE)?\.?\s*[-:]?\s*)(STD|XS|XXS|\d{1,3}[A-Z]?)/i);
  if (explicit) return canonicalSchedule(explicit[1]);
  if (allowBare) {
    const bare = text.match(/^(STD|XS|XXS|\d{1,3}[A-Z]?)$/i);
    if (bare) return canonicalSchedule(bare[1]);
  }
  return null;
}

export function resolveNominalBoreMm(item = {}) {
  const attrs = item.attributes || item.engineeringProperties || {};
  const enriched = item.enrichedAttributes || {};
  const values = [
    enriched.nominalBoreMm,
    item._boreValue,
    item.bore,
    attrs.HBOR,
    attrs.TBOR,
    attrs.ABORE,
    attrs.LBORE,
  ];
  for (const value of values) {
    const parsed = engineeringNumber(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function walkSource(root, callback) {
  const roots = Array.isArray(root) ? root : [root];
  const visit = (item, parent) => {
    if (!item || typeof item !== 'object') return;
    const attrs = item.attributes || {};
    const enriched = item.enrichedAttributes || {};
    const type = String(item.type || item.entityType || attrs.TYPE || '').toUpperCase();
    const computedPath = parent.sourcePath ? `${parent.sourcePath}/${parent.childIndex}` : String(parent.childIndex);
    const sourcePath = String(enriched.sourcePath || attrs.sourcePath || computedPath);
    const branchName = type === 'BRANCH'
      ? String(item.name || attrs.NAME || parent.branchName || 'Main Branch')
      : parent.branchName;
    const branchPath = type === 'BRANCH'
      ? String(enriched.sourceBranchPath || attrs.sourceBranchPath || sourcePath)
      : String(enriched.sourceBranchPath || attrs.sourceBranchPath || parent.branchPath || 'ROOT');
    callback({ item, branchName, branchPath, sourcePath });
    if (Array.isArray(item.children)) {
      item.children.forEach((child, childIndex) => visit(child, {
        branchName,
        branchPath,
        sourcePath,
        childIndex,
      }));
    }
  };
  roots.forEach((item, childIndex) => visit(item, {
    branchName: 'Main Branch',
    branchPath: 'ROOT',
    sourcePath: '',
    childIndex,
  }));
}

function makeResolved(target, source, basis) {
  const dimensions = target.nominalBoreMm == null
    ? null
    : getPipeDimensions(target.nominalBoreMm, source.directSchedule);
  const valid = dimensions?.exact && Number.isFinite(dimensions.od) && Number.isFinite(dimensions.wt);
  return Object.freeze({
    status: valid ? 'RESOLVED_EXACT' : 'BLOCKED_PIPE_DIMENSION_LOOKUP',
    schedule: source.directSchedule,
    sourceName: source.name,
    sourceType: source.type,
    sourceBranchPath: source.branchPath,
    sourceGlobalIndex: source.sourceGlobalIndex,
    sourcePosition: source.position,
    sourceRaw: source.directScheduleRaw,
    sourceField: source.directScheduleField,
    basis,
    nominalBoreMm: target.nominalBoreMm,
    nps: dimensions?.nps ?? null,
    outsideDiameterMm: valid ? dimensions.od : null,
    wallThicknessMm: valid ? dimensions.wt : null,
    diagnostics: Object.freeze(valid ? [] : ['PIPE_DIMENSION_LOOKUP_BLOCKED']),
  });
}

function resolveEnrichedSchedule(item) {
  const enriched = item.enrichedAttributes || {};
  const selected = enriched.selectedSchedules || {};
  const provenance = enriched.selectedScheduleProvenance || {};
  for (const field of ['pipe', 'branch', 'component']) {
    const schedule = normalizeSchedule(selected[field], true);
    if (schedule) {
      return {
        schedule,
        raw: String(selected[field]),
        field: `enrichedAttributes.selectedSchedules.${field}:${provenance[field] || 'UNSPECIFIED'}`,
      };
    }
  }
  return null;
}

function evidenceRank(target, candidate) {
  const targetIndex = target.sourceGlobalIndex;
  const candidateIndex = candidate.sourceGlobalIndex;
  const indexDistance = Number.isFinite(targetIndex) && Number.isFinite(candidateIndex)
    ? Math.abs(targetIndex - candidateIndex)
    : Number.POSITIVE_INFINITY;
  const positionDistance = target.position && candidate.position
    ? Math.hypot(
      target.position.x - candidate.position.x,
      target.position.y - candidate.position.y,
      target.position.z - candidate.position.z,
    )
    : Number.POSITIVE_INFINITY;
  return [indexDistance, positionDistance];
}

function compareRank(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return 0;
}

function compareEvidence(a, b) {
  const ai = Number.isFinite(a.sourceGlobalIndex) ? a.sourceGlobalIndex : Number.MAX_SAFE_INTEGER;
  const bi = Number.isFinite(b.sourceGlobalIndex) ? b.sourceGlobalIndex : Number.MAX_SAFE_INTEGER;
  return ai - bi || a.name.localeCompare(b.name) || a.type.localeCompare(b.type);
}

function summarizeScheduleResolutions(items, resolutions) {
  const statuses = {};
  const schedules = {};
  const branchSchedules = {};
  for (const item of items) {
    const row = resolutions.get(item);
    statuses[row.status] = (statuses[row.status] || 0) + 1;
    if (row.schedule) schedules[row.schedule] = (schedules[row.schedule] || 0) + 1;
    if (row.schedule) {
      if (!branchSchedules[item.branchPath]) branchSchedules[item.branchPath] = new Set();
      branchSchedules[item.branchPath].add(row.schedule);
    }
  }
  return Object.freeze({
    recordCount: items.length,
    statusCounts: Object.freeze(statuses),
    scheduleCounts: Object.freeze(schedules),
    branchSchedules: Object.freeze(Object.fromEntries(
      Object.entries(branchSchedules).map(([key, value]) => [key, Object.freeze([...value].sort())]),
    )),
  });
}

function canonicalSchedule(value) {
  return String(value).trim().toUpperCase().replace(/^SCH(?:EDULE)?\.?\s*/i, '');
}

function engineeringNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value ?? '').match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstPoint(...values) {
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if ([x, y, z].every(Number.isFinite)) return Object.freeze({ x, y, z });
  }
  return null;
}
