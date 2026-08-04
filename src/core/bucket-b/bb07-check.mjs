import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BB07_LEVELS,
  BB07_MODULE,
  CONVERGENCE_DISPOSITIONS,
  createBb07Evidence,
  createBb07Procedure,
  createBb07Report,
  evaluateConvergence,
  evaluateQ8Quality,
  integrateVariableEdgeLoad,
  invertQ8Mapping,
  recoverAtPhysicalCoordinate,
  validateBb06Report,
  validateBb07Report,
} from './index.js';
import {
  QUALIFICATION_STATES,
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
} from '../local-continuum/index.js';
import { buildBoundaryEdges } from '../local-continuum/assembly.js';
import { mappedTransfiniteMesh } from '../lafea-meshing/index.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const exactHeadSha = resolveExactHead();
const bb06ReportPath = resolve(
  ROOT,
  process.env.BB06_REPORT_PATH ?? 'reports/bucket-b-bb06-lug-clamp-report.json',
);
const bb06Report = JSON.parse(readFileSync(bb06ReportPath, 'utf8'));
validateBb06Report(bb06Report);
const procedure = createBb07Procedure({ bb06Report, exactHeadSha });
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

await check('BB07_BB06_SAME_HEAD_AUTHORITY', () => {
  assert.equal(bb06Report.exactHeadSha, exactHeadSha);
  assert.equal(bb06Report.bb07Authorized, true);
  assert.equal(procedure.bb06ReportHash, bb06Report.semanticHash);
  return {
    bb06ReportHash: bb06Report.semanticHash,
    exactHeadSha,
  };
});

await check('BB07_PROCEDURE_AUTHORITY', () => {
  assert.equal(procedure.module.moduleId, 'C2D-BRACKET-GUSSET');
  assert.equal(procedure.module.formulationProfile, 'PLANE_STRESS');
  assert.equal(procedure.module.elementProfile, 'Q8_FULL_3X3');
  assert.equal(procedure.applicationExecutionAuthorized, true);
  assert.equal(procedure.codeAssessmentAuthorized, false);
  assert.equal(procedure.bb08Authorized, false);
  return { procedureHash: procedure.semanticHash };
});

const manufacturedFieldEvidence = await check(
  'BB07_AFFINE_MANUFACTURED_FIELD',
  () => executeManufacturedField(BB07_LEVELS[1]),
);

const moduleEvidence = await check(
  'BB07_FOUR_LEVEL_APPLICATION_EXECUTION',
  () => executeApplication(manufacturedFieldEvidence),
);

await check('BB07_SECTION_RESULTANT_EQUILIBRIUM', () => {
  const finest = moduleEvidence.levels.at(-1);
  finest.sections.forEach((section) => {
    assert.ok(section.shearRelativeError <= 0.03, JSON.stringify(section));
    assert.ok(section.momentRelativeError <= 0.05, JSON.stringify(section));
    assert.ok(section.axialRelativeMagnitude <= 0.03, JSON.stringify(section));
  });
  return finest.sections;
});

await check('BB07_VARIABLE_DEPTH_BEAM_SANITY', () => {
  const finest = moduleEvidence.levels.at(-1);
  assert.ok(finest.beamReference.displacementRatio >= 0.35);
  assert.ok(finest.beamReference.displacementRatio <= 1.50);
  assert.ok(finest.beamReference.energyRatio >= 0.35);
  assert.ok(finest.beamReference.energyRatio <= 1.50);
  return finest.beamReference;
});

await check('BB07_CALLER_STATUS_TAMPER_REJECTED', () => {
  const provisionalEvidence = createBb07Evidence({ procedure, moduleEvidence });
  const provisionalReport = createBb07Report({
    evidence: provisionalEvidence,
    checkResults: [
      ...checks,
      { checkId: 'PROVISIONAL', status: 'PASS', evidenceHash: sha256('provisional') },
    ],
  });
  assert.throws(
    () => validateBb07Report({ ...provisionalReport, bb08Authorized: false }),
    /authorization|hash/i,
  );
  return { rejected: true };
});

