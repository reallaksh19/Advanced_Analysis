#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
  QUALIFICATION_PROFILE,
  QUALIFICATION_STATES,
} from '../src/core/local-continuum/index.js';
import {
  generateLafeaLugPinholeT6Mesh,
  LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
} from '../src/core/lafea-meshing/lug-pinhole-t6.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
  recoverLafeaBucket01FixedProbe,
  validateLafeaBucket01FixedProbeEvidence,
} from '../src/workspace/lafea-bucket-01-fixed-probe.js';
import {
  LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA,
  evaluateLafeaBucket01StressConvergence,
  validateLafeaBucket01StressConvergenceEvidence,
} from '../src/workspace/lafea-bucket-01-stress-convergence.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORACLE_PATH = path.join(
  ROOT,
  'validation/bucket-01/07-kirsch-fixed-probe-oracle.json',
);
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_KIRSCH_PROBE_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-kirsch-fixed-probes.json',
);
const exactHeadSha = process.env.EXPECTED_HEAD_SHA?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
const oracle = Object.freeze(JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8')));
const GL5 = Object.freeze([
  Object.freeze({ s: -0.906179845938664, w: 0.2369268850561891 }),
  Object.freeze({ s: -0.5384693101056831, w: 0.4786286704993665 }),
  Object.freeze({ s: 0, w: 0.5688888888888889 }),
  Object.freeze({ s: 0.5384693101056831, w: 0.4786286704993665 }),
  Object.freeze({ s: 0.906179845938664, w: 0.2369268850561891 }),
]);

validateOracle(oracle);
const refinementSeed = oracle.meshLadder.at(-1);
const diagnosticLevel = Object.freeze({
  ordinal: refinementSeed.ordinal + 1,
  radialDivisions: refinementSeed.radialDivisions * 2,
  circumferentialDivisions: refinementSeed.circumferentialDivisions * 2,
  quarterElementCount: refinementSeed.quarterElementCount * 4,
  meshSize: refinementSeed.meshSize / 2,
});
const executionLadder = Object.freeze([...oracle.meshLadder, diagnosticLevel]);
const levelEvidence = executionLadder.map((definition) =>
  executeLevel(definition));
const probeReceipts = oracle.probes.map((definition) =>
  evaluateProbe(definition, levelEvidence));

const reportBase = {
  schema: 'lafea-bucket-01-kirsch-fixed-probe-evidence/v2',
  producerRevision: 'B01-KIRSCH-PROBES.2',
  exactHeadSha,
  benchmarkId: oracle.benchmarkId,
  oracleId: oracle.oracleId,
  oracleHash: canonicalLafeaSha256(oracle),
  formulation: 'PLANE_STRESS',
  elementType: 'T6',
  levelEvidence: levelEvidence.map((level) => ({
    ordinal: level.ordinal,
    elementCount: level.mesh.elements.length,
    nodeCount: level.mesh.nodes.length,
    meshHash: level.meshHash,
    recoveryHash: level.recoveryHash,
    resultPayloadHash: level.result.semanticHashes.resultPayloadSemanticHash,
    solverMethod: level.loadCase.solverEvidence.method,
    stiffnessStorage: level.result.meshEvidence.globalStiffnessStorage ?? 'DENSE',
  })),
  probeReceipts,
  authority: {
    closedFormKirschOracle: true,
    exactOuterTractionIntegratedToT6BoundaryNodes: true,
    fixedPhysicalCoordinates: true,
    integrationPointReconstruction: true,
    movingMaximumUsed: false,
    nodalProjectionUsed: false,
    crossElementAveragingUsed: false,
    originalThreeLevelConvergenceRetained: true,
    deterministicAdditionalRefinementExecuted: true,
    oscillatoryAcceptanceRequiresIndependentClosedFormBound: true,
    toleranceChangedAfterObservation: false,
  },
  qualificationStates: {
    implemented: true,
    kirschFixedProbeReceiptProduced: true,
    solverVerified: false,
    stressVerified: false,
    bucketQualified: false,
  },
  status: 'PASS',
};
const report = {
  ...reportBase,
  evidenceHash: canonicalLafeaSha256(reportBase),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function executeLevel(definition) {
  const packageValue = generateLafeaLugPinholeT6Mesh({
    schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
    meshIdentity: `B01_KIRSCH_T6_L${definition.ordinal}`,
    center: { x: 0, y: 0 },
    holeRadius: oracle.geometry.holeRadius,
    outerRadius: oracle.geometry.outerRadius,
    radialDivisions: definition.radialDivisions,
    circumferentialDivisions: definition.circumferentialDivisions,
    startAngleDegrees: 0,
  });
  const mesh = quarterMesh(packageValue, definition);
  assert.equal(mesh.elements.length, definition.quarterElementCount);
  const nodalForces = integrateOuterKirschTraction(
    packageValue,
    mesh,
    definition,
  );
  const source = continuumSource(mesh, nodalForces, definition.ordinal);
  const canonical = createCanonicalLocalContinuumModel(source);
  const result = calculateLocalContinuum(canonical);
  assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
  const loadCase = result.loadCaseResults.find(
    (row) => row.loadCaseId === oracle.loading.loadCaseId,
  );
  assert.ok(loadCase, `missing ${oracle.loading.loadCaseId}`);
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);
  const meshHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-kirsch-quarter-mesh-hash-input/v1',
    mesh,
  });
  const recoveryHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-kirsch-recovery-hash-input/v1',
    loadCaseId: loadCase.loadCaseId,
    elementResults: loadCase.elementResults,
  });
  const probes = new Map();
  for (const probeDefinition of oracle.probes) {
    const locationDefinitionHash = probeLocationHash(probeDefinition);
    const evidence = recoverLafeaBucket01FixedProbe({
      schema: LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
      exactHeadSha,
      meshHash,
      recoveryHash,
      mesh,
      result,
      probe: {
        probeId: probeDefinition.probeId,
        loadCaseId: oracle.loading.loadCaseId,
        x: probeDefinition.x,
        y: probeDefinition.y,
        component: probeDefinition.component,
        units: probeDefinition.units,
        locationDefinitionHash,
      },
    });
    assert.equal(
      validateLafeaBucket01FixedProbeEvidence(evidence, mesh, result).ok,
      true,
    );
    assert.equal(evidence.status, 'PASS');
    assert.ok(
      evidence.mappingResidual <= oracle.tolerances.mappingResidualMax,
      `${probeDefinition.probeId} mapping residual ${evidence.mappingResidual}`,
    );
    probes.set(probeDefinition.probeId, evidence);
  }
  return {
    ordinal: definition.ordinal,
    mesh,
    meshHash,
    recoveryHash,
    result,
    loadCase,
    probes,
  };
}

