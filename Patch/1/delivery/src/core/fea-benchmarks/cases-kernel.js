/**
 * Kernel-level FEA verification cases.
 *
 * Every case declares its reference solution and its acceptance tolerance
 * BEFORE it is run. Tolerances are engineering judgements written down in
 * advance, never fitted to an observed result.
 *
 * Tier 1 CLOSED_FORM      exact analytical answer exists
 * Tier 2 CONVERGENCE      no exact answer at a single mesh; behaviour is verified
 * Tier 3 INVARIANT        no reference needed; a physical law must hold
 */
import { solveContinuumModel } from '../element-fea/index.js';
import {
  continuumModel, denseProfile, mElement, mLoadCase, mMaterial, mNode, mNodalForce,
  mRestraint, mEdgeTraction, prescribeBoundaryField, prescribeField, q4Grid, sparseProfile, t3Grid,
} from './builders.js';

const E_STEEL = 200000;   // N/mm2
const NU = 0.3;

/* ================================================================== */
/* Helpers                                                            */
/* ================================================================== */

function check(spec) {
  const { checkId, quantity, unit, computed, reference, tolerance, toleranceType, note } = spec;
  const absoluteError = Number.isFinite(reference) ? Math.abs(computed - reference) : NaN;
  const scale = Math.max(Math.abs(reference), spec.referenceScale ?? 0);
  const relativeError = scale > 0 ? absoluteError / scale : (absoluteError > 0 ? Infinity : 0);
  const measured = toleranceType === 'RELATIVE' ? relativeError : absoluteError;
  return {
    checkId, quantity, unit,
    computed, reference,
    absoluteError, relativeError,
    tolerance, toleranceType,
    status: Number.isFinite(measured) && measured <= tolerance ? 'PASS' : 'FAIL',
    note: note ?? null,
  };
}

function passFail(checkId, quantity, ok, note) {
  return {
    checkId, quantity, unit: null,
    computed: ok ? 1 : 0, reference: 1,
    absoluteError: ok ? 0 : 1, relativeError: ok ? 0 : 1,
    tolerance: 0, toleranceType: 'BOOLEAN',
    status: ok ? 'PASS' : 'FAIL',
    note: note ?? null,
  };
}

function elementStressRows(result) {
  if (Array.isArray(result.integrationPointResults) && result.integrationPointResults.length) {
    return result.integrationPointResults.map((row) => ({
      elementId: row.elementId, locationId: row.integrationPointId,
      x: row.globalCoordinates.x, y: row.globalCoordinates.y,
      stress: row.stress, sigmaZ: row.sigmaZ, vonMises: row.vonMisesStress,
    }));
  }
  return (result.elementStresses ?? []).map((row, index) => ({
    elementId: row.elementId, locationId: 'T3_CONSTANT',
    x: null, y: null,
    stress: row.values, sigmaZ: row.sigmaZ,
    vonMises: result.vonMisesStress?.[index]?.value ?? null,
  }));
}

function maximumStressDeviation(rows, exact) {
  let worst = 0;
  let worstAt = null;
  rows.forEach((row) => {
    ['SX', 'SY', 'TXY'].forEach((component, index) => {
      const deviation = Math.abs(row.stress[index] - exact[index]);
      if (deviation > worst) { worst = deviation; worstAt = `${row.elementId}:${row.locationId}:${component}`; }
    });
  });
  return { worst, worstAt };
}

function nodalDisplacement(result, nodeId, component) {
  const row = (result.nodalDisplacements ?? [])
    .find((r) => r.nodeId === nodeId && r.component === component);
  return row ? row.value : NaN;
}

function solveOrThrow(model, loadCaseId) {
  const result = solveContinuumModel(model, loadCaseId);
  if (result.status !== 'QUALIFIED') {
    const first = result.diagnostics?.[0];
    throw new Error(`Solver did not qualify: ${first?.code ?? 'UNKNOWN'} — ${first?.message ?? ''}`);
  }
  return result;
}

/* ================================================================== */
/* Tier 1 — CLOSED FORM                                               */
/* ================================================================== */

/**
 * Constant-strain patch test.
 *
 * A linear displacement field is imposed on the boundary of a patch whose
 * INTERIOR nodes are free. Any convergent element must reproduce the exact
 * constant strain state everywhere. This is the single most important FEA
 * verification test; failure means the element cannot converge at all.
 *
 * Reference: Irons & Razzaque (1972); Zienkiewicz & Taylor, "The Finite
 * Element Method", patch test chapter. Exact to machine precision.
 */
