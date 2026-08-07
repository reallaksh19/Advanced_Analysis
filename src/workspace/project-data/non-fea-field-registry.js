import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { freezeDeep, isRecord, stringValue } from '../dataset-utils.js';

export const NON_FEA_FIELD_REGISTRY_SCHEMA = 'non-fea-field-authority-registry/v1';
export const NON_FEA_CONFIGURED_DEFAULT_POLICY_SCHEMA = 'non-fea-configured-default-policy/v1';
export const NON_FEA_CONFIGURED_DEFAULT_USAGE_LEDGER_SCHEMA = 'non-fea-configured-default-usage-ledger/v1';

export const NON_FEA_METHOD_IDS = Object.freeze([
  'WEIGHT_AND_GRAVITY',
  'SUSTAINED_REACTIONS',
  'SUSTAINED_MEMBER_ACTIONS',
  'SUSTAINED_STRESS',
  'THERMAL_FREE_DISPLACEMENT',
  'RESTRAINT_REACTIONS',
  'VERTICAL_CONTACT',
  'COMBINED_OPERATING_REACTION',
  'ENRICHED_STAGED_JSON_EXPORT',
]);

export const NON_FEA_AUTHORITY_KINDS = Object.freeze([
  'SOURCE_EXPLICIT',
  'SOURCE_INHERITED',
  'EXACT_APPROVED_MASTER',
  'ACCEPTED_OVERRIDE',
  'CONFIGURED_DERIVATION',
  'PROJECT_POLICY',
  'PROJECT_CONFIGURED_DEFAULT',
]);

const ALL_METHODS = NON_FEA_METHOD_IDS;
const WEIGHT_METHODS = Object.freeze([
  'WEIGHT_AND_GRAVITY',
  'SUSTAINED_REACTIONS',
  'SUSTAINED_MEMBER_ACTIONS',
  'SUSTAINED_STRESS',
  'RESTRAINT_REACTIONS',
  'VERTICAL_CONTACT',
  'COMBINED_OPERATING_REACTION',
  'ENRICHED_STAGED_JSON_EXPORT',
]);
const THERMAL_METHODS = Object.freeze([
  'THERMAL_FREE_DISPLACEMENT',
  'RESTRAINT_REACTIONS',
  'COMBINED_OPERATING_REACTION',
  'ENRICHED_STAGED_JSON_EXPORT',
]);
const PRESSURE_METHODS = Object.freeze([
  'SUSTAINED_REACTIONS',
  'SUSTAINED_MEMBER_ACTIONS',
  'SUSTAINED_STRESS',
  'COMBINED_OPERATING_REACTION',
  'ENRICHED_STAGED_JSON_EXPORT',
]);
const RESTRAINT_METHODS = Object.freeze([
  'RESTRAINT_REACTIONS',
  'VERTICAL_CONTACT',
  'COMBINED_OPERATING_REACTION',
  'ENRICHED_STAGED_JSON_EXPORT',
]);

const SOURCE_MASTER_OVERRIDE_DEFAULT = Object.freeze([
  'SOURCE_EXPLICIT',
  'SOURCE_INHERITED',
  'EXACT_APPROVED_MASTER',
  'ACCEPTED_OVERRIDE',
  'PROJECT_CONFIGURED_DEFAULT',
]);
const SOURCE_MASTER_OVERRIDE_DERIVATION = Object.freeze([
  'SOURCE_EXPLICIT',
  'SOURCE_INHERITED',
  'EXACT_APPROVED_MASTER',
  'ACCEPTED_OVERRIDE',
  'CONFIGURED_DERIVATION',
]);
const SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT = Object.freeze([
  'SOURCE_EXPLICIT',
  'SOURCE_INHERITED',
  'EXACT_APPROVED_MASTER',
  'ACCEPTED_OVERRIDE',
  'CONFIGURED_DERIVATION',
  'PROJECT_CONFIGURED_DEFAULT',
]);

