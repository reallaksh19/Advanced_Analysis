import assert from 'node:assert/strict';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel, q8ShapeFunctionsAndDerivatives, QUALIFICATION_STATES } from '../src/core/local-continuum/index.js';
import { boundaryEdgesWhere, mappedAnnulusSectorQ8 } from './lafea.3-benchmark-mesh-adapter.mjs';

/**
 * CONT-CYL-01 (spec §17.4 benchmark catalogue): internally pressurized
 * thick-wall cylinder vs. the closed-form Lame solution. Modeled as a
 * quarter-annulus sector (radii Ri..Ro, 0..90 degrees) exploiting the
 * problem's axisymmetry, with symmetry restraints on both straight radial
 * cuts (UY=0 on the theta=0 cut, UX=0 on the theta=90 cut) — the same
 * reduction a hand analysis would use.
 *
 * Meshed with the kernel's own mapped/transfinite Q8 mesher, which refines
 * in BOTH the radial and circumferential directions. (The T6 constrained-
 * Delaunay path refines only the boundary discretization — it inserts no
 * interior nodes — so refining an annulus arc there degrades element aspect
 * ratio across the wall rather than improving accuracy. That is a disclosed
 * limitation of that triangulator, recorded here rather than worked around
 * silently.)
 *
 * Lame: sigma_r(r) = A - B/r^2, sigma_theta(r) = A + B/r^2, with
 * A = Pi*Ri^2/(Ro^2-Ri^2), B = Pi*Ri^2*Ro^2/(Ro^2-Ri^2) for internal
 * pressure only. Verified at every Gauss point in the sector (see
 * `maxNormalizedError`), not at a single convenient edge.
 *
 * Error is normalized by the applied pressure rather than by |expected|:
 * sigma_r passes through zero at the traction-free outer surface, where a
 * relative-to-expected metric would blow up on a physically-correct tiny
 * absolute difference. This is the same scale-aware convention the kernel's
 * own qualification tolerances use, not a benchmark-specific relaxation.
 */
const Ri = 50;
const Ro = 100;
const internalPressure = 10;
const E = 200000;
const nu = 0.3;
const thickness = 10;

const A = internalPressure * Ri ** 2 / (Ro ** 2 - Ri ** 2);
const B = internalPressure * Ri ** 2 * Ro ** 2 / (Ro ** 2 - Ri ** 2);
function lameSigmaR(r) { return A - B / r ** 2; }
function lameSigmaTheta(r) { return A + B / r ** 2; }

const coarse = solveSector(2, 3);
const medium = solveSector(4, 6);
const fine = solveSector(8, 12);

[coarse, medium, fine].forEach(({ result }) => {
  assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
});

const errors = [coarse, medium, fine].map(maxNormalizedError);
console.log(`CONT-CYL-01 error by refinement level: ${errors.map((e) => `${(e * 100).toFixed(3)}%`).join(' -> ')}`);
assert.ok(errors[1] < errors[0], `refinement must reduce error (level 2): ${errors[1]} !< ${errors[0]}`);
assert.ok(errors[2] < errors[1], `refinement must reduce error (level 3): ${errors[2]} !< ${errors[1]}`);
assert.ok(errors[2] < 0.01, `finest mesh must be within 1% of the Lame closed form, got ${(errors[2] * 100).toFixed(3)}%`);

// The three levels satisfy spec §10's >=3-refinement-level requirement for a
// production convergence claim, and the trend is monotonic, not oscillatory.
assert.equal(errors.length, 3);

console.log('LAFEA.3 CONT-CYL-01 benchmark (pressurized thick cylinder vs. Lame closed form, 3-level convergence) passed.');