function patchTest(caseId, elementType, distorted, formulation) {
  const gridSpec = { width: 2, height: 2, nx: 2, ny: 2 };
  const grid = elementType === 'Q4' ? q4Grid(gridSpec) : t3Grid(gridSpec);
  const nodes = grid.nodes.map((row) => {
    if (!distorted) return row;
    // Displace ONLY the interior node so that all elements become irregular.
    if (row.nodeId === grid.nodeId(1, 1)) return mNode(row.nodeId, 1.37, 0.71);
    return row;
  });

  // Exact linear field: eps_x = 1e-3, eps_y = -3e-4, gamma_xy = 5e-4
  const a = 1e-3;
  const b = -3e-4;
  const g = 5e-4;
  const field = (x, y) => [a * x + 0.5 * g * y, b * y + 0.5 * g * x];

  const thickness = formulation === 'PLANE_STRESS' ? 1 : undefined;
  const model = continuumModel({
    modelIdentity: caseId,
    solverProfile: denseProfile(formulation),
    nodes,
    materials: [mMaterial('MAT1', E_STEEL, NU)],
    elements: grid.elements.map((e) => mElement(e.elementId, e.type, e.nodeIds, 'MAT1', thickness)),
    prescribedDisplacements: prescribeBoundaryField(nodes, { x0: 0, x1: 2, y0: 0, y1: 2 }, field),
    loadCases: [mLoadCase('LC1')],
  });

  return {
    caseId,
    title: `${distorted ? 'Distorted' : 'Regular'} ${elementType} constant-strain patch test (${formulation})`,
    tier: 'T1_CLOSED_FORM',
    category: 'ELEMENT_CONSISTENCY',
    kernel: 'element-fea',
    reference: {
      type: 'CLOSED_FORM',
      source: 'Irons & Razzaque patch test; Zienkiewicz & Taylor FEM. Exact constant stress state.',
    },
    run() {
      const result = solveOrThrow(model, 'LC1');
      // Exact stress from the imposed constant strain.
      const strain = [a, b, g];
      const D = formulation === 'PLANE_STRESS'
        ? planeStressD(E_STEEL, NU)
        : planeStrainD(E_STEEL, NU);
      const exact = [
        D[0][0] * strain[0] + D[0][1] * strain[1],
        D[1][0] * strain[0] + D[1][1] * strain[1],
        D[2][2] * strain[2],
      ];
      const rows = elementStressRows(result);
      const { worst, worstAt } = maximumStressDeviation(rows, exact);
      const scale = Math.max(...exact.map(Math.abs));
      return {
        checks: [
          check({
            checkId: `${caseId}.STRESS`,
            quantity: 'Maximum stress deviation from exact constant state',
            unit: 'N/mm2',
            computed: worst, reference: 0, referenceScale: scale,
            tolerance: 1e-9, toleranceType: 'RELATIVE',
            note: worstAt ? `worst at ${worstAt}; exact = [${exact.map((v) => v.toPrecision(8)).join(', ')}]` : null,
          }),
          check({
            checkId: `${caseId}.ENERGY`,
            quantity: 'Element/global strain-energy consistency',
            unit: 'N·mm',
            computed: result.energyConsistency.absoluteDifference, reference: 0,
            referenceScale: Math.abs(result.strainEnergy),
            tolerance: 1e-10, toleranceType: 'RELATIVE',
          }),
        ],
        evidence: { elementCount: rows.length, exactStress: exact, strainEnergy: result.strainEnergy },
      };
    },
  };
}

function planeStressD(E, nu) {
  const f = E / (1 - nu * nu);
  return [[f, f * nu, 0], [f * nu, f, 0], [0, 0, E / (2 * (1 + nu))]];
}
function planeStrainD(E, nu) {
  const f = E / ((1 + nu) * (1 - 2 * nu));
  return [[f * (1 - nu), f * nu, 0], [f * nu, f * (1 - nu), 0], [0, 0, E / (2 * (1 + nu))]];
}

/**
 * Uniaxial tension of a rectangular strip under end traction.
 *
 * Reference: elementary strength of materials. sigma_x = t, sigma_y = 0,
 * tau_xy = 0, eps_y = -nu * eps_x. Exact for any consistent element.
 */
function uniaxialTension() {
  const caseId = 'BM-T1-UNIAXIAL-Q4';
  const traction = 50;              // N/mm2 applied on the right edge
  const grid = q4Grid({ width: 100, height: 20, nx: 4, ny: 2 });
  const nodes = grid.nodes;
  const rightEdge = [];
  for (let j = 0; j < 2; j += 1) {
    rightEdge.push({
      elementId: `E00${3}_00${j}`,
      edgeNodeIds: [grid.nodeId(4, j), grid.nodeId(4, j + 1)],
    });
  }
  const restraints = [];
  for (let j = 0; j <= 2; j += 1) restraints.push(mRestraint(`RX${j}`, grid.nodeId(0, j), 'UX'));
  restraints.push(mRestraint('RY0', grid.nodeId(0, 0), 'UY'));

  const model = continuumModel({
    modelIdentity: caseId,
    solverProfile: denseProfile('PLANE_STRESS'),
    nodes,
    materials: [mMaterial('MAT1', E_STEEL, NU)],
    elements: grid.elements.map((e) => mElement(e.elementId, e.type, e.nodeIds, 'MAT1', 1)),
    restraints,
    loadCases: [mLoadCase('LC1', [], rightEdge.map((edge, index) => mEdgeTraction(
      `T${index + 1}`, edge.elementId, edge.edgeNodeIds, traction, 0,
    )))],
  });

  return {
    caseId,
    title: 'Uniaxial tension strip, Q4 plane stress',
    tier: 'T1_CLOSED_FORM',
    category: 'STRESS_ACCURACY',
    kernel: 'element-fea',
    reference: {
      type: 'CLOSED_FORM',
      source: 'sigma_x = P/A = applied traction; sigma_y = tau_xy = 0; eps_y = -nu*eps_x.',
    },
    run() {
      const result = solveOrThrow(model, 'LC1');
      const rows = elementStressRows(result);
      const { worst } = maximumStressDeviation(rows, [traction, 0, 0]);
      const tipUx = nodalDisplacement(result, grid.nodeId(4, 1), 'UX');
      const exactUx = (traction / E_STEEL) * 100;
      const topUy = nodalDisplacement(result, grid.nodeId(0, 2), 'UY');
      const exactUy = -NU * (traction / E_STEEL) * 20;
      const reactionSum = result.reactionTotals.fx;
      return {
        checks: [
          check({
            checkId: `${caseId}.STRESS`, quantity: 'Maximum stress deviation from uniform uniaxial state',
            unit: 'N/mm2', computed: worst, reference: 0, referenceScale: traction,
            tolerance: 1e-10, toleranceType: 'RELATIVE',
          }),
          check({
            checkId: `${caseId}.UX`, quantity: 'Axial elongation at free end',
            unit: 'mm', computed: tipUx, reference: exactUx,
            tolerance: 1e-10, toleranceType: 'RELATIVE',
          }),
          check({
            checkId: `${caseId}.UY_POISSON`, quantity: 'Lateral Poisson contraction',
            unit: 'mm', computed: topUy, reference: exactUy,
            tolerance: 1e-10, toleranceType: 'RELATIVE',
          }),
          check({
            checkId: `${caseId}.REACTION`, quantity: 'Sum of support reactions vs applied load',
            unit: 'N', computed: reactionSum, reference: -traction * 20 * 1,
            tolerance: 1e-9, toleranceType: 'RELATIVE',
          }),
        ],
        evidence: { appliedTraction: traction, strainEnergy: result.strainEnergy },
      };
    },
  };
}

