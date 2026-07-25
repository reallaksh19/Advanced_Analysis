export const ENGINEERING_PROPERTY_SPECS = Object.freeze({
  outerDiameterMm: numeric('mm', ['PIPE_OD', 'PIPEOD', 'OD_MM', 'OUTSIDE_DIAMETER_MM', 'OUTSIDE_DIAMETER', 'OD']),
  wallThicknessMm: numeric('mm', ['WALL_THICKNESS_MM', 'WALLTHICKNESSMM', 'WALL_THICKNESS', 'THICKNESS']),
  nominalBoreMm: numeric('mm', ['NOMINAL_BORE_MM', 'NOMINALBOREMM', 'NPS_MM', 'BORE_MM', 'BORE']),
  materialName: text(['MATERIAL_NAME', 'MATERIAL', 'MATERIALCODE']),
  materialDensityKgM3: numeric('kg/m3', ['MATERIAL_DENSITY_KG_M3', 'MATERIALDENSITYKGM3']),
  unitPipeWeightKgPerM: numeric('kg/m', ['UNIT_PIPE_WEIGHT_KG_PER_M', 'PIPE_WEIGHT_KG_PER_M', 'PIPEWEIGHTKGPM']),
  componentWeightKg: numeric('kg', ['COMPONENT_WEIGHT_KG', 'COMPONENTWEIGHTKG', 'BEST_WEIGHT_KG', 'WEIGHT_KG']),
  insulationThicknessMm: numeric('mm', ['INSULATION_THICKNESS_MM', 'INSULATIONTHICKNESSMM']),
  insulationDensityKgM3: numeric('kg/m3', ['INSULATION_DENSITY_KG_M3', 'INSULATIONDENSITYKGM3']),
  insulationWeightKgPerM: numeric('kg/m', ['INSULATION_WEIGHT_KG_PER_M', 'INSULATIONWEIGHTKGPM']),
  fluidDensityOpeKgM3: numeric('kg/m3', ['FLUID_DENSITY_OPE_KG_M3', 'FLUIDDENSITYOPEKGM3', 'FLUID_DENSITY_KG_M3']),
  fluidDensityHydKgM3: numeric('kg/m3', ['FLUID_DENSITY_HYD_KG_M3', 'FLUIDDENSITYHYDKGM3']),
  fluidWeightOpeKgPerM: numeric('kg/m', ['FLUID_WT_OPE_KG_M', 'FLUID_WEIGHT_OPE_KG_PER_M', 'FLUIDWEIGHTOPEKGPM']),
  fluidWeightHydKgPerM: numeric('kg/m', ['FLUID_WT_HYD_KG_M', 'FLUID_WEIGHT_HYD_KG_PER_M', 'FLUIDWEIGHTHYDKGPM']),
  elasticModulusMpa: numeric('MPa', ['ELASTIC_MODULUS_MPA', 'YOUNGS_MODULUS_MPA', 'YOUNG_MODULUS_MPA', 'MODULUS_OF_ELASTICITY_MPA']),
  secondMomentAreaMm4: numeric('mm4', ['SECOND_MOMENT_AREA_MM4', 'AREA_MOMENT_OF_INERTIA_MM4']),
  flexuralRigidityNm2: numeric('N*m2', ['FLEXURAL_RIGIDITY_N_M2', 'EI_N_M2']),
});

export const COMPATIBILITY_EVIDENCE_SPECS = Object.freeze({
  sourceLengthMm: numeric('mm', ['LENGTH_MM', 'LENGTHMM']),
  sourceChainageStartMm: numeric('mm', ['CHAINAGE_START_MM', 'CHAINAGESTARTMM']),
  sourceChainageEndMm: numeric('mm', ['CHAINAGE_END_MM', 'CHAINAGEENDMM']),
  sourceChainageCenterMm: numeric('mm', ['CHAINAGE_CENTER_MM', 'CHAINAGECENTERMM']),
  supportVerticalCapability: text(['VERTICAL_CAPABILITY', 'SUPPORT_VERTICAL_CAPABILITY']),
  supportType: text(['SUPPORT_TYPE', 'SUPPORTTYPE']),
});

