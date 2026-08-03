import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import {
  computePipingComponentSemanticHash,
  requirePipingComponent,
} from '../linear-fea-piping-components/index.js';
import { compareAscii, failLinearPipingAnalysis } from './validation.js';
import {
  THERMAL_TEMPERATURE_COLLISION_CODE,
  THERMAL_TEMPERATURE_MISSING_CODE,
  augmentFrameElementTemperature,
} from './thermal-expansion-element-augmentation.js';

export {
  THERMAL_TEMPERATURE_COLLISION_CODE,
  THERMAL_TEMPERATURE_MISSING_CODE,
};

/**
 * Bind sealed TEMPERATURE primitives into already-built piping-component
 * elements. A component element with no explicitly targeted primitive is left
 * untouched; straight-run element targets are deliberately ignored here.
 */
export function augmentPipingComponentTemperatureAuthorities({
  compilation,
  loadCase,
  pipingComponents,
}) {
  const acceptedCompilation = requireMechanicalModelCompilation(compilation);
  const acceptedLoadCase = requirePhysicalLoadCase(loadCase);
  const acceptedComponents = pipingComponents.map(requirePipingComponent);
  const componentByElement = new Map();
  for (const component of acceptedComponents) {
    for (const entry of component.elements) {
      componentByElement.set(entry.elementId, component.componentId);
    }
  }

  const temperaturesByElement = indexComponentTemperatures(
    acceptedLoadCase,
    new Set(componentByElement.keys()),
  );
  if (temperaturesByElement.size === 0) {
    return deepFreeze({
      loadCase: acceptedLoadCase,
      pipingComponents: acceptedComponents,
      bindings: [],
    });
  }

  const modelElementsById = new Map(
    acceptedCompilation.model.elements.map((entry) => [entry.elementId, entry]),
  );
  const augmentedComponents = acceptedComponents
    .map((component) => augmentPipingComponentTemperature(
      component,
      temperaturesByElement,
      modelElementsById,
    ))
    .sort((left, right) => compareAscii(left.componentId, right.componentId));
  const augmentedByElement = new Map(
    augmentedComponents.flatMap((component) =>
      component.elements.map((entry) => [entry.elementId, entry.frameElement])),
  );
  const bindings = [...temperaturesByElement.entries()]
    .map(([elementId, primitive]) => deepFreeze({
      componentId: componentByElement.get(elementId),
      elementId,
      primitiveId: primitive.primitiveId,
      primitiveSemanticHash: primitive.semanticHash,
      frameElementSemanticHash: augmentedByElement.get(elementId).semanticHash,
    }))
    .sort((left, right) => compareAscii(left.elementId, right.elementId));

  return deepFreeze({
    loadCase: acceptedLoadCase,
    pipingComponents: augmentedComponents,
    bindings,
  });
}

function indexComponentTemperatures(loadCase, componentElementIds) {
  const result = new Map();
  const primitives = loadCase.primitives
    .filter((primitive) =>
      primitive.kind === 'TEMPERATURE' && componentElementIds.has(primitive.elementId))
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  for (const primitive of primitives) {
    const existing = result.get(primitive.elementId);
    if (existing !== undefined) {
      failLinearPipingAnalysis(
        `Load case ${loadCase.loadCaseId} declares multiple TEMPERATURE primitives for piping-component element ${primitive.elementId}.`,
        THERMAL_TEMPERATURE_COLLISION_CODE,
        {
          loadCaseId: loadCase.loadCaseId,
          elementId: primitive.elementId,
          primitiveIds: [existing.primitiveId, primitive.primitiveId].sort(compareAscii),
        },
      );
    }
    result.set(primitive.elementId, primitive);
  }
  return result;
}

function augmentPipingComponentTemperature(component, temperaturesByElement, modelElementsById) {
  let changed = false;
  const elements = component.elements.map((entry) => {
    const temperature = temperaturesByElement.get(entry.elementId);
    if (temperature === undefined) return entry;
    changed = true;
    return {
      ...entry,
      frameElement: augmentFrameElementTemperature(
        entry.frameElement,
        [temperature],
        modelElementsById.get(entry.elementId),
      ),
    };
  });
  if (!changed) return component;
  const draft = { ...component, elements, semanticHash: '' };
  draft.semanticHash = computePipingComponentSemanticHash(draft);
  return requirePipingComponent(draft);
}