/**
 * Plane-strain out-of-plane stress recovery and 3D von Mises.
 *
 * Reference: sigma_z = nu*(sigma_x + sigma_y) for plane strain; von Mises must
 * use the full three-dimensional invariant. This case is deliberately
 * constructed so that the plane-stress (sigma_z = 0) expression gives a
 * materially different answer.
 */
function planeStrainSigmaZ() {
  const caseId = 'BM-T1-PLANE-STRAIN-SIGMAZ';
  const traction = 60;
  const grid = q4Grid({ width: 40, height: 20, nx: 2, ny: 2 });
  const rightEdge = [];
  for (let j = 0; j < 2; j += 1) {
    rightEdge.push({ elementId: `E001_00${j}`, edgeNodeIds: [grid.nodeId(2, j), grid.nodeId(2, j + 1)] });
  }
  const restraints = [];
  for (let j = 0; j <= 2; j += 1) restraints.push(mRestraint(`RX${j}`, grid.nodeId(0, j), 'UX'));
  restraints.push(mRestraint('RY0', grid.nodeId(0, 0), 'UY'));

  const model = continuumModel({
    modelIdentity: caseId,
    solverProfile: denseProfile('PLANE_STRAIN'),
    nodes: grid.nodes,
    materials: [mMaterial('MAT1', E_STEEL, NU)],
    elements: grid.elements.map((e) => mElement(e.elementId, e.type, e.nodeIds, 'MAT1')),
    restraints,
    loadCases: [mLoadCase('LC1', [], rightEdge.map((edge, index) => mEdgeTraction(
      `T${index + 1}`, edge.elementId, edge.edgeNodeIds, traction, 0,
    )))],
  });

  return {
    caseId,
    title: 'Plane-strain sigma_z recovery and 3D von Mises',
    tier: 'T1_CLOSED_FORM',
    category: 'CONSTITUTIVE',
    kernel: 'element-fea',
    reference: {
      type: 'CLOSED_FORM',
      source: 'sigma_z = nu*(sigma_x+sigma_y); von Mises = sqrt(0.5*[(sx-sy)^2+(sy-sz)^2+(sz-sx)^2]+3*txy^2).',
    },
    run() {
      const result = solveOrThrow(model, 'LC1');
      const rows = elementStressRows(result);
      let worstSigmaZ = 0;
      let worstVm = 0;
      let planeStressVmSpread = 0;
      rows.forEach((row) => {
        const [sx, sy, txy] = row.stress;
        const exactSigmaZ = NU * (sx + sy);
        worstSigmaZ = Math.max(worstSigmaZ, Math.abs(row.sigmaZ - exactSigmaZ));
        const sz = row.sigmaZ;
        const exactVm = Math.sqrt(0.5 * ((sx - sy) ** 2 + (sy - sz) ** 2 + (sz - sx) ** 2) + 3 * txy ** 2);
        worstVm = Math.max(worstVm, Math.abs(row.vonMises - exactVm));
        const naiveVm = Math.sqrt(sx ** 2 - sx * sy + sy ** 2 + 3 * txy ** 2);
        planeStressVmSpread = Math.max(planeStressVmSpread, Math.abs(naiveVm - exactVm) / exactVm);
      });
      return {
        checks: [
          check({
            checkId: `${caseId}.SIGMA_Z`, quantity: 'Recovered out-of-plane stress',
            unit: 'N/mm2', computed: worstSigmaZ, reference: 0, referenceScale: traction,
            tolerance: 1e-12, toleranceType: 'RELATIVE',
          }),
          check({
            checkId: `${caseId}.VON_MISES_3D`, quantity: 'Kernel von Mises vs 3D invariant',
            unit: 'N/mm2', computed: worstVm, reference: 0, referenceScale: traction,
            tolerance: 1e-12, toleranceType: 'RELATIVE',
          }),
          passFail(
            `${caseId}.SENSITIVITY`,
            'Case discriminates plane-stress from plane-strain von Mises',
            planeStressVmSpread > 0.05,
            `A sigma_z-ignoring expression differs by ${(100 * planeStressVmSpread).toFixed(2)} % here; ` +
            'the case is only diagnostic if this exceeds 5 %.',
          ),
        ],
        evidence: { planeStressVonMisesErrorFraction: planeStressVmSpread },
      };
    },
  };
}

/**
 * Thick-walled cylinder under internal pressure — Lame solution.
 *
 * Quarter annulus, plane strain, symmetry restraints on the two cut faces,
 * internal pressure on the bore. Compared against the closed-form Lame
 * distribution evaluated at the exact radius of each integration point.
 *
 * Reference: Lame (1852). sigma_r = A - B/r^2, sigma_theta = A + B/r^2 with
 * A = p a^2/(b^2-a^2), B = p a^2 b^2/(b^2-a^2) for internal pressure p,
 * inner radius a, outer radius b, traction-free outer surface.
 *
 * Tolerance reflects the FACETED approximation of a curved boundary by
 * straight-edged Q4 elements, declared in advance, not fitted.
 */
