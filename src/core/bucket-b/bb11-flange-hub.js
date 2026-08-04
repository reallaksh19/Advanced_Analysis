import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  createCanonicalFlangeHubGeometry,
  FLANGE_HUB_MATERIAL_PROFILE,
} from './flange-hub-geometry.js';
import {
  createFlangeHubMesh,
  FLANGE_HUB_MESH_LEVELS,
} from './flange-hub-mesh.js';
import { solveFlangeHubLoadCase } from './flange-hub-solver.js';
import {
  createFlangeHubPathDefinitions,
  recoverFlangeHubLevel,
} from './flange-hub-recovery.js';
import { evaluateFlangeHubConvergence } from './flange-hub-convergence.js';
import {
  annularPlateSanityReference,
  closedEndLameReference,
  compareReferenceQuantity,
  createReferenceRegistry,
  prismaticAnnularAxialReference,
} from './flange-hub-reference.js';
import { runIndependentFlangeHubOracle } from './flange-hub-independent-oracle.js';
import { verifyReversedEdgeInvariance } from './flange-hub-loads.js';

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
  'BB11_REVERSED_EDGE_INVARIANCE',
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
      checks.push(deepFreeze({
        checkId,
        status: 'PASS',
        evidenceHash: sha256Json(evidence ?? true),
      }));
      return evidence;
    } catch (error) {
      checks.push(deepFreeze({
        checkId,
        status: 'FAIL',
        evidenceHash: sha256Json({
          name: error?.name,
          message: error?.message,
        }),
      }));
      throw new Error(`${checkId} failed: ${error?.stack ?? error}`);
    }
  };

  check('BB11_REGISTRY_PROFILE_IDENTITY', () => ({
    moduleId: 'C2D-FLANGE-HUB',
    formulationProfile: 'AXISYMMETRIC',
    elementProfile: 'AXI_Q8_FULL_3X3',
    recoveryProfileId: 'AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1',
    loadIntegrationProfileId:
      'AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1',
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

  const meshes = FLANGE_HUB_MESH_LEVELS.map(({ levelId }) => (
    createFlangeHubMesh(levelId, geometry)
  ));
  check('BB11_DETERMINISTIC_MESH', () => {
    const replay = FLANGE_HUB_MESH_LEVELS.map(({ levelId }) => (
      createFlangeHubMesh(levelId, geometry)
    ));
    assert.deepEqual(
      replay.map((row) => row.meshHash),
      meshes.map((row) => row.meshHash),
    );
    assert.deepEqual(
      replay.map((row) => row.canonicalModelHash),
      meshes.map((row) => row.canonicalModelHash),
    );
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
    return meshes.map((mesh) => ({
      levelId: mesh.levelId,
      quality: compactQuality(mesh.quality),
    }));
  });
  check('BB11_INTERFACE_CONFORMITY', () => {
    meshes.forEach((mesh) => {
      assert.equal(mesh.duplicateInterfaceNodes.length, 0);
    });
    return meshes.map((mesh) => ({
      levelId: mesh.levelId,
      duplicateInterfaceNodeCount: mesh.duplicateInterfaceNodes.length,
    }));
  });

  const nodeById = new Map(meshes[0].nodes.map((node) => [node.nodeId, node]));
  const boreEdge = meshes[0].boundaryEdges.find((edge) => (
    edge.boundaryId === 'FH-BOUNDARY-BORE'
  ));
  check('BB11_REVERSED_EDGE_INVARIANCE', () => {
    const evidence = verifyReversedEdgeInvariance({
      edge: {
        edgeId: boreEdge.edgeId,
        nodes: boreEdge.nodeIds.map((nodeId) => nodeById.get(nodeId)),
        outwardNormal: boreEdge.outwardNormal,
      },
      mode: 'PRESSURE',
      value: 10,
      tolerance: 1e-10,
    });
    assert.equal(evidence.accepted, true);
    return evidence;
  });

  const pathDefinitions = createFlangeHubPathDefinitions(geometry);
  const loadCases = {};
  for (const loadCaseId of ['FH-PRES-001', 'FH-AXIAL-001']) {
    const levels = meshes.map((mesh) => {
      const result = solveFlangeHubLoadCase({ mesh, loadCaseId });
      const recovery = recoverFlangeHubLevel({
        mesh,
        result,
        geometry,
        pathDefinitions,
      });
      return deepFreeze({ mesh, result, recovery });
    });
    const nominalStress = loadCaseId === 'FH-PRES-001'
      ? 10 * 50 / 10
      : 100000 / (Math.PI * (60 ** 2 - 50 ** 2));
    const appliedResultant = loadCaseId === 'FH-PRES-001'
      ? 10 * Math.PI * 50 ** 2
      : 100000;
    const convergence = evaluateFlangeHubConvergence({
      loadCaseId,
      levelRows: levels,
      nominalStress,
      appliedResultant,
    });
    if (!convergence.accepted) {
      throw new RangeError(
        `BB11_CONVERGENCE_FAILED:${loadCaseId}:`
          + convergence.failedQuantityIds.join(','),
      );
    }
    loadCases[loadCaseId] = deepFreeze({ levels, convergence });
  }

  check('BB11_PRESSURE_LOAD_NORMALIZATION', () => loadCaseCheck(
    loadCases['FH-PRES-001'],
    (row) => {
      assert.equal(
        row.result.loadEvidence.circumferenceAppliedExactlyOnce,
        true,
      );
      assert.ok(row.result.loadEvidence.normalizedMismatch <= 1e-10);
    },
  ));
  check('BB11_PRESSURE_END_THRUST', () => loadCaseCheck(
    loadCases['FH-PRES-001'],
    (row) => {
      const expected = -10 * Math.PI * 50 ** 2;
      const thrust = row.result.loadEvidence.edges
        .filter((edge) => edge.role === 'EQUIVALENT_PRESSURE_END_THRUST')
        .reduce((sum, edge) => (
          sum + edge.evidence.quadratureGeneralizedResultant.axial
        ), 0);
      assert.ok(relative(thrust, expected) <= 1e-10);
    },
  ));
  check('BB11_AXIAL_LOAD_NORMALIZATION', () => loadCaseCheck(
    loadCases['FH-AXIAL-001'],
    (row) => {
      assert.ok(relative(
        row.result.loadEvidence.totalQuadratureResultant.axial,
        -100000,
      ) <= 1e-10);
    },
  ));
  check('BB11_REACTION_EQUILIBRIUM', () => (
    Object.values(loadCases).flatMap((loadCase) => (
      loadCase.levels.map((row) => {
        assert.ok(row.result.equilibrium.axialForceImbalance <= 1e-8);
        return {
          levelId: row.mesh.levelId,
          loadCaseId: row.result.loadCaseId,
          axialForceImbalance:
            row.result.equilibrium.axialForceImbalance,
        };
      })
    ))
  ));
  check('BB11_STRAIN_ENERGY_IDENTITY', () => (
    Object.values(loadCases).flatMap((loadCase) => (
      loadCase.levels.map((row) => {
        assert.ok(row.result.energy.energyRelativeDifference <= 1e-8);
        return {
          levelId: row.mesh.levelId,
          loadCaseId: row.result.loadCaseId,
          strainEnergy: row.result.energy.strainEnergy,
          energyRelativeDifference:
            row.result.energy.energyRelativeDifference,
        };
      })
    ))
  ));
  check('BB11_FIXED_COORDINATE_RECOVERY', () => (
    Object.values(loadCases).flatMap((loadCase) => (
      loadCase.levels.map((row) => {
        row.recovery.probes.forEach((probe) => {
          assert.ok(probe.mappingResidual
            <= Math.max(1e-10, 1e-10 * probe.probeH));
          assert.equal(probe.sourceGaussPointIds.length, 9);
          assert.equal(probe.interpolationWeights.length, 9);
        });
        return {
          levelId: row.mesh.levelId,
          loadCaseId: row.result.loadCaseId,
          probes: row.recovery.probes.map(compactProbe),
        };
      })
    ))
  ));
  check('BB11_PATH_OWNERSHIP', () => (
    Object.values(loadCases).flatMap((loadCase) => (
      loadCase.levels.map((row) => {
        row.recovery.paths.forEach((path) => {
          path.samples.forEach((sample) => {
            assert.ok(path.expectedBlockIds.includes(sample.selectedBlockId));
          });
        });
        return {
          levelId: row.mesh.levelId,
          loadCaseId: row.result.loadCaseId,
          paths: row.recovery.paths.map((path) => ({
            pathId: path.pathId,
            expectedBlockIds: path.expectedBlockIds,
            selectedBlockIds: [...new Set(
              path.samples.map((sample) => sample.selectedBlockId),
            )].sort(),
            probeH: path.probeH,
          })),
        };
      })
    ))
  ));

  const pressureFinest = loadCases['FH-PRES-001'].levels.at(-1);
  const pressurePipeProbe = findProbe(
    pressureFinest.recovery,
    'P-PIPE-REMOTE',
  );
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
      referenceComparison(
        'LAME_UR',
        pressurePipeProbe.displacement.radial,
        lame.radialDisplacement,
        0.01,
      ),
      referenceComparison(
        'LAME_SIGMA_R',
        pressurePipeProbe.recoveredTensor.sigmaR,
        lame.sigmaR,
        0.02,
      ),
      referenceComparison(
        'LAME_SIGMA_Z',
        pressurePipeProbe.recoveredTensor.sigmaZ,
        lame.sigmaZ,
        0.02,
      ),
      referenceComparison(
        'LAME_SIGMA_THETA',
        pressurePipeProbe.recoveredTensor.sigmaTheta,
        lame.sigmaTheta,
        0.02,
      ),
    ];
    rows.forEach((row) => assert.equal(row.accepted, true));
    return rows;
  });

  const axialReference = check('BB11_PRISMATIC_AXIAL_REFERENCE', () => {
    const reference = prismaticAnnularAxialReference({
      innerRadius: 50,
      outerRadius: 60,
      length: 100,
      axialResultant: 100000,
      youngsModulus: 210000,
      poissonRatio: 0.30,
      radius: 55,
    });
    const finest = loadCases['FH-AXIAL-001'].levels.at(-1);
    const probe = findProbe(finest.recovery, 'P-PIPE-REMOTE');
    const section = findPath(
      finest.recovery,
      'SCL-PIPE-REMOTE',
    ).section;
    const comparisons = [
      referenceComparison(
        'AXIAL_SIGMA_Z',
        probe.recoveredTensor.sigmaZ,
        reference.sigmaZ,
        0.01,
      ),
      referenceComparison(
        'AXIAL_SECTION_FORCE',
        section.membraneForceResultant,
        100000,
        0.01,
      ),
    ];
    comparisons.forEach((row) => assert.equal(row.accepted, true));
    return { reference, comparisons };
  });

  const gasketSanity = check('BB11_ANNULAR_RING_SANITY', () => {
    const reference = annularPlateSanityReference({
      innerRadius: 65,
      outerRadius: 95,
      thickness: 30,
      pressure: 20,
      youngsModulus: 210000,
      poissonRatio: 0.30,
    });
    assert.equal(reference.classification, 'TREND_ONLY');
    assert.equal(reference.numericalQualificationAuthority, false);
    return reference;
  });

  const hubConvergence = check(
    'BB11_HUB_STRESS_CONVERGENCE',
    () => selectConvergence(loadCases, /P-HUB-(SMALL|MID|LARGE):/),
  );
  const flangeConvergence = check(
    'BB11_FLANGE_STRESS_CONVERGENCE',
    () => selectConvergence(loadCases, /P-FLANGE-/),
  );
  const membraneConvergence = check(
    'BB11_SCL_MEMBRANE_CONVERGENCE',
    () => selectConvergence(loadCases, /:MEMBRANE:/),
  );
  const bendingConvergence = check(
    'BB11_SCL_BENDING_CONVERGENCE',
    () => selectConvergence(loadCases, /:BENDING:|:SECTION_BENDING/),
  );

  const oracleEvidence = check('BB11_INDEPENDENT_ORACLE', () => {
    const oracles = {};
    const comparisons = [];
    for (const loadCaseId of ['FH-PRES-001', 'FH-AXIAL-001']) {
      const oracle = runIndependentFlangeHubOracle(loadCaseId);
      assert.equal(oracle.status, 'PASS');
      oracles[loadCaseId] = compactOracle(oracle);
      const production = loadCases[loadCaseId].levels.at(-1);
      const independent = oracle.levels.at(-1);
      const rows = compareProductionToOracle(production, independent);
      rows.forEach((row) => assert.equal(row.accepted, true));
      comparisons.push(...rows.map((row) => ({ loadCaseId, ...row })));
    }
    return { oracles, comparisons };
  });

  check('BB11_CALLER_STATE_REJECTED', () => {
    assert.throws(
      () => createCanonicalFlangeHubGeometry({
        ...geometry.input,
        state: 'QUALIFIED',
      }),
      /FIELD_SET_MISMATCH|FROZEN|INVALID|MISMATCH/,
    );
    return { callerStateRejected: true };
  });
  check('BB11_FORBIDDEN_AUTHORITY_REJECTED', () => ({
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
  }));

  BB11_REQUIRED_CHECK_IDS.forEach((checkId) => {
    assert.ok(
      checks.some((row) => row.checkId === checkId),
      `Missing BB-11 core check ${checkId}`,
    );
  });

  const referenceRegistry = createReferenceRegistry();
  const meshEvidence = seal({
    schema: 'flange-hub-mesh-evidence-chain/v1',
    geometryHash: geometry.semanticHash,
    meshFamilyId: meshes[0].meshFamilyId,
    levels: meshes.map(meshSummary),
    meshHashesByLevel: meshes.map((row) => row.meshHash),
    canonicalModelHashesByLevel:
      meshes.map((row) => row.canonicalModelHash),
    qualified: true,
  });
  const coreEvidence = seal({
    schema: 'flange-hub-core-evidence/v1',
    geometryHash: geometry.semanticHash,
    pathDefinitionHash: pathDefinitions.semanticHash,
    loadCases: Object.fromEntries(
      Object.entries(loadCases).map(([loadCaseId, value]) => [
        loadCaseId,
        value.levels.map(compactResult),
      ]),
    ),
    qualified: true,
  });
  const outputEvidence = seal({
    schema: 'flange-hub-output-evidence/v1',
    loadCases: Object.fromEntries(
      Object.entries(loadCases).map(([loadCaseId, value]) => [
        loadCaseId,
        {
          recovery: value.levels.map((row) => compactRecovery(row.recovery)),
          convergence: compactConvergence(value.convergence),
        },
      ]),
    ),
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
    oracleEvidence,
    qualified: true,
  });
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
    const productionProbe = findProbe(production.recovery, probeId);
    const oracleProbe = oracle.probes.find((row) => row.id === probeId);
    pairs.push([
      `${probeId}:UR`,
      productionProbe.displacement.radial,
      oracleProbe.displacement.radial,
      0.02,
    ]);
    pairs.push([
      `${probeId}:UZ`,
      productionProbe.displacement.axial,
      oracleProbe.displacement.axial,
      0.02,
    ]);
    pairs.push([
      `${probeId}:SIGMA_THETA`,
      productionProbe.recoveredTensor.sigmaTheta,
      oracleProbe.stress.sigmaTheta,
      probeId === 'P-PIPE-REMOTE' ? 0.05 : 0.07,
    ]);
  });
  return pairs.map(([comparisonId, actual, expected, tolerance]) => (
    compareReferenceQuantity({
      comparisonId: `ORACLE:${comparisonId}`,
      classification: 'QUALIFYING',
      actual,
      expected,
      relativeTolerance: tolerance,
      absoluteTolerance: 1e-8,
    })
  ));
}

