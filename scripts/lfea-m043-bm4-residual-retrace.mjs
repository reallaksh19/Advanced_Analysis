import {
  DOF_ORDER,
  ELEMENT_DOF_ORDER,
} from '../src/core/linear-fea-contract/conventions.js';
import {
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { BM4_SOLVER_CONDITIONING_PROFILE } from './lfea-m034-bm4-solve-fixtures.mjs';
import {
  M043_LADDER_POLICY,
  indexNodeDofVector,
} from './lfea-m043-bm4-ladder-fixtures.mjs';

// M043 L4: residual retrace -- the level that maps an output-side disagreement
// back onto specific rows of the stiffness matrix and load vector.
//
// The identity: CAESAR's displacement vector satisfies CAESAR's own system,
// K_caesar * u_caesar = F_caesar. Push that same displacement through LFEA's
// stiffness and loads and form
//
//     r = K_lfea * u_caesar - F_lfea
//
// If LFEA's K and F matched CAESAR's, r would vanish at every free DOF. It does
// not vanish, and WHERE it does not vanish is the diagnosis: r is an
// out-of-balance force, in newtons and newton-metres, attributable to individual
// DOFs and -- because it is assembled element by element -- to individual
// elements. That is the retrace. No element-force comparison can do this,
// because element forces are computed FROM u and so are consistent with
// whatever K produced them.
//
// Assembly convention is taken from the solver itself, not re-derived here:
// assembly.js accumulates elementLoad[i] += equivalentLoadGlobal[i] +
// initialStrainLoadGlobal[i], solve.js then adds NODAL_FORCE_MOMENT primitives
// into the same vector, and forms reactions as KU - Ffull. This module
// reproduces that exact convention so its residual is the solver's residual.

const DOF_COUNT = DOF_ORDER.length;
const ELEMENT_DOF_COUNT = ELEMENT_DOF_ORDER.length;

function key(nodeId, dof) {
  return `${nodeId}|${dof}`;
}

/** Element geometry, stiffness and load contributions, indexed by element. */
export function buildElementIndex(analysis) {
  const contributions = new Map();
  for (const contribution of [
    ...analysis.frames.map(elementContributionFromFrameElement),
    ...analysis.pipingComponents.flatMap(elementContributionsFromPipingComponent),
  ]) {
    contributions.set(contribution.elementId, contribution);
  }
  const positions = new Map(analysis.compilation.model.nodes.map((node) => [node.nodeId, node.position]));
  const elements = analysis.compilation.model.elements.map((element) => {
    const contribution = contributions.get(element.elementId);
    if (!contribution) throw new Error(`M043 element ${element.elementId} has no assembled contribution.`);
    const from = positions.get(element.nodeI);
    const to = positions.get(element.nodeJ);
    const span = [to.x - from.x, to.y - from.y, to.z - from.z];
    const length = Math.hypot(...span);
    return Object.freeze({
      elementId: element.elementId,
      nodeI: element.nodeI,
      nodeJ: element.nodeJ,
      length,
      axis: Object.freeze(length > 0 ? span.map((value) => value / length) : [0, 0, 0]),
      globalStiffness: contribution.globalStiffness,
      elementLoadGlobal: Object.freeze(contribution.equivalentLoadGlobal.map(
        (value, index) => value + contribution.initialStrainLoadGlobal[index],
      )),
    });
  });
  const elementsByNode = new Map();
  for (const element of elements) {
    for (const nodeId of [element.nodeI, element.nodeJ]) {
      if (!elementsByNode.has(nodeId)) elementsByNode.set(nodeId, []);
      elementsByNode.get(nodeId).push(element);
    }
  }
  return Object.freeze({ elements: Object.freeze(elements), elementsByNode });
}

/** Directly applied nodal point loads, in the global frame. */
function nodalPointLoads(loadCase) {
  const loads = new Map();
  for (const primitive of loadCase.primitives) {
    if (primitive.kind !== 'NODAL_FORCE_MOMENT') continue;
    if (primitive.basis.kind !== 'GLOBAL') {
      throw new Error(`M043 retrace does not resolve a ${primitive.basis.kind} nodal load basis; it would have to invent the transform.`);
    }
    const values = [
      primitive.force.fx, primitive.force.fy, primitive.force.fz,
      primitive.moment.mx, primitive.moment.my, primitive.moment.mz,
    ];
    DOF_ORDER.forEach((dof, index) => {
      const at = key(primitive.nodeId, dof);
      loads.set(at, (loads.get(at) ?? 0) + values[index]);
    });
  }
  return loads;
}

/**
 * Assemble K*u and F for a supplied displacement field, element by element.
 *
 * Per-element attribution is retained because it is the whole point: a residual
 * at a node is only actionable once you know which element put it there.
 */
export function assembleResidual({ elementIndex, loadCase, displacement, displacementPrecision = null }) {
  const ku = new Map();
  const f = new Map();
  const noise = new Map();
  const perElement = new Map();
  const missingDisplacement = new Set();

  // Worst-case propagated precision of each supplied displacement component.
  // Only populated when the displacement field came from an external authority;
  // LFEA's own vector is exact in the retrace's own arithmetic.
  const precisionByLocalIndex = displacementPrecision === null ? null
    : Array.from({ length: ELEMENT_DOF_COUNT }, (unused, index) => (
      index % DOF_COUNT < 3
        ? displacementPrecision.translationMetres
        : displacementPrecision.rotationRadians
    ));

  for (const [at, value] of nodalPointLoads(loadCase)) f.set(at, value);

  for (const element of elementIndex.elements) {
    const ends = [element.nodeI, element.nodeJ];
    const local = [];
    let complete = true;
    for (const nodeId of ends) {
      for (const dof of DOF_ORDER) {
        const value = displacement.get(key(nodeId, dof));
        if (value === undefined) { complete = false; missingDisplacement.add(nodeId); }
        local.push(value ?? 0);
      }
    }
    // Accumulate the element load unconditionally: F does not depend on u, and
    // dropping it for an incomplete element would corrupt neighbouring nodes.
    ends.forEach((nodeId, endIndex) => {
      DOF_ORDER.forEach((dof, dofIndex) => {
        const at = key(nodeId, dof);
        f.set(at, (f.get(at) ?? 0) + element.elementLoadGlobal[endIndex * DOF_COUNT + dofIndex]);
      });
    });
    if (!complete) continue;
    const product = new Array(ELEMENT_DOF_COUNT).fill(0);
    const productNoise = new Array(ELEMENT_DOF_COUNT).fill(0);
    for (let row = 0; row < ELEMENT_DOF_COUNT; row += 1) {
      let total = 0;
      let bound = 0;
      for (let column = 0; column < ELEMENT_DOF_COUNT; column += 1) {
        const stiffness = element.globalStiffness[row * ELEMENT_DOF_COUNT + column];
        total += stiffness * local[column];
        // Worst-case error propagation: every rounding error aligned.
        if (precisionByLocalIndex) bound += Math.abs(stiffness) * precisionByLocalIndex[column];
      }
      product[row] = total;
      productNoise[row] = bound;
    }
    ends.forEach((nodeId, endIndex) => {
      DOF_ORDER.forEach((dof, dofIndex) => {
        const at = key(nodeId, dof);
        const localRow = endIndex * DOF_COUNT + dofIndex;
        ku.set(at, (ku.get(at) ?? 0) + product[localRow]);
        if (precisionByLocalIndex) noise.set(at, (noise.get(at) ?? 0) + productNoise[localRow]);
        if (!perElement.has(element.elementId)) perElement.set(element.elementId, []);
        perElement.get(element.elementId).push({ nodeId, dof, kuShare: product[localRow] });
      });
    });
  }

  const residual = new Map();
  for (const at of new Set([...ku.keys(), ...f.keys()])) {
    residual.set(at, (ku.get(at) ?? 0) - (f.get(at) ?? 0));
  }
  return Object.freeze({ ku, f, residual, noise, perElement, missingDisplacement });
}

/**
 * Prove the retrace before trusting it.
 *
 * Feeding LFEA's own displacement vector back through LFEA's own stiffness and
 * loads must reproduce two things the solver already reported independently:
 * a vanishing residual at free DOFs, and the reaction vector at constrained
 * DOFs. Together these pin the sign convention, the DOF ordering, the row-major
 * matrix layout and the load-assembly rule. A retrace that cannot reproduce the
 * solver's own reactions has no business being pointed at CAESAR's data, so this
 * is a gate rather than a report.
 */
export function selfTestRetrace(analysis, elementIndex) {
  const own = indexNodeDofVector(analysis.execution.displacement);
  const assembled = assembleResidual({ elementIndex, loadCase: analysis.loadCase, displacement: own });
  const constrained = new Map(analysis.execution.reactions.map((row) => [key(row.nodeId, row.dof), row.value]));
  const loadScale = Math.max(...[...assembled.f.values()].map(Math.abs), 1);

  let worstFreeResidual = 0;
  let worstFreeAt = null;
  for (const [at, value] of assembled.residual) {
    if (constrained.has(at)) continue;
    if (Math.abs(value) > Math.abs(worstFreeResidual)) { worstFreeResidual = value; worstFreeAt = at; }
  }

  let worstReactionRelative = 0;
  let worstReactionAt = null;
  for (const [at, reported] of constrained) {
    const retraced = assembled.residual.get(at) ?? 0;
    const scale = Math.max(Math.abs(reported), M043_LADDER_POLICY.retraceSelfTest.reactionAbsoluteFloorNewtons);
    const relative = Math.abs(retraced - reported) / scale;
    if (relative > worstReactionRelative) { worstReactionRelative = relative; worstReactionAt = at; }
  }

  const policy = M043_LADDER_POLICY.retraceSelfTest;
  const freeNormalized = Math.abs(worstFreeResidual) / loadScale;
  // The free-DOF imbalance IS the solve's algebraic residual, so the bar is the
  // model's own declared conditioning envelope rather than a number chosen here.
  const freeDofLimit = BM4_SOLVER_CONDITIONING_PROFILE.normalizedResidualWarnLimit.value;
  const solverReportedResidual = analysis.execution.diagnostics.residual.value;
  const freePassed = freeNormalized <= freeDofLimit;
  const reactionPassed = worstReactionRelative <= policy.reactionRelativeLimit;
  return Object.freeze({
    level: 'L4',
    name: 'RESIDUAL_RETRACE_SELF_TEST',
    purpose: 'PROVE_SIGN_CONVENTION_DOF_ORDERING_AND_LOAD_ASSEMBLY_BEFORE_TRUSTING_ANY_CROSS_TOOL_RETRACE',
    loadScale,
    constrainedDofCount: constrained.size,
    freeDofWorstResidual: worstFreeResidual,
    freeDofWorstAt: worstFreeAt,
    freeDofWorstNormalized: freeNormalized,
    freeDofLimit,
    freeDofLimitSource: policy.freeDofLimitSource,
    solverReportedNormalizedResidual: solverReportedResidual,
    // Near 1 means the retrace reproduces the solver's own residual rather than
    // manufacturing one of its own, which is the real evidence of faithfulness.
    freeDofToSolverResidualRatio: solverReportedResidual > 0
      ? freeNormalized / solverReportedResidual
      : null,
    freeDofPassed: freePassed,
    reactionWorstRelative: worstReactionRelative,
    reactionWorstAt: worstReactionAt,
    reactionLimit: policy.reactionRelativeLimit,
    reactionPassed,
    // The reaction gate is the integrity test; the free-DOF gate is an inherited
    // conditioning bound. Both must hold, and they are reported separately so a
    // conditioning-driven result is never mistaken for an assembly defect.
    status: freePassed && reactionPassed ? 'QUALIFIED' : 'BLOCKED',
  });
}
