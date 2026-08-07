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
import { detectInputXmlInlineReducerTransitions } from '../src/core/linear-piping-analysis-consumer/inputxml-inline-reducer-transitions.js';
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
const explicitReducerTags = [];
const teeTags = [];
for (const [index, element] of elements.entries()) {
  const fromNode = cleanNode(attributeValue(element.attributes, 'FROM_NODE'));
  const toNode = cleanNode(attributeValue(element.attributes, 'TO_NODE'));
  const reducer = findAnyElements(element.inner, ['REDUCER', 'REDUCERS', 'REDU', 'REDC', 'REDE'])[0] ?? null;
  if (reducer) explicitReducerTags.push({ sourceIndex: index, segmentId: `IX-S${index + 1}`, fromNode, toNode, tagAttributes: reducer.attributes });
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
const inlineReducers = detectInputXmlInlineReducerTransitions({ canonicalGeometry: normalized });
const allSectionChangeNodes = sectionChangeNodes(normalized);

console.log(JSON.stringify({
  diagnostic: 'm035-bm4-section-change-topology',
  detectorTransitionNodes: inlineReducers.transitions.map((row) => row.nodeId),
  allSectionChangeNodes,
}, null, 2));

assert.equal(bends.length, 11, 'BM4 normalized geometry must expose the 11 M035 bend features.');
assert.equal(teeTags.length, 7, 'BM4 source evidence currently contains seven tee/weldolet SIF tags.');
assert.equal(canonicalTeeSegments.length, 7, 'All seven tee/weldolet-tagged spans must retain canonical TEE classification.');
assert.deepEqual(
  physicalTeeJunctions.map((row) => row.junctionNodeId),
  ['20160', '20295'],
  'Only the two degree>2 BM4 nodes identified by #834 are structural tee-flexibility targets.',
);
assert.equal(explicitReducerTags.length, 0, 'BM4 must not invent explicit reducer tags that are absent from InputXML.');
assert.equal(inlineReducers.transitionCount, 7, 'BM4 must expose seven inline section-transition reducer candidates.');
assert.ok(physicalTeeJunctions.every((row) => row.incidentSegmentIds.length === 3));
assert.equal(teeTagsWithoutBranchTopology.length, 5, 'Five SIF-tagged spans remain stress/source evidence without degree-3 branch topology.');
assert.ok(inlineReducers.transitions.every((row) => row.condensationActivation.status === 'BLOCKED_PENDING_FINITE_REDUCER_GEOMETRY_AND_PARITY'));
assert.ok(inlineReducers.transitions.every((row) => row.condensationActivation.reducerLength === null));

console.log(JSON.stringify({
  check: 'm035-bm4-feature-inventory',
  status: 'PASS',
  counts: {
    bends: bends.length,
    teeSifTags: teeTags.length,
    canonicalTeeSegments: canonicalTeeSegments.length,
    physicalTeeJunctions: physicalTeeJunctions.length,
    teeTagsWithoutBranchTopology: teeTagsWithoutBranchTopology.length,
    explicitReducerTags: explicitReducerTags.length,
    inlineReducerTransitions: inlineReducers.transitionCount,
  },
  bends,
  teeTags,
  physicalTeeJunctions,
  teeTagsWithoutBranchTopology,
  explicitReducerTags,
  inlineReducerTransitions: inlineReducers.transitions,
  reducerPolicy: inlineReducers.policy,
}, null, 2));
console.log('M035 BM4 feature inventory PASS');

function incidentIds(geometry, nodeId) {
  return geometry.segments
    .filter((row) => String(row.startNodeId) === nodeId || String(row.endNodeId) === nodeId)
    .map((row) => String(row.id))
    .sort();
}
function sectionChangeNodes(geometry) {
  return geometry.nodes.flatMap((node) => {
    const nodeId = String(node.id);
    const incident = geometry.segments.filter((row) => String(row.startNodeId) === nodeId || String(row.endNodeId) === nodeId);
    const physical = incident.filter((row) => Number.isFinite(row.diameter) && row.diameter > 0 && Number.isFinite(row.thickness) && row.thickness > 0);
    if (physical.length < 2) return [];
    const sectionKeys = new Set(physical.map((row) => `${row.diameter.toPrecision(15)}:${row.thickness.toPrecision(15)}`));
    if (sectionKeys.size < 2) return [];
    return [{
      nodeId,
      nodeDegree: incident.length,
      incident: physical.map((row) => ({ segmentId: String(row.id), type: row.type, outerDiameter: row.diameter, wallThickness: row.thickness })),
    }];
  }).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}
function cleanNode(value) {
  const numeric = Number(String(value ?? '').trim());
  return Number.isFinite(numeric) ? String(numeric) : String(value ?? '').trim();
}