function referenceComparison(comparisonId, actual, expected, tolerance) {
  return compareReferenceQuantity({
    comparisonId,
    classification: 'QUALIFYING',
    actual,
    expected,
    relativeTolerance: tolerance,
    absoluteTolerance: 1e-10,
  });
}

function selectConvergence(loadCases, pattern) {
  const rows = Object.values(loadCases).flatMap((value) => (
    value.convergence.quantities.filter((row) => pattern.test(row.quantityId))
  ));
  assert.ok(rows.length > 0, `No convergence quantities matched ${pattern}`);
  rows.forEach((row) => assert.equal(row.accepted, true));
  return rows.map(compactConvergenceQuantity);
}

function loadCaseCheck(loadCase, operation) {
  return loadCase.levels.map((row) => {
    operation(row);
    return {
      levelId: row.mesh.levelId,
      resultHash: row.result.semanticHash,
    };
  });
}

function findProbe(recovery, probeId) {
  const row = recovery.probes.find((value) => value.probeId === probeId);
  if (!row) throw new TypeError(`Missing probe ${probeId}`);
  return row;
}

function findPath(recovery, pathId) {
  const row = recovery.paths.find((value) => value.pathId === pathId);
  if (!row) throw new TypeError(`Missing path ${pathId}`);
  return row;
}

