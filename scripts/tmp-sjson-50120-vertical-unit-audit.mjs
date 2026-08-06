import { readFile } from 'node:fs/promises';

const [enrichedPath, xmlPath] = process.argv.slice(2);
if (!enrichedPath || !xmlPath) throw new Error('Usage: node tmp-sjson-50120-vertical-unit-audit.mjs <EnrichedSjson> <topology.xml>');

const enriched = JSON.parse((await readFile(enrichedPath, 'utf8')).replace(/^\uFEFF/u, ''));
const xmlText = await readFile(xmlPath, 'utf8');
const config = {
  processResolution: {
    sentinelValues: [-1.0101, -2.0202],
    sentinelTolerance: 0.001,
    fluidDensityConflictToleranceKgM3: 0.001,
  },
  weight: {
    gravityMPerS2: 9.80665,
    pipeMetalDensityKgM3: 7850,
    insulationDensityKgM3: 210,
  },
};

const sourceIndex = indexEnrichedSource(enriched);
const model = parseInputXml(xmlText);
resolveFluidDensity(model);

const targetNode = '50120';
const incident = model.edges.filter((edge) => edge.fromNode === targetNode || edge.toNode === targetNode);
if (!incident.length) throw new Error(`No incident elements found at node ${targetNode}.`);

const rows = incident.map((edge) => {
  const source = resolveSourceRecord(edge, sourceIndex);
  const odMm = positive(edge.diameterMm) ? edge.diameterMm : source?.pipeOdMm;
  const wallMm = positive(edge.wallMm) ? edge.wallMm : source?.wallThicknessMm;
  if (!positive(odMm) || !positive(wallMm) || odMm <= 2 * wallMm) throw new Error(`Invalid section for ${edge.id}`);
  const odM = odMm / 1000;
  const idM = (odMm - 2 * wallMm) / 1000;
  const steelAreaM2 = Math.PI / 4 * (odM ** 2 - idM ** 2);
  const fluidAreaM2 = Math.PI / 4 * idM ** 2;
  const insulationThicknessM = (source?.insulationThicknessMm || 0) / 1000;
  const insulationAreaM2 = Math.PI / 4 * ((odM + 2 * insulationThicknessM) ** 2 - odM ** 2);
  const steelMassKg = steelAreaM2 * edge.lengthM * (source?.materialDensityKgM3 || config.weight.pipeMetalDensityKgM3);
  const fluidMassKg = fluidAreaM2 * edge.lengthM * (edge.fluidDensityKgM3 || source?.fluidDensityKgM3 || 0);
  const insulationMassKg = insulationAreaM2 * edge.lengthM * config.weight.insulationDensityKgM3;
  const totalMassKg = steelMassKg + fluidMassKg + insulationMassKg;
  return {
    edgeId: edge.id,
    name: edge.name,
    sourceType: edge.sourceType,
    fromNode: edge.fromNode,
    toNode: edge.toNode,
    lengthM: edge.lengthM,
    odMm,
    wallMm,
    rawFluidDensity: edge.rawFluidDensity,
    resolvedFluidDensityKgM3: edge.fluidDensityKgM3,
    fluidDensityAuthority: edge.fluidDensityAuthority,
    matchedSourceName: source?.name || null,
    sourceFluidDensityKgM3: source?.fluidDensityKgM3 ?? null,
    insulationThicknessMm: source?.insulationThicknessMm || 0,
    steelMassKg,
    fluidMassKg,
    insulationMassKg,
    totalMassKg,
    halfSteelReactionKn: steelMassKg * config.weight.gravityMPerS2 / 2 / 1000,
    halfFluidReactionKn: fluidMassKg * config.weight.gravityMPerS2 / 2 / 1000,
    halfInsulationReactionKn: insulationMassKg * config.weight.gravityMPerS2 / 2 / 1000,
    halfTotalReactionKn: totalMassKg * config.weight.gravityMPerS2 / 2 / 1000,
  };
});

const sumField = (key) => rows.reduce((total, row) => total + row[key], 0);
const report = {
  targetNode,
  incidentCount: rows.length,
  incidentElements: rows,
  nodeMinimumReactionFromIncidentHalfMassKn: {
    steel: sumField('halfSteelReactionKn'),
    fluid: sumField('halfFluidReactionKn'),
    insulation: sumField('halfInsulationReactionKn'),
    total: sumField('halfTotalReactionKn'),
  },
  publishedReactionKn: 1.552,
};
console.log('SJSON_50120_VERTICAL_UNIT_AUDIT_BEGIN');
console.log(JSON.stringify(report, null, 2));
console.log('SJSON_50120_VERTICAL_UNIT_AUDIT_END');

