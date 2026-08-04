import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BB08_LEVELS,
  BB08_MODULE,
  CONVERGENCE_DISPOSITIONS,
  createBb08Evidence,
  createBb08Procedure,
  createBb08Report,
  detectDuplicateInterfaceNodes,
  evaluateConvergence,
  evaluateQ8Quality,
  invertQ8Mapping,
  q8Shape,
  recoverAtPhysicalCoordinate,
  validateBb07Report,
  validateBb08Report,
} from './index.js';
import {
  QUALIFICATION_STATES,
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
} from '../local-continuum/index.js';
import { buildBoundaryEdges } from '../local-continuum/assembly.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const exactHeadSha = resolveExactHead();
const bb07ReportPath = resolve(
  ROOT,
  process.env.BB07_REPORT_PATH ?? 'reports/bucket-b-bb07-bracket-gusset-report.json',
);
const bb07Report = JSON.parse(readFileSync(bb07ReportPath, 'utf8'));
validateBb07Report(bb07Report);
const procedure = createBb08Procedure({ bb07Report, exactHeadSha });
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
      evidenceHash: hash({ name: error?.name, message: error?.message }),
    }));
    throw new Error(`${checkId} failed: ${error?.stack ?? error}`);
  }
}

await check('BB08_BB07_SAME_HEAD_AUTHORITY', () => {
  assert.equal(bb07Report.exactHeadSha, exactHeadSha);
  assert.equal(bb07Report.bb08Authorized, true);
  assert.equal(procedure.bb07ReportHash, bb07Report.semanticHash);
  return { bb07ReportHash: bb07Report.semanticHash, exactHeadSha };
});

await check('BB08_PROCEDURE_AUTHORITY', () => {
  assert.equal(procedure.module.moduleId, 'C2D-PIPE-PAD-SECTION');
  assert.equal(procedure.module.formulationProfile, 'PLANE_STRAIN');
  assert.equal(procedure.module.elementProfile, 'Q8_FULL_3X3');
  assert.equal(procedure.applicationExecutionAuthorized, true);
  assert.equal(procedure.codeAssessmentAuthorized, false);
  assert.equal(procedure.bb09Authorized, false);
  return { procedureHash: procedure.semanticHash };
});

const manufacturedFieldEvidence = await check(
  'BB08_PLANE_STRAIN_MANUFACTURED_FIELD',
  () => executeManufacturedField(BB08_LEVELS[1]),
);

const lameReferenceEvidence = await check(
  'BB08_PLANE_STRAIN_LAME_REFERENCE',
  executeLameReference,
);

const moduleEvidence = await check(
  'BB08_FOUR_LEVEL_PIPE_PAD_EXECUTION',
  () => executeApplication({ manufacturedFieldEvidence, lameReferenceEvidence }),
);

await check('BB08_PRESSURE_AND_REACTION_EQUILIBRIUM', () => {
  moduleEvidence.levels.forEach((level) => {
    assert.ok(level.pressureResultant.relativeErrorX <= 1e-8, JSON.stringify(level.pressureResultant));
    assert.ok(level.pressureResultant.relativeErrorY <= 1e-8, JSON.stringify(level.pressureResultant));
    assert.ok(level.supportReaction.relativeErrorX <= 1e-6, JSON.stringify(level.supportReaction));
    assert.ok(level.supportReaction.relativeErrorY <= 1e-6, JSON.stringify(level.supportReaction));
    assert.equal(level.equilibriumAccepted, true);
    assert.equal(level.energyAccepted, true);
  });
  return moduleEvidence.levels.map((row) => ({
    levelId: row.levelId,
    pressureResultant: row.pressureResultant,
    supportReaction: row.supportReaction,
  }));
});

await check('BB08_FIXED_RADIAL_PATH_DECOMPOSITION', () => {
  const finest = moduleEvidence.levels.at(-1);
  assert.ok(Number.isFinite(finest.radialPath.hoopMembrane));
  assert.ok(Number.isFinite(finest.radialPath.hoopBendingSurfaceAmplitude));
  assert.ok(Number.isFinite(finest.radialPath.hoopPeakResidual));
  assert.equal(finest.radialPath.samples.length, 16);
  assert.equal(moduleEvidence.pathMembraneConvergence.acceptedForAdjudication, true);
  assert.equal(moduleEvidence.pathBendingConvergence.acceptedForAdjudication, true);
  return {
    radialPath: finest.radialPath,
    membraneConvergence: moduleEvidence.pathMembraneConvergence,
    bendingConvergence: moduleEvidence.pathBendingConvergence,
  };
});

