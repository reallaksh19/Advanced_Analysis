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
const ORACLE_PATH = path.join(
  ROOT,
  'validation/bucket-01/03-pure-bending-panel-oracle.json',
);
const oracle = Object.freeze(JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8')));
const REPLAY_COUNT = 3;

validateOracle(oracle);
const levelEvidence = oracle.meshLevels.map((level) => evaluateLevel(level));
const evidenceBase = {
  schema: 'lafea-bucket-01-pure-bending-evidence/v1',
  producerRevision: 'B01-PURE-BENDING.1',
  benchmarkId: 'C2D-PURE-BENDING-PANEL-T6-01',
  oracleId: oracle.oracleId,
  oracleHash: canonicalLafeaSha256(oracle),
  formulation: oracle.formulation,
  elementType: 'T6',
  replayCount: REPLAY_COUNT,
  levels: levelEvidence,
  status: 'PASS',
  authority: {
    closedFormOracle: true,
    productionOutputUsedForExpectedValues: false,
    integrationPointStressAuthority: true,
    nodalProjectionUsed: false,
    smoothedStressUsed: false,
    bucketQualified: false,
    codeQualified: false,
    releaseQualified: false,
  },
};
const evidence = Object.freeze({
  ...evidenceBase,
  semanticHash: canonicalLafeaSha256(evidenceBase),
});

assert.deepEqual(evidence.levels.map((row) => row.elementCount), [8, 32, 128]);
assert.equal(evidence.authority.bucketQualified, false);

const outputPath = process.env.LAFEA_BUCKET_01_PURE_BENDING_REPORT_PATH;
if (outputPath) {
  const absolute = path.resolve(ROOT, outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

console.log('Bucket-01 T6 pure-bending panel closed-form benchmark passed.');

function evaluateLevel(level) {
  validateLevel(level);
  const model = createCanonicalLocalContinuumModel(buildSource(level));
  const results = Array.from(
    { length: REPLAY_COUNT },
    () => calculateLocalContinuum(model),
  );
  const serialized = results.map((row) => JSON.stringify(row));
  assert.ok(serialized.every((row) => row === serialized[0]), 'replays differ');
  const result = results[0];
  assert.equal(result.qualification?.state, QUALIFICATION_STATES.ACCEPTED);
  const loadCase = result.loadCaseResults.find(
    (row) => row.loadCaseId === 'PURE_BENDING',
  );
  assert.ok(loadCase);
  assert.equal(loadCase.solverEvidence.method, 'DETERMINISTIC_CHOLESKY');
  assert.equal(loadCase.solverEvidence.accepted, true);
  assert.equal(loadCase.equilibrium.accepted, true);

  const nodeById = new Map(model.nodes.map((node) => [node.nodeId, node]));
  const elementById = new Map(
    model.elements.map((element) => [element.elementId, element]),
  );
  const displacement = displacementError(loadCase, nodeById);
  const stress = stressError(loadCase, nodeById, elementById);
  const relativeEnergyError = Math.abs(
    loadCase.totalStrainEnergy - oracle.expected.strainEnergy,
  ) / oracle.expected.strainEnergy;
  const equilibrium = equilibriumEvidence(model, loadCase, nodeById);

  within(
    displacement.normalizedMaximumError,
    oracle.tolerances.normalizedDisplacement,
    'displacement',
  );
  within(
    stress.normalizedMaximumError,
    oracle.tolerances.normalizedStress,
    'stress',
  );
  within(relativeEnergyError, oracle.tolerances.relativeEnergy, 'energy');
  within(
    equilibrium.appliedForceRelativeError,
    oracle.tolerances.relativeForceEquilibrium,
    'applied force resultant',
  );
  within(
    equilibrium.appliedMomentRelativeError,
    oracle.tolerances.relativeMomentEquilibrium,
    'applied moment',
  );
  within(
    equilibrium.totalForceRelativeResidual,
    oracle.tolerances.relativeForceEquilibrium,
    'force equilibrium',
  );
  within(
    equilibrium.totalMomentRelativeResidual,
    oracle.tolerances.relativeMomentEquilibrium,
    'moment equilibrium',
  );

  const base = {
    schema: 'lafea-bucket-01-pure-bending-level-evidence/v1',
    levelId: level.levelId,
    nx: level.nx,
    ny: level.ny,
    nodeCount: model.nodes.length,
    elementCount: model.elements.length,
    canonicalModelHash: model.semanticHash,
    resultSemanticHashes: result.semanticHashes,
    replayResultHash: canonicalLafeaSha256(result),
    displacement,
    stress,
    energy: {
      calculated: loadCase.totalStrainEnergy,
      expected: oracle.expected.strainEnergy,
      relativeError: relativeEnergyError,
    },
    equilibrium,
    solver: {
      method: loadCase.solverEvidence.method,
      freeDofCount: loadCase.solverEvidence.freeDofIdentities.length,
      constrainedDofCount: loadCase.solverEvidence.constrainedDofIdentities.length,
      minimumPivot: loadCase.solverEvidence.minimumPivot,
      pivotRatio: loadCase.solverEvidence.pivotRatio,
    },
    status: 'PASS',
  };
  return Object.freeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function buildSource(level) {
  const registry = nodeRegistry();
  const elements = [];
  const dx = oracle.geometry.length / level.nx;
  const dy = oracle.geometry.height / level.ny;
  for (let ix = 0; ix < level.nx; ix += 1) {
    const x0 = ix * dx;
    const x1 = (ix + 1) * dx;
    for (let iy = 0; iy < level.ny; iy += 1) {
      const y0 = -oracle.geometry.height / 2 + iy * dy;
      const y1 = y0 + dy;
      addT6(elements, registry, [[x0, y0], [x1, y0], [x1, y1]]);
      addT6(elements, registry, [[x0, y0], [x1, y1], [x0, y1]]);
    }
  }

  const forceByNode = new Map();
  for (let iy = 0; iy < level.ny; iy += 1) {
    const y0 = -oracle.geometry.height / 2 + iy * dy;
    const y1 = y0 + dy;
    const ym = (y0 + y1) / 2;
    addForce(
      forceByNode,
      registry.require(oracle.geometry.length, y0),
      oracle.geometry.thickness * dy * sigmaX(y0) / 6,
    );
    addForce(
      forceByNode,
      registry.require(oracle.geometry.length, ym),
      2 * oracle.geometry.thickness * dy * sigmaX(ym) / 3,
    );
    addForce(
      forceByNode,
      registry.require(oracle.geometry.length, y1),
      oracle.geometry.thickness * dy * sigmaX(y1) / 6,
    );
  }

  const nodes = registry.rows();
  const constraints = nodes
    .filter((node) => node.x === 0)
    .flatMap((node) => {
      const exact = displacement(node.x, node.y);
      return [
        restraint(`${node.nodeId}-UX`, node.nodeId, 'UX', exact.ux),
        restraint(`${node.nodeId}-UY`, node.nodeId, 'UY', exact.uy),
      ];
    });
  const nodalForces = [...forceByNode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, fx], index) => ({
      loadId: `M-${String(index + 1).padStart(4, '0')}`,
      nodeId,
      fx,
      fy: 0,
      sourceReference: `PURE_BENDING_FORCE#${nodeId}`,
    }));

  return {
    schema: MODEL_SCHEMA,
    modelIdentity: `B01_PURE_BENDING_${level.levelId}`,
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: oracle.oracleId,
      sourceVersion: '1',
      adapterIdentity: 'LAFEA_BUCKET_01_PURE_BENDING_PANEL',
      adapterVersion: 'B01-PURE-BENDING.1',
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
      loadCaseId: 'PURE_BENDING',
      nodalForces,
      edgeTractions: [],
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: `${oracle.oracleId}#PURE_BENDING`,
    }],
    resultRequests: { loadCaseIds: ['PURE_BENDING'] },
    qualificationProfile: JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),
    limitations: [],
  };
}