function lameCylinderMesh(nr, ntheta, a, b, pressure) {
  const pad = (v) => String(v).padStart(3, '0');
  const nodeId = (i, j) => `N${pad(i)}_${pad(j)}`;
  const nodes = [];
  for (let i = 0; i <= nr; i += 1) {
    const r = a + ((b - a) * i) / nr;
    for (let j = 0; j <= ntheta; j += 1) {
      const theta = (Math.PI / 2) * (j / ntheta);
      nodes.push(mNode(nodeId(i, j), r * Math.cos(theta), r * Math.sin(theta)));
    }
  }
  const elements = [];
  const bore = [];
  for (let i = 0; i < nr; i += 1) {
    for (let j = 0; j < ntheta; j += 1) {
      const id = `E${pad(i)}_${pad(j)}`;
      elements.push(mElement(id, 'Q4',
        [nodeId(i, j), nodeId(i + 1, j), nodeId(i + 1, j + 1), nodeId(i, j + 1)], 'MAT1'));
      if (i === 0) bore.push({ elementId: id, edgeNodeIds: [nodeId(0, j), nodeId(0, j + 1)] });
    }
  }
  const restraints = [];
  for (let i = 0; i <= nr; i += 1) {
    restraints.push(mRestraint(`SY${i}`, nodeId(i, 0), 'UY'));
    restraints.push(mRestraint(`SX${i}`, nodeId(i, ntheta), 'UX'));
  }
  return continuumModel({
    modelIdentity: `LAME-${nr}x${ntheta}`,
    solverProfile: denseProfile('PLANE_STRAIN'),
    nodes,
    materials: [mMaterial('MAT1', E_STEEL, NU)],
    elements,
    restraints,
    loadCases: [mLoadCase('LC1', [], bore.map((edge, index) => ({
      loadId: `P${String(index + 1).padStart(3, '0')}`,
      elementId: edge.elementId, edgeNodeIds: edge.edgeNodeIds,
      type: 'PRESSURE', pressure, sourceSemanticHash: 'fea-benchmark-source:v1',
    })))],
  });
}

/**
 * Thick-walled cylinder under internal pressure — Lame refinement study.
 *
 * Quarter annulus, plane strain, symmetry restraints on the two cut faces,
 * internal pressure on the bore. Straight-edged Q4 elements approximate the
 * circular boundary as a polygon, so the dominant error here is GEOMETRIC and
 * converges at first order, not the second order of the displacement field.
 * The acceptance criteria are therefore stated as a refinement study, not as a
 * single-mesh accuracy claim.
 *
 * Reference: Lame (1852). sigma_r = A - B/r^2, sigma_theta = A + B/r^2, with
 * A = p a^2/(b^2-a^2), B = p a^2 b^2/(b^2-a^2) for internal pressure p, inner
 * radius a, outer radius b and a traction-free outer surface.
 */
function thickCylinderLame() {
  const caseId = 'BM-T1-LAME-REFINEMENT';
  const a = 100;
  const b = 200;
  const pressure = 10;
  const A = (pressure * a * a) / (b * b - a * a);
  const B = (pressure * a * a * b * b) / (b * b - a * a);
  const exactBoreHoop = A + B / (a * a);
  const levels = [[4, 6], [8, 12], [16, 24]];

  return {
    caseId,
    title: 'Thick-walled cylinder under internal pressure — Lame refinement study (Q4, plane strain)',
    tier: 'T1_CLOSED_FORM',
    category: 'PRESSURE_VESSEL',
    kernel: 'element-fea',
    reference: {
      type: 'CLOSED_FORM',
      source: `Lame thick cylinder: a=${a} mm, b=${b} mm, p=${pressure} N/mm2, free outer surface. `
        + `Exact bore hoop stress = ${exactBoreHoop.toPrecision(8)} N/mm2.`,
    },
    run() {
      const history = levels.map(([nr, ntheta]) => {
        const model = lameCylinderMesh(nr, ntheta, a, b, pressure);
        const result = solveOrThrow(model, 'LC1');
        const rows = elementStressRows(result);
        let worstHoop = 0;
        let worstRadial = 0;
        let innerRingHoop = -Infinity;
        rows.forEach((row) => {
          const r = Math.hypot(row.x, row.y);
          const c = row.x / r;
          const s = row.y / r;
          const [sx, sy, txy] = row.stress;
          const sr = sx * c * c + sy * s * s + 2 * txy * c * s;
          const st = sx * s * s + sy * c * c - 2 * txy * c * s;
          worstHoop = Math.max(worstHoop, Math.abs(st - (A + B / (r * r))) / Math.abs(A + B / (r * r)));
          worstRadial = Math.max(worstRadial, Math.abs(sr - (A - B / (r * r))) / pressure);
          if (r < a + (b - a) / nr) innerRingHoop = Math.max(innerRingHoop, st);
        });
        return {
          mesh: `${nr}x${ntheta}`,
          elements: nr * ntheta,
          characteristicSize: (b - a) / nr,
          worstHoopRelativeError: worstHoop,
          worstRadialErrorOverPressure: worstRadial,
          innerRingPeakHoop: innerRingHoop,
          boreHoopRelativeError: Math.abs(innerRingHoop - exactBoreHoop) / exactBoreHoop,
          forceImbalance: Math.max(Math.abs(result.equilibriumTotals.fx), Math.abs(result.equilibriumTotals.fy)),
        };
      });

      const errors = history.map((row) => row.worstHoopRelativeError);
      const monotone = errors.every((value, index) => index === 0 || value < errors[index - 1]);
      const observedOrder = Math.log2(errors[0] / errors.at(-1)) / (levels.length - 1);
      const finest = history.at(-1);

      return {
        checks: [
          passFail(`${caseId}.MONOTONE`,
            'Hoop-stress error decreases monotonically under refinement',
            monotone,
            `errors = [${errors.map((v) => (100 * v).toFixed(3) + '%').join(', ')}]`),
          check({
            checkId: `${caseId}.BORE_HOOP`,
            quantity: 'Finest-mesh peak bore hoop stress vs Lame',
            unit: '-', computed: finest.boreHoopRelativeError, reference: 0, referenceScale: 1,
            tolerance: 0.005, toleranceType: 'ABSOLUTE',
            note: `Declared in advance: 16x24 mesh must reach the exact bore hoop within 0.5 %. `
              + `Computed peak = ${finest.innerRingPeakHoop.toPrecision(8)}, exact = ${exactBoreHoop.toPrecision(8)}.`,
          }),
          check({
            checkId: `${caseId}.FIELD_ERROR`,
            quantity: 'Finest-mesh worst hoop-stress error over the whole field',
            unit: '-', computed: finest.worstHoopRelativeError, reference: 0, referenceScale: 1,
            tolerance: 0.03, toleranceType: 'ABSOLUTE',
            note: 'Dominated by the faceted approximation of the circular boundary by straight Q4 edges.',
          }),
          check({
            checkId: `${caseId}.OBSERVED_ORDER`,
            quantity: 'Observed convergence order of the hoop-stress field error',
            unit: '-', computed: observedOrder, reference: 1,
            tolerance: 0.35, toleranceType: 'ABSOLUTE',
            note: 'First order is EXPECTED: the error is geometric (polygonal boundary), not interpolation error. '
              + 'A value near 2 would indicate the geometry error is not dominant.',
          }),
          check({
            checkId: `${caseId}.EQUILIBRIUM`,
            quantity: 'Finest-mesh global force imbalance',
            unit: 'N', computed: finest.forceImbalance, reference: 0, referenceScale: pressure * a,
            tolerance: 1e-9, toleranceType: 'RELATIVE',
          }),
        ],
        evidence: { lameA: A, lameB: B, exactBoreHoop, observedOrder, history },
      };
    },
  };
}