await check('BB08_INTERFACE_COMPATIBILITY', () => {
  moduleEvidence.levels.forEach((level) => {
    assert.equal(level.interfaceEvidence.duplicateInterfaceNodeCount, 0);
    assert.equal(level.interfaceEvidence.allInterfaceNodesShared, true);
    assert.ok(
      level.interfaceEvidence.tractionJumpNormalized <= 0.25,
      JSON.stringify(level.interfaceEvidence),
    );
  });
  assert.ok(
    moduleEvidence.levels.at(-1).interfaceEvidence.tractionJumpNormalized
      <= moduleEvidence.levels[0].interfaceEvidence.tractionJumpNormalized + 0.05,
  );
  return moduleEvidence.levels.map((row) => row.interfaceEvidence);
});

await check('BB08_CALLER_STATUS_TAMPER_REJECTED', () => {
  const provisionalEvidence = createBb08Evidence({ procedure, moduleEvidence });
  const provisionalReport = createBb08Report({
    evidence: provisionalEvidence,
    checkResults: [
      ...checks,
      { checkId: 'PROVISIONAL', status: 'PASS', evidenceHash: sha256('provisional') },
    ],
  });
  assert.throws(
    () => validateBb08Report({ ...provisionalReport, bb09Authorized: false }),
    /authorization|hash/i,
  );
  assert.throws(
    () => validateBb08Report({ ...provisionalReport, axisymmetricAuthorized: true }),
    /authority|hash/i,
  );
  return { rejected: true };
});

const evidence = createBb08Evidence({ procedure, moduleEvidence });
const report = createBb08Report({ evidence, checkResults: [...checks] });
validateBb08Report(report);
assert.equal(report.status, 'BB08_PROCEDURE_QUALIFIED');
assert.equal(report.bb09Authorized, true);
assert.equal(report.applicationExecutionAuthorized, false);
assert.equal(report.axisymmetricAuthorized, false);

const reportPath = resolve(
  ROOT,
  process.env.BB08_REPORT_PATH ?? 'reports/bucket-b-bb08-pipe-pad-report.json',
);
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function executeManufacturedField(level) {
  const mesh = pipePadMesh(level);
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
      prescribed(nodeId, 'UX', epsilonX * node.x + 0.5 * gammaXY * node.y, 'AFFINE'),
      prescribed(nodeId, 'UY', 0.5 * gammaXY * node.x + epsilonY * node.y, 'AFFINE'),
    ];
  });
  const model = canonicalModel({
    mesh,
    modelIdentity: 'C2D-PIPE-PAD-SECTION-AFFINE',
    constraints,
    pressureLoads: [],
    loadCaseId: 'AFFINE_FIELD',
    limitations: ['MANUFACTURED_FIELD_ONLY'],
  });
  const result = calculateLocalContinuum(model);
  assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
  const expected = planeStrain(
    BB08_MODULE.material,
    [epsilonX, epsilonY, gammaXY],
  );
  let maximumStrainResidual = 0;
  let maximumStressResidual = 0;
  result.loadCaseResults[0].elementResults.forEach((element) => {
    element.gaussPointResults.forEach((point) => {
      const strain = [point.strain.epsilonX, point.strain.epsilonY, point.strain.gammaXY];
      const stress = [point.stress.sigmaX, point.stress.sigmaY, point.stress.tauXY];
      maximumStrainResidual = Math.max(
        maximumStrainResidual,
        maxRelative(strain, [epsilonX, epsilonY, gammaXY]),
      );
      maximumStressResidual = Math.max(maximumStressResidual, maxRelative(stress, expected));
    });
  });
  assert.ok(maximumStrainResidual <= 1e-8, maximumStrainResidual);
  assert.ok(maximumStressResidual <= 1e-8, maximumStressResidual);
  return Object.freeze({
    profileId: 'BB08_AFFINE_PLANE_STRAIN_FIELD_V1',
    levelId: level.levelId,
    meshSemanticHash: model.semanticHash,
    resultSemanticHash: result.semanticHash,
    expectedStrain: Object.freeze([epsilonX, epsilonY, gammaXY]),
    expectedStress: Object.freeze(expected),
    maximumStrainResidual,
    maximumStressResidual,
    qualified: true,
  });
}

function executeLameReference() {
  const levels = BB08_LEVELS.map(executeLameLevel);
  const displacementConvergence = evaluateConvergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels: levels.map((row) => ({ level: row.levelId, h: row.globalH, value: row.probe.radialDisplacement })),
    requireFourLevels: true,
    finestRelativeChangeLimit: 0.01,
    referenceValue: levels[0].probe.referenceRadialDisplacement,
    referenceRelativeErrorLimit: 0.01,
  });
  const hoopStressConvergence = evaluateConvergence({
    quantityKind: 'LOCAL_STRESS',
    levels: levels.map((row) => ({
      level: row.levelId,
      h: row.globalH,
      probeH: row.probeH,
      value: row.probe.sigmaTheta,
    })),
    finestRelativeChangeLimit: 0.03,
    referenceValue: levels[0].probe.referenceSigmaTheta,
    referenceRelativeErrorLimit: 0.03,
  });
  assertConvergence(displacementConvergence, levels);
  assertConvergence(hoopStressConvergence, levels);
  const finest = levels.at(-1);
  assert.ok(finest.probe.radialDisplacementRelativeError <= 0.01, JSON.stringify(finest.probe));
  assert.ok(finest.probe.sigmaRadialRelativeError <= 0.03, JSON.stringify(finest.probe));
  assert.ok(finest.probe.sigmaThetaRelativeError <= 0.03, JSON.stringify(finest.probe));
  return Object.freeze({
    profileId: 'BB08_PLANE_STRAIN_LAME_QUARTER_CYLINDER_V1',
    levels,
    displacementConvergence,
    hoopStressConvergence,
    qualified: true,
  });
}