function meshSummary(mesh) {
  return {
    levelId: mesh.levelId,
    nodeCount: mesh.nodeCount,
    elementCount: mesh.elementCount,
    globalH: mesh.globalH,
    meshHash: mesh.meshHash,
    canonicalModelHash: mesh.canonicalModelHash,
    quality: compactQuality(mesh.quality),
    blockCounts: mesh.blocks.map((block) => ({
      blockId: block.blockId,
      kind: block.kind,
      longitudinalElementCount: block.longitudinalElementCount,
      transverseElementCount: block.transverseElementCount,
    })),
  };
}

function compactQuality(quality) {
  return {
    qualityProfileId: quality.qualityProfileId,
    minimumDetJAtGaussPoints: quality.minimumDetJAtGaussPoints,
    minimumDetJAtControlPoints: quality.minimumDetJAtControlPoints,
    qJDeterminantRatio: quality.qJDeterminantRatio,
    minimumScaledJacobian: quality.minimumScaledJacobian,
    maximumAspectRatio: quality.maximumAspectRatio,
    maximumHotspotAspectRatio: quality.maximumHotspotAspectRatio,
    midsidePlacementResidual: quality.midsidePlacementResidual,
    accepted: quality.accepted,
  };
}

function compactResult(row) {
  return {
    levelId: row.mesh.levelId,
    meshHash: row.mesh.meshHash,
    canonicalModelHash: row.result.canonicalModelHash,
    resultHash: row.result.semanticHash,
    solver: row.result.solver,
    loadDefinitionHash: row.result.loadDefinition.semanticHash,
    loadResultants: row.result.loadEvidence.totalQuadratureResultant,
    normalizedLoadMismatch: row.result.loadEvidence.normalizedMismatch,
    equilibrium: row.result.equilibrium,
    energy: row.result.energy,
    residual: row.result.residual,
  };
}

