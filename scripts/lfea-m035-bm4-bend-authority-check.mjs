#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';
import { buildBm4SolveAuthorities } from './lfea-m034-bm4-solve-fixtures.mjs';
import { M035_BEND_SCORING_EXCLUDED_NODE_IDS } from './lfea-m035-bm4-scope-policy.mjs';

const EDITION_PROFILE_ID = 'B31_3_2022_B31J_2017';
const MOMENT_DIRECTION_MAPPING = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });
const excludedNodes = new Set(M035_BEND_SCORING_EXCLUDED_NODE_IDS);

function bendRequest(authorities, segment, index) {
  const section = authorities.physicalSections.get(segment.id);
  assert.ok(section, `Physical section authority missing for ${segment.id}.`);
  const radius = segment.meta.bendDeclaredRadius;
  assert.ok(Number.isFinite(radius) && radius > 0, `${segment.id} bend radius must be positive.`);
  const pressure = segment.meta.analysis.pressure;
  const elasticModulus = segment.meta.analysis.elasticModulus;
  assert.ok(Number.isFinite(pressure) && pressure >= 0, `${segment.id} pressure must be finite and nonnegative.`);
  assert.ok(Number.isFinite(elasticModulus) && elasticModulus > 0, `${segment.id} elastic modulus must be positive.`);

  return {
    schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
    calculationId: `M035-BM4-BEND-${index + 1}`,
    componentId: `M035.BM4.BEND.${segment.id}`,
    editionProfileId: EDITION_PROFILE_ID,
    componentType: 'BEND',
    geometry: {
      schema: COMPONENT_GEOMETRY_SCHEMA,
      componentType: 'BEND',
      lengthUnit: 'm',
      outerDiameter: section.dimensions.outerDiameter,
      wallThickness: section.dimensions.wallThickness,
      bendRadius: radius,
      pressure,
      elasticModulus,
      // #834's diagnostic baseline is the general 1.65/h bend flexibility.
      // Do not silently opt into the B31J smooth-90 1.3/h note.
      smooth90FlexibilityCorrection: false,
      sourceEvidence: {
        sourceId: `${authorities.source.sourceId}:${segment.sourceComponentUid}`,
        sourceRevision: `${authorities.source.sourceRevision}:${segment.id}`,
      },
    },
    momentDirectionMapping: MOMENT_DIRECTION_MAPPING,
    semanticHash: '',
  };
}

console.log('\n--- M035 BM4 B31 bend-factor authority audit ---');

const authorities = buildBm4SolveAuthorities();
const bends = authorities.normalized.geometry.segments
  .filter((segment) => segment.type === 'BEND')
  .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

assert.equal(bends.length, 12, 'BM4 InputXML declares 12 bend-tagged source segments.');

const rows = bends.map((segment, index) => {
  const result = calculateB31Factors(bendRequest(authorities, segment, index));
  assert.equal(result.status, 'QUALIFIED', `${segment.id} B31 factor result must qualify.`);
  assert.ok(result.componentFactorSet, `${segment.id} must emit a component flexibility factor set.`);
  assert.equal(result.componentFactorSet.componentType, 'BEND');
  assert.equal(result.componentFactorSet.flexibilityGeometryBasis, 'ARC_GEOMETRY_EXCLUDED_V1');
  assert.equal(result.componentFactorSet.directionalFlexibilityFactors, null);
  assert.equal(result.factors.flexibility.torsional, 1);
  assert.equal(result.factors.flexibility.inPlane, result.factors.flexibility.outOfPlane);
  assert.ok(result.factors.flexibility.inPlane > 1, `${segment.id} must be more flexible than a straight pipe in bending.`);
  assert.ok(result.stressFactorSets.length === 1, `${segment.id} must emit one separate stress-factor set.`);
  assert.notEqual(result.componentFactorSet.semanticHash, result.stressFactorSets[0].semanticHash);

  const sourceNodes = [String(segment.startNodeId), String(segment.endNodeId)];
  return Object.freeze({
    sourceSegmentId: segment.id,
    fromNode: sourceNodes[0],
    toNode: sourceNodes[1],
    kInPlane: result.factors.flexibility.inPlane,
    kOutOfPlane: result.factors.flexibility.outOfPlane,
    torsionalFlexibility: result.factors.flexibility.torsional,
    pressureCorrectionApplied: result.factors.pressureCorrection.applied,
    flexibilityRuleId: result.factors.flexibilityRule.ruleId,
    componentFactorSetSemanticHash: result.componentFactorSet.semanticHash,
    stressFactorSetSemanticHash: result.stressFactorSets[0].semanticHash,
    bendScoreExcludedByM036: sourceNodes.some((nodeId) => excludedNodes.has(nodeId)),
  });
});

const included = rows.filter((row) => !row.bendScoreExcludedByM036);
const kValues = included.map((row) => row.kInPlane);
assert.equal(included.length, 11, 'M035 must score 11 bends after excluding the M036 lift-off bend at node 20090.');
assert.ok(kValues.every((value) => value > 1 && Number.isFinite(value)));
assert.ok(
  kValues.every((value) => value >= 3.6 && value <= 4.2),
  `M035 BM4 in-scope bend k values must remain near the RCA 3.7-4.1 band; got ${Math.min(...kValues)}..${Math.max(...kValues)}.`,
);

console.log(JSON.stringify({
  check: 'm035-bm4-bend-factor-authority',
  status: 'PASS',
  editionProfileId: EDITION_PROFILE_ID,
  sourceBendCount: bends.length,
  m035ScoredBendCount: included.length,
  excludedByM036: rows.filter((row) => row.bendScoreExcludedByM036).map((row) => row.sourceSegmentId),
  kRange: { minimum: Math.min(...kValues), maximum: Math.max(...kValues) },
  rows,
}, null, 2));
console.log('M035 BM4 B31 bend-factor authority audit PASS');
