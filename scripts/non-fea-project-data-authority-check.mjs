import assert from 'node:assert/strict';
import approved1885sProfile from '../project-data/1885s-project-data-profile.json' with { type: 'json' };
import {
  replaceProjectDataValue,
  upgradeProjectDataProfile,
  validateProjectDataProfile,
} from '../src/workspace/project-data/project-data-contract.js';
import {
  NON_FEA_CONFIGURED_DEFAULT_POLICY_SCHEMA,
  NON_FEA_FIELD_REGISTRY,
  NON_FEA_FIELD_REGISTRY_SCHEMA,
  createConfiguredDefaultUsageLedger,
  createNonFeaFieldOwnershipMatrix,
  validateConfiguredDefaultsPolicy,
} from '../src/workspace/project-data/non-fea-field-registry.js';
import { ProjectDataStore } from '../src/workspace/project-data/project-data-store.js';

const SEMANTIC_HASH = /^fnv1a64:[a-f0-9]{16}$/;

const upgraded = upgradeProjectDataProfile(approved1885sProfile);
assert.equal(upgraded.schema, 'project-data-profile/v1');
assert.equal(upgraded.projectId, approved1885sProfile.projectId);
assert.equal(upgraded.revision, approved1885sProfile.revision);
assert.equal(upgraded.sourcesAndUnits.datasetSource.value.sha256, approved1885sProfile.sourcesAndUnits.datasetSource.value.sha256);
for (const groupKey of ['thermoMechanicalBasis', 'restraintPolicy', 'qualificationPolicy']) {
  assert.ok(upgraded[groupKey], `missing additive group ${groupKey}`);
}
assert.deepEqual(upgraded.thermoMechanicalBasis.installationTemperatureC, {
  value: null,
  evidence: null,
  approved: false,
});

const normalizationAudit = validateProjectDataProfile(upgraded, 'normalization', null);
assert.equal(normalizationAudit.valid, true, normalizationAudit.errors.map((row) => `${row.path}:${row.code}`).join('\n'));
const policyAudit = validateProjectDataProfile(upgraded, 'nonFeaPolicy', null);
assert.equal(policyAudit.valid, false);
assert.ok(policyAudit.errors.some((row) => row.path === 'thermoMechanicalBasis.installationTemperatureC' && row.code === 'MISSING_VALUE'));
assert.ok(policyAudit.errors.some((row) => row.path === 'qualificationPolicy.configuredDefaults' && row.code === 'MISSING_VALUE'));

const signedTemperature = replaceProjectDataValue(
  upgraded,
  'thermoMechanicalBasis.installationTemperatureC',
  -20,
  { source: 'Project design basis', locator: 'Temperature basis T-01' },
  true,
);
const signedAudit = validateProjectDataProfile(signedTemperature, 'normalization', null);
assert.ok(!signedAudit.errors.some((row) => row.path === 'thermoMechanicalBasis.installationTemperatureC' && ['INVALID_NUMBER', 'INVALID_NESTED_NUMBER'].includes(row.code)));

const invalidPressure = replaceProjectDataValue(
  signedTemperature,
  'thermoMechanicalBasis.casePressuresPa',
  { OPE: -1 },
  { source: 'Invalid fixture', locator: 'OPE' },
  true,
);
const invalidPressureAudit = validateProjectDataProfile(invalidPressure, 'normalization', null);
assert.ok(invalidPressureAudit.errors.some((row) => row.path === 'thermoMechanicalBasis.casePressuresPa.OPE' && row.code === 'INVALID_NESTED_NUMBER'));

const invalidQualificationProfiles = replaceProjectDataValue(
  signedTemperature,
  'qualificationPolicy.qualificationProfiles',
  {
    schema: 'non-fea-qualification-profile-set/v1',
    profiles: [{
      profileId: 'INVALID-PROFILE',
      version: 1,
      methods: ['UNKNOWN_METHOD'],
      qualification: 'QUALIFIED',
      locked: true,
    }],
  },
  { source: 'Invalid fixture', locator: 'qualification profile' },
  true,
);
const invalidQualificationAudit = validateProjectDataProfile(invalidQualificationProfiles, 'normalization', null);
assert.ok(invalidQualificationAudit.errors.some((row) => row.code === 'UNKNOWN_PROFILE_METHOD'));

