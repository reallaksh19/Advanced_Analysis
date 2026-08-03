import {
  computeFrameElementSemanticHash,
  distributedLoadLocalVector,
  frameLocalStiffness,
  frameOffsetMatrix,
  requireFrameElement,
  transformLoadToGlobal,
} from '../linear-fea-frame-element/index.js';
import { condenseEndConditions, cleanVector } from '../linear-fea-frame-element/frame-element-stiffness.js';
import { elementDofIndex } from '../linear-fea-contract/conventions.js';
import {
  computePipingComponentSemanticHash,
  requirePipingComponent,
} from '../linear-fea-piping-components/index.js';
import { compareAscii, failLinearPipingAnalysis } from './validation.js';

/**
 * Bind generated gravity UDL primitives back into an already-qualified
 * frame element's local stiffness/equivalent-load evidence, re-deriving the
 * local stiffness only to assert it is unchanged (B-3.1 remains the sole
 * stiffness authority) and accumulating the new equivalent load vector.
 */
export function augmentFrameElement(frameElement, generatedPrimitives, modelElement) {
  if (generatedPrimitives.length === 0) return frameElement;
  if (modelElement === undefined
    || frameElement.material.materialStateId !== modelElement.materialStateId
    || frameElement.section.sectionStateId !== modelElement.sectionStateId) {
    failLinearPipingAnalysis(
      `Element ${frameElement.elementId} does not cite the compiled material/section binding used to derive PIPE_WALL mass.`,
      'PIPING_ANALYSIS_GRAVITY_ELEMENT_BINDING_MISMATCH',
      {
        elementId: frameElement.elementId,
        compiledMaterialStateId: modelElement?.materialStateId,
        frameMaterialStateId: frameElement.material.materialStateId,
        compiledSectionStateId: modelElement?.sectionStateId,
        frameSectionStateId: frameElement.section.sectionStateId,
      },
    );
  }
  const properties = {
    elasticModulus: frameElement.material.elasticModulus,
    shearModulus: frameElement.material.shearModulus,
    area: frameElement.section.area,
    secondMomentY: frameElement.section.secondMomentY,
    secondMomentZ: frameElement.section.secondMomentZ,
    polarMoment: frameElement.section.polarMoment,
    length: frameElement.geometry.length,
    shearDeformation: frameElement.shearDeformation,
    shearCorrectionFactorY: frameElement.shearCorrection?.y.value,
    shearCorrectionFactorZ: frameElement.shearCorrection?.z.value,
  };
  const base = frameLocalStiffness(properties);
  const endConditionEntries = [
    ...frameElement.endConditions.releases.map((entry) => ({
      index: elementDofIndex(entry.end, entry.dof),
      stiffness: 0,
    })),
    ...frameElement.endConditions.springs.map((entry) => ({
      index: elementDofIndex(entry.end, entry.dof),
      stiffness: entry.stiffness,
    })),
  ].sort((left, right) => left.index - right.index);

  let generatedLocal = new Array(12).fill(0);
  for (const primitive of generatedPrimitives) {
    const local = distributedLoadLocalVector({
      primitive,
      axes: frameElement.localAxes.axes,
      length: frameElement.geometry.length,
      phiXY: base.phiXY,
      phiXZ: base.phiXZ,
    });
    generatedLocal = cleanVector(generatedLocal.map((value, index) => value + local[index]));
  }
  const condensed = condenseEndConditions(
    base.matrix,
    [generatedLocal],
    endConditionEntries,
    0,
  );
  assertSameVectorOrMatrix(
    condensed.matrix,
    frameElement.localStiffness,
    frameElement.elementId,
    'local stiffness',
  );
  let generatedGlobal = transformLoadToGlobal(
    condensed.vectors[0],
    frameElement.transformation.matrix,
  );
  if (frameElement.rigidOffsets.I !== null || frameElement.rigidOffsets.J !== null) {
    generatedGlobal = transformLoadToGlobal(
      generatedGlobal,
      frameOffsetMatrix(frameElement.rigidOffsets),
    );
  }

  const appliedLoads = [
    ...frameElement.appliedLoads,
    ...generatedPrimitives.map((primitive) => ({
      primitiveId: primitive.primitiveId,
      kind: primitive.kind,
      semanticHash: primitive.semanticHash,
    })),
  ].sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  const draft = {
    ...frameElement,
    equivalentLoadVector: {
      local: cleanVector(frameElement.equivalentLoadVector.local
        .map((value, index) => value + condensed.vectors[0][index])),
      global: cleanVector(frameElement.equivalentLoadVector.global
        .map((value, index) => value + generatedGlobal[index])),
    },
    appliedLoads,
    semanticHash: '',
  };
  draft.semanticHash = computeFrameElementSemanticHash(draft);
  return requireFrameElement(draft);
}

export function augmentPipingComponent(component, generatedByElement, modelElementsById) {
  let changed = false;
  const elements = component.elements.map((entry) => {
    const generated = generatedByElement.get(entry.elementId) ?? [];
    if (generated.length === 0) return entry;
    changed = true;
    return {
      ...entry,
      frameElement: augmentFrameElement(
        entry.frameElement,
        generated,
        modelElementsById.get(entry.elementId),
      ),
    };
  });
  if (!changed) return component;
  const draft = { ...component, elements, semanticHash: '' };
  draft.semanticHash = computePipingComponentSemanticHash(draft);
  return requirePipingComponent(draft);
}

function assertSameVectorOrMatrix(actual, expected, elementId, field) {
  if (actual.length !== expected.length
    || actual.some((value, index) => !Object.is(value, expected[index]))) {
    failLinearPipingAnalysis(
      `Gravity expansion could not reproduce element ${elementId} ${field} from its retained B-3.1 evidence; expansion stops rather than changing the formulation.`,
      'PIPING_ANALYSIS_GRAVITY_ELEMENT_EVIDENCE_MISMATCH',
      { elementId, field },
    );
  }
}
