import { DOF_ORDER } from '../src/core/linear-fea-contract/conventions.js';
import { compareValue, indexNodeDofVector, passRate } from './lfea-m043-bm4-ladder-fixtures.mjs';
import {
  M044_NODE_LEVEL_POLICY,
  caesarDisplacementSI,
  caesarNodalReactionSI,
} from './lfea-m044-bm4nl-fixtures.mjs';

// M044 node-level comparison. Unlike M043's L2 (one global 6-vector sum),
// this compares EVERY restrained node's own reaction individually, and every
// shared node's own displacement individually -- the "systematic, traceable
// nodal-level breakdown" the causal-order ladder work was built to produce,
// applied to BM4_NL specifically.

const FORCE_DOFS = Object.freeze(['UX', 'UY', 'UZ']);
const MOMENT_DOFS = Object.freeze(['RX', 'RY', 'RZ']);

function floorFor(dof, policy) {
  return FORCE_DOFS.includes(dof) ? policy.forceFloorNewtons : policy.momentFloorNewtonMetres;
}

/**
 * Per-node restraint reaction parity for one BM4_NL case. Restricted to nodes
 * CAESAR itself reports as restrained (OUTPUT_RESTRAINTS_SUMMARY), which is
 * the correct comparison domain: a free node has no CAESAR reaction to check
 * against, and comparing it to zero would just restate DOF_ORDER.
 */
export function auditNodalReactionParity(cii, lfeaExecution, caseLabel) {
  const caesar = caesarNodalReactionSI(cii, caseLabel);
  const lfea = indexNodeDofVector(lfeaExecution.reactions);
  const policy = M044_NODE_LEVEL_POLICY.reaction;
  const rows = [];
  for (const [nodeId, reference] of caesar) {
    for (const dof of DOF_ORDER) {
      const ours = lfea.get(`${nodeId}|${dof}`) ?? 0;
      const comparison = compareValue(ours, reference[dof], { floor: floorFor(dof, policy), tolerancePercent: policy.targetTolerancePercent });
      rows.push(Object.freeze({ nodeId, dof, ...comparison }));
    }
  }
  const byNode = new Map();
  for (const row of rows) {
    if (!byNode.has(row.nodeId)) byNode.set(row.nodeId, []);
    byNode.get(row.nodeId).push(row);
  }
  const nodeSummaries = [...byNode.entries()].map(([nodeId, nodeRows]) => Object.freeze({
    nodeId,
    passed: nodeRows.every((row) => row.passed),
    worst: nodeRows.reduce((worst, row) => (
      row.percentDifference !== null && Math.abs(row.percentDifference) > Math.abs(worst?.percentDifference ?? 0) ? row : worst
    ), null),
    rows: Object.freeze(nodeRows),
  }));
  return Object.freeze({
    level: 'L_NODAL_REACTION',
    caseLabel,
    comparisonSurface: 'CAESAR_REPORTED_RESTRAINT_NODES_ONLY_PER_DOF',
    signConvention: 'M044_REACTION_SIGN_CONVENTION',
    restrainedNodeCount: byNode.size,
    summary: passRate(rows),
    nodeSummary: passRate(nodeSummaries),
    failingNodes: Object.freeze(nodeSummaries.filter((node) => !node.passed).sort((a, b) => Math.abs(b.worst?.percentDifference ?? 0) - Math.abs(a.worst?.percentDifference ?? 0))),
    nodeSummaries: Object.freeze(nodeSummaries),
  });
}

/** Per-node, per-DOF displacement parity for one BM4_NL case, shared nodes only. */
export function auditNodalDisplacementParity(cii, lfeaExecution, caseLabel) {
  const caesar = caesarDisplacementSI(cii, caseLabel);
  const lfea = indexNodeDofVector(lfeaExecution.displacement);
  const policy = M044_NODE_LEVEL_POLICY.displacement;
  const rows = [];
  for (const [nodeId, reference] of caesar) {
    for (const dof of DOF_ORDER) {
      const ours = lfea.get(`${nodeId}|${dof}`);
      if (ours === undefined) continue;
      const floor = dof.startsWith('U') ? policy.translationFloorMetres : policy.rotationFloorRadians;
      const comparison = compareValue(ours, reference[dof], { floor, tolerancePercent: policy.targetTolerancePercent });
      rows.push(Object.freeze({ nodeId, dof, ...comparison }));
    }
  }
  return Object.freeze({
    level: 'L_NODAL_DISPLACEMENT',
    caseLabel,
    comparisonSurface: 'SHARED_PHYSICAL_NODES_ONLY_NO_INTERPOLATION',
    matchedNodeCount: new Set(rows.map((row) => row.nodeId)).size,
    summary: passRate(rows),
  });
}
