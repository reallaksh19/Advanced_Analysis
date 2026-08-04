import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireFrameElement } from '../linear-fea-frame-element/index.js';
import {
  GRAVITY_MASS_SOURCES,
  PhysicalLoadCaseError,
  computePrimitiveSemanticHash,
  requireLoadPrimitive,
  requirePhysicalLoadCase,
} from '../linear-fea-load-case/index.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import { requirePipingComponent } from '../linear-fea-piping-components/index.js';
import { compareAscii, failLinearPipingAnalysis } from './validation.js';
import { augmentFrameElement, augmentPipingComponent } from './gravity-expansion-element-augmentation.js';
import {
  expandDeclaredDistributedWeightSource,
  indexDistributedWeightPrimitives,
} from './gravity-expansion-mass-sources.js';
import {
  GRAVITY_PIPE_WALL_EXPANSION_ID,
  gravityDerivation,
  gravityIntensity,
  expandLoadCase,
  groupByElement,
  requirePositiveFinite,
} from './gravity-expansion-primitives.js';

export { GRAVITY_PIPE_WALL_EXPANSION_ID };
export const GRAVITY_MASS_SOURCE_NOT_IMPLEMENTED_CODE =
  'LOAD_CASE_GRAVITY_MASS_SOURCE_NOT_IMPLEMENTED';

const PIPE_WALL_MASS_SOURCE = 'PIPE_WALL';
const SUPPORTED_MASS_SOURCES = new Set(GRAVITY_MASS_SOURCES);

/**
 * Expand sealed GRAVITY declarations into deterministic distributed loads and
 * bind those primitives into the already-qualified element authorities that
 * B-3.3/B-3.4 consume. PIPE_WALL remains derived from compiled density and
 * area; CONTENTS and INSULATION consume caller-declared DISTRIBUTED_WEIGHT
 * primitives without recomputing their density or geometry.
 */