const evidence = createBb07Evidence({ procedure, moduleEvidence });
const report = createBb07Report({ evidence, checkResults: [...checks] });
validateBb07Report(report);
assert.equal(report.status, 'BB07_PROCEDURE_QUALIFIED');
assert.equal(report.bb08Authorized, true);
assert.equal(report.applicationExecutionAuthorized, false);
assert.equal(report.axisymmetricAuthorized, false);

const reportPath = resolve(
  ROOT,
  process.env.BB07_REPORT_PATH ?? 'reports/bucket-b-bb07-bracket-gusset-report.json',
);
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function executeManufacturedField(level) {
  const mesh = taperedBracketMesh(level);
  const boundary = buildBoundaryEdges(mesh.elements);
  const boundaryNodeIds = [...new Set(
    boundary.flatMap((edge) => edge.edgeNodeSequence),
  )].sort();
  const epsilonX = 1.0e-4;
  const epsilonY = -3.0e-5;
  const gammaXY = 2.0e-5;
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
    modelIdentity: 'C2D-BRACKET-GUSSET-AFFINE',
    constraints,
    edgeTractions: [],
    loadCaseId: 'AFFINE_FIELD',
    limitations: ['MANUFACTURED_FIELD_ONLY'],
  });
  const result = calculateLocalContinuum(model);
  const expected = planeStress(
    BB07_MODULE.material,
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
        maxRelative(strain, [epsilonX, epsilonY, gammaXY]),
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
    profileId: 'BB07_AFFINE_PLANE_STRESS_FIELD_V1',
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

function executeApplication(manufacturedFieldEvidence) {
  const levels = BB07_LEVELS.map(executeApplicationLevel);
  const displacementConvergence = convergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels,
    field: 'loadedEdgeMeanUyMagnitude',
    limit: 0.01,
  });
  const energyConvergence = convergence({
    quantityKind: 'STRAIN_ENERGY',
    levels,
    field: 'totalStrainEnergy',
    limit: 0.01,
    requireFourLevels: true,
  });
  const localStressConvergence = convergence({
    quantityKind: 'LOCAL_STRESS',
    levels,
    field: 'fixedPointVonMises',
    limit: 0.05,
  });
  [displacementConvergence, energyConvergence, localStressConvergence]
    .forEach((row) => assertConvergence(row, levels));

  return Object.freeze({
    moduleId: BB07_MODULE.moduleId,
    geometryProfileId: BB07_MODULE.geometryProfileId,
    meshFamilyId: BB07_MODULE.meshFamilyId,
    formulationProfile: BB07_MODULE.formulationProfile,
    elementProfile: BB07_MODULE.elementProfile,
    procedureScope: BB07_MODULE.procedureScope,
    limitations: BB07_MODULE.limitations,
    manufacturedFieldEvidence,
    manufacturedFieldQualified: manufacturedFieldEvidence.qualified,
    levels,
    displacementConvergence,
    energyConvergence,
    localStressConvergence,
    applicationProcedureQualified: true,
    numericalOutputQualified: true,
  });
}

