#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  FLANGE_HUB_FROZEN_INPUT,
  FLANGE_HUB_MATERIAL_PROFILE,
  annularArea,
  annularFaceResultantReference,
  annularPlateSanityReference,
  closedEndLameReference,
  createCanonicalFlangeHubGeometry,
  createFlangeHubLoadDefinition,
  createReferenceRegistry,
  prismaticAnnularAxialReference,
} from './index.js';
import { semanticHash } from '../shared-piping-model/index.js';

const exactHeadSha = resolveExactHead();
const checks = [];

function check(checkId, operation) {
  try {
    const evidence = operation();
    checks.push({ checkId, status: 'PASS', evidenceHash: sha256Json(evidence ?? true) });
    return evidence;
  } catch (error) {
    checks.push({
      checkId,
      status: 'FAIL',
      evidenceHash: sha256Json({ name: error?.name, message: error?.message }),
    });
    throw new Error(`${checkId} failed: ${error?.stack ?? error}`);
  }
}

const geometry = check('BB11_GEOMETRY_CONTRACT', () => {
  const value = createCanonicalFlangeHubGeometry();
  assert.equal(value.geometryId, 'BKT-B-FLANGE-GEOMETRY-V1');
  assert.equal(value.unitSystem, 'MM_N_MPA');
  assert.equal(value.validation.accepted, true);
  assert.equal(value.validation.tangentContinuous, true);
  assert.equal(value.validation.selfIntersectionFree, true);
  return value;
});

check('BB11_FILLET_AND_TANGENCY', () => {
  const [small, large] = geometry.fillets;
  assert.ok(Math.abs(small.center.r - 66) <= 1e-12);
  assert.ok(Math.abs(small.center.z + 19.874676603233) <= 1e-12);
  assert.ok(Math.abs(small.firstTangent.r - 60) <= 1e-12);
  assert.ok(small.radiusResidual <= 1e-12);
  assert.ok(small.tangentResidual <= 1e-12);
  assert.ok(Math.abs(large.center.r - 92.32274598504) <= 1e-12);
  assert.ok(Math.abs(large.center.z - 50) <= 1e-12);
  assert.ok(Math.abs(large.secondTangent.z - 60) <= 1e-12);
  assert.ok(large.radiusResidual <= 1e-12);
  assert.ok(large.tangentResidual <= 1e-12);
  return { small, large };
});

check('BB11_GEOMETRY_NEGATIVE_CONTROLS', () => {
  assert.throws(
    () => createCanonicalFlangeHubGeometry({ ...FLANGE_HUB_FROZEN_INPUT, pipeWallThickness: -10 }),
    /FROZEN_VALUE_MISMATCH|INVALID/,
  );
  assert.throws(
    () => createCanonicalFlangeHubGeometry({ ...FLANGE_HUB_FROZEN_INPUT, hubLargeOutsideRadius: 60 }),
    /FROZEN_VALUE_MISMATCH|NONMONOTONIC/,
  );
  assert.throws(
    () => createCanonicalFlangeHubGeometry({ ...FLANGE_HUB_FROZEN_INPUT, unitSystem: 'SI' }),
    /UNIT_MISMATCH/,
  );
  return { negativeThicknessRejected: true, nonmonotonicHubRejected: true, undeclaredUnitsRejected: true };
});

const pressureDefinition = check('BB11_PRESSURE_END_THRUST', () => {
  const definition = createFlangeHubLoadDefinition('FH-PRES-001');
  const expected = 10 * Math.PI * 50 ** 2;
  assert.ok(Math.abs(definition.equivalentEndThrust + expected) <= 1e-10);
  assert.ok(Math.abs(definition.equivalentEndTraction + expected / annularArea(50, 60)) <= 1e-12);
  assert.equal(definition.pressureOutwardNormal[0], -1);
  assert.equal(definition.pressureOutwardNormal[1], 0);
  return definition;
});