export function expandPipeWallGravitySourceAuthorities({
  compilation,
  loadCase,
  frameElements,
  pipingComponents,
  pipeWallExcludedElementIds,
}) {
  const acceptedCompilation = requireMechanicalModelCompilation(compilation);
  const acceptedLoadCase = requirePhysicalLoadCase(loadCase);
  const acceptedFrameElements = frameElements.map(requireFrameElement);
  const acceptedComponents = (pipingComponents ?? []).map(requirePipingComponent);

  const gravityPrimitives = acceptedLoadCase.primitives
    .filter((primitive) => primitive.kind === 'GRAVITY')
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));

  for (const gravity of gravityPrimitives) requireImplementedMassSources(gravity);
  if (gravityPrimitives.length === 0) {
    return deepFreeze({
      loadCase: acceptedLoadCase,
      frameElements: acceptedFrameElements,
      pipingComponents: acceptedComponents,
      generatedPrimitives: [],
      derivations: [],
    });
  }

  const modelElements = [...acceptedCompilation.model.elements]
    .sort((left, right) => compareAscii(left.elementId, right.elementId));
  const modelElementIds = new Set(modelElements.map((entry) => entry.elementId));
  const pipeWallExclusions = new Set(pipeWallExcludedElementIds ?? []);
  for (const elementId of [...pipeWallExclusions].sort(compareAscii)) {
    if (!modelElementIds.has(elementId)) {
      failLinearPipingAnalysis(
        `PIPE_WALL gravity exclusion references unknown element ${elementId}.`,
        'PIPING_ANALYSIS_GRAVITY_EXCLUSION_UNKNOWN_ELEMENT',
        { elementId },
      );
    }
  }
  const modelElementsById = new Map(modelElements.map((entry) => [entry.elementId, entry]));
  const materialsById = new Map(
    acceptedCompilation.model.materialStates.map((entry) => [entry.materialStateId, entry]),
  );
  const sectionsById = new Map(
    acceptedCompilation.model.sectionStates.map((entry) => [entry.sectionStateId, entry]),
  );
  const existingPrimitiveIds = new Set(acceptedLoadCase.primitives.map((primitive) => primitive.primitiveId));
  const generatedPrimitives = [];
  const derivations = [];
  const needsDeclaredWeight = gravityPrimitives.some((gravity) =>
    gravity.includedMassSources.some((source) => source !== PIPE_WALL_MASS_SOURCE));
  const distributedWeights = needsDeclaredWeight
    ? indexDistributedWeightPrimitives(acceptedLoadCase)
    : new Map();

  for (const gravity of gravityPrimitives) {
    if (gravity.includedMassSources.includes(PIPE_WALL_MASS_SOURCE)) {
      for (const element of modelElements) {
        if (pipeWallExclusions.has(element.elementId)) continue;
        const generated = expandPipeWallSource({
          acceptedCompilation,
          gravity,
          element,
          materialsById,
          sectionsById,
          existingPrimitiveIds,
        });
        generatedPrimitives.push(generated.primitive);
        derivations.push(generated.derivation);
      }
    }
    const declaredSources = gravity.includedMassSources
      .filter((source) => source !== PIPE_WALL_MASS_SOURCE)
      .sort(compareAscii);
    for (const massSource of declaredSources) {
      for (const element of modelElements) {
        const generated = expandDeclaredDistributedWeightSource({
          acceptedCompilation,
          gravity,
          element,
          massSource,
          distributedWeights,
          existingPrimitiveIds,
        });
        generatedPrimitives.push(generated.primitive);
        derivations.push(generated.derivation);
      }
    }
  }

  generatedPrimitives.sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  derivations.sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  const expandedLoadCase = expandLoadCase(acceptedLoadCase, generatedPrimitives);
  const declaredDistributedLoads = acceptedLoadCase.primitives
    .filter((primitive) => primitive.kind === 'DISTRIBUTED_LOAD')
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  const boundDistributedLoads = [...declaredDistributedLoads, ...generatedPrimitives]
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  const generatedByElement = groupByElement(boundDistributedLoads);
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
    boundDeclaredDistributedLoadPrimitiveIds: declaredDistributedLoads.map((primitive) => primitive.primitiveId),
    derivations,
    pipeWallExcludedElementIds: [...pipeWallExclusions].sort(compareAscii),
  });
}

function expandPipeWallSource({
  acceptedCompilation,
  gravity,
  element,
  materialsById,
  sectionsById,
  existingPrimitiveIds,
}) {
  const material = materialsById.get(element.materialStateId);
  const section = sectionsById.get(element.sectionStateId);
  if (material === undefined || section === undefined) {
    failLinearPipingAnalysis(
      `Element ${element.elementId} lacks the compiled material or section state required for PIPE_WALL gravity expansion.`,
      'PIPING_ANALYSIS_GRAVITY_BINDING_MISSING',
      { elementId: element.elementId },
    );
  }
  const primitiveId = generatedPipeWallPrimitiveId(gravity.primitiveId, element.elementId);
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
  const intensity = gravityIntensity(gravity, lineWeight);
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
  return deepFreeze({
    primitive: requireLoadPrimitive(draft),
    derivation: deepFreeze({ primitiveId, sourceEvidence, ...derivation }),
  });
}

function requireImplementedMassSources(gravity) {
  const unsupported = gravity.includedMassSources
    .filter((source) => !SUPPORTED_MASS_SOURCES.has(source))
    .sort(compareAscii);
  if (unsupported.length > 0) {
    throw new PhysicalLoadCaseError(
      `Gravity primitive ${gravity.primitiveId} declares unsupported mass source(s) ${unsupported.join(', ')}; gravity is not partially applied.`,
      GRAVITY_MASS_SOURCE_NOT_IMPLEMENTED_CODE,
    );
  }
}

function generatedPipeWallPrimitiveId(gravityPrimitiveId, elementId) {
  return `LP-M007-${gravityPrimitiveId}-${elementId}`;
}