function evaluateProbe(definition, levels) {
  const highGradient = definition.zone === 'HIGH_GRADIENT';
  const gciTolerance = highGradient
    ? oracle.tolerances.highGradientGciMax
    : oracle.tolerances.nonSingularGciMax;
  const fineTolerance = highGradient
    ? oracle.tolerances.highGradientFineRelativeErrorMax
    : oracle.tolerances.nonSingularFineRelativeErrorMax;
  const initialEvidences = levels.slice(0, 3).map(
    (level) => level.probes.get(definition.probeId),
  );
  const refinedEvidences = levels.slice(-3).map(
    (level) => level.probes.get(definition.probeId),
  );
  const initialConvergence = convergenceFor(
    definition,
    initialEvidences,
    oracle.meshLadder.map((row) => row.meshSize),
    gciTolerance,
  );
  const refinedConvergence = convergenceFor(
    definition,
    refinedEvidences,
    executionLadder.slice(-3).map((row) => row.meshSize),
    gciTolerance,
  );
  const refinedOracleErrors = refinedEvidences.map((evidence) =>
    oracleErrors(evidence, definition));
  const maximumRefinedOracleError = Math.max(
    ...refinedOracleErrors.map((row) => row.maximum),
  );
  const oscillatoryBoundAccepted = refinedConvergence.status === 'BLOCKED'
    && refinedConvergence.convergence.classification === 'OSCILLATORY'
    && refinedConvergence.reasons.length === 1
    && refinedConvergence.reasons[0]
      === 'OSCILLATORY_CONVERGENCE_REQUIRES_ADDITIONAL_LEVEL_OR_BOUND'
    && maximumRefinedOracleError <= fineTolerance;
  const gciAccepted = refinedConvergence.status === 'PASS';
  assert.ok(
    gciAccepted || oscillatoryBoundAccepted,
    `${definition.probeId}: ${JSON.stringify({
      refinedConvergence: refinedConvergence.convergence,
      maximumRefinedOracleError,
      fineTolerance,
    })}`,
  );
  const fine = refinedEvidences.at(-1);
  const fineErrors = oracleErrors(fine, definition);
  assert.ok(
    fineErrors.maximum <= fineTolerance,
    `${definition.probeId} fine error ${fineErrors.maximum} > ${fineTolerance}`,
  );
  return {
    probeId: definition.probeId,
    zone: definition.zone,
    component: definition.component,
    physicalCoordinates: { x: definition.x, y: definition.y },
    exactValue: definition.principalMaximum,
    observedValues: levels.map(
      (level) => level.probes.get(definition.probeId).authoritativeValue,
    ),
    fineValue: fine.authoritativeValue,
    fineRelativeError: fineErrors.value,
    fineTensorRelativeErrors: fineErrors.tensor,
    maximumFineRelativeError: fineErrors.maximum,
    fineTolerance,
    gciTolerance,
    initialConvergence,
    convergence: refinedConvergence,
    maximumRefinedOracleError,
    convergenceAcceptance:
      gciAccepted
        ? 'THREE_LEVEL_RICHARDSON_GCI'
        : 'INDEPENDENT_CLOSED_FORM_BOUND_FOR_OSCILLATORY_SEQUENCE',
    fixedProbeEvidenceHashes: levels.map(
      (level) => level.probes.get(definition.probeId).semanticHash,
    ),
    status: 'PASS',
  };
}

