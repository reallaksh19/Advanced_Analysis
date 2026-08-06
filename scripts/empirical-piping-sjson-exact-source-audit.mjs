import { createHash } from 'node:crypto';
import { readFile, readFileSync } from 'node:fs';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';

const EXPECTED_SOURCE_SHA256 = '6b2c8b01ab0ba6ec8e9e7c42eb4a719668ffd2dc4dbe4790d27cf426a1f60288';
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Expected exact SJSON file path argument.');
const bytes = new Uint8Array(await readFile(sourcePath));
const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
if (sourceSha256 !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`Exact source hash mismatch: ${sourceSha256}`);
}
const raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/u, ''));
const dataset = normalizeWorkspaceDataset(raw, 'Sjson.json', {
  sourceBytes: bytes,
  sourceSha256,
});
const sharedModel = dataset.sharedModel;
const graph = buildPipingPortTopologyGraph(sharedModel);
const attachments = buildSupportAttachmentModel(sharedModel, graph);
const restraints = buildRestraintCapabilityModel(attachments);

const componentTypes = countBy(sharedModel.components, (row) => String(row.type || 'UNKNOWN'));
const supportTypes = countBy(sharedModel.supports || [], (row) => String(row.type || row.supportType || 'UNKNOWN'));
const restraintTypes = countBy(restraints.restraints || [], (row) => String(row.supportType || 'UNKNOWN'));
const anchorRows = (restraints.restraints || []).filter((row) => /ANCHOR|(^|_)ANC(HOR)?($|_)/i.test(String(row.supportType || '')));
const lineIdentitySamples = sharedModel.components.slice(0, 20).map((component) => ({
  componentKey: component.componentKey,
  type: component.type,
  identity: component.identity,
  engineering: component.engineering,
  properties: component.properties,
  sourceReferences: component.sourceReferences,
}));
const authorityHits = collectAuthorityHits(sharedModel.components);
const topologyEvidence = {
  connectedComponentCount: graph.connectedComponents.length,
  connectionCount: graph.connections.length,
  portCount: graph.ports.length,
  connectedComponents: graph.connectedComponents.map((row) => ({
    connectedComponentId: row.connectedComponentId,
    componentCount: row.componentKeys.length,
  })).sort((a, b) => b.componentCount - a.componentCount).slice(0, 20),
};

const report = {
  datasetId: sharedModel.project.datasetId,
  sourceSha256,
  units: sharedModel.units,
  project: sharedModel.project,
  counts: {
    components: sharedModel.components.length,
    supports: (sharedModel.supports || []).length,
    attachments: attachments.attachments.length,
    restraints: restraints.restraints.length,
    solverEligibleRestraints: restraints.restraints.filter((row) => row.solverEligible).length,
    anchors: anchorRows.length,
  },
  componentTypes,
  supportTypes,
  restraintTypes,
  anchors: anchorRows.map((row) => ({
    restraintId: row.restraintId,
    supportKey: row.supportKey,
    supportType: row.supportType,
    vertical: row.vertical,
    lateral: row.lateral,
    longitudinal: row.longitudinal,
  })),
  topologyEvidence,
  sourceAuthorityPresence: summarizeAuthorityHits(authorityHits),
  authorityHitSamples: authorityHits.slice(0, 100),
  lineIdentitySamples,
  runtimeSourceEvidence: {
    coupledRuntimeRequiresAnchor: /requireAtLeastOneAnchor/.test(readFileSync(new URL('../src/workspace/engineering-loads/empirical-coupled-restraint-network-runtime.js', import.meta.url), 'utf8')),
    coupledProfileRequiresAnchor: /requireAtLeastOneAnchor !== true/.test(readFileSync(new URL('../src/workspace/engineering-loads/empirical-coupled-restraint-network-profile.js', import.meta.url), 'utf8')),
  },
};
console.log('SJSON_EMPIRICAL_SOURCE_AUDIT_BEGIN');
console.log(JSON.stringify(report, null, 2));
console.log('SJSON_EMPIRICAL_SOURCE_AUDIT_END');

function countBy(rows, keyOf) {
  return Object.fromEntries([...rows.reduce((map, row) => {
    const key = keyOf(row);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map())].sort(([a], [b]) => a.localeCompare(b)));
}

function collectAuthorityHits(components) {
  const matcher = /(diam|bore|wall|thick|material|elastic|modulus|young|thermal|expansion|temperature|density|mass|weight|insulation|fluid|pressure)/i;
  const rows = [];
  for (const component of components) {
    walk(component, '', (path, value) => {
      if (matcher.test(path) && ['string', 'number', 'boolean'].includes(typeof value)) {
        rows.push({ componentKey: component.componentKey, path, value });
      }
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path) || a.componentKey.localeCompare(b.componentKey));
}

function summarizeAuthorityHits(rows) {
  const categories = {
    section: /(diam|bore|wall|thick)/i,
    material: /material/i,
    elasticModulus: /(elastic|modulus|young)/i,
    thermalExpansion: /(thermal.*expansion|expansion.*thermal|alpha)/i,
    temperature: /temperature/i,
    massWeight: /(density|mass|weight)/i,
    insulation: /insulation/i,
    fluid: /fluid/i,
    pressure: /pressure/i,
  };
  return Object.fromEntries(Object.entries(categories).map(([key, regex]) => {
    const matches = rows.filter((row) => regex.test(row.path));
    return [key, { present: matches.length > 0, hitCount: matches.length }];
  }));
}

function walk(value, path, visit) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => walk(item, path ? `${path}.${key}` : key, visit));
    return;
  }
  visit(path, value);
}
