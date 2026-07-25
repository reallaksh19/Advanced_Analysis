export const ENGINEERING_SETTINGS_PROFILE_SCHEMA = 'engineering-settings-profile/v1';
export const ENGINEERING_SETTINGS_AUDIT_SCHEMA = 'engineering-settings-audit/v1';
export const SETTINGS_REVIEW_MODEL_SCHEMA = 'settings-review-model/v1';
export const ENGINEERING_SETTINGS_PERSISTENCE_KEY = 'simplified-analysis:engineering-settings:v1';

export const SETTING_CLASSIFICATIONS = Object.freeze({
  ACTIVE_RUNTIME_INPUT: 'ACTIVE_RUNTIME_INPUT',
  DISPLAY_ONLY: 'DISPLAY_ONLY',
  LEGACY_ONLY: 'LEGACY_ONLY',
  UNSUPPORTED: 'UNSUPPORTED',
  SECURITY_SENSITIVE: 'SECURITY_SENSITIVE',
});

export const EVIDENCE_STATES = Object.freeze({
  STALE: 'STALE',
  UNAFFECTED: 'UNAFFECTED',
  NOT_MATERIALIZED: 'NOT_MATERIALIZED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

export const SETTINGS_EVENTS = Object.freeze({
  PROPOSAL_CHANGED: 'engineeringSettings:proposalChanged',
  APPLY_REQUESTED: 'engineeringSettings:applyRequested',
  CHANGED: 'engineeringSettings:changed',
  APPLY_FAILED: 'engineeringSettings:applyFailed',
  RESET_REQUESTED: 'engineeringSettings:resetRequested',
});