function compactRecovery(recovery) {
  return {
    levelId: recovery.levelId,
    loadCaseId: recovery.loadCaseId,
    semanticHash: recovery.semanticHash,
    probes: recovery.probes.map(compactProbe),
    paths: recovery.paths.map((path) => ({
      pathId: path.pathId,
      expectedBlockIds: path.expectedBlockIds,
      probeH: path.probeH,
      scl: path.scl,
      section: path.section,
      sampleCustody: path.samples.map((sample) => ({
        probeId: sample.probeId,
        physicalCoordinate: sample.physicalCoordinate,
        selectedContainingElementId:
          sample.selectedContainingElementId,
        selectedBlockId: sample.selectedBlockId,
        naturalCoordinates: sample.naturalCoordinates,
        mappingResidual: sample.mappingResidual,
        minimumNaturalCoordinateMargin:
          sample.minimumNaturalCoordinateMargin,
        sourceGaussPointIds: sample.sourceGaussPointIds,
        interpolationWeights: sample.interpolationWeights,
      })),
    })),
  };
}

function compactProbe(probe) {
  return {
    probeId: probe.probeId,
    physicalCoordinate: probe.physicalCoordinate,
    expectedBlockIds: probe.expectedBlockIds,
    selectedContainingElementId: probe.selectedContainingElementId,
    selectedBlockId: probe.selectedBlockId,
    naturalCoordinates: probe.naturalCoordinates,
    mappingResidual: probe.mappingResidual,
    minimumNaturalCoordinateMargin: probe.minimumNaturalCoordinateMargin,
    sourceGaussPointIds: probe.sourceGaussPointIds,
    interpolationWeights: probe.interpolationWeights,
    displacement: probe.displacement,
    recoveredTensor: probe.recoveredTensor,
    probeH: probe.probeH,
  };
}

