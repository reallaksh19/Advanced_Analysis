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
} from './index.js';
import {
  QUALIFICATION_STATES,
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
} from '../local-continuum/index.js';
import { buildBoundaryEdges } from '../local-continuum/assembly.js';
import { mappedTransfiniteMesh } from '../lafea-meshing/index.js';
import { q8Map } from './q8-kernel.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const exactHeadSha = exactHead();
const procedure = createBb06Procedure();
const checks = [];

async function check(id, fn) {
  try {
    const evidence = await fn();
    checks.push(Object.freeze({ checkId: id, status: 'PASS', evidenceHash: hash(evidence ?? true) }));
    return evidence;
  } catch (error) {
    checks.push(Object.freeze({ checkId: id, status: 'FAIL', evidenceHash: hash({ name: error?.name, message: error?.message }) }));
    throw new Error(`${id} failed: ${error?.stack ?? error}`);
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
  const child = spawnSync(process.execPath, ['scripts/lafea.3-benchmark-cont-hole-01-check.mjs'], { cwd: ROOT, encoding: 'utf8' });
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
  moduleEvidence.push(await check(`BB06_${module.moduleId}_FOUR_LEVEL_EXECUTION`, () => executeModule(module)));
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
  const provisional = createBb06Evidence({ procedure, exactHeadSha, moduleEvidence, openHoleEvidence });
  const provisionalChecks = [...checks, { checkId: 'PROVISIONAL', status: 'PASS', evidenceHash: sha256('provisional') }];
  const valid = createBb06Report({ evidence: provisional, checkResults: provisionalChecks });
  assert.throws(() => validateBb06Report({ ...valid, bb07Authorized: false }), /authorization|hash/i);
  return { rejected: true };
});

const evidence = createBb06Evidence({ procedure, exactHeadSha, moduleEvidence, openHoleEvidence });
const report = createBb06Report({ evidence, checkResults: [...checks] });
validateBb06Report(report);
assert.equal(report.status, 'BB06_PROCEDURE_QUALIFIED');
assert.equal(report.bb07Authorized, true);
assert.equal(report.applicationExecutionAuthorized, false);
assert.equal(report.axisymmetricAuthorized, false);
const reportPath = resolve(ROOT, process.env.BB06_REPORT_PATH ?? 'reports/bucket-b-bb06-lug-clamp-report.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function executeModule(module) {
  const levels = BB06_LEVELS.map((level) => executeLevel(module, level));
  const displacementConvergence = convergence('GLOBAL_DISPLACEMENT', levels, 'loadedHoleMeanUx', 0.03);
  const stressConvergence = convergence('FINITE_RADIUS_PEAK', levels, 'maximumHoleHoopStress', 0.075);
  const reactionSplitConvergence = convergence('REACTION_SPLIT', levels, 'upperReactionFraction', 0.01);
  for (const row of [displacementConvergence, stressConvergence, reactionSplitConvergence]) {
    assert.ok([CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC, CONVERGENCE_DISPOSITIONS.PASS_PLATEAU].includes(row.disposition), row.disposition);
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
    stressConvergence,
    reactionSplitConvergence,
    applicationProcedureQualified: true,
    numericalOutputQualified: true,
  });
}

function convergence(kind, levels, field, limit) {
  const local = kind !== 'GLOBAL_DISPLACEMENT';
  return evaluateConvergence({
    quantityKind: kind,
    levels: levels.map((row) => ({ level: row.levelId, h: row.globalH, probeH: local ? row.probeH : undefined, value: row[field] })),
    finestRelativeChangeLimit: limit,
  });
}

