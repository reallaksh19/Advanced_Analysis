import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { ENGINEERING_SETTINGS_AUDIT_SCHEMA, EVIDENCE_STATES } from './constants.js';
import { ACTIVE_SETTING_DEFINITIONS } from './definitions.js';
import { validateEngineeringSettingsProfile } from './profile.js';

export function createEngineeringSettingsAudit({ previousProfile = null, nextProfile, evidence = {}, diagnostics = [] } = {}) {
  if (previousProfile && !validateEngineeringSettingsProfile(previousProfile).ok) throw new TypeError('Previous settings profile is invalid.');
  if (!validateEngineeringSettingsProfile(nextProfile).ok) throw new TypeError('Next settings profile is invalid.');
  const changedSettingIds = previousProfile ? ACTIVE_SETTING_DEFINITIONS
    .map((row) => row.settingId)
    .filter((id) => previousProfile.settings[id] !== nextProfile.settings[id])
    .sort() : [];
  const changedDefinitions = ACTIVE_SETTING_DEFINITIONS.filter((row) => changedSettingIds.includes(row.settingId));
  const affectedConsumerIds = unique(changedDefinitions.flatMap((row) => row.runtimeConsumers));
  const affectedContractKeys = unique(changedDefinitions.flatMap((row) => row.invalidationTargets));
  const materialized = unique(evidence.materializedContractKeys || []);
  const stalePreparedEvidence = affectedContractKeys.filter((key) => materialized.includes(key));
  const unaffectedEvidence = materialized.filter((key) => !affectedContractKeys.includes(key));
  const dependencyRows = affectedContractKeys.map((contractKey) => ({
    contractKey,
    state: materialized.includes(contractKey) ? EVIDENCE_STATES.STALE : EVIDENCE_STATES.NOT_MATERIALIZED,
  }));
  const base = {
    schema: ENGINEERING_SETTINGS_AUDIT_SCHEMA,
    previousProfileId: previousProfile?.profileId || null,
    nextProfileId: nextProfile.profileId,
    changedSettingIds,
    affectedConsumerIds,
    affectedContractKeys,
    stalePreparedEvidence,
    staleCalculatedEvidence: [],
    unaffectedEvidence,
    recalculationRequired: false,
    dependencyRows,
    diagnostics: normalizeDiagnostics(diagnostics),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateEngineeringSettingsAudit(value) {
  const errors = [];
  if (value?.schema !== ENGINEERING_SETTINGS_AUDIT_SCHEMA) errors.push('Invalid engineering settings audit schema.');
  ['changedSettingIds','affectedConsumerIds','affectedContractKeys','stalePreparedEvidence','staleCalculatedEvidence','unaffectedEvidence'].forEach((field) => {
    if (!Array.isArray(value?.[field])) errors.push(`Engineering settings audit ${field} is invalid.`);
  });
  if (value?.recalculationRequired !== false) errors.push('W10.R3 settings must not trigger automatic recalculation.');
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Engineering settings audit semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeDiagnostics(rows) {
  return [...(rows || [])].map((row) => ({ code: String(row.code || 'SETTINGS_DIAGNOSTIC'), severity: String(row.severity || 'INFO'), message: String(row.message || '') }))
    .sort((a, b) => canonicalStringify(a).localeCompare(canonicalStringify(b)));
}
function unique(values) { return [...new Set(values)].sort(); }
function withoutHash(value) { const { semanticHash: _hash, ...base } = value || {}; return base; }
