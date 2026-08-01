/** Governed stage-to-component bindings for the LAFEA composition root. */

export const LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA =
  'lafea-stage-composition-binding/v1';

export const LAFEA_RELEASE_STATE_BINDINGS = Object.freeze([
  'RELEASE_NOT_QUALIFIED',
]);

export const LAFEA_BENCHMARK_BINDING_STATES = Object.freeze([
  'REGISTERED_MANIFESTS',
  'NO_GOVERNED_MANIFEST_REGISTERED',
]);

export const LAFEA_TECHNICAL_COMPONENT_KINDS = Object.freeze([
  'NORMALIZER',
  'CANONICALIZER',
  'CALCULATOR',
  'ACCEPTANCE',
  'PRESENTER',
  'UNIT_RESOLVER',
]);

export const LAFEA_TECHNICAL_COMPONENT_IDS = deepFreeze({
  normalizer: {
    foundation: 'LAFEA.COMPONENT.NORMALIZER.ATTACHMENT_FOUNDATION/V1',
    screening: 'LAFEA.COMPONENT.NORMALIZER.PIPE_SECTION_SCREENING/V1',
    continuum: 'LAFEA.COMPONENT.NORMALIZER.CONTINUUM_2D/V1',
    shell: 'LAFEA.COMPONENT.NORMALIZER.THIN_SHELL/V1',
    trunnion: 'LAFEA.COMPONENT.NORMALIZER.TRUNNION_FOOTPRINT/V1',
    unsupported: 'LAFEA.COMPONENT.NORMALIZER.UNSUPPORTED_PLACEHOLDER/V1',
  },
  canonicalizer: {
    foundation: 'LAFEA.COMPONENT.CANONICALIZER.ATTACHMENT_FOUNDATION/V1',
    screening: 'LAFEA.COMPONENT.CANONICALIZER.PIPE_SECTION_SCREENING/V1',
    continuum: 'LAFEA.COMPONENT.CANONICALIZER.CONTINUUM_2D/V1',
    shell: 'LAFEA.COMPONENT.CANONICALIZER.THIN_SHELL/V1',
    trunnion: 'LAFEA.COMPONENT.CANONICALIZER.TRUNNION_FOOTPRINT/V1',
  },
  calculator: {
    foundation: 'LAFEA.COMPONENT.CALCULATOR.ATTACHMENT_FOUNDATION/V1',
    screening: 'LAFEA.COMPONENT.CALCULATOR.PIPE_SECTION_SCREENING/V1',
    continuum: 'LAFEA.COMPONENT.CALCULATOR.CONTINUUM_2D/V1',
    shell: 'LAFEA.COMPONENT.CALCULATOR.THIN_SHELL/V1',
    trunnion: 'LAFEA.COMPONENT.CALCULATOR.TRUNNION_FOOTPRINT/V1',
  },
  acceptance: {
    state: 'LAFEA.COMPONENT.ACCEPTANCE.QUALIFICATION_STATE/V1',
    boolean: 'LAFEA.COMPONENT.ACCEPTANCE.QUALIFICATION_BOOLEAN/V1',
  },
  presenter: {
    foundation: 'LAFEA.COMPONENT.PRESENTER.ATTACHMENT_FOUNDATION/V1',
    screening: 'LAFEA.COMPONENT.PRESENTER.PIPE_SECTION_SCREENING/V1',
    continuum: 'LAFEA.COMPONENT.PRESENTER.CONTINUUM_2D/V1',
    shell: 'LAFEA.COMPONENT.PRESENTER.THIN_SHELL/V1',
    trunnion: 'LAFEA.COMPONENT.PRESENTER.TRUNNION_FOOTPRINT/V1',
  },
  unitResolver: {
    document: 'LAFEA.COMPONENT.UNITS.DOCUMENT/V1',
    foundation: 'LAFEA.COMPONENT.UNITS.FOUNDATION_CANONICAL/V1',
    shellTemplate: 'LAFEA.COMPONENT.UNITS.SHELL_TEMPLATE/V1',
  },
});

