/**
 * Crosswalks topology PIPINGELEMENT rows to enriched source records using the
 * same deterministic name/type/position logic as the audited 1885 node/POS trace.
 */
export function buildTopologyPositionTargets(xmlText, scheduleIndex) {
  const sourceIndex = buildSourceIndex(scheduleIndex.items);
  return parseTopologyElements(xmlText).map((edge, index) => {
    const record = resolveSourceRecord(edge, sourceIndex);
    return Object.freeze({
      positionRef: `POS-${String(index + 1).padStart(3, '0')}`,
      edge,
      record,
      scheduleEvidence: record ? scheduleIndex.resolutions.get(record) : null,
    });
  });
}

export function buildSourceRecordTargets(scheduleIndex, predicate) {
  return scheduleIndex.items.filter(predicate).map((record, index) => Object.freeze({
    positionRef: `SOURCE-${String(index + 1).padStart(3, '0')}`,
    edge: null,
    record,
    scheduleEvidence: scheduleIndex.resolutions.get(record),
  }));
}

function buildSourceIndex(records) {
  const byName = new Map();
  const byBranch = new Map();
  for (const record of records) {
    for (const key of nameKeys(record.name, record.item?.attributes?.NAME)) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(record);
    }
    if (!byBranch.has(record.branchPath)) byBranch.set(record.branchPath, []);
    byBranch.get(record.branchPath).push(record);
  }
  return { byName, byBranch };
}

function resolveSourceRecord(edge, index) {
  const candidates = [];
  for (const key of nameKeys(edge.name)) {
    for (const record of index.byName.get(key) || []) {
      if (!candidates.includes(record)) candidates.push(record);
    }
  }
  if (candidates.length === 1) return candidates[0];
  const typed = candidates.filter((record) => typeCompatible(edge.sourceType, record.type));
  const pool = typed.length ? typed : candidates;
  if (pool.length) return nearest(edge, pool);

  const lineCandidates = [];
  for (const records of index.byBranch.values()) {
    for (const record of records) {
      if (!typeCompatible(edge.sourceType, record.type)) continue;
      if (record.branchName && edge.lineId && record.branchName.includes(edge.lineId)) {
        lineCandidates.push(record);
      }
    }
  }
  return lineCandidates.length ? nearest(edge, lineCandidates) : null;
}

function nearest(edge, records) {
  return [...records].sort((a, b) => distanceToEdge(a.position, edge) - distanceToEdge(b.position, edge)
    || (a.sourceGlobalIndex ?? Number.MAX_SAFE_INTEGER) - (b.sourceGlobalIndex ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name))[0];
}

function distanceToEdge(position, edge) {
  if (!position) return Number.POSITIVE_INFINITY;
  return Math.min(distance(position, edge.from), distance(position, edge.to));
}

function parseTopologyElements(text) {
  const pattern = /<PIPINGELEMENT\b([^>]*)>[\s\S]*?<\/PIPINGELEMENT>/g;
  const edges = [];
  let match;
  while ((match = pattern.exec(text))) {
    const attrs = parseAttrs(match[1]);
    edges.push(Object.freeze({
      id: attrs.ID,
      fromNode: cleanNode(attrs.FROM_NODE),
      toNode: cleanNode(attrs.TO_NODE),
      from: point(attrs, 'FROM'),
      to: point(attrs, 'TO'),
      name: decodeXml(attrs.NAME || ''),
      lineId: decodeXml(attrs.LINE_ID || ''),
      sourceType: String(attrs.SOURCE_TYPE || 'PIPE').toUpperCase(),
      outsideDiameterMm: finiteOrNull(attrs.DIAMETER),
      wallThicknessMm: finiteOrNull(attrs.WALL_THICK),
      corrosionAllowanceMm: finiteOrNull(attrs.CORR_ALLOW),
    }));
  }
  return Object.freeze(edges);
}

function parseAttrs(text) {
  const attrs = {};
  const pattern = /([A-Za-z0-9_:.-]+)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(text))) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}

function point(attrs, prefix) {
  return Object.freeze({
    x: number(attrs[`${prefix}_GLOBAL_X`]),
    y: number(attrs[`${prefix}_GLOBAL_Y`]),
    z: number(attrs[`${prefix}_GLOBAL_Z`]),
  });
}

function nameKeys(...values) {
  return [...new Set(values.filter(Boolean)
    .flatMap((value) => [String(value), String(value).replace(/^[A-Z]+\s+/i, '')])
    .map((value) => value.trim().toUpperCase()))];
}

function typeCompatible(a, b) {
  const left = String(a || '').slice(0, 4);
  const right = String(b || '').slice(0, 4);
  return left === right || (left === 'PIPE' && right === 'BRAN');
}

function decodeXml(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function cleanNode(value) { return String(Math.round(number(value))); }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function finiteOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