function executeLevel(module, level) {
  const mesh = fullAnnulusQ8(module.holeRadius, module.outerRadius, level.radialElements, level.circumferentialElementsPerHalf, 4);
  const nodesById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const boundary = buildBoundaryEdges(mesh.elements);
  const innerEdges = radialBoundary(boundary, nodesById, module.holeRadius);
  const outerEdges = radialBoundary(boundary, nodesById, module.outerRadius);
  assert.equal(innerEdges.length, 2 * level.circumferentialElementsPerHalf);
  assert.equal(outerEdges.length, 2 * level.circumferentialElementsPerHalf);
  const bearing = normalizedBearing(module, innerEdges, nodesById);
  assert.ok(relative(bearing.resultant[0], module.bearingResultant) <= 1e-10);
  assert.ok(Math.abs(bearing.resultant[1]) <= 1e-9 * module.bearingResultant);
  assert.ok(Math.abs(bearing.moment) <= 1e-8 * module.bearingResultant * module.holeRadius);

  const outerNodes = [...new Set(outerEdges.flatMap((edge) => edge.edgeNodeSequence))].sort();
  const canonical = createCanonicalLocalContinuumModel({
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
    materials: [{ materialId: 'MAT', elasticModulus: module.material.elasticModulus, poissonRatio: module.material.poissonRatio, sourceReference: `BB06#${module.moduleId}#MAT` }],
    nodes: mesh.nodes.map((row) => ({ ...row, sourceReference: `BB06#${module.moduleId}#${level.levelId}#${row.nodeId}` })),
    elements: mesh.elements.map((row) => ({ ...row, materialId: 'MAT', thickness: module.thickness, sourceReference: `BB06#${module.moduleId}#${level.levelId}#${row.elementId}` })),
    elementTypePolicy: { allowT3Fallback: false, sourceReference: 'BB06_Q8_ONLY' },
    constraints: outerNodes.flatMap((nodeId) => [constraint(nodeId, 'UX'), constraint(nodeId, 'UY')]),
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
    qualificationProfile: { schema: 'local-continuum-qualification-profile/v1', identity: 'BB06_Q8_APPLICATION_PROFILE_V1', tolerances: tolerances() },
    limitations: module.limitations,
  });
  const result = calculateLocalContinuum(canonical);
  assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED, JSON.stringify(result.diagnostics));
  const loadCase = result.loadCaseResults[0];
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);

  const quality = mesh.elements.map((element) => {
    const nodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    return evaluateQ8Quality({
      elementId: element.elementId,
      nodes,
      hotspot: nodes.some((node) => Math.hypot(node.x, node.y) < module.holeRadius * 1.5),
      boundaryMidsideTargets: curvedTargets(nodes),
    });
  });
  const failures = quality.filter((row) => !row.accepted);
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 3)));

  const reactions = reactionSplit(loadCase, nodesById, module.bearingResultant);
  assert.ok(relative(reactions.totalX, -module.bearingResultant) <= 1e-6);
  assert.ok(Math.abs(reactions.totalY) <= 1e-6 * module.bearingResultant);
  assert.ok(Math.abs(reactions.upperFraction - 0.5) <= 0.01);
  assert.ok(Math.abs(reactions.lowerFraction - 0.5) <= 0.01);

  const innerNodeIds = [...new Set(innerEdges.flatMap((edge) => edge.edgeNodeSequence))];
  const displacements = new Map(loadCase.nodalDisplacements.map((row) => [row.nodeId, row]));
  const loadedNodes = innerNodeIds.filter((nodeId) => nodesById.get(nodeId).x >= -1e-9);
  const loadedHoleMeanUx = loadedNodes.reduce((sum, nodeId) => sum + displacements.get(nodeId).ux, 0) / loadedNodes.length;
  const maximumHoleHoopStress = peakHoop(result, mesh, module.holeRadius);
  assert.ok(loadedHoleMeanUx > 0 && Number.isFinite(loadedHoleMeanUx));
  assert.ok(maximumHoleHoopStress > 0 && Number.isFinite(maximumHoleHoopStress));

  const globalH = Math.max((module.outerRadius - module.holeRadius) / level.radialElements, Math.PI * module.outerRadius / level.circumferentialElementsPerHalf);
  const probeH = Math.max((module.outerRadius - module.holeRadius) / level.radialElements, Math.PI * module.holeRadius / level.circumferentialElementsPerHalf);
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
    loadNormalization: { analyticalAmplitude: bearing.analyticalAmplitude, discreteScale: bearing.discreteScale, resultant: bearing.resultant, moment: bearing.moment },
    minimumQJ: Math.min(...quality.map((row) => row.qJDeterminantRatio)),
    minimumScaledJacobian: Math.min(...quality.map((row) => row.minimumScaledJacobian)),
    maximumAspectRatio: Math.max(...quality.map((row) => row.aspectRatio)),
    loadedHoleMeanUx,
    maximumHoleHoopStress,
    totalReactionX: reactions.totalX,
    totalReactionY: reactions.totalY,
    upperReactionFraction: reactions.upperFraction,
    lowerReactionFraction: reactions.lowerFraction,
    totalStrainEnergy: loadCase.totalStrainEnergy,
    equilibriumAccepted: true,
    energyAccepted: true,
  });
}

