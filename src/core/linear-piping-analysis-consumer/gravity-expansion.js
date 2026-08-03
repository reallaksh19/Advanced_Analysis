import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
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
  PhysicalLoadCaseError,
  computeLoadCaseEvidenceHash,
  computeLoadCaseSemanticHash,
  computePhysicalLoadCaseHash,
  computePrimitiveSemanticHash,
  requireLoadPrimitive,
  requirePhysicalLoadCase,
} from '../linear-fea-load-case/index.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import {
  computePipingComponentSemanticHash,
  requirePipingComponent,
} from '../linear-fea-piping-components/index.js';
import { compareAscii, failLinearPipingAnalysis } from './validation.js';

export const GRAVITY_PIPE_WALL_EXPANSION_ID = 'LFEA-M007-GRAVITY-PIPE-WALL-UDL-V1';
export const GRAVITY_MASS_SOURCE_NOT_IMPLEMENTED_CODE =
  'LOAD_CASE_GRAVITY_MASS_SOURCE_NOT_IMPLEMENTED';

const IMPLEMENTED_MASS_SOURCE = 'PIPE_WALL';
const FORCE_COMPONENTS = Object.freeze(['fx', 'fy', 'fz']);
const DIRECTION_COMPONENTS = Object.freeze(['x', 'y', 'z']);

/**
 * Expand a sealed GRAVITY declaration into deterministic PIPE_WALL UDL
 * primitives and bind those primitives into the already-qualified element
 * authorities that B-3.3/B-3.4 consume.
 *
 * This belongs in the application orchestration layer rather than B-3.0 or
 * B-3.1: only this boundary simultaneously owns the sealed load case, the
 * compiled material/section bindings and the exact frame/component evidence
 * that must cite the generated primitives for recovery. The load-case contract
 * remains declaration-only and the frame formulation remains the sole
 * consistent-equivalent-load authority.
 */
