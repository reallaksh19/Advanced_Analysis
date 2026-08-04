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
  validateBb06Report,
} from '../src/core/bucket-b/index.js';
import {
  QUALIFICATION_STATES,
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
} from '../src/core/local-continuum/index.js';
import { buildBoundaryEdges } from '../src/core/local-continuum/assembly.js';
import { mappedTransfiniteMesh } from '../src/core/lafea-meshing/index.js';
import { q8Map } from '../src/core/bucket-b/q8-kernel.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const exactHeadSha = resolveExactHeadSha();
const procedure = createBb06Procedure();
const checks = [];

async function check(checkId, fn) {
  try {
    const evidence = await fn();
    checks.push(Object.freeze({ checkId, status: 'PASS', evidenceHash: hash(evidence ?? { accepted: true }) }));
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
  assert.deepEqual(Object.keys(procedure.modules).sort(), ['C2D-CLAMP-EAR', 'C2D-LUG-PINHOLE']);
  return { procedureHash: procedure.semanticHash };
});

const openHoleEvidence = await check('BB06_OPEN_HOLE_KIRSCH_REFERENCE', () => {
  const result = spawnSync(process.execPath, ['scripts/lafea.3-benchmark-cont-hole-01-check.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return Object.freeze({
    benchmarkId: 'CONT-HOLE-01',
    status: 'PASS',
    stdoutHash: sha256(result.stdout ?? ''),
    stderrHash: sha256(result.stderr ?? ''),
  });
});

const moduleEvidence = [];
for (const module of Object.values(BB06_MODULES)) {
  const evidence = await check(`BB06_${module.moduleId}_FOUR_LEVEL_EXECUTION`, () => executeModule(module));
  moduleEvidence.push(evidence);
}

await check('BB06_MODULE_SCOPE_METADATA', () => {
  moduleEvidence.forEach((row) => {
    assert.equal(row.contact, 'NONE');
    assert.equal(row.pinModel, 'DISTRIBUTED_BEARING_SURROGATE');
    assert.equal(row.clearance, 'NOT_MODELED');
    assert.equal(row.friction, 'NOT_MODELED');
    assert.ok(row.limitations.length >= 4);
  });
  return moduleEvidence.map((row) => ({ moduleId: row.moduleId, limitations: row.limitations }));
});

await check('BB06_CALLER_STATUS_TAMPER_REJECTED', () => {
  const provisional = createBb06Evidence({ procedure, exactHeadSha, moduleEvidence, openHoleEvidence });
  const report = createBb06Report({ evidence: provisional, checkResults: [...checks, { checkId: 'PLACEHOLDER', status: 'PASS', evidenceHash: sha256('placeholder') }] });
  const tampered = { ...report, bb07Authorized: false };
  assert.throws(() => validateBb06Report(tampered), /authorization|hash/i);
  return { rejected: true };
});

const evidence = createBb06Evidence({ procedure, exactHeadSha, moduleEvidence, openHoleEvidence });
const finalChecks = [...checks];
const report = createBb06Report({ evidence, checkResults: finalChecks });
validateBb06Report(report);
assert.equal(report.status, 'BB06_PROCEDURE_QUALIFIED');
assert.equal(report.bb07Authorized, true);
assert.equal(report.applicationExecutionAuthorized, false);
assert.equal(report.axisymmetricAuthorized, false);