function executeApplicationLevel(level) {
  const mesh = taperedBracketMesh(level);
  const boundary = buildBoundaryEdges(mesh.elements);
  const supportEdges = boundary.filter((edge) => edge.edgeNodeSequence.every(
    (nodeId) => Math.abs(mesh.nodesById.get(nodeId).x) <= 1e-9,
  ));
  const loadedEdges = boundary.filter((edge) => edge.edgeNodeSequence.every(
    (nodeId) => Math.abs(mesh.nodesById.get(nodeId).x - BB07_MODULE.length) <= 1e-9,
  ));
  assert.equal(supportEdges.length, level.rows);
  assert.equal(loadedEdges.length, level.rows);

  const load = distributedEndLoad(loadedEdges, mesh.nodesById);
  assert.ok(Math.abs(load.resultant[0]) <= 1e-8);
  assert.ok(relative(load.resultant[1], BB07_MODULE.distributedEndLoad) <= 1e-10);
  assert.ok(relative(
    load.moment,
    BB07_MODULE.length * BB07_MODULE.distributedEndLoad,
  ) <= 1e-10);

  const supportNodeIds = [...new Set(
    supportEdges.flatMap((edge) => edge.edgeNodeSequence),
  )].sort();
  const model = canonicalModel({
    mesh,
    modelIdentity: `${BB07_MODULE.moduleId}-${level.levelId}`,
    constraints: supportNodeIds.flatMap((nodeId) => [
      prescribed(nodeId, 'UX', 0, 'FIXED_SUPPORT'),
      prescribed(nodeId, 'UY', 0, 'FIXED_SUPPORT'),
    ]),
    edgeTractions: load.edgeTractions,
    loadCaseId: 'DISTRIBUTED_END_LOAD',
    limitations: BB07_MODULE.limitations,
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

  const quality = mesh.elements.map((element) => evaluateQ8Quality({
    elementId: element.elementId,
    nodes: element.nodeIds.map((nodeId) => mesh.nodesById.get(nodeId)),
    hotspot: element.nodeIds.some(
      (nodeId) => mesh.nodesById.get(nodeId).x >= 0.65 * BB07_MODULE.length,
    ),
  }));
  const failedQuality = quality.filter((row) => !row.accepted);
  assert.equal(failedQuality.length, 0, JSON.stringify(failedQuality.slice(0, 3)));

  const reaction = supportReaction(loadCase, mesh.nodesById);
  assert.ok(Math.abs(reaction.totalX) <= 1e-5 * Math.abs(BB07_MODULE.distributedEndLoad));
  assert.ok(relative(reaction.totalY, -BB07_MODULE.distributedEndLoad) <= 1e-6);
  assert.ok(relative(
    reaction.moment,
    -BB07_MODULE.length * BB07_MODULE.distributedEndLoad,
  ) <= 1e-6);

  const loadedNodeIds = [...new Set(
    loadedEdges.flatMap((edge) => edge.edgeNodeSequence),
  )];
  const displacementByNode = new Map(
    loadCase.nodalDisplacements.map((row) => [row.nodeId, row]),
  );
  const loadedEdgeMeanUy = loadedNodeIds.reduce(
    (sum, nodeId) => sum + displacementByNode.get(nodeId).uy,
    0,
  ) / loadedNodeIds.length;
  assert.ok(loadedEdgeMeanUy < 0);

  const sectionX = Object.freeze([94, 146]);
  const sections = sectionX.map((x) => sectionResultants({ result, mesh, x }));
  const fixedPoint = recoverAtPoint({
    result,
    mesh,
    point: sectionPoint(146, 0.72),
  });
  const fixedPointVonMises = vonMises(fixedPoint.recoveredTensor);
  const beam = variableDepthBeamReference();
  const loadedEdgeMeanUyMagnitude = Math.abs(loadedEdgeMeanUy);
  const beamReference = Object.freeze({
    profileId: 'BB07_VARIABLE_DEPTH_TIMOSHENKO_BEAM_V1',
    displacementMagnitude: beam.displacementMagnitude,
    strainEnergy: beam.strainEnergy,
    displacementRatio: loadedEdgeMeanUyMagnitude / beam.displacementMagnitude,
    energyRatio: loadCase.totalStrainEnergy / beam.strainEnergy,
  });
  const globalH = Math.max(
    BB07_MODULE.length / level.columns,
    BB07_MODULE.supportDepth / level.rows,
  );
  const probeH = Math.max(
    BB07_MODULE.length / level.columns,
    localDepth(146) / level.rows,
  );

  return Object.freeze({
    levelId: level.levelId,
    columns: level.columns,
    rows: level.rows,
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    globalH,
    probeH,
    meshSemanticHash: model.semanticHash,
    resultSemanticHash: result.semanticHash,
    minimumQJ: Math.min(...quality.map((row) => row.qJDeterminantRatio)),
    minimumScaledJacobian: Math.min(
      ...quality.map((row) => row.minimumScaledJacobian),
    ),
    maximumAspectRatio: Math.max(...quality.map((row) => row.aspectRatio)),
    loadNormalization: load,
    supportReaction: reaction,
    loadedEdgeMeanUy,
    loadedEdgeMeanUyMagnitude,
    totalStrainEnergy: loadCase.totalStrainEnergy,
    sections: Object.freeze(sections),
    fixedPoint: Object.freeze({
      point: fixedPoint.point,
      containingElementId: fixedPoint.containingElementId,
      naturalCoordinates: fixedPoint.naturalCoordinates,
      mappingResidual: fixedPoint.mappingResidual,
    }),
    fixedPointVonMises,
    beamReference,
    equilibriumAccepted: true,
    energyAccepted: true,
  });
}

function taperedBracketMesh(level) {
  const bottom = chain(level.columns, (u) => ({
    x: BB07_MODULE.length * u,
    y: bottomY(BB07_MODULE.length * u),
  }));
  const top = chain(level.columns, (u) => ({
    x: BB07_MODULE.length * u,
    y: BB07_MODULE.supportDepth,
  }));
  const left = chain(level.rows, (v) => ({
    x: 0,
    y: BB07_MODULE.supportDepth * v,
  }));
  const right = chain(level.rows, (v) => ({
    x: BB07_MODULE.length,
    y: bottomY(BB07_MODULE.length)
      + BB07_MODULE.loadedEdgeDepth * v,
  }));
  const local = mappedTransfiniteMesh(bottom, top, left, right);
  return globalize(local.elements);
}

function chain(elementCount, pointAt) {
  return Array.from(
    { length: 2 * elementCount + 1 },
    (_, index) => Object.freeze(pointAt(index / (2 * elementCount))),
  );
}

function globalize(localElements) {
  const ids = new Map();
  const nodes = [];
  let counter = 0;
  const nodeId = (point) => {
    const x = Math.abs(point.x) < 1e-12 ? 0 : point.x;
    const y = Math.abs(point.y) < 1e-12 ? 0 : point.y;
    const key = `${x.toFixed(10)}:${y.toFixed(10)}`;
    if (!ids.has(key)) {
      const id = `N${counter}`;
      counter += 1;
      ids.set(key, id);
      nodes.push(Object.freeze({ nodeId: id, x, y }));
    }
    return ids.get(key);
  };
  const elements = localElements.map((element, index) => Object.freeze({
    elementId: `E${index}`,
    elementType: 'Q8',
    nodeIds: Object.freeze(element.nodes.map(nodeId)),
  }));
  const nodesById = new Map(nodes.map((row) => [row.nodeId, row]));
  return Object.freeze({
    nodes: Object.freeze(nodes),
    elements: Object.freeze(elements),
    nodesById,
  });
}

function distributedEndLoad(loadedEdges, nodesById) {
  const tractionY = BB07_MODULE.distributedEndLoad
    / (BB07_MODULE.thickness * BB07_MODULE.loadedEdgeDepth);
  const rows = loadedEdges.map((edge, index) => {
    const nodes = edge.edgeNodeSequence.map((nodeId) => nodesById.get(nodeId));
    const integration = integrateVariableEdgeLoad({
      nodes,
      thickness: BB07_MODULE.thickness,
      tractionAt: () => [0, tractionY],
    });
    return Object.freeze({
      edge,
      integration,
      traction: Object.freeze([0, tractionY]),
      edgeTraction: Object.freeze({
        tractionId: `END-LOAD-${index + 1}`,
        elementId: edge.elementId,
        edgeNodeIds: edge.edgeNodeIds,
        tx: 0,
        ty: tractionY,
        sourceReference: `BB07#END-LOAD-${index + 1}`,
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
  const moment = rows.reduce((sum, row) => sum + row.integration.moment, 0);
  return Object.freeze({
    profileId: 'BB07_DISTRIBUTED_END_EDGE_TRACTION_V1',
    tractionY,
    resultant: Object.freeze(resultant),
    moment,
    edgeTractions: Object.freeze(rows.map((row) => row.edgeTraction)),
  });
}

function canonicalModel({
  mesh,
  modelIdentity,
  constraints,
  edgeTractions,
  loadCaseId,
  limitations,
}) {
  return createCanonicalLocalContinuumModel({
    schema: 'local-continuum-model/v1',
    modelIdentity,
    modelVersion: 'BB07.1',
    sourceAncestry: {
      sourceModelIdentity: BB07_MODULE.geometryProfileId,
      sourceVersion: '1',
      adapterIdentity: 'BUCKET_B_BB07_MAPPED_TAPERED_Q8',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: BB07_MODULE.formulationProfile,
    materials: [{
      materialId: 'MAT',
      elasticModulus: BB07_MODULE.material.elasticModulus,
      poissonRatio: BB07_MODULE.material.poissonRatio,
      sourceReference: 'BB07#MAT',
    }],
    nodes: mesh.nodes.map((row) => ({
      ...row,
      sourceReference: `BB07#${modelIdentity}#${row.nodeId}`,
    })),
    elements: mesh.elements.map((row) => ({
      ...row,
      materialId: 'MAT',
      thickness: BB07_MODULE.thickness,
      sourceReference: `BB07#${modelIdentity}#${row.elementId}`,
    })),
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'BB07_Q8_ONLY',
    },
    constraints,
    loadCases: [{
      loadCaseId,
      nodalForces: [],
      edgeTractions,
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: `BB07#${loadCaseId}`,
    }],
    resultRequests: { loadCaseIds: [loadCaseId] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1',
      identity: 'BB07_Q8_APPLICATION_PROFILE_V1',
      tolerances: toleranceTable(),
    },
    limitations,
  });
}

function sectionResultants({ result, mesh, x }) {
  const bottom = bottomY(x);
  const top = BB07_MODULE.supportDepth;
  const depth = top - bottom;
  const center = (top + bottom) / 2;
  const samples = GL8.map(([coordinate, weight], index) => {
    const y = center + 0.5 * depth * coordinate;
    const recovery = recoverAtPoint({ result, mesh, point: { x, y } });
    return Object.freeze({
      sampleId: `SECTION-${x}-GP-${index + 1}`,
      coordinate,
      weight,
      y,
      stress: recovery.recoveredTensor,
      containingElementId: recovery.containingElementId,
    });
  });
  const scale = BB07_MODULE.thickness * depth / 2;
  const axial = scale * samples.reduce(
    (sum, row) => sum + row.weight * row.stress.sigmaX,
    0,
  );
  const shear = scale * samples.reduce(
    (sum, row) => sum + row.weight * row.stress.tauXY,
    0,
  );
  const moment = scale * samples.reduce(
    (sum, row) => sum - row.weight * (row.y - center) * row.stress.sigmaX,
    0,
  );
  const expectedShearMagnitude = Math.abs(BB07_MODULE.distributedEndLoad);
  const expectedMomentMagnitude = expectedShearMagnitude * (BB07_MODULE.length - x);
  return Object.freeze({
    profileId: 'BB07_FIXED_X_GL8_SECTION_RESULTANTS_V1',
    x,
    bottom,
    top,
    center,
    axial,
    shear,
    moment,
    axialRelativeMagnitude: Math.abs(axial) / expectedShearMagnitude,
    shearRelativeError: relative(Math.abs(shear), expectedShearMagnitude),
    momentRelativeError: relative(Math.abs(moment), expectedMomentMagnitude),
    samples: Object.freeze(samples),
  });
}

function recoverAtPoint({ result, mesh, point }) {
  const resultByElement = new Map(
    result.loadCaseResults[0].elementResults.map((row) => [row.elementId, row]),
  );
  const candidates = [];
  mesh.elements.forEach((element) => {
    const nodes = element.nodeIds.map((nodeId) => mesh.nodesById.get(nodeId));
    const inverse = invertQ8Mapping(nodes, point, {
      tolerance: 1e-9 * Math.max(1, Math.hypot(point.x, point.y)),
    });
    if (
      inverse.converged
      && Math.abs(inverse.xi) <= 1 + 1e-8
      && Math.abs(inverse.eta) <= 1 + 1e-8
    ) candidates.push({ element, nodes });
  });
  assert.equal(candidates.length, 1, `Recovery containment count ${candidates.length}.`);
  const candidate = candidates[0];
  const recovery = recoverAtPhysicalCoordinate({
    elementId: candidate.element.elementId,
    nodes: candidate.nodes,
    point,
    gaussPointResults: resultByElement.get(
      candidate.element.elementId,
    ).gaussPointResults,
    mappingTolerance: 1e-9 * Math.max(1, Math.hypot(point.x, point.y)),
  });
  return Object.freeze({ point: Object.freeze({ ...point }), ...recovery });
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

function variableDepthBeamReference() {
  const force = Math.abs(BB07_MODULE.distributedEndLoad);
  const E = BB07_MODULE.material.elasticModulus;
  const G = E / (2 * (1 + BB07_MODULE.material.poissonRatio));
  const kappa = 5 / 6;
  const intervals = 20000;
  const dx = BB07_MODULE.length / intervals;
  let integral = 0;
  for (let index = 0; index <= intervals; index += 1) {
    const x = index * dx;
    const depth = localDepth(x);
    const area = BB07_MODULE.thickness * depth;
    const inertia = BB07_MODULE.thickness * depth ** 3 / 12;
    const integrand = force * (BB07_MODULE.length - x) ** 2 / (E * inertia)
      + force / (kappa * G * area);
    const weight = index === 0 || index === intervals
      ? 1
      : index % 2 === 0
        ? 2
        : 4;
    integral += weight * integrand;
  }
  const displacementMagnitude = dx * integral / 3;
  return Object.freeze({
    displacementMagnitude,
    strainEnergy: 0.5 * force * displacementMagnitude,
  });
}

function convergence({
  quantityKind,
  levels,
  field,
  limit,
  requireFourLevels = undefined,
}) {
  return evaluateConvergence({
    quantityKind,
    levels: levels.map((row) => ({
      level: row.levelId,
      h: row.globalH,
      probeH: quantityKind === 'LOCAL_STRESS' ? row.probeH : undefined,
      value: row[field],
    })),
    finestRelativeChangeLimit: limit,
    ...(requireFourLevels === undefined ? {} : { requireFourLevels }),
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

function prescribed(nodeId, dof, value, profile) {
  return {
    constraintId: `${profile}-${nodeId}-${dof}`,
    nodeId,
    dof,
    value,
    sourceReference: `BB07#${profile}#${nodeId}#${dof}`,
  };
}

function planeStress(material, strain) {
  const coefficient = material.elasticModulus
    / (1 - material.poissonRatio ** 2);
  return [
    coefficient * (strain[0] + material.poissonRatio * strain[1]),
    coefficient * (material.poissonRatio * strain[0] + strain[1]),
    material.elasticModulus / (2 * (1 + material.poissonRatio)) * strain[2],
  ];
}

function maxRelative(actual, expected) {
  return Math.max(...actual.map(
    (value, index) => relative(value, expected[index]),
  ));
}

function vonMises(stress) {
  return Math.sqrt(
    stress.sigmaX ** 2
      - stress.sigmaX * stress.sigmaY
      + stress.sigmaY ** 2
      + 3 * stress.tauXY ** 2,
  );
}

function sectionPoint(x, normalizedDepth) {
  return {
    x,
    y: bottomY(x) + normalizedDepth * localDepth(x),
  };
}

function bottomY(x) {
  return (BB07_MODULE.supportDepth - BB07_MODULE.loadedEdgeDepth)
    * x / BB07_MODULE.length;
}

function localDepth(x) {
  return BB07_MODULE.supportDepth - bottomY(x);
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

function relative(left, right) {
  return Math.abs(left - right) / Math.max(1, Math.abs(left), Math.abs(right));
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
