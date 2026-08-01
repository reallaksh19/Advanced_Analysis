/** Concrete technical components referenced by the LAFEA composition bindings. */
import {
  calculateLocalAttachmentFoundation,
  createCanonicalLocalAttachmentFoundationModel,
  MODEL_SCHEMA as ATTACHMENT_MODEL_SCHEMA,
  validateCanonicalLocalAttachmentFoundationModel,
} from '../core/local-stress/index.js';
import {
  calculateLocalAttachmentScreening,
  createLocalAttachmentScreeningRequest,
  validateLocalAttachmentScreeningRequest,
} from '../core/local-attachment-screening/index.js';
import {
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
  MODEL_SCHEMA as CONTINUUM_MODEL_SCHEMA,
  validateCanonicalLocalContinuumModel,
} from '../core/local-continuum/index.js';
import {
  calculateLocalShell,
  createCanonicalLocalShellModel,
  validateCanonicalLocalShellModel,
} from '../core/local-shell/index.js';
import {
  calculateLocalTrunnionFootprint,
  canonicalShellTemplateSemanticHash,
  createCanonicalTrunnionFootprintModel,
  createCanonicalTrunnionFootprintSource,
} from '../core/local-trunnion-footprint/index.js';
import { presentAttachmentScreening } from './lafea-result-presenters/attachment-screening.js';
import { presentLocalContinuum } from './lafea-result-presenters/local-continuum.js';
import { presentLocalShell } from './lafea-result-presenters/local-shell.js';
import { presentLocalStress } from './lafea-result-presenters/local-stress.js';
import { presentTrunnionFootprint } from './lafea-result-presenters/trunnion-footprint.js';
import { LAFEA_TECHNICAL_COMPONENT_IDS as IDS } from './lafea-stage-composition-bindings.js';

const COMPONENTS = Object.freeze({
  NORMALIZER: Object.freeze({
    [IDS.normalizer.foundation]: normalizeFoundation,
    [IDS.normalizer.screening]: normalizeScreening,
    [IDS.normalizer.continuum]: normalizeContinuum,
    [IDS.normalizer.shell]: normalizeShell,
    [IDS.normalizer.trunnion]: normalizeTrunnion,
    [IDS.normalizer.unsupported]: normalizeUnsupported,
  }),
  CANONICALIZER: Object.freeze({
    [IDS.canonicalizer.foundation]: canonicalFoundation,
    [IDS.canonicalizer.screening]: canonicalScreening,
    [IDS.canonicalizer.continuum]: canonicalContinuum,
    [IDS.canonicalizer.shell]: canonicalShell,
    [IDS.canonicalizer.trunnion]: canonicalTrunnion,
  }),
  CALCULATOR: Object.freeze({
    [IDS.calculator.foundation]: calculateLocalAttachmentFoundation,
    [IDS.calculator.screening]: calculateLocalAttachmentScreening,
    [IDS.calculator.continuum]: calculateLocalContinuum,
    [IDS.calculator.shell]: calculateLocalShell,
    [IDS.calculator.trunnion]: calculateLocalTrunnionFootprint,
  }),
  ACCEPTANCE: Object.freeze({
    [IDS.acceptance.state]: (result) => result?.qualification?.state === 'ACCEPTED',
    [IDS.acceptance.boolean]: (result) => result?.qualification?.accepted === true,
  }),
  PRESENTER: Object.freeze({
    [IDS.presenter.foundation]: presentLocalStress,
    [IDS.presenter.screening]: presentAttachmentScreening,
    [IDS.presenter.continuum]: presentLocalContinuum,
    [IDS.presenter.shell]: presentLocalShell,
    [IDS.presenter.trunnion]: presentTrunnionFootprint,
  }),
  UNIT_RESOLVER: Object.freeze({
    [IDS.unitResolver.document]: (documentValue) => documentValue?.units,
    [IDS.unitResolver.foundation]: (documentValue) => documentValue?.sourceEvidence
      ?.foundationModel?.units?.canonical,
    [IDS.unitResolver.shellTemplate]: (documentValue) => documentValue?.shellTemplate?.units,
  }),
});

export function requireLafeaTechnicalComponent(kind, componentId) {
  const group = COMPONENTS[kind];
  if (!group) throw new TypeError(`Unsupported LAFEA technical component kind: ${kind}.`);
  const component = group[componentId];
  if (typeof component !== 'function') {
    throw new TypeError(`No LAFEA ${kind} component is registered for ${componentId}.`);
  }
  return component;
}

export function lafeaTechnicalComponentRegistered(kind, componentId) {
  return typeof COMPONENTS[kind]?.[componentId] === 'function';
}

