import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BB06_LEVELS,
  BB06_MODULES,
  CONVERGENCE_DISPOSITIONS,
  createBb06Evidence,
  createBb06Procedure,
  createBb06Report,
  evaluateConvergence,
  evaluateQ8Quality,
  integrateVariableEdgeLoad,
  invertQ8Mapping,
  recoverAtPhysicalCoordinate,
  validateBb06Report,
} from './index.js';
import {
  QUALIFICATION_STATES,
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
} from '../local-continuum/index.js';
import { buildBoundaryEdges } from '../local-continuum/assembly.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const exactHeadSha = resolveExactHead();
const procedure = createBb06Procedure();
const checks = [];

async function check(checkId, operation) {
  try {
    const evidence = await operation();
    checks.push(Object.freeze({ checkId, status: 'PASS', evidenceHash: hash(evidence ?? true) }));
    return evidence;
  } catch (error) {
    checks.push(Object.freeze({ checkId, status: 'FAIL', evidenceHash: hash({ name: error?.name, message: error?.message }) }));
    throw new Error(`${checkId} failed: ${error?.stack ?? error}`);
  }
}

await check('BB06_PROCEDURE_AUTHORITY', () => {
  assert.equal(procedure.baseline.integratedSharedGateMergeSha, 'b81e9f12dfe64fc9643808fc735597d0e94a42cc');
  assert.equal(procedure.baseline.bucket01InfrastructureMergeSha, 'afa4dbab9242d67a9462795b55bb47526427a11d');
  assert.equal(procedure.applicationExecutionAuthorized, true);
  assert.equal(procedure.codeAssessmentAuthorized, false);
  assert.equal(procedure.bb07Authorized, false);
  return { procedureHash: procedure.semanticHash };
});

const openHoleEvidence = await check('BB06_OPEN_HOLE_KIRSCH_REFERENCE', () => {
  const child = spawnSync(process.execPath, ['scripts/lafea.3-benchmark-cont-hole-01-check.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  return Object.freeze({
    benchmarkId: 'CONT-HOLE-01',
    status: 'PASS',
    stdoutHash: sha256(child.stdout ?? ''),
    stderrHash: sha256(child.stderr ?? ''),
  });
});

const moduleEvidence = [];
for (const module of Object.values(BB06_MODULES)) {
  moduleEvidence.push(await check(
    `BB06_${module.moduleId}_FOUR_LEVEL_EXECUTION`,
    () => executeModule(module),
  ));
}

await check('BB06_SCOPE_METADATA', () => {
  for (const row of moduleEvidence) {
    assert.equal(row.contact, 'NONE');
    assert.equal(row.pinModel, 'DISTRIBUTED_BEARING_SURROGATE');
    assert.equal(row.clearance, 'NOT_MODELED');
    assert.equal(row.friction, 'NOT_MODELED');
    assert.ok(row.limitations.length >= 4);
  }
  return moduleEvidence.map(({ moduleId, limitations }) => ({ moduleId, limitations }));
});

await check('BB06_CALLER_STATUS_TAMPER_REJECTED', () => {
  const provisionalEvidence = createBb06Evidence({
    procedure,
    exactHeadSha,
    moduleEvidence,
    openHoleEvidence,
  });
  const provisionalChecks = [
    ...checks,
    { checkId: 'PROVISIONAL', status: 'PASS', evidenceHash: sha256('provisional') },
  ];
  const valid = createBb06Report({
    evidence: provisionalEvidence,
    checkResults: provisionalChecks,
  });
  assert.throws(
    () => validateBb06Report({ ...valid, bb07Authorized: false }),
    /authorization|hash/i,
  );
  return { rejected: true };
});

const evidence = createBb06Evidence({
  procedure,
  exactHeadSha,
  moduleEvidence,
  openHoleEvidence,
});
const report = createBb06Report({ evidence, checkResults: [...checks] });
validateBb06Report(report);
assert.equal(report.status, 'BB06_PROCEDURE_QUALIFIED');
assert.equal(report.bb07Authorized, true);
assert.equal(report.applicationExecutionAuthorized, false);
assert.equal(report.axisymmetricAuthorized, false);

