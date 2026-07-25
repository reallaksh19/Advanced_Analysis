import { deepFreeze } from '../shared-piping-model/index.js';
import { SETTING_CLASSIFICATIONS } from './constants.js';

const C = SETTING_CLASSIFICATIONS;
const inventory = [
  legacy('allowPlaceholderLoads', C.LEGACY_ONLY, 'Legacy placeholder-load switch is not read by the shipped Workspace runtime.'),
  legacy('benchmarkCertificationRequired', C.DISPLAY_ONLY, 'Repository certification policy is not an in-application engineering input.'),
  legacy('defaultForceUnit', C.LEGACY_ONLY, 'The current runtime uses explicit canonical force units in closed contracts.'),
  legacy('defaultLengthUnit', C.LEGACY_ONLY, 'The current runtime uses explicit canonical geometry units in closed contracts.'),
  legacy('defaultStressUnit', C.LEGACY_ONLY, 'The current runtime does not expose a global stress-unit authority.'),
  legacy('materialDataSource', C.UNSUPPORTED, 'No qualified selectable material provider exists in the shipped Workspace runtime.'),
  legacy('pipeDataSource', C.UNSUPPORTED, 'No qualified selectable pipe provider exists in the shipped Workspace runtime.'),
  legacy('projectUnitSystem', C.LEGACY_ONLY, 'Global application unit conversion is outside the current runtime boundary.'),
  legacy('rackFrictionFactor', C.LEGACY_ONLY, 'Legacy rack solvers are not mounted by the shipped Workspace bootstrap.'),
  legacy('rackSpacingMargin', C.LEGACY_ONLY, 'Legacy rack-layout defaults are not consumed by the shipped Workspace bootstrap.'),
  active({
    settingId: 'reportTimestampPolicy',
    label: 'Report timestamp policy',
    description: 'Controls whether an explicit Reports export appends a generated UTC timestamp to export content.',
    valueType: 'ENUM',
    canonicalUnit: null,
    approvedDefault: 'exclude-from-deterministic-hash',
    defaultAuthority: 'src/data/engineeringDefaults/defaults.js legacy default, qualified by W10.R3',
    allowedValuesOrRange: ['exclude-from-deterministic-hash', 'include-in-export-content'],
    runtimeConsumers: ['REPORTS'],
    invalidationTargets: ['modelCalculationExportArtifact'],
    persistencePolicy: 'CANONICAL_PROFILE_ONLY',
  }),
  legacy('shortDropLimit_ft', C.LEGACY_ONLY, 'Legacy guided-cantilever defaults are not consumed by the shipped Workspace runtime.'),
].sort((a, b) => a.settingId.localeCompare(b.settingId));

export const LEGACY_SETTINGS_INVENTORY = deepFreeze(inventory);
export const ACTIVE_SETTING_DEFINITIONS = deepFreeze(inventory.filter((row) => row.classification === C.ACTIVE_RUNTIME_INPUT));

export function getActiveSettingDefinition(settingId) {
  return ACTIVE_SETTING_DEFINITIONS.find((row) => row.settingId === settingId) || null;
}

export function approvedSettingValues() {
  return deepFreeze(Object.fromEntries(ACTIVE_SETTING_DEFINITIONS.map((row) => [row.settingId, row.approvedDefault])));
}

function active(value) {
  return deepFreeze({ classification: C.ACTIVE_RUNTIME_INPUT, ...value });
}

function legacy(settingId, classification, evidence) {
  return deepFreeze({
    settingId,
    classification,
    evidence,
    editable: false,
    runtimeConsumers: [],
    invalidationTargets: [],
  });
}
