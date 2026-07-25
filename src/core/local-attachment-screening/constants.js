export const REQUEST_SCHEMA = 'local-attachment-screening-request/v1';
export const RESULT_SCHEMA = 'local-attachment-screening-result/v1';
export const SOURCE_SCHEMA = 'local-attachment-screening-source-evidence/v1';
export const PROFILE_SCHEMA = 'local-attachment-screening-qualification-profile/v1';
export const ENGINEERING_LEVEL = 'NOMINAL_PIPE_SECTION_SCREENING_ONLY';
export const FOUNDATION_LEVEL = 'LOAD_TRANSFER_AND_PRESSURE_BASELINE_ONLY';
export const FOUNDATION_MODEL_SCHEMA = 'local-attachment-foundation-model/v1';
export const FOUNDATION_RESULT_SCHEMA = 'local-attachment-foundation-result/v1';
export const SECTION_BASIS = 'ASSESSMENT_PIPE_THICKNESS_ONLY';
export const QUALIFICATION_STATES = Object.freeze({
  ACCEPTED:'ACCEPTED', REJECTED_SOURCE_EVIDENCE:'REJECTED_SOURCE_EVIDENCE',
  REJECTED_REQUEST:'REJECTED_REQUEST', UNSUPPORTED_REQUEST:'UNSUPPORTED_REQUEST',
  NUMERICAL_FAILURE:'NUMERICAL_FAILURE',
});
export const RADIUS_BASES = Object.freeze({
  INNER_SURFACE:'INNER_SURFACE', MID_SURFACE:'MID_SURFACE',
  OUTER_SURFACE:'OUTER_SURFACE', EXPLICIT_RADIUS:'EXPLICIT_RADIUS',
});
export const ENVELOPE_QUANTITIES = Object.freeze([
  'principalMaximum','principalMinimum','sigmaRMaximum','sigmaRMinimum',
  'sigmaThetaMaximum','sigmaThetaMinimum','sigmaXMaximum','sigmaXMinimum',
  'tauXThetaMaximum','tauXThetaMinimum','vonMisesMaximum',
]);
export const FOUNDATION_LIMITATIONS = Object.freeze([
  'NO_CODE_COMPLIANCE','NO_CONTACT','NO_FEA','NO_LOCAL_ATTACHMENT_STRESS',
  'NO_SHELL_BENDING','NO_WELD_STRESS',
]);
export const BASE_LIMITATIONS = Object.freeze([
  'NO_BUCKLING','NO_CODE_COMPLIANCE','NO_CONTACT','NO_FATIGUE','NO_FEA',
  'NO_LOCAL_ATTACHMENT_STRESS','NO_MATERIAL_ALLOWABLE_OR_PASS_FAIL_UTILIZATION',
  'NO_PLASTICITY','NO_SHELL_BENDING','NO_STRESS_CONCENTRATION_FACTOR',
  'NO_TRANSVERSE_SHEAR_STRESS_RECOVERY','NO_WELD_STRESS',
]);
export const FORMULA_IDS = Object.freeze({
  ANNULUS_AREA:'EXACT_ANNULUS_AREA_V1', ANNULUS_SECOND_MOMENT:'EXACT_ANNULUS_SECOND_MOMENT_V1',
  ANNULUS_POLAR_MOMENT:'EXACT_ANNULUS_POLAR_MOMENT_V1', WALL_LOCATION:'PIPE_WALL_LOCATION_RECOVERY_V1',
  AXIAL_MEMBRANE:'AXIAL_MEMBRANE_STRESS_V1', BIAXIAL_BENDING:'BIAXIAL_BENDING_STRESS_V1',
  TORSION:'SAINT_VENANT_CIRCULAR_ANNULUS_TORSION_V1', PRESSURE_EXACT:'LAFEA1_PRESSURE_POINT_REUSE_V1',
  PRESSURE_RADIUS:'LAFEA1_LAME_COEFFICIENT_RADIUS_REUSE_V1', EXPLICIT_AXIAL:'LAFEA1_EXPLICIT_AXIAL_RESULTANT_MECHANICAL_SUPERPOSITION_V1',
  TENSOR:'SAME_POINT_PIPE_STRESS_TENSOR_V1', VON_MISES:'THREE_DIMENSIONAL_VON_MISES_INVARIANT_V1',
  PRINCIPAL:'X_THETA_RADIAL_PRINCIPAL_STRESS_RECOVERY_V1', LINEAR_CASE:'EXPLICIT_LINEAR_SCREENING_CASE_SUPERPOSITION_V1',
  ENVELOPE:'DETERMINISTIC_DECLARED_SOURCE_ENVELOPE_V1',
});
export const QUALIFICATION_PROFILE = Object.freeze({
  schema:PROFILE_SCHEMA, identity:'LAFEA2_SCALE_AWARE_SCREENING_V1',
  tolerances:Object.freeze({
    sectionProperty:Object.freeze({absolute:1e-8,relative:1e-12}),
    stressTensor:Object.freeze({absolute:1e-10,relative:1e-12}),
    principalStress:Object.freeze({absolute:1e-10,relative:1e-12}),
    vonMises:Object.freeze({absolute:1e-10,relative:1e-12}),
    linearSuperposition:Object.freeze({absolute:1e-9,relative:1e-12}),
    envelopeSource:Object.freeze({absolute:1e-10,relative:1e-12}),
  }),
});
