import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireFrameElement } from '../linear-fea-frame-element/index.js';
import {
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
  GRAVITY_PIPE_WALL_EXPANSION_ID,
  gravityDerivation,
  expandLoadCase,
  groupByElement,
  requirePositiveFinite,
  cleanNumber,
} from './gravity-expansion-primitives.js';

export { GRAVITY_PIPE_WALL_EXPANSION_ID };
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
  pipingComponents,
}) {
  const acceptedCompilation = requireMechanicalModelCompilation(compilation);
  const acceptedLoadCase = requirePhysicalLoadCase(loadCase);
  const acceptedFrameElements = frameElements.map(requireFrameElement);
  const acceptedComponents = (pipingComponents ?? []).map(requirePipingComponent);

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
