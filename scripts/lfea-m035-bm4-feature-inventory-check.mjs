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
  if (reducer) reducers.push({ sourceIndex: index, segmentId: `IX-S${index + 1}`, fromNode, toNode, tagAttributes: reducer.attributes });
  for (const sif of findAnyElements(element.inner, ['SIF', 'SIFS'])) {
    const type = Number(attributeValue(sif.attributes, 'TYPE'));
    if (Math.abs(type - 3) < 0.001 || Math.abs(type - 5) < 0.001) {
      teeTags.push({
        sourceIndex: index,
        segmentId: `IX-S${index + 1}`,
        fromNode,
        toNode,
        sifNode: cleanNode(attributeValue(sif.attributes, 'NODE')),
        sifType: type,
        tagAttributes: sif.attributes,
      });
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
const teeSet = new Set(canonicalTeeSegments.map((row) => String(row.id)));
const physicalTeeJunctions = normalized.nodes.flatMap((node) => {
  const junctionNodeId = String(node.id);
  const incidentSegmentIds = incidentIds(normalized, junctionNodeId);
  if (incidentSegmentIds.length !== 3) return [];
  const taggedSegmentIds = incidentSegmentIds.filter((id) => teeSet.has(id));
  if (taggedSegmentIds.length === 0) return [];
  return [{ junctionNodeId, incidentSegmentIds, taggedSegmentIds }];
}).sort((a, b) => a.junctionNodeId.localeCompare(b.junctionNodeId));
const assignedTags = new Set(physicalTeeJunctions.flatMap((row) => row.taggedSegmentIds));
const teeTagsWithoutBranchTopology = canonicalTeeSegments
  .map((row) => String(row.id))
  .filter((id) => !assignedTags.has(id))
  .sort();

assert.equal(bends.length, 11, 'BM4 normalized geometry must expose the 11 M035 bend features.');
assert.equal(teeTags.length, 7, 'BM4 source evidence currently contains seven tee/weldolet SIF tags.');
assert.equal(canonicalTeeSegments.length, 7, 'All seven tee/weldolet-tagged spans must retain canonical TEE classification.');
assert.deepEqual(
  physicalTeeJunctions.map((row) => row.junctionNodeId),
  ['20160', '20295'],
  'Only the two degree>2 BM4 nodes identified by #834 are structural tee-flexibility targets.',
);
assert.equal(reducers.length, 7, 'BM4 source must expose seven reducer feature segments.');
assert.ok(physicalTeeJunctions.every((row) => row.incidentSegmentIds.length === 3));
assert.equal(teeTagsWithoutBranchTopology.length, 5, 'Five SIF-tagged spans remain stress/source evidence without degree-3 branch topology.');
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
    physicalTeeJunctions: physicalTeeJunctions.length,
    teeTagsWithoutBranchTopology: teeTagsWithoutBranchTopology.length,
    reducers: reducers.length,
  },
  bends,
  teeTags,
  physicalTeeJunctions,
  teeTagsWithoutBranchTopology,
  reducers,
}, null, 2));
console.log('M035 BM4 feature inventory PASS');

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