const reportPath = resolve(
  ROOT,
  process.env.BB06_REPORT_PATH ?? 'reports/bucket-b-bb06-lug-clamp-report.json',
);
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function executeModule(module) {
  const levels = BB06_LEVELS.map((level) => executeLevel(module, level));
  const displacementConvergence = evaluateQuantity(
    'GLOBAL_DISPLACEMENT', levels, 'loadedHoleMeanUx', 0.03,
  );
  const localStressConvergence = evaluateQuantity(
    'LOCAL_STRESS', levels, 'finiteRadiusHoopStress', 0.05,
  );
  const reactionSplitConvergence = evaluateQuantity(
    'REACTION_SPLIT', levels, 'upperReactionFraction', 0.01,
  );
  for (const row of [
    displacementConvergence,
    localStressConvergence,
    reactionSplitConvergence,
  ]) {
    assert.ok(
      [
        CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC,
        CONVERGENCE_DISPOSITIONS.PASS_PLATEAU,
      ].includes(row.disposition),
      `${module.moduleId}: ${row.quantityKind} -> ${row.disposition}`,
    );
  }
  return Object.freeze({
    moduleId: module.moduleId,
    geometryProfileId: module.geometryProfileId,
    formulationProfile: module.formulationProfile,
    elementProfile: module.elementProfile,
    procedureScope: module.procedureScope,
    contact: 'NONE',
    pinModel: 'DISTRIBUTED_BEARING_SURROGATE',
    clearance: 'NOT_MODELED',
    friction: 'NOT_MODELED',
    limitations: module.limitations,
    levels,
    displacementConvergence,
    localStressConvergence,
    reactionSplitConvergence,
    applicationProcedureQualified: true,
    numericalOutputQualified: true,
  });
}

function evaluateQuantity(quantityKind, levels, field, finestRelativeChangeLimit) {
  const local = quantityKind !== 'GLOBAL_DISPLACEMENT';
  return evaluateConvergence({
    quantityKind,
    levels: levels.map((row) => ({
      level: row.levelId,
      h: row.globalH,
      probeH: local ? row.probeH : undefined,
      value: row[field],
    })),
    finestRelativeChangeLimit,
  });
}