function displacementError(loadCase, nodeById) {
  let maximumAbsoluteError = 0;
  let scale = 0;
  let tip = null;
  for (const row of loadCase.nodalDisplacements) {
    const node = nodeById.get(row.nodeId);
    assert.ok(node);
    const exact = displacement(node.x, node.y);
    maximumAbsoluteError = Math.max(
      maximumAbsoluteError,
      Math.abs(row.ux - exact.ux),
      Math.abs(row.uy - exact.uy),
    );
    scale = Math.max(scale, Math.abs(exact.ux), Math.abs(exact.uy));
    if (node.x === oracle.geometry.length && node.y === 0) {
      tip = { calculatedUx: row.ux, calculatedUy: row.uy };
    }
  }
  assert.ok(scale > 0 && tip);
  return Object.freeze({
    maximumAbsoluteError,
    scale,
    normalizedMaximumError: maximumAbsoluteError / scale,
    tipCenterline: {
      ...tip,
      expectedUx: 0,
      expectedUy: oracle.expected.tipCenterlineUy,
    },
  });
}

function stressError(loadCase, nodeById, elementById) {
  let maximumAbsoluteError = 0;
  let integrationPointCount = 0;
  for (const result of loadCase.elementResults) {
    const element = elementById.get(result.elementId);
    assert.equal(element?.elementType, 'T6');
    assert.equal(result.elementType, 'T6');
    assert.equal(result.recoveryLayer, 'INTEGRATION_POINT');
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    for (const point of result.gaussPointResults) {
      const physical = mapT6(nodes, point.xi, point.eta);
      const differences = [
        point.stress.sigmaX - sigmaX(physical.y),
        point.stress.sigmaY,
        point.stress.sigmaZ,
        point.stress.tauXY,
      ];
      maximumAbsoluteError = Math.max(
        maximumAbsoluteError,
        ...differences.map(Math.abs),
      );
      integrationPointCount += 1;
    }
  }
  return Object.freeze({
    recoveryAuthority: 'RETAINED_INTEGRATION_POINT_COMPONENTS',
    integrationPointCount,
    maximumAbsoluteError,
    scale: oracle.expected.maxAbsSigmaX,
    normalizedMaximumError:
      maximumAbsoluteError / oracle.expected.maxAbsSigmaX,
    nodalProjectionUsed: false,
    smoothingUsed: false,
  });
}

