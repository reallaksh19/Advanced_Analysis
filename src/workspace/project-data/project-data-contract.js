import { clonePlain, freezeDeep, isRecord, stringValue } from '../dataset-utils.js';
import {
  PROJECT_DATA_GROUPS,
  PROJECT_DATA_PROFILE_SCHEMA,
  PROJECT_DATA_REQUIREMENTS,
} from './project-data-fields.js';

const REQUIRED_RESOLUTION_POLICY = Object.freeze([
  'SOURCE_EXPLICIT',
  'SOURCE_INHERITED',
  'CONFIGURED_DERIVATION',
  'PROJECT_CONFIGURED_DEFAULT',
  'BLOCK',
]);
const SCHEDULE_SCOPE_FIELDS = Object.freeze(['lineId', 'branchPath', 'nominalBoreMm']);
const VERTICAL_CONTACT_MODELS = new Set([
  'RIGID_UNILATERAL',
  'EFFECTIVE_UNLOADING_STIFFNESS',
  'HALF_LOAD_DISPLACEMENT',
  'TABULATED_RETENTION_CURVE',
  'SOURCE_REACTION_CURVE',
]);

/**
 * Creates a visible, intentionally incomplete profile. No engineering value is
 * inferred: every field begins without a value, evidence, or approval.
 */
export function createEmptyProjectDataProfile() {
  const profile = {
    schema: PROJECT_DATA_PROFILE_SCHEMA,
    projectId: '',
    revision: 0,
    updatedAt: null,
  };
  PROJECT_DATA_GROUPS.forEach((group) => {
    profile[group.key] = Object.fromEntries(group.fields.map((field) => [
      field.key,
      emptyEvidenceValue(),
    ]));
  });
  return freezeDeep(profile);
}

/**
 * Adds newly introduced groups/fields as explicit empty evidence values. This
 * preserves import compatibility without inventing an engineering value.
 */
export function upgradeProjectDataProfile(profile) {
  if (!isRecord(profile) || profile.schema !== PROJECT_DATA_PROFILE_SCHEMA) {
    return profile;
  }
  const upgraded = clonePlain(profile);
  PROJECT_DATA_GROUPS.forEach((group) => {
    if (!isRecord(upgraded[group.key])) upgraded[group.key] = {};
    group.fields.forEach((field) => {
      if (!Object.hasOwn(upgraded[group.key], field.key)) {
        upgraded[group.key][field.key] = emptyEvidenceValue();
      }
    });
  });
  return freezeDeep(upgraded);
}

export function createEvidenceValue(value, evidence, approved) {
  return freezeDeep({
    value: clonePlain(value),
    evidence: evidence === null ? null : clonePlain(evidence),
    approved: approved === true,
  });
}

/**
 * Validates profile structure, evidence, approvals, numeric ranges, source
 * hashes, and a named workflow requirement set.
 */
export function validateProjectDataProfile(profile, workflow, activeHashes) {
  const errors = [];
  if (!isRecord(profile) || profile.schema !== PROJECT_DATA_PROFILE_SCHEMA) {
    errors.push(errorRow('schema', 'INVALID_SCHEMA', `Expected ${PROJECT_DATA_PROFILE_SCHEMA}.`));
    return freezeDeep({ valid: false, workflow, errors });
  }
  const normalizedProfile = upgradeProjectDataProfile(profile);
  const required = PROJECT_DATA_REQUIREMENTS[workflow];
  validateAllFields(normalizedProfile, activeHashes, errors, new Set(required || []));
  if (!required) errors.push(errorRow('workflow', 'UNKNOWN_WORKFLOW', `Unknown Project Data workflow: ${workflow}.`));
  (required || []).forEach((path) => validateRequired(readPath(normalizedProfile, path), path, errors));
  return freezeDeep({ valid: errors.length === 0, workflow, errors });
}

export function projectDataValue(profile, path) {
  const entry = readPath(upgradeProjectDataProfile(profile), path);
  return isEvidenceValue(entry) ? clonePlain(entry.value) : null;
}

