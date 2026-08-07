import { elementDofIndex } from '../linear-fea-contract/conventions.js';
import { requireLoadPrimitive } from '../linear-fea-load-case/load-primitives.js';
import {
  computeFrameElementSemanticHash,
  requireFrameElement,
} from './frame-element.js';
import {
  requireFinite,
  requireFrameElementProfile,
  resolveFrameElementPolicies,
} from './frame-element-contract.js';
import { thermalInitialStrainVector } from './frame-element-loads.js';
import {
  applyOffsetToLoad,
  condenseEndConditions,
  frameLocalStiffness,
  frameOffsetMatrix,
  transformLoadToGlobal,
} from './frame-element-stiffness.js';

const LIMITATION_CODE = 'FRAME_ELEMENT_LIMITATION_UNIFORM_AXIAL_INITIAL_STRAIN';

function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

/**
 * Add a traceable, uniform axial initial strain to an already compiled frame.
 *
 * This is intentionally generic: pressure/Bourdon, fabrication strain, or any
 * future qualified source mechanism may supply the scalar strain, but this
 * helper owns only the frame-mechanics operation. The added initial-strain load
 * is passed through the same end-condition condensation, local/global transform
 * and rigid-offset transform as thermal strain, so result recovery can subtract
 * it consistently from K*u.
 */
export function augmentFrameElementUniformAxialInitialStrain({
  frame,
  profile,
  primitive,
  axialStrain,
  disclosure,
}) {
  const acceptedFrame = requireFrameElement(frame);
  const acceptedProfile = requireFrameElementProfile(profile);
  const acceptedPrimitive = requireLoadPrimitive(primitive);
  const strain = requireFinite(axialStrain, 'axialStrain', 'FRAME_ELEMENT_INITIAL_STRAIN_INVALID');
  if (acceptedFrame.profileSemanticHash !== acceptedProfile.semanticHash) {
    throw new Error('Uniform axial initial strain profile does not match the compiled frame profile.');
  }
  if (acceptedPrimitive.elementId !== acceptedFrame.elementId) {
    throw new Error(`Initial-strain primitive ${acceptedPrimitive.primitiveId} is not bound to ${acceptedFrame.elementId}.`);
  }
  if (typeof disclosure !== 'string' || disclosure.length === 0) {
    throw new TypeError('Uniform axial initial strain requires a non-empty disclosure.');
  }

  const policies = resolveFrameElementPolicies(acceptedProfile);
  const base = frameLocalStiffness({
    elasticModulus: acceptedFrame.material.elasticModulus,
    shearModulus: acceptedFrame.material.shearModulus,
    area: acceptedFrame.section.area,
    secondMomentY: acceptedFrame.section.secondMomentY,
    secondMomentZ: acceptedFrame.section.secondMomentZ,
    polarMoment: acceptedFrame.section.polarMoment,
    length: acceptedFrame.geometry.length,
    shearDeformation: acceptedFrame.shearDeformation,
    shearCorrectionFactorY: acceptedFrame.shearCorrection?.y.value,
    shearCorrectionFactorZ: acceptedFrame.shearCorrection?.z.value,
  });
  const raw = thermalInitialStrainVector({
    elasticModulus: acceptedFrame.material.elasticModulus,
    area: acceptedFrame.section.area,
    axialStrain: strain,
  });
  const entries = [
    ...acceptedFrame.endConditions.releases.map((entry) => ({
      index: elementDofIndex(entry.end, entry.dof),
      stiffness: 0,
    })),
    ...acceptedFrame.endConditions.springs.map((entry) => ({
      index: elementDofIndex(entry.end, entry.dof),
      stiffness: entry.stiffness,
    })),
  ].sort((left, right) => left.index - right.index);
  const condensed = condenseEndConditions(
    base.matrix,
    [raw],
    entries,
    policies.releaseSingularityTolerance.value,
  );
  let global = transformLoadToGlobal(condensed.vectors[0], acceptedFrame.transformation.matrix);
  const hasOffsets = acceptedFrame.rigidOffsets.I !== null || acceptedFrame.rigidOffsets.J !== null;
  if (hasOffsets) global = applyOffsetToLoad(global, frameOffsetMatrix(acceptedFrame.rigidOffsets));

  const loadIdentity = {
    primitiveId: acceptedPrimitive.primitiveId,
    kind: acceptedPrimitive.kind,
    semanticHash: acceptedPrimitive.semanticHash,
  };
  if (acceptedFrame.appliedLoads.some((entry) => entry.primitiveId === loadIdentity.primitiveId)) {
    throw new Error(`Initial-strain primitive ${loadIdentity.primitiveId} is already applied to ${acceptedFrame.elementId}.`);
  }

  const draft = {
    ...acceptedFrame,
    initialStrainLoadVector: {
      local: addVectors(acceptedFrame.initialStrainLoadVector.local, condensed.vectors[0]),
      global: addVectors(acceptedFrame.initialStrainLoadVector.global, global),
    },
    appliedLoads: [...acceptedFrame.appliedLoads, loadIdentity]
      .sort((left, right) => left.primitiveId < right.primitiveId ? -1 : left.primitiveId > right.primitiveId ? 1 : 0),
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
          primitiveSemanticHash: acceptedPrimitive.semanticHash,
          axialStrain: strain,
          freeExtension: strain * acceptedFrame.geometry.length,
        },
      },
    ].sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 : 0),
    semanticHash: '',
  };
  draft.semanticHash = computeFrameElementSemanticHash(draft);
  return requireFrameElement(draft);
}
