import { readFile } from 'node:fs/promises';

const [enrichedPath, xmlPath] = process.argv.slice(2);
if (!enrichedPath || !xmlPath) throw new Error('Expected EnrichedSjson and topology XML paths.');
const enriched = JSON.parse((await readFile(enrichedPath, 'utf8')).replace(/^\uFEFF/u, ''));
const xml = await readFile(xmlPath, 'utf8');

const records = [];
let order = 0;
function visit(value, branch = '') {
  if (Array.isArray(value)) { for (const item of value) visit(item, branch); return; }
  if (!value || typeof value !== 'object') return;
  const attrs = value.attributes || {};
  const nextBranch = String(value.type || '').toUpperCase() === 'BRANCH'
    ? String(value.name || attrs.NAME || branch)
    : branch;
  const tagRaw = attrs.SUPPORT_TAG || '';
  if (tagRaw) {
    const point = [attrs.LPOS, attrs.POS, attrs.APOS].find((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) && Number.isFinite(Number(p.z)));
    const rawCapability = String(attrs.SUPPORT_KIND || attrs.SUPPORT_TYPE || attrs.SUPPORT_MAPPER_KIND || attrs.CMPSUPTYPE || '').toUpperCase();
    records.push({
      order: order++,
      name: value.name || '',
      type: value.type || '',
      branch: nextBranch,
      tagRaw,
      baseTag: String(tagRaw).replace(/\/SREF.*$/i, '').trim(),
      SUPPORT_KIND: attrs.SUPPORT_KIND ?? null,
      SUPPORT_TYPE: attrs.SUPPORT_TYPE ?? null,
      SUPPORT_MAPPER_KIND: attrs.SUPPORT_MAPPER_KIND ?? null,
      CMPSUPTYPE: attrs.CMPSUPTYPE ?? null,
      rawCapability,
      coordinate: point ? { x: Number(point.x), y: Number(point.y), z: Number(point.z) } : null,
    });
  }
  if (Array.isArray(value.children)) visit(value.children, nextBranch);
}
visit(enriched);

const capabilityCounts = countBy(records, (r) => r.rawCapability || '<BLANK>');
const tagCounts = countBy(records, (r) => r.baseTag || '<BLANK>');
const byTag = [...groupBy(records, (r) => r.baseTag).entries()].map(([tag, rows]) => ({
  tag,
  recordCount: rows.length,
  capabilities: [...new Set(rows.map((r) => r.rawCapability || '<BLANK>'))].sort(),
  coordinates: uniquePoints(rows.map((r) => r.coordinate).filter(Boolean), 2),
  examples: rows.slice(0, 4),
})).sort((a, b) => a.tag.localeCompare(b.tag));

const xmlRestraints = [];
const pattern = /<RESTRAINT\b([^>]*)\/>/g;
let match;
while ((match = pattern.exec(xml))) {
  const attrs = parseAttrs(match[1]);
  xmlRestraints.push({
    tag: String(attrs.TAG || '').replace(/\/SREF.*$/i, '').trim(),
    supportId: attrs.SUPPORT_ID,
    type: Number(attrs.TYPE),
    node: attrs.NODE,
    coordinate: { x: Number(attrs.SOURCE_X), y: Number(attrs.SOURCE_Y), z: Number(attrs.SOURCE_Z) },
  });
}
const xmlBySite = uniqueXmlSites(xmlRestraints, 2);

console.log('SJSON_1885_SUPPORT_INVENTORY_BEGIN');
console.log(JSON.stringify({
  rawSupportTagRecordCount: records.length,
  capabilityCounts,
  uniqueBaseTagCount: Object.keys(tagCounts).length,
  byTag,
  xmlRestraintCount: xmlRestraints.length,
  xmlUniqueSiteCount: xmlBySite.length,
  xmlBySite,
}, null, 2));
console.log('SJSON_1885_SUPPORT_INVENTORY_END');

function countBy(rows, keyOf) { const out = {}; for (const row of rows) { const key = String(keyOf(row)); out[key] = (out[key] || 0) + 1; } return out; }
function groupBy(rows, keyOf) { const out = new Map(); for (const row of rows) { const key = keyOf(row); if (!out.has(key)) out.set(key, []); out.get(key).push(row); } return out; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function uniquePoints(points, tolerance) { const out = []; for (const point of points) if (!out.some((p) => distance(p, point) <= tolerance)) out.push(point); return out; }
function uniqueXmlSites(rows, tolerance) { const out = []; for (const row of rows) { let site = out.find((s) => s.tag === row.tag && distance(s.coordinate, row.coordinate) <= tolerance); if (!site) { site = { tag: row.tag, coordinate: row.coordinate, types: [], nodes: [], supportIds: [] }; out.push(site); } site.types.push(row.type); site.nodes.push(row.node); site.supportIds.push(row.supportId); } return out.sort((a,b) => a.tag.localeCompare(b.tag) || a.coordinate.x-b.coordinate.x || a.coordinate.y-b.coordinate.y); }
function parseAttrs(text) { const attrs = {}; const re = /([A-Za-z0-9_:.-]+)="([^"]*)"/g; let m; while ((m = re.exec(text))) attrs[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&'); return attrs; }