export function projectDataEntry(profile, path) {
  const entry = readPath(upgradeProjectDataProfile(profile), path);
  return isEvidenceValue(entry) ? clonePlain(entry) : null;
}

export function replaceProjectDataValue(profile, path, value, evidence, approved) {
  if (!isRecord(profile) || profile.schema !== PROJECT_DATA_PROFILE_SCHEMA) {
    throw new TypeError(`Project Data update requires ${PROJECT_DATA_PROFILE_SCHEMA}.`);
  }
  const normalizedProfile = upgradeProjectDataProfile(profile);
  const [groupKey, fieldKey] = path.split('.');
  if (!normalizedProfile[groupKey] || !Object.hasOwn(normalizedProfile[groupKey], fieldKey)) {
    throw new RangeError(`Unknown Project Data field: ${path}.`);
  }
  return freezeDeep({
    ...clonePlain(normalizedProfile),
    revision: Number(normalizedProfile.revision) + 1,
    updatedAt: new Date().toISOString(),
    [groupKey]: {
      ...clonePlain(normalizedProfile[groupKey]),
      [fieldKey]: createEvidenceValue(value, evidence, approved),
    },
  });
}

function validateAllFields(profile, activeHashes, errors, requiredPaths) {
  if (!Number.isInteger(profile.revision) || profile.revision < 0) {
    errors.push(errorRow('revision', 'INVALID_REVISION', 'Revision must be a non-negative integer.'));
  }
  PROJECT_DATA_GROUPS.forEach((group) => group.fields.forEach((field) => {
    const path = `${group.key}.${field.key}`;
    const entry = readPath(profile, path);
    if (!isEvidenceValue(entry)) {
      errors.push(errorRow(path, 'INVALID_FIELD', 'Field must contain value, evidence, and approved members.'));
      return;
    }
    if (typeof entry.value === 'number' && (!Number.isFinite(entry.value) || entry.value < 0)) {
      errors.push(errorRow(path, 'INVALID_NUMBER', 'Numeric values must be finite and non-negative.'));
    }
    if (path !== 'engineeringCalculationDefaults.configuredDefaults') {
      validateNestedNumbers(entry.value, path, errors);
    }
    validateFieldRules(entry.value, path, errors);
    validateSourceHash(entry, path, activeHashes, errors, requiredPaths.has(path));
  }));
  const near = projectDataValue(profile, 'webglNavigation.cameraNearMm');
  const far = projectDataValue(profile, 'webglNavigation.cameraFarMm');
  if (Number.isFinite(near) && Number.isFinite(far) && far <= near) {
    errors.push(errorRow('webglNavigation.cameraFarMm', 'INVALID_CAMERA_RANGE', 'Camera far plane must be greater than the near plane.'));
  }
}

function validateNestedNumbers(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNestedNumbers(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) {
        errors.push(errorRow(`${path}.${key}`, 'INVALID_NESTED_NUMBER', 'Nested numeric values must be finite.'));
      } else if (item < 0 && !isSignedEngineeringPath(`${path}.${key}`)) {
        errors.push(errorRow(`${path}.${key}`, 'INVALID_NESTED_NUMBER', 'Nested numeric values must be non-negative.'));
      }
    } else {
      validateNestedNumbers(item, `${path}.${key}`, errors);
    }
  });
}

function isSignedEngineeringPath(path) {
  return /temperature(Min|Max)?C$/u.test(path)
    || /movementMm$/u.test(path)
    || /offsetMm$/u.test(path);
}