const reportPath = resolve(ROOT, process.env.REPORT_PATH ?? 'reports/bucket-b-bb06-lug-clamp-report.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function executeModule(module) {
  const levels = BB06_LEVELS.map((level) => executeLevel(module, level));
  const displacementConvergence = evaluateConvergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels: levels.map((row) => ({ level: row.levelId, h: row.globalH, value: row.loadedHoleMeanUx })),
    finestRelativeChangeLimit: 0.03,
  });
  const stressConvergence = evaluateConvergence({
    quantityKind: 'FINITE_RADIUS_PEAK',
    levels: levels.map((row) => ({ level: row.levelId, h: row.globalH, probeH: row.probeH, value: row.maximumHoleHoopStress })),
    finestRelativeChangeLimit: 0.075,
  });
  const reactionSplitConvergence = evaluateConvergence({
    quantityKind: 'REACTION_SPLIT',
    levels: levels.map((row) => ({ level: row.levelId, h: row.globalH, probeH: row.probeH, value: row.upperReactionFraction })),
    finestRelativeChangeLimit: 0.01,
  });
  assert.ok([
    CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC,
    CONVERGENCE_DISPOSITIONS.PASS_PLATEAU,
  ].includes(displacementConvergence.disposition), `displacement convergence: ${displacementConvergence.disposition}`);
  assert.ok([
    CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC,
    CONVERGENCE_DISPOSITIONS.PASS_PLATEAU,
  ].includes(stressConvergence.disposition), `stress convergence: ${stressConvergence.disposition}`);
  assert.ok([
    CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC,
    CONVERGENCE_DISPOSITIONS.PASS_PLATEAU,
  ].includes(reactionSplitConvergence.disposition), `reaction split convergence: ${reactionSplitConvergence.disposition}`);
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
    stressConvergence,
    reactionSplitConvergence,
    applicationProcedureQualified: true,
    numericalOutputQualified: true,
  });
}