function equilibriumEvidence(model, loadCase, nodeById) {
  const sourceCase = model.loadCases.find((row) => row.loadCaseId === 'PURE_BENDING');
  const applied = resultant(sourceCase.nodalForces, nodeById, false);
  const reaction = resultant(loadCase.supportReactions, nodeById, true);
  const total = {
    forceX: applied.forceX + reaction.forceX,
    forceY: applied.forceY + reaction.forceY,
    momentZ: applied.momentZ + reaction.momentZ,
  };
  const forceScale = Math.abs(oracle.loading.endMoment) / oracle.geometry.height;
  return Object.freeze({
    applied,
    reaction,
    total,
    appliedForceRelativeError: Math.hypot(
      applied.forceX - oracle.expected.appliedForceResultant.x,
      applied.forceY - oracle.expected.appliedForceResultant.y,
    ) / forceScale,
    appliedMomentRelativeError: Math.abs(
      applied.momentZ - oracle.expected.appliedMomentZ,
    ) / Math.abs(oracle.expected.appliedMomentZ),
    totalForceRelativeResidual:
      Math.hypot(total.forceX, total.forceY) / forceScale,
    totalMomentRelativeResidual:
      Math.abs(total.momentZ) / Math.abs(oracle.loading.endMoment),
  });
}

function resultant(rows, nodeById, reactions) {
  let forceX = 0;
  let forceY = 0;
  let momentZ = 0;
  for (const row of rows) {
    let nodeId = row.nodeId;
    let fx = row.fx;
    let fy = row.fy;
    if (reactions) {
      const separator = row.dofIdentity.lastIndexOf(':');
      nodeId = row.dofIdentity.slice(0, separator);
      const dof = row.dofIdentity.slice(separator + 1);
      fx = dof === 'UX' ? row.value : 0;
      fy = dof === 'UY' ? row.value : 0;
    }
    const node = nodeById.get(nodeId);
    assert.ok(node);
    forceX += fx;
    forceY += fy;
    momentZ += node.x * fy - node.y * fx;
  }
  return Object.freeze({ forceX, forceY, momentZ });
}

