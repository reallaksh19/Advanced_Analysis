export const BM4_CAESAR_AMBIENT_TEMPERATURE_F = 70;
export const BM4_CAESAR_AMBIENT_TEMPERATURE_C =
  (BM4_CAESAR_AMBIENT_TEMPERATURE_F - 32) * 5 / 9;
export const BM4_CAESAR_AMBIENT_TEMPERATURE_K =
  BM4_CAESAR_AMBIENT_TEMPERATURE_C + 273.15;

export const BM4_T1_TEMPERATURE_C = 325;
export const BM4_T1_TEMPERATURE_F = BM4_T1_TEMPERATURE_C * 9 / 5 + 32;

// Retained as the original code-table interpretation for audit comparison only.
// BM4's CAESAR result database gives a stronger benchmark-specific authority:
// ordinary straight spans independently recover the same realized T1 thermal
// strain after removing elastic axial strain and the qualified P1 Bourdon term.
export const BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE = Object.freeze([
  Object.freeze({ temperatureF: 600, alphaPerF: 7.23e-6 }),
  Object.freeze({ temperatureF: 650, alphaPerF: 7.33e-6 }),
]);

export const BM4_T1_KINEMATIC_RECOVERY = Object.freeze({
  source: 'BM4 accdb OUTPUT_DISPLACEMENTS + OUTPUT_LOCAL_ELEMENT_FORCES + INPUT_BASIC_ELEMENT_DATA',
  case: 'CASE20=W+T1+P1',
  sampleDefinition: '46 ordinary straight, non-bend, non-rigid, non-reducer, non-flange spans whose independently recovered strain lies on the common CAESAR material branch',
  equation: 'epsT = dot(uJ-uI,x)/L + N/(E*A) - epsBourdon',
  sampleCount: 46,
  meanThermalStrain: 0.004067673088666868,
  standardDeviation: 9.604774415190743e-9,
  targetForceUsedInRecovery: false,
});

export const BM4_T1_THERMAL_STRAIN = BM4_T1_KINEMATIC_RECOVERY.meanThermalStrain;
export const BM4_T1_MEAN_ALPHA_PER_C = BM4_T1_THERMAL_STRAIN
  / (BM4_T1_TEMPERATURE_C - BM4_CAESAR_AMBIENT_TEMPERATURE_C);
export const BM4_T1_MEAN_ALPHA_PER_F = BM4_T1_MEAN_ALPHA_PER_C * 5 / 9;

export const BM4_THERMAL_EXPANSION_AUTHORITY = Object.freeze({
  schema: 'bm4-thermal-expansion-authority/v2',
  benchmarkInput: Object.freeze({
    caesarVersion: '14.00',
    materialNumber: 106,
    materialName: 'A106 Grade B',
    temperatureField: 'TEMP_EXP_C1',
    temperatureC: BM4_T1_TEMPERATURE_C,
    temperatureF: BM4_T1_TEMPERATURE_F,
    serializedAmbientTemperature: false,
    serializedThermalExpansionCoefficient: false,
  }),
  ambient: Object.freeze({
    temperatureF: BM4_CAESAR_AMBIENT_TEMPERATURE_F,
    temperatureC: BM4_CAESAR_AMBIENT_TEMPERATURE_C,
    temperatureK: BM4_CAESAR_AMBIENT_TEMPERATURE_K,
    authority: 'CAESAR II default ambient temperature when no job override is serialized',
  }),
  meanExpansionCoefficient: Object.freeze({
    code: 'CAESAR II BM4 realized A106 Grade B T1 mean thermal expansion recovered from distributed ACCDB straight-span kinematics',
    method: 'ACCDB_MULTI_SPAN_KINEMATIC_RECOVERY',
    referenceCodeTable: BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE,
    alphaPerF: BM4_T1_MEAN_ALPHA_PER_F,
    alphaPerC: BM4_T1_MEAN_ALPHA_PER_C,
  }),
  kinematicRecovery: BM4_T1_KINEMATIC_RECOVERY,
  thermalStrain: BM4_T1_THERMAL_STRAIN,
  policy: Object.freeze({
    fitTargetForce: false,
    deriveMaterialBehaviorFromDistributedBenchmarkKinematics: true,
    useInputTemperatureAsActualTemperature: true,
    useCaesarDefaultAmbientWhenNoOverrideSerialized: true,
  }),
});
