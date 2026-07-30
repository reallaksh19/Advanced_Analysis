import { DOF_ORDER } from '../linear-fea-contract/conventions.js';
import {
  frameOffsetMatrix,
  transformDisplacementToLocal,
  transformLoadToGlobal,
} from '../linear-fea-frame-element/index.js';
import { LOCAL_ACTION_FIELDS, fail, requireFinite } from './recovery-contract.js';

/**
 * Element end-action recovery (section 9 "Element end action").
 *
 * Every quantity here is the frozen B-2.0/B-3.1 shape, evaluated with a
 * solved global displacement this package never computed:
 * `q_local = K_local d_local - equivalentLoadVector.local - initialStrainLoadVector.local`.
 * The element's own `transformation.matrix` and `rigidOffsets` are consumed
 * exactly as B-3.1 sealed them; neither the stiffness nor the transformation
 * is re-derived here.
 */

const CODE = 'RECOVERY_ELEMENT_ACTION_INVALID';

function matVec12(matrix, vector) {
  const result = new Array(12).fill(0);
  for (let row = 0; row < 12; row += 1) {
    let sum = 0;
    for (let column = 0; column < 12; column += 1) sum += matrix[row * 12 + column] * vector[column];
    result[row] = sum;
  }
  return result;
}

/**
 * Gather the 12-component element joint displacement (I's six DOFs then J's
 * six, the frozen B-2.0 element DOF order) from the execution's solved global
 * displacement vector, indexed by `nodeId:dof`.
 */
export function gatherJointDisplacement12(displacementIndex, nodeI, nodeJ) {
  const vector = new Array(12).fill(0);
  [nodeI, nodeJ].forEach((nodeId, endIndex) => {
    DOF_ORDER.forEach((dof, dofIndex) => {
      const key = `${nodeId}:${dof}`;
      if (!displacementIndex.has(key)) {
        fail(
          `execution.displacement has no entry for ${key}, required to recover the joint displacement of an element bound to that node.`,
          'RECOVERY_DISPLACEMENT_MISSING',
        );
      }
      vector[endIndex * 6 + dofIndex] = displacementIndex.get(key);
    });
  });
  return vector;
}

/**
 * `d_local = T H d_joint`: the axis rotation `T` and, when rigid offsets are
 * declared, the offset kinematic map `H` (`u_end = u_joint + theta x r`),
 * applied in the same order B-3.1 applies them when it pushes a local matrix
 * out to the joint frame (`transformStiffnessToGlobal` then
 * `applyOffsetToStiffness`) — just run forward instead of transposed.
 */
export function jointDisplacementToLocal(frameElementRecord, jointDisplacement12) {
  const { rigidOffsets, transformation } = frameElementRecord;
  let atEnd = jointDisplacement12;
  if (rigidOffsets.I !== null || rigidOffsets.J !== null) {
    atEnd = transformDisplacementToLocal(atEnd, frameOffsetMatrix(rigidOffsets));
  }
  return transformDisplacementToLocal(atEnd, transformation.matrix);
}

function actionRecordFromVector6(vector, offset) {
  const record = {};
  LOCAL_ACTION_FIELDS.forEach((field, index) => {
    record[field] = requireFinite(vector[offset + index], `action.${field}`, CODE);
  });
  return record;
}

/**
 * Recover one element's joint-on-element end action, local and global
 * (section 9), from its own sealed matrices/vectors and a solved joint
 * displacement.
 *
 * @param {object} args
 * @param {Readonly<object>} args.frameElementRecord Sealed `fea-linear-frame-element/v1` this span was built from.
 * @param {Array<number>} args.effectiveLocalStiffness The 144-entry local stiffness actually assembled for this element (B-3.2's flexibility-corrected form when the element belongs to a piping component, otherwise the frame element's own `localStiffness`).
 * @param {Array<number>} args.jointDisplacement12 Twelve joint DOF values, I then J, gathered from the execution.
 * @returns {{dLocal:Array<number>, qLocal:Array<number>, qGlobal:Array<number>, local:{I:object,J:object}, global:{I:object,J:object}}}
 */
export function recoverElementEndAction({ frameElementRecord, effectiveLocalStiffness, jointDisplacement12 }) {
  const dLocal = jointDisplacementToLocal(frameElementRecord, jointDisplacement12);
  const kd = matVec12(effectiveLocalStiffness, dLocal);
  const qLocal = kd.map((value, index) => value
    - frameElementRecord.equivalentLoadVector.local[index]
    - frameElementRecord.initialStrainLoadVector.local[index]);

  let qGlobal = transformLoadToGlobal(qLocal, frameElementRecord.transformation.matrix);
  const { rigidOffsets } = frameElementRecord;
  if (rigidOffsets.I !== null || rigidOffsets.J !== null) {
    qGlobal = transformLoadToGlobal(qGlobal, frameOffsetMatrix(rigidOffsets));
  }

  return {
    dLocal,
    qLocal,
    qGlobal,
    local: { I: actionRecordFromVector6(qLocal, 0), J: actionRecordFromVector6(qLocal, 6) },
    global: { I: actionRecordFromVector6(qGlobal, 0), J: actionRecordFromVector6(qGlobal, 6) },
  };
}
