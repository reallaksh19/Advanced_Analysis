/** Single runtime composition root for every registered LAFEA stage. */
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import { requireLafeaTechnicalComponent } from './lafea-stage-components.js';

export const LAFEA_STAGE_COMPOSITION_SCHEMA = 'lafea-stage-composition/v1';

export function requireLafeaStageComposition(stageId) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  const binding = entry.composition;
  const profile = requireLafeaLifecycleProfileForStage(stageId);
  if (binding.lifecycleProfileId !== profile.profileId) {
    throw new TypeError(
      `${stageId} composition lifecycle binding does not match ${profile.profileId}.`,
    );
  }
  const executionSupported = entry.engineState === 'QUALIFIED_ROUTE_REGISTERED';
  validateExecutionBinding(stageId, binding.componentIds, executionSupported);
  const productAssessmentSupported =
    typeof binding.componentIds.productAssessment === 'string';
  const handoffSupported = typeof binding.componentIds.handoff === 'string';
  return Object.freeze({
    schema: LAFEA_STAGE_COMPOSITION_SCHEMA,
    stageId,
    compositionRootId: binding.compositionRootId,
    registryEntry: entry,
    lifecycleProfileId: binding.lifecycleProfileId,
    benchmarkManifestIds: binding.benchmarkManifestIds,
    benchmarkBindingState: binding.benchmarkBindingState,
    releaseStateBinding: binding.releaseStateBinding,
    previewSource: entry.previewSource,
    executionSupported,
    productAssessmentSupported,
    handoffSupported,
    normalizeDocument: (input) => component('NORMALIZER', binding.componentIds.normalizer)(input, 'document'),
    normalizeEdit: (input) => component('NORMALIZER', binding.componentIds.normalizer)(input, 'edit'),
    canonicalize: executionSupported
      ? (input) => component('CANONICALIZER', binding.componentIds.canonicalizer)(input)
      : null,
    calculate: executionSupported
      ? (input) => component('CALCULATOR', binding.componentIds.calculator)(input)
      : null,
    acceptResult: executionSupported
      ? (result) => component('ACCEPTANCE', binding.componentIds.acceptance)(result)
      : null,
    presentResult: executionSupported
      ? (result, units) => component('PRESENTER', binding.componentIds.presenter)(result, units)
      : null,
    resolveUnits: executionSupported
      ? (documentValue) => normalizeUnits(
        stageId,
        component('UNIT_RESOLVER', binding.componentIds.unitResolver)(documentValue),
      )
      : null,
    evaluateProductAssessment: productAssessmentSupported
      ? (input) => component('PRODUCT_ASSESSMENT',
        binding.componentIds.productAssessment)(input)
      : null,
    createHandoff: handoffSupported
      ? (input) => component('HANDOFF', binding.componentIds.handoff)(input)
      : null,
  });
}

export function lafeaStageCompositionIdentity(stageId) {
  return requireLafeaStageComposition(stageId).compositionRootId;
}

function component(kind, componentId) {
  return requireLafeaTechnicalComponent(kind, componentId);
}

function validateExecutionBinding(stageId, componentIds, executionSupported) {
  const required = ['normalizer'];
  if (executionSupported) {
    required.push('canonicalizer', 'calculator', 'acceptance', 'presenter', 'unitResolver');
  }
  for (const key of required) {
    if (typeof componentIds[key] !== 'string' || !componentIds[key]) {
      throw new TypeError(`${stageId} composition is missing ${key}.`);
    }
  }
  if (!executionSupported) {
    for (const key of ['canonicalizer', 'calculator', 'acceptance', 'presenter', 'unitResolver']) {
      if (componentIds[key] !== null) {
        throw new TypeError(`${stageId} unsupported composition must not bind ${key}.`);
      }
    }
  }
  for (const key of ['productAssessment', 'handoff']) {
    if (componentIds[key] !== null
      && (typeof componentIds[key] !== 'string' || !componentIds[key])) {
      throw new TypeError(`${stageId} composition has invalid optional ${key}.`);
    }
  }
  if ((componentIds.productAssessment === null) !== (componentIds.handoff === null)) {
    throw new TypeError(`${stageId} product assessment and handoff bindings must be paired.`);
  }
}

function normalizeUnits(stageId, units) {
  if (!units || typeof units !== 'object') {
    throw new TypeError(`${stageId} source document has no explicit units.`);
  }
  return Object.freeze({
    length: units.length,
    force: units.force,
    moment: units.moment,
    stress: units.stress ?? units.pressure ?? units.modulus,
    rotation: units.rotation,
  });
}
