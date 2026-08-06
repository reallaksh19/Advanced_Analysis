import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { requireFrameElement } from '../linear-fea-frame-element/index.js';
import { requireLoadPrimitive, requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { requirePipeSectionResolution } from '../linear-fea-section/index.js';
import { requireTraceableDeclaredValue } from '../linear-fea-b31-code-engine/index.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { failCodeApplication } from './contracts.js';

export const PRESSURE_STRESS_CONFLICT_CODE = 'PIPING_B31_PRESSURE_STRESS_CONFLICT';
export const PRESSURE_EFFECT_NOT_IMPLEMENTED_CODE = 'PIPING_B31_PRESSURE_EFFECT_NOT_IMPLEMENTED';
export const PRESSURE_BASIS_NOT_DERIVABLE_CODE = 'PIPING_B31_PRESSURE_BASIS_NOT_DERIVABLE';
export const PRESSURE_CODE_STRESS_NOT_AUTHORIZED_CODE = 'PIPING_B31_PRESSURE_CODE_STRESS_NOT_AUTHORIZED';
export const LONGITUDINAL_PRESSURE_STRESS_FORMULA_ID =
  'THIN_WALL_LONGITUDINAL_PRESSURE_STRESS_OD_V1';

const UNIMPLEMENTED_PRESSURE_EFFECT_CODES = Object.freeze({
  pressureStiffening: 'PIPING_B31_PRESSURE_STIFFENING_NOT_IMPLEMENTED',
  axialThrust: 'PIPING_B31_PRESSURE_AXIAL_THRUST_NOT_IMPLEMENTED',
  bourdon: 'PIPING_B31_PRESSURE_BOURDON_NOT_IMPLEMENTED',
});
const UNIMPLEMENTED_PRESSURE_EFFECTS = Object.freeze(
  Object.keys(UNIMPLEMENTED_PRESSURE_EFFECT_CODES),
);
const PRESSURE_EFFECT_KEYS = Object.freeze([
  'codeStress', 'pressureStiffening', 'axialThrust', 'bourdon',
]);

function requirePressurePrimitive(value) {
  const primitive = requireLoadPrimitive(value);
  if (primitive.kind !== 'PRESSURE') {
    failCodeApplication(
      'pressurePrimitive must be a sealed PRESSURE load primitive.',
      'PIPING_B31_PRESSURE_PRIMITIVE_REQUIRED',
    );
  }
  return primitive;
}

function unsupportedEffectLimitations(primitive) {
  return UNIMPLEMENTED_PRESSURE_EFFECTS
    .filter((effect) => primitive.authorizedEffects[effect] === true)
    .map((effect) => deepFreeze({
      code: UNIMPLEMENTED_PRESSURE_EFFECT_CODES[effect],
      status: 'BLOCKED',
      effect,
      primitiveId: primitive.primitiveId,
      elementId: primitive.elementId,
      disclosure: `PRESSURE effect ${effect} is authorized but is not implemented by the linear piping code-application layer.`,
    }));
}

function requireNoUnsupportedEffects(primitive) {
  const limitations = unsupportedEffectLimitations(primitive);
  if (limitations.length > 0) {
    failCodeApplication(
      `PRESSURE primitive ${primitive.primitiveId} authorizes unimplemented effects.`,
      PRESSURE_EFFECT_NOT_IMPLEMENTED_CODE,
      { primitiveId: primitive.primitiveId, elementId: primitive.elementId, limitations },
    );
  }
}

function requirePressureCustody(value) {
  if (!isPlainRecord(value)) {
    failCodeApplication(
      'pressureCustody must be a portable record.',
      'PIPING_B31_PRESSURE_CUSTODY_INVALID',
    );
  }
  for (const key of [
    'primitiveId', 'primitiveSemanticHash', 'elementId', 'pressure',
    'pressureBasis', 'authorizedEffects', 'structuralEffect', 'futureUse',
  ]) {
    if (!Object.hasOwn(value, key)) {
      failCodeApplication(
        `pressureCustody is missing ${key}.`,
        'PIPING_B31_PRESSURE_CUSTODY_INVALID',
      );
    }
  }
  if (typeof value.primitiveId !== 'string' || value.primitiveId.length === 0
    || typeof value.primitiveSemanticHash !== 'string'
    || value.primitiveSemanticHash.length === 0
    || typeof value.elementId !== 'string' || value.elementId.length === 0
    || typeof value.pressure !== 'number' || !Number.isFinite(value.pressure)
    || !['GAUGE', 'ABSOLUTE'].includes(value.pressureBasis)
    || !isPlainRecord(value.authorizedEffects)
    || value.structuralEffect !== 'NONE'
    || value.futureUse !== 'CODE_STRESS_CUSTODY_ONLY') {
    failCodeApplication(
      'pressureCustody is invalid or authorizes a structural effect.',
      'PIPING_B31_PRESSURE_CUSTODY_INVALID',
    );
  }
  for (const key of PRESSURE_EFFECT_KEYS) {
    if (typeof value.authorizedEffects[key] !== 'boolean') {
      failCodeApplication(
        `pressureCustody.authorizedEffects.${key} must be boolean.`,
        'PIPING_B31_PRESSURE_CUSTODY_INVALID',
      );
    }
  }
  return value;
}

function requireCodeStressAuthority(primitive) {
  requireNoUnsupportedEffects(primitive);
  if (primitive.authorizedEffects.codeStress !== true) {
    failCodeApplication(
      `PRESSURE primitive ${primitive.primitiveId} does not authorize codeStress.`,
      PRESSURE_CODE_STRESS_NOT_AUTHORIZED_CODE,
      { primitiveId: primitive.primitiveId, elementId: primitive.elementId },
    );
  }
  if (primitive.pressureBasis !== 'GAUGE') {
    failCodeApplication(
      `PRESSURE primitive ${primitive.primitiveId} uses ${primitive.pressureBasis}; longitudinal pressure stress requires a gauge-pressure differential and no ambient-pressure authority was supplied.`,
      PRESSURE_BASIS_NOT_DERIVABLE_CODE,
      {
        primitiveId: primitive.primitiveId,
        elementId: primitive.elementId,
        pressureBasis: primitive.pressureBasis,
      },
    );
  }
}

function deriveLongitudinalPressureStress(primitive, sectionResolution) {
  const section = requirePipeSectionResolution(sectionResolution);
  requireCodeStressAuthority(primitive);
  const { outerDiameter, wallThickness } = section.dimensions;
  const value = (primitive.pressure * outerDiameter) / (4 * wallThickness);
  if (!Number.isFinite(value)) {
    failCodeApplication(
      'Derived longitudinal pressure stress is non-finite.',
      'PIPING_B31_PRESSURE_STRESS_NONFINITE',
      { primitiveId: primitive.primitiveId, elementId: primitive.elementId },
    );
  }
  return deepFreeze({
    value,
    source: `${LONGITUDINAL_PRESSURE_STRESS_FORMULA_ID}:${primitive.primitiveId}:${primitive.primitiveSemanticHash ?? primitive.semanticHash}:${section.semanticHash}`,
  });
}

export function derivePressureStressContribution({ pressurePrimitive, sectionResolution }) {
  const primitive = requirePressurePrimitive(pressurePrimitive);
  return deriveLongitudinalPressureStress(primitive, sectionResolution);
}

export function derivePressureStressContributionFromCustody({
  pressureCustody,
  sectionResolution,
}) {
  const custody = requirePressureCustody(pressureCustody);
  return deriveLongitudinalPressureStress(custody, sectionResolution);
}

export function resolvePressureStressContribution({
  loadCase,
  frameElementRecord,
  sectionResolution,
  suppliedContribution,
}) {
  const acceptedLoadCase = requirePhysicalLoadCase(loadCase);
  const element = requireFrameElement(frameElementRecord);
  const pressurePrimitive = acceptedLoadCase.primitives.find(
    (primitive) => primitive.kind === 'PRESSURE' && primitive.elementId === element.elementId,
  );
  if (pressurePrimitive === undefined) return suppliedContribution;

  requireNoUnsupportedEffects(pressurePrimitive);
  if (pressurePrimitive.authorizedEffects.codeStress !== true) return suppliedContribution;

  const derived = derivePressureStressContribution({ pressurePrimitive, sectionResolution });
  if (suppliedContribution !== null) {
    const supplied = requireTraceableDeclaredValue(
      requireDeclaredValue(
        { pressureStressContribution: suppliedContribution },
        'pressureStressContribution',
        {},
      ),
      'pressureStressContribution',
      'CODE_ENGINE_SOURCE_NOT_TRACEABLE',
    );
    if (supplied.value !== derived.value) {
      failCodeApplication(
        'Caller-supplied pressureStressContribution conflicts with the value derived from the cited PRESSURE primitive and section resolution.',
        PRESSURE_STRESS_CONFLICT_CODE,
        {
          primitiveId: pressurePrimitive.primitiveId,
          elementId: pressurePrimitive.elementId,
          supplied: { value: supplied.value, source: supplied.source },
          derived,
        },
      );
    }
  }
  return derived;
}