function executeLameLevel(level) {
  const mesh = barePipeMesh(level);
  const boundary = buildBoundaryEdges(mesh.elements);
  const constraints = symmetryConstraints(mesh.nodes);
  const pressureLoads = pressureLoadsOnInnerRadius(boundary, mesh.nodesById, 'LAME');
  const model = canonicalModel({
    mesh,
    modelIdentity: `BB08-LAME-${level.levelId}`,
    constraints,
    pressureLoads,
    loadCaseId: 'INTERNAL_PRESSURE',
    limitations: ['PLANE_STRAIN_LAME_REFERENCE_ONLY'],
  });
  const result = calculateLocalContinuum(model);
  assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED, JSON.stringify(result.diagnostics));
  const loadCase = result.loadCaseResults[0];
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);
  const quality = evaluateMeshQuality(mesh);
  const point = polarPoint(106.37, 0.413);
  const recovered = recoverAtPoint({ result, mesh, point });
  const polar = polarStress(recovered.recoveredTensor, point);
  const displacement = radialDisplacementAtPoint({ result, mesh, point });
  const reference = lameReference(106.37);
  const globalH = characteristicH(level, BB08_MODULE.innerRadius + BB08_MODULE.pipeThickness);
  const probeH = globalH;
  return Object.freeze({
    levelId: level.levelId,
    globalH,
    probeH,
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    meshSemanticHash: model.semanticHash,
    resultSemanticHash: result.semanticHash,
    minimumQJ: quality.minimumQJ,
    minimumScaledJacobian: quality.minimumScaledJacobian,
    maximumAspectRatio: quality.maximumAspectRatio,
    probe: Object.freeze({
      point,
      containingElementId: recovered.containingElementId,
      naturalCoordinates: recovered.naturalCoordinates,
      radialDisplacement: displacement.radial,
      sigmaRadial: polar.sigmaRadial,
      sigmaTheta: polar.sigmaTheta,
      tauRadialTheta: polar.tauRadialTheta,
      referenceRadialDisplacement: reference.radialDisplacement,
      referenceSigmaRadial: reference.sigmaRadial,
      referenceSigmaTheta: reference.sigmaTheta,
      radialDisplacementRelativeError: strictRelative(displacement.radial, reference.radialDisplacement),
      sigmaRadialRelativeError: strictRelative(polar.sigmaRadial, reference.sigmaRadial),
      sigmaThetaRelativeError: strictRelative(polar.sigmaTheta, reference.sigmaTheta),
    }),
  });
}

function executeApplication({ manufacturedFieldEvidence, lameReferenceEvidence }) {
  const levels = BB08_LEVELS.map(executeApplicationLevel);
  const displacementConvergence = convergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels,
    field: 'padProbeRadialDisplacementMagnitude',
    limit: 0.02,
    requireFourLevels: true,
  });
  const energyConvergence = convergence({
    quantityKind: 'STRAIN_ENERGY',
    levels,
    field: 'totalStrainEnergy',
    limit: 0.02,
    requireFourLevels: true,
  });
  const localStressConvergence = convergence({
    quantityKind: 'LOCAL_STRESS',
    levels,
    field: 'pipeProbeHoopStressMagnitude',
    limit: 0.08,
  });
  const pathMembraneConvergence = convergence({
    quantityKind: 'SCL_MEMBRANE',
    levels,
    field: 'pathHoopMembraneMagnitude',
    limit: 0.08,
  });
  const pathBendingConvergence = convergence({
    quantityKind: 'SCL_BENDING',
    levels,
    field: 'pathHoopBendingMagnitude',
    limit: 0.10,
  });
  [
    displacementConvergence,
    energyConvergence,
    localStressConvergence,
    pathMembraneConvergence,
    pathBendingConvergence,
  ].forEach((row) => assertConvergence(row, levels));
  return Object.freeze({
    moduleId: BB08_MODULE.moduleId,
    geometryProfileId: BB08_MODULE.geometryProfileId,
    meshFamilyId: BB08_MODULE.meshFamilyId,
    formulationProfile: BB08_MODULE.formulationProfile,
    elementProfile: BB08_MODULE.elementProfile,
    procedureScope: BB08_MODULE.procedureScope,
    limitations: BB08_MODULE.limitations,
    manufacturedFieldEvidence,
    manufacturedFieldQualified: manufacturedFieldEvidence.qualified,
    lameReferenceEvidence,
    lameReferenceQualified: lameReferenceEvidence.qualified,
    levels,
    displacementConvergence,
    energyConvergence,
    localStressConvergence,
    pathMembraneConvergence,
    pathBendingConvergence,
    applicationProcedureQualified: true,
    numericalOutputQualified: true,
  });
}