function executeLevel(module, level) {
  const mesh = exactPolarAnnulusQ8({
    innerRadius: module.holeRadius,
    outerRadius: module.outerRadius,
    radialElements: level.radialElements,
    circumferentialElements: 2 * level.circumferentialElementsPerHalf,
  });
  const nodesById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const boundary = buildBoundaryEdges(mesh.elements);
  const innerEdges = boundaryAtRadius(boundary, nodesById, module.holeRadius);
  const outerEdges = boundaryAtRadius(boundary, nodesById, module.outerRadius);
  assert.equal(innerEdges.length, 2 * level.circumferentialElementsPerHalf);
  assert.equal(outerEdges.length, 2 * level.circumferentialElementsPerHalf);

  const bearing = normalizedBearingLoad(module, innerEdges, nodesById);
  assert.ok(relativeError(bearing.resultant[0], module.bearingResultant) <= 1e-10);
  assert.ok(Math.abs(bearing.resultant[1]) <= 1e-9 * module.bearingResultant);
  assert.ok(
    Math.abs(bearing.moment)
      <= 1e-8 * module.bearingResultant * module.holeRadius,
  );

  const outerNodeIds = [
    ...new Set(outerEdges.flatMap((edge) => edge.edgeNodeSequence)),
  ].sort();
  const canonical = createCanonicalLocalContinuumModel({
    schema: 'local-continuum-model/v1',
    modelIdentity: `${module.moduleId}-${level.levelId}`,
    modelVersion: 'BB06.2',
    sourceAncestry: {
      sourceModelIdentity: module.geometryProfileId,
      sourceVersion: '1',
      adapterIdentity: 'BUCKET_B_BB06_EXACT_POLAR_Q8',
      adapterVersion: '2',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: module.formulationProfile,
    materials: [{
      materialId: 'MAT',
      elasticModulus: module.material.elasticModulus,
      poissonRatio: module.material.poissonRatio,
      sourceReference: `BB06#${module.moduleId}#MAT`,
    }],
    nodes: mesh.nodes.map((row) => ({
      ...row,
      sourceReference: `BB06#${module.moduleId}#${level.levelId}#${row.nodeId}`,
    })),
    elements: mesh.elements.map((row) => ({
      ...row,
      materialId: 'MAT',
      thickness: module.thickness,
      sourceReference: `BB06#${module.moduleId}#${level.levelId}#${row.elementId}`,
    })),
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'BB06_Q8_ONLY',
    },
    constraints: outerNodeIds.flatMap((nodeId) => [
      constraint(nodeId, 'UX'),
      constraint(nodeId, 'UY'),
    ]),
    loadCases: [{
      loadCaseId: 'COSINE_BEARING',
      nodalForces: [],
      edgeTractions: bearing.edgeTractions,
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: `BB06#${module.moduleId}#COSINE_BEARING`,
    }],
    resultRequests: { loadCaseIds: ['COSINE_BEARING'] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1',
      identity: 'BB06_Q8_APPLICATION_PROFILE_V2',
      tolerances: toleranceTable(),
    },
    limitations: module.limitations,
  });

  const result = calculateLocalContinuum(canonical);
  assert.equal(
    result.qualification.state,
    QUALIFICATION_STATES.ACCEPTED,
    JSON.stringify(result.diagnostics),
  );
  const loadCase = result.loadCaseResults[0];
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);

  const qualityRows = mesh.elements.map((element) => {
    const nodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    return evaluateQ8Quality({
      elementId: element.elementId,
      nodes,
      hotspot: nodes.some(
        (node) => Math.hypot(node.x, node.y) < 1.5 * module.holeRadius,
      ),
      boundaryMidsideTargets: circularEdgeTargets(nodes),
    });
  });
  const failedQuality = qualityRows.filter((row) => !row.accepted);
  assert.equal(
    failedQuality.length,
    0,
    JSON.stringify(failedQuality.slice(0, 3)),
  );

  const reactions = reactionSplit(loadCase, nodesById, module.bearingResultant);
  assert.ok(relativeError(reactions.totalX, -module.bearingResultant) <= 1e-6);
  assert.ok(Math.abs(reactions.totalY) <= 1e-6 * module.bearingResultant);
  assert.ok(Math.abs(reactions.upperFraction - 0.5) <= 0.01);
  assert.ok(Math.abs(reactions.lowerFraction - 0.5) <= 0.01);

  const innerNodeIds = [
    ...new Set(innerEdges.flatMap((edge) => edge.edgeNodeSequence)),
  ];
  const displacementByNode = new Map(
    loadCase.nodalDisplacements.map((row) => [row.nodeId, row]),
  );
  const loadedNodeIds = innerNodeIds.filter(
    (nodeId) => nodesById.get(nodeId).x >= -1e-9,
  );
  const loadedHoleMeanUx = loadedNodeIds.reduce(
    (sum, nodeId) => sum + displacementByNode.get(nodeId).ux,
    0,
  ) / loadedNodeIds.length;
  assert.ok(Number.isFinite(loadedHoleMeanUx) && loadedHoleMeanUx > 0);

  const probeAngle = 0.37;
  const probeRadius = 1.2 * module.holeRadius;
  const stressProbe = recoverStressAtPoint({
    result,
    mesh,
    point: {
      x: probeRadius * Math.cos(probeAngle),
      y: probeRadius * Math.sin(probeAngle),
    },
  });
  const finiteRadiusHoopStress = rotateToHoop(
    stressProbe.recoveredTensor,
    probeAngle,
  );
  assert.ok(Number.isFinite(finiteRadiusHoopStress));

  const globalH = Math.max(
    (module.outerRadius - module.holeRadius) / level.radialElements,
    2 * Math.PI * module.outerRadius
      / (2 * level.circumferentialElementsPerHalf),
  );
  const probeH = Math.max(
    (module.outerRadius - module.holeRadius) / level.radialElements,
    2 * Math.PI * probeRadius
      / (2 * level.circumferentialElementsPerHalf),
  );

  return Object.freeze({
    levelId: level.levelId,
    radialElements: level.radialElements,
    circumferentialElementsPerHalf: level.circumferentialElementsPerHalf,
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    globalH,
    probeH,
    meshSemanticHash: canonical.semanticHash,
    resultSemanticHash: result.semanticHash,
    loadNormalization: {
      analyticalAmplitude: bearing.analyticalAmplitude,
      discreteScale: bearing.discreteScale,
      resultant: bearing.resultant,
      moment: bearing.moment,
    },
    minimumQJ: Math.min(...qualityRows.map((row) => row.qJDeterminantRatio)),
    minimumScaledJacobian: Math.min(
      ...qualityRows.map((row) => row.minimumScaledJacobian),
    ),
    maximumAspectRatio: Math.max(
      ...qualityRows.map((row) => row.aspectRatio),
    ),
    loadedHoleMeanUx,
    stressProbe: {
      point: stressProbe.point,
      containingElementId: stressProbe.containingElementId,
      naturalCoordinates: stressProbe.naturalCoordinates,
      mappingResidual: stressProbe.mappingResidual,
    },
    finiteRadiusHoopStress,
    totalReactionX: reactions.totalX,
    totalReactionY: reactions.totalY,
    upperReactionFraction: reactions.upperFraction,
    lowerReactionFraction: reactions.lowerFraction,
    totalStrainEnergy: loadCase.totalStrainEnergy,
    equilibriumAccepted: true,
    energyAccepted: true,
  });
}