function normalizedBearing(module, edges, nodesById) {
  const analyticalAmplitude = 2 * module.bearingResultant / (Math.PI * module.holeRadius * module.thickness);
  const rows = [];
  for (const edge of edges) {
    const nodes = edge.edgeNodeSequence.map((nodeId) => nodesById.get(nodeId));
    const mid = nodes[1];
    const radius = Math.hypot(mid.x, mid.y);
    const cosine = mid.x / radius;
    if (!(cosine > 1e-12)) continue;
    const traction = [analyticalAmplitude * cosine * mid.x / radius, analyticalAmplitude * cosine * mid.y / radius];
    rows.push({ edge, traction, integration: integrateVariableEdgeLoad({ nodes, thickness: module.thickness, tractionAt: () => traction }) });
  }
  const baseX = rows.reduce((sum, row) => sum + row.integration.resultant[0], 0);
  const discreteScale = module.bearingResultant / baseX;
  const resultant = rows.reduce((sum, row) => [sum[0] + row.integration.resultant[0] * discreteScale, sum[1] + row.integration.resultant[1] * discreteScale], [0, 0]);
  const moment = rows.reduce((sum, row) => sum + row.integration.moment * discreteScale, 0);
  const edgeTractions = rows.map((row, index) => ({
    tractionId: `BEARING-${index + 1}`,
    elementId: row.edge.elementId,
    edgeNodeIds: row.edge.edgeNodeIds,
    tx: row.traction[0] * discreteScale,
    ty: row.traction[1] * discreteScale,
    sourceReference: `BB06#${module.moduleId}#BEARING-${index + 1}`,
  }));
  return Object.freeze({ analyticalAmplitude, discreteScale, resultant: Object.freeze(resultant), moment, edgeTractions: Object.freeze(edgeTractions) });
}

function reactionSplit(loadCase, nodesById, applied) {
  let totalX = 0; let totalY = 0; let upperX = 0; let lowerX = 0;
  for (const row of loadCase.supportReactions) {
    const [nodeId, dof] = row.dofIdentity.split(':');
    const node = nodesById.get(nodeId);
    if (dof === 'UX') {
      totalX += row.value;
      if (Math.abs(node.y) <= 1e-9) { upperX += row.value / 2; lowerX += row.value / 2; }
      else if (node.y > 0) upperX += row.value;
      else lowerX += row.value;
    } else if (dof === 'UY') totalY += row.value;
  }
  return { totalX, totalY, upperFraction: Math.abs(upperX) / applied, lowerFraction: Math.abs(lowerX) / applied };
}

function peakHoop(result, mesh, holeRadius) {
  const nodesById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const elements = new Map(mesh.elements.map((row) => [row.elementId, row]));
  let peak = Number.NEGATIVE_INFINITY;
  for (const elementResult of result.loadCaseResults[0].elementResults) {
    const nodes = elements.get(elementResult.elementId).nodeIds.map((id) => nodesById.get(id));
    for (const gp of elementResult.gaussPointResults) {
      const mapped = q8Map(nodes, gp.xi, gp.eta);
      const radius = Math.hypot(mapped.x, mapped.y);
      if (radius > 1.35 * holeRadius) continue;
      const c = mapped.x / radius; const s = mapped.y / radius;
      const { sigmaX, sigmaY, tauXY } = gp.stress;
      peak = Math.max(peak, sigmaX * s * s + sigmaY * c * c - 2 * tauXY * s * c);
    }
  }
  return peak;
}