/* ================================================================== */
/* Tier 2 — CONVERGENCE / ELEMENT BEHAVIOUR                           */
/* ================================================================== */

/**
 * End-loaded cantilever — quantifies shear locking of the fully integrated Q4.
 *
 * The fully integrated bilinear quadrilateral develops parasitic shear strain
 * in bending. With one element through the depth it is dramatically over-stiff.
 * This case reports the tip-deflection ratio at several mesh densities. The
 * acceptance criterion is NOT "the coarse mesh is accurate" — it is that the
 * sequence converges monotonically towards the reference. A refined mesh that
 * still under-predicts by a wide margin indicates the locking is not being
 * relieved by refinement, which would be a defect.
 *
 * Reference: Timoshenko beam, delta = PL^3/(3EI) + PL/(kappa*G*A), kappa = 5/6.
 */
function cantileverLocking() {
  const caseId = 'BM-T2-CANTILEVER-Q4';
  const L = 100;
  const h = 10;
  const t = 1;
  const P = 100;
  const I = (t * h ** 3) / 12;
  const G = E_STEEL / (2 * (1 + NU));
  const kappa = 5 / 6;
  const reference = (P * L ** 3) / (3 * E_STEEL * I) + P / (kappa * G * h * t);

  const meshes = [[4, 1], [8, 2], [16, 4], [32, 8]];

  return {
    caseId,
    title: 'End-loaded cantilever: Q4 shear-locking characterisation',
    tier: 'T2_CONVERGENCE',
    category: 'ELEMENT_BEHAVIOUR',
    kernel: 'element-fea',
    reference: {
      type: 'ENGINEERING_THEORY',
      source: `Timoshenko beam with kappa=5/6: delta = PL^3/(3EI) + PL/(kappa G A) = ${reference.toPrecision(8)} mm.`,
    },
    run() {
      const history = meshes.map(([nx, ny]) => {
        const grid = q4Grid({ width: L, height: h, nx, ny });
        const restraints = [];
        for (let j = 0; j <= ny; j += 1) {
          restraints.push(mRestraint(`RX${j}`, grid.nodeId(0, j), 'UX'));
          restraints.push(mRestraint(`RY${j}`, grid.nodeId(0, j), 'UY'));
        }
        // Distribute the tip load over the free-end nodes.
        const tipNodes = [];
        for (let j = 0; j <= ny; j += 1) tipNodes.push(grid.nodeId(nx, j));
        const share = P / tipNodes.length;
        const model = continuumModel({
          modelIdentity: `${caseId}-${nx}x${ny}`,
          solverProfile: denseProfile('PLANE_STRESS'),
          nodes: grid.nodes,
          materials: [mMaterial('MAT1', E_STEEL, NU)],
          elements: grid.elements.map((e) => mElement(e.elementId, e.type, e.nodeIds, 'MAT1', t)),
          restraints,
          loadCases: [mLoadCase('LC1', tipNodes.map((nodeId, index) => mNodalForce(
            `F${index + 1}`, nodeId, 0, -share,
          )))],
        });
        const result = solveOrThrow(model, 'LC1');
        // Mid-depth tip deflection.
        const midIndex = ny / 2;
        const tipDeflection = Number.isInteger(midIndex)
          ? -nodalDisplacement(result, grid.nodeId(nx, midIndex), 'UY')
          : -(nodalDisplacement(result, grid.nodeId(nx, Math.floor(midIndex)), 'UY')
            + nodalDisplacement(result, grid.nodeId(nx, Math.ceil(midIndex)), 'UY')) / 2;
        return {
          mesh: `${nx}x${ny}`, elements: nx * ny, dof: 2 * grid.nodes.length,
          tipDeflection, ratio: tipDeflection / reference,
        };
      });

      const ratios = history.map((row) => row.ratio);
      const monotone = ratios.every((value, index) => index === 0 || value >= ratios[index - 1] - 1e-12);
      const finest = ratios.at(-1);
      const coarsest = ratios[0];
      return {
        checks: [
          passFail(
            `${caseId}.MONOTONE`,
            'Tip deflection increases monotonically under refinement (locking is relieved)',
            monotone,
            `ratios = [${ratios.map((v) => v.toFixed(4)).join(', ')}]`,
          ),
          check({
            checkId: `${caseId}.FINEST`, quantity: 'Finest-mesh tip deflection / Timoshenko reference',
            unit: '-', computed: finest, reference: 1,
            tolerance: 0.05, toleranceType: 'ABSOLUTE',
            note: 'Declared in advance: the 32x8 mesh must be within 5 % of beam theory.',
          }),
          check({
            checkId: `${caseId}.LOCKING_INDEX`,
            quantity: 'Coarse-mesh stiffness penalty (1 - coarse/reference)',
            unit: '-', computed: 1 - coarsest, reference: 0,
            tolerance: 1, toleranceType: 'ABSOLUTE',
            note: 'Reported for characterisation, not acceptance. A large value documents shear locking.',
          }),
        ],
        evidence: { referenceDeflection: reference, history },
      };
    },
  };
}