export const NON_FEA_FIELD_REGISTRY = freezeDeep({
  schema: NON_FEA_FIELD_REGISTRY_SCHEMA,
  fields: [
    field('SOURCE_DATASET', 'Source dataset identity', 'sha256', ['SOURCE_EXPLICIT', 'PROJECT_POLICY'], 'sourcesAndUnits.datasetSource', ALL_METHODS),
    field('LENGTH_UNIT', 'Canonical length unit', 'unit', ['SOURCE_EXPLICIT', 'PROJECT_POLICY'], 'sourcesAndUnits.lengthUnit', ALL_METHODS),
    field('SOURCE_UP_AXIS', 'Source up axis', 'axis', ['SOURCE_EXPLICIT', 'PROJECT_POLICY'], 'sourcesAndUnits.sourceUpAxis', ALL_METHODS),
    field('PORT_MATCH_TOLERANCE', 'Port-match tolerance', 'm', ['PROJECT_POLICY'], 'topology.portMatchToleranceMm', ALL_METHODS),
    field('SUPPORT_SITE_GROUPING_TOLERANCE', 'Support-site grouping tolerance', 'm', ['PROJECT_POLICY'], 'topology.supportSiteGroupingToleranceMm', RESTRAINT_METHODS),
    field('AUTO_CARRIER_COINCIDENCE_TOLERANCE', 'AUTO carrier coincidence tolerance', 'm', ['PROJECT_POLICY'], 'topology.autoCarrierCoincidenceToleranceMm', RESTRAINT_METHODS),
    field('ROUTE_JOINING_RULES', 'Route joining rules', 'policy', ['PROJECT_POLICY'], 'topology.routeJoiningRules', ALL_METHODS),
    field('SUPPORT_TYPE_CAPABILITIES', 'Support type capabilities', 'policy', ['SOURCE_EXPLICIT', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE', 'PROJECT_POLICY'], 'topology.supportTypeCapabilities', RESTRAINT_METHODS),
    field('PIPING_CLASS_MAPPING', 'Piping class mapping', 'mapping', ['SOURCE_EXPLICIT', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE', 'PROJECT_POLICY'], 'topology.pipingClassMappings', ALL_METHODS),
    field('GRAVITY_ACCELERATION', 'Gravity acceleration', 'm/s²', ['PROJECT_POLICY'], 'loadCalculation.gravityMPerS2', WEIGHT_METHODS),
    field('LOAD_FACTOR', 'Project load factor', 'ratio', ['PROJECT_POLICY'], 'loadCalculation.loadFactor', WEIGHT_METHODS),
    field('PIPE_OUTER_DIAMETER', 'Pipe outer diameter', 'm', SOURCE_MASTER_OVERRIDE_DEFAULT, 'loadCalculation.pipeSectionProperties', ALL_METHODS, true),
    field('PIPE_WALL_THICKNESS', 'Pipe wall thickness', 'm', SOURCE_MASTER_OVERRIDE_DEFAULT, 'loadCalculation.pipeSectionProperties', ALL_METHODS, true),
    field('CORROSION_ALLOWANCE', 'Corrosion allowance', 'm', SOURCE_MASTER_OVERRIDE_DEFAULT, 'thermoMechanicalBasis.corrosionAllowancesMm', PRESSURE_METHODS, true),
    field('MATERIAL_DENSITY', 'Material density', 'kg/m³', SOURCE_MASTER_OVERRIDE_DEFAULT, 'loadCalculation.materialDensitiesKgPerM3', WEIGHT_METHODS, true),
    field('UNIT_PIPE_WEIGHT', 'Unit pipe weight', 'kg/m', SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT, null, WEIGHT_METHODS, true),
    field('ELASTIC_MODULUS', 'Elastic modulus', 'Pa', SOURCE_MASTER_OVERRIDE_DEFAULT, 'thermoMechanicalBasis.materialElasticProperties', [...THERMAL_METHODS, 'SUSTAINED_MEMBER_ACTIONS', 'SUSTAINED_STRESS'], true),
    field('THERMAL_EXPANSION_COEFFICIENT', 'Thermal expansion coefficient', '1/K', SOURCE_MASTER_OVERRIDE_DEFAULT, 'thermoMechanicalBasis.materialElasticProperties', THERMAL_METHODS, true),
    field('SECOND_MOMENT_AREA', 'Second moment of area', 'm⁴', SOURCE_MASTER_OVERRIDE_DERIVATION, 'loadCalculation.pipeSectionProperties', ['SUSTAINED_MEMBER_ACTIONS', 'SUSTAINED_STRESS', ...THERMAL_METHODS]),
    field('FLEXURAL_RIGIDITY', 'Flexural rigidity', 'N·m²', SOURCE_MASTER_OVERRIDE_DERIVATION, 'loadCalculation.pipeSectionProperties', ['SUSTAINED_MEMBER_ACTIONS', 'SUSTAINED_STRESS', ...THERMAL_METHODS]),
    field('COMPONENT_WEIGHT', 'Component weight', 'kg', SOURCE_MASTER_OVERRIDE_DEFAULT, 'loadCalculation.componentWeightsKg', WEIGHT_METHODS, true),
    field('OPERATING_FLUID_DENSITY', 'Operating fluid density', 'kg/m³', SOURCE_MASTER_OVERRIDE_DEFAULT, 'loadCalculation.operatingFluidDensitiesKgPerM3', WEIGHT_METHODS, true),
    field('HYDRO_FLUID_DENSITY', 'Hydrotest fluid density', 'kg/m³', SOURCE_MASTER_OVERRIDE_DEFAULT, 'loadCalculation.hydroFluidDensitiesKgPerM3', WEIGHT_METHODS, true),
    field('OPERATING_FLUID_WEIGHT', 'Operating fluid weight', 'kg/m', SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT, null, WEIGHT_METHODS, true),
    field('HYDRO_FLUID_WEIGHT', 'Hydrotest fluid weight', 'kg/m', SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT, null, WEIGHT_METHODS, true),
    field('FLUID_PHASE_AND_FILL_STATE', 'Fluid phase and fill state', 'policy', ['SOURCE_EXPLICIT', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE', 'PROJECT_POLICY'], 'thermoMechanicalBasis.fluidPhaseAndFillState', WEIGHT_METHODS),
    field('INSULATION_DENSITY', 'Insulation density', 'kg/m³', SOURCE_MASTER_OVERRIDE_DEFAULT, 'loadCalculation.insulationDensitiesKgPerM3', WEIGHT_METHODS, true),
    field('INSULATION_THICKNESS', 'Insulation thickness', 'm', SOURCE_MASTER_OVERRIDE_DEFAULT, null, WEIGHT_METHODS, true),
    field('INSULATION_WEIGHT', 'Insulation weight', 'kg/m', SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT, null, WEIGHT_METHODS, true),
    field('INSTALLATION_TEMPERATURE', 'Installation temperature', '°C', ['SOURCE_EXPLICIT', 'SOURCE_INHERITED', 'PROJECT_POLICY', 'PROJECT_CONFIGURED_DEFAULT'], 'thermoMechanicalBasis.installationTemperatureC', THERMAL_METHODS, true),
    field('OPERATING_TEMPERATURE', 'Operating temperature', '°C', ['SOURCE_EXPLICIT', 'SOURCE_INHERITED', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE', 'PROJECT_POLICY', 'PROJECT_CONFIGURED_DEFAULT'], 'thermoMechanicalBasis.operatingTemperaturesC', THERMAL_METHODS, true),
    field('CASE_PRESSURE', 'Load-case pressure', 'Pa', ['SOURCE_EXPLICIT', 'SOURCE_INHERITED', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE', 'PROJECT_POLICY', 'PROJECT_CONFIGURED_DEFAULT'], 'thermoMechanicalBasis.casePressuresPa', PRESSURE_METHODS, true),
    field('PRESSURE_BOUNDARY_EFFECTIVE_AREA', 'Pressure-boundary effective area', 'm²', ['SOURCE_EXPLICIT', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE', 'PROJECT_POLICY', 'CONFIGURED_DERIVATION'], 'thermoMechanicalBasis.pressureBoundarySemantics', PRESSURE_METHODS),
    field('STRESS_CODE_BASIS', 'Stress-code basis', 'policy', ['PROJECT_POLICY'], 'thermoMechanicalBasis.stressCodeBasis', ['SUSTAINED_STRESS', 'ENRICHED_STAGED_JSON_EXPORT']),
    field('RESTRAINT_TYPE', 'Restraint type', 'policy', ['SOURCE_EXPLICIT', 'SOURCE_INHERITED', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE', 'PROJECT_POLICY'], 'topology.supportTypeCapabilities', RESTRAINT_METHODS),
    field('SUPPORT_VERTICAL_STATE', 'Support vertical state', 'policy', ['SOURCE_EXPLICIT', 'SOURCE_INHERITED', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE', 'PROJECT_POLICY'], 'topology.supportTypeCapabilities', RESTRAINT_METHODS),
    field('RESTRAINT_STIFFNESS', 'Restraint stiffness', 'N/m', SOURCE_MASTER_OVERRIDE_DEFAULT, 'restraintPolicy.restraintStiffnessNPerM', RESTRAINT_METHODS, true),
    field('RESTRAINT_GAP', 'Restraint gap', 'm', SOURCE_MASTER_OVERRIDE_DEFAULT, 'restraintPolicy.restraintGapsMm', RESTRAINT_METHODS, true),
    field('RESTRAINT_PRELOAD', 'Restraint preload', 'N', ['SOURCE_EXPLICIT', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE', 'PROJECT_POLICY', 'PROJECT_CONFIGURED_DEFAULT'], 'restraintPolicy.restraintPreloadsN', RESTRAINT_METHODS, true),
    field('FRICTION_COEFFICIENT', 'Friction coefficient', 'ratio', SOURCE_MASTER_OVERRIDE_DEFAULT, 'restraintPolicy.frictionCoefficients', ['VERTICAL_CONTACT', 'COMBINED_OPERATING_REACTION', 'ENRICHED_STAGED_JSON_EXPORT'], true),
    field('CONTACT_POLICY', 'Contact and unilateral behavior policy', 'policy', ['PROJECT_POLICY'], 'restraintPolicy.contactPolicy', ['VERTICAL_CONTACT', 'COMBINED_OPERATING_REACTION', 'ENRICHED_STAGED_JSON_EXPORT']),
    field('SUPPORT_AVAILABILITY_SENSITIVITY', 'Support unavailable sensitivity declaration', 'policy', ['ACCEPTED_OVERRIDE'], null, ['VERTICAL_CONTACT', 'COMBINED_OPERATING_REACTION', 'ENRICHED_STAGED_JSON_EXPORT']),
    field('ACTIVE_LOAD_CASES', 'Active load cases', 'set', ['PROJECT_POLICY'], 'loadCalculation.activeLoadCases', ALL_METHODS),
    field('EQUILIBRIUM_TOLERANCES', 'Equilibrium tolerances', 'policy', ['PROJECT_POLICY'], 'loadCalculation.equilibriumTolerances', ALL_METHODS),
    field('QUALIFICATION_PROFILE', 'Qualification profile', 'profile', ['PROJECT_POLICY'], 'qualificationPolicy.qualificationProfiles', ALL_METHODS),
    field('NONLINEAR_APPLICABILITY_POLICY', 'Nonlinear applicability policy', 'policy', ['PROJECT_POLICY'], 'qualificationPolicy.nonlinearApplicabilityPolicy', RESTRAINT_METHODS),
    field('SUPERPOSITION_POLICY', 'Superposition policy', 'policy', ['PROJECT_POLICY'], 'qualificationPolicy.superpositionPolicy', ['COMBINED_OPERATING_REACTION', 'ENRICHED_STAGED_JSON_EXPORT']),
    field('CONFIGURED_DEFAULT_POLICY', 'Configured default policy', 'policy', ['PROJECT_POLICY'], 'qualificationPolicy.configuredDefaults', ALL_METHODS),
  ],
});

export function listNonFeaFieldDefinitions() {
  return NON_FEA_FIELD_REGISTRY.fields;
}

export function getNonFeaFieldDefinition(fieldId) {
  return NON_FEA_FIELD_REGISTRY.fields.find((row) => row.fieldId === fieldId) || null;
}

export function createNonFeaFieldOwnershipMatrix(profile) {
  const rows = NON_FEA_FIELD_REGISTRY.fields.map((definition) => {
    const entry = definition.projectDataPath ? readPath(profile, definition.projectDataPath) : null;
    return freezeDeep({
      fieldId: definition.fieldId,
      label: definition.label,
      canonicalUnit: definition.canonicalUnit,
      authorityPath: definition.authorityPath,
      projectDataPath: definition.projectDataPath,
      projectDataState: projectEntryState(entry),
      defaultEligible: definition.defaultEligible,
      methods: definition.methods,
    });
  });
  const base = {
    schema: 'non-fea-field-ownership-matrix/v1',
    projectDataRevision: Number.isInteger(profile?.revision) ? profile.revision : null,
    rows,
  };
  return freezeDeep({ ...base, semanticHash: semanticHash(base) });
}

export function validateConfiguredDefaultsPolicy(value) {
  const errors = [];
  if (!isRecord(value) || value.schema !== NON_FEA_CONFIGURED_DEFAULT_POLICY_SCHEMA || !Array.isArray(value.defaults)) {
    errors.push(issue('qualificationPolicy.configuredDefaults', 'INVALID_CONFIGURED_DEFAULT_POLICY', `Expected ${NON_FEA_CONFIGURED_DEFAULT_POLICY_SCHEMA}.`));
    return freezeDeep({ valid: false, errors });
  }
  const ids = new Set();
  value.defaults.forEach((row, index) => {
    const path = `qualificationPolicy.configuredDefaults.defaults[${index}]`;
    if (!isRecord(row)) {
      errors.push(issue(path, 'INVALID_CONFIGURED_DEFAULT', 'Configured default must be an object.'));
      return;
    }
    const defaultId = stringValue(row.defaultId);
    const fieldId = stringValue(row.fieldId);
    const definition = getNonFeaFieldDefinition(fieldId);
    if (!defaultId) errors.push(issue(`${path}.defaultId`, 'MISSING_DEFAULT_ID', 'Configured default ID is required.'));
    else if (ids.has(defaultId)) errors.push(issue(`${path}.defaultId`, 'DUPLICATE_DEFAULT_ID', `Duplicate configured default ID: ${defaultId}.`));
    else ids.add(defaultId);
    if (!definition) errors.push(issue(`${path}.fieldId`, 'UNKNOWN_DEFAULT_FIELD', `Unknown Non-FEA field: ${fieldId || 'EMPTY'}.`));
    else if (!definition.defaultEligible) errors.push(issue(`${path}.fieldId`, 'DEFAULT_NOT_PERMITTED', `${fieldId} does not permit a configured default.`));
    if (!Object.hasOwn(row, 'value') || row.value === null) errors.push(issue(`${path}.value`, 'MISSING_DEFAULT_VALUE', 'Configured default value is required.'));
    else validateFiniteValue(row.value, `${path}.value`, errors);
    if (!stringValue(row.unit)) errors.push(issue(`${path}.unit`, 'MISSING_DEFAULT_UNIT', 'Configured default unit is required.'));
    if (!stringValue(row.basis)) errors.push(issue(`${path}.basis`, 'MISSING_DEFAULT_BASIS', 'Configured default basis is required.'));
    if (!Array.isArray(row.allowedMethods) || row.allowedMethods.length === 0) {
      errors.push(issue(`${path}.allowedMethods`, 'MISSING_DEFAULT_METHODS', 'At least one allowed method is required.'));
    } else {
      row.allowedMethods.forEach((methodId) => {
        if (!NON_FEA_METHOD_IDS.includes(methodId)) errors.push(issue(`${path}.allowedMethods`, 'UNKNOWN_DEFAULT_METHOD', `Unknown method: ${methodId}.`));
        if (definition && !definition.methods.includes(methodId)) errors.push(issue(`${path}.allowedMethods`, 'DEFAULT_METHOD_NOT_APPLICABLE', `${fieldId} is not consumed by ${methodId}.`));
      });
    }
  });
  return freezeDeep({ valid: errors.length === 0, errors });
}

export function createConfiguredDefaultUsageLedger(profile, usageRows = []) {
  if (!Array.isArray(usageRows)) throw new TypeError('Configured-default usage rows must be an array.');
  const policyEntry = readPath(profile, 'qualificationPolicy.configuredDefaults');
  const policy = policyEntry?.value ?? null;
  const approvedAuthority = policyEntry?.approved === true
    && isRecord(policyEntry?.evidence)
    && Boolean(stringValue(policyEntry.evidence.source));
  if (usageRows.length > 0 && !approvedAuthority) {
    throw new TypeError('Configured-default usage requires an approved Project Data policy with source evidence.');
  }
  const audit = policy === null
    ? freezeDeep({ valid: usageRows.length === 0, errors: usageRows.length ? [issue('usageRows', 'CONFIGURED_DEFAULT_POLICY_REQUIRED', 'Configured-default usage requires an approved policy.')] : [] })
    : validateConfiguredDefaultsPolicy(policy);
  if (!audit.valid) throw new TypeError(audit.errors.map((row) => `${row.code}: ${row.message}`).join(' '));
  const defaults = new Map((policy?.defaults || []).map((row) => [row.defaultId, row]));
  const rows = usageRows.map((row, index) => validateUsage(row, index, defaults)).sort(usageOrder);
  const base = {
    schema: NON_FEA_CONFIGURED_DEFAULT_USAGE_LEDGER_SCHEMA,
    projectDataRevision: Number.isInteger(profile?.revision) ? profile.revision : null,
    configuredDefaultPolicyHash: policy ? semanticHash(policy) : null,
    rows,
  };
  return freezeDeep({ ...base, semanticHash: semanticHash(base) });
}

function field(fieldId, label, canonicalUnit, authorityPath, projectDataPath, methods, defaultEligible = false) {
  if (!authorityPath.length) throw new TypeError(`${fieldId} requires an authority path.`);
  authorityPath.forEach((authority) => {
    if (!NON_FEA_AUTHORITY_KINDS.includes(authority)) throw new TypeError(`Unknown authority ${authority} for ${fieldId}.`);
  });
  const uniqueMethods = [...new Set(methods)];
  uniqueMethods.forEach((methodId) => {
    if (!NON_FEA_METHOD_IDS.includes(methodId)) throw new TypeError(`Unknown method ${methodId} for ${fieldId}.`);
  });
  return {
    fieldId,
    label,
    canonicalUnit,
    authorityPath: [...authorityPath],
    projectDataPath,
    methods: uniqueMethods,
    defaultEligible: defaultEligible === true,
  };
}

function validateUsage(row, index, defaults) {
  const path = `usageRows[${index}]`;
  if (!isRecord(row)) throw new TypeError(`${path} must be an object.`);
  const defaultId = stringValue(row.defaultId);
  const fieldId = stringValue(row.fieldId);
  const methodId = stringValue(row.methodId);
  const targetId = stringValue(row.targetId);
  const reason = stringValue(row.reason);
  const configured = defaults.get(defaultId);
  if (!configured) throw new TypeError(`${path} references unknown configured default ${defaultId || 'EMPTY'}.`);
  if (configured.fieldId !== fieldId) throw new TypeError(`${path} field ${fieldId} does not match configured default ${configured.fieldId}.`);
  if (!configured.allowedMethods.includes(methodId)) throw new TypeError(`${path} method ${methodId} is not permitted for ${defaultId}.`);
  if (!targetId) throw new TypeError(`${path}.targetId is required.`);
  if (!reason) throw new TypeError(`${path}.reason is required.`);
  return freezeDeep({
    defaultId,
    fieldId,
    methodId,
    targetId,
    reason,
    value: configured.value,
    unit: configured.unit,
    basis: configured.basis,
  });
}

function validateFiniteValue(value, path, errors) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(issue(path, 'INVALID_DEFAULT_NUMBER', 'Configured default numbers must be finite.'));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateFiniteValue(item, `${path}[${index}]`, errors));
    return;
  }
  if (isRecord(value)) Object.entries(value).forEach(([key, item]) => validateFiniteValue(item, `${path}.${key}`, errors));
}

function projectEntryState(entry) {
  if (!isRecord(entry) || !Object.hasOwn(entry, 'value')) return 'NOT_PROJECT_OWNED';
  if (entry.value === null) return 'MISSING';
  if (entry.approved !== true || !isRecord(entry.evidence) || !stringValue(entry.evidence.source)) return 'REVIEW';
  return 'APPROVED';
}

function readPath(value, path) {
  return String(path || '').split('.').reduce((current, key) => current?.[key], value);
}

function usageOrder(left, right) {
  return `${left.fieldId}|${left.methodId}|${left.targetId}|${left.defaultId}`
    .localeCompare(`${right.fieldId}|${right.methodId}|${right.targetId}|${right.defaultId}`);
}

function issue(path, code, message) {
  return freezeDeep({ path, code, message });
}