function convergenceFor(definition, evidences, meshSizes, gciTolerance) {
  const convergence = evaluateLafeaBucket01StressConvergence({
    schema: LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA,
    exactHeadSha,
    probeEvidences: evidences,
    meshSizes,
    gciTolerance,
    minimumObservedOrder: oracle.tolerances.minimumObservedOrder,
    asymptoticRatioBounds: oracle.tolerances.asymptoticRatioBounds,
  });
  assert.equal(
    validateLafeaBucket01StressConvergenceEvidence(convergence, evidences).ok,
    true,
    `${definition.probeId} convergence evidence failed rebuild`,
  );
  return convergence;
}

function oracleErrors(evidence, definition) {
  const value = relativeError(
    evidence.authoritativeValue,
    definition.principalMaximum,
    oracle.loading.remoteSigmaX,
  );
  const tensor = {
    sigmaX: relativeError(
      evidence.reconstructedComponents.sigmaX,
      definition.global.sigmaX,
      oracle.loading.remoteSigmaX,
    ),
    sigmaY: relativeError(
      evidence.reconstructedComponents.sigmaY,
      definition.global.sigmaY,
      oracle.loading.remoteSigmaX,
    ),
    tauXY: relativeError(
      evidence.reconstructedComponents.tauXY,
      definition.global.tauXY,
      oracle.loading.remoteSigmaX,
    ),
  };
  return {
    value,
    tensor,
    maximum: Math.max(value, ...Object.values(tensor)),
  };
}

function quarterMesh(packageValue, definition) {
  const quarterSectors = definition.circumferentialDivisions / 4;
  const elements = packageValue.mesh.elements.filter((element) => {
    const match = /-S(\d+)-/u.exec(element.elementId);
    return match && Number(match[1]) < quarterSectors;
  });
  const retainedNodeIds = new Set(elements.flatMap((row) => row.nodeIds));
  const nodes = packageValue.mesh.nodes.filter((row) =>
    retainedNodeIds.has(row.nodeId));
  return {
    schema: 'lafea-analysis-mesh/v1',
    meshIdentity: `${packageValue.mesh.meshIdentity}_QUARTER`,
    nodes,
    elements,
  };
}