export function expandPipeWallGravitySourceAuthorities({
  compilation,
  loadCase,
  frameElements,
  pipingComponents = [],
}) {
  const acceptedCompilation = requireMechanicalModelCompilation(compilation);
  const acceptedLoadCase = requirePhysicalLoadCase(loadCase);
  const acceptedFrameElements = frameElements.map(requireFrameElement);
  const acceptedComponents = pipingComponents.map(requirePipingComponent);

  const gravityPrimitives = acceptedLoadCase.primitives
    .filter((primitive) => primitive.kind === 'GRAVITY')
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));

  for (const gravity of gravityPrimitives) requireImplementedMassSources(gravity);
  if (gravityPrimitives.length === 0
    || !gravityPrimitives.some((gravity) => gravity.includedMassSources.includes(IMPLEMENTED_MASS_SOURCE))) {
    return deepFreeze({
      loadCase: acceptedLoadCase,
      frameElements: acceptedFrameElements,
      pipingComponents: acceptedComponents,
      generatedPrimitives: [],
      derivations: [],
    });
  }

  const modelElementsById = new Map(
    acceptedCompilation.model.elements.map((entry) => [entry.elementId, entry]),
  );
  const materialsById = new Map(
    acceptedCompilation.model.materialStates.map((entry) => [entry.materialStateId, entry]),
  );
  const sectionsById = new Map(
    acceptedCompilation.model.sectionStates.map((entry) => [entry.sectionStateId, entry]),
  );
  const existingPrimitiveIds = new Set(acceptedLoadCase.primitives.map((primitive) => primitive.primitiveId));
  const generatedPrimitives = [];
  const derivations = [];

  for (const gravity of gravityPrimitives) {
    if (!gravity.includedMassSources.includes(IMPLEMENTED_MASS_SOURCE)) continue;
    for (const element of [...acceptedCompilation.model.elements]
      .sort((left, right) => compareAscii(left.elementId, right.elementId))) {
      const material = materialsById.get(element.materialStateId);
      const section = sectionsById.get(element.sectionStateId);
      if (material === undefined || section === undefined) {
        failLinearPipingAnalysis(
          `Element ${element.elementId} lacks the compiled material or section state required for PIPE_WALL gravity expansion.`,
          'PIPING_ANALYSIS_GRAVITY_BINDING_MISSING',
          { elementId: element.elementId },
        );
      }
      const primitiveId = generatedPrimitiveId(gravity.primitiveId, element.elementId);
      if (existingPrimitiveIds.has(primitiveId)) {
        failLinearPipingAnalysis(
          `Generated gravity primitive identity ${primitiveId} collides with an existing load primitive.`,
          'PIPING_ANALYSIS_GRAVITY_PRIMITIVE_ID_COLLISION',
          { primitiveId },
        );
      }
      existingPrimitiveIds.add(primitiveId);

      const density = requirePositiveFinite(
        material.massDensity,
        `materialStates[${material.materialStateId}].massDensity`,
      );
      const area = requirePositiveFinite(
        section.area,
        `sectionStates[${section.sectionStateId}].area`,
      );
      const acceleration = requirePositiveFinite(
        gravity.accelerationMagnitude.value,
        `gravity[${gravity.primitiveId}].accelerationMagnitude.value`,
      );
      const lineWeight = density * area * acceleration;
      const intensity = Object.fromEntries(FORCE_COMPONENTS.map((forceComponent, index) => [
        forceComponent,
        cleanNumber(-gravity.direction[DIRECTION_COMPONENTS[index]] * lineWeight),
      ]));
      const derivation = gravityDerivation({
        acceptedCompilation,
        gravity,
        element,
        material,
        section,
        density,
        area,
        acceleration,
        lineWeight,
        intensity,
      });
      const sourceEvidence = {
        sourceId: `${GRAVITY_PIPE_WALL_EXPANSION_ID}:${gravity.primitiveId}:${element.elementId}`,
        sourceRevision: `${material.materialStateId}:${section.sectionStateId}`,
        sourceSemanticHash: semanticHash(derivation),
      };
      const draft = {
        schema: 'fea-linear-load-primitive/v1',
        primitiveId,
        kind: 'DISTRIBUTED_LOAD',
        sourceEvidence,
        elementId: element.elementId,
        basis: 'GLOBAL',
        variation: 'UNIFORM',
        startIntensity: { ...intensity },
        endIntensity: { ...intensity },
        units: { distributedForce: 'N/m', length: 'm' },
        limitations: [],
        semanticHash: '',
      };
      draft.semanticHash = computePrimitiveSemanticHash(draft);
      generatedPrimitives.push(requireLoadPrimitive(draft));
      derivations.push(deepFreeze({
        primitiveId,
        sourceEvidence,
        ...derivation,
      }));
    }
  }

  generatedPrimitives.sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  derivations.sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  const expandedLoadCase = expandLoadCase(acceptedLoadCase, generatedPrimitives);
  const generatedByElement = groupByElement(generatedPrimitives);
  const expandedFrameElements = acceptedFrameElements
    .map((frameElement) => augmentFrameElement(
      frameElement,
      generatedByElement.get(frameElement.elementId) ?? [],
      modelElementsById.get(frameElement.elementId),
    ))
    .sort((left, right) => compareAscii(left.elementId, right.elementId));
  const expandedComponents = acceptedComponents
    .map((component) => augmentPipingComponent(component, generatedByElement, modelElementsById))
    .sort((left, right) => compareAscii(left.componentId, right.componentId));

  return deepFreeze({
    loadCase: expandedLoadCase,
    frameElements: expandedFrameElements,
    pipingComponents: expandedComponents,
    generatedPrimitives,
    derivations,
  });
}

function requireImplementedMassSources(gravity) {
  const unsupported = gravity.includedMassSources
    .filter((source) => source !== IMPLEMENTED_MASS_SOURCE)
    .sort(compareAscii);
  if (unsupported.length > 0) {
    throw new PhysicalLoadCaseError(
      `Gravity primitive ${gravity.primitiveId} declares mass source(s) ${unsupported.join(', ')}, but M007 implements PIPE_WALL only; gravity is not partially applied.`,
      GRAVITY_MASS_SOURCE_NOT_IMPLEMENTED_CODE,
    );
  }
}

