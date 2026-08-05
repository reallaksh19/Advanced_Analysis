import {
  EMPIRICAL_FORMULA_IDS,
  EMPIRICAL_PIPING_METHOD_ID,
  EMPIRICAL_PIPING_SCHEMAS,
  PLANAR_DOF_ORDER,
  deepFreeze,
  requireFiniteNumber,
  requireNonEmptyString,
} from './contracts.js';
import { zeros } from './matrix.js';
import { solveScaledDenseSystem } from './linear-system.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';
import { semanticHash } from './identity.js';

const DOF_OFFSET = Object.freeze({ UX: 0, UY: 1, RZ: 2 });

function canonicalNodes(nodes) {
  const sorted = [...nodes].map(node => ({
    id: requireNonEmptyString(node.id, 'node.id'),
    xM: requireFiniteNumber(node.xM, `node.${node.id}.xM`),
    yM: requireFiniteNumber(node.yM, `node.${node.id}.yM`),
  })).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(sorted.map(node => node.id)).size !== sorted.length) {
    throw empiricalFailure(EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID, 'Duplicate node IDs are not allowed.');
  }
  return sorted;
}

function dofIndex(nodeIndex, dof) {
  const offset = DOF_OFFSET[dof];
  if (offset === undefined) throw new TypeError(`Unsupported planar DOF: ${dof}`);
  return (3 * nodeIndex) + offset;
}

function memberDofIndices(member, nodeIndexById) {
  const i = nodeIndexById.get(member.nodeIId);
  const j = nodeIndexById.get(member.nodeJId);
  if (i === undefined || j === undefined) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      `Member ${member.id} references an unknown node.`,
    );
  }
  return [
    dofIndex(i, 'UX'), dofIndex(i, 'UY'), dofIndex(i, 'RZ'),
    dofIndex(j, 'UX'), dofIndex(j, 'UY'), dofIndex(j, 'RZ'),
  ];
}

