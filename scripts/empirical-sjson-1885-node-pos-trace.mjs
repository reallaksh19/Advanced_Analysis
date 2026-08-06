import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runStandaloneResolverJsonTrace } from '../src/calc-workspace/cii-standalone-port/xml-cii-resolver-json-trace.js';
import { buildBranchScheduleIndex } from '../src/calc-workspace/cii-standalone-port/core/branch-schedule-resolution.js';

const [profilePath, enrichedPath, xmlPath, jsonOutputPath, csvOutputPath] = process.argv.slice(2);
if (!profilePath || !enrichedPath || !xmlPath || !jsonOutputPath || !csvOutputPath) {
  throw new Error('Usage: node empirical-sjson-1885-node-pos-trace.mjs <profile.json> <EnrichedSjson> <topology.xml> <output.json> <output.csv>');
}

const profileText = await readFile(profilePath, 'utf8');
const enrichedText = await readFile(enrichedPath, 'utf8');
const xmlText = await readFile(xmlPath, 'utf8');
const profile = JSON.parse(profileText);
const enriched = JSON.parse(enrichedText.replace(/^\uFEFF/u, ''));

// Preserve the repository's existing branch/POS JSON trace as the upstream custody path.
const upstreamTrace = runStandaloneResolverJsonTrace({ stagedJsonText: enrichedText });
const scheduleIndex = buildBranchScheduleIndex(enriched);
const sourceIndex = buildSourceIndex(scheduleIndex);
const model = parseInputXml(xmlText);
resolveFluidDensity(model, profile);

const rows = model.edges.map((edge, edgeIndex) => buildRow({
  edge,
  edgeIndex,
  sourceIndex,
  scheduleIndex,
  profile,
}));

const unresolved = rows.filter((row) => row.scheduleResolutionStatus !== 'RESOLVED_EXACT');
const exactSch80 = rows.filter((row) => row.nominalBoreMm === 150 && row.schedule === '80');
const legacySch40Rate = rows.filter((row) => Math.abs((row.kgPerM?.metal || 0) - 28.263584) < 0.00001);

const report = {
  schema: 'empirical-sjson-node-position-property-trace/v1',
  status: unresolved.length === 0 ? 'RESOLVED_EXACT' : 'BLOCKED_PARTIAL_RESOLUTION',
  source: {
    commit: profile.source.commit,
    enrichedSjsonPath: profile.source.enrichedSjsonPath,
    topologyInputXmlPath: profile.source.topologyInputXmlPath,
    hashes: {
      profileSha256: sha256(profileText),
      enrichedSjsonSha256: sha256(enrichedText),
      topologyInputXmlSha256: sha256(xmlText),
    },
  },
  traceAuthority: {
    upstreamFunction: 'runStandaloneResolverJsonTrace',
    upstreamNodeWiseRowCount: upstreamTrace.nodeWiseRows.length,
    upstreamTraceRowCount: upstreamTrace.traceRows.length,
    propertyResolution: 'NEAREST_SAME_BRANCH_FITTING_DTXR_THEN_ASME_B36_10',
    genericScheduleFallbackPermitted: false,
  },
  summary: {
    topologyElementCount: model.edges.length,
    topologyNodeCount: model.nodes.size,
    sourceRecordCount: scheduleIndex.items.length,
    resolvedRowCount: rows.length - unresolved.length,
    unresolvedRowCount: unresolved.length,
    sch80Dn150RowCount: exactSch80.length,
    legacySch40MetalRateRowCount: legacySch40Rate.length,
    scheduleStatusCounts: countBy(rows, (row) => row.scheduleResolutionStatus),
    scheduleCounts: countBy(rows.filter((row) => row.schedule), (row) => row.schedule),
    sourceTypeCounts: countBy(rows, (row) => row.sourceType),
    branchScheduleSummary: scheduleIndex.summary.branchSchedules,
  },
  rows,
};

