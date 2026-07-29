import assert from 'node:assert/strict';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel, q8ShapeFunctionsAndDerivatives, QUALIFICATION_STATES } from '../src/core/local-continuum/index.js';
import { boundaryEdgesWhere, mappedAnnulusSectorQ8 } from './lafea.3-benchmark-mesh-adapter.mjs';

/**
 * CONT-HOLE-01 (spec §17.4 benchmark catalogue): the classical Kirsch
 * problem — an infinite plate with a circular hole under remote uniaxial
 * tension — whose hallmark result is the stress concentration factor of 3
 * at the hole edge perpendicular to the load.
 *
 * Modeled as a quarter-symmetric annular patch from the hole radius `a` out
 * to a far-field radius `R >> a`, with symmetry restraints on both straight
 * cuts. The hole edge is traction-free; the OUTER boundary carries the
 * exact Kirsch traction (not a uniform far-field stress), so the truncated
 * domain reproduces the infinite-plate solution rather than approximating
 * it — the domain-truncation error is then a controlled, disclosed
 * `R/a`-driven quantity instead of an unquantified modeling assumption.
 *
 * Kirsch (remote tension `S` along +x):
 *   sigma_rr    = S/2 (1 - a^2/r^2) + S/2 (1 - 4a^2/r^2 + 3a^4/r^4) cos(2t)
 *   sigma_tt    = S/2 (1 + a^2/r^2) - S/2 (1 + 3a^4/r^4) cos(2t)
 *   sigma_rt    = -S/2 (1 + 2a^2/r^2 - 3a^4/r^4) sin(2t)
 * At r=a, t=90deg: sigma_tt = 3S — the concentration factor under test.
 */
const a = 10;
const R = 100;
const S = 50;
const E = 200000;
const nu = 0.3;
const thickness = 5;

function kirschPolar(r, t) {
  const a2 = (a / r) ** 2;
  const a4 = (a / r) ** 4;
  return {
    sigmaRR: (S / 2) * (1 - a2) + (S / 2) * (1 - 4 * a2 + 3 * a4) * Math.cos(2 * t),
    sigmaTT: (S / 2) * (1 + a2) - (S / 2) * (1 + 3 * a4) * Math.cos(2 * t),
    sigmaRT: -(S / 2) * (1 + 2 * a2 - 3 * a4) * Math.sin(2 * t),
  };
}

const levels = [solveQuarter(3, 6), solveQuarter(6, 12), solveQuarter(10, 20)];
levels.forEach(({ result }) => assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED));

// --- The headline Kirsch result: peak hoop stress at the hole edge
// converges to the classical concentration factor of 3. ---
const peakFactors = levels.map(peakHoopFactorAtHole);
console.log(`CONT-HOLE-01 hole-edge concentration factor by level: ${peakFactors.map((f) => f.toFixed(4)).join(' -> ')} (Kirsch: 3)`);
const peakErrors = peakFactors.map((factor) => Math.abs(factor - 3) / 3);
assert.ok(peakErrors[2] < peakErrors[0], `refinement must improve the concentration factor: ${peakErrors[2]} !< ${peakErrors[0]}`);
assert.ok(peakErrors[2] < 0.05, `finest mesh concentration factor must be within 5% of 3, got ${peakFactors[2].toFixed(4)}`);

// --- Full-field agreement with the closed form, over 3 refinement levels
// (spec §10's minimum for a production convergence claim). ---
const fieldErrors = levels.map(maxNormalizedFieldError);
console.log(`CONT-HOLE-01 full-field error by level: ${fieldErrors.map((e) => `${(e * 100).toFixed(3)}%`).join(' -> ')}`);
assert.ok(fieldErrors[1] < fieldErrors[0], `refinement must reduce field error (level 2): ${fieldErrors[1]} !< ${fieldErrors[0]}`);
assert.ok(fieldErrors[2] < fieldErrors[1], `refinement must reduce field error (level 3): ${fieldErrors[2]} !< ${fieldErrors[1]}`);
assert.ok(fieldErrors[2] < 0.05, `finest mesh full-field error must be within 5%, got ${(fieldErrors[2] * 100).toFixed(3)}%`);

console.log('LAFEA.3 CONT-HOLE-01 benchmark (Kirsch plate with hole, Kt=3, 3-level convergence) passed.');