function generatedPrimitiveId(gravityPrimitiveId, elementId) {
  return `LP-M007-${gravityPrimitiveId}-${elementId}`;
}

function gravityDerivation({
  acceptedCompilation,
  gravity,
  element,
  material,
  section,
  density,
  area,
  acceleration,
  lineWeight,
  intensity,
}) {
  return {
    schema: 'lfea-m007-gravity-pipe-wall-derivation/v1',
    expansionId: GRAVITY_PIPE_WALL_EXPANSION_ID,
    compilationSemanticHash: acceptedCompilation.semanticHash,
    mechanicalModelSemanticHash: acceptedCompilation.mechanicalModelSemanticHash,
    gravity: {
      primitiveId: gravity.primitiveId,
      semanticHash: gravity.semanticHash,
      sourceEvidence: gravity.sourceEvidence,
      direction: gravity.direction,
      accelerationMagnitude: gravity.accelerationMagnitude,
    },
    element: {
      elementId: element.elementId,
      materialStateId: element.materialStateId,
      sectionStateId: element.sectionStateId,
      sourceAncestry: element.sourceAncestry,
    },
    material: {
      materialStateId: material.materialStateId,
      massDensity: density,
      sourceEvidence: material.sourceEvidence,
    },
    section: {
      sectionStateId: section.sectionStateId,
      area,
      sourceEvidence: section.sourceEvidence,
    },
    lineWeight,
    intensity,
  };
}

function expandLoadCase(loadCase, generatedPrimitives) {
  const primitives = [...loadCase.primitives, ...generatedPrimitives]
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  const diagnostics = [
    ...loadCase.diagnostics,
    ...generatedPrimitives.map((primitive) => ({
      severity: 'INFO',
      code: 'LOAD_CASE_GRAVITY_PIPE_WALL_EXPANDED',
      entityType: 'LOAD_PRIMITIVE',
      entityId: primitive.primitiveId,
      message: `PIPE_WALL gravity expanded deterministically to a uniform distributed load on element ${primitive.elementId}.`,
      evidence: [{
        evidenceId: 'GRAVITY-PIPE-WALL-DERIVATION',
        sourceId: primitive.sourceEvidence.sourceId,
        sourceRevision: primitive.sourceEvidence.sourceRevision,
        sourceSemanticHash: primitive.sourceEvidence.sourceSemanticHash,
      }],
      qualificationEvidenceIds: ['LFEA-M007'],
    })),
  ].sort((left, right) => {
    const entity = compareAscii(left.entityId, right.entityId);
    return entity !== 0 ? entity : compareAscii(left.code, right.code);
  });
  const draft = {
    ...loadCase,
    primitives,
    diagnostics,
    physicalLoadCaseHash: '',
    semanticHash: '',
    evidenceHash: '',
  };
  draft.physicalLoadCaseHash = computePhysicalLoadCaseHash(draft);
  draft.semanticHash = computeLoadCaseSemanticHash(draft);
  draft.evidenceHash = computeLoadCaseEvidenceHash(draft);
  return requirePhysicalLoadCase(draft);
}

function groupByElement(primitives) {
  const result = new Map();
  for (const primitive of primitives) {
    const entries = result.get(primitive.elementId) ?? [];
    entries.push(primitive);
    result.set(primitive.elementId, entries);
  }
  for (const entries of result.values()) {
    entries.sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  }
  return result;
}

function augmentFrameElement(frameElement, generatedPrimitives, modelElement) {
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

function augmentPipingComponent(component, generatedByElement, modelElementsById) {
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

function requirePositiveFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    failLinearPipingAnalysis(
      `${field} must be positive and finite for PIPE_WALL gravity expansion.`,
      'PIPING_ANALYSIS_GRAVITY_PROPERTY_INVALID',
      { field, value },
    );
  }
  return value;
}

function cleanNumber(value) {
  if (!Number.isFinite(value)) {
    failLinearPipingAnalysis(
      'PIPE_WALL gravity intensity is not finite.',
      'PIPING_ANALYSIS_GRAVITY_INTENSITY_INVALID',
      { value },
    );
  }
  return Object.is(value, -0) ? 0 : value;
}