function validateFieldRules(value, path, errors) {
  const positive = new Set([
    'loadCalculation.gravityMPerS2', 'loadCalculation.loadFactor',
    'webglNavigation.supportMarkerSize', 'webglNavigation.pickingRadius', 'webglNavigation.cameraFitMargin',
    'webglNavigation.clickTimingMs', 'webglNavigation.doubleClickTimingMs', 'webglNavigation.clickTravelTolerancePx',
    'webglNavigation.zoomRate', 'webglNavigation.navigationSensitivity', 'webglNavigation.perspectiveFovDeg',
    'webglNavigation.meshRadialSegments', 'webglNavigation.cameraNearMm', 'webglNavigation.cameraFarMm',
    'benchmark.webglReadyMaxMs', 'benchmark.selectionP95MaxMs', 'benchmark.editCommitMaxMs', 'benchmark.navigationMinFps',
  ]);
  if (value !== null && positive.has(path) && (!(value > 0) || !Number.isFinite(value))) {
    errors.push(errorRow(path, 'NON_POSITIVE_VALUE', 'Value must be finite and greater than zero.'));
  }
  if (path === 'webglNavigation.meshRadialSegments' && value !== null && (!Number.isInteger(value) || value < 3)) {
    errors.push(errorRow(path, 'INVALID_SEGMENT_COUNT', 'Mesh radial segments must be an integer of at least 3.'));
  }
  if (path === 'webglNavigation.perspectiveFovDeg' && value !== null && value >= 180) {
    errors.push(errorRow(path, 'INVALID_CAMERA_FOV', 'Perspective field of view must be below 180 degrees.'));
  }
  if (path === 'loadCalculation.componentWeightsKg' && isRecord(value)) {
    Object.entries(value).forEach(([key, mass]) => {
      if (!Number.isFinite(mass) || mass <= 0) {
        errors.push(errorRow(`${path}.${key}`, 'INVALID_COMPONENT_MASS', 'Approved component masses must be greater than zero.'));
      }
    });
  }
  if ([
    'loadCalculation.materialDensitiesKgPerM3',
    'loadCalculation.operatingFluidDensitiesKgPerM3',
    'loadCalculation.hydroFluidDensitiesKgPerM3',
    'loadCalculation.insulationDensitiesKgPerM3',
    'loadCalculation.pipeSectionProperties',
  ].includes(path)) {
    validatePositiveLeaves(value, path, errors);
  }
  if (path === 'loadCalculation.activeLoadCases' && value !== null
      && (!Array.isArray(value) || value.some((row) => !['EMPTY', 'OPE', 'HYD'].includes(row))
      || new Set(value).size !== value.length)) {
    errors.push(errorRow(path, 'INVALID_LOAD_CASES', 'Active load cases must be unique EMPTY, OPE, or HYD identifiers.'));
  }
  if (path.endsWith('Source') && isRecord(value) && stringValue(value.sha256)
      && !/^[a-f0-9]{64}$/iu.test(stringValue(value.sha256))) {
    errors.push(errorRow(`${path}.sha256`, 'INVALID_SOURCE_HASH', 'Source SHA-256 must contain 64 hexadecimal characters.'));
  }
  if (path === 'engineeringCalculationDefaults.resolutionPolicy') {
    validateResolutionPolicy(value, path, errors);
  }
  if (path === 'engineeringCalculationDefaults.dimensionVerificationTolerancesMm') {
    validateDimensionTolerances(value, path, errors);
  }
  if (path === 'engineeringCalculationDefaults.configuredDefaults') {
    validateConfiguredDefaults(value, path, errors);
  }
  if (path === 'engineeringCalculationDefaults.verticalContactScreening') {
    validateVerticalContactScreening(value, path, errors);
  }
  if (path === 'engineeringCalculationDefaults.pDeltaScreening') {
    validatePDeltaScreening(value, path, errors);
  }
}

function validateResolutionPolicy(value, path, errors) {
  if (value === null) return;
  if (!Array.isArray(value) || value.length !== REQUIRED_RESOLUTION_POLICY.length
      || value.some((item, index) => item !== REQUIRED_RESOLUTION_POLICY[index])) {
    errors.push(errorRow(
      path,
      'INVALID_RESOLUTION_POLICY',
      `Resolution policy must be exactly: ${REQUIRED_RESOLUTION_POLICY.join(' -> ')}.`,
    ));
  }
}

function validateDimensionTolerances(value, path, errors) {
  if (value === null) return;
  if (!isRecord(value)) {
    errors.push(errorRow(path, 'INVALID_DIMENSION_TOLERANCES', 'Dimension tolerances must be an object.'));
    return;
  }
  for (const key of ['outsideDiameterMm', 'wallThicknessMm']) {
    if (!Number.isFinite(value[key]) || value[key] <= 0) {
      errors.push(errorRow(`${path}.${key}`, 'INVALID_DIMENSION_TOLERANCE', `${key} must be finite and greater than zero.`));
    }
  }
}