function addT6(elements, registry, [a, b, c]) {
  const elementId = `E${String(elements.length + 1).padStart(5, '0')}`;
  elements.push({
    elementId,
    elementType: 'T6',
    nodeIds: [
      registry.get(...a),
      registry.get(...b),
      registry.get(...c),
      registry.get((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
      registry.get((b[0] + c[0]) / 2, (b[1] + c[1]) / 2),
      registry.get((c[0] + a[0]) / 2, (c[1] + a[1]) / 2),
    ],
    materialId: 'MAT',
    thickness: oracle.geometry.thickness,
    sourceReference: `PURE_BENDING_ELEMENT#${elementId}`,
  });
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
        nodes.push({
          nodeId,
          x: clean(x),
          y: clean(y),
          sourceReference: `PURE_BENDING_NODE#${nodeId}`,
        });
      }
      return nodeByCoordinate.get(coordinateKey);
    },
    require(x, y) {
      const nodeId = nodeByCoordinate.get(key(x, y));
      assert.ok(nodeId, `missing boundary node at ${x},${y}`);
      return nodeId;
    },
    rows() {
      return nodes.map((row) => ({ ...row }));
    },
  };
}

function addForce(forceByNode, nodeId, value) {
  forceByNode.set(nodeId, (forceByNode.get(nodeId) ?? 0) + value);
}

function restraint(constraintId, nodeId, dof, value) {
  return {
    constraintId,
    nodeId,
    dof,
    value: clean(value),
    sourceReference: `PURE_BENDING_CONSTRAINT#${constraintId}`,
  };
}

function displacement(x, y) {
  return {
    ux: clean(-oracle.expected.curvature * x * y),
    uy: clean(
      oracle.expected.curvature
        * (x ** 2 + oracle.material.poissonRatio * y ** 2) / 2,
    ),
  };
}

function sigmaX(y) {
  return clean(
    -oracle.loading.endMoment * y / oracle.expected.secondMomentArea,
  );
}

function mapT6(nodes, xi, eta) {
  const l1 = 1 - xi - eta;
  const shape = [
    l1 * (2 * l1 - 1),
    xi * (2 * xi - 1),
    eta * (2 * eta - 1),
    4 * l1 * xi,
    4 * xi * eta,
    4 * eta * l1,
  ];
  return {
    x: shape.reduce((sum, value, index) => sum + value * nodes[index].x, 0),
    y: shape.reduce((sum, value, index) => sum + value * nodes[index].y, 0),
  };
}

function validateOracle(value) {
  assert.equal(value.schema, 'lafea-bucket-01-pure-bending-oracle/v1');
  assert.equal(value.formulation, FORMULATIONS.PLANE_STRESS);
  assert.equal(value.authority.productionOutputUsed, false);
  assert.equal(value.authority.smoothedStressUsed, false);
  assert.equal(value.meshLevels.length, 3);
  const calculatedI = value.geometry.thickness * value.geometry.height ** 3 / 12;
  const calculatedCurvature = value.loading.endMoment
    / (value.material.elasticModulus * calculatedI);
  close(value.expected.secondMomentArea, calculatedI, 'second moment');
  close(value.expected.curvature, calculatedCurvature, 'curvature');
  close(
    value.expected.tipCenterlineUy,
    calculatedCurvature * value.geometry.length ** 2 / 2,
    'tip displacement',
  );
  close(
    value.expected.strainEnergy,
    value.loading.endMoment ** 2 * value.geometry.length
      / (2 * value.material.elasticModulus * calculatedI),
    'energy',
  );
  close(
    value.expected.maxAbsSigmaX,
    Math.abs(value.loading.endMoment) * value.geometry.height / (2 * calculatedI),
    'stress',
  );
  close(value.expected.appliedMomentZ, value.loading.endMoment, 'moment');
  assert.deepEqual(value.expected.appliedForceResultant, { x: 0, y: 0 });
}

function validateLevel(level) {
  assert.ok(Number.isInteger(level.nx) && level.nx >= 2);
  assert.ok(Number.isInteger(level.ny) && level.ny >= 2 && level.ny % 2 === 0);
}

function close(actual, expected, label) {
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1e-30);
  assert.ok(Math.abs(actual - expected) / scale <= 1e-14, label);
}

function within(value, limit, label) {
  assert.ok(Number.isFinite(value) && value <= limit, `${label}: ${value} > ${limit}`);
}

function clean(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value;
}