/* ================================================================== */
/* Tier 3 — INVARIANTS                                                */
/* ================================================================== */

/**
 * Rigid-body translation must produce zero strain, zero stress, zero energy.
 * Any element that fails this is fundamentally broken.
 */
function rigidBodyTranslation() {
  const caseId = 'BM-T3-RIGID-TRANSLATION';
  const grid = q4Grid({ width: 30, height: 20, nx: 3, ny: 2 });
  const model = continuumModel({
    modelIdentity: caseId,
    solverProfile: denseProfile('PLANE_STRESS'),
    nodes: grid.nodes,
    materials: [mMaterial('MAT1', E_STEEL, NU)],
    elements: grid.elements.map((e) => mElement(e.elementId, e.type, e.nodeIds, 'MAT1', 1)),
    prescribedDisplacements: prescribeField(grid.nodes, () => [1.5, -2.25]),
    loadCases: [mLoadCase('LC1')],
  });
  return {
    caseId,
    title: 'Rigid-body translation produces no stress',
    tier: 'T3_INVARIANT',
    category: 'ELEMENT_CONSISTENCY',
    kernel: 'element-fea',
    reference: { type: 'INVARIANT', source: 'Rigid-body motion produces zero strain by definition.' },
    run() {
      const result = solveOrThrow(model, 'LC1');
      const rows = elementStressRows(result);
      const { worst } = maximumStressDeviation(rows, [0, 0, 0]);
      return {
        checks: [
          check({
            checkId: `${caseId}.STRESS`, quantity: 'Maximum spurious stress',
            unit: 'N/mm2', computed: worst, reference: 0, referenceScale: 1,
            tolerance: 1e-6, toleranceType: 'ABSOLUTE',
            note: 'Absolute tolerance: E = 2e5, so 1e-6 N/mm2 is ~5e-12 relative to modulus.',
          }),
          check({
            checkId: `${caseId}.ENERGY`, quantity: 'Strain energy under rigid-body motion',
            unit: 'N·mm', computed: Math.abs(result.strainEnergy), reference: 0, referenceScale: 1,
            tolerance: 1e-6, toleranceType: 'ABSOLUTE',
          }),
        ],
        evidence: { strainEnergy: result.strainEnergy },
      };
    },
  };
}

/**
 * The same model solved by the dense LDLt reference backend and by the sparse
 * Jacobi-PCG backend must agree. This is a backend-equivalence invariant.
 */
function backendEquivalence() {
  const caseId = 'BM-T3-BACKEND-EQUIVALENCE';
  const build = (profile) => {
    const grid = q4Grid({ width: 60, height: 20, nx: 6, ny: 2 });
    const restraints = [];
    for (let j = 0; j <= 2; j += 1) {
      restraints.push(mRestraint(`RX${j}`, grid.nodeId(0, j), 'UX'));
      restraints.push(mRestraint(`RY${j}`, grid.nodeId(0, j), 'UY'));
    }
    return {
      grid,
      model: continuumModel({
        modelIdentity: `${caseId}-${profile.schema}`,
        solverProfile: profile,
        nodes: grid.nodes,
        materials: [mMaterial('MAT1', E_STEEL, NU)],
        elements: grid.elements.map((e) => mElement(e.elementId, e.type, e.nodeIds, 'MAT1', 1)),
        restraints,
        loadCases: [mLoadCase('LC1', [mNodalForce('F1', grid.nodeId(6, 2), 250, -400)])],
      }),
    };
  };
  return {
    caseId,
    title: 'Dense LDLt and sparse Jacobi-PCG backends agree',
    tier: 'T3_INVARIANT',
    category: 'SOLVER',
    kernel: 'element-fea',
    reference: { type: 'INVARIANT', source: 'Two backends solving the same SPD system must agree.' },
    run() {
      const dense = build(denseProfile('PLANE_STRESS'));
      const sparse = build(sparseProfile('PLANE_STRESS'));
      const rDense = solveOrThrow(dense.model, 'LC1');
      const rSparse = solveOrThrow(sparse.model, 'LC1');
      const denseMap = new Map(rDense.nodalDisplacements.map((r) => [`${r.nodeId}:${r.component}`, r.value]));
      let worst = 0;
      let scale = 0;
      rSparse.nodalDisplacements.forEach((r) => {
        const other = denseMap.get(`${r.nodeId}:${r.component}`);
        worst = Math.max(worst, Math.abs(r.value - other));
        scale = Math.max(scale, Math.abs(other));
      });
      return {
        checks: [
          check({
            checkId: `${caseId}.DISPLACEMENT`, quantity: 'Maximum displacement difference between backends',
            unit: 'mm', computed: worst, reference: 0, referenceScale: scale,
            tolerance: 1e-8, toleranceType: 'RELATIVE',
          }),
          check({
            checkId: `${caseId}.ENERGY`, quantity: 'Strain-energy difference between backends',
            unit: 'N·mm',
            computed: Math.abs(rDense.strainEnergy - rSparse.strainEnergy), reference: 0,
            referenceScale: Math.abs(rDense.strainEnergy),
            tolerance: 1e-8, toleranceType: 'RELATIVE',
          }),
        ],
        evidence: {
          denseEnergy: rDense.strainEnergy, sparseEnergy: rSparse.strainEnergy,
          pcgIterations: rSparse.iterativeSolverEvidence?.iterationCount ?? null,
        },
      };
    },
  };
}

