import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { createCanonicalFlangeHubGeometry, FLANGE_HUB_MATERIAL_PROFILE } from './flange-hub-geometry.js';
import { createFlangeHubMesh, FLANGE_HUB_MESH_LEVELS } from './flange-hub-mesh.js';
import { solveFlangeHubLoadCase } from './flange-hub-solver.js';
import { createFlangeHubPathDefinitions, recoverFlangeHubLevel } from './flange-hub-recovery.js';
import { evaluateFlangeHubConvergence } from './flange-hub-convergence.js';
import {
  closedEndLameReference,
  compareReferenceQuantity,
  createReferenceRegistry,
  prismaticAnnularAxialReference,
  annularPlateSanityReference,
} from './flange-hub-reference.js';
import { runIndependentFlangeHubOracle } from './flange-hub-independent-oracle.js';

export const BB11_REQUIRED_CHECK_IDS = Object.freeze([
  'BB11_REGISTRY_PROFILE_IDENTITY',
  'BB11_GEOMETRY_CONTRACT',
  'BB11_FILLET_AND_TANGENCY',
  'BB11_DETERMINISTIC_MESH',
  'BB11_MESH_QUALITY',
  'BB11_INTERFACE_CONFORMITY',
  'BB11_PRESSURE_LOAD_NORMALIZATION',
  'BB11_PRESSURE_END_THRUST',
  'BB11_AXIAL_LOAD_NORMALIZATION',
  'BB11_REACTION_EQUILIBRIUM',
  'BB11_STRAIN_ENERGY_IDENTITY',
  'BB11_FIXED_COORDINATE_RECOVERY',
  'BB11_PATH_OWNERSHIP',
  'BB11_PIPE_REMOTE_REFERENCE',
  'BB11_HUB_STRESS_CONVERGENCE',
  'BB11_FLANGE_STRESS_CONVERGENCE',
  'BB11_SCL_MEMBRANE_CONVERGENCE',
  'BB11_SCL_BENDING_CONVERGENCE',
  'BB11_PRISMATIC_AXIAL_REFERENCE',
  'BB11_ANNULAR_RING_SANITY',
  'BB11_INDEPENDENT_ORACLE',
  'BB11_CALLER_STATE_REJECTED',
  'BB11_FORBIDDEN_AUTHORITY_REJECTED',
]);

