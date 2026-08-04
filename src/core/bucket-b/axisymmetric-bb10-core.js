import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  axisymmetricConstitutiveMatrix,
  axisymmetricQ8Element,
  axisymmetricQ8Map,
  axisymmetricQ8StrainEnergy,
  evaluateAxisymmetricQ8State,
} from './axisymmetric-q8-kernel.js';
import {
  AXISYMMETRIC_INDEPENDENT_ORACLE_DESCRIPTOR,
  oracleAxisymmetricQ8Element,
} from './axisymmetric-independent-oracle.js';
import { Q8_GAUSS_POINTS, q8Shape } from './q8-kernel.js';
import { semanticHash } from '../shared-piping-model/index.js';
import {
  buildPatchSuite,
  formulationMutationEvidence,
  rectangleNodes,
} from './axisymmetric-bb10-patch.js';
import {
  buildCircumferenceCases,
  circumferenceMutationEvidence,
} from './axisymmetric-bb10-load-cases.js';
import { runLameLadder } from './axisymmetric-bb10-lame.js';

export function runCoreQualification() {
  const checks = [];
  const evidenceByCheck = new Map();
  const check = (checkId, operation) => {
    try {
      const evidence = operation();
      const row = Object.freeze({ checkId, status: 'PASS', evidenceHash: sha256Json(evidence ?? true) });
      checks.push(row);
      evidenceByCheck.set(checkId, evidence);
      return evidence;
    } catch (error) {
      checks.push(Object.freeze({ checkId, status: 'FAIL', evidenceHash: sha256Json({ name: error?.name, message: error?.message }) }));
      throw new Error(`${checkId} failed: ${error?.stack ?? error}`);
    }
  };

  const shapeEvidence = check('BB10_AXISYMMETRIC_SHAPE_AND_RADIUS', () => {
    const nodes = rectangleNodes();
    const samples = Q8_GAUSS_POINTS.map((station) => {
      const shape = q8Shape(station.xi, station.eta);
      const mapped = axisymmetricQ8Map(nodes, station.xi, station.eta);
      assert.ok(Math.abs(shape.N.reduce((sum, value) => sum + value, 0) - 1) < 1e-13);
      assert.ok(mapped.r >= 40 && mapped.r <= 80);
      assert.ok(mapped.determinant > 0);
      return {
        pointId: station.pointId,
        partitionResidual: shape.N.reduce((sum, value) => sum + value, 0) - 1,
        radius: mapped.r,
        determinant: mapped.determinant,
      };
    });
    return { samples, sampleHash: semanticHash(samples) };
  });

  const constitutiveEvidence = check('BB10_AXISYMMETRIC_CONSTITUTIVE', () => {
    const production = axisymmetricConstitutiveMatrix({ youngsModulus: 210000, poissonRatio: 0.3 });
    const oracle = oracleAxisymmetricQ8Element({
      nodes: rectangleNodes(),
      material: { youngsModulus: 210000, poissonRatio: 0.3 },
    }).D;
    const comparison = compareMatrices(production, oracle);
    assert.ok(comparison.maximumAbsoluteDifference <= 1e-10);
    assert.ok(comparison.maximumRelativeDifference <= 1e-13);
    assert.ok(matrixSymmetryResidual(production) <= 1e-12);
    return { comparison, productionHash: semanticHash(production), oracleHash: semanticHash(oracle) };
  });

  const patchSuite = buildPatchSuite();
  const rectangularOracle = check('BB10_AXISYMMETRIC_RECTANGULAR_ORACLE', () => {
    assert.ok(patchSuite.rectangular.maximumStiffnessRelativeDifference <= 1e-12);
    assert.ok(patchSuite.rectangular.maximumBAbsoluteDifference <= 1e-13);
    return patchSuite.rectangular;
  });
  const distortedOracle = check('BB10_AXISYMMETRIC_DISTORTED_ORACLE', () => {
    assert.ok(patchSuite.distorted.genuinelyDistorted);
    assert.ok(patchSuite.distorted.minimumDeterminant > 0);
    assert.ok(patchSuite.distorted.maximumStiffnessRelativeDifference <= 5e-12);
    assert.ok(patchSuite.distorted.maximumBAbsoluteDifference <= 2e-13);
    return patchSuite.distorted;
  });
  const constantPatch = check('BB10_CONSTANT_STRAIN_PATCH', () => {
    assert.equal(patchSuite.fields.length, 4);
    patchSuite.fields.forEach((field) => {
      assert.ok(field.maximumStrainAbsoluteError <= 2e-13);
      assert.ok(field.maximumStressRelativeError <= 2e-12);
      assert.ok(field.maximumInternalForceRelativeDifference <= 3e-12);
      assert.ok(field.maximumEnergyRelativeDifference <= 5e-10);
    });
    const negativeControls = formulationMutationEvidence();
    assert.ok(negativeControls.missingHoopRow.relativeStrainError > 0.99);
    assert.ok(negativeControls.planarConstitutive.relativeStressError > 0.05);
    assert.ok(negativeControls.incorrectEngineeringShear.relativeStressError > 0.99);
    assert.ok(negativeControls.incorrectStressOrdering.relativeStressError > 0.05);
    return {
      fields: patchSuite.fields,
      negativeControls,
      patchHash: semanticHash(patchSuite),
    };
  });

  const axialTranslation = check('BB10_AXIAL_TRANSLATION_ZERO_ENERGY', () => {
    const nodes = rectangleNodes();
    const material = { youngsModulus: 210000, poissonRatio: 0.3 };
    const displacement = nodes.flatMap(() => [0, 3.25]);
    const states = evaluateAxisymmetricQ8State({ nodes, material, displacementVector: displacement });
    const maximumStrain = maximumAbsolute(states.flatMap((row) => row.strainVector));
    const energy = axisymmetricQ8StrainEnergy({ nodes, material, displacementVector: displacement });
    assert.ok(maximumStrain <= 1e-14);
    assert.ok(Math.abs(energy) <= 1e-7);
    return { maximumStrain, energy };
  });

  const radialTranslation = check('BB10_RADIAL_TRANSLATION_NOT_RIGID', () => {
    const nodes = rectangleNodes();
    const material = { youngsModulus: 210000, poissonRatio: 0.3 };
    const displacement = nodes.flatMap(() => [1, 0]);
    const states = evaluateAxisymmetricQ8State({ nodes, material, displacementVector: displacement });
    const energy = axisymmetricQ8StrainEnergy({ nodes, material, displacementVector: displacement });
    states.forEach((row) => {
      assert.ok(Math.abs(row.strain.epsilonR) <= 1e-14);
      assert.ok(Math.abs(row.strain.epsilonZ) <= 1e-14);
      assert.ok(Math.abs(row.strain.gammaRZ) <= 1e-14);
      assert.ok(Math.abs(row.strain.epsilonTheta - 1 / row.radius) <= 1e-13);
    });
    assert.ok(energy > 0);
    return { energy, hoopStrains: states.map((row) => ({ pointId: row.pointId, radius: row.radius, epsilonTheta: row.strain.epsilonTheta })) };
  });

  const circumferenceCases = buildCircumferenceCases();
  check('BB10_FULL_CIRCUMFERENCE_CYLINDRICAL_PRESSURE', () => circumferenceCases.cylindrical);
  check('BB10_FULL_CIRCUMFERENCE_ANNULAR_AXIAL_LOAD', () => circumferenceCases.annular);
  check('BB10_FULL_CIRCUMFERENCE_VARIABLE_LOAD', () => circumferenceCases.variable);

  const lameEvidence = runLameLadder();
  check('BB10_LAME_PRESSURE_BOUNDARY_NORMALIZATION', () => {
    lameEvidence.levels.forEach((level) => {
      assert.ok(level.pressureBoundary.innerRelativeError <= 1e-12);
      assert.ok(level.pressureBoundary.outerRelativeError <= 1e-12);
    });
    return lameEvidence.levels.map((row) => ({ levelId: row.levelId, pressureBoundary: row.pressureBoundary }));
  });
  check('BB10_LAME_DISPLACEMENT_CONVERGENCE', () => {
    assert.ok(lameEvidence.displacementConvergence.maximumFinestLevelChange <= 0.005);
    assert.ok(lameEvidence.displacementConvergence.maximumAnalyticalError <= 0.01);
    return lameEvidence.displacementConvergence;
  });
  check('BB10_LAME_STRESS_CONVERGENCE', () => {
    assert.ok(lameEvidence.stressConvergence.maximumFinestLevelChange <= 0.02);
    assert.ok(lameEvidence.stressConvergence.maximumAnalyticalError <= 0.03);
    assert.ok(lameEvidence.stressConvergence.maximumTauAbsolute <= 1e-8);
    return lameEvidence.stressConvergence;
  });
  check('BB10_LAME_ENERGY', () => {
    assert.ok(lameEvidence.energyConvergence.finestLevelChange <= 0.005);
    assert.ok(lameEvidence.energyConvergence.analyticalError <= 0.01);
    assert.ok(lameEvidence.energyConvergence.virtualWorkRelativeError <= 1e-9);
    return lameEvidence.energyConvergence;
  });
  check('BB10_LAME_AXIAL_REACTION_RESULTANT', () => {
    assert.ok(lameEvidence.axialReaction.maximumRelativeError <= 1e-8);
    return lameEvidence.axialReaction;
  });

  check('BB10_AXIS_RADIUS_REJECTION', () => {
    const zeroRadius = rectangleNodes().map((node) => ({ ...node, r: node.r - 40 }));
    assert.throws(() => axisymmetricQ8Element({
      nodes: zeroRadius,
      material: { youngsModulus: 210000, poissonRatio: 0.3 },
    }), /RADIUS/);
    const inverted = rectangleNodes().map((node) => ({ ...node }));
    [inverted[1], inverted[3]] = [inverted[3], inverted[1]];
    assert.throws(() => axisymmetricQ8Element({
      nodes: inverted,
      material: { youngsModulus: 210000, poissonRatio: 0.3 },
    }), /JACOBIAN/);
    return { zeroRadiusRejected: true, nonpositiveJacobianRejected: true };
  });

  const circumferenceMutation = circumferenceMutationEvidence();
  check('BB10_MISSING_CIRCUMFERENCE_REJECTED', () => {
    assert.ok(circumferenceMutation.missingLoadRelativeError > 0.9);
    assert.ok(circumferenceMutation.missingStiffnessRelativeDifference > 0.9);
    return circumferenceMutation;
  });
  check('BB10_DOUBLE_CIRCUMFERENCE_REJECTED', () => {
    assert.ok(circumferenceMutation.doubleLoadRelativeError > 1);
    assert.ok(circumferenceMutation.doubleStiffnessRelativeDifference > 1);
    return circumferenceMutation;
  });

  const independentComparisons = [
    comparisonRow('RECTANGULAR_STIFFNESS', rectangularOracle),
    comparisonRow('DISTORTED_STIFFNESS', distortedOracle),
    comparisonRow('GAUSS_POINT_B_MATRICES', {
      rectangularMaximum: rectangularOracle.maximumBAbsoluteDifference,
      distortedMaximum: distortedOracle.maximumBAbsoluteDifference,
    }),
    comparisonRow('GAUSS_POINT_RADII', {
      rectangularMaximum: rectangularOracle.maximumRadiusAbsoluteDifference,
      distortedMaximum: distortedOracle.maximumRadiusAbsoluteDifference,
    }),
    comparisonRow('MANUFACTURED_STRAINS', constantPatch.fields.map((row) => ({ fieldId: row.fieldId, error: row.maximumStrainAbsoluteError }))),
    comparisonRow('MANUFACTURED_STRESSES', constantPatch.fields.map((row) => ({ fieldId: row.fieldId, error: row.maximumStressRelativeError }))),
    comparisonRow('INTERNAL_FORCES', constantPatch.fields.map((row) => ({ fieldId: row.fieldId, error: row.maximumInternalForceRelativeDifference }))),
    comparisonRow('STRAIN_ENERGY', { patch: constantPatch.fields.map((row) => row.maximumEnergyRelativeDifference), lame: lameEvidence.energyConvergence.analyticalError }),
    comparisonRow('EDGE_LOADS', circumferenceCases),
    comparisonRow('LAME_FIELD_VALUES', {
      displacement: lameEvidence.displacementConvergence,
      stress: lameEvidence.stressConvergence,
      energy: lameEvidence.energyConvergence,
    }),
  ];

  const caseA = caseEvidence('AXI-Q8-REG-001-A', {
    shapeEvidence,
    constitutiveEvidence,
    rectangularOracle,
    distortedOracle,
    constantPatch,
    axialTranslation,
    radialTranslation,
  });
  const caseB = caseEvidence('AXI-Q8-REG-001-B', lameEvidence);
  const caseC = caseEvidence('AXI-Q8-REG-001-C', circumferenceCases);
  const payload = {
    schema: 'bucket-b-bb10-core-evidence/v1',
    oracleDescriptor: AXISYMMETRIC_INDEPENDENT_ORACLE_DESCRIPTOR,
    cases: [caseA, caseB, caseC],
    independentComparisons,
    checkResults: checks,
    numericalEvidence: {
      patchSuite,
      circumferenceCases,
      lameEvidence,
      circumferenceMutation,
    },
    authority: {
      axisymmetricFormulationEvidenceOnly: true,
      flangeHubApplicationQualified: false,
      codeAssessmentQualified: false,
      moduleQualified: false,
      productionSwitchAuthorized: false,
      bucket01Qualified: 'UNCHANGED',
    },
  };
  return { ...payload, semanticHash: semanticHash(payload) };
}