/**
 * Determinism: identical input must produce identical semantic hashes.
 * Guards against Math.random, Date.now, Map/Set ordering and float drift.
 */
function determinism() {
  const caseId = 'BM-T3-DETERMINISM';
  const grid = q4Grid({ width: 40, height: 20, nx: 4, ny: 2 });
  const restraints = [];
  for (let j = 0; j <= 2; j += 1) {
    restraints.push(mRestraint(`RX${j}`, grid.nodeId(0, j), 'UX'));
    restraints.push(mRestraint(`RY${j}`, grid.nodeId(0, j), 'UY'));
  }
  const model = continuumModel({
    modelIdentity: caseId,
    solverProfile: denseProfile('PLANE_STRESS'),
    nodes: grid.nodes,
    materials: [mMaterial('MAT1', E_STEEL, NU)],
    elements: grid.elements.map((e) => mElement(e.elementId, e.type, e.nodeIds, 'MAT1', 1)),
    restraints,
    loadCases: [mLoadCase('LC1', [mNodalForce('F1', grid.nodeId(4, 2), 0, -500)])],
  });
  return {
    caseId,
    title: 'Repeat solves are bit-identical',
    tier: 'T3_INVARIANT',
    category: 'DETERMINISM',
    kernel: 'element-fea',
    reference: { type: 'INVARIANT', source: 'CORE_SPECIFICATION: no hidden values, no Math.random, no silent switching.' },
    run() {
      const first = solveOrThrow(model, 'LC1');
      const second = solveOrThrow(model, 'LC1');
      return {
        checks: [
          passFail(`${caseId}.RESULT_HASH`, 'Result semantic hash is reproducible',
            first.semanticHash === second.semanticHash,
            `${first.semanticHash} vs ${second.semanticHash}`),
          passFail(`${caseId}.MODEL_HASH`, 'Model semantic hash is reproducible',
            first.modelSemanticHash === second.modelSemanticHash),
        ],
        evidence: { semanticHash: first.semanticHash },
      };
    },
  };
}

/**
 * Sparse Jacobi-PCG scaling characterisation.
 *
 * Jacobi (diagonal) preconditioning does not change the asymptotic condition
 * number of a 2D elasticity operator, so iteration count is expected to grow
 * roughly as O(sqrt(N_dof)). This case records the growth and verifies that
 * the backend still qualifies at the largest declared size.
 */
function sparseScaling() {
  const caseId = 'BM-T3-SPARSE-SCALING';
  const meshes = [[8, 2], [16, 4], [32, 8], [64, 16]];
  return {
    caseId,
    title: 'Sparse Jacobi-PCG iteration scaling and qualification',
    tier: 'T3_INVARIANT',
    category: 'SOLVER',
    kernel: 'element-fea',
    reference: {
      type: 'ENGINEERING_THEORY',
      source: 'PCG iterations ~ O(sqrt(kappa)); for 2D elasticity kappa ~ O(h^-2), so iterations ~ O(sqrt(N_dof)). '
        + 'Jacobi preconditioning does not alter this asymptotic.',
    },
    run() {
      const history = meshes.map(([nx, ny]) => {
        const grid = q4Grid({ width: 100, height: 10, nx, ny });
        const restraints = [];
        for (let j = 0; j <= ny; j += 1) {
          restraints.push(mRestraint(`RX${j}`, grid.nodeId(0, j), 'UX'));
          restraints.push(mRestraint(`RY${j}`, grid.nodeId(0, j), 'UY'));
        }
        const tip = [];
        for (let j = 0; j <= ny; j += 1) tip.push(grid.nodeId(nx, j));
        const model = continuumModel({
          modelIdentity: `${caseId}-${nx}x${ny}`,
          solverProfile: sparseProfile('PLANE_STRESS'),
          nodes: grid.nodes,
          materials: [mMaterial('MAT1', E_STEEL, NU)],
          elements: grid.elements.map((e) => mElement(e.elementId, e.type, e.nodeIds, 'MAT1', 1)),
          restraints,
          loadCases: [mLoadCase('LC1', tip.map((nodeId, index) => mNodalForce(
            `F${index + 1}`, nodeId, 0, -100 / tip.length,
          )))],
        });
        const result = solveOrThrow(model, 'LC1');
        const dof = 2 * grid.nodes.length;
        const iterations = result.iterativeSolverEvidence.iterationCount;
        return { mesh: `${nx}x${ny}`, dof, iterations, iterationsOverSqrtDof: iterations / Math.sqrt(dof) };
      });
      const ratios = history.map((row) => row.iterationsOverSqrtDof);
      const spread = Math.max(...ratios) / Math.min(...ratios);
      return {
        checks: [
          passFail(`${caseId}.QUALIFIED_AT_SCALE`,
            'Sparse backend qualifies at every declared mesh size',
            history.length === meshes.length,
            `largest solved: ${history.at(-1).dof} DOF in ${history.at(-1).iterations} iterations`),
          check({
            checkId: `${caseId}.SQRT_SCALING`,
            quantity: 'Spread of iterations / sqrt(DOF) across four refinements',
            unit: '-', computed: spread, reference: 1,
            tolerance: 2.5, toleranceType: 'ABSOLUTE',
            note: 'Characterises the preconditioner. A spread near 1 confirms the O(sqrt(N)) model. '
              + 'This is a documentation check, not an accuracy claim.',
          }),
        ],
        evidence: { history },
      };
    },
  };
}