function executeLevel(module, level) {
  const mesh = fullAnnulusQ8({
    innerRadius: module.holeRadius,
    outerRadius: module.outerRadius,
    radialElements: level.radialElements,
    circumferentialElementsPerHalf: level.circumferentialElementsPerHalf,
    radialBias: 4,
  });
  const nodesById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const elementsById = new Map(mesh.elements.map((row) => [row.elementId, row]));
  const boundary = buildBoundaryEdges(mesh.elements);
  const innerEdges = boundary.filter((edge) => edge.edgeNodeSequence.every((nodeId) => nearRadius(nodesById.get(nodeId), module.holeRadius)));
  const outerEdges = boundary.filter((edge) => edge.edgeNodeSequence.every((nodeId) => nearRadius(nodesById.get(nodeId), module.outerRadius)));
  assert.equal(innerEdges.length, 2 * level.circumferentialElementsPerHalf);
  assert.equal(outerEdges.length, 2 * level.circumferentialElementsPerHalf);

  const load = normalizedCosineBearingLoad({ module, innerEdges, nodesById });
  assert.ok(Math.abs(load.resultant[0] - module.bearingResultant) <= 1e-9 * module.bearingResultant);
  assert.ok(Math.abs(load.resultant[1]) <= 1e-9 * module.bearingResultant);
  assert.ok(Math.abs(load.moment) <= 1e-8 * module.bearingResultant * module.holeRadius);

  const outerNodeIds = [...new Set(outerEdges.flatMap((edge) => edge.edgeNodeSequence))].sort();
  const constraints = outerNodeIds.flatMap((nodeId) => [constraint(nodeId, 'UX'), constraint(nodeId, 'UY')]);
  const model = createCanonicalLocalContinuumModel({
    schema: 'local-continuum-model/v1',
    modelIdentity: `${module.moduleId}-${level.levelId}`,
    modelVersion: 'BB06.1',
    sourceAncestry: {
      sourceModelIdentity: module.geometryProfileId,
      sourceVersion: '1',
      adapterIdentity: 'BUCKET_B_BB06_ANNULAR_Q8',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: module.formulationProfile,
    materials: [{
      materialId: 'MAT',
      elasticModulus: module.material.elasticModulus,
      poissonRatio: module.material.poissonRatio,
      sourceReference: `BB06#${module.moduleId}#MAT`,
    }],
    nodes: mesh.nodes.map((row) => ({ ...row, sourceReference: `BB06#${module.moduleId}#${level.levelId}#${row.nodeId}` })),
    elements: mesh.elements.map((row) => ({
      ...row,
      materialId: 'MAT',
      thickness: module.thickness,
      sourceReference: `BB06#${module.moduleId}#${level.levelId}#${row.elementId}`,
    })),
    elementTypePolicy: { allowT3Fallback: false, sourceReference: 'BB06_Q8_ONLY' },
    constraints,
    loadCases: [{
      loadCaseId: 'COSINE_BEARING',
      nodalForces: [],
      edgeTractions: load.edgeTractions,
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: `BB06#${module.moduleId}#COSINE_BEARING`,
    }],
    resultRequests: { loadCaseIds: ['COSINE_BEARING'] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1',
      identity: 'BB06_Q8_APPLICATION_PROFILE_V1',
      tolerances: toleranceTable(),
    },
    limitations: module.limitations,
  });
  const result = calculateLocalContinuum(model);
  assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED, JSON.stringify(result.diagnostics));
  const caseResult = result.loadCaseResults[0];
  assert.equal(caseResult.equilibrium.accepted, true);
  assert.equal(caseResult.energyQualification.accepted, true);

  const qualityRows = mesh.elements.map((element) => {
    const physicalNodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    return evaluateQ8Quality({
      elementId: element.elementId,
      nodes: physicalNodes,
      hotspot: physicalNodes.some((node) => Math.hypot(node.x, node.y) < module.holeRadius * 1.5),
      boundaryMidsideTargets: circularMidsideTargets(physicalNodes),
    });
  });
  const failedQuality = qualityRows.filter((row) => !row.accepted);
  assert.equal(failedQuality.length, 0, JSON.stringify(failedQuality.slice(0, 3)));

  const reactions = reactionEvidence(caseResult, nodesById, module.bearingResultant);
  assert.ok(Math.abs(reactions.totalX + module.bearingResultant) <= 1e-6 * module.bearingResultant);
  assert.ok(Math.abs(reactions.totalY) <= 1e-6 * module.bearingResultant);
  assert.ok(Math.abs(reactions.upperFraction - 0.5) <= 0.01);
  assert.ok(Math.abs(reactions.lowerFraction - 0.5) <= 0.01);

  const innerNodeIds = [...new Set(innerEdges.flatMap((edge) => edge.edgeNodeSequence))];
  const displacementById = new Map(caseResult.nodalDisplacements.map((row) => [row.nodeId, row]));
  const loadedNodes = innerNodeIds.filter((nodeId) => nodesById.get(nodeId).x >= -1e-9);
  const loadedHoleMeanUx = loadedNodes.reduce((sum, nodeId) => sum + displacementById.get(nodeId).ux, 0) / loadedNodes.length;
  assert.ok(Number.isFinite(loadedHoleMeanUx) && loadedHoleMeanUx > 0);
  const maximumHoleHoopStress = peakHoleHoopStress(result, mesh, module.holeRadius);
  assert.ok(Number.isFinite(maximumHoleHoopStress) && maximumHoleHoopStress > 0);

  const globalH = Math.max(
    (module.outerRadius - module.holeRadius) / level.radialElements,
    Math.PI * module.outerRadius / level.circumferentialElementsPerHalf,
  );
  const probeH = Math.max(
    (module.outerRadius - module.holeRadius) / level.radialElements,
    Math.PI * module.holeRadius / level.circumferentialElementsPerHalf,
  );
  return Object.freeze({
    levelId: level.levelId,
    radialElements: level.radialElements,
    circumferentialElementsPerHalf: level.circumferentialElementsPerHalf,
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    globalH,
    probeH,
    meshSemanticHash: model.semanticHash,
    resultSemanticHash: result.semanticHash,
    loadNormalization: {
      analyticalAmplitude: load.analyticalAmplitude,
      discreteScale: load.discreteScale,
      resultant: load.resultant,
      moment: load.moment,
    },
    minimumQJ: Math.min(...qualityRows.map((row) => row.qJDeterminantRatio)),
    minimumScaledJacobian: Math.min(...qualityRows.map((row) => row.minimumScaledJacobian)),
    maximumAspectRatio: Math.max(...qualityRows.map((row) => row.aspectRatio)),
    loadedHoleMeanUx,
    maximumHoleHoopStress,
    totalReactionX: reactions.totalX,
    totalReactionY: reactions.totalY,
    upperReactionFraction: reactions.upperFraction,
    lowerReactionFraction: reactions.lowerFraction,
    totalStrainEnergy: caseResult.totalStrainEnergy,
    equilibriumAccepted: true,
    energyAccepted: true,
  });
}