function validateConfiguredDefaults(value, path, errors) {
  if (value === null) return;
  if (!Array.isArray(value)) {
    errors.push(errorRow(path, 'INVALID_CONFIGURED_DEFAULTS', 'Configured defaults must be an array.'));
    return;
  }
  const ids = new Set();
  value.forEach((record, index) => {
    const rowPath = `${path}[${index}]`;
    if (!isRecord(record)) {
      errors.push(errorRow(rowPath, 'INVALID_CONFIGURED_DEFAULT', 'Configured default must be an object.'));
      return;
    }
    const id = stringValue(record.id);
    const field = stringValue(record.field);
    const reason = stringValue(record.reason);
    const qualification = stringValue(record.qualification);
    if (!id) errors.push(errorRow(`${rowPath}.id`, 'MISSING_DEFAULT_ID', 'Configured default ID is required.'));
    else if (ids.has(id)) errors.push(errorRow(`${rowPath}.id`, 'DUPLICATE_DEFAULT_ID', `Duplicate configured default ID: ${id}.`));
    else ids.add(id);
    if (typeof record.enabled !== 'boolean') {
      errors.push(errorRow(`${rowPath}.enabled`, 'INVALID_DEFAULT_ENABLED', 'Configured default enabled must be boolean.'));
    }
    if (!field) errors.push(errorRow(`${rowPath}.field`, 'MISSING_DEFAULT_FIELD', 'Configured default field is required.'));
    if (!Object.hasOwn(record, 'value')) {
      errors.push(errorRow(`${rowPath}.value`, 'MISSING_EXPLICIT_DEFAULT_VALUE', 'Configured default must explicitly declare value, including zero.'));
    } else {
      if (record.enabled === true && (record.value === null || record.value === undefined)) {
        errors.push(errorRow(`${rowPath}.value`, 'ENABLED_DEFAULT_VALUE_MISSING', 'An enabled configured default cannot use null or undefined as its engineering value.'));
      }
      validateFiniteDefaultNumbers(record.value, `${rowPath}.value`, errors);
    }
    if (record.unit !== null && record.unit !== undefined && typeof record.unit !== 'string') {
      errors.push(errorRow(`${rowPath}.unit`, 'INVALID_DEFAULT_UNIT', 'Configured default unit must be text or null.'));
    }
    if (!isRecord(record.scope)) {
      errors.push(errorRow(`${rowPath}.scope`, 'INVALID_DEFAULT_SCOPE', 'Configured default scope must be an object.'));
    }
    if (!reason) errors.push(errorRow(`${rowPath}.reason`, 'MISSING_DEFAULT_REASON', 'Configured default reason is required.'));
    if (!qualification) {
      errors.push(errorRow(`${rowPath}.qualification`, 'MISSING_DEFAULT_QUALIFICATION', 'Configured default qualification is required.'));
    }
    if (field === 'section.schedule' && isRecord(record.scope)) {
      const missing = SCHEDULE_SCOPE_FIELDS.filter((key) => !Object.hasOwn(record.scope, key)
        || record.scope[key] === null || record.scope[key] === undefined || record.scope[key] === '');
      if (missing.length > 0) {
        errors.push(errorRow(
          `${rowPath}.scope`,
          'UNSCOPED_SCHEDULE_DEFAULT',
          `Schedule defaults require exact scope fields: ${SCHEDULE_SCOPE_FIELDS.join(', ')}. Missing: ${missing.join(', ')}.`,
        ));
      }
    }
  });
}

function validateFiniteDefaultNumbers(value, path, errors) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(errorRow(path, 'INVALID_DEFAULT_NUMBER', 'Configured default numbers must be finite.'));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateFiniteDefaultNumbers(item, `${path}[${index}]`, errors));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) => validateFiniteDefaultNumbers(item, `${path}.${key}`, errors));
  }
}

