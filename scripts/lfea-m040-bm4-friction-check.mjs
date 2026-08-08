#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildBm4SolveAuthorities } from './lfea-m034-bm4-solve-fixtures.mjs';
import { BM4_M038_FORCMNT_AUTHORITY } from './lfea-m038-bm4-forcmnt-authority.mjs';
import {
  BM4_M040_FRICTION_AUTHORITY,
  BM4_M040_FRICTION_NODE_IDS,
  BM4_M040_FRICTION_STIFFNESS,
  BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS,
} from './lfea-m040-bm4-friction-authority.mjs';

const FORCE_TOLERANCE = 1e-9;

function frictionRows(geometry) {
  return geometry.nodes.flatMap((node) => (
    (node.meta?.restraints ?? [])
      .filter((restraint) => Number.isFinite(restraint.frictionCoefficient) && restraint.frictionCoefficient > 0)
      .map((restraint) => Object.freeze({
        nodeId: String(node.id),
        sourceTypeCode: restraint.sourceTypeCode,
        typeCode: restraint.typeCode,
        frictionCoefficient: restraint.frictionCoefficient,
        gap: restraint.gap,
        xCosine: restraint.xCosine,
        yCosine: restraint.yCosine,
        zCosine: restraint.zCosine,
      }))
  )).sort((left, right) => Number(left.nodeId) - Number(right.nodeId));
}

function plusYNodes(geometry) {
  return geometry.nodes
    .filter((node) => (node.meta?.restraints ?? []).some((restraint) => restraint.typeCode === '14'))
    .map((node) => String(node.id))
    .sort((left, right) => Number(left) - Number(right));
}

function resolveClosedFormCoulomb({ normalReaction, mu, ux, uz, stiffness }) {
  const normalMagnitude = Math.max(0, normalReaction);
  const coulombLimit = mu * normalMagnitude;
  if (!(normalMagnitude > 0) || !(mu > 0)) {
    return Object.freeze({ state: 'OPEN', fx: 0, fz: 0, magnitude: 0, coulombLimit });
  }

  const trialFx = -stiffness * ux;
  const trialFz = -stiffness * uz;
  const trialMagnitude = Math.hypot(trialFx, trialFz);
  if (trialMagnitude <= coulombLimit + FORCE_TOLERANCE) {
    return Object.freeze({
      state: 'STICK',
      fx: trialFx,
      fz: trialFz,
      magnitude: trialMagnitude,
      coulombLimit,
    });
  }

  const displacementMagnitude = Math.hypot(ux, uz);
  assert.ok(displacementMagnitude > 0, 'SLIP fixture requires nonzero tangential displacement.');
  return Object.freeze({
    state: 'SLIP',
    fx: -coulombLimit * ux / displacementMagnitude,
    fz: -coulombLimit * uz / displacementMagnitude,
    magnitude: coulombLimit,
    coulombLimit,
  });
}

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const authority = BM4_M040_FRICTION_AUTHORITY;
assert.equal(authority.schema, 'm040-bm4-friction-authority/v1');
assert.equal(authority.benchmark, 'BM4');
assert.equal(authority.ownerIssue, 668);
assert.equal(authority.mechanicsChangedByM040, false);

const built = buildBm4SolveAuthorities();
const geometry = built.normalized.geometry;
const rows = frictionRows(geometry);
const sourceNodes = [...new Set(rows.map((row) => row.nodeId))];

assert.equal(rows.length, authority.source.expectedFrictionRowCount);
assert.equal(rows.length, 26);
assert.deepEqual(sourceNodes, [...BM4_M040_FRICTION_NODE_IDS]);
assert.ok(rows.every((row) => row.sourceTypeCode === '17'), 'BM4 friction rows must originate from raw TYPE 17.');
assert.ok(rows.every((row) => row.typeCode === '14'), 'BM4 friction rows must canonicalize to +Y / TYPE 14.');
assert.ok(rows.every((row) => row.frictionCoefficient === 0.3), 'BM4 friction coefficient must be source μ=0.3 at every friction site.');
assert.ok(rows.every((row) => row.gap === null), 'BM4 friction sites must retain unset/zero-gap source semantics.');
assert.ok(rows.every((row) => row.xCosine === 0 && row.yCosine === 1 && row.zCosine === 0), 'BM4 friction normals must be global +Y.');

const allPlusY = plusYNodes(geometry);
assert.equal(allPlusY.length, 29, 'BM4 must expose 29 canonical +Y shoes.');
const frictionlessPlusY = allPlusY.filter((nodeId) => !BM4_M040_FRICTION_NODE_IDS.includes(nodeId));
assert.deepEqual(frictionlessPlusY, [...BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS]);
assert.deepEqual(frictionlessPlusY, ['20300', '20640', '21640']);

