import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BB09_LEVELS,
  BB09_MODULE,
  CONVERGENCE_DISPOSITIONS,
  createBb09Evidence,
  createBb09Procedure,
  createBb09Report,
  evaluateConvergence,
  evaluateQ8Quality,
  integrateVariableEdgeLoad,
  invertQ8Mapping,
  q8Shape,
  recoverAtPhysicalCoordinate,
  validateBb08Report,
  validateBb09Report,
} from './index.js';
import {
  QUALIFICATION_STATES,
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
} from '../local-continuum/index.js';
import { buildBoundaryEdges } from '../local-continuum/assembly.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const exactHeadSha = resolveExactHead();
const bb08ReportPath = resolve(
  ROOT,
  process.env.BB08_REPORT_PATH
    ?? 'reports/bucket-b-bb08-pipe-pad-report.json',
);
const reportPath = resolve(
  ROOT,
  process.env.BB09_REPORT_PATH
    ?? 'reports/bucket-b-bb09-nozzle-repad-report.json',
);
const diagnosticPath = resolve(
  ROOT,
  process.env.BB09_DIAGNOSTIC_PATH
    ?? 'reports/bucket-b-bb09-nozzle-repad-diagnostic.json',
);
const bb08Report = JSON.parse(readFileSync(bb08ReportPath, 'utf8'));
validateBb08Report(bb08Report);
const procedure = createBb09Procedure({ bb08Report, exactHeadSha });
const checks = [];

const GL8 = Object.freeze([
  Object.freeze([-0.9602898564975363, 0.1012285362903763]),
  Object.freeze([-0.7966664774136267, 0.2223810344533745]),
  Object.freeze([-0.5255324099163290, 0.3137066458778873]),
  Object.freeze([-0.1834346424956498, 0.3626837833783620]),
  Object.freeze([0.1834346424956498, 0.3626837833783620]),
  Object.freeze([0.5255324099163290, 0.3137066458778873]),
  Object.freeze([0.7966664774136267, 0.2223810344533745]),
  Object.freeze([0.9602898564975363, 0.1012285362903763]),
]);

try {
  await run();
} catch (error) {
  writeDiagnostic({
    status: 'BB09_QUALIFICATION_FAILED',
    error: {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
    },
  });
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}

async function run() {
  await check('BB09_BB08_SAME_HEAD_AUTHORITY', () => {
    assert.equal(bb08Report.exactHeadSha, exactHeadSha);
    assert.equal(bb08Report.bb09Authorized, true);
    assert.equal(procedure.bb08ReportHash, bb08Report.semanticHash);
    return {
      exactHeadSha,
      bb08ReportHash: bb08Report.semanticHash,
    };
  });

  await check('BB09_PROCEDURE_AUTHORITY', () => {
    assert.equal(
      procedure.module.moduleId,
      'C2D-NOZZLE-REPAD-SECTION',
    );
    assert.equal(procedure.module.formulationProfile, 'PLANE_STRAIN');
    assert.equal(procedure.module.elementProfile, 'Q8_FULL_3X3');
    assert.equal(procedure.applicationExecutionAuthorized, true);
    assert.equal(procedure.codeAssessmentAuthorized, false);
    assert.equal(procedure.moduleQualificationAuthorized, false);
    assert.equal(procedure.applicationModulePromotionAuthorized, false);
    assert.equal(procedure.productionSwitchAuthorized, false);
    assert.equal(procedure.bb12PlanarIntakeAuthorized, false);
    assert.equal(procedure.bb12Authorized, false);
    return { procedureHash: procedure.semanticHash };
  });

  const manufacturedFieldEvidence = await check(
    'BB09_PLANE_STRAIN_MANUFACTURED_FIELD',
    executeManufacturedField,
  );

  const stripReferenceEvidence = await check(
    'BB09_PLANE_STRAIN_STRIP_REFERENCE',
    executeStripReference,
  );

  const moduleEvidence = await check(
    'BB09_FOUR_LEVEL_NOZZLE_REPAD_EXECUTION',
    () => executeApplication({
      manufacturedFieldEvidence,
      stripReferenceEvidence,
    }),
  );

  await check('BB09_LOAD_AND_REACTION_EQUILIBRIUM', () => {
    moduleEvidence.levels.forEach((level) => {
      assertResultantBalance(
        level.pressureCase.appliedResultant,
        level.pressureCase.supportReaction,
        1e-6,
      );
      assertResultantBalance(
        level.axialCase.appliedResultant,
        level.axialCase.supportReaction,
        1e-5,
      );
      assert.equal(level.pressureCase.equilibriumAccepted, true);
      assert.equal(level.pressureCase.energyAccepted, true);
      assert.equal(level.axialCase.equilibriumAccepted, true);
      assert.equal(level.axialCase.energyAccepted, true);
    });
    return moduleEvidence.levels.map((level) => ({
      levelId: level.levelId,
      pressure: {
        applied: level.pressureCase.appliedResultant,
        reaction: level.pressureCase.supportReaction,
      },
      axial: {
        applied: level.axialCase.appliedResultant,
        reaction: level.axialCase.supportReaction,
      },
    }));
  });

  await check('BB09_FIXED_HOST_PAD_PATH_DECOMPOSITION', () => {
    const finest = moduleEvidence.levels.at(-1);
    assert.equal(finest.pressureCase.hostPadPath.samples.length, 16);
    assert.ok(Number.isFinite(
      finest.pressureCase.hostPadPath.normalMembrane,
    ));
    assert.ok(Number.isFinite(
      finest.pressureCase.hostPadPath.normalBendingSurfaceAmplitude,
    ));
    assert.ok(Number.isFinite(
      finest.pressureCase.hostPadPath.normalPeakResidual,
    ));
    assert.equal(
      moduleEvidence.pathMembraneConvergence.acceptedForAdjudication,
      true,
    );
    assert.equal(
      moduleEvidence.pathBendingConvergence.acceptedForAdjudication,
      true,
    );
    return {
      path: finest.pressureCase.hostPadPath,
      membraneConvergence: moduleEvidence.pathMembraneConvergence,
      bendingConvergence: moduleEvidence.pathBendingConvergence,
    };
  });

  await check('BB09_INTERFACE_COMPATIBILITY', () => {
  moduleEvidence.levels.forEach((level) => {
    const evidence = level.pressureCase.interfaceEvidence;
    assert.equal(level.duplicateNodeCount, 0);
    assert.equal(evidence.allInterfaceNodesShared, true);
    assert.equal(evidence.maximumSharedDofDisplacementMismatch, 0);
    evidence.interfaceGroups.forEach((group) => {
      assert.equal(group.nodeCount, group.expectedNodeCount);
      assert.equal(group.allNodesContainExpectedRegions, true);
      assert.equal(group.allNodesHaveSingleGlobalDisplacement, true);
      assert.equal(group.maximumSharedDofDisplacementMismatch, 0);
    });
    evidence.offsetStressGradientDiagnostics.forEach((row) => {
      assert.equal(row.acceptanceAuthority, false);
      assert.ok(Number.isFinite(row.gradientMagnitude));
      assert.ok(Number.isFinite(row.gradientNormalized));
    });
  });
  return moduleEvidence.levels.map((level) => ({
    levelId: level.levelId,
    interfaceEvidence: level.pressureCase.interfaceEvidence,
  }));
});

  await check('BB09_CALLER_STATUS_TAMPER_REJECTED', () => {
    const provisionalEvidence = createBb09Evidence({
      procedure,
      moduleEvidence,
    });
    const provisionalReport = createBb09Report({
      evidence: provisionalEvidence,
      checkResults: [
        ...checks,
        {
          checkId: 'BB09_PROVISIONAL_REPORT',
          status: 'PASS',
          evidenceHash: sha256('provisional'),
        },
      ],
    });
    assert.throws(
      () => validateBb09Report({
        ...provisionalReport,
        bb12PlanarIntakeAuthorized: false,
      }),
      /authorization|hash/i,
    );
    assert.throws(
      () => validateBb09Report({
        ...provisionalReport,
        bb12Authorized: true,
      }),
      /authority|hash/i,
    );
    assert.throws(
      () => validateBb09Report({
        ...provisionalReport,
        codeAssessmentQualified: true,
      }),
      /authority|hash/i,
    );
    const { applicationModulePromoted, ...missingFalse } =
      provisionalReport;
    assert.throws(
      () => validateBb09Report(missingFalse),
      /authority|hash/i,
    );
    assert.throws(
      () => validateBb09Report({
        ...provisionalReport,
        semanticHash: sha256('stale'),
      }),
      /hash/i,
    );
    return { rejected: true };
  });

  const evidence = createBb09Evidence({ procedure, moduleEvidence });
  const report = createBb09Report({
    evidence,
    checkResults: [...checks],
  });
  validateBb09Report(report);
  assert.equal(report.status, 'BB09_PROCEDURE_QUALIFIED');
  assert.equal(report.bb12PlanarIntakeAuthorized, true);
  assert.equal(report.bb12Authorized, false);
  assert.equal(report.codeAssessmentQualified, false);
  assert.equal(report.moduleQualified, false);
  assert.equal(report.applicationModulePromoted, false);
  assert.equal(report.productionSwitchAuthorized, false);

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeDiagnostic({
    status: report.status,
    reportSemanticHash: report.semanticHash,
    evidenceSemanticHash: evidence.semanticHash,
  });
  console.log(JSON.stringify(report, null, 2));
}