function integrateOuterKirschTraction(packageValue, mesh, definition) {
  const nodeById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const quarterSectors = definition.circumferentialDivisions / 4;
  const edges = packageValue.featureSets.outerBoundary.edgeNodeIds
    .slice(0, quarterSectors);
  const forceByNode = new Map();
  for (const edge of edges) {
    const nodes = edge.map((nodeId) => {
      const node = nodeById.get(nodeId);
      assert.ok(node, `outer edge node ${nodeId} missing`);
      return node;
    });
    for (const point of GL5) {
      const shape = edgeShape(point.s);
      const mapped = mapEdge(nodes, shape);
      const radius = Math.hypot(mapped.x, mapped.y);
      const angle = Math.atan2(mapped.y, mapped.x);
      const polar = kirschPolar(radius, angle);
      const cos = mapped.x / radius;
      const sin = mapped.y / radius;
      const tx = polar.sigmaRR * cos - polar.sigmaRT * sin;
      const ty = polar.sigmaRR * sin + polar.sigmaRT * cos;
      const factor = oracle.material.thickness * mapped.jacobian * point.w;
      edge.forEach((nodeId, index) => {
        const row = forceByNode.get(nodeId) ?? { fx: 0, fy: 0 };
        row.fx += shape.N[index] * tx * factor;
        row.fy += shape.N[index] * ty * factor;
        forceByNode.set(nodeId, row);
      });
    }
  }
  return [...forceByNode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, force], index) => ({
      loadId: `KIRSCH-OUTER-${index + 1}`,
      nodeId,
      fx: clean(force.fx),
      fy: clean(force.fy),
      sourceReference: `KIRSCH_ORACLE#OUTER_NODE_${nodeId}`,
    }));
}

function continuumSource(mesh, nodalForces, ordinal) {
  const coordinateTolerance = 1e-9;
  const constraints = [];
  for (const node of mesh.nodes) {
    if (Math.abs(node.y) <= coordinateTolerance) {
      constraints.push(constraint(node.nodeId, 'UY'));
    }
    if (Math.abs(node.x) <= coordinateTolerance) {
      constraints.push(constraint(node.nodeId, 'UX'));
    }
  }
  return {
    schema: 'local-continuum-model/v1',
    modelIdentity: `B01_KIRSCH_T6_LEVEL_${ordinal}`,
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: oracle.oracleId,
      sourceVersion: oracle.schema,
      adapterIdentity: 'LAFEA3_BUCKET_01_KIRSCH_T6_QUARTER',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{
      materialId: 'MAT',
      elasticModulus: oracle.material.elasticModulus,
      poissonRatio: oracle.material.poissonRatio,
      sourceReference: 'KIRSCH_ORACLE#MATERIAL',
    }],
    nodes: mesh.nodes.map((row) => ({
      nodeId: row.nodeId,
      x: row.x,
      y: row.y,
      sourceReference: `KIRSCH_MESH#${row.nodeId}`,
    })),
    elements: mesh.elements.map((row) => ({
      elementId: row.elementId,
      elementType: 'T6',
      nodeIds: row.nodeIds,
      materialId: 'MAT',
      thickness: oracle.material.thickness,
      sourceReference: `KIRSCH_MESH#${row.elementId}`,
    })),
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'KIRSCH_ORACLE#T6_ONLY',
    },
    constraints,
    loadCases: [{
      loadCaseId: oracle.loading.loadCaseId,
      nodalForces,
      edgeTractions: [],
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: 'KIRSCH_ORACLE#REMOTE_TENSION',
    }],
    resultRequests: { loadCaseIds: [oracle.loading.loadCaseId] },
    qualificationProfile: JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),
    limitations: [],
  };
}