near(BM4_M040_FRICTION_STIFFNESS, 175126835.24647635, 1e-6, 'CAESAR default friction stiffness SI conversion');
assert.equal(authority.constitutiveOracle.frictionStiffness.value, 1.0e6);
assert.equal(authority.constitutiveOracle.frictionStiffness.units, 'lbf/in');
assert.equal(authority.constitutiveOracle.requiredStateContract.simultaneousContactAndFriction, true);
assert.equal(authority.constitutiveOracle.requiredStateContract.uniqueAdmissibleStateRequired, true);
assert.equal(authority.constitutiveOracle.requiredStateContract.outputDerivedStateSelectionProhibited, true);
assert.equal(authority.constitutiveOracle.requiredStateContract.zeroFrictionNoOpRequired, true);
assert.deepEqual(authority.constitutiveOracle.requiredStateContract.explicitStates, ['OPEN', 'STICK', 'SLIP']);

const fixtureNormal = 1000;
const fixtureMu = 0.3;
const stickTargetForce = 150;
const stick = resolveClosedFormCoulomb({
  normalReaction: fixtureNormal,
  mu: fixtureMu,
  ux: stickTargetForce / BM4_M040_FRICTION_STIFFNESS,
  uz: 0,
  stiffness: BM4_M040_FRICTION_STIFFNESS,
});
assert.equal(stick.state, 'STICK');
near(stick.magnitude, 150, 1e-9, 'closed-form STICK force');
near(stick.coulombLimit, 300, 1e-12, 'closed-form STICK Coulomb bound');
assert.ok(stick.fx < 0, 'STICK friction must oppose +X displacement.');

const slipTrialForce = 600;
const slip = resolveClosedFormCoulomb({
  normalReaction: fixtureNormal,
  mu: fixtureMu,
  ux: slipTrialForce / BM4_M040_FRICTION_STIFFNESS,
  uz: 0,
  stiffness: BM4_M040_FRICTION_STIFFNESS,
});
assert.equal(slip.state, 'SLIP');
near(slip.magnitude, 300, 1e-9, 'closed-form SLIP Coulomb force');
near(slip.coulombLimit, 300, 1e-12, 'closed-form SLIP Coulomb bound');
assert.ok(slip.fx < 0, 'SLIP friction must oppose +X displacement.');

const open = resolveClosedFormCoulomb({
  normalReaction: 0,
  mu: fixtureMu,
  ux: 1e-3,
  uz: 2e-3,
  stiffness: BM4_M040_FRICTION_STIFFNESS,
});
assert.deepEqual(open, { state: 'OPEN', fx: 0, fz: 0, magnitude: 0, coulombLimit: 0 });

assert.equal(authority.isolatedMechanicsEvidence.issue, 668);
assert.equal(authority.isolatedMechanicsEvidence.pullRequest, 594);
assert.equal(authority.isolatedMechanicsEvidence.productionAuthorityForBm4, false);

const reach = authority.bm4ReachabilityDiagnostic;
near(reach.coulombCapacityN, reach.normalReactionN * authority.source.frictionCoefficient, 1e-6, 'M037 node 22370 Coulomb capacity');
near(reach.requiredCapacityUtilization, reach.adjacentAxialResidualN / reach.coulombCapacityN, 1e-12, 'M037 node 22370 utilization');
assert.ok(reach.requiredCapacityUtilization > 0 && reach.requiredCapacityUtilization < 1);
assert.equal(reach.interpretation, 'REACHABLE_WITHIN_COULOMB_BOUND_NOT_STATE_PROOF');
assert.equal(reach.maySelectStickSlipState, false);
assert.equal(reach.mayAuthorizeProductionActivation, false);

assert.equal(BM4_M038_FORCMNT_AUTHORITY.targetCases.sustained.expression, authority.loadCaseAuthority.sustained);
assert.equal(BM4_M038_FORCMNT_AUTHORITY.targetCases.operating.expression, authority.loadCaseAuthority.operating);
assert.equal(BM4_M038_FORCMNT_AUTHORITY.targetCases.expansion.expression, authority.loadCaseAuthority.expansion);

assert.equal(authority.disposition.sourcePresence, 'BM4_FRICTION_SOURCE_AUTHORITY_CONFIRMED');
assert.equal(authority.disposition.constitutiveOracle, 'BM4_FRICTION_CONSTITUTIVE_ORACLE_AVAILABLE');
assert.equal(authority.disposition.multiContactState, 'BM4_FRICTION_MULTICONTACT_STATE_NOT_YET_QUALIFIED');
assert.equal(authority.disposition.outputFitPolicy, 'BM4_FRICTION_OUTPUT_FIT_PROHIBITED');
assert.equal(authority.disposition.qualifiedBm4Activation, false);
assert.equal(authority.disposition.mechanicsChangedByM040, false);
assert.equal(authority.disposition.nextOwner, 668);

console.log('M040 BM4 friction source/oracle boundary: PASS');
console.log(JSON.stringify({
  schema: authority.schema,
  source: {
    frictionRowCount: rows.length,
    frictionNodeIds: sourceNodes,
    frictionlessPlusYNodeIds: frictionlessPlusY,
    coefficient: authority.source.frictionCoefficient,
    normalAxis: authority.source.normalAxis,
  },
  closedFormOracle: {
    frictionStiffnessNm: BM4_M040_FRICTION_STIFFNESS,
    stick,
    slip,
    open,
  },
  bm4ReachabilityDiagnostic: reach,
  disposition: authority.disposition,
}, null, 2));