/**
 * Solver-profile tolerance coupling hazard.
 *
 * The iterative-solver residual target (`absoluteResidualTolerance`,
 * `relativeResidualTolerance`) and the solver's own acceptance gate
 * (`tolerances.residualForceAbsolute`, `tolerances.residualForceRelative`)
 * are two INDEPENDENT knobs in `lfea-profile/v2`. Nothing in the profile
 * contract requires the first to be tight enough to satisfy the second.
 *
 * This case constructs a profile in which the PCG target is looser than the
 * acceptance gate and verifies that the failure is reported fail-closed. It
 * documents that the diagnostic does NOT currently tell the user that the
 * configuration is unsatisfiable by construction.
 */
function toleranceCoupling() {
  const caseId = 'BM-T3-TOLERANCE-COUPLING';
  return {
    caseId,
    title: 'Unsatisfiable solver-profile tolerance configuration is rejected fail-closed',
    tier: 'T3_INVARIANT',
    category: 'SOLVER',
    kernel: 'element-fea',
    reference: {
      type: 'INVARIANT',
      source: 'A configuration whose iterative target exceeds the acceptance gate can never qualify; '
        + 'the solver must reject rather than return an unqualified result.',
    },
    run() {
      const grid = q4Grid({ width: 100, height: 10, nx: 16, ny: 4 });
      const restraints = [];
      for (let j = 0; j <= 4; j += 1) {
        restraints.push(mRestraint(`RX${j}`, grid.nodeId(0, j), 'UX'));
        restraints.push(mRestraint(`RY${j}`, grid.nodeId(0, j), 'UY'));
      }
      const profile = sparseProfile('PLANE_STRESS', {
        absoluteResidualTolerance: 1e-2,     // deliberately loose iterative target
        relativeResidualTolerance: 1e-2,
      });
      profile.tolerances = {
        ...profile.tolerances,
        residualForceAbsolute: 1e-12,        // deliberately tight acceptance gate
        residualForceRelative: 1e-14,
      };
      const model = continuumModel({
        modelIdentity: caseId,
        solverProfile: profile,
        nodes: grid.nodes,
        materials: [mMaterial('MAT1', E_STEEL, NU)],
        elements: grid.elements.map((e) => mElement(e.elementId, e.type, e.nodeIds, 'MAT1', 1)),
        restraints,
        loadCases: [mLoadCase('LC1', [mNodalForce('F1', grid.nodeId(16, 2), 0, -100)])],
      });
      const result = solveContinuumModel(model, 'LC1');
      const code = result.diagnostics?.[0]?.code ?? null;
      const message = result.diagnostics?.[0]?.message ?? '';
      const explainsCoupling = /toleran|unsatisfiab|profile|target/i.test(message)
        && /gate|acceptance|configur/i.test(message);
      return {
        checks: [
          passFail(`${caseId}.FAIL_CLOSED`,
            'An unsatisfiable tolerance configuration does not produce a qualified result',
            result.status !== 'QUALIFIED',
            `status = ${result.status}, code = ${code}`),
          passFail(`${caseId}.NO_PARTIAL_EVIDENCE`,
            'No displacement or stress evidence is published for the rejected solve',
            !result.nodalDisplacements && !result.elementStresses && !result.integrationPointResults),
          passFail(`${caseId}.DIAGNOSTIC_EXPLAINS_CAUSE`,
            'The diagnostic tells the user the profile configuration is unsatisfiable',
            explainsCoupling,
            `Observed diagnostic: "${code}: ${message}". `
            + 'A generic residual-failure message does not tell the user their PROFILE is at fault, '
            + 'so this check is expected to FAIL until the profile validates tolerance coupling.'),
        ],
        evidence: { status: result.status, diagnosticCode: code, diagnosticMessage: message },
      };
    },
  };
}

/* ================================================================== */
/* Registry                                                           */
/* ================================================================== */

/**
 * Every kernel-level verification case, in deterministic order.
 *
 * @returns {Array<Record<string, unknown>>} Case definitions.
 */
export function kernelBenchmarkCases() {
  return [
    patchTest('BM-T1-PATCH-Q4-REGULAR', 'Q4', false, 'PLANE_STRESS'),
    patchTest('BM-T1-PATCH-Q4-DISTORTED', 'Q4', true, 'PLANE_STRESS'),
    patchTest('BM-T1-PATCH-T3-REGULAR', 'T3', false, 'PLANE_STRESS'),
    patchTest('BM-T1-PATCH-T3-DISTORTED', 'T3', true, 'PLANE_STRESS'),
    patchTest('BM-T1-PATCH-Q4-PLANE-STRAIN', 'Q4', true, 'PLANE_STRAIN'),
    uniaxialTension(),
    planeStrainSigmaZ(),
    thickCylinderLame(),
    cantileverLocking(),
    rigidBodyTranslation(),
    backendEquivalence(),
    determinism(),
    sparseScaling(),
    toleranceCoupling(),
  ];
}
