import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { ELEMENT_DOF_ORDER } from '../linear-fea-contract/conventions.js';
import { dofIndexOf } from './dof-map.js';
import { requireElementContribution } from './element-contributions.js';
import { compareAscii, fail, requirePositive } from './solver-contract.js';

const CODE = 'SOLVER_ASSEMBLY_INVALID';

const LOCAL_DOF_REFERENCES = ELEMENT_DOF_ORDER.map((token) => {
  const [end, dof] = token.split(':');
  return { end, dof };
});

/**
 * Section 8 Assembly: deterministic symmetric sparse triplets, duplicate
 * contributions summed in canonical order.
 *
 * Every element contribution and every declared spring becomes one or more
 * `(row, col, value)` triplets. Triplets are sorted by `(row, col, tag)`
 * before anything is summed, so the accumulated value at a shared DOF never
 * depends on `Map`/object iteration order or on the order elements were
 * passed in — only on the row/column identity and, as a last tie-break, the
 * contributing element or constraint identity.
 *
 * @param {object} model Sealed `fea-linear-model/v1` (for nodeI/nodeJ per element and constraints).
 * @param {Readonly<object>} dofMap Section 8 DOF map.
 * @param {Array<object>} elementContributions Normalized element contributions.
 * @returns {{triplets: Array<object>, elementLoad: Array<number>, elementIds: Array<string>}}
 */
function buildElementTriplets(model, dofMap, elementContributions) {
  const elementsById = new Map(model.elements.map((element) => [element.elementId, element]));
  const contributionsById = new Map();
  for (const contribution of elementContributions) {
    const accepted = requireElementContribution(contribution);
    if (contributionsById.has(accepted.elementId)) {
      fail(`elementContributions declares ${accepted.elementId} more than once.`, 'SOLVER_ELEMENT_CONTRIBUTION_DUPLICATE');
    }
    if (!elementsById.has(accepted.elementId)) {
      fail(
        `elementContributions declares ${accepted.elementId}, which is not an element of the bound mechanical model.`,
        'SOLVER_ELEMENT_CONTRIBUTION_UNKNOWN_ELEMENT',
      );
    }
    contributionsById.set(accepted.elementId, accepted);
  }
  for (const element of model.elements) {
    if (!contributionsById.has(element.elementId)) {
      fail(
        `Model element ${element.elementId} has no supplied contribution; every element the mechanical model declares must be assembled.`,
        'SOLVER_ELEMENT_CONTRIBUTION_MISSING',
      );
    }
  }

  const elementIds = [...contributionsById.keys()].sort(compareAscii);
  const triplets = [];
  const elementLoad = new Array(dofMap.dofCount).fill(0);

  for (const elementId of elementIds) {
    const contribution = contributionsById.get(elementId);
    const element = elementsById.get(elementId);
    const globalIndices = LOCAL_DOF_REFERENCES.map(({ end, dof }) =>
      dofIndexOf(dofMap, end === 'I' ? element.nodeI : element.nodeJ, dof));

    for (let row = 0; row < 12; row += 1) {
      const globalRow = globalIndices[row];
      elementLoad[globalRow] += contribution.equivalentLoadGlobal[row] + contribution.initialStrainLoadGlobal[row];
      for (let column = 0; column < 12; column += 1) {
        const value = contribution.globalStiffness[row * 12 + column];
        if (value === 0) continue;
        triplets.push({ row: globalRow, col: globalIndices[column], value, tag: `ELEMENT:${elementId}` });
      }
    }
  }
  return { triplets, elementLoad, elementIds };
}

function buildSpringTriplets(model, dofMap) {
  const springs = model.constraints
    .filter((constraint) => constraint.behavior === 'LINEAR_SPRING')
    .sort((left, right) => compareAscii(left.constraintId, right.constraintId));
  const triplets = springs.map((constraint) => {
    const index = dofIndexOf(dofMap, constraint.nodeId, constraint.dof);
    const stiffness = requirePositive(constraint.stiffness, `constraints[${constraint.constraintId}].stiffness`, CODE);
    return { row: index, col: index, value: stiffness, tag: `SPRING:${constraint.constraintId}` };
  });
  return { triplets, springs };
}