await writeFile(jsonOutputPath, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(csvOutputPath, toCsv(rows));

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  firstSch80Rows: exactSch80.slice(0, 8).map((row) => ({
    positionRef: row.positionRef,
    fromNode: row.fromNode,
    toNode: row.toNode,
    component: row.componentName,
    branchPath: row.sourceBranchPath,
    schedule: row.schedule,
    wallThicknessMm: row.wallThicknessMm,
    metalKgPerM: row.kgPerM.metal,
    scheduleSource: row.scheduleSourceName,
  })),
}, null, 2));

if (unresolved.length > 0) {
  throw new Error(`Node/POS trace has ${unresolved.length} unresolved schedule rows; first: ${unresolved.slice(0, 5).map((row) => `${row.positionRef}:${row.componentName}`).join(', ')}`);
}
if (exactSch80.length === 0) throw new Error('Expected at least one DN150/SCH80 row from same-branch fitting evidence.');
if (legacySch40Rate.length > 0) throw new Error(`Legacy 28.263584 kg/m Sch40 metal rate remains on ${legacySch40Rate.length} rows.`);

function buildSourceIndex(scheduleIndex) {
  const byName = new Map();
  const byBranch = new Map();
  for (const record of scheduleIndex.items) {
    for (const key of nameKeys(record.name, record.item?.attributes?.NAME)) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(record);
    }
    if (!byBranch.has(record.branchPath)) byBranch.set(record.branchPath, []);
    byBranch.get(record.branchPath).push(record);
  }
  return { byName, byBranch };
}

function buildRow({ edge, edgeIndex, sourceIndex, scheduleIndex, profile }) {
  const source = resolveSourceRecord(edge, sourceIndex);
  const resolution = source ? scheduleIndex.resolutions.get(source) : null;
  const valid = resolution?.status === 'RESOLVED_EXACT';
  const odMm = valid ? resolution.outsideDiameterMm : null;
  const wallMm = valid ? resolution.wallThicknessMm : null;
  const section = valid ? sectionProperties(odMm, wallMm) : null;
  const density = source?.item?.enrichedAttributes?.materialDensityKgM3
    || profile.weight.pipeMetalDensityKgM3;
  const insulationThicknessMm = resolveInsulationThicknessMm(source);
  const insulationAreaM2 = section
    ? Math.PI / 4 * (((odMm + 2 * insulationThicknessMm) / 1000) ** 2 - (odMm / 1000) ** 2)
    : 0;
  const metalKgPerM = section ? section.areaM2 * density : null;
  const fluidKgPerM = section ? section.fluidAreaM2 * edge.fluidDensityKgM3 : null;
  const insulationKgPerM = section ? insulationAreaM2 * profile.weight.insulationDensityKgM3 : null;
  const sourceRigidKg = resolveSourceRigidMassKg(source);
  const isGasket = edge.sourceType === 'GASK';
  const sourceWeightUsed = ['FLAN', 'VALV', 'INST'].includes(edge.sourceType) && sourceRigidKg > 0;
  const pipeEquivalentFactor = Number(profile.weight.pipeEquivalentMassFactorByType?.[edge.sourceType] ?? 1);
  const metalKg = isGasket
    ? Number(profile.weight.gasketMassKgPerComponent || 0)
    : (sourceWeightUsed ? sourceRigidKg : pipeEquivalentFactor * metalKgPerM * edge.lengthM);
  const fluidKg = isGasket ? 0 : fluidKgPerM * edge.lengthM;
  const insulationKg = isGasket ? 0 : insulationKgPerM * edge.lengthM;
  const totalKg = metalKg + fluidKg + insulationKg;
  const treatment = isGasket
    ? 'GASKET_ZERO'
    : (sourceWeightUsed ? `${edge.sourceType}_SOURCE_WEIGHT` : `${edge.sourceType}_PIPE_EQUIVALENT`);
  const storedWallMm = source?.item?.enrichedAttributes?.wallThicknessMm ?? edge.wallMm;

  return {
    positionRef: `POS-${String(edgeIndex + 1).padStart(3, '0')}`,
    edgeId: edge.id,
    fromNode: edge.fromNode,
    toNode: edge.toNode,
    fromPositionMm: edge.from,
    toPositionMm: edge.to,
    lengthM: round(edge.lengthM, 9),
    componentName: edge.name,
    sourceType: edge.sourceType,
    lineId: edge.lineId,
    sourceBranchName: source?.branchName || null,
    sourceBranchPath: source?.branchPath || null,
    sourceGlobalIndex: source?.sourceGlobalIndex ?? null,
    sourceRecordName: source?.name || null,
    sourceRecordMatched: Boolean(source),
    nominalBoreMm: resolution?.nominalBoreMm ?? source?.nominalBoreMm ?? null,
    nps: resolution?.nps ?? null,
    schedule: resolution?.schedule ?? null,
    scheduleResolutionStatus: resolution?.status || 'BLOCKED_SOURCE_RECORD_UNMATCHED',
    scheduleResolutionBasis: resolution?.basis || 'SOURCE_RECORD_UNMATCHED',
    scheduleSourceName: resolution?.sourceName ?? null,
    scheduleSourceType: resolution?.sourceType ?? null,
    scheduleSourceBranchPath: resolution?.sourceBranchPath ?? null,
    scheduleSourceGlobalIndex: resolution?.sourceGlobalIndex ?? null,
    scheduleSourceField: resolution?.sourceField ?? null,
    scheduleSourceRaw: resolution?.sourceRaw ?? null,
    outsideDiameterMm: odMm,
    wallThicknessMm: wallMm,
    storedEnrichedOrXmlWallMm: finiteOrNull(storedWallMm),
    wallCorrectedFromStoredValue: valid && Number.isFinite(Number(storedWallMm))
      ? Math.abs(Number(storedWallMm) - wallMm) > 1e-9
      : null,
    corrosionAllowanceMm: edge.corrosionAllowanceMm,
    insideDiameterMm: section ? round(section.idM * 1000, 9) : null,
    materialDensityKgM3: density,
    fluidDensityKgM3: edge.fluidDensityKgM3,
    insulationThicknessMm,
    insulationDensityKgM3: profile.weight.insulationDensityKgM3,
    kgPerM: {
      metal: nullableRound(metalKgPerM, 9),
      fluid: nullableRound(fluidKgPerM, 9),
      insulation: nullableRound(insulationKgPerM, 9),
      total: nullableRound(valid ? metalKgPerM + fluidKgPerM + insulationKgPerM : null, 9),
    },
    kg: {
      metal: nullableRound(metalKg, 9),
      fluid: nullableRound(fluidKg, 9),
      insulation: nullableRound(insulationKg, 9),
      rigidSource: round(sourceRigidKg, 9),
      total: nullableRound(totalKg, 9),
    },
    verticalWeightKn: nullableRound(totalKg * profile.weight.gravityMPerS2 / 1000, 9),
    weightTreatment: treatment,
  };
}

