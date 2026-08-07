#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import {
  B31J_BRANCH_SURFACE_RULE,
  B31J_DIRECTIONAL_BRANCH_FORMULATION,
  B31J_DIRECTIONAL_SPRING_RULE,
  compileB31JDirectionalBranchFlexibility,
} from '../src/core/linear-fea-piping-components/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { materialResolution } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';

const sourceEvidence = Object.freeze({ sourceId: 'M035-TEE-GEOMETRY', sourceRevision: '01' });
const mapping = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });

function section(id, outerDiameter, wallThickness) {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId: id,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter,
    wallThickness,
    sourceEvidence: {
      sourceId: 'M035-TEE-SECTION',
      sourceRevision: `${outerDiameter}:${wallThickness}`,
      sourceSemanticHash: semanticHash({ outerDiameter, wallThickness }),
    },
  };
  return resolvePipeSection({
    request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) },
    profile: PIPE_SECTION_PROFILE,
  });
}

function teeFactorRequest({ calculationId, componentId, runOuterDiameter, runWallThickness, branchOuterDiameter, branchWallThickness, fittingQuality = 'UNVERIFIED' }) {
  return calculateB31Factors({
    schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
    calculationId,
    componentId,
    editionProfileId: 'B31_3_2022_B31J_2017',
    componentType: 'WELDING_TEE',
    geometry: {
      schema: COMPONENT_GEOMETRY_SCHEMA,
      componentType: 'WELDING_TEE',
      lengthUnit: 'm',
      runOuterDiameter,
      runWallThickness,
      branchOuterDiameter,
      branchWallThickness,
      fittingQuality,
      sourceEvidence,
    },
    momentDirectionMapping: mapping,
    semanticHash: '',
  });
}

console.log('\n--- M035 generic B31J directional tee flexibility ---');

const runSection = section('M035-TEE-RUN', 0.6096, 0.00953);
const branchSection = section('M035-TEE-BRANCH', 0.508, 0.00953);
const factors = teeFactorRequest({
  calculationId: 'M035-TEE-B31J-CALC',
  componentId: 'M035-TEE-01',
  runOuterDiameter: runSection.dimensions.outerDiameter,
  runWallThickness: runSection.dimensions.wallThickness,
  branchOuterDiameter: branchSection.dimensions.outerDiameter,
  branchWallThickness: branchSection.dimensions.wallThickness,
  fittingQuality: 'VERIFIED_B16_9',
});
assert.equal(factors.status, 'QUALIFIED');
assert.ok(factors.factors.flexibility.run);
assert.ok(factors.factors.flexibility.branch);

// Same nominal NPS can arrive through InputXML as exact-inch versus rounded
// metric OD. This 0.015% representation difference must not turn an equal-size
// tee into branch>run, but the physical frame sections remain exact elsewhere.
const nearEqualNominal = teeFactorRequest({
  calculationId: 'M035-TEE-NOMINAL-ROUNDING',
  componentId: 'M035-TEE-NOMINAL-ROUNDING',
  runOuterDiameter: 0.168274994,
  runWallThickness: 0.0109728,
  branchOuterDiameter: 0.168300003,
  branchWallThickness: 0.0109728,
});
assert.equal(nearEqualNominal.status, 'QUALIFIED');
assert.ok(nearEqualNominal.factors.ratios.branchToRunMeanDiameter <= 1);

const realBranchOverRun = teeFactorRequest({
  calculationId: 'M035-TEE-REAL-BRANCH-OVER-RUN',
  componentId: 'M035-TEE-REAL-BRANCH-OVER-RUN',
  runOuterDiameter: 0.168274994,
  runWallThickness: 0.0109728,
  branchOuterDiameter: 0.169,
  branchWallThickness: 0.0109728,
});
assert.equal(realBranchOverRun.status, 'BLOCKED');
assert.ok(realBranchOverRun.applicability.violations.some((row) => row.field === 'branchOuterDiameter'));

