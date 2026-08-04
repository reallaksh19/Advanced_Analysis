#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
  FORMULATIONS,
  MODEL_SCHEMA,
  QUALIFICATION_PROFILE,
  QUALIFICATION_STATES,
} from '../src/core/local-continuum/index.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORACLE_PATH = path.join(ROOT, 'validation/bucket-01/12-cantilever-oracle.json');
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_CANTILEVER_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-cantilever.json',
);
const oracle = Object.freeze(JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8')));
const IN_PROCESS_REPLAY_COUNT = 3;

validateOracle();
const levels = oracle.meshes.map(evaluateLevel);
assert.deepEqual(
  levels.map((row) => row.elementCount),
  oracle.meshes.map((row) => row.elementCount),
);
assertConvergence(levels, 'horizontal');
assertConvergence(levels, 'vertical');

const baseReport = {
  schema: 'lafea-bucket-01-cantilever-evidence/v3',
  producerRevision: 'B01-CANTILEVER.3',
  benchmarkId: oracle.benchmarkId,
  oracleId: oracle.oracleId,
  oraclePath: path.relative(ROOT, ORACLE_PATH).split(path.sep).join('/'),
  oracleHash: canonicalLafeaSha256(oracle),
  expectedValueDefinitionHash: canonicalLafeaSha256(oracle),
  formulation: oracle.formulation,
  elementType: oracle.elementType,
  inProcessReplayCount: IN_PROCESS_REPLAY_COUNT,
  referenceDeflection: referenceDeflection(),
  levels,
  authority: {
    productionElementRouteExecuted: true,
    localContinuumKernelExecuted: true,
    expectedValuesReadFromFrozenRegistryFile: true,
    expectedValuesFrozenBeforeExecution: true,
    productionOutputGeneratedExpectedValues: false,
    positiveIntegrationPointJacobiansRequired: true,
    reactionsRetained: true,
    forceEquilibriumRetained: true,
    momentEquilibriumRetained: true,
    strainEnergyAndExternalWorkRetained: true,
    orientationSensitivityRetained: true,
    monotonicRefinementRetained: true,
    integrationPointRecoveryRetained: true,
    nodalProjectionUsedAsAuthority: false,
    smoothedStressUsedAsAuthority: false,
    cleanExternalReplayCustodySatisfied: false,
  },
  qualificationStates: {
    implemented: true,
    contractVerified: false,
    meshVerified: false,
    solverVerified: false,
    stressVerified: false,
    codeVerified: false,
    integrationVerified: false,
    bucketQualified: false,
  },
  disposition: 'BENCHMARK_ROUTE_IMPLEMENTED_PENDING_INDEPENDENT_RETAINED_EXECUTION',
};
const report = Object.freeze({
  ...baseReport,
  evidenceHash: canonicalLafeaSha256(baseReport),
});
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function evaluateLevel(level) {
  validateLevel(level);
  const horizontal = evaluateOrientation(level, 'HORIZONTAL');
  const vertical = evaluateOrientation(level, 'VERTICAL_CCW_90');
  const orientationRelativeDifference = relativeDifference(
    horizontal.tipDeflection,
    vertical.tipDeflection,
    referenceDeflection(),
  );
  within(
    orientationRelativeDifference,
    oracle.tolerances.orientationDeflectionRelativeDifference,
    `${level.levelId} orientation sensitivity`,
  );
  return Object.freeze({
    schema: 'lafea-bucket-01-cantilever-level-evidence/v1',
    levelId: level.levelId,
    nx: level.nx,
    ny: level.ny,
    elementCount: level.elementCount,
    orientationRelativeDifference,
    horizontal,
    vertical,
    semanticHash: canonicalLafeaSha256({
      levelId: level.levelId,
      horizontal,
      vertical,
      orientationRelativeDifference,
    }),
  });
}

function evaluateOrientation(level, orientation) {
  const model = createCanonicalLocalContinuumModel(buildSource(level, orientation));
  const replays = Array.from(
    { length: IN_PROCESS_REPLAY_COUNT },
    () => calculateLocalContinuum(model),
  );
  const serialized = replays.map((row) => JSON.stringify(row));
  assert.ok(serialized.every((row) => row === serialized[0]), `${level.levelId} ${orientation} replays differ`);

  const result = replays[0];
  assert.equal(result.qualification?.state, QUALIFICATION_STATES.ACCEPTED, firstDiagnostic(result));
  const loadCase = byCase(result, oracle.load.loadCaseId);
  assert.equal(loadCase.solverEvidence.accepted, true);
  assert.equal(loadCase.solverEvidence.method, level.solverMethod);
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);
  assert.equal(model.elements.length, level.elementCount);

  const elementEvidence = result.meshEvidence.elementEvidence;
  assert.equal(elementEvidence.length, level.elementCount);
  assert.ok(elementEvidence.every((row) => row.elementType === 'T6'));
  assert.ok(elementEvidence.every((row) => row.stiffnessSymmetry.accepted));
  assert.ok(elementEvidence.every((row) => row.rigidBodyQualification.accepted));
  assert.ok(elementEvidence.every((row) => row.affinePatchQualification.accepted));
  const jacobians = elementEvidence.flatMap((row) =>
    row.gaussEvidence.map((point) => point.jacobianDeterminant));
  const minimumJacobian = Math.min(...jacobians);
  assert.ok(minimumJacobian > 0, `${level.levelId} ${orientation} has a non-positive Jacobian`);

  const integrationPointResults = loadCase.elementResults.flatMap((row) => {
    assert.equal(row.elementType, 'T6');
    assert.equal(row.recoveryLayer, 'INTEGRATION_POINT');
    return row.gaussPointResults;
  });
  assert.equal(integrationPointResults.length, level.elementCount * 3);
  assert.ok(integrationPointResults.every((row) => row.jacobianDeterminant > 0));

  const nodeById = new Map(model.nodes.map((node) => [node.nodeId, node]));
  const appliedVector = vectorFromForce(result, loadCase.forceEvidence.forceVector, nodeById);
  const reactionVector = vectorFromReactions(loadCase.supportReactions, nodeById);
  const applied = resultant(appliedVector, nodeById);
  const reaction = resultant(reactionVector, nodeById);
  const total = {
    forceX: applied.forceX + reaction.forceX,
    forceY: applied.forceY + reaction.forceY,
    momentZ: applied.momentZ + reaction.momentZ,
  };
  const expectedForce = orientation === 'HORIZONTAL'
    ? oracle.expected.horizontalAppliedForce
    : oracle.expected.verticalAppliedForce;
  const forceScale = oracle.load.resultant;
  const momentScale = oracle.load.resultant * oracle.geometry.length;
  const appliedForceRelativeError = Math.hypot(
    applied.forceX - expectedForce.x,
    applied.forceY - expectedForce.y,
  ) / forceScale;
  const appliedMomentRelativeError = Math.abs(
    applied.momentZ - oracle.expected.appliedMomentZ,
  ) / momentScale;
  const totalForceRelativeResidual = Math.hypot(total.forceX, total.forceY) / forceScale;
  const totalMomentRelativeResidual = Math.abs(total.momentZ) / momentScale;

  within(appliedForceRelativeError, oracle.tolerances.forceEquilibriumRelative, `${level.levelId} ${orientation} applied force`);
  within(appliedMomentRelativeError, oracle.tolerances.momentEquilibriumRelative, `${level.levelId} ${orientation} applied moment`);
  within(totalForceRelativeResidual, oracle.tolerances.forceEquilibriumRelative, `${level.levelId} ${orientation} force equilibrium`);
  within(totalMomentRelativeResidual, oracle.tolerances.momentEquilibriumRelative, `${level.levelId} ${orientation} moment equilibrium`);

  const tip = findTipDisplacement(model, loadCase, orientation);
  const externalWork = externalWorkFromForceVector(result, loadCase);
  const relativeExternalWorkError = relativeDifference(
    loadCase.totalStrainEnergy,
    externalWork,
    loadCase.totalStrainEnergy,
  );
  within(
    relativeExternalWorkError,
    oracle.tolerances.energyRelative,
    `${level.levelId} ${orientation} external work`,
  );

  const base = {
    orientation,
    canonicalModelHash: model.semanticHash,
    resultSemanticHashes: result.semanticHashes,
    replayResultHash: canonicalLafeaSha256(result),
    nodeCount: model.nodes.length,
    elementCount: model.elements.length,
    freeDofCount: loadCase.solverEvidence.freeDofIdentities.length,
    constrainedDofCount: loadCase.solverEvidence.constrainedDofIdentities.length,
    solverMethod: loadCase.solverEvidence.method,
    solverAccepted: loadCase.solverEvidence.accepted,
    minimumPivot: loadCase.solverEvidence.minimumPivot ?? null,
    pivotRatio: loadCase.solverEvidence.pivotRatio ?? null,
    iterationCount: loadCase.solverEvidence.iterationCount ?? null,
    minimumJacobian,
    integrationPointCount: integrationPointResults.length,
    tipNodeId: tip.nodeId,
    tipDeflection: tip.value,
    deflectionRatio: tip.value / referenceDeflection(),
    applied,
    reaction,
    total,
    appliedForceRelativeError,
    appliedMomentRelativeError,
    totalForceRelativeResidual,
    totalMomentRelativeResidual,
    strainEnergy: loadCase.totalStrainEnergy,
    externalWork,
    relativeExternalWorkError,
    elementEnergySum: loadCase.energyQualification.elementEnergySum,
    energyReconstructionResidual: loadCase.energyQualification.residual,
    globalResultHash: canonicalLafeaSha256(result),
  };
  return Object.freeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function buildSource(level, orientation) {
  const registry = nodeRegistry();
  const elements = [];
  const loadedEdges = [];
  const dx = oracle.geometry.length / level.nx;
  const dy = oracle.geometry.depth / level.ny;
  const yMin = -oracle.geometry.depth / 2;

  for (let ix = 0; ix < level.nx; ix += 1) {
    const x0 = ix * dx;
    const x1 = (ix + 1) * dx;
    for (let iy = 0; iy < level.ny; iy += 1) {
      const y0 = yMin + iy * dy;
      const y1 = y0 + dy;
      const first = addT6(elements, registry, [[x0, y0], [x1, y0], [x1, y1]]);
      addT6(elements, registry, [[x0, y0], [x1, y1], [x0, y1]]);
      if (ix === level.nx - 1) {
        loadedEdges.push({
          elementId: first.elementId,
          edgeNodeIds: [first.nodeIds[1], first.nodeIds[4], first.nodeIds[2]],
        });
      }
    }
  }

  const localNodes = registry.rows();
  const nodes = localNodes.map((node) => {
    const point = transformPoint(node.x, node.y, orientation);
    return {
      nodeId: node.nodeId,
      x: point.x,
      y: point.y,
      sourceReference: `CANTILEVER_NODE#${node.nodeId}`,
    };
  });
  const constraints = localNodes
    .filter((node) => node.x === 0)
    .flatMap((node) => [
      restraint(`${node.nodeId}-UX`, node.nodeId, 'UX'),
      restraint(`${node.nodeId}-UY`, node.nodeId, 'UY'),
    ]);
  const tractionMagnitude = oracle.load.resultant
    / (oracle.geometry.depth * oracle.geometry.thickness);
  const tractionVector = transformVector(0, -tractionMagnitude, orientation);
  const edgeTractions = loadedEdges.map((edge, index) => ({
    tractionId: `T-${String(index + 1).padStart(4, '0')}`,
    elementId: edge.elementId,
    edgeNodeIds: edge.edgeNodeIds,
    tx: tractionVector.x,
    ty: tractionVector.y,
    sourceReference: `CANTILEVER_TRACTION#${edge.elementId}`,
  }));

  return {
    schema: MODEL_SCHEMA,
    modelIdentity: `B01_CANTILEVER_${level.levelId}_${orientation}`,
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: oracle.oracleId,
      sourceVersion: '1',
      adapterIdentity: 'LAFEA_BUCKET_01_T6_CANTILEVER',
      adapterVersion: 'B01-CANTILEVER.3',
    },
    units: oracle.units,
    formulation: FORMULATIONS.PLANE_STRESS,
    materials: [{
      materialId: 'MAT',
      elasticModulus: oracle.material.elasticModulus,
      poissonRatio: oracle.material.poissonRatio,
      sourceReference: `${oracle.oracleId}#MATERIAL`,
    }],
    nodes,
    elements,
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: `${oracle.oracleId}#T6_ONLY`,
    },
    constraints,
    loadCases: [{
      loadCaseId: oracle.load.loadCaseId,
      nodalForces: [],
      edgeTractions,
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: `${oracle.oracleId}#${orientation}`,
    }],
    resultRequests: { loadCaseIds: [oracle.load.loadCaseId] },
    qualificationProfile: JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),
    limitations: ['BUCKET_01_ELEMENTARY_T6_CANTILEVER_ONLY'],
  };
}

