#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { solveContinuumModel } from '../src/core/element-fea/index.js';
import {
  continuumModel,
  denseProfile,
  mElement,
  mLoadCase,
  mMaterial,
  mNode,
  mNodalForce,
  mRestraint,
  q4Grid,
} from '../src/core/fea-benchmarks/builders.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORACLE_PATH = path.join(ROOT, 'validation/bucket-01/12-cantilever-oracle.json');
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_CANTILEVER_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-cantilever.json',
);
const oracle = Object.freeze(JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8')));

validateOracle();
const oracleHash = canonicalLafeaSha256(oracle);
const replayCount = 3;
const horizontalReplays = Array.from(
  { length: replayCount },
  () => executeOrientation('HORIZONTAL'),
);
const verticalReplays = Array.from(
  { length: replayCount },
  () => executeOrientation('VERTICAL_CCW_90'),
);

assertReplayDeterminism(horizontalReplays, 'horizontal');
assertReplayDeterminism(verticalReplays, 'vertical');

const horizontal = horizontalReplays[0];
const vertical = verticalReplays[0];
const orientationDifference = relativeDifference(
  horizontal.history.at(-1).tipDeflection,
  vertical.history.at(-1).tipDeflection,
  referenceDeflection(),
);
assert.ok(
  orientationDifference <= oracle.tolerances.orientationDeflectionRelativeDifference,
  `orientation deflection difference ${orientationDifference} exceeds tolerance`,
);

const baseReport = {
  schema: 'lafea-bucket-01-cantilever-evidence/v2',
  producerRevision: 'B01-CANTILEVER.2',
  benchmarkId: oracle.benchmarkId,
  oracleId: oracle.oracleId,
  oraclePath: path.relative(ROOT, ORACLE_PATH).split(path.sep).join('/'),
  oracleHash,
  expectedValueDefinitionHash: oracleHash,
  replayCount,
  referenceDeflection: referenceDeflection(),
  horizontal,
  vertical,
  orientationRelativeDifference: orientationDifference,
  authority: {
    productionRouteExecuted: true,
    expectedValuesReadFromFrozenRegistryFile: true,
    expectedValuesFrozenBeforeExecution: true,
    productionOutputGeneratedExpectedValues: false,
    forceEquilibriumRetained: true,
    momentEquilibriumRetained: true,
    strainEnergyAndExternalWorkRetained: true,
    orientationSensitivityRetained: true,
    monotonicRefinementRetained: true,
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
const report = { ...baseReport, evidenceHash: canonicalLafeaSha256(baseReport) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function validateOracle() {
  assert.equal(oracle.schema, 'lafea-bucket-01-cantilever-oracle/v1');
  assert.equal(oracle.oracleId, 'B01-CANTILEVER-TIMOSHENKO-01');
  assert.equal(oracle.benchmarkId, 'C2D-CANTILEVER-PLANE-STRESS-01');
  assert.equal(oracle.authority.type, 'ENGINEERING_THEORY');
  assert.match(oracle.authority.source, /Timoshenko|beam/iu);
  assert.equal(oracle.authority.productionOutputUsed, false);
  assert.equal(oracle.authority.observedResultUsedToSelectTolerance, false);
  assert.equal(oracle.formulation, 'PLANE_STRESS');
  assert.equal(oracle.elementType, 'Q4_FULL_INTEGRATION');
  assert.ok(Array.isArray(oracle.meshes) && oracle.meshes.length >= 3);
  oracle.meshes.forEach(({ nx, ny }) => {
    assert.ok(Number.isInteger(nx) && nx > 0, 'nx must be a positive integer');
    assert.ok(Number.isInteger(ny) && ny > 0, 'ny must be a positive integer');
  });
  for (const [name, value] of Object.entries(oracle.tolerances)) {
    assert.ok(Number.isFinite(value) && value >= 0, `${name} must be finite and non-negative`);
  }
}

function executeOrientation(orientation) {
  const history = oracle.meshes.map(({ nx, ny }) => solveLevel(nx, ny, orientation));
  const ratios = history.map((row) => row.deflectionRatio);
  const monotonic = ratios.every((value, index) => (
    index === 0 || value >= ratios[index - 1] - oracle.tolerances.monotonicSlack
  ));
  assert.equal(
    monotonic,
    true,
    `${orientation} deflection refinement is not monotonic: ${ratios.join(', ')}`,
  );
  const finest = history.at(-1);
  assert.ok(
    Math.abs(finest.deflectionRatio - 1)
      <= oracle.tolerances.finestDeflectionRatioAbsoluteError,
    `${orientation} finest deflection ratio ${finest.deflectionRatio} is outside tolerance`,
  );
  return {
    orientation,
    monotonic,
    history,
    semanticHash: canonicalLafeaSha256({ orientation, monotonic, history }),
  };
}

function solveLevel(nx, ny, orientation) {
  const { length, depth, thickness } = oracle.geometry;
  const grid = q4Grid({ width: length, height: depth, nx, ny });
  const nodes = orientation === 'HORIZONTAL'
    ? grid.nodes
    : grid.nodes.map((row) => mNode(row.nodeId, -row.y, row.x));
  const restraints = [];
  for (let j = 0; j <= ny; j += 1) {
    restraints.push(mRestraint(`RX-${j}`, grid.nodeId(0, j), 'UX'));
    restraints.push(mRestraint(`RY-${j}`, grid.nodeId(0, j), 'UY'));
  }
  const tipNodeIds = Array.from({ length: ny + 1 }, (_, j) => grid.nodeId(nx, j));
  const forceShare = oracle.load.resultant / tipNodeIds.length;
  const loads = tipNodeIds.map((nodeId, index) => (
    orientation === 'HORIZONTAL'
      ? mNodalForce(`F-${index}`, nodeId, 0, -forceShare)
      : mNodalForce(`F-${index}`, nodeId, forceShare, 0)
  ));
  const model = continuumModel({
    modelIdentity: `${oracle.benchmarkId}-${orientation}-${nx}x${ny}`,
    solverProfile: denseProfile(oracle.formulation),
    nodes,
    materials: [mMaterial(
      'MAT1',
      oracle.material.elasticModulus,
      oracle.material.poissonRatio,
    )],
    elements: grid.elements.map((element) => mElement(
      element.elementId,
      element.type,
      element.nodeIds,
      'MAT1',
      thickness,
    )),
    restraints,
    loadCases: [mLoadCase('LC1', loads)],
  });
  const result = solveContinuumModel(model, 'LC1');
  assert.equal(result.status, 'QUALIFIED', firstDiagnostic(result));

  const tipDeflection = averageTipDisplacement(result, tipNodeIds, orientation);
  const reference = referenceDeflection();
  const forceScale = oracle.load.resultant;
  const momentScale = forceScale * length;
  const forceError = Math.hypot(
    result.equilibriumTotals.fx,
    result.equilibriumTotals.fy,
  ) / forceScale;
  const momentError = Math.abs(result.equilibriumTotals.mz) / momentScale;
  const externalWork = externalWorkFromTipLoads(
    result,
    tipNodeIds,
    forceShare,
    orientation,
  );
  const energyError = relativeDifference(
    result.strainEnergy,
    externalWork,
    Math.abs(externalWork),
  );
  const elementEnergyError = relativeDifference(
    result.strainEnergy,
    result.energyConsistency.elementEnergyTotal,
    Math.abs(result.strainEnergy),
  );

  assert.ok(
    forceError <= oracle.tolerances.forceEquilibriumRelative,
    `${orientation} ${nx}x${ny} force equilibrium error ${forceError} exceeds tolerance`,
  );
  assert.ok(
    momentError <= oracle.tolerances.momentEquilibriumRelative,
    `${orientation} ${nx}x${ny} moment equilibrium error ${momentError} exceeds tolerance`,
  );
  assert.ok(
    energyError <= oracle.tolerances.energyRelative,
    `${orientation} ${nx}x${ny} external-work error ${energyError} exceeds tolerance`,
  );
  assert.ok(
    elementEnergyError <= oracle.tolerances.energyRelative,
    `${orientation} ${nx}x${ny} element-energy error ${elementEnergyError} exceeds tolerance`,
  );

  return {
    mesh: `${nx}x${ny}`,
    elementCount: nx * ny,
    nodeCount: nodes.length,
    freeDofCount: result.constraintPartition.freeEquations.length,
    restrainedDofCount: result.constraintPartition.constrainedEquations.length,
    solverMethod: result.backendTrace.backendIdentity,
    tipDeflection,
    deflectionRatio: tipDeflection / reference,
    appliedLoadTotals: result.appliedLoadTotals,
    reactionTotals: result.reactionTotals,
    equilibriumTotals: result.equilibriumTotals,
    relativeForceEquilibriumError: forceError,
    relativeMomentEquilibriumError: momentError,
    strainEnergy: result.strainEnergy,
    externalWork,
    relativeExternalWorkError: energyError,
    elementEnergyTotal: result.energyConsistency.elementEnergyTotal,
    relativeElementEnergyError: elementEnergyError,
    residualInfinityNorm: result.globalResidual.infinityNorm,
  };
}

function averageTipDisplacement(result, nodeIds, orientation) {
  const component = orientation === 'HORIZONTAL' ? 'UY' : 'UX';
  const sign = orientation === 'HORIZONTAL' ? -1 : 1;
  const byIdentity = new Map(
    result.nodalDisplacements.map((row) => [`${row.nodeId}:${row.component}`, row.value]),
  );
  const values = nodeIds.map((nodeId) => {
    const value = byIdentity.get(`${nodeId}:${component}`);
    assert.ok(Number.isFinite(value), `missing tip displacement ${nodeId}:${component}`);
    return sign * value;
  });
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function externalWorkFromTipLoads(result, nodeIds, forceShare, orientation) {
  const component = orientation === 'HORIZONTAL' ? 'UY' : 'UX';
  const signedForce = orientation === 'HORIZONTAL' ? -forceShare : forceShare;
  const byIdentity = new Map(
    result.nodalDisplacements.map((row) => [`${row.nodeId}:${row.component}`, row.value]),
  );
  return 0.5 * nodeIds.reduce((sum, nodeId) => {
    const displacement = byIdentity.get(`${nodeId}:${component}`);
    assert.ok(Number.isFinite(displacement), `missing work displacement ${nodeId}:${component}`);
    return sum + signedForce * displacement;
  }, 0);
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

function assertReplayDeterminism(replays, label) {
  const hashes = replays.map((row) => row.semanticHash);
  assert.equal(new Set(hashes).size, 1, `${label} replay hashes differ: ${hashes.join(', ')}`);
}

function relativeDifference(left, right, scale) {
  const denominator = Math.max(Math.abs(scale), Number.EPSILON);
  return Math.abs(left - right) / denominator;
}

function firstDiagnostic(result) {
  const diagnostic = result.diagnostics?.[0];
  return diagnostic ? `${diagnostic.code}: ${diagnostic.message}` : `status=${result.status}`;
}
