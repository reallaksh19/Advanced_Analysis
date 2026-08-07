import { clonePlain, freezeDeep, isRecord, stringValue } from '../dataset-utils.js';
import {
  NON_FEA_PHASE_2_INTRODUCTION,
  PROJECT_DATA_GROUPS,
  PROJECT_DATA_PROFILE_SCHEMA,
  PROJECT_DATA_REQUIREMENTS,
} from './project-data-fields.js';
import {
  NON_FEA_METHOD_IDS,
  validateConfiguredDefaultsPolicy,
} from './non-fea-field-registry.js';

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
 * Additively upgrades legacy v1 profiles with Phase 2 fields. Existing fields
 * are never repaired or overwritten; only fields explicitly marked as Phase 2
 * additions are inserted as missing, unapproved evidence values.
 */
export function upgradeProjectDataProfile(profile) {
  if (!isRecord(profile) || profile.schema !== PROJECT_DATA_PROFILE_SCHEMA) return profile;
  const upgraded = clonePlain(profile);
  PROJECT_DATA_GROUPS.forEach((group) => {
    const additions = group.fields.filter((field) => field.introducedIn === NON_FEA_PHASE_2_INTRODUCTION);
    if (!additions.length) return;
    if (!Object.hasOwn(upgraded, group.key)) upgraded[group.key] = {};
    if (!isRecord(upgraded[group.key])) return;
    additions.forEach((field) => {
      if (!Object.hasOwn(upgraded[group.key], field.key)) upgraded[group.key][field.key] = emptyEvidenceValue();
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
  const normalized = upgradeProjectDataProfile(profile);
  const required = PROJECT_DATA_REQUIREMENTS[workflow];
  validateAllFields(normalized, activeHashes, errors, new Set(required || []));
  if (!required) errors.push(errorRow('workflow', 'UNKNOWN_WORKFLOW', `Unknown Project Data workflow: ${workflow}.`));
  (required || []).forEach((path) => validateRequired(readPath(normalized, path), path, errors));
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
  const normalized = upgradeProjectDataProfile(profile);
  const [groupKey, fieldKey] = path.split('.');
  if (!normalized[groupKey] || !Object.hasOwn(normalized[groupKey], fieldKey)) {
    throw new RangeError(`Unknown Project Data field: ${path}.`);
  }
  return freezeDeep({
    ...clonePlain(normalized),
    revision: Number(normalized.revision) + 1,
    updatedAt: new Date().toISOString(),
    [groupKey]: {
      ...clonePlain(normalized[groupKey]),
      [fieldKey]: createEvidenceValue(value, evidence, approved),
    },
  });
}

function validateAllFields(profile, activeHashes, errors, requiredPaths) {
  if (!Number.isInteger(profile.revision) || profile.revision < 0) errors.push(errorRow('revision', 'INVALID_REVISION', 'Revision must be a non-negative integer.'));
  PROJECT_DATA_GROUPS.forEach((group) => group.fields.forEach((field) => {
    const path = `${group.key}.${field.key}`;
    const entry = readPath(profile, path);
    if (!isEvidenceValue(entry)) {
      errors.push(errorRow(path, 'INVALID_FIELD', 'Field must contain value, evidence, and approved members.'));
      return;
    }
    validateNumber(entry.value, path, field.numericPolicy, errors);
    validateNestedNumbers(entry.value, path, field.numericPolicy, errors);
    validateFieldRules(entry.value, path, errors);
    validateSourceHash(entry, path, activeHashes, errors, requiredPaths.has(path));
  }));
  const near = projectDataValue(profile, 'webglNavigation.cameraNearMm');
  const far = projectDataValue(profile, 'webglNavigation.cameraFarMm');
  if (Number.isFinite(near) && Number.isFinite(far) && far <= near) errors.push(errorRow('webglNavigation.cameraFarMm', 'INVALID_CAMERA_RANGE', 'Camera far plane must be greater than the near plane.'));
}

function validateNumber(value, path, numericPolicy, errors) {
  if (typeof value !== 'number') return;
  if (!Number.isFinite(value)) {
    errors.push(errorRow(path, 'INVALID_NUMBER', 'Numeric values must be finite.'));
    return;
  }
  if (numericPolicy !== 'SIGNED' && value < 0) errors.push(errorRow(path, 'INVALID_NUMBER', 'Numeric values must be non-negative.'));
}

function validateNestedNumbers(value, path, numericPolicy, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNestedNumbers(item, `${path}[${index}]`, numericPolicy, errors));
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) errors.push(errorRow(`${path}.${key}`, 'INVALID_NESTED_NUMBER', 'Nested numeric values must be finite.'));
      else if (numericPolicy !== 'SIGNED' && item < 0) errors.push(errorRow(`${path}.${key}`, 'INVALID_NESTED_NUMBER', 'Nested numeric values must be non-negative.'));
    } else validateNestedNumbers(item, `${path}.${key}`, numericPolicy, errors);
  });
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
  if (value !== null && positive.has(path) && (!(value > 0) || !Number.isFinite(value))) errors.push(errorRow(path, 'NON_POSITIVE_VALUE', 'Value must be finite and greater than zero.'));
  if (path === 'webglNavigation.meshRadialSegments' && value !== null && (!Number.isInteger(value) || value < 3)) errors.push(errorRow(path, 'INVALID_SEGMENT_COUNT', 'Mesh radial segments must be an integer of at least 3.'));
  if (path === 'webglNavigation.perspectiveFovDeg' && value !== null && value >= 180) errors.push(errorRow(path, 'INVALID_CAMERA_FOV', 'Perspective field of view must be below 180 degrees.'));
  if (path === 'loadCalculation.componentWeightsKg' && isRecord(value)) Object.entries(value).forEach(([key, mass]) => { if (!Number.isFinite(mass) || mass <= 0) errors.push(errorRow(`${path}.${key}`, 'INVALID_COMPONENT_MASS', 'Approved component masses must be greater than zero.')); });
  if ([
    'loadCalculation.materialDensitiesKgPerM3',
    'loadCalculation.operatingFluidDensitiesKgPerM3',
    'loadCalculation.hydroFluidDensitiesKgPerM3',
    'loadCalculation.insulationDensitiesKgPerM3',
    'loadCalculation.pipeSectionProperties',
    'thermoMechanicalBasis.materialElasticProperties',
  ].includes(path)) validatePositiveLeaves(value, path, errors);
  if (path === 'loadCalculation.activeLoadCases' && value !== null && (!Array.isArray(value) || value.some((row) => !['EMPTY', 'OPE', 'HYD'].includes(row)) || new Set(value).size !== value.length)) errors.push(errorRow(path, 'INVALID_LOAD_CASES', 'Active load cases must be unique EMPTY, OPE, or HYD identifiers.'));
  if (path.endsWith('Source') && isRecord(value) && stringValue(value.sha256) && !/^[a-f0-9]{64}$/i.test(stringValue(value.sha256))) errors.push(errorRow(`${path}.sha256`, 'INVALID_SOURCE_HASH', 'Source SHA-256 must contain 64 hexadecimal characters.'));
  validatePhase2Object(value, path, errors);
}

