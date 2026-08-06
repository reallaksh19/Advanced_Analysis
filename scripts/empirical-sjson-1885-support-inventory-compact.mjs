import { readFile, writeFile } from 'node:fs/promises';

const [enrichedPath, xmlPath, outputPath = '/tmp/sjson-1885-support-inventory-compact.json'] = process.argv.slice(2);
if (!enrichedPath || !xmlPath) throw new Error('Expected EnrichedSjson and topology XML paths.');
const enriched = JSON.parse((await readFile(enrichedPath, 'utf8')).replace(/^\uFEFF/u, ''));
const xml = await readFile(xmlPath, 'utf8');
const toleranceMm = 2;

const records = [];
let order = 0;
function visit(value, branch = '') {
  if (Array.isArray(value)) { for (const item of value) visit(item, branch); return; }
  if (!value || typeof value !== 'object') return;
  const attrs = value.attributes || {};
  const nextBranch = String(value.type || '').toUpperCase() === 'BRANCH'
    ? String(value.name || attrs.NAME || branch)
    : branch;
  const looksSupport = Boolean(attrs.SUPPORT_TAG)
    || String(value.type || attrs.TYPE || '').toUpperCase() === 'SUPPORT'
    || /^SUPPORT\s+/i.test(String(value.name || ''));
  if (looksSupport) {
    const coordinate = firstPoint(attrs.LPOS, attrs.POS, attrs.APOS, attrs.HPOS, attrs.TPOS);
    const fields = {
      SUPPORT_KIND: attrs.SUPPORT_KIND ?? null,
      SUPPORT_TYPE: attrs.SUPPORT_TYPE ?? null,
      SUPPORT_MAPPER_KIND: attrs.SUPPORT_MAPPER_KIND ?? null,
      CMPSUPTYPE: attrs.CMPSUPTYPE ?? null,
      TYPE: attrs.TYPE ?? null,
      STYP: attrs.STYP ?? null,
      RESTRAINT_TYPE: attrs.RESTRAINT_TYPE ?? null,
    };
    const candidates = Object.values(fields).filter((v) => v != null && String(v).trim()).map((v) => String(v).trim().toUpperCase());
    const capability = normalizeCapability(candidates);
    const rawTag = attrs.SUPPORT_TAG || attrs.NAME || value.name || `UNNAMED-${order}`;
    records.push({
      order: order++,
      name: value.name || '',
      branch: nextBranch,
      rawTag,
      baseTag: baseTag(rawTag),
      coordinate,
      fields,
      candidates,
      capability,
    });
  }
  if (Array.isArray(value.children)) visit(value.children, nextBranch);
}
visit(enriched);

const allSites = consolidate(records, false);
const recognizedSites = consolidate(records.filter((r) => r.capability), true);

const xmlRestraints = [];
const restraintPattern = /<RESTRAINT\b([^>]*)\/>/g;
let match;
while ((match = restraintPattern.exec(xml))) {
  const attrs = parseAttrs(match[1]);
  xmlRestraints.push({
    id: attrs.ID || '',
    supportId: attrs.SUPPORT_ID || '',
    tag: baseTag(attrs.TAG || attrs.SUPPORT_ID || ''),
    node: attrs.NODE || '',
    type: Number(attrs.TYPE),
    coordinate: point(Number(attrs.SOURCE_X), Number(attrs.SOURCE_Y), Number(attrs.SOURCE_Z)),
  });
}
const xmlSites = consolidateXml(xmlRestraints);

const omittedParentSites = allSites.filter((site) => !recognizedSites.some((other) => sameSite(site, other)));
const xmlOnlySites = xmlSites.filter((site) => !allSites.some((other) => sameCoordinate(site.coordinate, other.coordinate)));
const recognizedMissingFromXml = recognizedSites.filter((site) => !xmlSites.some((other) => sameCoordinate(site.coordinate, other.coordinate)));
const xmlMissingFromRecognized = xmlSites.filter((site) => !recognizedSites.some((other) => sameCoordinate(site.coordinate, other.coordinate)));