function solveSector(radialElements, circumferentialElements) {
  const { nodes, elements } = mappedAnnulusSectorQ8(Ri, Ro, Math.PI / 2, radialElements, circumferentialElements);
  const nodesById = new Map(nodes.map((row) => [row.nodeId, row]));
  const constraints = [];
  nodes.forEach((row) => {
    if (Math.abs(row.y) < 1e-6) constraints.push(constraint(row.nodeId, 'UY', 0));
    if (Math.abs(row.x) < 1e-6) constraints.push(constraint(row.nodeId, 'UX', 0));
  });
  const innerEdges = boundaryEdgesWhere(elements, nodesById, (node) => Math.abs(Math.hypot(node.x, node.y) - Ri) < 1e-6);
  assert.ok(innerEdges.length > 0, 'inner-radius boundary edges must be found');
  const pressureLoads = innerEdges.map((edge, index) => ({
    pressureLoadId: `P${index}`, elementId: edge.elementId, edgeNodeIds: edge.edgeNodeIds, pressure: internalPressure, sourceReference: `PRESSURE#P${index}`,
  }));

  const model = {
    schema: 'local-continuum-model/v1', modelIdentity: 'CONT_CYL_01', modelVersion: '1',
    sourceAncestry: { sourceModelIdentity: 'BENCHMARK', sourceVersion: '1', adapterIdentity: 'LAFEA3_BENCHMARK', adapterVersion: '1' },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{ materialId: 'MAT', elasticModulus: E, poissonRatio: nu, sourceReference: 'MATERIAL#MAT' }],
    nodes: nodes.map((row) => ({ nodeId: row.nodeId, x: row.x, y: row.y, sourceReference: `NODE#${row.nodeId}` })),
    elements: elements.map((row) => ({
      elementId: row.elementId, elementType: row.elementType, nodeIds: row.nodeIds, materialId: 'MAT', thickness, sourceReference: `ELEMENT#${row.elementId}`,
    })),
    elementTypePolicy: { allowT3Fallback: false, sourceReference: 'CONT_CYL_01_Q8_DEFAULT' },
    constraints,
    loadCases: [{
      loadCaseId: 'INTERNAL_PRESSURE', nodalForces: [], edgeTractions: [], pressureLoads, bodyForces: [], temperatureLoads: [], imposedDisplacements: [], sourceReference: 'CASE#INTERNAL_PRESSURE',
    }],
    resultRequests: { loadCaseIds: ['INTERNAL_PRESSURE'] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1', identity: 'BENCHMARK_PROFILE', tolerances: toleranceTable(),
    },
    limitations: [],
  };

  const canonical = createCanonicalLocalContinuumModel(model);
  return { result: calculateLocalContinuum(canonical), canonicalNodes: canonical.nodes };
}

/**
 * Compares EVERY Gauss point in the whole sector against Lame, by mapping
 * each point to its true physical position through the element's Q8 shape
 * functions and rotating its Cartesian stress tensor into polar (radial /
 * hoop) components. Sampling the full field — rather than only a
 * convenient edge where the axes happen to align — is what makes this a
 * real benchmark of the solution rather than a spot check.
 */
function maxNormalizedError({ result, canonicalNodes }) {
  const nodesById = new Map(canonicalNodes.map((row) => [row.nodeId, row]));
  let maxError = 0;
  result.loadCaseResults[0].elementResults.forEach((elementResult, elementIndex) => {
    const elementNodes = result.meshEvidence.elementEvidence[elementIndex].nodeIds.map((id) => nodesById.get(id));
    elementResult.gaussPointResults.forEach((gp) => {
      const { N } = q8ShapeFunctionsAndDerivatives(gp.xi, gp.eta);
      let x = 0; let y = 0;
      N.forEach((value, i) => { x += value * elementNodes[i].x; y += value * elementNodes[i].y; });
      const radius = Math.hypot(x, y);
      const cos = x / radius; const sin = y / radius;
      const { sigmaX, sigmaY, tauXY } = gp.stress;
      const sigmaRadial = sigmaX * cos ** 2 + sigmaY * sin ** 2 + 2 * tauXY * sin * cos;
      const sigmaHoop = sigmaX * sin ** 2 + sigmaY * cos ** 2 - 2 * tauXY * sin * cos;
      maxError = Math.max(
        maxError,
        Math.abs(sigmaRadial - lameSigmaR(radius)) / internalPressure,
        Math.abs(sigmaHoop - lameSigmaTheta(radius)) / internalPressure,
      );
    });
  });
  return maxError;
}

function constraint(nodeId, dof, value) {
  return {
    constraintId: `${nodeId}-${dof}`, nodeId, dof, value, sourceReference: `CONSTRAINT#${nodeId}-${dof}`,
  };
}
function toleranceTable() {
  const tight = { absolute: 1e-9, relative: 1e-9 };
  const loose = { absolute: 1e-4, relative: 1e-4 };
  return {
    minimumElementArea: tight, stiffnessSymmetry: tight, constitutiveSymmetry: tight, choleskyPivot: tight,
    freeDofResidual: loose, reactionEquilibrium: loose, strainEnergy: loose, rigidBodyStrain: tight, patchTestStress: tight,
  };
}
