export const INPUTXML_FEATURE_TAGS = Object.freeze({
  BEND: Object.freeze(['BEND', 'BENDS', 'ELBOW', 'ELBOWS']),
  RIGID: Object.freeze(['RIGID', 'RIGIDS']),
  REDUCER: Object.freeze(['REDUCER', 'REDUCERS', 'REDU', 'REDC', 'REDE']),
  RESTRAINT: Object.freeze(['RESTRAINT', 'RESTRAINTS']),
  SIF: Object.freeze(['SIF', 'SIFS']),
  HANGER: Object.freeze(['HANGER', 'HANGERS']),
  FORCES_MOMENTS: Object.freeze(['FORCESMOMENTS']),
  ALLOWABLE_STRESS: Object.freeze(['ALLOWABLESTRESS']),
  PRESCRIBED_MOVEMENT: Object.freeze(['DISPLACEMENT', 'DISPLACEMENTS', 'DISPL']),
});

export const INPUTXML_KNOWN_CHILD_TAGS = Object.freeze(new Set([
  ...Object.values(INPUTXML_FEATURE_TAGS).flat(),
  'VECTOR',
]));

export const INPUTXML_KNOWN_SIF_TYPES = Object.freeze({
  3: 'WELDING_TEE',
  5: 'WELDOLET',
});

export const INPUTXML_SENTINELS = Object.freeze({
  UNSET: -1.0101,
  DOUBLE_UNSET: -2.0202,
  TOLERANCE: 0.001,
});

export const INPUTXML_ELEMENT_FIELD_REGISTRY = Object.freeze({
  diameter: Object.freeze({
    names: Object.freeze(['DIAMETER', 'BORE', 'NOMINAL_DIAMETER']),
    quantity: 'LENGTH',
    inherited: true,
  }),
  wallThickness: Object.freeze({
    names: Object.freeze(['WALL_THICK', 'THICKNESS']),
    quantity: 'LENGTH',
    inherited: true,
  }),
  materialName: Object.freeze({
    names: Object.freeze(['MATERIAL_NAME']),
    quantity: 'TEXT',
    inherited: true,
  }),
  materialNumber: Object.freeze({
    names: Object.freeze(['MATERIAL_NUM']),
    quantity: 'DIMENSIONLESS',
    inherited: false,
  }),
  elasticModulus: Object.freeze({
    names: Object.freeze(['MODULUS']),
    quantity: 'EMOD',
    inherited: true,
  }),
  poissonRatio: Object.freeze({
    names: Object.freeze(['POISSONS']),
    quantity: 'DIMENSIONLESS',
    inherited: true,
  }),
  hydroPressure: Object.freeze({
    names: Object.freeze(['HYDRO_PRESSURE']),
    quantity: 'PRESSURE',
    inherited: true,
  }),
  fluidDensity: Object.freeze({
    names: Object.freeze(['FLUID_DENSITY', 'FDENSITY']),
    quantity: 'FDENS',
    inherited: true,
  }),
  pipeDensity: Object.freeze({
    names: Object.freeze(['PIPE_DENSITY', 'PDENSITY']),
    quantity: 'PDENS',
    inherited: true,
  }),
  insulationThickness: Object.freeze({
    names: Object.freeze(['INSUL_THICK']),
    quantity: 'LENGTH',
    inherited: true,
  }),
  insulationDensity: Object.freeze({
    names: Object.freeze(['INSUL_DENSITY', 'IDENSITY']),
    quantity: 'IDENS',
    inherited: true,
  }),
  corrosionAllowance: Object.freeze({
    names: Object.freeze(['CORR_ALLOW']),
    quantity: 'LENGTH',
    inherited: true,
  }),
});

export const INPUTXML_RESTRAINT_FIELD_NAMES = Object.freeze({
  node: Object.freeze(['NODE']),
  type: Object.freeze(['TYPE']),
  xCosine: Object.freeze(['XCOSINE']),
  yCosine: Object.freeze(['YCOSINE']),
  zCosine: Object.freeze(['ZCOSINE']),
  stiffness: Object.freeze(['STIFFNESS', 'STIF', 'RATE']),
  gap: Object.freeze(['GAP']),
  frictionCoefficient: Object.freeze(['FRIC_COEF', 'FRICTION']),
  connectingNode: Object.freeze(['CNODE', 'CONNECTING_NODE', 'CONNECT_NODE']),
});

export function isKnownInputXmlElementAttribute(name) {
  const upper = String(name ?? '').toUpperCase();
  if (/^TEMP_EXP_C[1-9]$/u.test(upper)) return true;
  if (/^PRESSURE[1-9]$/u.test(upper)) return true;
  if (/^HOT_MOD[1-9]$/u.test(upper)) return true;
  return Object.values(INPUTXML_ELEMENT_FIELD_REGISTRY)
    .some((definition) => definition.names.includes(upper))
    || [
      'FROM_NODE', 'FROMNODE', 'FROM', 'TO_NODE', 'TONODE', 'TO',
      'DELTA_X', 'DX', 'DELTA_Y', 'DY', 'DELTA_Z', 'DZ',
      'REFRACTORY_DENSITY', 'REFRACTORY_THK', 'CLADDING_DEN', 'CLADDING_THK',
      'INSUL_CLAD_UNIT_WEIGHT', 'MILL_TOL_PLUS', 'MILL_TOL_MINUS',
      'SEAM_WELD', 'NAME',
    ].includes(upper);
}