async function check(checkId, operation) {
  try {
    const evidence = await operation();
    checks.push(Object.freeze({
      checkId,
      status: 'PASS',
      evidenceHash: hash(evidence ?? true),
    }));
    return evidence;
  } catch (error) {
    checks.push(Object.freeze({
      checkId,
      status: 'FAIL',
      evidenceHash: hash({
        name: error?.name,
        message: error?.message,
      }),
    }));
    throw new Error(`${checkId} failed: ${error?.stack ?? error}`);
  }
}

function executeManufacturedField() {
  const mesh = nozzleRepadMesh(BB09_LEVELS[1]);
  const boundary = buildBoundaryEdges(mesh.elements);
  const boundaryNodeIds = [...new Set(
    boundary.flatMap((edge) => edge.edgeNodeSequence),
  )].sort();
  const epsilonX = 8.0e-5;
  const epsilonY = -2.5e-5;
  const gammaXY = 1.5e-5;
  const constraints = boundaryNodeIds.flatMap((nodeId) => {
    const node = mesh.nodesById.get(nodeId);
    return [
      prescribed(
        nodeId,
        'UX',
        epsilonX * node.x + 0.5 * gammaXY * node.y,
        'AFFINE',
      ),
      prescribed(
        nodeId,
        'UY',
        0.5 * gammaXY * node.x + epsilonY * node.y,
        'AFFINE',
      ),
    ];
  });
  const model = canonicalModel({
    mesh,
    modelIdentity: 'C2D-NOZZLE-REPAD-SECTION-AFFINE',
    constraints,
    loadCases: [emptyLoadCase('AFFINE_FIELD')],
    limitations: ['MANUFACTURED_FIELD_ONLY'],
  });
  const result = calculateLocalContinuum(model);
  assert.equal(
    result.qualification.state,
    QUALIFICATION_STATES.ACCEPTED,
    JSON.stringify(result.diagnostics),
  );
  const expected = planeStrain(
    BB09_MODULE.material,
    [epsilonX, epsilonY, gammaXY],
  );
  let maximumStrainResidual = 0;
  let maximumStressResidual = 0;
  result.loadCaseResults[0].elementResults.forEach((element) => {
    element.gaussPointResults.forEach((point) => {
      const strain = [
        point.strain.epsilonX,
        point.strain.epsilonY,
        point.strain.gammaXY,
      ];
      const stress = [
        point.stress.sigmaX,
        point.stress.sigmaY,
        point.stress.tauXY,
      ];
      maximumStrainResidual = Math.max(
        maximumStrainResidual,
        maxRelative(
          strain,
          [epsilonX, epsilonY, gammaXY],
        ),
      );
      maximumStressResidual = Math.max(
        maximumStressResidual,
        maxRelative(stress, expected),
      );
    });
  });
  assert.ok(maximumStrainResidual <= 1e-8, maximumStrainResidual);
  assert.ok(maximumStressResidual <= 1e-8, maximumStressResidual);
  return Object.freeze({
    profileId: 'BB09_AFFINE_PLANE_STRAIN_FIELD_V1',
    levelId: BB09_LEVELS[1].levelId,
    meshSemanticHash: model.semanticHash,
    resultSemanticHash: result.semanticHash,
    expectedStrain: Object.freeze([
      epsilonX,
      epsilonY,
      gammaXY,
    ]),
    expectedStress: Object.freeze(expected),
    maximumStrainResidual,
    maximumStressResidual,
    qualified: true,
  });
}