const material = materialResolution();
const junction = compileB31JDirectionalBranchFlexibility({
  componentId: 'M035-TEE-01',
  factorResult: factors,
  junctionPosition: [0, 0, 0],
  legs: [
    { legId: 'RUN-I', nodeId: 'N-I', endPoint: [-1.5, 0, 0], material, section: runSection },
    { legId: 'RUN-J', nodeId: 'N-J', endPoint: [1.5, 0, 0], material, section: runSection },
    { legId: 'BRANCH', nodeId: 'N-B', endPoint: [0, 1.5, 0], material, section: branchSection },
  ],
  frameElementProfile: eulerBernoulliProfile(),
  localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
  runCollinearityTolerance: { value: 1e-9, source: 'M035 deterministic tee topology test' },
});

assert.equal(junction.formulationId, B31J_DIRECTIONAL_BRANCH_FORMULATION);
assert.equal(junction.springRule, B31J_DIRECTIONAL_SPRING_RULE);
assert.equal(junction.geometry.branchSurfaceRule, B31J_BRANCH_SURFACE_RULE);
assert.equal(junction.classification.runLegIds.length, 2);
assert.equal(junction.classification.branchLegIds.length, 1);
assert.equal(junction.flexibilityOwnership.ownerPackageId, 'LFEA-B3.2');
assert.equal(junction.elements.length, 3);
assert.ok(Math.abs(Math.hypot(...junction.geometry.branchSurfaceOffset) - runSection.dimensions.outerDiameter / 2) < 1e-12);

for (const element of junction.elements) {
  assert.ok(element.rotationalSprings.every((spring) => ['RX', 'RY', 'RZ'].includes(spring.dof)));
  assert.ok(element.rotationalSprings.every((spring) => spring.end === 'I'));
  const factorByDof = {
    RX: element.factorValues.torsional,
    RY: element.factorValues.inPlane,
    RZ: element.factorValues.outOfPlane,
  };
  const frame = element.frameElement;
  const D = frame.section.outerDiameter ?? frame.section.dimensions?.outerDiameter ?? (element.role === 'RUN' ? runSection.dimensions.outerDiameter : branchSection.dimensions.outerDiameter);
  const rigidityByDof = {
    RX: frame.material.shearModulus * frame.section.polarMoment,
    RY: frame.material.elasticModulus * frame.section.secondMomentY,
    RZ: frame.material.elasticModulus * frame.section.secondMomentZ,
  };
  for (const dof of ['RX', 'RY', 'RZ']) {
    const spring = element.rotationalSprings.find((row) => row.dof === dof);
    if (factorByDof[dof] <= 1) {
      assert.equal(spring, undefined, `${element.legId} ${dof} must remain rigid when k<=1.`);
    } else {
      assert.ok(spring, `${element.legId} ${dof} must receive the directional rotational spring.`);
      const expected = rigidityByDof[dof] / (factorByDof[dof] * D);
      assert.ok(Math.abs(spring.stiffness / expected - 1) < 1e-12, `${element.legId} ${dof} must satisfy K=rigidity/(k*d).`);
    }
  }
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const a = frame.globalStiffness[row * 12 + column];
      const b = frame.globalStiffness[column * 12 + row];
      assert.ok(Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b)), `${element.legId} stiffness must remain symmetric.`);
    }
  }
}

const branch = junction.elements.find((row) => row.role === 'BRANCH');
assert.ok(branch.rigidOffset, 'Branch flexibility must be located at the run surface through a rigid offset.');
assert.ok(branch.frameElement.limitations.some((row) => row.code === 'FRAME_ELEMENT_LIMITATION_RIGID_OFFSET'));
const runs = junction.elements.filter((row) => row.role === 'RUN');
assert.ok(runs.every((row) => row.rigidOffset === null));

console.log(JSON.stringify({
  check: 'm035-b31j-directional-tee-flexibility',
  status: 'PASS',
  runFactors: factors.factors.flexibility.run,
  branchFactors: factors.factors.flexibility.branch,
  nominalRoundingQualified: nearEqualNominal.status,
  branchOverRunBlocked: realBranchOverRun.status,
  springTargets: junction.flexibilityOwnership.targets,
  branchSurfaceOffset: junction.geometry.branchSurfaceOffset,
  semanticHash: junction.semanticHash,
}, null, 2));
console.log('M035 generic B31J directional tee flexibility PASS');