function validateVerticalContactScreening(value, path, errors) {
  if (value === null) return;
  if (!isRecord(value)) {
    errors.push(errorRow(path, 'INVALID_VERTICAL_CONTACT_CONFIG', 'Vertical contact screening must be an object or null.'));
    return;
  }
  if (typeof value.enabled !== 'boolean') {
    errors.push(errorRow(`${path}.enabled`, 'INVALID_VERTICAL_CONTACT_ENABLED', 'Vertical contact enabled must be boolean.'));
  }
  if (value.enabled === true && !VERTICAL_CONTACT_MODELS.has(stringValue(value.model))) {
    errors.push(errorRow(`${path}.model`, 'INVALID_VERTICAL_CONTACT_MODEL', 'Enabled vertical contact screening requires a supported model.'));
  }
}

function validatePDeltaScreening(value, path, errors) {
  if (value === null) return;
  if (!isRecord(value)) {
    errors.push(errorRow(path, 'INVALID_PDELTA_CONFIG', 'P-delta screening must be an object or null.'));
    return;
  }
  if (typeof value.enabled !== 'boolean') {
    errors.push(errorRow(`${path}.enabled`, 'INVALID_PDELTA_ENABLED', 'P-delta enabled must be boolean.'));
  }
  if (value.enabled === true && stringValue(value.method) !== 'ONE_PASS_EULER_AMPLIFICATION') {
    errors.push(errorRow(`${path}.method`, 'INVALID_PDELTA_METHOD', 'Enabled P-delta screening requires ONE_PASS_EULER_AMPLIFICATION.'));
  }
}

function validatePositiveLeaves(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validatePositiveLeaves(item, `${path}[${index}]`, errors));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) => validatePositiveLeaves(item, `${path}.${key}`, errors));
    return;
  }
  if (typeof value === 'number' && value <= 0) {
    errors.push(errorRow(path, 'NON_POSITIVE_ENGINEERING_VALUE', 'Engineering density and section values must be greater than zero.'));
  }
}

function validateRequired(entry, path, errors) {
  if (!isEvidenceValue(entry) || isEmpty(entry.value)) {
    errors.push(errorRow(path, 'MISSING_VALUE', 'An authoritative value is required.'));
    return;
  }
  if (!isRecord(entry.evidence) || !stringValue(entry.evidence.source)) {
    errors.push(errorRow(path, 'MISSING_EVIDENCE', 'Source evidence is required.'));
  }
  if (entry.approved !== true) errors.push(errorRow(path, 'NOT_APPROVED', 'User approval is required.'));
}

function validateSourceHash(entry, path, activeHashes, errors, validateActiveSource) {
  const expected = stringValue(entry?.evidence?.sourceHash).toLowerCase();
  const sourceKey = stringValue(entry?.evidence?.sourceKey);
  const declared = stringValue(entry?.value?.sha256).toLowerCase();
  if (declared && expected && declared !== expected) {
    errors.push(errorRow(path, 'CROSS_DATASET_HASH_MISMATCH', 'Declared source hash differs from its evidence hash.'));
  }
  if (!validateActiveSource || !expected || !sourceKey || !isRecord(activeHashes)) return;
  const active = stringValue(activeHashes[sourceKey]).toLowerCase();
  if (['dataset', 'lineList', 'pipingClass', 'componentWeight'].includes(sourceKey) && !active) {
    errors.push(errorRow(path, 'ACTIVE_SOURCE_HASH_MISSING', `Active ${sourceKey} source SHA-256 is required.`));
    return;
  }
  if (active && active !== expected) {
    errors.push(errorRow(path, 'STALE_SOURCE_HASH', `Evidence hash does not match active ${sourceKey} source.`));
  }
}

function emptyEvidenceValue() {
  return freezeDeep({ value: null, evidence: null, approved: false });
}

function isEvidenceValue(value) {
  return isRecord(value) && Object.hasOwn(value, 'value')
    && Object.hasOwn(value, 'evidence') && typeof value.approved === 'boolean';
}

function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return isRecord(value) && Object.keys(value).length === 0;
}

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function errorRow(path, code, message) {
  return freezeDeep({ path, code, message });
}
