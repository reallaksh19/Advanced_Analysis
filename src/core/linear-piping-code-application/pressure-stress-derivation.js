import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { requireFrameElement } from '../linear-fea-frame-element/index.js';
import { requireLoadPrimitive, requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { requirePipeSectionResolution } from '../linear-fea-section/index.js';
import { requireTraceableDeclaredValue } from '../linear-fea-b31-code-engine/index.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
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

/**
 * Derive the thin-wall longitudinal pressure-stress contribution for one pipe.
 *
 * The convention is S = P * Do / (4 * t), using gauge pressure and the outer
 * diameter / nominal wall thickness retained by the sealed B-2.3 section
 * resolution. No section property is reconstructed in this package.
 *
 * @param {object} args
 * @param {Readonly<object>} args.pressurePrimitive Sealed PRESSURE primitive.
 * @param {Readonly<object>} args.sectionResolution Sealed B-2.3 pipe-section resolution.
 * @returns {Readonly<{value:number, source:string}>}
 */
export function derivePressureStressContribution({ pressurePrimitive, sectionResolution }) {
  const primitive = requirePressurePrimitive(pressurePrimitive);
  const section = requirePipeSectionResolution(sectionResolution);
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
    source: `${LONGITUDINAL_PRESSURE_STRESS_FORMULA_ID}:${primitive.primitiveId}:${primitive.semanticHash}:${section.semanticHash}`,
  });
}

/**
 * Resolve the B31 check input from its cited physical case. With no matching
 * PRESSURE primitive, the existing explicit caller-supply path is unchanged.
 */
export function resolvePressureStressContribution({
  loadCase,
  frameElementRecord,
  sectionResolution,
  suppliedContribution,
}) {
  const acceptedLoadCase = requirePhysicalLoadCase(loadCase);
  const element = requireFrameElement(frameElementRecord);
  const pressurePrimitives = acceptedLoadCase.primitives.filter(
    (primitive) => primitive.kind === 'PRESSURE',
  );
  pressurePrimitives.forEach(requireNoUnsupportedEffects);
  const pressurePrimitive = pressurePrimitives.find(
    (primitive) => primitive.elementId === element.elementId,
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