export const SUPPORT_EVIDENCE_SPECS = Object.freeze({
  attachedPortReferences: text([
    'ATTACHED_PORT_REFERENCE', 'ATTACHED_PORT_REF', 'ATTACHED_PORT_ID',
    'SUPPORT_PORT_REFERENCE', 'CONNECTED_PORT_ID',
  ]),
  attachedComponentReferences: text([
    'ATTACHED_COMPONENT_REFERENCE', 'ATTACHED_COMPONENT_REF',
    'ATTACHED_COMPONENT_ID', 'SUPPORTING_COMPONENT_REFERENCE',
  ]),
  supportedSourceEntityReferences: text([
    'SUPPORTED_SOURCE_ENTITY_REFERENCE', 'SUPPORTED_SOURCE_ENTITY_ID',
    'SUPPORTED_ENTITY_ID', 'SUPPORTED_OBJECT_ID', 'SUPPORTED_COMPONENT_ID',
  ]),
  supportTypes: text(['SUPPORT_TYPE', 'SUPPORTTYPE']),
  verticalCapabilities: text([
    'VERTICAL_CAPABILITY', 'SUPPORT_VERTICAL_CAPABILITY', 'VERTICAL_RESTRAINT',
  ]),
  lateralCapabilities: text([
    'LATERAL_CAPABILITY', 'SUPPORT_LATERAL_CAPABILITY', 'LATERAL_RESTRAINT',
  ]),
  longitudinalCapabilities: text([
    'LONGITUDINAL_CAPABILITY', 'AXIAL_CAPABILITY',
    'LINE_STOP_CAPABILITY', 'LONGITUDINAL_RESTRAINT',
  ]),
  rotationalCapabilities: text([
    'ROTATIONAL_CAPABILITY', 'ROTATION_CAPABILITY', 'ROTATIONAL_RESTRAINT',
  ]),
  verticalGaps: numeric('mm', ['VERTICAL_GAP_MM', 'GAP_VERTICAL_MM']),
  lateralGaps: numeric('mm', ['LATERAL_GAP_MM', 'GAP_LATERAL_MM']),
  longitudinalGaps: numeric('mm', ['LONGITUDINAL_GAP_MM', 'AXIAL_GAP_MM', 'GAP_LONGITUDINAL_MM']),
  stiffnessValues: numeric('N/mm', ['RESTRAINT_STIFFNESS_N_PER_MM', 'STIFFNESS_N_PER_MM']),
  springRateValues: numeric('N/mm', ['SPRING_RATE_N_PER_MM', 'SPRING_STIFFNESS_N_PER_MM']),
  frictionValues: numeric('', ['FRICTION_COEFFICIENT', 'COEFFICIENT_OF_FRICTION', 'MU']),
  multiAttachmentFlags: text(['ALLOW_MULTIPLE_ATTACHMENTS', 'MULTI_ATTACHMENT']),
});

export const LOAD_EVIDENCE_SPECS = Object.freeze({
  componentCogX: numeric('', ['COG_X', 'CENTER_OF_GRAVITY_X', 'CENTRE_OF_GRAVITY_X']),
  componentCogY: numeric('', ['COG_Y', 'CENTER_OF_GRAVITY_Y', 'CENTRE_OF_GRAVITY_Y']),
  componentCogZ: numeric('', ['COG_Z', 'CENTER_OF_GRAVITY_Z', 'CENTRE_OF_GRAVITY_Z']),
  explicitPointMomentNm: numeric('N*m', ['POINT_MOMENT_NM', 'EXPLICIT_MOMENT_NM', 'MOMENT_NM']),
  momentAxis: text(['POINT_MOMENT_AXIS', 'MOMENT_AXIS', 'AXIS_EVIDENCE']),
});

function numeric(unit, aliases) {
  return Object.freeze({ kind: 'number', unit, aliases: Object.freeze(aliases) });
}

function text(aliases) {
  return Object.freeze({ kind: 'string', unit: '', aliases: Object.freeze(aliases) });
}