function exactPolarAnnulusQ8({
  innerRadius,
  outerRadius,
  radialElements,
  circumferentialElements,
}) {
  const localElements = [];
  const point = (radius, angle) => ({
    x: radius * Math.cos(angle),
    y: radius * Math.sin(angle),
  });
  for (let radialIndex = 0; radialIndex < radialElements; radialIndex += 1) {
    const r0 = innerRadius
      + (outerRadius - innerRadius) * radialIndex / radialElements;
    const r1 = innerRadius
      + (outerRadius - innerRadius) * (radialIndex + 1) / radialElements;
    const rm = (r0 + r1) / 2;
    for (
      let circumferentialIndex = 0;
      circumferentialIndex < circumferentialElements;
      circumferentialIndex += 1
    ) {
      const a0 = 2 * Math.PI
        * circumferentialIndex / circumferentialElements;
      const a1 = 2 * Math.PI
        * (circumferentialIndex + 1) / circumferentialElements;
      const am = (a0 + a1) / 2;
      localElements.push([
        point(r0, a0),
        point(r1, a0),
        point(r1, a1),
        point(r0, a1),
        point(rm, a0),
        point(r1, am),
        point(rm, a1),
        point(r0, am),
      ]);
    }
  }

  const nodeIds = new Map();
  const nodes = [];
  let nodeCounter = 0;
  const identify = (rawPoint) => {
    const x = Math.abs(rawPoint.x) < 1e-12 ? 0 : rawPoint.x;
    const y = Math.abs(rawPoint.y) < 1e-12 ? 0 : rawPoint.y;
    const key = `${x.toFixed(10)}:${y.toFixed(10)}`;
    if (!nodeIds.has(key)) {
      const nodeId = `N${nodeCounter}`;
      nodeCounter += 1;
      nodeIds.set(key, nodeId);
      nodes.push({ nodeId, x, y });
    }
    return nodeIds.get(key);
  };
  const elements = localElements.map((elementNodes, index) => ({
    elementId: `E${index}`,
    elementType: 'Q8',
    nodeIds: elementNodes.map(identify),
  }));
  return Object.freeze({
    nodes: Object.freeze(nodes),
    elements: Object.freeze(elements),
  });
}

function normalizedBearingLoad(module, innerEdges, nodesById) {
  const analyticalAmplitude = 2 * module.bearingResultant
    / (Math.PI * module.holeRadius * module.thickness);
  const rows = [];
  for (const edge of innerEdges) {
    const nodes = edge.edgeNodeSequence.map((nodeId) => nodesById.get(nodeId));
    const midpoint = nodes[1];
    const radius = Math.hypot(midpoint.x, midpoint.y);
    const cosine = midpoint.x / radius;
    if (!(cosine > 1e-12)) continue;
    const traction = [
      analyticalAmplitude * cosine * midpoint.x / radius,
      analyticalAmplitude * cosine * midpoint.y / radius,
    ];
    rows.push({
      edge,
      traction,
      integration: integrateVariableEdgeLoad({
        nodes,
        thickness: module.thickness,
        tractionAt: () => traction,
      }),
    });
  }
  const unscaledResultantX = rows.reduce(
    (sum, row) => sum + row.integration.resultant[0],
    0,
  );
  const discreteScale = module.bearingResultant / unscaledResultantX;
  const resultant = rows.reduce(
    (sum, row) => [
      sum[0] + row.integration.resultant[0] * discreteScale,
      sum[1] + row.integration.resultant[1] * discreteScale,
    ],
    [0, 0],
  );
  const moment = rows.reduce(
    (sum, row) => sum + row.integration.moment * discreteScale,
    0,
  );
  const edgeTractions = rows.map((row, index) => ({
    tractionId: `BEARING-${index + 1}`,
    elementId: row.edge.elementId,
    edgeNodeIds: row.edge.edgeNodeIds,
    tx: row.traction[0] * discreteScale,
    ty: row.traction[1] * discreteScale,
    sourceReference: `BB06#${module.moduleId}#BEARING-${index + 1}`,
  }));
  return Object.freeze({
    analyticalAmplitude,
    discreteScale,
    resultant: Object.freeze(resultant),
    moment,
    edgeTractions: Object.freeze(edgeTractions),
  });
}

