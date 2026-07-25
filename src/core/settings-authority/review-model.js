import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { SETTINGS_REVIEW_MODEL_SCHEMA } from './constants.js';
import { ACTIVE_SETTING_DEFINITIONS, LEGACY_SETTINGS_INVENTORY } from './definitions.js';
import { createEngineeringSettingsAudit, validateEngineeringSettingsAudit } from './audit.js';
import { createApprovedDefaultProfile, createEngineeringSettingsProfile, validateEngineeringSettingsProfile } from './profile.js';
import { validateSettingsValues } from './validation.js';

export function createSettingsReviewModel({ activeProfile, proposal, audit, persistenceSummary, evidence = {}, diagnostics = [] } = {}) {
  if (!validateEngineeringSettingsProfile(activeProfile).ok) throw new TypeError('Settings review requires a valid active profile.');
  if (!validateEngineeringSettingsAudit(audit).ok) throw new TypeError('Settings review requires a valid audit.');
  const proposalValidation = validateSettingsValues(proposal);
  let previewAudit = null;
  if (proposalValidation.ok) previewAudit = createEngineeringSettingsAudit({ previousProfile: activeProfile, nextProfile: createEngineeringSettingsProfile(proposal), evidence });
  const defaultProfile = createApprovedDefaultProfile();
  const fieldRows = ACTIVE_SETTING_DEFINITIONS.map((definition) => deepFreeze({
    settingId: definition.settingId,
    label: definition.label,
    description: definition.description,
    valueType: definition.valueType,
    canonicalUnit: definition.canonicalUnit,
    activeValue: activeProfile.settings[definition.settingId],
    proposedValue: proposal?.[definition.settingId],
    approvedDefault: definition.approvedDefault,
    allowedValuesOrRange: definition.allowedValuesOrRange,
    runtimeConsumers: definition.runtimeConsumers,
    invalidationTargets: definition.invalidationTargets,
    fieldErrors: proposalValidation.fieldErrors[definition.settingId] || [],
  }));
  const dependencyRows = ACTIVE_SETTING_DEFINITIONS.flatMap((definition) => definition.invalidationTargets.map((contractKey) => deepFreeze({
    settingId: definition.settingId, consumerIds: definition.runtimeConsumers, contractKey,
  })));
  const reviewDiagnostics = collectDiagnostics([
    ...(audit.diagnostics || []),
    ...normalizeDiagnostics(diagnostics),
    ...proposalValidation.errors.map((message) => ({ code: 'SETTINGS_PROPOSAL_INVALID', severity: 'ERROR', message })),
  ]);
  const base = {
    schema: SETTINGS_REVIEW_MODEL_SCHEMA,
    profileIdentity: activeProfile.profileId,
    profileSemanticHash: activeProfile.semanticHash,
    defaultProfileIdentity: defaultProfile.profileId,
    fieldRows,
    dependencyRows,
    invalidationSummary: previewAudit ? {
      changedSettingIds: previewAudit.changedSettingIds,
      affectedConsumerIds: previewAudit.affectedConsumerIds,
      affectedContractKeys: previewAudit.affectedContractKeys,
      stalePreparedEvidence: previewAudit.stalePreparedEvidence,
      unaffectedEvidence: previewAudit.unaffectedEvidence,
      recalculationRequired: false,
    } : { changedSettingIds: [], affectedConsumerIds: [], affectedContractKeys: [], stalePreparedEvidence: [], unaffectedEvidence: [], recalculationRequired: false },
    persistenceSummary: deepFreeze({ ...(persistenceSummary || {}) }),
    diagnostics: deepFreeze(reviewDiagnostics),
    limitations: deepFreeze([
      'Only reportTimestampPolicy has a verified shipped-runtime consumer in W10.R3.',
      'Settings changes never run calculations, exports, rebuilds or dataset mutations automatically.',
      'Legacy unit, database, rack, placeholder-load and certification fields are not active engineering inputs.',
    ]),
    classificationRows: LEGACY_SETTINGS_INVENTORY,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateSettingsReviewModel(value, input) {
  const errors = [];
  try {
    const expected = createSettingsReviewModel(input);
    if (canonicalStringify(value) !== canonicalStringify(expected)) errors.push('Settings review model does not match source evidence.');
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return deepFreeze({ ok: errors.length === 0, errors });
}
function normalizeDiagnostics(rows) { return (rows || []).map((row) => ({ code: String(row.code || 'SETTINGS_DIAGNOSTIC'), severity: String(row.severity || 'INFO'), message: String(row.message || '') })); }
function collectDiagnostics(rows) {
  const normalized = normalizeDiagnostics(rows);
  const unique = new Map(normalized.map((row) => [canonicalStringify(row), row]));
  return [...unique.values()].sort((a, b) => canonicalStringify(a).localeCompare(canonicalStringify(b)));
}