function executeApplicationLevel(level) {
  const mesh = pipePadMesh(level);
  const duplicateNodes = detectDuplicateInterfaceNodes(mesh.nodes);
  assert.equal(duplicateNodes.length, 0, JSON.stringify(duplicateNodes.slice(0, 5)));
  const boundary = buildBoundaryEdges(mesh.elements);
  const constraints = symmetryConstraints(mesh.nodes);
  const pressureLoads = pressureLoadsOnInnerRadius(boundary, mesh.nodesById, level.levelId);
  const model = canonicalModel({
    mesh,
    modelIdentity: `${BB08_MODULE.moduleId}-${level.levelId}`,
    constraints,
    pressureLoads,
    loadCaseId: 'INTERNAL_PRESSURE',
    limitations: BB08_MODULE.limitations,
  });
  const result = calculateLocalContinuum(model);
  assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED, JSON.stringify(result.diagnostics));
  const loadCase = result.loadCaseResults[0];
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);
  const quality = evaluateMeshQuality(mesh);
  const pressureResultant = appliedPressureResultant(loadCase);
  const supportReaction = supportReactionResultant(loadCase);
  const expected = BB08_MODULE.internalPressure
    * BB08_MODULE.innerRadius
    * BB08_MODULE.outOfPlaneThickness;
  pressureResultant.relativeErrorX = strictRelative(pressureResultant.totalX, expected);
  pressureResultant.relativeErrorY = strictRelative(pressureResultant.totalY, expected);
  supportReaction.relativeErrorX = strictRelative(supportReaction.totalX, -expected);
  supportReaction.relativeErrorY = strictRelative(supportReaction.totalY, -expected);

  const padProbePoint = polarPoint(114.3, 0.21);
  const padProbeDisplacement = radialDisplacementAtPoint({ result, mesh, point: padProbePoint });
  const pipeProbePoint = polarPoint(108.7, 0.21);
  const pipeProbe = recoverAtPoint({ result, mesh, point: pipeProbePoint });
  const pipeProbePolarStress = polarStress(pipeProbe.recoveredTensor, pipeProbePoint);
  const radialPath = radialPathDecomposition({ result, mesh, theta: 0.21 });
  const interfaceEvidence = interfaceCompatibility({ result, mesh, level });
  const globalH = characteristicH(level, BB08_MODULE.innerRadius + BB08_MODULE.pipeThickness);
  const probeH = globalH;

  return Object.freeze({
    levelId: level.levelId,
    thetaColumns: level.thetaColumns,
    pipeRadialRows: level.pipeRadialRows,
    padRadialRows: level.padRadialRows,
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    globalH,
    probeH,
    meshSemanticHash: model.semanticHash,
    resultSemanticHash: result.semanticHash,
    minimumQJ: quality.minimumQJ,
    minimumScaledJacobian: quality.minimumScaledJacobian,
    maximumAspectRatio: quality.maximumAspectRatio,
    pressureResultant: Object.freeze({ ...pressureResultant }),
    supportReaction: Object.freeze({ ...supportReaction }),
    padProbePoint,
    padProbeRadialDisplacement: padProbeDisplacement.radial,
    padProbeRadialDisplacementMagnitude: Math.abs(padProbeDisplacement.radial),
    pipeProbePoint,
    pipeProbeHoopStress: pipeProbePolarStress.sigmaTheta,
    pipeProbeHoopStressMagnitude: Math.abs(pipeProbePolarStress.sigmaTheta),
    radialPath,
    pathHoopMembraneMagnitude: Math.abs(radialPath.hoopMembrane),
    pathHoopBendingMagnitude: Math.abs(radialPath.hoopBendingSurfaceAmplitude),
    interfaceEvidence,
    totalStrainEnergy: loadCase.totalStrainEnergy,
    equilibriumAccepted: true,
    energyAccepted: true,
  });
}

function pipePadMesh(level) {
  assert.equal(level.thetaColumns % 3, 0);
  const builder = meshBuilder();
  addPolarBlock(builder, {
    prefix: 'PIPE',
    r0: BB08_MODULE.innerRadius,
    r1: BB08_MODULE.innerRadius + BB08_MODULE.pipeThickness,
    theta0: 0,
    theta1: BB08_MODULE.sectorAngleRadians,
    radialElements: level.pipeRadialRows,
    circumferentialElements: level.thetaColumns,
    regionId: 'PIPE',
  });
  addPolarBlock(builder, {
    prefix: 'PAD',
    r0: BB08_MODULE.innerRadius + BB08_MODULE.pipeThickness,
    r1: BB08_MODULE.innerRadius + BB08_MODULE.pipeThickness + BB08_MODULE.padThickness,
    theta0: 0,
    theta1: BB08_MODULE.padHalfAngleRadians,
    radialElements: level.padRadialRows,
    circumferentialElements: level.thetaColumns / 3,
    regionId: 'PAD',
  });
  return builder.finish();
}