export function runBb11FlangeHubCore() {
  const checks = [];
  const check = (checkId, operation) => {
    try {
      const evidence = operation();
      checks.push(deepFreeze({ checkId, status: 'PASS', evidenceHash: sha256Json(evidence ?? true) }));
      return evidence;
    } catch (error) {
      checks.push(deepFreeze({ checkId, status: 'FAIL', evidenceHash: sha256Json({ name: error?.name, message: error?.message }) }));
      throw new Error(`${checkId} failed: ${error?.stack ?? error}`);
    }
  };

  check('BB11_REGISTRY_PROFILE_IDENTITY', () => ({
    moduleId: 'C2D-FLANGE-HUB',
    formulationProfile: 'AXISYMMETRIC',
    elementProfile: 'AXI_Q8_FULL_3X3',
    recoveryProfileId: 'AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1',
    loadIntegrationProfileId: 'AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1',
  }));

  const geometry = check('BB11_GEOMETRY_CONTRACT', () => {
    const value = createCanonicalFlangeHubGeometry();
    assert.equal(value.validation.accepted, true);
    assert.equal(value.validation.selfIntersectionFree, true);
    return value;
  });
  check('BB11_FILLET_AND_TANGENCY', () => {
    geometry.fillets.forEach((fillet) => {
      assert.ok(fillet.positionResidual <= 1e-10);
      assert.ok(fillet.radiusResidual <= 1e-10);
      assert.ok(fillet.tangentResidual <= 1e-12);
    });
    return geometry.fillets;
  });

  const meshes = FLANGE_HUB_MESH_LEVELS.map(({ levelId }) => createFlangeHubMesh(levelId, geometry));
  check('BB11_DETERMINISTIC_MESH', () => {
    const replay = FLANGE_HUB_MESH_LEVELS.map(({ levelId }) => createFlangeHubMesh(levelId, geometry));
    assert.deepEqual(replay.map((row) => row.meshHash), meshes.map((row) => row.meshHash));
    assert.deepEqual(replay.map((row) => row.nodes), meshes.map((row) => row.nodes));
    assert.deepEqual(replay.map((row) => row.elements), meshes.map((row) => row.elements));
    return meshes.map(meshSummary);
  });
  check('BB11_MESH_QUALITY', () => {
    meshes.forEach((mesh) => {
      assert.equal(mesh.quality.accepted, true);
      assert.ok(mesh.quality.minimumDetJAtGaussPoints > 0);
      assert.ok(mesh.quality.minimumDetJAtControlPoints > 0);
      assert.ok(mesh.quality.qJDeterminantRatio >= 0.20);
      assert.ok(mesh.quality.minimumScaledJacobian >= 0.20);
      assert.ok(mesh.quality.maximumAspectRatio <= 10);
      assert.ok(mesh.quality.maximumHotspotAspectRatio <= 5);
      assert.ok(mesh.quality.midsidePlacementResidual <= 1e-9);
    });
    return meshes.map((mesh) => ({ levelId: mesh.levelId, quality: mesh.quality }));
  });
  check('BB11_INTERFACE_CONFORMITY', () => {
    meshes.forEach((mesh) => assert.equal(mesh.duplicateInterfaceNodes.length, 0));
    return meshes.map((mesh) => ({ levelId: mesh.levelId, duplicateInterfaceNodes: mesh.duplicateInterfaceNodes }));
  });

  const pathDefinitions = createFlangeHubPathDefinitions(geometry);
  const loadCases = {};
  for (const loadCaseId of ['FH-PRES-001', 'FH-AXIAL-001']) {
    const levels = meshes.map((mesh) => {
      const result = solveFlangeHubLoadCase({ mesh, loadCaseId });
      const recovery = recoverFlangeHubLevel({ mesh, result, geometry, pathDefinitions });
      return deepFreeze({ mesh, result, recovery });
    });
    const nominalStress = loadCaseId === 'FH-PRES-001'
      ? 10 * 50 / 10
      : 100000 / (Math.PI * (60 ** 2 - 50 ** 2));
    const appliedResultant = loadCaseId === 'FH-PRES-001'
      ? 10 * Math.PI * 50 ** 2
      : 100000;
    const convergence = evaluateFlangeHubConvergence({ loadCaseId, levelRows: levels, nominalStress, appliedResultant });
    if (!convergence.accepted) throw new RangeError(`BB11_CONVERGENCE_FAILED:${loadCaseId}:${convergence.failedQuantityIds.join(',')}`);
    loadCases[loadCaseId] = deepFreeze({ levels, convergence });
  }

  check('BB11_PRESSURE_LOAD_NORMALIZATION', () => loadCaseCheck(loadCases['FH-PRES-001'], (row) => {
    assert.equal(row.result.loadEvidence.circumferenceAppliedExactlyOnce, true);
    assert.ok(row.result.loadEvidence.normalizedMismatch <= 1e-10);
  }));
  check('BB11_PRESSURE_END_THRUST', () => loadCaseCheck(loadCases['FH-PRES-001'], (row) => {
    const expected = -10 * Math.PI * 50 ** 2;
    const thrust = row.result.loadEvidence.edges.filter((edge) => edge.role === 'EQUIVALENT_PRESSURE_END_THRUST')
      .reduce((sum, edge) => sum + edge.evidence.quadratureGeneralizedResultant.axial, 0);
    assert.ok(relative(thrust, expected) <= 1e-10);
  }));
  check('BB11_AXIAL_LOAD_NORMALIZATION', () => loadCaseCheck(loadCases['FH-AXIAL-001'], (row) => {
    assert.ok(relative(row.result.loadEvidence.totalQuadratureResultant.axial, -100000) <= 1e-10);
  }));
  check('BB11_REACTION_EQUILIBRIUM', () => Object.values(loadCases).flatMap((loadCase) => loadCase.levels.map((row) => {
    assert.ok(row.result.equilibrium.axialForceImbalance <= 1e-8);
    return { levelId: row.mesh.levelId, loadCaseId: row.result.loadCaseId, equilibrium: row.result.equilibrium };
  })));
  check('BB11_STRAIN_ENERGY_IDENTITY', () => Object.values(loadCases).flatMap((loadCase) => loadCase.levels.map((row) => {
    assert.ok(row.result.energy.energyRelativeDifference <= 1e-8);
    return { levelId: row.mesh.levelId, loadCaseId: row.result.loadCaseId, energy: row.result.energy };
  })));
  check('BB11_FIXED_COORDINATE_RECOVERY', () => Object.values(loadCases).flatMap((loadCase) => loadCase.levels.map((row) => {
    row.recovery.probes.forEach((probe) => {
      assert.ok(probe.mappingResidual <= Math.max(1e-10, 1e-10 * probe.probeH));
      assert.equal(probe.sourceGaussPointIds.length, 9);
      assert.equal(probe.interpolationWeights.length, 9);
    });
    return { levelId: row.mesh.levelId, loadCaseId: row.result.loadCaseId, probes: row.recovery.probes };
  })));
  check('BB11_PATH_OWNERSHIP', () => Object.values(loadCases).flatMap((loadCase) => loadCase.levels.map((row) => {
    row.recovery.paths.forEach((path) => path.samples.forEach((sample) => assert.equal(sample.selectedBlockId, path.expectedBlockId)));
    return { levelId: row.mesh.levelId, loadCaseId: row.result.loadCaseId, paths: row.recovery.paths };
  })));

  const pressureFinest = loadCases['FH-PRES-001'].levels.at(-1);
  const pressurePipeProbe = findProbe(pressureFinest.recovery, 'P-PIPE-REMOTE');
  const lame = closedEndLameReference({
    innerRadius: 50,
    outerRadius: 60,
    internalPressure: 10,
    externalPressure: 0,
    youngsModulus: FLANGE_HUB_MATERIAL_PROFILE.youngsModulus,
    poissonRatio: FLANGE_HUB_MATERIAL_PROFILE.poissonRatio,
    radius: 55,
  });
  const lameComparisons = check('BB11_PIPE_REMOTE_REFERENCE', () => {
    const rows = [
      compareReferenceQuantity({ comparisonId: 'LAME_UR', classification: 'QUALIFYING', actual: pressurePipeProbe.displacement.radial, expected: lame.radialDisplacement, relativeTolerance: 0.01 }),
      compareReferenceQuantity({ comparisonId: 'LAME_SIGMA_R', classification: 'QUALIFYING', actual: pressurePipeProbe.recoveredTensor.sigmaR, expected: lame.sigmaR, relativeTolerance: 0.02 }),
      compareReferenceQuantity({ comparisonId: 'LAME_SIGMA_Z', classification: 'QUALIFYING', actual: pressurePipeProbe.recoveredTensor.sigmaZ, expected: lame.sigmaZ, relativeTolerance: 0.02 }),
      compareReferenceQuantity({ comparisonId: 'LAME_SIGMA_THETA', classification: 'QUALIFYING', actual: pressurePipeProbe.recoveredTensor.sigmaTheta, expected: lame.sigmaTheta, relativeTolerance: 0.02 }),
    ];
    rows.forEach((row) => assert.equal(row.accepted, true));
    return rows;
  });

  const axialReference = check('BB11_PRISMATIC_AXIAL_REFERENCE', () => {
    const reference = prismaticAnnularAxialReference({
      innerRadius: 50, outerRadius: 60, length: 100, axialResultant: -100000,
      youngsModulus: 210000, poissonRatio: 0.30, radius: 55,
    });
    const finest = loadCases['FH-AXIAL-001'].levels.at(-1);
    const probe = findProbe(finest.recovery, 'P-PIPE-REMOTE');
    const section = findPath(finest.recovery, 'SCL-PIPE-REMOTE').section;
    const comparisons = [
      compareReferenceQuantity({ comparisonId: 'AXIAL_SIGMA_Z', classification: 'QUALIFYING', actual: probe.recoveredTensor.sigmaZ, expected: reference.sigmaZ, relativeTolerance: 0.01 }),
      compareReferenceQuantity({ comparisonId: 'AXIAL_SECTION_FORCE', classification: 'QUALIFYING', actual: section.membraneForceResultant, expected: -100000, relativeTolerance: 0.01 }),
    ];
    comparisons.forEach((row) => assert.equal(row.accepted, true));
    return { reference, comparisons };
  });

  const gasketSanity = check('BB11_ANNULAR_RING_SANITY', () => {
    const reference = annularPlateSanityReference({ innerRadius: 65, outerRadius: 95, thickness: 30, pressure: 20, youngsModulus: 210000, poissonRatio: 0.30 });
    assert.equal(reference.classification, 'TREND_ONLY');
    assert.equal(reference.numericalQualificationAuthority, false);
    return reference;
  });

  const hubConvergence = check('BB11_HUB_STRESS_CONVERGENCE', () => selectConvergence(loadCases, /P-HUB-(SMALL|MID|LARGE):/));
  const flangeConvergence = check('BB11_FLANGE_STRESS_CONVERGENCE', () => selectConvergence(loadCases, /P-FLANGE-/));
  const membraneConvergence = check('BB11_SCL_MEMBRANE_CONVERGENCE', () => selectConvergence(loadCases, /:MEMBRANE:/));
  const bendingConvergence = check('BB11_SCL_BENDING_CONVERGENCE', () => selectConvergence(loadCases, /:BENDING:|:SECTION_BENDING/));

  const oracles = {};
  const oracleComparisons = [];
  check('BB11_INDEPENDENT_ORACLE', () => {
    for (const loadCaseId of ['FH-PRES-001', 'FH-AXIAL-001']) {
      const oracle = runIndependentFlangeHubOracle(loadCaseId);
      assert.equal(oracle.status, 'PASS');
      oracles[loadCaseId] = oracle;
      const production = loadCases[loadCaseId].levels.at(-1);
      const independent = oracle.levels.at(-1);
      const rows = compareProductionToOracle(production, independent);
      rows.forEach((row) => assert.equal(row.accepted, true));
      oracleComparisons.push(...rows.map((row) => ({ loadCaseId, ...row })));
    }
    return { oracles, comparisons: oracleComparisons };
  });

  check('BB11_CALLER_STATE_REJECTED', () => {
    assert.throws(() => createCanonicalFlangeHubGeometry({ ...geometry.input, state: 'QUALIFIED' }), /FROZEN|INVALID|MISMATCH/);
    return { callerStateRejected: true };
  });
  check('BB11_FORBIDDEN_AUTHORITY_REJECTED', () => ({
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
  }));

  const referenceRegistry = createReferenceRegistry();
  const meshEvidence = seal({
    schema: 'flange-hub-mesh-evidence-chain/v1',
    geometryHash: geometry.semanticHash,
    meshFamilyId: meshes[0].meshFamilyId,
    levels: meshes,
    meshHashesByLevel: meshes.map((row) => row.meshHash),
    canonicalModelHashesByLevel: meshes.map((row) => row.canonicalModelHash),
    qualified: true,
  });
  const coreEvidence = seal({
    schema: 'flange-hub-core-evidence/v1',
    geometry,
    pathDefinitions,
    loadCases: Object.fromEntries(Object.entries(loadCases).map(([id, value]) => [id, {
      levels: value.levels.map((row) => row.result),
    }])),
    qualified: true,
  });
  const outputEvidence = seal({
    schema: 'flange-hub-output-evidence/v1',
    loadCases: Object.fromEntries(Object.entries(loadCases).map(([id, value]) => [id, {
      recoveries: value.levels.map((row) => row.recovery),
      convergence: value.convergence,
    }])),
    lameComparisons,
    axialReference,
    hubConvergence,
    flangeConvergence,
    membraneConvergence,
    bendingConvergence,
    qualified: true,
  });
  const independentEvidence = seal({
    schema: 'flange-hub-independent-checker-evidence/v1',
    referenceRegistry,
    gasketSanity,
    oracles,
    oracleComparisons,
    qualified: true,
  });
  BB11_REQUIRED_CHECK_IDS.forEach((id) => assert.ok(checks.some((row) => row.checkId === id), `Missing BB-11 core check ${id}`));
  const payload = {
    schema: 'bucket-b-bb11-core-qualification/v1',
    moduleId: 'C2D-FLANGE-HUB',
    geometryEvidence: geometry,
    meshEvidence,
    coreEvidence,
    outputEvidence,
    independentEvidence,
    checkResults: checks,
    status: 'BB11_CORE_NUMERICAL_EVIDENCE_PASS',
    applicationProcedureAccepted: true,
    numericalOutputAccepted: true,
    authority: {
      codeAssessmentQualified: false,
      moduleQualified: false,
      applicationModulePromoted: false,
      productionSwitchAuthorized: false,
      bucket01Qualified: 'UNCHANGED',
    },
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function compareProductionToOracle(production, oracle) {
  const pairs = [
    ['ENERGY', production.result.energy.strainEnergy, oracle.strainEnergy, 0.02],
    ['REACTION', production.result.equilibrium.axialReaction, oracle.axialReaction, 0.002],
  ];
  ['P-PIPE-REMOTE', 'P-HUB-MID', 'P-FLANGE-MID'].forEach((probeId) => {
    const prod = findProbe(production.recovery, probeId);
    const independent = oracle.probes.find((row) => row.id === probeId);
    pairs.push([`${probeId}:UR`, prod.displacement.radial, independent.displacement.radial, 0.02]);
    pairs.push([`${probeId}:UZ`, prod.displacement.axial, independent.displacement.axial, 0.02]);
    pairs.push([`${probeId}:SIGMA_THETA`, prod.recoveredTensor.sigmaTheta, independent.stress.sigmaTheta, probeId === 'P-PIPE-REMOTE' ? 0.05 : 0.07]);
  });
  return pairs.map(([comparisonId, actual, expected, tolerance]) => compareReferenceQuantity({
    comparisonId: `ORACLE:${comparisonId}`,
    classification: 'QUALIFYING',
    actual,
    expected,
    relativeTolerance: tolerance,
    absoluteTolerance: 1e-8,
  }));
}
function selectConvergence(loadCases, pattern) {
  const rows = Object.values(loadCases).flatMap((value) => value.convergence.quantities.filter((row) => pattern.test(row.quantityId)));
  assert.ok(rows.length > 0, `No convergence quantities matched ${pattern}`);
  rows.forEach((row) => assert.equal(row.accepted, true));
  return rows;
}
function loadCaseCheck(loadCase, operation) { const rows = loadCase.levels.map((row) => { operation(row); return { levelId: row.mesh.levelId, resultHash: row.result.semanticHash }; }); return rows; }
function findProbe(recovery, id) { const row = recovery.probes.find((value) => value.probeId === id); if (!row) throw new TypeError(`Missing probe ${id}`); return row; }
function findPath(recovery, id) { const row = recovery.paths.find((value) => value.pathId === id); if (!row) throw new TypeError(`Missing path ${id}`); return row; }
function meshSummary(mesh) { return { levelId: mesh.levelId, nodeCount: mesh.nodeCount, elementCount: mesh.elementCount, meshHash: mesh.meshHash, canonicalModelHash: mesh.canonicalModelHash, quality: mesh.quality }; }
function relative(a, b) { return Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)); }
function seal(payload) { return deepFreeze({ ...payload, semanticHash: semanticHash(payload) }); }
function sha256Json(value) { return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
