import { THERMAL_STRAIN_CONVENTION_ID, elementDofIndex } from '../linear-fea-contract/conventions.js';
import {
  UNIFORM_TEMPERATURE_LIMITATION_CODE,
  UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE,
  computeFrameElementSemanticHash,
  condenseEndConditions,
  frameLocalStiffness,
  frameOffsetMatrix,
  requireFrameElement,
  thermalInitialStrainVector,
  transformLoadToGlobal,
} from '../linear-fea-frame-element/index.js';
import { cleanVector } from '../linear-fea-frame-element/frame-element-stiffness.js';
import { requireLoadPrimitive } from '../linear-fea-load-case/index.js';
import { compareAscii, failLinearPipingAnalysis } from './validation.js';

export const THERMAL_TEMPERATURE_MISSING_CODE =
  'PIPING_ANALYSIS_THERMAL_TEMPERATURE_MISSING';
export const THERMAL_TEMPERATURE_COLLISION_CODE =
  'PIPING_ANALYSIS_THERMAL_TEMPERATURE_COLLISION';

/**
 * Augment one element selected for thermal coverage. The public consumer only
 * calls this for explicitly targeted elements; an empty coverage set is an
 * error rather than a silent zero when this lower-level operation is selected.
 */
export function augmentFrameElementTemperature(frameElement, temperaturePrimitives, modelElement) {
  const accepted = requireFrameElement(frameElement);
  if (!Array.isArray(temperaturePrimitives) || temperaturePrimitives.length === 0) {
    failLinearPipingAnalysis(
      `Piping-component element ${accepted.elementId} was selected for thermal augmentation without a matching TEMPERATURE primitive.`,
      THERMAL_TEMPERATURE_MISSING_CODE,
      { elementId: accepted.elementId },
    );
  }
  if (temperaturePrimitives.length > 1) {
    failLinearPipingAnalysis(
      `Piping-component element ${accepted.elementId} has multiple TEMPERATURE primitives.`,
      THERMAL_TEMPERATURE_COLLISION_CODE,
      {
        elementId: accepted.elementId,
        primitiveIds: temperaturePrimitives.map((entry) => entry.primitiveId).sort(compareAscii),
      },
    );
  }
  const temperature = requireLoadPrimitive(temperaturePrimitives[0]);
  if (temperature.kind !== 'TEMPERATURE' || temperature.elementId !== accepted.elementId) {
    failLinearPipingAnalysis(
      `Thermal augmentation for ${accepted.elementId} requires one matching TEMPERATURE primitive.`,
      THERMAL_TEMPERATURE_MISSING_CODE,
      { elementId: accepted.elementId, primitiveId: temperature.primitiveId },
    );
  }
  if (accepted.thermal !== null) {
    failLinearPipingAnalysis(
      `Piping-component element ${accepted.elementId} already carries thermal evidence.`,
      THERMAL_TEMPERATURE_COLLISION_CODE,
      { elementId: accepted.elementId, primitiveId: temperature.primitiveId },
    );
  }
  requireElementBinding(accepted, temperature, modelElement);

  const temperatureDifference = requireFinite(
    temperature.operatingTemperature - temperature.installationTemperature,
    'temperatureDifference',
  );
  const axialStrain = requireFinite(
    accepted.material.thermalExpansionCoefficient * temperatureDifference,
    'axialStrain',
  );
  const generatedLocal = thermalInitialStrainVector({
    elasticModulus: accepted.material.elasticModulus,
    area: accepted.section.area,
    axialStrain,
  });
  const base = frameLocalStiffness(stiffnessProperties(accepted));
  const endConditionEntries = [
    ...accepted.endConditions.releases.map((entry) => ({
      index: elementDofIndex(entry.end, entry.dof),
      stiffness: 0,
    })),
    ...accepted.endConditions.springs.map((entry) => ({
      index: elementDofIndex(entry.end, entry.dof),
      stiffness: entry.stiffness,
    })),
  ].sort((left, right) => left.index - right.index);
  const condensed = condenseEndConditions(base.matrix, [generatedLocal], endConditionEntries, 0);
  assertSameVectorOrMatrix(condensed.matrix, accepted.localStiffness, accepted.elementId, 'local stiffness');

  let generatedGlobal = transformLoadToGlobal(
    condensed.vectors[0],
    accepted.transformation.matrix,
  );
  if (accepted.rigidOffsets.I !== null || accepted.rigidOffsets.J !== null) {
    generatedGlobal = transformLoadToGlobal(
      generatedGlobal,
      frameOffsetMatrix(accepted.rigidOffsets),
    );
  }

  const limitation = uniformTemperatureLimitation(temperature.thermalStrainProfileId);
  const limitations = accepted.limitations.some((entry) => entry.code === limitation.code)
    ? [...accepted.limitations]
    : [...accepted.limitations, limitation].sort((left, right) => compareAscii(left.code, right.code));
  const draft = {
    ...accepted,
    initialStrainLoadVector: {
      local: cleanVector(accepted.initialStrainLoadVector.local
        .map((value, index) => value + condensed.vectors[0][index])),
      global: cleanVector(accepted.initialStrainLoadVector.global
        .map((value, index) => value + generatedGlobal[index])),
    },
    thermal: {
      primitiveId: temperature.primitiveId,
      primitiveSemanticHash: temperature.semanticHash,
      operatingTemperature: temperature.operatingTemperature,
      installationTemperature: temperature.installationTemperature,
      temperatureDifference,
      expansionCoefficient: accepted.material.thermalExpansionCoefficient,
      axialStrain,
      freeExtension: requireFinite(axialStrain * accepted.geometry.length, 'freeExtension'),
      approximationProfileId: temperature.thermalStrainProfileId,
      strainConvention: THERMAL_STRAIN_CONVENTION_ID,
    },
    limitations,
    semanticHash: '',
  };
  draft.semanticHash = computeFrameElementSemanticHash(draft);
  return requireFrameElement(draft);
}

