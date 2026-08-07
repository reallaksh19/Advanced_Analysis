#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { compileInputXmlBendFeatureExpansion } from '../src/core/linear-piping-analysis-consumer/index.js';
import { buildBm4SolveAuthorities } from './lfea-m034-bm4-solve-fixtures.mjs';
import { componentProfile } from './lfea-b3.2-piping-component-fixtures.mjs';

const EDITION_PROFILE_ID = 'B31_3_2022_B31J_2017';
const MOMENT_DIRECTION_MAPPING = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });

console.log('\n--- M035 generic InputXML bend integration ---');

const authorities = buildBm4SolveAuthorities();
const geometry = authorities.normalized.geometry;
const bendSegments = geometry.segments.filter((row) => row.type === 'BEND');
const materialBySegmentId = new Map(bendSegments.map((row) => [String(row.id), authorities.material]));
const sectionBySegmentId = new Map(bendSegments.map((row) => [String(row.id), authorities.physicalSections.get(row.id)]));
const profile = componentProfile({
  bendPressureStiffeningRule: 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1',
});

const expansion = compileInputXmlBendFeatureExpansion({
  canonicalGeometry: geometry,
  editionProfileId: EDITION_PROFILE_ID,
  momentDirectionMapping: MOMENT_DIRECTION_MAPPING,
  materialBySegmentId,
  sectionBySegmentId,
  frameElementProfile: authorities.frameProfile,
  pipingComponentProfile: profile,
  localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
});

assert.equal(expansion.components.length, bendSegments.length);
assert.equal(expansion.components.length, 11);
assert.ok(expansion.analysisGeometry.segments.length > geometry.segments.length);
assert.ok(expansion.analysisGeometry.nodes.length > geometry.nodes.length);
assert.ok(expansion.analysisGeometry.diagnostics.some((row) => row.code === 'INPUTXML_BEND_REAL_ARC_EXPANDED'));

for (const definition of expansion.definitions) {
  const source = bendSegments.find((row) => String(row.id) === definition.sourceSegmentId);
  assert.ok(source, `Source bend ${definition.sourceSegmentId} must remain traceable.`);
  const component = expansion.components.find((row) => row.semanticHash === definition.componentSemanticHash);
  assert.ok(component);
  assert.equal(component.componentType, 'BEND');
  assert.notEqual(component.acceptanceState, 'BLOCKED');
  assert.equal(component.flexibilityOwnership.ownerPackageId, 'LFEA-B3.2');
  assert.equal(component.flexibilityOwnership.applied, true);
  assert.equal(component.flexibility.doubleCountGuard.accepted, true);
  assert.equal(component.factorSet, undefined);
  assert.equal(definition.stationNodeIds.at(-1), String(source.endNodeId));
  assert.equal(definition.analysisSegmentIds.filter((id) => id.includes('.E')).length, component.elements.length);
  const analysisRows = expansion.analysisGeometry.segments.filter((row) => row.meta?.sourceSegmentId === String(source.id));
  assert.ok(analysisRows.some((row) => row.meta.analysisRole === 'BEND_ARC'));
  assert.ok(analysisRows.every((row) => row.type === 'PIPE'));
}

const productionSource = readFileSync(new URL('../src/core/linear-piping-analysis-consumer/inputxml-bend-feature-expansion.js', import.meta.url), 'utf8');
for (const forbidden of ['BM4', '20090', '20350', '21470', '21610']) {
  assert.equal(productionSource.includes(forbidden), false, `Generic bend production code must not contain ${forbidden}.`);
}

const kValues = expansion.components.map((component) => component.flexibility.factor);
console.log(JSON.stringify({
  check: 'm035-generic-inputxml-bend-integration',
  status: 'PASS',
  bendCount: expansion.components.length,
  sourceNodeCount: geometry.nodes.length,
  analysisNodeCount: expansion.analysisGeometry.nodes.length,
  sourceSegmentCount: geometry.segments.length,
  analysisSegmentCount: expansion.analysisGeometry.segments.length,
  pressureCorrectedKRange: { minimum: Math.min(...kValues), maximum: Math.max(...kValues) },
  semanticHash: expansion.semanticHash,
}, null, 2));
console.log('M035 generic InputXML bend integration PASS');
