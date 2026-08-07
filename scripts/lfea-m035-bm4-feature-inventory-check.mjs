#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attributeValue, findAnyElements, findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  INPUTXML_LENGTH_UNIT_REGISTRY_ID,
  LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
  normalizeLinearPipingInputXmlGeometry,
  sealLinearPipingInputXmlUnitProfile,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

const path = fileURLToPath(new URL('../benchmarks/LFEA/BM4/InputXML_BM4.xml', import.meta.url));
const xml = readFileSync(path, 'utf8');
const sourceHash = semanticHash({ xml });
const parsed = inputXmlToCanonicalGeometry(xml, { unit: 'mm', source: 'CAESAR-II-BM4-LIVE-INPUTXML', bendRadiusTolerance: 1e-6 });
const normalized = normalizeLinearPipingInputXmlGeometry(parsed, sealLinearPipingInputXmlUnitProfile({
  schema: LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
  profileId: 'M035-BM4-FEATURE-INVENTORY-UNIT-R1',
  registryId: INPUTXML_LENGTH_UNIT_REGISTRY_ID,
  allowedSourceUnits: ['mm'],
  sourceEvidence: {
    authority: 'BM4-INPUTXML', documentId: 'InputXML_BM4.xml', revision: sourceHash, sourceSemanticHash: sourceHash,
  },
  semanticHash: '',
})).geometry;

const elements = findElements(xml, 'PIPINGELEMENT');
const reducers = [];
const teeTags = [];
for (const [index, element] of elements.entries()) {
  const fromNode = cleanNode(attributeValue(element.attributes, 'FROM_NODE'));
  const toNode = cleanNode(attributeValue(element.attributes, 'TO_NODE'));
  const reducer = findAnyElements(element.inner, ['REDUCER', 'REDUCERS', 'REDU', 'REDC', 'REDE'])[0] ?? null;
  if (reducer) {
    reducers.push({ sourceIndex: index, segmentId: `IX-S${index + 1}`, fromNode, toNode, tagAttributes: reducer.attributes });
  }
  for (const sif of findAnyElements(element.inner, ['SIF', 'SIFS'])) {
    const type = Number(attributeValue(sif.attributes, 'TYPE'));
    if (Math.abs(type - 3) < 0.001 || Math.abs(type - 5) < 0.001) {
      teeTags.push({ sourceIndex: index, segmentId: `IX-S${index + 1}`, fromNode, toNode, sifType: type, tagAttributes: sif.attributes });
    }
  }
}
const bends = normalized.segments.filter((row) => row.type === 'BEND').map((row) => ({
  segmentId: row.id,
  fromNode: String(row.startNodeId),
  toNode: String(row.endNodeId),
  radius: row.meta.bendDeclaredRadius,
}));
const canonicalTeeSegments = normalized.segments.filter((row) => row.type === 'TEE');
const teeJunctionMap = new Map();
for (const segment of canonicalTeeSegments) {
  const junctionNodeId = inferThreeLegJunction(normalized, segment);
  const row = teeJunctionMap.get(junctionNodeId) ?? { junctionNodeId, taggedSegmentIds: [], incidentSegmentIds: incidentIds(normalized, junctionNodeId) };
  row.taggedSegmentIds.push(String(segment.id));
  teeJunctionMap.set(junctionNodeId, row);
}
const teeJunctions = [...teeJunctionMap.values()]
  .map((row) => ({ ...row, taggedSegmentIds: [...new Set(row.taggedSegmentIds)].sort() }))
  .sort((a, b) => a.junctionNodeId.localeCompare(b.junctionNodeId));

assert.equal(bends.length, 11, 'BM4 normalized geometry must expose the 11 M035 bend features.');
assert.equal(teeTags.length, 7, 'BM4 source evidence currently contains seven tee/weldolet SIF tags.');
assert.equal(canonicalTeeSegments.length, 7, 'All seven tee/weldolet-tagged spans must retain canonical TEE classification.');
assert.equal(teeJunctions.length, 2, 'Those source tags must resolve to the two physical BM4 three-leg tee junctions.');
assert.equal(reducers.length, 7, 'BM4 source must expose seven reducer feature segments.');
assert.ok(teeJunctions.every((row) => row.incidentSegmentIds.length === 3));
for (const reducer of reducers) {
  assert.ok(normalized.segments.some((row) => row.id === reducer.segmentId), `${reducer.segmentId} must retain canonical segment custody.`);
}

console.log(JSON.stringify({
  check: 'm035-bm4-feature-inventory',
  status: 'PASS',
  counts: {
    bends: bends.length,
    teeSifTags: teeTags.length,
    canonicalTeeSegments: canonicalTeeSegments.length,
    physicalTeeJunctions: teeJunctions.length,
    reducers: reducers.length,
  },
  bends,
  teeTags,
  teeJunctions,
  reducers,
}, null, 2));
console.log('M035 BM4 feature inventory PASS');

function inferThreeLegJunction(geometry, segment) {
  const candidates = [String(segment.startNodeId), String(segment.endNodeId)]
    .filter((nodeId) => incidentIds(geometry, nodeId).length === 3);
  assert.equal(candidates.length, 1, `TEE-tagged segment ${segment.id} must identify one physical three-leg junction.`);
  return candidates[0];
}
function incidentIds(geometry, nodeId) {
  return geometry.segments
    .filter((row) => String(row.startNodeId) === nodeId || String(row.endNodeId) === nodeId)
    .map((row) => String(row.id))
    .sort();
}
function cleanNode(value) {
  const numeric = Number(String(value ?? '').trim());
  return Number.isFinite(numeric) ? String(numeric) : String(value ?? '').trim();
}