function normalizedCosineBearingLoad({ module, innerEdges, nodesById }) {
  const analyticalAmplitude = 2 * module.bearingResultant / (Math.PI * module.holeRadius * module.thickness);
  const rows = [];
  for (const edge of innerEdges) {
    const physicalNodes = edge.edgeNodeSequence.map((nodeId) => nodesById.get(nodeId));
    const mid = physicalNodes[1];
    const radius = Math.hypot(mid.x, mid.y);
    const cos = mid.x / radius;
    if (!(cos > 1e-12)) continue;
    const radial = [mid.x / radius, mid.y / radius];
    const traction = [analyticalAmplitude * cos * radial[0], analyticalAmplitude * cos * radial[1]];
    const integration = integrateVariableEdgeLoad({ nodes: physicalNodes, thickness: module.thickness, tractionAt: () => traction });
    rows.push({ edge, traction, integration });
  }
  const baseResultant = rows.reduce((sum, row) => [sum[0] + row.integration.resultant[0], sum[1] + row.integration.resultant[1]], [0, 0]);
  const discreteScale = module.bearingResultant / baseResultant[0];
  const edgeTractions = rows.map((row, index) => ({
    tractionId: `BEARING-${index + 1}`,
    elementId: row.edge.elementId,
    edgeNodeIds: row.edge.edgeNodeIds,
    tx: row.traction[0] * discreteScale,
    ty: row.traction[1] * discreteScale,
    sourceReference: `BB06#${module.moduleId}#BEARING-${index + 1}`,
  }));
  const resultant = rows.reduce((sum, row) => [
    sum[0] + row.integration.resultant[0] * discreteScale,
    sum[1] + row.integration.resultant[1] * discreteScale,
  ], [0, 0]);
  const moment = rows.reduce((sum, row) => sum + row.integration.moment * discreteScale, 0);
  return Object.freeze({ analyticalAmplitude, discreteScale, edgeTractions: Object.freeze(edgeTractions), resultant: Object.freeze(resultant), moment });
}

function reactionEvidence(caseResult, nodesById, appliedResultant) {
  let totalX = 0; let totalY = 0; let upperX = 0; let lowerX = 0;
  caseResult.supportReactions.forEach((row) => {
    const [nodeId, dof] = row.dofIdentity.split(':');
    const node = nodesById.get(nodeId);
    if (dof === 'UX') {
      totalX += row.value;
      if (Math.abs(node.y) <= 1e-9) { upperX += row.value / 2; lowerX += row.value / 2; }
      else if (node.y > 0) upperX += row.value;
      else lowerX += row.value;
    } else if (dof === 'UY') totalY += row.value;
  });
  return {
    totalX,
    totalY,
    upperX,
    lowerX,
    upperFraction: Math.abs(upperX) / appliedResultant,
    lowerFraction: Math.abs(lowerX) / appliedResultant,
  };
}

function peakHoleHoopStress(result, mesh, holeRadius) {
  const nodesById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  let peak = Number.NEGATIVE_INFINITY;
  result.loadCaseResults[0].elementResults.forEach((elementResult) => {
    const element = mesh.elements.find((row) => row.elementId === elementResult.elementId);
    const nodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    elementResult.gaussPointResults.forEach((gp) => {
      const mapped = q8Map(nodes, gp.xi, gp.eta);
      const radius = Math.hypot(mapped.x, mapped.y);
      if (radius > holeRadius * 1.35) return;
      const c = mapped.x / radius; const s = mapped.y / radius;
      const { sigmaX, sigmaY, tauXY } = gp.stress;
      const hoop = sigmaX * s * s + sigmaY * c * c - 2 * tauXY * s * c;
      peak = Math.max(peak, hoop);
    });
  });
  return peak;
}