const report = {
  rawParentSupportRecordCount: records.length,
  parentAllSiteCount: allSites.length,
  parentRecognizedSiteCount: recognizedSites.length,
  xmlRestraintCount: xmlRestraints.length,
  xmlSiteCount: xmlSites.length,
  capabilityCandidateCounts: countBy(records, (r) => r.candidates.join('|') || '<BLANK>'),
  normalizedCapabilityCounts: countBy(records, (r) => r.capability || '<UNRECOGNIZED>'),
  omittedParentSites,
  xmlOnlySites,
  recognizedMissingFromXml,
  xmlMissingFromRecognized,
  allParentSites: allSites,
  recognizedParentSites: recognizedSites,
  xmlSites,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  rawParentSupportRecordCount: report.rawParentSupportRecordCount,
  parentAllSiteCount: report.parentAllSiteCount,
  parentRecognizedSiteCount: report.parentRecognizedSiteCount,
  xmlRestraintCount: report.xmlRestraintCount,
  xmlSiteCount: report.xmlSiteCount,
  omittedParentSiteCount: omittedParentSites.length,
  xmlOnlySiteCount: xmlOnlySites.length,
  xmlMissingFromRecognizedCount: xmlMissingFromRecognized.length,
}, null, 2));

function normalizeCapability(candidates) {
  for (const value of candidates) {
    if (/LINE\s*STOP|LINESTOP|LIMIT|LONGITUDINAL/.test(value)) return 'LINESTOP';
    if (/GUIDE|LATERAL/.test(value)) return 'GUIDE';
    if (/\+?Z|\+?Y|REST|SUPPORT|SHOE|VERTICAL/.test(value)) return 'REST';
  }
  return null;
}
function consolidate(rows, recognizedOnly) {
  const sites = [];
  for (const row of rows) {
    if (!row.coordinate) continue;
    let site = sites.find((s) => s.baseTag === row.baseTag && sameCoordinate(s.coordinate, row.coordinate));
    if (!site) {
      site = { baseTag: row.baseTag, coordinate: row.coordinate, capabilities: [], records: [] };
      sites.push(site);
    }
    if (row.capability && !site.capabilities.includes(row.capability)) site.capabilities.push(row.capability);
    site.records.push({ name: row.name, branch: row.branch, fields: row.fields, candidates: row.candidates, capability: row.capability });
  }
  return sites.map((s) => ({ ...s, capabilities: s.capabilities.sort(), recognizedOnly })).sort(sortSite);
}
function consolidateXml(rows) {
  const sites = [];
  for (const row of rows) {
    let site = sites.find((s) => s.tag === row.tag && sameCoordinate(s.coordinate, row.coordinate));
    if (!site) { site = { tag: row.tag, baseTag: row.tag, coordinate: row.coordinate, types: [], nodes: [], supportIds: [] }; sites.push(site); }
    if (!site.types.includes(row.type)) site.types.push(row.type);
    if (!site.nodes.includes(row.node)) site.nodes.push(row.node);
    if (!site.supportIds.includes(row.supportId)) site.supportIds.push(row.supportId);
  }
  return sites.sort(sortSite);
}
function baseTag(value) { return String(value || '').replace(/^SUPPORT\s+/i, '').replace(/\/SREF.*$/i, '').trim(); }
function firstPoint(...values) { return values.find((v) => v && [v.x,v.y,v.z].every((n) => Number.isFinite(Number(n)))) ? point(Number(values.find((v) => v && [v.x,v.y,v.z].every((n) => Number.isFinite(Number(n)))).x), Number(values.find((v) => v && [v.x,v.y,v.z].every((n) => Number.isFinite(Number(n)))).y), Number(values.find((v) => v && [v.x,v.y,v.z].every((n) => Number.isFinite(Number(n)))).z)) : null; }
function point(x,y,z) { return { x,y,z }; }
function sameCoordinate(a,b) { return distance(a,b) <= toleranceMm; }
function sameSite(a,b) { return a.baseTag === b.baseTag && sameCoordinate(a.coordinate,b.coordinate); }
function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z); }
function sortSite(a,b) { return a.coordinate.x-b.coordinate.x || a.coordinate.y-b.coordinate.y || a.coordinate.z-b.coordinate.z || String(a.baseTag).localeCompare(String(b.baseTag)); }
function countBy(rows,keyOf) { const out={}; for(const row of rows){const key=String(keyOf(row));out[key]=(out[key]||0)+1;} return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b))); }
function parseAttrs(text) { const attrs={}; const re=/([A-Za-z0-9_:.-]+)="([^"]*)"/g; let m; while((m=re.exec(text))) attrs[m[1]]=m[2].replace(/&quot;/g,'"').replace(/&amp;/g,'&'); return attrs; }