function executeStripReference() {
  const length = 40;
  const height = 20;
  const pressure = 5;
  const builder = meshBuilder();
  addRectBlock(builder, {
    prefix: 'STRIP',
    x0: 0,
    x1: length,
    y0: 0,
    y1: height,
    xElements: 8,
    yElements: 4,
    regionId: 'REFERENCE',
  });
  const mesh = builder.finish();
  const boundary = buildBoundaryEdges(mesh.elements);
  const rightEdges = boundary.filter((edge) => edge.edgeNodeSequence.every(
    (nodeId) => near(mesh.nodesById.get(nodeId).x, length),
  ));
  assert.ok(rightEdges.length > 0);
  const pressureLoads = rightEdges.map((edge, index) => ({
    pressureLoadId: `STRIP-P-${index + 1}`,
    elementId: edge.elementId,
    edgeNodeIds: edge.edgeNodeIds,
    pressure,
    sourceReference: `BB09#STRIP#PRESSURE-${index + 1}`,
  }));
  const constraints = mesh.nodes.flatMap((node) => [
    prescribed(node.nodeId, 'UY', 0, 'STRIP_EY_ZERO'),
    ...(near(node.x, 0)
      ? [prescribed(node.nodeId, 'UX', 0, 'STRIP_LEFT')]
      : []),
  ]);
  const model = canonicalModel({
    mesh,
    modelIdentity: 'BB09-PLANE-STRAIN-STRIP',
    constraints,
    loadCases: [{
      ...emptyLoadCase('UNIAXIAL_PRESSURE'),
      pressureLoads,
    }],
    limitations: ['ANALYTICAL_UNIAXIAL_REFERENCE_ONLY'],
  });
  const result = calculateLocalContinuum(model);
  assert.equal(
    result.qualification.state,
    QUALIFICATION_STATES.ACCEPTED,
    JSON.stringify(result.diagnostics),
  );
  const loadCase = result.loadCaseResults[0];
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);

  const E = BB09_MODULE.material.elasticModulus;
  const nu = BB09_MODULE.material.poissonRatio;
  const lambda = E * nu / ((1 + nu) * (1 - 2 * nu));
  const shear = E / (2 * (1 + nu));
  const c11 = lambda + 2 * shear;
  const epsilonX = -pressure / c11;
  const expectedUx = epsilonX * length;
  const expectedStress = Object.freeze([
    -pressure,
    lambda * epsilonX,
    0,
  ]);
  const expectedEnergy = 0.5
    * pressure ** 2
    / c11
    * length
    * height
    * BB09_MODULE.outOfPlaneThickness;
  const rightNodeIds = [...new Set(
    rightEdges.flatMap((edge) => edge.edgeNodeSequence),
  )];
  const displacementByNode = new Map(
    loadCase.nodalDisplacements.map((row) => [row.nodeId, row]),
  );
  const meanUx = rightNodeIds.reduce(
    (sum, nodeId) => sum + displacementByNode.get(nodeId).ux,
    0,
  ) / rightNodeIds.length;
  const point = { x: 20.37, y: 10.23 };
  const recovery = recoverAtPoint({
    loadCase,
    mesh,
    point,
  });
  const recoveredStress = [
    recovery.recoveredTensor.sigmaX,
    recovery.recoveredTensor.sigmaY,
    recovery.recoveredTensor.tauXY,
  ];
  const applied = appliedResultant(loadCase, mesh.nodesById);
  const reaction = supportReaction(loadCase, mesh.nodesById);

  assert.ok(strictRelative(meanUx, expectedUx) <= 1e-8, {
    meanUx,
    expectedUx,
  });
  assert.ok(
    Math.max(
      strictRelative(recoveredStress[0], expectedStress[0]),
      strictRelative(recoveredStress[1], expectedStress[1]),
    ) <= 1e-8,
    { recoveredStress, expectedStress },
  );
  assert.ok(Math.abs(recoveredStress[2]) <= 1e-9, {
    recoveredStress,
  });
  assert.ok(
    strictRelative(loadCase.totalStrainEnergy, expectedEnergy) <= 1e-8,
    {
      actual: loadCase.totalStrainEnergy,
      expectedEnergy,
    },
  );
  assert.ok(strictRelative(applied.totalX, -pressure * height) <= 1e-9);
  assert.ok(Math.abs(applied.totalY) <= 1e-9);
  assertResultantBalance(applied, reaction, 1e-8);

  return Object.freeze({
    profileId: BB09_MODULE.referenceProfileId,
    meshSemanticHash: model.semanticHash,
    resultSemanticHash: result.semanticHash,
    pressure,
    length,
    height,
    expectedUx,
    meanUx,
    expectedStress,
    recoveredStress: Object.freeze(recoveredStress),
    expectedEnergy,
    actualEnergy: loadCase.totalStrainEnergy,
    appliedResultant: applied,
    supportReaction: reaction,
    qualified: true,
  });
}

function executeApplication({
  manufacturedFieldEvidence,
  stripReferenceEvidence,
}) {
  const levels = BB09_LEVELS.map(executeApplicationLevel);
  const pressureDisplacementConvergence = convergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels,
    field: 'pressureHostDisplacementMagnitude',
    limit: 0.08,
    requireFourLevels: true,
  });
  const pressureEnergyConvergence = convergence({
    quantityKind: 'STRAIN_ENERGY',
    levels,
    field: 'pressureEnergy',
    limit: 0.08,
    requireFourLevels: true,
  });
  const pressureStressConvergence = convergence({
    quantityKind: 'LOCAL_STRESS',
    levels,
    field: 'pressureHostVonMises',
    limit: 0.15,
  });
  const pathMembraneConvergence = convergence({
    quantityKind: 'SCL_MEMBRANE',
    levels,
    field: 'pathNormalMembraneMagnitude',
    limit: 0.15,
    qualifiedTailRelativeLimit: 0.02,
  });
  const pathBendingConvergence = convergence({
    quantityKind: 'SCL_BENDING',
    levels,
    field: 'pathNormalBendingMagnitude',
    limit: 0.20,
  });
  const axialDisplacementConvergence = convergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels,
    field: 'axialNeckDisplacementMagnitude',
    limit: 0.08,
    requireFourLevels: true,
  });
  const axialEnergyConvergence = convergence({
    quantityKind: 'STRAIN_ENERGY',
    levels,
    field: 'axialEnergy',
    limit: 0.08,
    requireFourLevels: true,
  });
  [
    pressureDisplacementConvergence,
    pressureEnergyConvergence,
    pressureStressConvergence,
    pathMembraneConvergence,
    pathBendingConvergence,
    axialDisplacementConvergence,
    axialEnergyConvergence,
  ].forEach((row) => assertConvergence(row, levels));

  return Object.freeze({
    moduleId: BB09_MODULE.moduleId,
    geometryProfileId: BB09_MODULE.geometryProfileId,
    meshFamilyId: BB09_MODULE.meshFamilyId,
    formulationProfile: BB09_MODULE.formulationProfile,
    elementProfile: BB09_MODULE.elementProfile,
    procedureScope: BB09_MODULE.procedureScope,
    limitations: BB09_MODULE.limitations,
    manufacturedFieldEvidence,
    manufacturedFieldQualified: manufacturedFieldEvidence.qualified,
    stripReferenceEvidence,
    stripReferenceQualified: stripReferenceEvidence.qualified,
    levels,
    pressureDisplacementConvergence,
    pressureEnergyConvergence,
    pressureStressConvergence,
    pathMembraneConvergence,
    pathBendingConvergence,
    axialDisplacementConvergence,
    axialEnergyConvergence,
    internalPressureQualified: true,
    nozzleAxialTractionQualified: true,
    applicationProcedureQualified: true,
    numericalOutputQualified: true,
  });
}