function addT6(elements, registry, [a, b, c]) {
  const elementId = `E${String(elements.length + 1).padStart(5, '0')}`;
  const nodeIds = [
    registry.get(...a),
    registry.get(...b),
    registry.get(...c),
    registry.get((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
    registry.get((b[0] + c[0]) / 2, (b[1] + c[1]) / 2),
    registry.get((c[0] + a[0]) / 2, (c[1] + a[1]) / 2),
  ];
  const element = {
    elementId,
    elementType: 'T6',
    nodeIds,
    materialId: 'MAT',
    thickness: oracle.geometry.thickness,
    sourceReference: `CANTILEVER_ELEMENT#${elementId}`,
  };
  elements.push(element);
  return element;
}

function nodeRegistry() {
  const nodeByCoordinate = new Map();
  const nodes = [];
  const key = (x, y) => `${clean(x).toFixed(12)}:${clean(y).toFixed(12)}`;
  return {
    get(x, y) {
      const coordinateKey = key(x, y);
      if (!nodeByCoordinate.has(coordinateKey)) {
        const nodeId = `N${String(nodes.length + 1).padStart(5, '0')}`;
        nodeByCoordinate.set(coordinateKey, nodeId);
        nodes.push({ nodeId, x: clean(x), y: clean(y) });
      }
      return nodeByCoordinate.get(coordinateKey);
    },
    rows() {
      return nodes.map((row) => ({ ...row }));
    },
  };
}

function restraint(constraintId, nodeId, dof) {
  return {
    constraintId,
    nodeId,
    dof,
    value: 0,
    sourceReference: `CANTILEVER_CONSTRAINT#${constraintId}`,
  };
}

function vectorFromForce(result, values, nodeById) {
  const vector = new Map([...nodeById.keys()].map((nodeId) => [nodeId, { fx: 0, fy: 0 }]));
  result.meshEvidence.dofOrdering.forEach((identity, index) => {
    const separator = identity.lastIndexOf(':');
    const nodeId = identity.slice(0, separator);
    const dof = identity.slice(separator + 1);
    vector.get(nodeId)[dof === 'UX' ? 'fx' : 'fy'] = values[index];
  });
  return vector;
}

function vectorFromReactions(rows, nodeById) {
  const vector = new Map([...nodeById.keys()].map((nodeId) => [nodeId, { fx: 0, fy: 0 }]));
  rows.forEach((row) => {
    const separator = row.dofIdentity.lastIndexOf(':');
    const nodeId = row.dofIdentity.slice(0, separator);
    const dof = row.dofIdentity.slice(separator + 1);
    vector.get(nodeId)[dof === 'UX' ? 'fx' : 'fy'] = row.value;
  });
  return vector;
}

function resultant(vector, nodeById) {
  let forceX = 0;
  let forceY = 0;
  let momentZ = 0;
  for (const [nodeId, force] of vector) {
    const node = nodeById.get(nodeId);
    forceX += force.fx;
    forceY += force.fy;
    momentZ += node.x * force.fy - node.y * force.fx;
  }
  return Object.freeze({ forceX, forceY, momentZ });
}

function findTipDisplacement(model, loadCase, orientation) {
  const target = transformPoint(oracle.geometry.length, 0, orientation);
  const node = model.nodes.find((row) => (
    Math.abs(row.x - target.x) <= 1e-12 && Math.abs(row.y - target.y) <= 1e-12
  ));
  assert.ok(node, `missing ${orientation} centerline tip node`);
  const displacement = loadCase.nodalDisplacements.find((row) => row.nodeId === node.nodeId);
  assert.ok(displacement, `missing ${orientation} centerline tip displacement`);
  const direction = transformVector(0, -1, orientation);
  const value = displacement.ux * direction.x + displacement.uy * direction.y;
  assert.ok(Number.isFinite(value) && value > 0, `${orientation} tip deflection is invalid`);
  return { nodeId: node.nodeId, value };
}

function externalWorkFromForceVector(result, loadCase) {
  const displacementByDof = new Map();
  loadCase.nodalDisplacements.forEach((row) => {
    displacementByDof.set(`${row.nodeId}:UX`, row.ux);
    displacementByDof.set(`${row.nodeId}:UY`, row.uy);
  });
  return 0.5 * result.meshEvidence.dofOrdering.reduce((sum, identity, index) => (
    sum + loadCase.forceEvidence.forceVector[index] * displacementByDof.get(identity)
  ), 0);
}

function assertConvergence(rows, orientationKey) {
  const errors = rows.map((row) => Math.abs(row[orientationKey].deflectionRatio - 1));
  const monotonic = errors.every((value, index) => (
    index === 0 || value <= errors[index - 1] + oracle.tolerances.monotonicSlack
  ));
  assert.equal(monotonic, true, `${orientationKey} deflection errors are not monotonic: ${errors.join(', ')}`);
  const finest = rows.at(-1)[orientationKey];
  within(
    Math.abs(finest.deflectionRatio - 1),
    oracle.tolerances.finestDeflectionRatioAbsoluteError,
    `${orientationKey} finest deflection`,
  );
}

function validateOracle() {
  assert.equal(oracle.schema, 'lafea-bucket-01-cantilever-oracle/v1');
  assert.equal(oracle.oracleId, 'B01-CANTILEVER-TIMOSHENKO-01');
  assert.equal(oracle.benchmarkId, 'C2D-CANTILEVER-PLANE-STRESS-01');
  assert.equal(oracle.authority.type, 'ENGINEERING_THEORY');
  assert.match(oracle.authority.source, /Timoshenko|beam/iu);
  assert.equal(oracle.authority.productionOutputUsed, false);
  assert.equal(oracle.authority.observedResultUsedToSelectTolerance, false);
  assert.equal(oracle.authority.smoothedStressUsed, false);
  assert.equal(oracle.formulation, FORMULATIONS.PLANE_STRESS);
  assert.equal(oracle.elementType, 'T6');
  assert.equal(oracle.load.type, 'UNIFORM_END_EDGE_TRACTION');
  assert.deepEqual(
    oracle.meshes.map((row) => row.elementCount),
    oracle.meshes.map((row) => 2 * row.nx * row.ny),
  );
  close(oracle.expected.referenceDeflection, referenceDeflection(), 'reference deflection');
  close(oracle.expected.appliedMomentZ, -oracle.load.resultant * oracle.geometry.length, 'applied moment');
  assert.deepEqual(oracle.expected.horizontalAppliedForce, { x: 0, y: -oracle.load.resultant });
  assert.deepEqual(oracle.expected.verticalAppliedForce, { x: oracle.load.resultant, y: 0 });
  for (const [name, value] of Object.entries(oracle.tolerances)) {
    assert.ok(Number.isFinite(value) && value >= 0, `${name} must be finite and non-negative`);
  }
}

function validateLevel(level) {
  assert.ok(Number.isInteger(level.nx) && level.nx > 0);
  assert.ok(Number.isInteger(level.ny) && level.ny > 0);
  assert.equal(level.elementCount, 2 * level.nx * level.ny);
  assert.ok(['DETERMINISTIC_CHOLESKY', 'DETERMINISTIC_JACOBI_PCG'].includes(level.solverMethod));
}

function referenceDeflection() {
  const { length, depth, thickness } = oracle.geometry;
  const { elasticModulus, poissonRatio } = oracle.material;
  const load = oracle.load.resultant;
  const inertia = thickness * depth ** 3 / 12;
  const area = depth * thickness;
  const shearModulus = elasticModulus / (2 * (1 + poissonRatio));
  return load * length ** 3 / (3 * elasticModulus * inertia)
    + load * length / (oracle.shearCorrectionFactor * shearModulus * area);
}

function transformPoint(x, y, orientation) {
  return orientation === 'HORIZONTAL'
    ? { x: clean(x), y: clean(y) }
    : { x: clean(-y), y: clean(x) };
}

function transformVector(x, y, orientation) {
  return orientation === 'HORIZONTAL'
    ? { x: clean(x), y: clean(y) }
    : { x: clean(-y), y: clean(x) };
}

function byCase(result, id) {
  const row = result.loadCaseResults.find((item) => item.loadCaseId === id);
  assert.ok(row, `missing load case ${id}`);
  return row;
}

function relativeDifference(left, right, scale) {
  return Math.abs(left - right) / Math.max(Math.abs(scale), 1e-30);
}

function close(actual, expected, label) {
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1e-30);
  assert.ok(Math.abs(actual - expected) / scale <= 1e-14, `${label}: ${actual} != ${expected}`);
}

function within(value, limit, label) {
  assert.ok(Number.isFinite(value) && value <= limit, `${label}: ${value} > ${limit}`);
}

function clean(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value;
}

function firstDiagnostic(result) {
  const diagnostic = result.diagnostics?.[0];
  return diagnostic ? `${diagnostic.code}: ${diagnostic.message}` : `state=${result.qualification?.state}`;
}
