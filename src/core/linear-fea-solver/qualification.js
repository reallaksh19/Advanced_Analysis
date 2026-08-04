import { sparseMultiply } from '../lafea-linear-solve/sparse-matrix.js';
import { DOF_ORDER } from '../linear-fea-contract/conventions.js';
import { dot, matVec, norm2 } from './linear-algebra.js';
import { QUALIFICATION_STATUSES } from './solver-contract.js';

/**
 * Section 8.1 numerical qualification. Every gate here reads its limit from
 * the resolved solver profile (`policies`) — none is a literal in this file —
 * and every check returns the raw value alongside the limit(s) it was judged
 * against, so a reviewer can recompute the verdict without trusting the label.
 */

function gate(checkId, value, limit, warnLimit) {
  let status;
  if (value <= limit) status = 'PASS';
  else if (warnLimit !== undefined && value <= warnLimit) status = 'WARN';
  else status = 'BLOCK';
  return { checkId, value, limit, status };
}

function nodeVectorAt(vector, dofMap, nodeId) {
  const nodeIndex = dofMap.nodeOrder.indexOf(nodeId);
  const base = nodeIndex * DOF_ORDER.length;
  return {
    force: { x: vector[base], y: vector[base + 1], z: vector[base + 2] },
    moment: { x: vector[base + 3], y: vector[base + 4], z: vector[base + 5] },
  };
}

function multiply({ K, sparseK, n, vector }) {
  if (sparseK !== undefined) return sparseMultiply(sparseK, vector);
  return matVec(K, n, vector);
}

/**
 * Grounded LINEAR_SPRING constraints are assembled into K, but their force on
 * the structure is external support action rather than an internal member
 * force. Remove Kspring*u from K*u before summing the structural free body.
 */
function includeGroundSpringSupport({ model, dofMap, Ufull, combined }) {
  const adjusted = [...combined];
  const nodeIndex = new Map(dofMap.nodeOrder.map((nodeId, index) => [nodeId, index]));
  const dofIndex = new Map(DOF_ORDER.map((dof, index) => [dof, index]));
  for (const constraint of model.constraints) {
    if (constraint.behavior !== 'LINEAR_SPRING') continue;
    const globalIndex = nodeIndex.get(constraint.nodeId) * DOF_ORDER.length + dofIndex.get(constraint.dof);
    adjusted[globalIndex] -= constraint.stiffness * Ufull[globalIndex];
  }
  return adjusted;
}

/**
 * Section 8.1 "Algebraic residual": normalized residual of the solved
 * free-free system, `||Kff Uf - Ffree|| / max(||Ffree||, floor)`.
 */
export function residualCheck({ Kff, sparseKff, m, Uf, Ffree, policies }) {
  const predicted = multiply({ K: Kff, sparseK: sparseKff, n: m, vector: Uf });
  const residual = predicted.map((value, index) => value - Ffree[index]);
  const reference = Math.max(norm2(Ffree), Number.MIN_VALUE);
  const normalizedResidual = norm2(residual) / reference;
  const result = gate(
    'ALGEBRAIC_RESIDUAL_NORMALIZED',
    normalizedResidual,
    policies.normalizedResidualLimit.value,
    policies.normalizedResidualWarnLimit.value,
  );
  return { ...result, limitSource: policies.normalizedResidualLimit.source };
}

/**
 * Section 8.1 "Global force equilibrium": sum the structural free body.
 * Grounded spring stiffness is assembled into K, so its `Kspring*u` term is
 * removed from `K*u`; the corresponding `-Kspring*u` is the external support
 * force. Element forces then cancel internally and the retained sum is applied
 * load plus fixed and spring support actions.
 */
export function forceEquilibriumCheck({
  model,
  dofMap,
  K,
  sparseK,
  n,
  Ufull,
  Ffull,
  policies,
}) {
  const combined = includeGroundSpringSupport({
    model,
    dofMap,
    Ufull,
    combined: multiply({ K, sparseK, n, vector: Ufull }),
  });
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let referenceMagnitude = 0;
  for (const node of model.nodes) {
    const { force } = nodeVectorAt(combined, dofMap, node.nodeId);
    const { force: applied } = nodeVectorAt(Ffull, dofMap, node.nodeId);
    sumX += force.x;
    sumY += force.y;
    sumZ += force.z;
    referenceMagnitude += Math.hypot(applied.x, applied.y, applied.z);
  }
  const imbalance = Math.hypot(sumX, sumY, sumZ);
  const reference = Math.max(referenceMagnitude, policies.equilibriumAbsoluteForceFloor.value);
  const relativeImbalance = imbalance / reference;
  const result = gate('GLOBAL_FORCE_EQUILIBRIUM_RELATIVE', relativeImbalance, policies.equilibriumRelativeLimit.value);
  return { ...result, limitSource: policies.equilibriumRelativeLimit.source, imbalance };
}