function executeApplicationLevel(level) {
  const mesh = nozzleRepadMesh(level);
  const boundary = buildBoundaryEdges(mesh.elements);
  const constraints = remoteHostConstraints(mesh.nodes);
  const pressureLoads = applicationPressureLoads(
    boundary,
    mesh.nodesById,
    level.levelId,
  );
  const axialLoad = nozzleAxialLoad(
    boundary,
    mesh.nodesById,
    level.levelId,
  );
  const model = canonicalModel({
    mesh,
    modelIdentity: `${BB09_MODULE.moduleId}-${level.levelId}`,
    constraints,
    loadCases: [
      {
        ...emptyLoadCase('INTERNAL_PRESSURE'),
        pressureLoads,
      },
      {
        ...emptyLoadCase('NOZZLE_AXIAL_TRACTION'),
        edgeTractions: axialLoad.edgeTractions,
      },
    ],
    limitations: BB09_MODULE.limitations,
  });
  const result = calculateLocalContinuum(model);
  assert.equal(
    result.qualification.state,
    QUALIFICATION_STATES.ACCEPTED,
    JSON.stringify(result.diagnostics),
  );
  const byId = new Map(
    result.loadCaseResults.map((row) => [row.loadCaseId, row]),
  );
  const pressureCase = byId.get('INTERNAL_PRESSURE');
  const axialCase = byId.get('NOZZLE_AXIAL_TRACTION');
  assert.ok(pressureCase);
  assert.ok(axialCase);
  [pressureCase, axialCase].forEach((loadCase) => {
    assert.equal(loadCase.equilibrium.accepted, true);
    assert.equal(loadCase.energyQualification.accepted, true);
  });

  const quality = evaluateMeshQuality(mesh);
  const pressureApplied = appliedResultant(
    pressureCase,
    mesh.nodesById,
  );
  const pressureReaction = supportReaction(
    pressureCase,
    mesh.nodesById,
  );
  const totalHeight = neckTotalHeight();
  const expectedPressure = Object.freeze({
    totalX: BB09_MODULE.internalPressure
      * totalHeight
      * BB09_MODULE.outOfPlaneThickness,
    totalY: BB09_MODULE.internalPressure
      * BB09_MODULE.hostHalfWidth
      * BB09_MODULE.outOfPlaneThickness,
    moment: BB09_MODULE.internalPressure
      * (
        BB09_MODULE.hostHalfWidth ** 2
        - totalHeight ** 2
      )
      * BB09_MODULE.outOfPlaneThickness
      / 2,
  });
  assert.ok(
    strictRelative(
      pressureApplied.totalX,
      expectedPressure.totalX,
    ) <= 1e-9,
    { pressureApplied, expectedPressure },
  );
  assert.ok(
    strictRelative(
      pressureApplied.totalY,
      expectedPressure.totalY,
    ) <= 1e-9,
    { pressureApplied, expectedPressure },
  );
  assert.ok(
    strictRelative(
      pressureApplied.moment,
      expectedPressure.moment,
    ) <= 1e-9,
    { pressureApplied, expectedPressure },
  );
  assertResultantBalance(pressureApplied, pressureReaction, 1e-6);

  const axialApplied = appliedResultant(axialCase, mesh.nodesById);
  const axialReaction = supportReaction(axialCase, mesh.nodesById);
  assert.ok(
    strictRelative(
      axialApplied.totalY,
      axialLoad.resultant[1],
    ) <= 1e-9,
    { axialApplied, axialLoad },
  );
  assert.ok(
    strictRelative(
      axialApplied.moment,
      axialLoad.moment,
    ) <= 1e-9,
    { axialApplied, axialLoad },
  );
  assert.ok(Math.abs(axialApplied.totalX) <= 1e-9);
  assertResultantBalance(axialApplied, axialReaction, 1e-5);

  const hostPoint = Object.freeze({ x: 27.7, y: 5.3 });
  const hostRecovery = recoverAtPoint({
    loadCase: pressureCase,
    mesh,
    point: hostPoint,
  });
  const hostDisplacement = displacementAtPoint({
    loadCase: pressureCase,
    mesh,
    point: hostPoint,
  });
  const neckPoint = Object.freeze({ x: 5.1, y: 31.1 });
  const neckRecovery = recoverAtPoint({
    loadCase: axialCase,
    mesh,
    point: neckPoint,
  });
  const neckDisplacement = displacementAtPoint({
    loadCase: axialCase,
    mesh,
    point: neckPoint,
  });
  const hostPadPath = hostPadPathDecomposition({
    loadCase: pressureCase,
    mesh,
    x: 25.7,
  });
  const interfaceEvidence = interfaceCompatibility({
    loadCase: pressureCase,
    mesh,
    level,
  });
  const globalH = BB09_MODULE.nozzleWallThickness
    / level.neckAcross;
  const probeH = globalH;

  return Object.freeze({
    levelId: level.levelId,
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    globalH,
    probeH,
    meshSemanticHash: model.semanticHash,
    resultSemanticHash: result.semanticHash,
    minimumQJ: quality.minimumQJ,
    minimumScaledJacobian: quality.minimumScaledJacobian,
    maximumAspectRatio: quality.maximumAspectRatio,
    duplicateNodeCount: duplicateNodeCount(mesh.nodes),
    pressureCase: Object.freeze({
      resultSemanticHash: pressureCase.semanticHash,
      expectedResultant: expectedPressure,
      appliedResultant: pressureApplied,
      supportReaction: pressureReaction,
      hostPoint,
      hostStress: hostRecovery.recoveredTensor,
      hostDisplacement,
      hostVonMises: vonMises(hostRecovery.recoveredTensor),
      hostPadPath,
      interfaceEvidence,
      totalStrainEnergy: pressureCase.totalStrainEnergy,
      equilibriumAccepted: true,
      energyAccepted: true,
    }),
    axialCase: Object.freeze({
      resultSemanticHash: axialCase.semanticHash,
      loadNormalization: axialLoad,
      appliedResultant: axialApplied,
      supportReaction: axialReaction,
      neckPoint,
      neckStress: neckRecovery.recoveredTensor,
      neckDisplacement,
      neckVonMises: vonMises(neckRecovery.recoveredTensor),
      totalStrainEnergy: axialCase.totalStrainEnergy,
      equilibriumAccepted: true,
      energyAccepted: true,
    }),
    pressureHostDisplacementMagnitude: Math.hypot(
      hostDisplacement.ux,
      hostDisplacement.uy,
    ),
    pressureEnergy: pressureCase.totalStrainEnergy,
    pressureHostVonMises: vonMises(hostRecovery.recoveredTensor),
    pathNormalMembraneMagnitude: Math.abs(
      hostPadPath.normalMembrane,
    ),
    pathNormalBendingMagnitude: Math.abs(
      hostPadPath.normalBendingSurfaceAmplitude,
    ),
    axialNeckDisplacementMagnitude: Math.hypot(
      neckDisplacement.ux,
      neckDisplacement.uy,
    ),
    axialEnergy: axialCase.totalStrainEnergy,
  });
}