assert.equal(NON_FEA_FIELD_REGISTRY.schema, NON_FEA_FIELD_REGISTRY_SCHEMA);
assert.ok(NON_FEA_FIELD_REGISTRY.fields.length >= 40);
assert.equal(new Set(NON_FEA_FIELD_REGISTRY.fields.map((row) => row.fieldId)).size, NON_FEA_FIELD_REGISTRY.fields.length);
for (const definition of NON_FEA_FIELD_REGISTRY.fields) {
  assert.ok(definition.authorityPath.length > 0, `${definition.fieldId} has no authority path`);
  if (definition.projectDataPath) {
    const entry = definition.projectDataPath.split('.').reduce((current, key) => current?.[key], upgraded);
    assert.ok(entry && Object.hasOwn(entry, 'value'), `${definition.fieldId} points to missing ${definition.projectDataPath}`);
  }
  if (definition.defaultEligible) assert.ok(definition.authorityPath.includes('PROJECT_CONFIGURED_DEFAULT'), `${definition.fieldId} permits defaults without configured-default authority`);
  else assert.ok(!definition.authorityPath.includes('PROJECT_CONFIGURED_DEFAULT'), `${definition.fieldId} exposes undocumented default authority`);
}

const ownership = createNonFeaFieldOwnershipMatrix(upgraded);
assert.equal(ownership.schema, 'non-fea-field-ownership-matrix/v1');
assert.equal(ownership.rows.length, NON_FEA_FIELD_REGISTRY.fields.length);
assert.match(ownership.semanticHash, SEMANTIC_HASH);

const defaultPolicy = {
  schema: NON_FEA_CONFIGURED_DEFAULT_POLICY_SCHEMA,
  defaults: [{
    defaultId: 'DEFAULT-INSTALL-TEMP-C',
    fieldId: 'INSTALLATION_TEMPERATURE',
    value: -20,
    unit: '°C',
    basis: 'Approved project ambient installation basis',
    allowedMethods: ['THERMAL_FREE_DISPLACEMENT'],
  }],
};
assert.equal(validateConfiguredDefaultsPolicy(defaultPolicy).valid, true);
assert.equal(validateConfiguredDefaultsPolicy({
  schema: NON_FEA_CONFIGURED_DEFAULT_POLICY_SCHEMA,
  defaults: [{
    defaultId: 'BAD-GRAVITY',
    fieldId: 'GRAVITY_ACCELERATION',
    value: 9.81,
    unit: 'm/s²',
    basis: 'Not permitted through configured defaults',
    allowedMethods: ['WEIGHT_AND_GRAVITY'],
  }],
}).valid, false);

const usageRequest = {
  defaultId: 'DEFAULT-INSTALL-TEMP-C',
  fieldId: 'INSTALLATION_TEMPERATURE',
  methodId: 'THERMAL_FREE_DISPLACEMENT',
  targetId: 'LINE-1885S-04',
  reason: 'No explicit installation temperature was present for this governed line.',
};
const unapprovedDefaultPolicy = replaceProjectDataValue(
  signedTemperature,
  'qualificationPolicy.configuredDefaults',
  defaultPolicy,
  { source: 'Project default register', locator: 'DEFAULT-INSTALL-TEMP-C' },
  false,
);
assert.throws(
  () => createConfiguredDefaultUsageLedger(unapprovedDefaultPolicy, [usageRequest]),
  /approved Project Data policy/,
);

const withDefaultPolicy = replaceProjectDataValue(
  signedTemperature,
  'qualificationPolicy.configuredDefaults',
  defaultPolicy,
  { source: 'Project default register', locator: 'DEFAULT-INSTALL-TEMP-C' },
  true,
);
const ledger = createConfiguredDefaultUsageLedger(withDefaultPolicy, [usageRequest]);
assert.equal(ledger.schema, 'non-fea-configured-default-usage-ledger/v1');
assert.equal(ledger.rows.length, 1);
assert.equal(ledger.rows[0].value, -20);
assert.match(ledger.semanticHash, SEMANTIC_HASH);

const store = new ProjectDataStore();
const beforeHash = store.getSemanticHash();
let observed = null;
const unsubscribe = store.subscribe((event) => { observed = event; });
store.update(
  'thermoMechanicalBasis.installationTemperatureC',
  -15,
  { source: 'Project design basis', locator: 'Temperature basis T-02' },
  true,
);
unsubscribe();
assert.ok(observed);
assert.equal(observed.revision, approved1885sProfile.revision + 1);
assert.match(observed.profileSemanticHash, SEMANTIC_HASH);
assert.notEqual(observed.profileSemanticHash, beforeHash);
assert.equal(observed.profileSemanticHash, store.getSemanticHash());

console.log(JSON.stringify({
  phase: 2,
  registryFields: NON_FEA_FIELD_REGISTRY.fields.length,
  ownershipHash: ownership.semanticHash,
  configuredDefaultUsageHash: ledger.semanticHash,
  deterministicStalenessSignal: true,
  legacyProfileUpgrade: true,
  signedTemperatureSupported: true,
  invalidQualificationMethodRejected: true,
  unapprovedDefaultUseRejected: true,
  undocumentedDefaultsPermitted: false,
}, null, 2));
