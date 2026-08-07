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
      // #834's RCA cites the general 1.65/h rule. Pressure stiffening is then
      // applied by the existing factor calculator; do not silently opt into
      // the B31J smooth-90 1.3/h note.
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

// The InputXML header carries NUMBEND=12, but the normalized solver geometry
// classifies 11 source segments as BEND. #834's RCA and acceptance language are
// also explicitly based on these 11 bends, so this check binds to the actual
// normalized authority rather than header metadata.
assert.equal(bends.length, 11, 'BM4 normalized geometry must contain the 11 bends qualified by #834.');

const rows = bends.map((segment, index) => {
  const result = calculateB31Factors(bendRequest(authorities, segment, index));
  assert.equal(result.status, 'QUALIFIED', `${segment.id} B31 factor result must qualify.`);
  assert.ok(result.componentFactorSet, `${segment.id} must emit a component flexibility factor set.`);
  assert.equal(result.componentFactorSet.componentType, 'BEND');
  assert.equal(result.componentFactorSet.flexibilityGeometryBasis, 'ARC_GEOMETRY_EXCLUDED_V1');
  assert.equal(result.componentFactorSet.directionalFlexibilityFactors, null);
  assert.equal(result.factors.flexibilityRule.coefficient, 1.65);
  assert.equal(result.factors.flexibilityRule.smooth90CorrectionApplied, false);
  assert.equal(result.factors.flexibility.torsional, 1);
  assert.equal(result.factors.flexibility.inPlane, result.factors.flexibility.outOfPlane);
  assert.ok(result.factors.flexibility.inPlane > 1, `${segment.id} must be more flexible than a straight pipe in bending.`);
  assert.ok(result.factors.unpressurized.flexibility >= result.factors.flexibility.inPlane);
  assert.equal(result.stressFactorSets.length, 1, `${segment.id} must emit one separate stress-factor set.`);
  assert.notEqual(result.componentFactorSet.semanticHash, result.stressFactorSets[0].semanticHash);

  const sourceNodes = [String(segment.startNodeId), String(segment.endNodeId)];
  return Object.freeze({
    sourceSegmentId: segment.id,
    fromNode: sourceNodes[0],
    toNode: sourceNodes[1],
    kRcaUnpressurized: result.factors.unpressurized.flexibility,
    kAppliedInPlane: result.factors.flexibility.inPlane,
    kAppliedOutOfPlane: result.factors.flexibility.outOfPlane,
    torsionalFlexibility: result.factors.flexibility.torsional,
    pressureCorrectionApplied: result.factors.pressureCorrection.applied,
    pressureCorrectionDenominator: result.factors.pressureCorrection.flexibilityDenominator,
    flexibilityRuleId: result.factors.flexibilityRule.ruleId,
    componentFactorSetSemanticHash: result.componentFactorSet.semanticHash,
    stressFactorSetSemanticHash: result.stressFactorSets[0].semanticHash,
    hasM036LiftOffEndpoint: sourceNodes.some((nodeId) => excludedNodes.has(nodeId)),
  });
});

const rcaValues = rows.map((row) => row.kRcaUnpressurized);
const appliedValues = rows.map((row) => row.kAppliedInPlane);
assert.ok(rcaValues.every((value) => value > 1 && Number.isFinite(value)));
assert.ok(appliedValues.every((value) => value > 1 && Number.isFinite(value)));
assert.ok(
  rcaValues.every((value) => value >= 3.65 && value <= 4.15),
  `M035 BM4 unpressurized 1.65/h values must remain near the RCA 3.7-4.1 band; got ${Math.min(...rcaValues)}..${Math.max(...rcaValues)}.`,
);
assert.ok(
  rows.every((row) => row.kAppliedInPlane <= row.kRcaUnpressurized),
  'Pressure correction must not make a qualified bend more flexible than its unpressurized 1.65/h value.',
);
const liftOffEndpointBends = rows.filter((row) => row.hasM036LiftOffEndpoint);
assert.equal(liftOffEndpointBends.length, 1, 'Exactly one BM4 bend must carry the node-20090 M036 endpoint disclosure.');

console.log(JSON.stringify({
  check: 'm035-bm4-bend-factor-authority',
  status: 'PASS',
  editionProfileId: EDITION_PROFILE_ID,
  normalizedBendCount: bends.length,
  liftOffEndpointBends: liftOffEndpointBends.map((row) => row.sourceSegmentId),
  rcaUnpressurizedKRange: { minimum: Math.min(...rcaValues), maximum: Math.max(...rcaValues) },
  appliedPressureCorrectedKRange: { minimum: Math.min(...appliedValues), maximum: Math.max(...appliedValues) },
  rows,
}, null, 2));
console.log('M035 BM4 B31 bend-factor authority audit PASS');