function nozzleRepadMesh(level) {
  const builder = meshBuilder();
  const tN = BB09_MODULE.nozzleWallThickness;
  const tH = BB09_MODULE.hostThickness;
  const tP = BB09_MODULE.repadThickness;
  const padX = BB09_MODULE.repadOuterX;
  const totalHeight = neckTotalHeight();

  addRectBlock(builder, {
    prefix: 'NECK-LOWER',
    x0: 0,
    x1: tN,
    y0: 0,
    y1: tH,
    xElements: level.neckAcross,
    yElements: level.hostThrough,
    regionId: 'NECK',
  });
  addRectBlock(builder, {
    prefix: 'HOST',
    x0: tN,
    x1: BB09_MODULE.hostHalfWidth,
    y0: 0,
    y1: tH,
    xElements: level.hostAcross,
    yElements: level.hostThrough,
    regionId: 'HOST',
  });
  addRectBlock(builder, {
    prefix: 'NECK-PAD',
    x0: 0,
    x1: tN,
    y0: tH,
    y1: tH + tP,
    xElements: level.neckAcross,
    yElements: level.padThrough,
    regionId: 'NECK',
  });
  addRectBlock(builder, {
    prefix: 'PAD',
    x0: tN,
    x1: padX,
    y0: tH,
    y1: tH + tP,
    xElements: level.padAcross,
    yElements: level.padThrough,
    regionId: 'PAD',
  });
  addRectBlock(builder, {
    prefix: 'NECK-UPPER',
    x0: 0,
    x1: tN,
    y0: tH + tP,
    y1: totalHeight,
    xElements: level.neckAcross,
    yElements: level.neckUpper,
    regionId: 'NECK',
  });
  return builder.finish();
}

function meshBuilder() {
  const ids = new Map();
  const nodes = [];
  const elements = [];
  let nodeCounter = 0;
  const nodeId = (point) => {
    const x = clean(point.x);
    const y = clean(point.y);
    const key = `${x.toFixed(12)}:${y.toFixed(12)}`;
    if (!ids.has(key)) {
      const id = `N${nodeCounter}`;
      nodeCounter += 1;
      ids.set(key, id);
      nodes.push(Object.freeze({ nodeId: id, x, y }));
    }
    return ids.get(key);
  };
  return {
    nodeId,
    elements,
    finish() {
      const frozenNodes = Object.freeze(nodes);
      const frozenElements = Object.freeze(
        elements.map((row) => Object.freeze(row)),
      );
      const nodesById = new Map(
        frozenNodes.map((row) => [row.nodeId, row]),
      );
      return Object.freeze({
        nodes: frozenNodes,
        elements: frozenElements,
        nodesById,
      });
    },
  };
}

function addRectBlock(builder, {
  prefix,
  x0,
  x1,
  y0,
  y1,
  xElements,
  yElements,
  regionId,
}) {
  const dx = (x1 - x0) / xElements;
  const dy = (y1 - y0) / yElements;
  for (let i = 0; i < xElements; i += 1) {
    for (let j = 0; j < yElements; j += 1) {
      const left = x0 + i * dx;
      const right = left + dx;
      const bottom = y0 + j * dy;
      const top = bottom + dy;
      const midX = 0.5 * (left + right);
      const midY = 0.5 * (bottom + top);
      const nodeIds = [
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: right, y: top },
        { x: left, y: top },
        { x: midX, y: bottom },
        { x: right, y: midY },
        { x: midX, y: top },
        { x: left, y: midY },
      ].map(builder.nodeId);
      builder.elements.push({
        elementId: `${prefix}-E-${i}-${j}`,
        elementType: 'Q8',
        nodeIds: Object.freeze(nodeIds),
        regionId,
      });
    }
  }
}

function canonicalModel({
  mesh,
  modelIdentity,
  constraints,
  loadCases,
  limitations,
}) {
  const regionIds = [...new Set(
    mesh.elements.map((row) => row.regionId),
  )].sort();
  return createCanonicalLocalContinuumModel({
    schema: 'local-continuum-model/v1',
    modelIdentity,
    modelVersion: 'BB09.1',
    sourceAncestry: {
      sourceModelIdentity: BB09_MODULE.geometryProfileId,
      sourceVersion: '1',
      adapterIdentity: 'BUCKET_B_BB09_CONFORMING_MULTIBLOCK_Q8',
      adapterVersion: '1',
    },
    units: {
      length: 'mm',
      force: 'N',
      stress: 'MPa',
      modulus: 'MPa',
    },
    formulation: BB09_MODULE.formulationProfile,
    materials: regionIds.map((regionId) => ({
      materialId: `${regionId}_MAT`,
      elasticModulus: BB09_MODULE.material.elasticModulus,
      poissonRatio: BB09_MODULE.material.poissonRatio,
      sourceReference: `BB09#${regionId}_MAT`,
    })),
    nodes: mesh.nodes.map((row) => ({
      ...row,
      sourceReference: `BB09#${modelIdentity}#${row.nodeId}`,
    })),
    elements: mesh.elements.map((row) => ({
      elementId: row.elementId,
      elementType: row.elementType,
      nodeIds: row.nodeIds,
      materialId: `${row.regionId}_MAT`,
      thickness: BB09_MODULE.outOfPlaneThickness,
      sourceReference: `BB09#${modelIdentity}#${row.elementId}`,
    })),
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'BB09_Q8_ONLY',
    },
    constraints,
    loadCases,
    resultRequests: {
      loadCaseIds: loadCases.map((row) => row.loadCaseId),
    },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1',
      identity: 'BB09_Q8_PLANE_STRAIN_APPLICATION_PROFILE_V1',
      tolerances: toleranceTable(),
    },
    limitations,
  });
}

function emptyLoadCase(loadCaseId) {
  return {
    loadCaseId,
    nodalForces: [],
    edgeTractions: [],
    pressureLoads: [],
    bodyForces: [],
    temperatureLoads: [],
    imposedDisplacements: [],
    sourceReference: `BB09#${loadCaseId}`,
  };
}

function remoteHostConstraints(nodes) {
  return nodes
    .filter((node) => near(node.x, BB09_MODULE.hostHalfWidth))
    .flatMap((node) => [
      prescribed(node.nodeId, 'UX', 0, 'REMOTE_HOST_CUT'),
      prescribed(node.nodeId, 'UY', 0, 'REMOTE_HOST_CUT'),
    ]);
}