function comparisonRow(comparisonId, evidence) { return { comparisonId, status: 'PASS', evidenceHash: sha256Json(evidence) }; }
function caseEvidence(caseId, evidence) {
  const raw = JSON.stringify(evidence);
  return { caseId, status: 'PASS', semanticEvidenceHash: semanticHash(evidence), rawEvidenceHash: sha256(raw) };
}
function compareMatrices(left, right) {
  let maximumAbsoluteDifference = 0; let referenceMaximumMagnitude = 0;
  for (let row = 0; row < left.length; row += 1) for (let column = 0; column < left[row].length; column += 1) {
    maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, Math.abs(left[row][column] - right[row][column]));
    referenceMaximumMagnitude = Math.max(referenceMaximumMagnitude, Math.abs(right[row][column]));
  }
  return { maximumAbsoluteDifference, maximumRelativeDifference: maximumAbsoluteDifference / Math.max(1, referenceMaximumMagnitude) };
}
function matrixSymmetryResidual(matrix) {
  let residual = 0;
  for (let row = 0; row < matrix.length; row += 1) for (let column = row + 1; column < matrix.length; column += 1) residual = Math.max(residual, Math.abs(matrix[row][column] - matrix[column][row]));
  return residual;
}
function maximumAbsolute(values) { return Math.max(...values.map((value) => Math.abs(value))); }
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function sha256Json(value) { return sha256(JSON.stringify(value)); }