function indexEnrichedSource(root) {
  const byName = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (!value || typeof value !== 'object') return;
    if (value.name || value.type || value.attributes) {
      const attrs = value.attributes || {};
      const enrichedAttrs = value.enrichedAttributes || {};
      const type = String(value.type || attrs.TYPE || enrichedAttrs.componentType || '').toUpperCase();
      const name = String(value.name || `${type} ${attrs.NAME || ''}`).trim();
      const rawInsulation = parseEngineeringNumber(attrs.INSU);
      const enrichedInsulation = finiteOrNull(enrichedAttrs.insulationThicknessMm);
      const record = {
        name,
        type,
        pipeOdMm: finiteOrNull(enrichedAttrs.pipeOdMm) ?? parseEngineeringNumber(attrs.ABORE) ?? parseEngineeringNumber(attrs.LBORE),
        wallThicknessMm: finiteOrNull(enrichedAttrs.wallThicknessMm),
        materialDensityKgM3: finiteOrNull(enrichedAttrs.materialDensityKgM3),
        insulationThicknessMm: positive(rawInsulation) ? rawInsulation : (enrichedInsulation || 0),
        fluidDensityKgM3: finiteOrNull(enrichedAttrs.fluidDensityOpeKgM3),
      };
      for (const key of nameKeys(name, attrs.NAME)) if (!byName.has(key)) byName.set(key, record);
    }
    if (Array.isArray(value.children)) visit(value.children);
  };
  visit(root);
  return { byName };
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
      lengthM: Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / 1000,
      diameterMm: number(attrs.DIAMETER),
      wallMm: number(attrs.WALL_THICK),
      rawFluidDensity: number(attrs.FLUID_DENSITY),
      name: decodeXml(attrs.NAME || ''),
      sourceType: String(attrs.SOURCE_TYPE || 'PIPE').toUpperCase(),
    });
  }
  const edgesByNode = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const edge of edges) {
    edgesByNode.get(edge.fromNode)?.push(edge);
    edgesByNode.get(edge.toNode)?.push(edge);
  }
  return { edges, nodes, edgesByNode };
}

function resolveFluidDensity(model) {
  const unresolved = new Set();
  const resolved = new Set();
  for (const edge of model.edges) {
    const raw = edge.rawFluidDensity;
    if (Number.isFinite(raw) && raw >= 0 && !isSentinel(raw)) {
      edge.fluidDensityKgM3 = normalizeFluidDensity(raw);
      edge.fluidDensityAuthority = 'SOURCE_EXPLICIT';
      resolved.add(edge.id);
    } else unresolved.add(edge.id);
  }
  while (unresolved.size) {
    let progress = 0;
    for (const edge of model.edges) {
      if (!unresolved.has(edge.id)) continue;
      const values = [];
      for (const nodeId of [edge.fromNode, edge.toNode]) {
        for (const neighbor of model.edgesByNode.get(nodeId) || []) {
          if (neighbor.id !== edge.id && resolved.has(neighbor.id)) values.push(neighbor.fluidDensityKgM3);
        }
      }
      if (!values.length) continue;
      const reference = values[0];
      if (values.some((value) => Math.abs(value - reference) > config.processResolution.fluidDensityConflictToleranceKgM3)) {
        throw new Error(`Conflicting fluid density at ${edge.id}: ${values.join(', ')}`);
      }
      edge.fluidDensityKgM3 = reference;
      edge.fluidDensityAuthority = 'SENTINEL_PREVIOUS_CONNECTED_NODE';
      unresolved.delete(edge.id);
      resolved.add(edge.id);
      progress += 1;
    }
    if (!progress) throw new Error(`Unresolved fluid density: ${[...unresolved].slice(0, 10).join(', ')}`);
  }
}

function resolveSourceRecord(edge, sourceIndex) {
  for (const key of nameKeys(edge.name)) {
    const record = sourceIndex.byName.get(key);
    if (record) return record;
  }
  return null;
}
function parseAttrs(text) { const attrs = {}; const pattern = /([A-Za-z0-9_:.-]+)="([^"]*)"/g; let match; while ((match = pattern.exec(text))) attrs[match[1]] = decodeXml(match[2]); return attrs; }
function decodeXml(value) { return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function cleanNode(value) { return String(Math.round(number(value))); }
function normalizeFluidDensity(value) { return value < 20 ? value * 1000 : value; }
function isSentinel(value) { return config.processResolution.sentinelValues.some((item) => Math.abs(value - item) <= config.processResolution.sentinelTolerance); }
function nameKeys(name, alternate = '') { return [...new Set([name, alternate, String(name).replace(/^[A-Z]+\s+/i, ''), String(alternate).replace(/^[A-Z]+\s+/i, '')].filter(Boolean).map((value) => String(value).trim().toUpperCase()))]; }
function parseEngineeringNumber(value) { const match = String(value ?? '').match(/[-+]?\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; }
function finiteOrNull(value) { const result = Number(value); return Number.isFinite(result) ? result : null; }
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