function normalizeFoundation(input) {
  const { cleanInput, meshConfig } = prepareInput(input);
  const source = isRecord(cleanInput.sourceEvidence)
    ? {
      ...validateCanonicalLocalAttachmentFoundationModel(cleanInput).sourceEvidence,
      schema: ATTACHMENT_MODEL_SCHEMA,
    }
    : cleanInput;
  const retained = createCanonicalLocalAttachmentFoundationModel(source).sourceEvidence;
  return freezeClone({
    ...retained,
    schema: ATTACHMENT_MODEL_SCHEMA,
    ...(meshConfig ? { meshConfig } : {}),
  });
}

function normalizeScreening(input) {
  const { cleanInput, meshConfig } = prepareInput(input);
  const source = typeof cleanInput.semanticHash === 'string'
    ? validateLocalAttachmentScreeningRequest(cleanInput)
    : cleanInput;
  const retained = editableScreening(createLocalAttachmentScreeningRequest(source));
  return freezeClone({ ...retained, ...(meshConfig ? { meshConfig } : {}) });
}

function normalizeContinuum(input) {
  const { cleanInput, meshConfig } = prepareInput(input);
  const source = isRecord(cleanInput.sourceEvidence)
    ? {
      ...validateCanonicalLocalContinuumModel(cleanInput).sourceEvidence,
      schema: CONTINUUM_MODEL_SCHEMA,
    }
    : cleanInput;
  const retained = createCanonicalLocalContinuumModel(source).sourceEvidence;
  return freezeClone({
    ...retained,
    schema: CONTINUUM_MODEL_SCHEMA,
    ...(meshConfig ? { meshConfig } : {}),
  });
}

function normalizeShell(input) {
  const { cleanInput, meshConfig } = prepareInput(input);
  const source = typeof cleanInput.semanticHash === 'string'
    ? withoutHash(validateCanonicalLocalShellModel(cleanInput))
    : withoutHash(cleanInput);
  const retained = withoutHash(createCanonicalLocalShellModel(source));
  return freezeClone({ ...retained, ...(meshConfig ? { meshConfig } : {}) });
}

function normalizeTrunnion(input, mode = 'document') {
  const { cleanInput, meshConfig } = prepareInput(input);
  if (mode === 'edit' && isRecord(cleanInput.sourceAncestry) && isRecord(cleanInput.shellTemplate)) {
    cleanInput.sourceAncestry.shellTemplateSemanticHash =
      canonicalShellTemplateSemanticHash(cleanInput.shellTemplate);
  }
  const retained = createCanonicalTrunnionFootprintSource(cleanInput);
  createCanonicalTrunnionFootprintModel(retained);
  return freezeClone({ ...retained, ...(meshConfig ? { meshConfig } : {}) });
}

function normalizeUnsupported(input) {
  const { cleanInput, meshConfig } = prepareInput(input);
  return freezeClone({ ...cleanInput, ...(meshConfig ? { meshConfig } : {}) });
}

function canonicalFoundation(source) {
  return createCanonicalLocalAttachmentFoundationModel(stripWorkbenchFields(source));
}

function canonicalScreening(source) {
  return createLocalAttachmentScreeningRequest(stripWorkbenchFields(source));
}

function canonicalContinuum(source) {
  return createCanonicalLocalContinuumModel(stripWorkbenchFields(source));
}

function canonicalShell(source) {
  return createCanonicalLocalShellModel(stripWorkbenchFields(source));
}

function canonicalTrunnion(source) {
  return createCanonicalTrunnionFootprintSource(stripWorkbenchFields(source));
}

function prepareInput(input) {
  const source = cloneRecord(input);
  const meshConfig = isRecord(source.meshConfig) ? cloneRecord(source.meshConfig) : undefined;
  return { cleanInput: stripWorkbenchFields(source), meshConfig };
}

function stripWorkbenchFields(input) {
  if (!isRecord(input)) return input;
  const { meshConfig, ...kernelSource } = input;
  return kernelSource;
}

function editableScreening(input) {
  const result = withoutHash(input);
  if (Array.isArray(result.evaluationLocations)) {
    result.evaluationLocations = result.evaluationLocations.map((row) => {
      const copy = cloneRecord(row);
      delete copy.radius;
      return copy;
    });
  }
  return result;
}

function withoutHash(value) {
  const result = cloneRecord(value);
  delete result.semanticHash;
  return result;
}

function cloneRecord(value) {
  if (!isRecord(value)) throw new TypeError('LAFEA document must be a JSON object.');
  return structuredClone(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freezeClone(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