function applicationPressureLoads(boundary, nodesById, prefix) {
  const pressureEdges = boundary.filter((edge) => {
    const nodes = edge.edgeNodeSequence.map(
      (nodeId) => nodesById.get(nodeId),
    );
    return nodes.every((node) => near(node.x, 0))
      || nodes.every((node) => near(node.y, 0));
  });
  assert.ok(pressureEdges.length > 0);
  return pressureEdges.map((edge, index) => ({
    pressureLoadId: `${prefix}-P-${index + 1}`,
    elementId: edge.elementId,
    edgeNodeIds: edge.edgeNodeIds,
    pressure: BB09_MODULE.internalPressure,
    sourceReference: `BB09#${prefix}#PRESSURE-${index + 1}`,
  }));
}

function nozzleAxialLoad(boundary, nodesById, prefix) {
  const totalHeight = neckTotalHeight();
  const loadedEdges = boundary.filter((edge) => {
    const nodes = edge.edgeNodeSequence.map(
      (nodeId) => nodesById.get(nodeId),
    );
    return nodes.every((node) => near(node.y, totalHeight))
      && nodes.every(
        (node) => node.x <= BB09_MODULE.nozzleWallThickness + 1e-9,
      );
  });
  assert.ok(loadedEdges.length > 0);
  const rows = loadedEdges.map((edge, index) => {
    const nodes = edge.edgeNodeSequence.map(
      (nodeId) => nodesById.get(nodeId),
    );
    const integration = integrateVariableEdgeLoad({
      nodes,
      thickness: BB09_MODULE.outOfPlaneThickness,
      tractionAt: () => [0, BB09_MODULE.nozzleAxialTraction],
    });
    return Object.freeze({
      integration,
      edgeTraction: Object.freeze({
        tractionId: `${prefix}-T-${index + 1}`,
        elementId: edge.elementId,
        edgeNodeIds: edge.edgeNodeIds,
        tx: 0,
        ty: BB09_MODULE.nozzleAxialTraction,
        sourceReference: `BB09#${prefix}#TRACTION-${index + 1}`,
      }),
    });
  });
  const resultant = rows.reduce(
    (sum, row) => [
      sum[0] + row.integration.resultant[0],
      sum[1] + row.integration.resultant[1],
    ],
    [0, 0],
  );
  const moment = rows.reduce(
    (sum, row) => sum + row.integration.moment,
    0,
  );
  return Object.freeze({
    profileId: 'BB09_NOZZLE_AXIAL_EDGE_TRACTION_V1',
    traction: Object.freeze([
      0,
      BB09_MODULE.nozzleAxialTraction,
    ]),
    resultant: Object.freeze(resultant),
    moment,
    edgeTractions: Object.freeze(
      rows.map((row) => row.edgeTraction),
    ),
  });
}

function evaluateMeshQuality(mesh) {
  const rows = mesh.elements.map((element) => evaluateQ8Quality({
    elementId: element.elementId,
    nodes: element.nodeIds.map(
      (nodeId) => mesh.nodesById.get(nodeId),
    ),
  }));
  const failed = rows.filter((row) => !row.accepted);
  assert.equal(failed.length, 0, JSON.stringify(failed.slice(0, 5)));
  return Object.freeze({
    minimumQJ: Math.min(...rows.map((row) => row.qJDeterminantRatio)),
    minimumScaledJacobian: Math.min(
      ...rows.map((row) => row.minimumScaledJacobian),
    ),
    maximumAspectRatio: Math.max(
      ...rows.map((row) => row.aspectRatio),
    ),
  });
}

function hostPadPathDecomposition({ loadCase, mesh, x }) {
  const tH = BB09_MODULE.hostThickness;
  const tP = BB09_MODULE.repadThickness;
  const totalThickness = tH + tP;
  const midpoint = 0.5 * totalThickness;
  const segments = [
    { segmentId: 'HOST', y0: 0, y1: tH },
    { segmentId: 'PAD', y0: tH, y1: tH + tP },
  ];
  let integral = 0;
  let firstMoment = 0;
  const samples = [];
  segments.forEach((segment) => {
    const half = 0.5 * (segment.y1 - segment.y0);
    const center = 0.5 * (segment.y1 + segment.y0);
    GL8.forEach(([coordinate, weight], index) => {
      const y = center + half * coordinate;
      const point = { x, y };
      const recovery = recoverAtPoint({
        loadCase,
        mesh,
        point,
      });
      const sigmaNormal = recovery.recoveredTensor.sigmaX;
      const weighted = weight * half;
      integral += weighted * sigmaNormal;
      firstMoment += weighted * (y - midpoint) * sigmaNormal;
      samples.push(Object.freeze({
        sampleId: `${segment.segmentId}-GP-${index + 1}`,
        segmentId: segment.segmentId,
        coordinate,
        weight,
        point: Object.freeze(point),
        containingElementId: recovery.containingElementId,
        naturalCoordinates: recovery.naturalCoordinates,
        sigmaNormal,
        sigmaTransverse: recovery.recoveredTensor.sigmaY,
        tau: recovery.recoveredTensor.tauXY,
      }));
    });
  });
  const normalMembrane = integral / totalThickness;
  const normalBendingSurfaceAmplitude = 6
    * firstMoment
    / totalThickness ** 2;
  let normalPeakResidual = 0;
  samples.forEach((sample) => {
    const linearized = normalMembrane
      + normalBendingSurfaceAmplitude
      * 2
      * (sample.point.y - midpoint)
      / totalThickness;
    normalPeakResidual = Math.max(
      normalPeakResidual,
      Math.abs(sample.sigmaNormal - linearized),
    );
  });
  return Object.freeze({
    profileId: BB09_MODULE.pathProfileId,
    x,
    hostThickness: tH,
    repadThickness: tP,
    totalThickness,
    normalMembrane,
    normalBendingSurfaceAmplitude,
    normalPeakResidual,
    pressureCorrectionApplied: false,
    codeClassificationApplied: false,
    samples: Object.freeze(samples),
  });
}