function sortAndSumTriplets(triplets) {
  const ordered = [...triplets].sort((left, right) => {
    if (left.row !== right.row) return left.row - right.row;
    if (left.col !== right.col) return left.col - right.col;
    return compareAscii(left.tag, right.tag);
  });
  const summed = [];
  for (const triplet of ordered) {
    const last = summed[summed.length - 1];
    if (last !== undefined && last.row === triplet.row && last.col === triplet.col) {
      last.value += triplet.value;
    } else {
      summed.push({ row: triplet.row, col: triplet.col, value: triplet.value });
    }
  }
  return summed;
}

function denseFromTriplets(n, triplets) {
  const K = new Array(n * n).fill(0);
  for (const triplet of triplets) K[triplet.row * n + triplet.col] = triplet.value;
  return K;
}

function assertSymmetric(K, n) {
  let worst = 0;
  for (let row = 0; row < n; row += 1) {
    for (let column = row + 1; column < n; column += 1) {
      const a = K[row * n + column];
      const b = K[column * n + row];
      const scale = Math.max(Math.abs(a), Math.abs(b), 1);
      worst = Math.max(worst, Math.abs(a - b) / scale);
    }
  }
  if (worst > 1e-9) {
    fail(
      `Assembled global stiffness is not symmetric within tolerance (worst normalized asymmetry ${worst}); duplicate contributions must sum to a symmetric system.`,
      'SOLVER_ASSEMBLY_ASYMMETRIC',
    );
  }
  return worst;
}

/**
 * Partition the DOF set into free, constrained (FIXED or PRESCRIBED_SLOT,
 * eliminated identically per section 7.2) and springs (which stay free but
 * add stiffness). Section 8 Boundary conditions.
 */
function partitionDofs(model, dofMap) {
  const constrained = model.constraints
    .filter((constraint) => constraint.behavior === 'FIXED' || constraint.behavior === 'PRESCRIBED_SLOT')
    .map((constraint) => ({
      constraintId: constraint.constraintId,
      nodeId: constraint.nodeId,
      dof: constraint.dof,
      behavior: constraint.behavior,
      globalIndex: dofIndexOf(dofMap, constraint.nodeId, constraint.dof),
    }))
    .sort((left, right) => left.globalIndex - right.globalIndex);
  const constrainedIndices = new Set(constrained.map((entry) => entry.globalIndex));
  const freeIndices = [];
  for (let index = 0; index < dofMap.dofCount; index += 1) {
    if (!constrainedIndices.has(index)) freeIndices.push(index);
  }
  const partitionHash = semanticHash({
    constrained: constrained.map((entry) => ({ nodeId: entry.nodeId, dof: entry.dof })),
  });
  return { constrained, freeIndices, partitionHash };
}

/**
 * Assemble the global system for one bound mechanical model (section 8:
 * DOF indexing, Assembly, Boundary conditions, Scaling identity carried by
 * the caller). Returns the dense global stiffness, the summed physical
 * element load vector, the DOF partition and the assembly evidence.
 *
 * @param {object} args
 * @param {Readonly<object>} args.model Sealed `fea-linear-model/v1`.
 * @param {Readonly<object>} args.dofMap Section 8 DOF map for this model.
 * @param {Array<object>} args.elementContributions Normalized contributions, one per model element.
 * @returns {Readonly<object>} Assembly evidence plus the dense `K` and `elementLoad` arrays.
 */
export function assembleGlobalSystem({ model, dofMap, elementContributions }) {
  const n = dofMap.dofCount;
  const elementResult = buildElementTriplets(model, dofMap, elementContributions);
  const springResult = buildSpringTriplets(model, dofMap);
  const allTriplets = [...elementResult.triplets, ...springResult.triplets];
  const summed = sortAndSumTriplets(allTriplets);
  const K = denseFromTriplets(n, summed);
  const symmetryResidual = assertSymmetric(K, n);
  const partition = partitionDofs(model, dofMap);

  return Object.freeze({
    n,
    K,
    elementLoad: elementResult.elementLoad,
    tripletCount: summed.length,
    elementCount: elementResult.elementIds.length,
    springCount: springResult.springs.length,
    symmetryResidual,
    constrained: partition.constrained,
    freeIndices: partition.freeIndices,
    partitionHash: partition.partitionHash,
  });
}