function validateOracle(value) {
  assert.equal(value.schema, 'lafea-bucket-01-kirsch-fixed-probe-oracle/v1');
  assert.equal(value.benchmarkId, 'C2D-KIRSCH-HOLE-01');
  assert.equal(value.authority.productionOutputUsed, false);
  assert.equal(value.authority.smoothedStressUsed, false);
  assert.equal(value.authority.movingMaximumUsed, false);
  assert.deepEqual(
    value.meshLadder.map((row) => row.quarterElementCount),
    [64, 256, 1024],
  );
  for (const probe of value.probes) {
    const angle = probe.angleDegrees * Math.PI / 180;
    close(probe.x, probe.radius * Math.cos(angle), `${probe.probeId} x`);
    close(probe.y, probe.radius * Math.sin(angle), `${probe.probeId} y`);
    const expected = kirschAtGlobal(probe.radius, angle);
    close(probe.global.sigmaX, expected.sigmaX, `${probe.probeId} sigma x`);
    close(probe.global.sigmaY, expected.sigmaY, `${probe.probeId} sigma y`);
    close(probe.global.tauXY, expected.tauXY, `${probe.probeId} tau xy`);
    close(
      probe.principalMaximum,
      expected.principalMaximum,
      `${probe.probeId} principal maximum`,
    );
  }
}

function probeLocationHash(probe) {
  return canonicalLafeaSha256({
    schema: 'lafea-bucket-01-kirsch-probe-location/v1',
    oracleId: oracle.oracleId,
    benchmarkId: oracle.benchmarkId,
    probeId: probe.probeId,
    radius: probe.radius,
    angleDegrees: probe.angleDegrees,
    x: probe.x,
    y: probe.y,
    component: probe.component,
    units: probe.units,
  });
}

function kirschPolar(radius, angle) {
  const ratio2 = (oracle.geometry.holeRadius / radius) ** 2;
  const ratio4 = ratio2 ** 2;
  const remote = oracle.loading.remoteSigmaX;
  return {
    sigmaRR: remote / 2 * (1 - ratio2)
      + remote / 2 * (1 - 4 * ratio2 + 3 * ratio4)
        * Math.cos(2 * angle),
    sigmaTT: remote / 2 * (1 + ratio2)
      - remote / 2 * (1 + 3 * ratio4) * Math.cos(2 * angle),
    sigmaRT: -remote / 2 * (1 + 2 * ratio2 - 3 * ratio4)
      * Math.sin(2 * angle),
  };
}

function kirschAtGlobal(radius, angle) {
  const polar = kirschPolar(radius, angle);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const sigmaX = polar.sigmaRR * cos ** 2
    + polar.sigmaTT * sin ** 2
    - 2 * polar.sigmaRT * sin * cos;
  const sigmaY = polar.sigmaRR * sin ** 2
    + polar.sigmaTT * cos ** 2
    + 2 * polar.sigmaRT * sin * cos;
  const tauXY = (polar.sigmaRR - polar.sigmaTT) * sin * cos
    + polar.sigmaRT * (cos ** 2 - sin ** 2);
  const average = (sigmaX + sigmaY) / 2;
  const radiusMohr = Math.hypot((sigmaX - sigmaY) / 2, tauXY);
  return {
    sigmaX,
    sigmaY,
    tauXY,
    principalMaximum: average + radiusMohr,
    principalMinimum: average - radiusMohr,
  };
}

function edgeShape(s) {
  return {
    N: [0.5 * s * (s - 1), 1 - s ** 2, 0.5 * s * (s + 1)],
    dN: [s - 0.5, -2 * s, s + 0.5],
  };
}

function mapEdge(nodes, shape) {
  let x = 0;
  let y = 0;
  let dx = 0;
  let dy = 0;
  for (let index = 0; index < 3; index += 1) {
    x += shape.N[index] * nodes[index].x;
    y += shape.N[index] * nodes[index].y;
    dx += shape.dN[index] * nodes[index].x;
    dy += shape.dN[index] * nodes[index].y;
  }
  return { x, y, jacobian: Math.hypot(dx, dy) };
}

function constraint(nodeId, dof) {
  return {
    constraintId: `SYM-${nodeId}-${dof}`,
    nodeId,
    dof,
    value: 0,
    sourceReference: `KIRSCH_ORACLE#SYM_${nodeId}_${dof}`,
  };
}

function relativeError(actual, expected, scale) {
  assert.ok(Number.isFinite(actual));
  assert.ok(Number.isFinite(expected));
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), scale);
}

function close(actual, expected, label) {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= 1e-12 * scale, label);
}

function clean(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-14 ? 0 : value;
}