function interfaceCompatibility({ loadCase, mesh, level }) {
  const h = BB09_MODULE.nozzleWallThickness / level.neckAcross;
  const offset = 0.20 * h;
  const definitions = [
    {
      interfaceId: 'NECK_HOST',
      y: 5.1,
      y0: 0,
      y1: BB09_MODULE.hostThickness,
      expectedNodeCount: 2 * level.hostThrough + 1,
      expectedRegions: Object.freeze(['HOST', 'NECK']),
    },
    {
      interfaceId: 'NECK_PAD',
      y: 14.1,
      y0: BB09_MODULE.hostThickness,
      y1: BB09_MODULE.hostThickness + BB09_MODULE.repadThickness,
      expectedNodeCount: 2 * level.padThrough + 1,
      expectedRegions: Object.freeze(['NECK', 'PAD']),
    },
  ];
  const offsetStressGradientDiagnostics = definitions.map((definition) => {
    const leftPoint = {
      x: BB09_MODULE.nozzleWallThickness - offset,
      y: definition.y,
    };
    const rightPoint = {
      x: BB09_MODULE.nozzleWallThickness + offset,
      y: definition.y,
    };
    const left = recoverAtPoint({
      loadCase,
      mesh,
      point: leftPoint,
    }).recoveredTensor;
    const right = recoverAtPoint({
      loadCase,
      mesh,
      point: rightPoint,
    }).recoveredTensor;
    const gradientMagnitude = Math.hypot(
      right.sigmaX - left.sigmaX,
      right.tauXY - left.tauXY,
    );
    return Object.freeze({
      interfaceId: definition.interfaceId,
      diagnosticProfileId:
        'BB09_FINITE_OFFSET_STRESS_GRADIENT_DIAGNOSTIC_V1',
      acceptanceAuthority: false,
      reason:
        'SAMPLES_ARE_AT_DIFFERENT_PHYSICAL_COORDINATES_AND_DO_NOT_PROVE_INTERFACE_TRACTION_EQUILIBRIUM',
      offset,
      leftPoint: Object.freeze(leftPoint),
      rightPoint: Object.freeze(rightPoint),
      leftStressComponents: Object.freeze([
        left.sigmaX,
        left.tauXY,
      ]),
      rightStressComponents: Object.freeze([
        right.sigmaX,
        right.tauXY,
      ]),
      gradientMagnitude,
      gradientNormalized:
        gradientMagnitude / BB09_MODULE.internalPressure,
    });
  });
  const displacementRowsByNode = new Map();
  loadCase.nodalDisplacements.forEach((row) => {
    if (!displacementRowsByNode.has(row.nodeId)) {
      displacementRowsByNode.set(row.nodeId, []);
    }
    displacementRowsByNode.get(row.nodeId).push(row);
  });
  const regionsByNode = new Map(
    mesh.nodes.map((node) => [node.nodeId, new Set()]),
  );
  mesh.elements.forEach((element) => {
    element.nodeIds.forEach((nodeId) => {
      regionsByNode.get(nodeId).add(element.regionId);
    });
  });
  const interfaceGroups = definitions.map((definition) => {
    const nodes = mesh.nodes.filter((node) => (
      near(node.x, BB09_MODULE.nozzleWallThickness)
      && node.y >= definition.y0 - 1e-9
      && node.y <= definition.y1 + 1e-9
    ));
    const nodeEvidence = nodes.map((node) => {
      const displacementRows = displacementRowsByNode.get(node.nodeId) ?? [];
      const regions = [...regionsByNode.get(node.nodeId)].sort();
      const containsExpectedRegions = definition.expectedRegions.every(
        (regionId) => regions.includes(regionId),
      );
      return Object.freeze({
        nodeId: node.nodeId,
        point: Object.freeze({ x: node.x, y: node.y }),
        regions: Object.freeze(regions),
        containsExpectedRegions,
        globalDisplacementRecordCount: displacementRows.length,
        displacement: displacementRows.length === 1
          ? Object.freeze({
            ux: displacementRows[0].ux,
            uy: displacementRows[0].uy,
          })
          : null,
        sharedDofDisplacementMismatch: 0,
        dofAuthority:
          'ONE_GLOBAL_UX_AND_UY_RECORD_SHARED_BY_ALL_INCIDENT_ELEMENTS',
      });
    });
    return Object.freeze({
      interfaceId: definition.interfaceId,
      y0: definition.y0,
      y1: definition.y1,
      expectedRegions: definition.expectedRegions,
      expectedNodeCount: definition.expectedNodeCount,
      nodeCount: nodeEvidence.length,
      allNodesContainExpectedRegions: nodeEvidence.every(
        (row) => row.containsExpectedRegions,
      ),
      allNodesHaveSingleGlobalDisplacement: nodeEvidence.every(
        (row) => row.globalDisplacementRecordCount === 1,
      ),
      maximumSharedDofDisplacementMismatch: Math.max(
        0,
        ...nodeEvidence.map(
          (row) => row.sharedDofDisplacementMismatch,
        ),
      ),
      nodes: Object.freeze(nodeEvidence),
    });
  });
  return Object.freeze({
    profileId: BB09_MODULE.interfaceProfileId,
    interfaceNodeCount: new Set(
      interfaceGroups.flatMap(
        (group) => group.nodes.map((node) => node.nodeId),
      ),
    ).size,
    allInterfaceNodesShared: interfaceGroups.every(
      (group) => group.allNodesContainExpectedRegions,
    ),
    displacementCompatibilityAuthority:
      'SINGLE_SHARED_GLOBAL_DOF_PER_INTERFACE_NODE',
    maximumSharedDofDisplacementMismatch: Math.max(
      0,
      ...interfaceGroups.map(
        (group) => group.maximumSharedDofDisplacementMismatch,
      ),
    ),
    interfaceGroups: Object.freeze(interfaceGroups),
    offsetStressGradientDiagnostics: Object.freeze(
      offsetStressGradientDiagnostics,
    ),
  });
}

function recoverAtPoint({ loadCase, mesh, point }) {
  const resultByElement = new Map(
    loadCase.elementResults.map((row) => [row.elementId, row]),
  );
  const candidates = containingElements(mesh, point);
  assert.equal(
    candidates.length,
    1,
    `Recovery containment count ${candidates.length} at ${JSON.stringify(point)}.`,
  );
  const candidate = candidates[0];
  const recovery = recoverAtPhysicalCoordinate({
    elementId: candidate.element.elementId,
    nodes: candidate.nodes,
    point,
    gaussPointResults: resultByElement.get(
      candidate.element.elementId,
    ).gaussPointResults,
    mappingTolerance: 1e-8 * Math.max(
      1,
      Math.hypot(point.x, point.y),
    ),
  });
  return Object.freeze({
    point: Object.freeze({ ...point }),
    ...recovery,
  });
}

function displacementAtPoint({ loadCase, mesh, point }) {
  const candidates = containingElements(mesh, point);
  assert.equal(
    candidates.length,
    1,
    `Displacement containment count ${candidates.length}.`,
  );
  const candidate = candidates[0];
  const inverse = invertQ8Mapping(candidate.nodes, point, {
    tolerance: 1e-8 * Math.max(
      1,
      Math.hypot(point.x, point.y),
    ),
  });
  assert.equal(inverse.converged, true);
  const { N } = q8Shape(inverse.xi, inverse.eta);
  const displacementByNode = new Map(
    loadCase.nodalDisplacements.map((row) => [row.nodeId, row]),
  );
  let ux = 0;
  let uy = 0;
  candidate.element.nodeIds.forEach((nodeId, index) => {
    const displacement = displacementByNode.get(nodeId);
    ux += N[index] * displacement.ux;
    uy += N[index] * displacement.uy;
  });
  return Object.freeze({ ux, uy });
}

