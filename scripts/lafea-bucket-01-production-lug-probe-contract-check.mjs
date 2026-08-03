#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateLafeaLugPinholeT6Mesh,
  LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
} from '../src/core/lafea-meshing/lug-pinhole-t6.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/08-production-lug-fixed-probe-spec.json',
);
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_LUG_PROBE_CONTRACT_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-production-lug-probe-contract.json',
);
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));

validateSpec(spec);
const points = allPoints(spec);
const levels = spec.meshLadder.map((definition) =>
  qualifyLevel(definition, points));
const reportBase = {
  schema: 'lafea-bucket-01-production-lug-probe-contract-evidence/v2',
  producerRevision: 'B01-LUG-PROBE-CONTRACT.2',
  specId: spec.specId,
  specHash: canonicalLafeaSha256(spec),
  levels,
  pointCount: points.length,
  convergenceWindow: spec.convergenceWindow,
  authority: spec.authority,
  status: 'PASS',
};
const report = { ...reportBase, evidenceHash: canonicalLafeaSha256(reportBase) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function validateSpec(value) {
  assert.equal(value.schema, 'lafea-bucket-01-production-lug-probe-spec/v2');
  assert.equal(value.benchmarkId, 'C2D-LUG-PINHOLE-01');
  assert.equal(value.stageId, 'LAFEA.3');
  assert.equal(value.formulation, 'PLANE_STRESS');
  assert.deepEqual(
    value.meshLadder.map((row) => row.elementCount),
    [64, 256, 1024, 4096],
  );
  assert.deepEqual(
    value.meshLadder.map((row) => row.radialDivisions),
    [2, 4, 8, 16],
  );
  assert.deepEqual(
    value.meshLadder.map((row) => row.circumferentialDivisions),
    [16, 32, 64, 128],
  );
  assert.deepEqual(value.convergenceWindow.governedLevelOrdinals, [1, 2, 3, 4]);
  assert.deepEqual(value.convergenceWindow.evaluatedLevelOrdinals, [2, 3, 4]);
  assert.equal(
    value.convergenceWindow.policy,
    'FINEST_THREE_OF_GOVERNED_FOUR_LEVEL_LADDER',
  );
  assert.equal(value.authority.coordinatesFrozenBeforeProductionStressObservation, true);
  assert.equal(value.authority.productionOutputUsedToSelectCoordinates, false);
  assert.equal(value.authority.productionOutputUsedToSetTolerances, false);
  assert.equal(value.authority.movingMaximumUsed, false);
  assert.equal(value.authority.nodalProjectionUsed, false);
  assert.equal(value.authority.crossElementAveragingUsed, false);
  assert.equal(value.authority.integrationPointExtrapolationUsed, false);
  assert.equal(
    value.authority.recovery,
    'DIRECT_T6_B_MATRIX_AT_FIXED_PHYSICAL_COORDINATE',
  );
  assert.ok(value.tolerances.highGradientGciMax > 0);
  assert.ok(value.tolerances.nonSingularGciMax > 0);
  const ids = allPoints(value).map((row) => row.probeId);
  assert.equal(new Set(ids).size, ids.length);
}

function allPoints(value) {
  const probes = value.probes.map((row) => ({ ...row, role: 'FIXED_PROBE' }));
  const pathPoints = value.paths.flatMap((pathValue) =>
    pathValue.stations.map((station) => ({
      probeId: `${pathValue.pathId}:${station.stationId}`,
      pathId: pathValue.pathId,
      stationId: station.stationId,
      radius: station.radius,
      angleDegrees: pathValue.angleDegrees,
      x: station.x,
      y: station.y,
      component: pathValue.component,
      units: pathValue.units,
      zone: station.zone,
      role: 'FIXED_PATH_STATION',
    })));
  return [...probes, ...pathPoints];
}

function qualifyLevel(definition, points) {
  const packageValue = generateLafeaLugPinholeT6Mesh({
    schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
    meshIdentity: `B01_LUG_PROBE_L${definition.ordinal}`,
    center: spec.geometry.center,
    holeRadius: spec.geometry.holeRadius,
    outerRadius: spec.geometry.outerRadius,
    radialDivisions: definition.radialDivisions,
    circumferentialDivisions: definition.circumferentialDivisions,
    startAngleDegrees: 0,
  });
  assert.equal(packageValue.mesh.elements.length, definition.elementCount);
  const nodeById = new Map(packageValue.mesh.nodes.map((row) => [row.nodeId, row]));
  const pointEvidence = points.map((point) => {
    const candidates = [];
    for (const element of packageValue.mesh.elements) {
      const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
      const natural = invertT6(nodes, point.x, point.y);
      if (natural && inside(natural.xi, natural.eta)) {
        candidates.push({ elementId: element.elementId, natural, nodes });
      }
    }
    assert.equal(candidates.length, 1, `${point.probeId} level ${definition.ordinal}`);
    const candidate = candidates[0];
    const mapped = mapT6(candidate.nodes, candidate.natural.xi, candidate.natural.eta);
    const residual = Math.hypot(mapped.x - point.x, mapped.y - point.y);
    const margin = Math.min(
      candidate.natural.xi,
      candidate.natural.eta,
      1 - candidate.natural.xi - candidate.natural.eta,
    );
    assert.ok(residual <= spec.tolerances.mappingResidualMax);
    assert.ok(margin >= spec.tolerances.naturalCoordinateMarginMin);
    return {
      probeId: point.probeId,
      role: point.role,
      elementId: candidate.elementId,
      naturalCoordinates: candidate.natural,
      naturalCoordinateMargin: margin,
      mappingResidual: residual,
    };
  });
  return {
    ordinal: definition.ordinal,
    elementCount: packageValue.mesh.elements.length,
    nodeCount: packageValue.mesh.nodes.length,
    meshHash: canonicalLafeaSha256(packageValue.mesh),
    pointEvidence,
    status: 'PASS',
  };
}

function invertT6(nodes, x, y) {
  const [a, b, c] = nodes;
  const determinant = (b.x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (b.y - a.y);
  if (determinant === 0) return null;
  let xi = ((x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (y - a.y)) / determinant;
  let eta = ((b.x - a.x) * (y - a.y)
    - (x - a.x) * (b.y - a.y)) / determinant;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const mapped = mapT6WithJacobian(nodes, xi, eta);
    const rx = mapped.x - x;
    const ry = mapped.y - y;
    if (Math.hypot(rx, ry) <= 1e-10) return { xi, eta };
    if (!(Math.abs(mapped.determinant) > 1e-18)) return null;
    const dxi = (mapped.dyDeta * rx - mapped.dxDeta * ry) / mapped.determinant;
    const deta = (-mapped.dyDxi * rx + mapped.dxDxi * ry) / mapped.determinant;
    xi -= dxi;
    eta -= deta;
    if (!Number.isFinite(xi) || !Number.isFinite(eta)) return null;
  }
  const mapped = mapT6(nodes, xi, eta);
  return Math.hypot(mapped.x - x, mapped.y - y) <= 1e-8 ? { xi, eta } : null;
}

function inside(xi, eta) {
  return xi >= -1e-9 && eta >= -1e-9 && xi + eta <= 1 + 1e-9;
}

function mapT6(nodes, xi, eta) {
  const shape = t6Shape(xi, eta);
  return {
    x: shape.N.reduce((sum, value, index) => sum + value * nodes[index].x, 0),
    y: shape.N.reduce((sum, value, index) => sum + value * nodes[index].y, 0),
  };
}

function mapT6WithJacobian(nodes, xi, eta) {
  const shape = t6Shape(xi, eta);
  let x = 0; let y = 0; let dxDxi = 0; let dyDxi = 0;
  let dxDeta = 0; let dyDeta = 0;
  for (let index = 0; index < 6; index += 1) {
    x += shape.N[index] * nodes[index].x;
    y += shape.N[index] * nodes[index].y;
    dxDxi += shape.dNdXi[index] * nodes[index].x;
    dyDxi += shape.dNdXi[index] * nodes[index].y;
    dxDeta += shape.dNdEta[index] * nodes[index].x;
    dyDeta += shape.dNdEta[index] * nodes[index].y;
  }
  return {
    x, y, dxDxi, dyDxi, dxDeta, dyDeta,
    determinant: dxDxi * dyDeta - dxDeta * dyDxi,
  };
}

function t6Shape(xi, eta) {
  const l1 = 1 - xi - eta; const l2 = xi; const l3 = eta;
  return {
    N: [
      l1 * (2 * l1 - 1), l2 * (2 * l2 - 1), l3 * (2 * l3 - 1),
      4 * l1 * l2, 4 * l2 * l3, 4 * l3 * l1,
    ],
    dNdXi: [
      4 * xi + 4 * eta - 3, 4 * xi - 1, 0,
      4 * (1 - 2 * xi - eta), 4 * eta, -4 * eta,
    ],
    dNdEta: [
      4 * xi + 4 * eta - 3, 0, 4 * eta - 1,
      -4 * xi, 4 * xi, 4 * (1 - xi - 2 * eta),
    ],
  };
}