function barePipeMesh(level) {
  const builder = meshBuilder();
  addPolarBlock(builder, {
    prefix: 'PIPE',
    r0: BB08_MODULE.innerRadius,
    r1: BB08_MODULE.innerRadius + BB08_MODULE.pipeThickness,
    theta0: 0,
    theta1: BB08_MODULE.sectorAngleRadians,
    radialElements: level.pipeRadialRows,
    circumferentialElements: level.thetaColumns,
    regionId: 'PIPE',
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
    const key = `${x.toFixed(11)}:${y.toFixed(11)}`;
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
      const frozenElements = Object.freeze(elements.map((row) => Object.freeze(row)));
      const frozenNodes = Object.freeze(nodes);
      const nodesById = new Map(frozenNodes.map((row) => [row.nodeId, row]));
      const regionMembership = new Map(frozenNodes.map((row) => [row.nodeId, new Set()]));
      frozenElements.forEach((element) => element.nodeIds.forEach(
        (id) => regionMembership.get(id).add(element.regionId),
      ));
      const interfaceNodeIds = Object.freeze(
        [...regionMembership.entries()]
          .filter(([, regions]) => regions.has('PIPE') && regions.has('PAD'))
          .map(([id]) => id)
          .sort(),
      );
      return Object.freeze({
        nodes: frozenNodes,
        elements: frozenElements,
        nodesById,
        interfaceNodeIds,
      });
    },
  };
}