function containingElements(mesh, point) {
  const tolerance = 1e-8 * Math.max(
    1,
    Math.hypot(point.x, point.y),
  );
  const candidates = [];
  mesh.elements.forEach((element) => {
    const nodes = element.nodeIds.map(
      (nodeId) => mesh.nodesById.get(nodeId),
    );
    const inverse = invertQ8Mapping(nodes, point, { tolerance });
    if (
      inverse.converged
      && Math.abs(inverse.xi) < 1 - 1e-8
      && Math.abs(inverse.eta) < 1 - 1e-8
    ) {
      candidates.push({ element, nodes, inverse });
    }
  });
  return candidates;
}

function appliedResultant(loadCase, nodesById) {
  let totalX = 0;
  let totalY = 0;
  let moment = 0;
  loadCase.forceEvidence.contributions.forEach((row) => {
    row.forcePerNode.forEach((force, index) => {
      totalX += force[0];
      totalY += force[1];
      const nodeId = row.nodeIds?.[index]
        ?? row.edgeNodeIds?.[index]
        ?? null;
      if (nodeId) {
        const node = nodesById.get(nodeId);
        moment += node.x * force[1] - node.y * force[0];
      }
    });
  });
  return Object.freeze({ totalX, totalY, moment });
}

function supportReaction(loadCase, nodesById) {
  let totalX = 0;
  let totalY = 0;
  let moment = 0;
  loadCase.supportReactions.forEach((row) => {
    const [nodeId, dof] = row.dofIdentity.split(':');
    const node = nodesById.get(nodeId);
    if (dof === 'UX') {
      totalX += row.value;
      moment -= node.y * row.value;
    } else if (dof === 'UY') {
      totalY += row.value;
      moment += node.x * row.value;
    }
  });
  return Object.freeze({ totalX, totalY, moment });
}

function assertResultantBalance(applied, reaction, tolerance) {
  assert.ok(
    relativeResidual(applied.totalX + reaction.totalX, applied.totalX)
      <= tolerance,
    JSON.stringify({ applied, reaction }),
  );
  assert.ok(
    relativeResidual(applied.totalY + reaction.totalY, applied.totalY)
      <= tolerance,
    JSON.stringify({ applied, reaction }),
  );
  assert.ok(
    relativeResidual(applied.moment + reaction.moment, applied.moment)
      <= tolerance,
    JSON.stringify({ applied, reaction }),
  );
}

function convergence({
  quantityKind,
  levels,
  field,
  limit,
  requireFourLevels = undefined,
  qualifiedTailRelativeLimit = undefined,
}) {
  const local = [
    'LOCAL_STRESS',
    'SCL_MEMBRANE',
    'SCL_BENDING',
  ].includes(quantityKind);
  return evaluateConvergence({
    quantityKind,
    levels: levels.map((row) => ({
      level: row.levelId,
      h: row.globalH,
      probeH: local ? row.probeH : undefined,
      value: row[field],
    })),
    finestRelativeChangeLimit: limit,
    ...(qualifiedTailRelativeLimit === undefined
      ? {}
      : { qualifiedTailRelativeLimit }),
    ...(requireFourLevels === undefined
      ? {}
      : { requireFourLevels }),
  });
}

function assertConvergence(row, levels) {
  assert.ok(
    [
      CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC,
      CONVERGENCE_DISPOSITIONS.PASS_PLATEAU,
    ].includes(row.disposition),
    `${row.quantityKind} -> ${row.disposition}; levels=${JSON.stringify(levels)}; result=${JSON.stringify(row)}`,
  );
}

function planeStrain(material, strain) {
  const factor = material.elasticModulus
    / (
      (1 + material.poissonRatio)
      * (1 - 2 * material.poissonRatio)
    );
  return [
    factor * (
      (1 - material.poissonRatio) * strain[0]
      + material.poissonRatio * strain[1]
    ),
    factor * (
      material.poissonRatio * strain[0]
      + (1 - material.poissonRatio) * strain[1]
    ),
    factor
      * (1 - 2 * material.poissonRatio)
      * strain[2]
      / 2,
  ];
}

function prescribed(nodeId, dof, value, profile) {
  return {
    constraintId: `${profile}-${nodeId}-${dof}`,
    nodeId,
    dof,
    value,
    sourceReference: `BB09#${profile}#${nodeId}#${dof}`,
  };
}

function toleranceTable() {
  const tight = { absolute: 1e-9, relative: 1e-9 };
  const loose = { absolute: 1e-5, relative: 1e-6 };
  return {
    minimumElementArea: tight,
    stiffnessSymmetry: tight,
    constitutiveSymmetry: tight,
    choleskyPivot: tight,
    freeDofResidual: loose,
    reactionEquilibrium: loose,
    strainEnergy: loose,
    rigidBodyStrain: tight,
    patchTestStress: tight,
  };
}

function neckTotalHeight() {
  return BB09_MODULE.hostThickness
    + BB09_MODULE.repadThickness
    + BB09_MODULE.neckUpperHeight;
}

function duplicateNodeCount(nodes) {
  const keys = new Set();
  let duplicates = 0;
  nodes.forEach((node) => {
    const key = `${node.x.toFixed(12)}:${node.y.toFixed(12)}`;
    if (keys.has(key)) duplicates += 1;
    keys.add(key);
  });
  return duplicates;
}

function vonMises(stress) {
  return Math.sqrt(
    stress.sigmaX ** 2
      - stress.sigmaX * stress.sigmaY
      + stress.sigmaY ** 2
      + 3 * stress.tauXY ** 2,
  );
}

function maxRelative(actual, expected) {
  return Math.max(...actual.map(
    (value, index) => strictRelative(value, expected[index]),
  ));
}

function strictRelative(left, right) {
  return Math.abs(left - right)
    / Math.max(1e-12, Math.abs(right));
}

function relativeResidual(residual, reference) {
  return Math.abs(residual)
    / Math.max(1, Math.abs(reference));
}

function near(left, right, tolerance = 1e-9) {
  return Math.abs(left - right) <= tolerance;
}

function clean(value) {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

function resolveExactHead() {
  const expected = process.env.EXPECTED_HEAD_SHA;
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  if (expected) {
    assert.match(expected, /^[0-9a-f]{40}$/i);
    assert.equal(actual, expected, 'Exact-head mismatch.');
  }
  return actual;
}

function writeDiagnostic(extra) {
  mkdirSync(dirname(diagnosticPath), { recursive: true });
  writeFileSync(
    diagnosticPath,
    `${JSON.stringify({
      schema: 'bucket-b-bb09-diagnostic/v1',
      exactHeadSha,
      procedureHash: procedure.semanticHash,
      checks,
      ...extra,
    }, null, 2)}\n`,
  );
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hash(value) {
  return sha256(JSON.stringify(value));
}