/**
 * Section 8.1 "Global moment equilibrium", about the retained reference point
 * (`MOMENT_REFERENCE_RULE`: the first node in canonical ascending order).
 */
export function momentEquilibriumCheck({
  model,
  dofMap,
  K,
  sparseK,
  n,
  Ufull,
  Ffull,
  policies,
}) {
  const combined = includeGroundSpringSupport({
    model,
    dofMap,
    Ufull,
    combined: multiply({ K, sparseK, n, vector: Ufull }),
  });
  const referenceNodeId = dofMap.nodeOrder[0];
  const referencePosition = model.nodes.find((node) => node.nodeId === referenceNodeId).position;

  let momentX = 0;
  let momentY = 0;
  let momentZ = 0;
  let referenceMagnitude = 0;
  for (const node of model.nodes) {
    const { force, moment } = nodeVectorAt(combined, dofMap, node.nodeId);
    const { force: appliedForce, moment: appliedMoment } = nodeVectorAt(Ffull, dofMap, node.nodeId);
    const r = {
      x: node.position.x - referencePosition.x,
      y: node.position.y - referencePosition.y,
      z: node.position.z - referencePosition.z,
    };
    momentX += (r.y * force.z - r.z * force.y) + moment.x;
    momentY += (r.z * force.x - r.x * force.z) + moment.y;
    momentZ += (r.x * force.y - r.y * force.x) + moment.z;
    referenceMagnitude += Math.hypot(appliedForce.x, appliedForce.y, appliedForce.z)
      * Math.hypot(r.x, r.y, r.z) + Math.hypot(appliedMoment.x, appliedMoment.y, appliedMoment.z);
  }
  const imbalance = Math.hypot(momentX, momentY, momentZ);
  const reference = Math.max(referenceMagnitude, policies.equilibriumAbsoluteMomentFloor.value);
  const relativeImbalance = imbalance / reference;
  const result = gate('GLOBAL_MOMENT_EQUILIBRIUM_RELATIVE', relativeImbalance, policies.equilibriumRelativeLimit.value);
  return {
    ...result,
    limitSource: policies.equilibriumRelativeLimit.source,
    imbalance,
    referenceNodeId,
    referenceRule: 'FIRST_CANONICAL_NODE_V1',
  };
}

/**
 * Section 8.1 "Energy balance": internal strain energy `0.5 U^T K U` against
 * external work `0.5 U^T (F + R)`, which the reaction convention `R = K U - F`
 * makes an identity up to solver residual — a second, independently-combined
 * check on the same solved state rather than a restatement of the residual.
 */
export function energyBalanceCheck({ K, sparseK, n, Ufull, Ffull, policies }) {
  const KU = multiply({ K, sparseK, n, vector: Ufull });
  const internalEnergy = 0.5 * dot(Ufull, KU);
  const externalWork = 0.5 * dot(Ufull, Ffull) + 0.5 * dot(Ufull, KU.map((value, index) => value - Ffull[index]));
  const reference = Math.max(Math.abs(internalEnergy), Math.abs(externalWork), Number.MIN_VALUE);
  const relativeMismatch = Math.abs(internalEnergy - externalWork) / reference;
  const result = gate('ENERGY_BALANCE_RELATIVE', relativeMismatch, policies.energyBalanceLimit.value);
  return { ...result, limitSource: policies.energyBalanceLimit.source, internalEnergy, externalWork };
}

/**
 * Section 8.1 "Conditioning": always reported; warning/block thresholds are
 * solver-profile fields.
 */
export function conditioningReport(conditionEstimate, policies) {
  const result = gate('CONDITION_ESTIMATE', conditionEstimate, policies.conditionWarning.value, policies.conditionBlock.value);
  /* gate() treats its second limit as WARN; conditioning needs the opposite sense (below warn = PASS, between warn and block = WARN, above block = BLOCK), which is exactly what gate() already computes when passed (warning, block) in that order. */
  return { ...result, limitSource: policies.conditionWarning.source, blockLimit: policies.conditionBlock.value, blockLimitSource: policies.conditionBlock.source };
}

export function worstStatus(results) {
  if (results.some((entry) => entry.status === 'BLOCK')) return 'BLOCK';
  if (results.some((entry) => entry.status === 'WARN')) return 'WARN';
  return 'PASS';
}

export { QUALIFICATION_STATUSES };