function fullAnnulusQ8({ innerRadius, outerRadius, radialElements, circumferentialElementsPerHalf, radialBias }) {
  const sectors = [
    sectorQ8(innerRadius, outerRadius, 0, Math.PI, radialElements, circumferentialElementsPerHalf, radialBias),
    sectorQ8(innerRadius, outerRadius, Math.PI, 2 * Math.PI, radialElements, circumferentialElementsPerHalf, radialBias),
  ];
  return globalizeElements(sectors.flatMap((sector) => sector.elements));
}

function sectorQ8(innerRadius, outerRadius, startAngle, endAngle, radialElements, circumferentialElements, radialBias) {
  const radialPoints = 2 * radialElements + 1;
  const circumferentialPoints = 2 * circumferentialElements + 1;
  const point = (radius, angle) => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  const radialFraction = (s) => (radialBias ** s - 1) / (radialBias - 1);
  const radialChain = (angle) => Array.from({ length: radialPoints }, (_, index) => point(
    innerRadius + (outerRadius - innerRadius) * radialFraction(index / (radialPoints - 1)),
    angle,
  ));
  const arcChain = (radius) => Array.from({ length: circumferentialPoints }, (_, index) => point(
    radius,
    startAngle + (endAngle - startAngle) * index / (circumferentialPoints - 1),
  ));
  return mappedTransfiniteMesh(radialChain(startAngle), radialChain(endAngle), arcChain(innerRadius), arcChain(outerRadius));
}

function globalizeElements(localElements) {
  const ids = new Map(); const nodes = []; let counter = 0;
  const nodeId = (point) => {
    const x = Math.abs(point.x) < 1e-12 ? 0 : point.x;
    const y = Math.abs(point.y) < 1e-12 ? 0 : point.y;
    const key = `${x.toFixed(9)}:${y.toFixed(9)}`;
    if (!ids.has(key)) {
      const id = `N${counter++}`;
      ids.set(key, id);
      nodes.push({ nodeId: id, x, y });
    }
    return ids.get(key);
  };
  const elements = localElements.map((element, index) => ({
    elementId: `E${index}`,
    elementType: element.elementType,
    nodeIds: element.nodes.map(nodeId),
  }));
  return { nodes, elements };
}

function circularMidsideTargets(nodes) {
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0]];
  const targets = {};
  pairs.forEach(([a, b], edgeIndex) => {
    const ra = Math.hypot(nodes[a].x, nodes[a].y); const rb = Math.hypot(nodes[b].x, nodes[b].y);
    if (Math.abs(ra - rb) > 1e-8 * Math.max(1, ra, rb)) return;
    targets[edgeIndex] = (left, right) => {
      const radius = (Math.hypot(left.x, left.y) + Math.hypot(right.x, right.y)) / 2;
      const ux = left.x / radius + right.x / radius;
      const uy = left.y / radius + right.y / radius;
      const norm = Math.hypot(ux, uy);
      return { x: radius * ux / norm, y: radius * uy / norm };
    };
  });
  return targets;
}

function nearRadius(node, radius) { return Math.abs(Math.hypot(node.x, node.y) - radius) <= 1e-7 * Math.max(1, radius); }
function constraint(nodeId, dof) { return { constraintId: `${nodeId}-${dof}`, nodeId, dof, value: 0, sourceReference: `BB06#SUPPORT#${nodeId}#${dof}` }; }
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
function resolveExactHeadSha() {
  const expected = process.env.EXPECTED_HEAD_SHA;
  if (expected && !/^[0-9a-f]{40}$/i.test(expected)) throw new TypeError('EXPECTED_HEAD_SHA must be a 40-character Git SHA.');
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (expected) assert.equal(actual, expected, 'Exact-head mismatch.');
  return actual;
}
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function hash(value) { return sha256(JSON.stringify(value)); }
