import { INACTIVE_ANALYSIS_DOF_BEHAVIOR } from '../linear-fea-contract/model-schema.js';
import { compareAscii } from './solver-contract.js';

/**
 * Section 8 "Failure": mechanism, rank deficiency, near-zero pivot and
 * conflicting constraints reported by node/DOF and connected component.
 *
 * Two independent detectors feed the same failure report:
 *  - a topological one, here, that finds a whole rigid body with no physical
 *    restraint touching any of its nodes (the gross case section 15.5 asks
 *    for: "a genuine mechanism ... must be caught and reported by node/DOF");
 *  - a numerical one, in `factorization.js`, that reads the LDLT pivots for a
 *    partial mechanism the topology check cannot see (for example a
 *    connected but under-restrained rotational DOF).
 */

class UnionFind {
  constructor(keys) {
    this.parent = new Map(keys.map((key) => [key, key]));
  }

  find(key) {
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    let cursor = key;
    while (this.parent.get(cursor) !== root) {
      const next = this.parent.get(cursor);
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(left, right) {
    const rootLeft = this.find(left);
    const rootRight = this.find(right);
    if (rootLeft !== rootRight) this.parent.set(rootLeft, rootRight);
  }
}

/**
 * Group model nodes into connected components under element adjacency only
 * (rigid links/kinematic relations are out of this package's scope; see the
 * B-3.3 scope boundary). Components are identified by their lexicographically
 * least member nodeId so the result is deterministic and reproducible.
 *
 * @param {object} model Sealed `fea-linear-model/v1`.
 * @returns {Array<{componentId:string, nodeIds:Array<string>}>}
 */
export function connectedComponents(model) {
  const nodeIds = model.nodes.map((node) => node.nodeId);
  const unionFind = new UnionFind(nodeIds);
  for (const element of model.elements) unionFind.union(element.nodeI, element.nodeJ);
  const groups = new Map();
  for (const nodeId of nodeIds) {
    const root = unionFind.find(nodeId);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(nodeId);
  }
  return [...groups.values()]
    .map((members) => {
      const sorted = [...members].sort(compareAscii);
      return { componentId: sorted[0], nodeIds: sorted };
    })
    .sort((left, right) => compareAscii(left.componentId, right.componentId));
}

/**
 * Connected components with zero physical constraints (FIXED,
 * PRESCRIBED_SLOT or LINEAR_SPRING) touching any member node: an
 * unconditional rigid-body mechanism, independent of any numerical pivot.
 * Analysis-only inactive DOFs do not count as physical restraints.
 *
 * @param {object} model Sealed `fea-linear-model/v1`.
 * @returns {Array<{componentId:string, nodeIds:Array<string>}>}
 */
export function detectFloatingComponents(model) {
  const restrainedNodeIds = new Set(model.constraints
    .filter((constraint) => constraint.behavior !== INACTIVE_ANALYSIS_DOF_BEHAVIOR)
    .map((constraint) => constraint.nodeId));
  return connectedComponents(model).filter(
    (component) => !component.nodeIds.some((nodeId) => restrainedNodeIds.has(nodeId)),
  );
}
