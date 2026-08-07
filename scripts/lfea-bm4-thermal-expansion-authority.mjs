export const BM4_CAESAR_AMBIENT_TEMPERATURE_F = 70;
export const BM4_CAESAR_AMBIENT_TEMPERATURE_C =
  (BM4_CAESAR_AMBIENT_TEMPERATURE_F - 32) * 5 / 9;
export const BM4_CAESAR_AMBIENT_TEMPERATURE_K =
  BM4_CAESAR_AMBIENT_TEMPERATURE_C + 273.15;

export const BM4_T1_TEMPERATURE_C = 325;
export const BM4_T1_TEMPERATURE_F = BM4_T1_TEMPERATURE_C * 9 / 5 + 32;

export const BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE = Object.freeze([
  Object.freeze({ temperatureF: 600, alphaPerF: 7.23e-6 }),
  Object.freeze({ temperatureF: 650, alphaPerF: 7.33e-6 }),
]);

function interpolateLinear(x, lower, upper, lowerValue, upperValue) {
  if (!(x >= lower && x <= upper)) throw new RangeError(`BM4 thermal interpolation ${x} is outside ${lower}..${upper}.`);
  return lowerValue + (upperValue - lowerValue) * (x - lower) / (upper - lower);
}

export const BM4_T1_MEAN_ALPHA_PER_F = interpolateLinear(
  BM4_T1_TEMPERATURE_F,
  BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE[0].temperatureF,
  BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE[1].temperatureF,
  BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE[0].alphaPerF,
  BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE[1].alphaPerF,
);
export const BM4_T1_MEAN_ALPHA_PER_C = BM4_T1_MEAN_ALPHA_PER_F * 9 / 5;
export const BM4_T1_THERMAL_STRAIN = BM4_T1_MEAN_ALPHA_PER_C
  * (BM4_T1_TEMPERATURE_C - BM4_CAESAR_AMBIENT_TEMPERATURE_C);

export const BM4_THERMAL_EXPANSION_AUTHORITY = Object.freeze({
  schema: 'bm4-thermal-expansion-authority/v1',
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
    code: 'ASME B31.3 Table C-3 carbon steel mean coefficient from 70F to indicated temperature',
    interpolation: 'LINEAR_600F_TO_650F',
    lower: BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE[0],
    upper: BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE[1],
    alphaPerF: BM4_T1_MEAN_ALPHA_PER_F,
    alphaPerC: BM4_T1_MEAN_ALPHA_PER_C,
  }),
  thermalStrain: BM4_T1_THERMAL_STRAIN,
  policy: Object.freeze({
    fitToBenchmarkOutput: false,
    useInputTemperatureAsActualTemperature: true,
    useCaesarDefaultAmbientWhenNoOverrideSerialized: true,
    useCodeMeanExpansionCoefficientForA106CarbonSteel: true,
  }),
});