function recoverStressAtPoint({ result, mesh, point }) {
  const nodesById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const elementById = new Map(mesh.elements.map((row) => [row.elementId, row]));
  const resultByElement = new Map(
    result.loadCaseResults[0].elementResults.map((row) => [row.elementId, row]),
  );
  const candidates = [];
  for (const element of mesh.elements) {
    const nodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    const inverse = invertQ8Mapping(nodes, point, {
      tolerance: 1e-9 * Math.max(1, Math.hypot(point.x, point.y)),
    });
    if (
      inverse.converged
      && Math.abs(inverse.xi) <= 1 + 1e-8
      && Math.abs(inverse.eta) <= 1 + 1e-8
    ) {
      candidates.push({ element, nodes });
    }
  }
  assert.equal(candidates.length, 1, `Stress probe containment count ${candidates.length}.`);
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

function rotateToHoop(stress, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return stress.sigmaX * sine * sine
    + stress.sigmaY * cosine * cosine
    - 2 * stress.tauXY * sine * cosine;
}

function reactionSplit(loadCase, nodesById, appliedResultant) {
  let totalX = 0;
  let totalY = 0;
  let upperX = 0;
  let lowerX = 0;
  for (const row of loadCase.supportReactions) {
    const [nodeId, dof] = row.dofIdentity.split(':');
    const node = nodesById.get(nodeId);
    if (dof === 'UX') {
      totalX += row.value;
      if (Math.abs(node.y) <= 1e-9) {
        upperX += row.value / 2;
        lowerX += row.value / 2;
      } else if (node.y > 0) upperX += row.value;
      else lowerX += row.value;
    } else if (dof === 'UY') totalY += row.value;
  }
  return Object.freeze({
    totalX,
    totalY,
    upperFraction: Math.abs(upperX) / appliedResultant,
    lowerFraction: Math.abs(lowerX) / appliedResultant,
  });
}

function boundaryAtRadius(boundaryEdges, nodesById, radius) {
  return boundaryEdges.filter((edge) => edge.edgeNodeSequence.every((nodeId) => {
    const node = nodesById.get(nodeId);
    return Math.abs(Math.hypot(node.x, node.y) - radius)
      <= 1e-8 * Math.max(1, radius);
  }));
}

function circularEdgeTargets(nodes) {
  const targets = {};
  const cornerPairs = [[0, 1], [1, 2], [2, 3], [3, 0]];
  cornerPairs.forEach(([leftIndex, rightIndex], edgeIndex) => {
    const left = nodes[leftIndex];
    const right = nodes[rightIndex];
    const leftRadius = Math.hypot(left.x, left.y);
    const rightRadius = Math.hypot(right.x, right.y);
    if (
      Math.abs(leftRadius - rightRadius)
      > 1e-10 * Math.max(1, leftRadius, rightRadius)
    ) return;
    targets[edgeIndex] = () => {
      const unitSumX = left.x / leftRadius + right.x / rightRadius;
      const unitSumY = left.y / leftRadius + right.y / rightRadius;
      const norm = Math.hypot(unitSumX, unitSumY);
      return {
        x: leftRadius * unitSumX / norm,
        y: leftRadius * unitSumY / norm,
      };
    };
  });
  return targets;
}

function constraint(nodeId, dof) {
  return {
    constraintId: `${nodeId}-${dof}`,
    nodeId,
    dof,
    value: 0,
    sourceReference: `BB06#SUPPORT#${nodeId}#${dof}`,
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

function relativeError(left, right) {
  return Math.abs(left - right)
    / Math.max(1, Math.abs(left), Math.abs(right));
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