function validatePhase2Object(value, path, errors) {
  const objectPaths = new Set([
    'thermoMechanicalBasis.operatingTemperaturesC',
    'thermoMechanicalBasis.casePressuresPa',
    'thermoMechanicalBasis.corrosionAllowancesMm',
    'thermoMechanicalBasis.materialElasticProperties',
    'thermoMechanicalBasis.stressCodeBasis',
    'thermoMechanicalBasis.pressureBoundarySemantics',
    'thermoMechanicalBasis.fluidPhaseAndFillState',
    'restraintPolicy.restraintStiffnessNPerM',
    'restraintPolicy.restraintGapsMm',
    'restraintPolicy.restraintPreloadsN',
    'restraintPolicy.frictionCoefficients',
    'restraintPolicy.contactPolicy',
    'qualificationPolicy.qualificationProfiles',
    'qualificationPolicy.nonlinearApplicabilityPolicy',
    'qualificationPolicy.superpositionPolicy',
  ]);
  if (value !== null && objectPaths.has(path) && !isRecord(value)) {
    errors.push(errorRow(path, 'INVALID_POLICY_OBJECT', 'Value must be an object keyed by governed identity or policy member.'));
  }
  if (path === 'qualificationPolicy.configuredDefaults' && value !== null) {
    const audit = validateConfiguredDefaultsPolicy(value);
    audit.errors.forEach((row) => errors.push(errorRow(row.path, row.code, row.message)));
  }
  if (path === 'qualificationPolicy.qualificationProfiles' && value !== null) validateQualificationProfiles(value, path, errors);
}