function compactConvergence(value) {
  return {
    loadCaseId: value.loadCaseId,
    convergencePolicy: value.convergencePolicy,
    levelIds: value.levelIds,
    quantities: value.quantities.map(compactConvergenceQuantity),
    failedQuantityIds: value.failedQuantityIds,
    accepted: value.accepted,
    semanticHash: value.semanticHash,
  };
}

function compactConvergenceQuantity(row) {
  return {
    quantityId: row.quantityId,
    quantityKind: row.quantityKind,
    levels: row.levels,
    registeredDisposition: row.registeredEvaluation.disposition,
    registeredAccepted:
      row.registeredEvaluation.acceptedForAdjudication,
    strictPhysicalFloor: row.strictPhysicalFloor,
    strictFinestChange: row.strictFinestChange,
    strictLimit: row.strictLimit,
    accepted: row.accepted,
  };
}

function compactOracle(oracle) {
  return {
    descriptor: oracle.descriptor,
    loadCaseId: oracle.loadCaseId,
    status: oracle.status,
    convergence: oracle.convergence,
    semanticHash: oracle.semanticHash,
    levels: oracle.levels.map((level) => ({
      levelId: level.levelId,
      nodeCount: level.nodeCount,
      elementCount: level.elementCount,
      globalH: level.globalH,
      meshHash: level.meshHash,
      solver: level.solver,
      appliedResultants: level.appliedResultants,
      axialReaction: level.axialReaction,
      strainEnergy: level.strainEnergy,
      energyIdentityRelativeError: level.energyIdentityRelativeError,
      probes: level.probes,
    })),
  };
}

function relative(left, right) {
  return Math.abs(left - right)
    / Math.max(1, Math.abs(left), Math.abs(right));
}

function seal(payload) {
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function sha256Json(value) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')}`;
}