check('BB11_AXIAL_LOAD_NORMALIZATION', () => {
  const definition = createFlangeHubLoadDefinition('FH-AXIAL-001');
  const reconstructed = definition.equivalentEndTraction * annularArea(50, 60);
  assert.ok(Math.abs(reconstructed + 100000) <= 1e-10);
  return definition;
});

check('BB11_GASKET_LOAD_NORMALIZATION', () => {
  const definition = createFlangeHubLoadDefinition('FH-GASKET-001');
  const reference = annularFaceResultantReference({ pressure: 20, innerRadius: 65, outerRadius: 95 });
  assert.ok(Math.abs(definition.expectedFaceResultant - reference.axialResultant) <= 1e-10);
  return { definition, reference };
});

check('BB11_PIPE_REMOTE_REFERENCE', () => {
  const reference = closedEndLameReference({
    innerRadius: 50,
    outerRadius: 60,
    internalPressure: 10,
    externalPressure: 0,
    youngsModulus: FLANGE_HUB_MATERIAL_PROFILE.youngsModulus,
    poissonRatio: FLANGE_HUB_MATERIAL_PROFILE.poissonRatio,
    radius: 55,
  });
  assert.ok(reference.sigmaTheta > reference.sigmaZ);
  assert.ok(reference.sigmaZ > 0);
  assert.ok(reference.radialDisplacement > 0);
  return reference;
});

check('BB11_PRISMATIC_AXIAL_REFERENCE', () => {
  const reference = prismaticAnnularAxialReference({
    innerRadius: 50,
    outerRadius: 60,
    length: 100,
    axialResultant: -100000,
    youngsModulus: FLANGE_HUB_MATERIAL_PROFILE.youngsModulus,
    poissonRatio: FLANGE_HUB_MATERIAL_PROFILE.poissonRatio,
    radius: 55,
  });
  assert.ok(reference.sigmaZ < 0);
  assert.ok(reference.axialDisplacement < 0);
  assert.ok(reference.strainEnergy > 0);
  return reference;
});

check('BB11_ANNULAR_RING_SANITY', () => {
  const reference = annularPlateSanityReference({
    innerRadius: 65,
    outerRadius: 95,
    thickness: 30,
    pressure: 20,
    youngsModulus: FLANGE_HUB_MATERIAL_PROFILE.youngsModulus,
    poissonRatio: FLANGE_HUB_MATERIAL_PROFILE.poissonRatio,
  });
  assert.equal(reference.classification, 'TREND_ONLY');
  assert.equal(reference.numericalQualificationAuthority, false);
  return reference;
});

const referenceRegistry = check('BB11_REFERENCE_CUSTODY', () => createReferenceRegistry());

const payload = {
  schema: 'bucket-b-bb11-foundation-evidence/v1',
  exactHeadSha,
  moduleId: 'C2D-FLANGE-HUB',
  implementationStatus: 'FOUNDATION_ONLY_MESH_SOLVER_RECOVERY_AND_QUALIFICATION_PENDING',
  geometryHash: geometry.semanticHash,
  pressureDefinitionHash: pressureDefinition.semanticHash,
  referenceRegistryHash: referenceRegistry.semanticHash,
  checkResults: checks,
  authority: {
    flangeHubApplicationProcedureQualified: false,
    flangeHubNumericalOutputQualified: false,
    bb12Authorized: false,
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
    bucket01Qualified: 'UNCHANGED',
  },
};
process.stdout.write(`${JSON.stringify({ ...payload, semanticHash: semanticHash(payload) }, null, 2)}\n`);

function resolveExactHead() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const expected = process.env.EXPECTED_HEAD_SHA?.trim() || head;
  assert.match(expected, /^[0-9a-f]{40}$/iu);
  assert.equal(head, expected);
  return head;
}
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function sha256Json(value) { return sha256(JSON.stringify(value)); }