const IDS = LAFEA_TECHNICAL_COMPONENT_IDS;

export const LAFEA_STAGE_COMPOSITION_BINDINGS = deepFreeze([
  binding('LAFEA.1', 'LAFEA.COMPOSITION.ATTACHMENT_FOUNDATION/V1', {
    normalizer: IDS.normalizer.foundation,
    canonicalizer: IDS.canonicalizer.foundation,
    calculator: IDS.calculator.foundation,
    acceptance: IDS.acceptance.state,
    presenter: IDS.presenter.foundation,
    unitResolver: IDS.unitResolver.document,
  }, 'ANALYTICAL_FOUNDATION_V1', []),
  binding('LAFEA.2', 'LAFEA.COMPOSITION.PIPE_SECTION_SCREENING/V1', {
    normalizer: IDS.normalizer.screening,
    canonicalizer: IDS.canonicalizer.screening,
    calculator: IDS.calculator.screening,
    acceptance: IDS.acceptance.state,
    presenter: IDS.presenter.screening,
    unitResolver: IDS.unitResolver.foundation,
  }, 'ANALYTICAL_SCREENING_V1', []),
  binding('LAFEA.3', 'LAFEA.COMPOSITION.CONTINUUM_2D/V1', {
    normalizer: IDS.normalizer.continuum,
    canonicalizer: IDS.canonicalizer.continuum,
    calculator: IDS.calculator.continuum,
    acceptance: IDS.acceptance.state,
    presenter: IDS.presenter.continuum,
    unitResolver: IDS.unitResolver.document,
  }, 'FEA_MESH_RECOVERY_V1', [
    'CONT-PATCH-01',
    'CONT-CYL-01',
    'CONT-HOLE-01',
  ]),
  binding('LAFEA.4', 'LAFEA.COMPOSITION.THIN_SHELL/V1', {
    normalizer: IDS.normalizer.shell,
    canonicalizer: IDS.canonicalizer.shell,
    calculator: IDS.calculator.shell,
    acceptance: IDS.acceptance.boolean,
    presenter: IDS.presenter.shell,
    unitResolver: IDS.unitResolver.document,
  }, 'FEA_MESH_RECOVERY_V1', [
    'SHELL-PATCH-01',
    'SHELL-BEND-01',
  ]),
  binding('LAFEA.5', 'LAFEA.COMPOSITION.TRUNNION_FOOTPRINT/V1', {
    normalizer: IDS.normalizer.trunnion,
    canonicalizer: IDS.canonicalizer.trunnion,
    calculator: IDS.calculator.trunnion,
    acceptance: IDS.acceptance.boolean,
    presenter: IDS.presenter.trunnion,
    unitResolver: IDS.unitResolver.shellTemplate,
  }, 'FEA_MESH_RECOVERY_V1', []),
  binding('LAFEA.6', 'LAFEA.COMPOSITION.UNSUPPORTED_WELD_PROFILE/V1', {
    normalizer: IDS.normalizer.unsupported,
    canonicalizer: null,
    calculator: null,
    acceptance: null,
    presenter: null,
    unitResolver: null,
  }, 'UNSUPPORTED_STAGE_V1', []),
]);

export function requireLafeaStageCompositionBinding(stageId) {
  const bindingValue = LAFEA_STAGE_COMPOSITION_BINDINGS
    .find((row) => row.stageId === stageId);
  if (!bindingValue) {
    throw new TypeError(`No LAFEA composition binding is registered for ${stageId}.`);
  }
  return bindingValue;
}

function binding(stageId, compositionRootId, componentIds, lifecycleProfileId,
  benchmarkManifestIds) {
  return {
    schema: LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA,
    stageId,
    compositionRootId,
    componentIds,
    lifecycleProfileId,
    benchmarkManifestIds,
    benchmarkBindingState: benchmarkManifestIds.length
      ? 'REGISTERED_MANIFESTS'
      : 'NO_GOVERNED_MANIFEST_REGISTERED',
    releaseStateBinding: 'RELEASE_NOT_QUALIFIED',
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