function validateQualificationProfiles(value, path, errors) {
  if (!isRecord(value) || value.schema !== 'non-fea-qualification-profile-set/v1' || !Array.isArray(value.profiles)) {
    errors.push(errorRow(path, 'INVALID_QUALIFICATION_PROFILE_SET', 'Expected non-fea-qualification-profile-set/v1 with a profiles array.'));
    return;
  }
  if (value.profiles.length === 0) errors.push(errorRow(`${path}.profiles`, 'MISSING_QUALIFICATION_PROFILES', 'At least one qualification profile is required.'));
  const identities = new Set();
  value.profiles.forEach((profile, index) => {
    const itemPath = `${path}.profiles[${index}]`;
    if (!isRecord(profile)) {
      errors.push(errorRow(itemPath, 'INVALID_QUALIFICATION_PROFILE', 'Qualification profile must be an object.'));
      return;
    }
    const profileId = stringValue(profile.profileId);
    if (!profileId) errors.push(errorRow(`${itemPath}.profileId`, 'MISSING_PROFILE_ID', 'Profile ID is required.'));
    const identity = `${profileId}@${profile.version}`;
    if (identities.has(identity)) errors.push(errorRow(itemPath, 'DUPLICATE_QUALIFICATION_PROFILE', `Duplicate profile identity: ${identity}.`));
    identities.add(identity);
    if (!Number.isInteger(profile.version) || profile.version < 1) errors.push(errorRow(`${itemPath}.version`, 'INVALID_PROFILE_VERSION', 'Profile version must be a positive integer.'));
    if (!Array.isArray(profile.methods) || profile.methods.length === 0) {
      errors.push(errorRow(`${itemPath}.methods`, 'MISSING_PROFILE_METHODS', 'At least one method binding is required.'));
    } else {
      profile.methods.forEach((methodId) => {
        if (!NON_FEA_METHOD_IDS.includes(methodId)) errors.push(errorRow(`${itemPath}.methods`, 'UNKNOWN_PROFILE_METHOD', `Unknown Non-FEA method: ${methodId}.`));
      });
      if (new Set(profile.methods).size !== profile.methods.length) errors.push(errorRow(`${itemPath}.methods`, 'DUPLICATE_PROFILE_METHOD', 'Qualification profile method bindings must be unique.'));
    }
    if (!['QUALIFIED', 'UNQUALIFIED'].includes(profile.qualification)) errors.push(errorRow(`${itemPath}.qualification`, 'INVALID_PROFILE_QUALIFICATION', 'Qualification must be QUALIFIED or UNQUALIFIED.'));
    if (typeof profile.locked !== 'boolean') errors.push(errorRow(`${itemPath}.locked`, 'INVALID_PROFILE_LOCK', 'Locked must be boolean.'));
  });
}

function validatePositiveLeaves(value, path, errors) {
  if (Array.isArray(value)) { value.forEach((item, index) => validatePositiveLeaves(item, `${path}[${index}]`, errors)); return; }
  if (isRecord(value)) { Object.entries(value).forEach(([key, item]) => validatePositiveLeaves(item, `${path}.${key}`, errors)); return; }
  if (typeof value === 'number' && value <= 0) errors.push(errorRow(path, 'NON_POSITIVE_ENGINEERING_VALUE', 'Engineering density, elastic, thermal, and section values must be greater than zero.'));
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
  if (declared && expected && declared !== expected) errors.push(errorRow(path, 'CROSS_DATASET_HASH_MISMATCH', 'Declared source hash differs from its evidence hash.'));
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
  return { value: null, evidence: null, approved: false };
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