function solveQuarter(radialElements, circumferentialElements) {
  // Graded radially toward the hole: the Kirsch field's a^2/r^2 and a^4/r^4
  // terms decay within roughly one hole radius, so a uniform radial mesh
  // would average straight through the peak instead of resolving it.
  const { nodes, elements } = mappedAnnulusSectorQ8(a, R, Math.PI / 2, radialElements, circumferentialElements, 40);
  const nodesById = new Map(nodes.map((row) => [row.nodeId, row]));
  const constraints = [];
  nodes.forEach((row) => {
    if (Math.abs(row.y) < 1e-6) constraints.push(constraint(row.nodeId, 'UY', 0));
    if (Math.abs(row.x) < 1e-6) constraints.push(constraint(row.nodeId, 'UX', 0));
  });

  // Exact Kirsch traction on the truncated outer boundary, applied as a
  // per-edge traction resolved into global x/y at the edge midpoint.
  const outerEdges = boundaryEdgesWhere(elements, nodesById, (node) => Math.abs(Math.hypot(node.x, node.y) - R) < 1e-6);
  assert.ok(outerEdges.length > 0, 'outer-radius boundary edges must be found');
  const edgeTractions = outerEdges.map((edge, index) => {
    const midNode = nodesById.get(edge.edgeNodeSequence[1]);
    const t = Math.atan2(midNode.y, midNode.x);
    const { sigmaRR, sigmaRT } = kirschPolar(R, t);
    // Outward normal is radial; traction = sigma . n, expressed in global x/y.
    const cos = Math.cos(t); const sin = Math.sin(t);
    return {
      tractionId: `T${index}`, elementId: edge.elementId, edgeNodeIds: edge.edgeNodeIds,
      tx: sigmaRR * cos - sigmaRT * sin,
      ty: sigmaRR * sin + sigmaRT * cos,
      sourceReference: `TRACTION#T${index}`,
    };
  });

  const model = {
    schema: 'local-continuum-model/v1', modelIdentity: 'CONT_HOLE_01', modelVersion: '1',
    sourceAncestry: { sourceModelIdentity: 'BENCHMARK', sourceVersion: '1', adapterIdentity: 'LAFEA3_BENCHMARK', adapterVersion: '1' },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{ materialId: 'MAT', elasticModulus: E, poissonRatio: nu, sourceReference: 'MATERIAL#MAT' }],
    nodes: nodes.map((row) => ({ nodeId: row.nodeId, x: row.x, y: row.y, sourceReference: `NODE#${row.nodeId}` })),
    elements: elements.map((row) => ({
      elementId: row.elementId, elementType: row.elementType, nodeIds: row.nodeIds, materialId: 'MAT', thickness, sourceReference: `ELEMENT#${row.elementId}`,
    })),
    elementTypePolicy: { allowT3Fallback: false, sourceReference: 'CONT_HOLE_01_Q8_DEFAULT' },
    constraints,
    loadCases: [{
      loadCaseId: 'REMOTE_TENSION', nodalForces: [], edgeTractions, pressureLoads: [], bodyForces: [], temperatureLoads: [], imposedDisplacements: [], sourceReference: 'CASE#REMOTE_TENSION',
    }],
    resultRequests: { loadCaseIds: ['REMOTE_TENSION'] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1', identity: 'BENCHMARK_PROFILE', tolerances: toleranceTable(),
    },
    limitations: [],
  };

  const canonical = createCanonicalLocalContinuumModel(model);
  return { result: calculateLocalContinuum(canonical), canonicalNodes: canonical.nodes };
}

/** Peak hoop stress among Gauss points nearest the hole edge, as a multiple of the remote tension S. */
function peakHoopFactorAtHole({ result, canonicalNodes }) {
  let peak = 0;
  forEachGaussPoint(result, canonicalNodes, ({ radius, sigmaHoop }) => {
    // Only the ring of Gauss points inside the first element layer off the hole.
    if (radius > 1.35 * a) return;
    peak = Math.max(peak, sigmaHoop);
  });
  return peak / S;
}

function maxNormalizedFieldError({ result, canonicalNodes }) {
  let maxError = 0;
  forEachGaussPoint(result, canonicalNodes, ({
    radius, angle, sigmaRadial, sigmaHoop, sigmaShear,
  }) => {
    const expected = kirschPolar(radius, angle);
    maxError = Math.max(
      maxError,
      Math.abs(sigmaRadial - expected.sigmaRR) / S,
      Math.abs(sigmaHoop - expected.sigmaTT) / S,
      Math.abs(sigmaShear - expected.sigmaRT) / S,
    );
  });
  return maxError;
}

/** Maps every Gauss point to its physical position and polar stress components. */
function forEachGaussPoint(result, canonicalNodes, visit) {
  const nodesById = new Map(canonicalNodes.map((row) => [row.nodeId, row]));
  result.loadCaseResults[0].elementResults.forEach((elementResult, elementIndex) => {
    const elementNodes = result.meshEvidence.elementEvidence[elementIndex].nodeIds.map((id) => nodesById.get(id));
    elementResult.gaussPointResults.forEach((gp) => {
      const { N } = q8ShapeFunctionsAndDerivatives(gp.xi, gp.eta);
      let x = 0; let y = 0;
      N.forEach((value, i) => { x += value * elementNodes[i].x; y += value * elementNodes[i].y; });
      const radius = Math.hypot(x, y);
      const cos = x / radius; const sin = y / radius;
      const { sigmaX, sigmaY, tauXY } = gp.stress;
      visit({
        radius,
        angle: Math.atan2(y, x),
        sigmaRadial: sigmaX * cos ** 2 + sigmaY * sin ** 2 + 2 * tauXY * sin * cos,
        sigmaHoop: sigmaX * sin ** 2 + sigmaY * cos ** 2 - 2 * tauXY * sin * cos,
        sigmaShear: (sigmaY - sigmaX) * sin * cos + tauXY * (cos ** 2 - sin ** 2),
      });
    });
  });
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
