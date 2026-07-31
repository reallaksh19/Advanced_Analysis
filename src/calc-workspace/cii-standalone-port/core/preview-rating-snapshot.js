import { extractXmlCiiRatingFromDtxr } from './dtxr-rating-resolver.js';

export const XML_CII_PREVIEW_RATING_SNAPSHOT_SCHEMA = 'xml-cii-preview-rating-snapshot/v1';
export const XML_CII_PREVIEW_RATING_SNAPSHOT_KEY = 'xml-cii-preview-rating-snapshot-v1';
export const XML_CII_PREVIEW_CACHE_ENVELOPE_KEY = 'xml-cii-pv-cache-v8-rating-policy';
export const XML_CII_PREVIEW_CACHE_BRIDGE_KEY = 'xml-cii-pv-cache-v8-dtxr';
export const XML_CII_LEGACY_PREVIEW_CACHE_KEY = 'xml-cii-pv-cache-v2';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeRecord(row, sequence) {
  const branchName = text(row?.branchName);
  const lineKey = text(row?.lineKey);
  const rating = text(row?.rating);
  if (!branchName && !lineKey) return null;
  return {
    sequence,
    branchName,
    lineKey,
    rating,
    ratingSource: text(row?.ratingSource || row?.ratingResolvedSource),
  };
}

function revisionFor(records) {
  let hash = 2166136261;
  const source = records
    .map((record) => `${record.branchName}\u0000${record.lineKey}\u0000${record.rating}\u0000${record.ratingSource}`)
    .join('\u0001');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `r${records.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildXmlCiiPreviewRatingSnapshot(branchRows = [], metadata = {}) {
  const records = (Array.isArray(branchRows) ? branchRows : [])
    .map((row, index) => normalizeRecord(row, index))
    .filter(Boolean);
  return {
    schema: XML_CII_PREVIEW_RATING_SNAPSHOT_SCHEMA,
    revision: revisionFor(records),
    authorityDigest: text(metadata.authorityDigest),
    updatedAt: text(metadata.updatedAt) || new Date().toISOString(),
    records,
  };
}

function parseStored(value) {
  const parsed = safeObject(value);
  if (parsed.schema !== XML_CII_PREVIEW_RATING_SNAPSHOT_SCHEMA || !Array.isArray(parsed.records)) return null;
  return buildXmlCiiPreviewRatingSnapshot(parsed.records, {
    authorityDigest: parsed.authorityDigest,
    updatedAt: parsed.updatedAt,
  });
}

function readJsonStorage(key) {
  if (typeof localStorage === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

function snapshotFromPayload(payload, authorityDigest) {
  const rows = payload?.data?.branchRows;
  return Array.isArray(rows)
    ? buildXmlCiiPreviewRatingSnapshot(rows, { authorityDigest })
    : null;
}

function deterministicEnvelopeSnapshot() {
  const envelope = readJsonStorage(XML_CII_PREVIEW_CACHE_ENVELOPE_KEY);
  return snapshotFromPayload(
    envelope?.legacyPayload,
    text(envelope?.authority?.digest) || 'preview-cache-v8-envelope',
  );
}

function bridgeSnapshot() {
  return snapshotFromPayload(
    readJsonStorage(XML_CII_PREVIEW_CACHE_BRIDGE_KEY),
    'preview-cache-v8-bridge',
  );
}

function legacySnapshot() {
  return snapshotFromPayload(
    readJsonStorage(XML_CII_LEGACY_PREVIEW_CACHE_KEY),
    'legacy-preview-cache',
  );
}

export function publishXmlCiiPreviewRatingSnapshot(branchRows = [], metadata = {}) {
  const snapshot = buildXmlCiiPreviewRatingSnapshot(branchRows, metadata);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(XML_CII_PREVIEW_RATING_SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch {}
  }
  return snapshot;
}

export function clearXmlCiiPreviewRatingSnapshot() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(XML_CII_PREVIEW_RATING_SNAPSHOT_KEY); } catch {}
}

export function readXmlCiiPreviewRatingSnapshot() {
  return parseStored(readJsonStorage(XML_CII_PREVIEW_RATING_SNAPSHOT_KEY))
    || deterministicEnvelopeSnapshot()
    || bridgeSnapshot()
    || legacySnapshot()
    || buildXmlCiiPreviewRatingSnapshot([]);
}

export function resolveXmlCiiPreviewRating(row = {}, snapshot = readXmlCiiPreviewRatingSnapshot()) {
  const branchName = text(row?.branchName);
  const lineKey = text(row?.lineKey);
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];
  if (branchName) {
    const exact = records.find((record) => record.branchName === branchName);
    if (exact) return { rating: exact.rating, source: 'preview-branch', record: exact, snapshotRevision: snapshot.revision || '' };
  }
  if (lineKey) {
    const matches = records.filter((record) => record.lineKey === lineKey);
    const ratings = [...new Set(matches.map((record) => text(record.rating)).filter(Boolean))];
    if (ratings.length === 1) {
      return { rating: ratings[0], source: 'preview-line-key-unambiguous', record: matches[0] || null, snapshotRevision: snapshot.revision || '' };
    }
  }
  return { rating: '', source: 'preview-rating-missing', record: null, snapshotRevision: snapshot?.revision || '' };
}

export function resolveXmlCiiWeightMatchRating(row = {}, { mode = 'preview', snapshot } = {}) {
  const dtxrRating = extractXmlCiiRatingFromDtxr(row?.dtxr);
  if (mode === 'dtxr') {
    return {
      rating: dtxrRating,
      source: dtxrRating ? 'weight-match-dtxr-explicit' : 'weight-match-dtxr-missing',
      dtxrRating,
      mode: 'dtxr',
      snapshotRevision: snapshot?.revision || '',
    };
  }
  const preview = resolveXmlCiiPreviewRating(row, snapshot || readXmlCiiPreviewRatingSnapshot());
  return {
    ...preview,
    dtxrRating,
    mode: 'preview',
  };
}