export function assemblePlanarSystem(input) {
  const nodes = canonicalNodes(input.nodes ?? []);
  if (nodes.length === 0) {
    throw empiricalFailure(EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID, 'At least one node is required.');
  }
  const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index]));
  const members = [...(input.members ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const order = nodes.length * 3;
  const stiffness = zeros(order);
  const load = Array(order).fill(0);
  const memberAssembly = [];

  for (const member of members) {
    const indices = memberDofIndices(member, nodeIndexById);
    for (let localI = 0; localI < 6; localI += 1) {
      load[indices[localI]] += member.globalEquivalentLoad[localI];
      for (let localJ = 0; localJ < 6; localJ += 1) {
        stiffness[indices[localI]][indices[localJ]] += member.globalStiffness[localI][localJ];
      }
    }
    memberAssembly.push({ memberId: member.id, dofIndices: indices });
  }

  const nodalLoads = [...(input.nodalLoads ?? [])].sort((a, b) => {
    const nodeOrder = a.nodeId.localeCompare(b.nodeId);
    return nodeOrder || String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
  for (const nodalLoad of nodalLoads) {
    const nodeIndex = nodeIndexById.get(nodalLoad.nodeId);
    if (nodeIndex === undefined) {
      throw empiricalFailure(
        EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
        `Nodal load references unknown node ${nodalLoad.nodeId}.`,
      );
    }
    load[dofIndex(nodeIndex, 'UX')] += requireFiniteNumber(nodalLoad.xN ?? 0, 'nodalLoad.xN');
    load[dofIndex(nodeIndex, 'UY')] += requireFiniteNumber(nodalLoad.yN ?? 0, 'nodalLoad.yN');
    load[dofIndex(nodeIndex, 'RZ')] += requireFiniteNumber(
      nodalLoad.momentNm ?? 0,
      'nodalLoad.momentNm',
    );
  }

  const constraints = [...(input.constraints ?? [])].map(constraint => {
    const nodeIndex = nodeIndexById.get(constraint.nodeId);
    if (nodeIndex === undefined) {
      throw empiricalFailure(
        EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
        `Constraint references unknown node ${constraint.nodeId}.`,
      );
    }
    return {
      id: requireNonEmptyString(constraint.id, 'constraint.id'),
      nodeId: constraint.nodeId,
      dof: constraint.dof,
      prescribedValue: requireFiniteNumber(constraint.prescribedValue ?? 0, 'prescribedValue'),
      dofIndex: dofIndex(nodeIndex, constraint.dof),
      capability: constraint.capability ?? 'BILATERAL',
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const constrainedDofs = new Map();
  for (const constraint of constraints) {
    const previous = constrainedDofs.get(constraint.dofIndex);
    if (previous && previous.prescribedValue !== constraint.prescribedValue) {
      throw empiricalFailure(
        EMPIRICAL_FAILURE_CODES.SUPPORT_CAPABILITY_UNKNOWN,
        `Conflicting prescribed values exist at DOF ${constraint.dofIndex}.`,
      );
    }
    constrainedDofs.set(constraint.dofIndex, constraint);
  }

  const freeDofIndices = [];
  const constrainedDofIndices = [];
  for (let index = 0; index < order; index += 1) {
    if (constrainedDofs.has(index)) constrainedDofIndices.push(index);
    else freeDofIndices.push(index);
  }

  const identityInput = {
    method: EMPIRICAL_PIPING_METHOD_ID,
    nodes,
    members: members.map(member => member.semanticIdentity),
    nodalLoads,
    constraints,
  };
  return deepFreeze({
    method: EMPIRICAL_PIPING_METHOD_ID,
    nodes,
    nodeIndexById: Object.fromEntries(nodeIndexById),
    members,
    memberAssembly,
    nodalLoads,
    stiffness,
    load,
    constraints,
    freeDofIndices,
    constrainedDofIndices,
    semanticIdentity: semanticHash(identityInput),
  });
}

export function solveAssembledPlanarSystem(assembled, options = {}) {
  const fullDisplacement = Array(assembled.load.length).fill(0);
  for (const constraint of assembled.constraints) {
    fullDisplacement[constraint.dofIndex] = constraint.prescribedValue;
  }

  let numericalEvidence;
  if (assembled.freeDofIndices.length > 0) {
    const reducedStiffness = assembled.freeDofIndices.map(rowIndex => (
      assembled.freeDofIndices.map(columnIndex => assembled.stiffness[rowIndex][columnIndex])
    ));
    const reducedLoad = assembled.freeDofIndices.map(rowIndex => {
      let value = assembled.load[rowIndex];
      for (const constrainedIndex of assembled.constrainedDofIndices) {
        value -= assembled.stiffness[rowIndex][constrainedIndex] * fullDisplacement[constrainedIndex];
      }
      return value;
    });
    numericalEvidence = solveScaledDenseSystem(reducedStiffness, reducedLoad, options);
    assembled.freeDofIndices.forEach((fullIndex, reducedIndex) => {
      fullDisplacement[fullIndex] = numericalEvidence.solution[reducedIndex];
    });
  } else {
    numericalEvidence = deepFreeze({
      solution: [],
      residual: [],
      scaledResidual: 0,
      scales: [],
      pivots: [],
      pivotTolerance: 0,
      reciprocalConditionEstimate: 1,
    });
  }

  const fullResidual = assembled.stiffness.map((row, rowIndex) => (
    row.reduce((sum, value, columnIndex) => sum + (value * fullDisplacement[columnIndex]), 0)
      - assembled.load[rowIndex]
  ));
  const displacementByNode = {};
  assembled.nodes.forEach((node, nodeIndex) => {
    displacementByNode[node.id] = deepFreeze({
      uxM: fullDisplacement[dofIndex(nodeIndex, 'UX')],
      uyM: fullDisplacement[dofIndex(nodeIndex, 'UY')],
      rzRad: fullDisplacement[dofIndex(nodeIndex, 'RZ')],
    });
  });
  const reactionByConstraint = {};
  for (const constraint of assembled.constraints) {
    reactionByConstraint[constraint.id] = fullResidual[constraint.dofIndex];
  }
  const resultCore = {
    schema: EMPIRICAL_PIPING_SCHEMAS.planarResult,
    method: EMPIRICAL_PIPING_METHOD_ID,
    assembledIdentity: assembled.semanticIdentity,
    fullDisplacement,
    displacementByNode,
    reactionByConstraint,
    fullResidual,
    numericalEvidence,
    dofOrder: PLANAR_DOF_ORDER,
    formulaTrace: [EMPIRICAL_FORMULA_IDS.forceClosure, EMPIRICAL_FORMULA_IDS.momentClosure],
  };
  return deepFreeze({ ...resultCore, semanticIdentity: semanticHash(resultCore) });
}

export function solvePlanarSystem(input, options = {}) {
  return solveAssembledPlanarSystem(assemblePlanarSystem(input), options);
}