function addPolarBlock(builder, {
  prefix,
  r0,
  r1,
  theta0,
  theta1,
  radialElements,
  circumferentialElements,
  regionId,
}) {
  const dr = (r1 - r0) / radialElements;
  const dtheta = (theta1 - theta0) / circumferentialElements;
  for (let i = 0; i < circumferentialElements; i += 1) {
    const a0 = theta0 + i * dtheta;
    const a1 = a0 + dtheta;
    const am = 0.5 * (a0 + a1);
    for (let j = 0; j < radialElements; j += 1) {
      const b0 = r0 + j * dr;
      const b1 = b0 + dr;
      const bm = 0.5 * (b0 + b1);
      const nodeIds = [
        polarPoint(b0, a0),
        polarPoint(b1, a0),
        polarPoint(b1, a1),
        polarPoint(b0, a1),
        polarPoint(bm, a0),
        polarPoint(b1, am),
        polarPoint(bm, a1),
        polarPoint(b0, am),
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
  pressureLoads,
  loadCaseId,
  limitations,
}) {
  const hasPad = mesh.elements.some((row) => row.regionId === 'PAD');
  const materials = [{
    materialId: 'PIPE_MAT',
    elasticModulus: BB08_MODULE.material.elasticModulus,
    poissonRatio: BB08_MODULE.material.poissonRatio,
    sourceReference: 'BB08#PIPE_MAT',
  }];
  if (hasPad) materials.push({
    materialId: 'PAD_MAT',
    elasticModulus: BB08_MODULE.material.elasticModulus,
    poissonRatio: BB08_MODULE.material.poissonRatio,
    sourceReference: 'BB08#PAD_MAT',
  });
  return createCanonicalLocalContinuumModel({
    schema: 'local-continuum-model/v1',
    modelIdentity,
    modelVersion: 'BB08.1',
    sourceAncestry: {
      sourceModelIdentity: BB08_MODULE.geometryProfileId,
      sourceVersion: '1',
      adapterIdentity: 'BUCKET_B_BB08_CONFORMING_POLAR_Q8',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: BB08_MODULE.formulationProfile,
    materials,
    nodes: mesh.nodes.map((row) => ({
      ...row,
      sourceReference: `BB08#${modelIdentity}#${row.nodeId}`,
    })),
    elements: mesh.elements.map((row) => ({
      elementId: row.elementId,
      elementType: row.elementType,
      nodeIds: row.nodeIds,
      materialId: row.regionId === 'PAD' ? 'PAD_MAT' : 'PIPE_MAT',
      thickness: BB08_MODULE.outOfPlaneThickness,
      sourceReference: `BB08#${modelIdentity}#${row.elementId}`,
    })),
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'BB08_Q8_ONLY',
    },
    constraints,
    loadCases: [{
      loadCaseId,
      nodalForces: [],
      edgeTractions: [],
      pressureLoads,
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: `BB08#${loadCaseId}`,
    }],
    resultRequests: { loadCaseIds: [loadCaseId] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1',
      identity: 'BB08_Q8_PLANE_STRAIN_APPLICATION_PROFILE_V1',
      tolerances: toleranceTable(),
    },
    limitations,
  });
}

function pressureLoadsOnInnerRadius(boundary, nodesById, prefix) {
  const innerEdges = boundary.filter((edge) => edge.edgeNodeSequence.every(
    (nodeId) => Math.abs(radius(nodesById.get(nodeId)) - BB08_MODULE.innerRadius) <= 1e-7,
  ));
  assert.ok(innerEdges.length > 0, 'Inner pressure boundary was not found.');
  return innerEdges.map((edge, index) => ({
    pressureLoadId: `${prefix}-P-${index + 1}`,
    elementId: edge.elementId,
    edgeNodeIds: edge.edgeNodeIds,
    pressure: BB08_MODULE.internalPressure,
    sourceReference: `BB08#${prefix}#PRESSURE-${index + 1}`,
  }));
}

function symmetryConstraints(nodes) {
  const rows = [];
  nodes.forEach((node) => {
    if (Math.abs(node.y) <= 1e-9) rows.push(prescribed(node.nodeId, 'UY', 0, 'THETA_0_SYMMETRY'));
    if (Math.abs(node.x) <= 1e-9) rows.push(prescribed(node.nodeId, 'UX', 0, 'THETA_90_SYMMETRY'));
  });
  return rows;
}

function evaluateMeshQuality(mesh) {
  const quality = mesh.elements.map((element) => evaluateQ8Quality({
    elementId: element.elementId,
    nodes: element.nodeIds.map((nodeId) => mesh.nodesById.get(nodeId)),
    boundaryMidsideTargets: { 1: arcMidpoint, 3: arcMidpoint },
  }));
  const failed = quality.filter((row) => !row.accepted);
  assert.equal(failed.length, 0, JSON.stringify(failed.slice(0, 5)));
  return Object.freeze({
    minimumQJ: Math.min(...quality.map((row) => row.qJDeterminantRatio)),
    minimumScaledJacobian: Math.min(...quality.map((row) => row.minimumScaledJacobian)),
    maximumAspectRatio: Math.max(...quality.map((row) => row.aspectRatio)),
  });
}

function appliedPressureResultant(loadCase) {
  const contributions = loadCase.forceEvidence.contributions.filter(
    (row) => row.type === 'BOUNDARY_EDGE_PRESSURE',
  );
  assert.ok(contributions.length > 0, 'Pressure-force evidence is missing.');
  let totalX = 0;
  let totalY = 0;
  let nodalMoment = 0;
  contributions.forEach((row) => row.forcePerNode.forEach((force, index) => {
    totalX += force[0];
    totalY += force[1];
    const nodeId = row.nodeIds?.[index] ?? row.edgeNodeIds?.[index] ?? null;
    if (nodeId) {
      nodalMoment += 0;
    }
  }));
  return { totalX, totalY, nodalMoment, contributionCount: contributions.length };
}

function supportReactionResultant(loadCase) {
  let totalX = 0;
  let totalY = 0;
  loadCase.supportReactions.forEach((row) => {
    const [, dof] = row.dofIdentity.split(':');
    if (dof === 'UX') totalX += row.value;
    if (dof === 'UY') totalY += row.value;
  });
  return { totalX, totalY };
}

function radialPathDecomposition({ result, mesh, theta }) {
  const inner = BB08_MODULE.innerRadius;
  const interfaceRadius = inner + BB08_MODULE.pipeThickness;
  const outer = interfaceRadius + BB08_MODULE.padThickness;
  const totalThickness = outer - inner;
  const midpoint = 0.5 * (inner + outer);
  const segments = [
    { segmentId: 'PIPE', r0: inner, r1: interfaceRadius },
    { segmentId: 'PAD', r0: interfaceRadius, r1: outer },
  ];
  const samples = [];
  let integral = 0;
  let firstMoment = 0;
  segments.forEach((segment) => {
    const half = 0.5 * (segment.r1 - segment.r0);
    const center = 0.5 * (segment.r1 + segment.r0);
    GL8.forEach(([coordinate, weight], index) => {
      const r = center + half * coordinate;
      const point = polarPoint(r, theta);
      const recovery = recoverAtPoint({ result, mesh, point });
      const polar = polarStress(recovery.recoveredTensor, point);
      const weighted = weight * half;
      integral += weighted * polar.sigmaTheta;
      firstMoment += weighted * (r - midpoint) * polar.sigmaTheta;
      samples.push(Object.freeze({
        sampleId: `${segment.segmentId}-GP-${index + 1}`,
        segmentId: segment.segmentId,
        coordinate,
        weight,
        radius: r,
        point,
        containingElementId: recovery.containingElementId,
        naturalCoordinates: recovery.naturalCoordinates,
        sigmaRadial: polar.sigmaRadial,
        sigmaTheta: polar.sigmaTheta,
        tauRadialTheta: polar.tauRadialTheta,
      }));
    });
  });
  const hoopMembrane = integral / totalThickness;
  const hoopBendingSurfaceAmplitude = 6 * firstMoment / totalThickness ** 2;
  let hoopPeakResidual = 0;
  samples.forEach((sample) => {
    const linearized = hoopMembrane
      + hoopBendingSurfaceAmplitude * 2 * (sample.radius - midpoint) / totalThickness;
    hoopPeakResidual = Math.max(hoopPeakResidual, Math.abs(sample.sigmaTheta - linearized));
  });
  return Object.freeze({
    profileId: BB08_MODULE.radialPathProfileId,
    theta,
    innerRadius: inner,
    interfaceRadius,
    outerRadius: outer,
    totalThickness,
    hoopMembrane,
    hoopBendingSurfaceAmplitude,
    hoopPeakResidual,
    pressureCorrectionApplied: false,
    codeClassificationApplied: false,
    samples: Object.freeze(samples),
  });
}

function interfaceCompatibility({ result, mesh, level }) {
  const interfaceRadius = BB08_MODULE.innerRadius + BB08_MODULE.pipeThickness;
  const theta = 0.21;
  const pipeStep = BB08_MODULE.pipeThickness / level.pipeRadialRows;
  const padStep = BB08_MODULE.padThickness / level.padRadialRows;
  const offset = 0.20 * Math.min(pipeStep, padStep);
  const pipePoint = polarPoint(interfaceRadius - offset, theta);
  const padPoint = polarPoint(interfaceRadius + offset, theta);
  const pipeStress = polarStress(recoverAtPoint({ result, mesh, point: pipePoint }).recoveredTensor, pipePoint);
  const padStress = polarStress(recoverAtPoint({ result, mesh, point: padPoint }).recoveredTensor, padPoint);
  const tractionJump = Math.hypot(
    padStress.sigmaRadial - pipeStress.sigmaRadial,
    padStress.tauRadialTheta - pipeStress.tauRadialTheta,
  );
  const pipeElements = mesh.elements.filter((row) => row.regionId === 'PIPE');
  const padElements = mesh.elements.filter((row) => row.regionId === 'PAD');
  const allInterfaceNodesShared = mesh.interfaceNodeIds.every((nodeId) => (
    pipeElements.some((row) => row.nodeIds.includes(nodeId))
      && padElements.some((row) => row.nodeIds.includes(nodeId))
  ));
  return Object.freeze({
    profileId: BB08_MODULE.interfaceProfileId,
    interfaceNodeCount: mesh.interfaceNodeIds.length,
    duplicateInterfaceNodeCount: detectDuplicateInterfaceNodes(mesh.nodes).length,
    allInterfaceNodesShared,
    displacementCompatibilityAuthority: 'SINGLE_SHARED_GLOBAL_DOF_PER_INTERFACE_NODE',
    theta,
    offset,
    pipeTraction: Object.freeze([pipeStress.sigmaRadial, pipeStress.tauRadialTheta]),
    padTraction: Object.freeze([padStress.sigmaRadial, padStress.tauRadialTheta]),
    tractionJump,
    tractionJumpNormalized: tractionJump / BB08_MODULE.internalPressure,
  });
}

function recoverAtPoint({ result, mesh, point }) {
  const resultByElement = new Map(
    result.loadCaseResults[0].elementResults.map((row) => [row.elementId, row]),
  );
  const candidates = containingElements(mesh, point);
  assert.equal(candidates.length, 1, `Recovery containment count ${candidates.length} at ${JSON.stringify(point)}.`);
  const candidate = candidates[0];
  const recovery = recoverAtPhysicalCoordinate({
    elementId: candidate.element.elementId,
    nodes: candidate.nodes,
    point,
    gaussPointResults: resultByElement.get(candidate.element.elementId).gaussPointResults,
    mappingTolerance: 1e-8 * Math.max(1, Math.hypot(point.x, point.y)),
  });
  return Object.freeze({ point: Object.freeze({ ...point }), ...recovery });
}

function radialDisplacementAtPoint({ result, mesh, point }) {
  const candidates = containingElements(mesh, point);
  assert.equal(candidates.length, 1, `Displacement containment count ${candidates.length}.`);
  const candidate = candidates[0];
  const inverse = invertQ8Mapping(candidate.nodes, point, {
    tolerance: 1e-8 * Math.max(1, Math.hypot(point.x, point.y)),
  });
  assert.equal(inverse.converged, true);
  const { N } = q8Shape(inverse.xi, inverse.eta);
  const displacementByNode = new Map(
    result.loadCaseResults[0].nodalDisplacements.map((row) => [row.nodeId, row]),
  );
  let ux = 0;
  let uy = 0;
  candidate.element.nodeIds.forEach((nodeId, index) => {
    const displacement = displacementByNode.get(nodeId);
    ux += N[index] * displacement.ux;
    uy += N[index] * displacement.uy;
  });
  const r = Math.hypot(point.x, point.y);
  return Object.freeze({ ux, uy, radial: ux * point.x / r + uy * point.y / r });
}

function containingElements(mesh, point) {
  const tolerance = 1e-8 * Math.max(1, Math.hypot(point.x, point.y));
  const candidates = [];
  mesh.elements.forEach((element) => {
    const nodes = element.nodeIds.map((nodeId) => mesh.nodesById.get(nodeId));
    const inverse = invertQ8Mapping(nodes, point, { tolerance });
    if (
      inverse.converged
      && Math.abs(inverse.xi) < 1 - 1e-8
      && Math.abs(inverse.eta) < 1 - 1e-8
    ) candidates.push({ element, nodes, inverse });
  });
  return candidates;
}

function polarStress(stress, point) {
  const r = Math.hypot(point.x, point.y);
  const c = point.x / r;
  const s = point.y / r;
  const sigmaRadial = stress.sigmaX * c ** 2
    + stress.sigmaY * s ** 2
    + 2 * stress.tauXY * s * c;
  const sigmaTheta = stress.sigmaX * s ** 2
    + stress.sigmaY * c ** 2
    - 2 * stress.tauXY * s * c;
  const tauRadialTheta = (stress.sigmaY - stress.sigmaX) * s * c
    + stress.tauXY * (c ** 2 - s ** 2);
  return Object.freeze({ sigmaRadial, sigmaTheta, tauRadialTheta });
}

function lameReference(r) {
  const ri = BB08_MODULE.innerRadius;
  const ro = ri + BB08_MODULE.pipeThickness;
  const p = BB08_MODULE.internalPressure;
  const E = BB08_MODULE.material.elasticModulus;
  const nu = BB08_MODULE.material.poissonRatio;
  const A = p * ri ** 2 / (ro ** 2 - ri ** 2);
  const B = p * ri ** 2 * ro ** 2 / (ro ** 2 - ri ** 2);
  return Object.freeze({
    A,
    B,
    sigmaRadial: A - B / r ** 2,
    sigmaTheta: A + B / r ** 2,
    radialDisplacement: (1 + nu) / E * ((1 - 2 * nu) * A * r + B / r),
    constrainedAxialStress: 2 * nu * A,
  });
}

function convergence({ quantityKind, levels, field, limit, requireFourLevels = undefined }) {
  return evaluateConvergence({
    quantityKind,
    levels: levels.map((row) => ({
      level: row.levelId,
      h: row.globalH,
      probeH: isLocalQuantity(quantityKind) ? row.probeH : undefined,
      value: row[field],
    })),
    finestRelativeChangeLimit: limit,
    ...(requireFourLevels === undefined ? {} : { requireFourLevels }),
  });
}

function isLocalQuantity(quantityKind) {
  return ['LOCAL_STRESS', 'SCL_MEMBRANE', 'SCL_BENDING'].includes(quantityKind);
}

function assertConvergence(row, levels) {
  assert.ok(
    [CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC, CONVERGENCE_DISPOSITIONS.PASS_PLATEAU]
      .includes(row.disposition),
    `${row.quantityKind} -> ${row.disposition}; levels=${JSON.stringify(levels)}; result=${JSON.stringify(row)}`,
  );
}

function characteristicH(level, radiusAtProbe) {
  return Math.max(
    BB08_MODULE.pipeThickness / level.pipeRadialRows,
    BB08_MODULE.padThickness / level.padRadialRows,
    radiusAtProbe * BB08_MODULE.sectorAngleRadians / level.thetaColumns,
  );
}

function planeStrain(material, strain) {
  const factor = material.elasticModulus
    / ((1 + material.poissonRatio) * (1 - 2 * material.poissonRatio));
  return [
    factor * ((1 - material.poissonRatio) * strain[0] + material.poissonRatio * strain[1]),
    factor * (material.poissonRatio * strain[0] + (1 - material.poissonRatio) * strain[1]),
    factor * (1 - 2 * material.poissonRatio) * strain[2] / 2,
  ];
}

function prescribed(nodeId, dof, value, profile) {
  return {
    constraintId: `${profile}-${nodeId}-${dof}`,
    nodeId,
    dof,
    value,
    sourceReference: `BB08#${profile}#${nodeId}#${dof}`,
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

function arcMidpoint(left, right) {
  const r = 0.5 * (radius(left) + radius(right));
  const theta = 0.5 * (Math.atan2(left.y, left.x) + Math.atan2(right.y, right.x));
  return polarPoint(r, theta);
}

function polarPoint(r, theta) {
  return Object.freeze({ x: clean(r * Math.cos(theta)), y: clean(r * Math.sin(theta)) });
}

function radius(point) {
  return Math.hypot(point.x, point.y);
}

function clean(value) {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

function maxRelative(actual, expected) {
  return Math.max(...actual.map((value, index) => strictRelative(value, expected[index])));
}

function strictRelative(left, right) {
  return Math.abs(left - right) / Math.max(1e-12, Math.abs(right));
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

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hash(value) {
  return sha256(JSON.stringify(value));
}