function fullAnnulusQ8(inner, outer, radial, halfCircumferential, bias) {
  const elements = [
    sector(inner, outer, 0, Math.PI, radial, halfCircumferential, bias),
    sector(inner, outer, Math.PI, 2 * Math.PI, radial, halfCircumferential, bias),
  ].flatMap((row) => row.elements);
  const ids = new Map(); const nodes = []; let counter = 0;
  const nodeId = (point) => {
    const x = Math.abs(point.x) < 1e-12 ? 0 : point.x;
    const y = Math.abs(point.y) < 1e-12 ? 0 : point.y;
    const key = `${x.toFixed(9)}:${y.toFixed(9)}`;
    if (!ids.has(key)) { const id = `N${counter++}`; ids.set(key, id); nodes.push({ nodeId: id, x, y }); }
    return ids.get(key);
  };
  return {
    nodes,
    elements: elements.map((element, index) => ({ elementId: `E${index}`, elementType: element.elementType, nodeIds: element.nodes.map(nodeId) })),
  };
}

function sector(inner, outer, start, end, radialElements, circumferentialElements, bias) {
  const nr = 2 * radialElements + 1; const nc = 2 * circumferentialElements + 1;
  const point = (r, a) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
  const fraction = (s) => (bias ** s - 1) / (bias - 1);
  const radial = (angle) => Array.from({ length: nr }, (_, i) => point(inner + (outer - inner) * fraction(i / (nr - 1)), angle));
  const arc = (radius) => Array.from({ length: nc }, (_, i) => point(radius, start + (end - start) * i / (nc - 1)));
  return mappedTransfiniteMesh(radial(start), radial(end), arc(inner), arc(outer));
}

function radialBoundary(boundary, nodes, radius) {
  return boundary.filter((edge) => edge.edgeNodeSequence.every((id) => Math.abs(Math.hypot(nodes.get(id).x, nodes.get(id).y) - radius) <= 1e-7 * Math.max(1, radius)));
}

function curvedTargets(nodes) {
  const targets = {};
  [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(([a, b], edge) => {
    const ra = Math.hypot(nodes[a].x, nodes[a].y); const rb = Math.hypot(nodes[b].x, nodes[b].y);
    if (Math.abs(ra - rb) > 1e-8 * Math.max(1, ra, rb)) return;
    targets[edge] = (left, right) => {
      const radius = (Math.hypot(left.x, left.y) + Math.hypot(right.x, right.y)) / 2;
      const vector = [left.x / radius + right.x / radius, left.y / radius + right.y / radius];
      const length = Math.hypot(...vector);
      return { x: radius * vector[0] / length, y: radius * vector[1] / length };
    };
  });
  return targets;
}

function constraint(nodeId, dof) { return { constraintId: `${nodeId}-${dof}`, nodeId, dof, value: 0, sourceReference: `BB06#SUPPORT#${nodeId}#${dof}` }; }
function tolerances() {
  const tight = { absolute: 1e-9, relative: 1e-9 };
  const loose = { absolute: 1e-5, relative: 1e-6 };
  return { minimumElementArea: tight, stiffnessSymmetry: tight, constitutiveSymmetry: tight, choleskyPivot: tight, freeDofResidual: loose, reactionEquilibrium: loose, strainEnergy: loose, rigidBodyStrain: tight, patchTestStress: tight };
}
function relative(a, b) { return Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)); }
function exactHead() {
  const expected = process.env.EXPECTED_HEAD_SHA;
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (expected) { assert.match(expected, /^[0-9a-f]{40}$/i); assert.equal(actual, expected, 'Exact-head mismatch.'); }
  return actual;
}
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function hash(value) { return sha256(JSON.stringify(value)); }
