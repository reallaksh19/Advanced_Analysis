import assert from 'node:assert/strict';
import {
  ACTIVE_SETTING_DEFINITIONS,
  LEGACY_SETTINGS_INVENTORY,
  SETTING_CLASSIFICATIONS,
  createApprovedDefaultProfile,
  validateEngineeringSettingsProfile,
  validateSettingDefinitions,
} from '../src/core/settings-authority/index.js';
import {
  APPLICATION_NAVIGATION_ORDER_V7,
  CONSUMER_IDS,
  createApplicationViewStateV7,
  createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistry,
  createWorkspaceConsumerRegistryV2,
  createWorkspaceConsumerRegistryV3,
  createWorkspaceConsumerRegistryV4,
  createWorkspaceConsumerRegistryV5,
  createWorkspaceConsumerRegistryV6,
  createWorkspaceConsumerRegistryV7,
  validateApplicationViewStateV7,
  validateWorkspaceConsumerRegistryV7,
} from '../src/core/workspace-consumers/index.js';

const expectedLegacyIds = [
  'allowPlaceholderLoads','benchmarkCertificationRequired','defaultForceUnit','defaultLengthUnit',
  'defaultStressUnit','materialDataSource','pipeDataSource','projectUnitSystem','rackFrictionFactor',
  'rackSpacingMargin','reportTimestampPolicy','shortDropLimit_ft',
];
assert.deepEqual(LEGACY_SETTINGS_INVENTORY.map((row) => row.settingId), expectedLegacyIds);
assert.equal(validateSettingDefinitions().ok, true);
assert.deepEqual(ACTIVE_SETTING_DEFINITIONS.map((row) => row.settingId), ['reportTimestampPolicy']);
const classification = Object.fromEntries(LEGACY_SETTINGS_INVENTORY.map((row) => [row.settingId, row.classification]));
assert.equal(classification.reportTimestampPolicy, SETTING_CLASSIFICATIONS.ACTIVE_RUNTIME_INPUT);
assert.equal(classification.benchmarkCertificationRequired, SETTING_CLASSIFICATIONS.DISPLAY_ONLY);
assert.equal(classification.pipeDataSource, SETTING_CLASSIFICATIONS.UNSUPPORTED);
assert.equal(classification.materialDataSource, SETTING_CLASSIFICATIONS.UNSUPPORTED);

const profile = createApprovedDefaultProfile();
assert.equal(validateEngineeringSettingsProfile(profile).ok, true);
assert.equal(Object.isFrozen(profile), true);
assert.equal(Object.isFrozen(profile.settings), true);

const registryFactories = [
  createWorkspaceConsumerRegistry, createWorkspaceConsumerRegistryV2,
  createWorkspaceConsumerRegistryV3, createWorkspaceConsumerRegistryV4,
  createWorkspaceConsumerRegistryV5, createWorkspaceConsumerRegistryV6,
];
const baselineHashes = [
  'fnv1a64:933de417d77f43d2','fnv1a64:22f426d2b0677d92','fnv1a64:496eed4568692dfa',
  'fnv1a64:e47035052f70a27c','fnv1a64:3c6af36714a4bedf','fnv1a64:805131b97e910a7c',
];
assert.deepEqual(registryFactories.map((factory) => factory().semanticHash), baselineHashes);
assert.equal(createWorkspaceConsumerRegistryV6().consumers.find((row) => row.consumerId === CONSUMER_IDS.SETTINGS).implementationStatus, 'RECOVERY_PENDING');

const registry = createWorkspaceConsumerRegistryV7();
assert.equal(validateWorkspaceConsumerRegistryV7(registry).ok, true);
assert.equal(registry.consumers.length, 11);
assert.deepEqual(new Set(registry.consumers.map((row) => row.consumerId)), new Set(APPLICATION_NAVIGATION_ORDER_V7));
const settingsDescriptor = registry.consumers.find((row) => row.consumerId === CONSUMER_IDS.SETTINGS);
assert.equal(settingsDescriptor.implementationStatus, 'IMPLEMENTED');
assert.deepEqual(settingsDescriptor.allowedActions, ['APPLY_SETTINGS_PROFILE','RESET_PROPOSAL','RESET_TO_APPROVED_DEFAULTS']);

const context = createWorkspaceConsumerContext({ datasetId: null, workspaceVersion: 0, selectedEntityId: null, contracts: {} });
const readiness = createWorkspaceConsumerReadinessRegistry(registry, context, {
  workspaceBooted: true,
  settingsAuthorityInitialized: true,
  settingsDefinitionsAvailable: true,
  settingsProfileValid: true,
});
const settingsReadiness = readiness.find((row) => row.consumerId === CONSUMER_IDS.SETTINGS);
assert.equal(settingsReadiness.readinessState, 'AVAILABLE');
const state = createApplicationViewStateV7(readiness, { activeViewId: CONSUMER_IDS.SETTINGS });
assert.equal(state.schema, 'application-view-state/v7');
assert.equal(state.activeViewId, CONSUMER_IDS.SETTINGS);
assert.equal(validateApplicationViewStateV7(state).ok, true);

console.log('✅ W10.R3 settings contracts, inventory, v1-v6 preservation and v7 evolution passed.');
