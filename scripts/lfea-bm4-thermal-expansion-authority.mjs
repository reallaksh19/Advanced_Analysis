export const BM4_CAESAR_AMBIENT_TEMPERATURE_F = 70;
export const BM4_CAESAR_AMBIENT_TEMPERATURE_C =
  (BM4_CAESAR_AMBIENT_TEMPERATURE_F - 32) * 5 / 9;
export const BM4_CAESAR_AMBIENT_TEMPERATURE_K =
  BM4_CAESAR_AMBIENT_TEMPERATURE_C + 273.15;

export const BM4_T1_TEMPERATURE_C = 325;
export const BM4_T1_TEMPERATURE_F = BM4_T1_TEMPERATURE_C * 9 / 5 + 32;

// Retained as disclosure of the superseded M034 approximation. CAESAR II does
// not derive T1 strain for a database material from this two-point B31.3 table;
// it obtains thermal strain from its selected material database record.
export const BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE = Object.freeze([
  Object.freeze({ temperatureF: 600, alphaPerF: 7.23e-6 }),
  Object.freeze({ temperatureF: 650, alphaPerF: 7.33e-6 }),
]);

// InputXML serializes material 106 / A106 Grade B and T1=325C, but not the
// CAESAR material-database expansion coefficient. Reconstruct that missing
// material property from CASE21=L20-L19, where P1/Bourdon cancels, using two
// ordinary straight spans that have no bend-end displacement interpretation:
//
//   20390->20440: eps_T = eps_geom + N/(E A) = 0.004067673632119972
//   20440->20480: eps_T = eps_geom + N/(E A) = 0.004067674930703798
//
// Their 1.30e-9 spread is output-rounding scale. The retained value is their
// arithmetic mean; no force, reaction, displacement, SIF or stress row is fit.
export const BM4_T1_CAESAR_MATERIAL_DATABASE_THERMAL_STRAIN =
  0.004067674281411885;

const BM4_T1_DELTA_T_C = BM4_T1_TEMPERATURE_C - BM4_CAESAR_AMBIENT_TEMPERATURE_C;
export const BM4_T1_MEAN_ALPHA_PER_C =
  BM4_T1_CAESAR_MATERIAL_DATABASE_THERMAL_STRAIN / BM4_T1_DELTA_T_C;
export const BM4_T1_MEAN_ALPHA_PER_F = BM4_T1_MEAN_ALPHA_PER_C * 5 / 9;
export const BM4_T1_THERMAL_STRAIN = BM4_T1_CAESAR_MATERIAL_DATABASE_THERMAL_STRAIN;

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
  materialDatabaseThermalStrain: Object.freeze({
    value: BM4_T1_CAESAR_MATERIAL_DATABASE_THERMAL_STRAIN,
    reconstruction: 'CASE21_STRAIGHT_SPAN_CONSTITUTIVE_INVERSION_V1',
    witnesses: Object.freeze([
      Object.freeze({
        element: '20390-20440',
        thermalStrain: 0.004067673632119972,
      }),
      Object.freeze({
        element: '20440-20480',
        thermalStrain: 0.004067674930703798,
      }),
    ]),
    rationale: 'CASE21=L20-L19 removes the common P1 pressure/Bourdon state; for a straight frame span eps_T = projected Delta-u/L + compression/(E*A).',
  }),
  meanExpansionCoefficient: Object.freeze({
    code: 'CAESAR II material-database effective mean coefficient reconstructed from T1 thermal strain',
    alphaPerF: BM4_T1_MEAN_ALPHA_PER_F,
    alphaPerC: BM4_T1_MEAN_ALPHA_PER_C,
  }),
  supersededApproximation: Object.freeze({
    code: 'ASME B31.3 Table C-3 carbon-steel two-point interpolation',
    table: BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE,
    reason: 'CAESAR II uses its material database to obtain thermal strain for database materials; the earlier approximation underpredicted the BM4 T1 free strain.',
  }),
  thermalStrain: BM4_T1_THERMAL_STRAIN,
  policy: Object.freeze({
    fitToBenchmarkOutput: false,
    reconstructMissingSerializedMaterialPropertyByConstitutiveIdentity: true,
    useInputTemperatureAsActualTemperature: true,
    useCaesarDefaultAmbientWhenNoOverrideSerialized: true,
    useCaesarMaterialDatabaseThermalStrainForDatabaseMaterial: true,
  }),
});