function requireElementBinding(frameElement, temperature, modelElement) {
  if (modelElement === undefined
    || frameElement.material.materialStateId !== modelElement.materialStateId
    || frameElement.section.sectionStateId !== modelElement.sectionStateId) {
    failLinearPipingAnalysis(
      `Element ${frameElement.elementId} does not cite its compiled material/section binding.`,
      'PIPING_ANALYSIS_THERMAL_ELEMENT_BINDING_MISMATCH',
      { elementId: frameElement.elementId },
    );
  }
  if (temperature.stiffnessEvaluationMaterialStateId !== frameElement.material.materialStateId) {
    failLinearPipingAnalysis(
      `TEMPERATURE primitive ${temperature.primitiveId} cites material state ${temperature.stiffnessEvaluationMaterialStateId}, not ${frameElement.material.materialStateId}.`,
      'PIPING_ANALYSIS_THERMAL_MATERIAL_STATE_MISMATCH',
      { elementId: frameElement.elementId, primitiveId: temperature.primitiveId },
    );
  }
  if (temperature.thermalStrainProfileId !== UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE) {
    failLinearPipingAnalysis(
      `TEMPERATURE primitive ${temperature.primitiveId} does not cite the implemented uniform thermal-strain profile.`,
      'PIPING_ANALYSIS_THERMAL_PROFILE_MISMATCH',
      { elementId: frameElement.elementId, primitiveId: temperature.primitiveId },
    );
  }
}

function stiffnessProperties(frameElement) {
  return {
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
}

function uniformTemperatureLimitation(approximationProfileId) {
  return {
    code: UNIFORM_TEMPERATURE_LIMITATION_CODE,
    severity: 'INFO',
    scope: 'ELEMENT',
    stiffnessRelevant: false,
    details: {
      disclosure: 'Thermal strain uses a uniform alpha * deltaT under the declared approximation profile; no gradient or stratification is modelled and temperature-dependent expansion-coefficient integration is deferred to the thermal-load compiler.',
      approximationProfileId,
    },
  };
}

function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failLinearPipingAnalysis(
      `${field} must be finite for piping-component thermal augmentation.`,
      'PIPING_ANALYSIS_THERMAL_PROPERTY_INVALID',
      { field, value },
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function assertSameVectorOrMatrix(actual, expected, elementId, field) {
  if (actual.length !== expected.length
    || actual.some((value, index) => !Object.is(value, expected[index]))) {
    failLinearPipingAnalysis(
      `Thermal augmentation could not reproduce element ${elementId} ${field} from retained B-3.1 evidence.`,
      'PIPING_ANALYSIS_THERMAL_ELEMENT_EVIDENCE_MISMATCH',
      { elementId, field },
    );
  }
}