function resolveSourceRecord(edge, sourceIndex) {
  const candidates = [];
  for (const key of nameKeys(edge.name)) {
    for (const record of sourceIndex.byName.get(key) || []) if (!candidates.includes(record)) candidates.push(record);
  }
  if (candidates.length === 1) return candidates[0];
  const typed = candidates.filter((record) => typeCompatible(edge.sourceType, record.type));
  const pool = typed.length ? typed : candidates;
  if (pool.length) return nearestRecord(edge, pool);

  const lineCandidates = [];
  for (const records of sourceIndex.byBranch.values()) {
    for (const record of records) {
      if (!typeCompatible(edge.sourceType, record.type)) continue;
      if (record.branchName && edge.lineId && record.branchName.includes(edge.lineId)) lineCandidates.push(record);
    }
  }
  return lineCandidates.length ? nearestRecord(edge, lineCandidates) : null;
}

function nearestRecord(edge, records) {
  return [...records].sort((a, b) => {
    const ad = positionDistanceToEdge(a.position, edge);
    const bd = positionDistanceToEdge(b.position, edge);
    return ad - bd || (a.sourceGlobalIndex ?? Number.MAX_SAFE_INTEGER) - (b.sourceGlobalIndex ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
  })[0];
}

function positionDistanceToEdge(position, edge) {
  if (!position) return Number.POSITIVE_INFINITY;
  return Math.min(distance(position, edge.from), distance(position, edge.to));
}

function parseInputXml(text) {
  const elementPattern = /<PIPINGELEMENT\b([^>]*)>([\s\S]*?)<\/PIPINGELEMENT>/g;
  const edges = [];
  const nodes = new Map();
  let match;
  while ((match = elementPattern.exec(text))) {
    const attrs = parseAttrs(match[1]);
    const fromNode = cleanNode(attrs.FROM_NODE);
    const toNode = cleanNode(attrs.TO_NODE);
    const from = { x: number(attrs.FROM_GLOBAL_X), y: number(attrs.FROM_GLOBAL_Y), z: number(attrs.FROM_GLOBAL_Z) };
    const to = { x: number(attrs.TO_GLOBAL_X), y: number(attrs.TO_GLOBAL_Y), z: number(attrs.TO_GLOBAL_Z) };
    nodes.set(fromNode, from);
    nodes.set(toNode, to);
    edges.push({
      id: attrs.ID,
      fromNode,
      toNode,
      from,
      to,
      lengthM: distance(from, to) / 1000,
      name: decodeXml(attrs.NAME || ''),
      lineId: decodeXml(attrs.LINE_ID || ''),
      sourceType: String(attrs.SOURCE_TYPE || 'PIPE').toUpperCase(),
      wallMm: number(attrs.WALL_THICK),
      corrosionAllowanceMm: number(attrs.CORR_ALLOW),
      rawFluidDensity: number(attrs.FLUID_DENSITY),
    });
  }
  const adjacency = new Map([...nodes.keys()].map((nodeId) => [nodeId, []]));
  for (const edge of edges) {
    adjacency.get(edge.fromNode).push(edge);
    adjacency.get(edge.toNode).push(edge);
  }
  return { edges, nodes, adjacency };
}

function resolveFluidDensity(model, profile) {
  const unresolved = new Set();
  const resolved = new Set();
  for (const edge of model.edges) {
    if (edge.rawFluidDensity >= 0 && !isSentinel(edge.rawFluidDensity, profile)) {
      edge.fluidDensityKgM3 = edge.rawFluidDensity * profile.processResolution.inputXmlDensityToKgM3;
      resolved.add(edge.id);
    } else unresolved.add(edge.id);
  }
  while (unresolved.size) {
    let progress = 0;
    for (const edge of model.edges) {
      if (!unresolved.has(edge.id)) continue;
      const values = [];
      for (const nodeId of [edge.fromNode, edge.toNode]) {
        for (const neighbor of model.adjacency.get(nodeId) || []) {
          if (neighbor.id !== edge.id && resolved.has(neighbor.id)) values.push(neighbor.fluidDensityKgM3);
        }
      }
      if (!values.length) continue;
      const first = values[0];
      if (values.some((value) => Math.abs(value - first) > profile.processResolution.fluidDensityConflictToleranceKgM3)) {
        throw new Error(`Conflicting fluid-density inheritance at ${edge.id}.`);
      }
      edge.fluidDensityKgM3 = first;
      unresolved.delete(edge.id);
      resolved.add(edge.id);
      progress += 1;
    }
    if (!progress) throw new Error(`Unable to resolve fluid density for ${[...unresolved].slice(0, 5).join(', ')}.`);
  }
}

function resolveInsulationThicknessMm(source) {
  if (!source) return 0;
  const attrs = source.item.attributes || {};
  const enriched = source.item.enrichedAttributes || {};
  const raw = engineeringNumber(attrs.INSU);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const resolved = Number(enriched.insulationThicknessMm);
  return Number.isFinite(resolved) && resolved > 0 ? resolved : 0;
}

function resolveSourceRigidMassKg(source) {
  if (!source) return 0;
  const attrs = source.item.attributes || {};
  const enriched = source.item.enrichedAttributes || {};
  for (const value of [
    enriched.componentWeightKg,
    attrs.NWEI,
    attrs.PSIWEIGHT,
    attrs.CMPWEIGHTDRY,
    attrs.WEIGHT,
  ]) {
    const parsed = engineeringNumber(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function sectionProperties(odMm, wallMm) {
  if (!(odMm > 0) || !(wallMm > 0) || odMm <= 2 * wallMm) throw new Error(`Invalid resolved section OD=${odMm}, wall=${wallMm}.`);
  const odM = odMm / 1000;
  const idM = (odMm - 2 * wallMm) / 1000;
  return {
    odM,
    idM,
    areaM2: Math.PI / 4 * (odM ** 2 - idM ** 2),
    fluidAreaM2: Math.PI / 4 * idM ** 2,
  };
}

function toCsv(rows) {
  const header = [
    'Position Ref','From Node','To Node','From X mm','From Y mm','From Z mm','To X mm','To Y mm','To Z mm',
    'Component','Source Type','Branch','Branch Path','Source Global Index','NPS','DN mm','Schedule','Resolution Status','Resolution Basis',
    'Schedule Source','Schedule Source Type','Schedule Source Field','Schedule Source Raw','OD mm','Wall mm','Stored Wall mm','Wall Corrected',
    'Corrosion mm','ID mm','Length m','Metal kg/m','Fluid kg/m','Insulation kg/m','Total kg/m','Metal kg','Fluid kg','Insulation kg',
    'Rigid Source kg','Total kg','Vertical Weight kN','Weight Treatment',
  ];
  const body = rows.map((row) => [
    row.positionRef,row.fromNode,row.toNode,row.fromPositionMm.x,row.fromPositionMm.y,row.fromPositionMm.z,
    row.toPositionMm.x,row.toPositionMm.y,row.toPositionMm.z,row.componentName,row.sourceType,row.sourceBranchName,
    row.sourceBranchPath,row.sourceGlobalIndex,row.nps,row.nominalBoreMm,row.schedule,row.scheduleResolutionStatus,
    row.scheduleResolutionBasis,row.scheduleSourceName,row.scheduleSourceType,row.scheduleSourceField,row.scheduleSourceRaw,
    row.outsideDiameterMm,row.wallThicknessMm,row.storedEnrichedOrXmlWallMm,row.wallCorrectedFromStoredValue,
    row.corrosionAllowanceMm,row.insideDiameterMm,row.lengthM,row.kgPerM.metal,row.kgPerM.fluid,row.kgPerM.insulation,
    row.kgPerM.total,row.kg.metal,row.kg.fluid,row.kg.insulation,row.kg.rigidSource,row.kg.total,row.verticalWeightKn,
    row.weightTreatment,
  ]);
  return `${[header, ...body].map((values) => values.map(csv).join(',')).join('\n')}\n`;
}

function parseAttrs(text) {
  const attrs = {};
  const pattern = /([A-Za-z0-9_:.-]+)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(text))) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}
function decodeXml(value) { return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function cleanNode(value) { return String(Math.round(number(value))); }
function nameKeys(...values) { return [...new Set(values.filter(Boolean).flatMap((value) => [String(value), String(value).replace(/^[A-Z]+\s+/i, '')]).map((value) => value.trim().toUpperCase()))]; }
function typeCompatible(a, b) { const left = String(a || '').slice(0, 4); const right = String(b || '').slice(0, 4); return left === right || (left === 'PIPE' && right === 'BRAN'); }
function isSentinel(value, profile) { return profile.processResolution.sentinelValues.some((item) => Math.abs(value - item) <= profile.processResolution.sentinelTolerance); }
function engineeringNumber(value) { if (typeof value === 'number') return Number.isFinite(value) ? value : null; const match = String(value ?? '').match(/[-+]?\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; }
function finiteOrNull(value) { const result = Number(value); return Number.isFinite(result) ? result : null; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function round(value, decimals = 6) { const factor = 10 ** decimals; return Math.round((value + Number.EPSILON) * factor) / factor; }
function nullableRound(value, decimals) { return Number.isFinite(value) ? round(value, decimals) : null; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function countBy(rows, keyOf) { const result = {}; for (const row of rows) { const key = String(keyOf(row)); result[key] = (result[key] || 0) + 1; } return result; }
function csv(value) { const text = value == null ? '' : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
