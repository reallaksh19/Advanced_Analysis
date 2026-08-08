import { requireLoadPrimitive } from '../linear-fea-load-case/load-primitives.js';
import {
  computeFrameElementSemanticHash,
  requireFrameElement,
} from './frame-element.js';
import {
  requireArray,
  requireFinite,
} from './frame-element-contract.js';
import {
  transformDisplacementToLocal,
  transformLoadToGlobal,
} from './frame-element-stiffness.js';

const LIMITATION_CODE = 'FRAME_ELEMENT_LIMITATION_FREE_JOINT_DEFORMATION';
const INVALID_CODE = 'FRAME_ELEMENT_FREE_JOINT_DEFORMATION_INVALID';

function requireVector12(value, field) {
  requireArray(value, field, INVALID_CODE);
  if (value.length !== 12) throw new RangeError(`${field} must carry exactly 12 entries.`);
  return value.map((entry, index) => requireFinite(entry, `${field}[${index}]`, INVALID_CODE));
}

function requireMatrix144(value, field) {
  requireArray(value, field, INVALID_CODE);
  if (value.length !== 144) throw new RangeError(`${field} must carry exactly 144 entries.`);
  return value.map((entry, index) => requireFinite(entry, `${field}[${index}]`, INVALID_CODE));
}

function matVec12(matrix, vector) {
  const result = new Array(12).fill(0);
  for (let row = 0; row < 12; row += 1) {
    let sum = 0;
    for (let column = 0; column < 12; column += 1) sum += matrix[row * 12 + column] * vector[column];
    result[row] = sum;
  }
  return result;
}

function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

/**
 * Add a traceable generalized free joint deformation to a sealed frame.
 *
 * The mechanism is deliberately kinematic. The caller supplies the 12 global
 * joint DOFs that the element would adopt in its stress-free state plus the
 * effective local stiffness that will actually be assembled. The helper then
 * stores K_eff*d_free in `initialStrainLoadVector`, so both assembly and result
 * recovery use the same equivalent load and the free state satisfies
 * q = K_eff*(d - d_free) = 0 exactly.
 *
 * This is intended for qualified component mechanisms whose free deformation
 * is not a uniform axial strain of each straight descendant (for example a
 * bend-level translational pressure effect). It is not a second stiffness
 * formulation and it does not mutate the element axes or component stiffness.
 * Rigid offsets are refused because their joint/end kinematics require a
 * separately qualified mapping before a generalized free deformation can be
 * applied safely.
 */
export function augmentFrameElementFreeJointDeformation({
  frame,
  primitive,
  effectiveLocalStiffness,
  freeJointDisplacementGlobal,
  disclosure,
  details = {},
}) {
  const acceptedFrame = requireFrameElement(frame);
  const acceptedPrimitive = requireLoadPrimitive(primitive);
  if (acceptedPrimitive.elementId !== acceptedFrame.elementId) {
    throw new Error(`Free-deformation primitive ${acceptedPrimitive.primitiveId} is not bound to ${acceptedFrame.elementId}.`);
  }
  if (acceptedFrame.rigidOffsets.I !== null || acceptedFrame.rigidOffsets.J !== null) {
    throw new Error('Generalized free joint deformation with rigid offsets is not qualified.');
  }
  if (typeof disclosure !== 'string' || disclosure.length === 0) {
    throw new TypeError('Generalized free joint deformation requires a non-empty disclosure.');
  }
  if (details === null || typeof details !== 'object' || Array.isArray(details)) {
    throw new TypeError('Generalized free joint deformation details must be a record.');
  }

  const stiffness = requireMatrix144(effectiveLocalStiffness, 'effectiveLocalStiffness');
  const dGlobal = requireVector12(freeJointDisplacementGlobal, 'freeJointDisplacementGlobal');
  const dLocal = transformDisplacementToLocal(dGlobal, acceptedFrame.transformation.matrix);
  const addedLocal = matVec12(stiffness, dLocal);
  const addedGlobal = transformLoadToGlobal(addedLocal, acceptedFrame.transformation.matrix);

  const draft = {
    ...acceptedFrame,
    initialStrainLoadVector: {
      local: addVectors(acceptedFrame.initialStrainLoadVector.local, addedLocal),
      global: addVectors(acceptedFrame.initialStrainLoadVector.global, addedGlobal),
    },
    limitations: [
      ...acceptedFrame.limitations,
      {
        code: LIMITATION_CODE,
        severity: 'INFO',
        scope: 'ELEMENT',
        stiffnessRelevant: false,
        details: {
          disclosure,
          primitiveId: acceptedPrimitive.primitiveId,
          primitiveKind: acceptedPrimitive.kind,
          primitiveSemanticHash: acceptedPrimitive.semanticHash,
          freeJointDisplacementGlobal: dGlobal,
          freeJointDisplacementLocal: dLocal,
          ...details,
        },
      },
    ].sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 : 0),
    semanticHash: '',
  };
  draft.semanticHash = computeFrameElementSemanticHash(draft);
  return requireFrameElement(draft);
}
