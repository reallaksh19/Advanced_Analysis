import { validateEngineeringSettingsAudit } from './audit.js';
import { validateEngineeringSettingsProfile } from './profile.js';

export function validateSettingsProposalChanged(payload) {
  exact(payload, ['settingId','value'], 'engineeringSettings:proposalChanged');
  nonEmpty(payload.settingId, 'settingId');
  if (!['string','number','boolean'].includes(typeof payload.value)) throw new TypeError('Settings proposal value is invalid.');
}
export function validateSettingsApplyRequested(payload) { optionalEmpty(payload, 'engineeringSettings:applyRequested'); }
export function validateSettingsResetRequested(payload) {
  exact(payload, ['mode'], 'engineeringSettings:resetRequested');
  if (!['ACTIVE','APPROVED_DEFAULTS'].includes(payload.mode)) throw new TypeError('Settings reset mode is invalid.');
}
export function validateSettingsChanged(payload) {
  exact(payload, ['audit','profile','reviewModel'], 'engineeringSettings:changed');
  if (!validateEngineeringSettingsProfile(payload.profile).ok) throw new TypeError('Settings changed profile is invalid.');
  if (!validateEngineeringSettingsAudit(payload.audit).ok) throw new TypeError('Settings changed audit is invalid.');
  if (payload.reviewModel?.schema !== 'settings-review-model/v1') throw new TypeError('Settings changed review model is invalid.');
}
export function validateSettingsApplyFailed(payload) {
  exact(payload, ['code','message','reviewModel'], 'engineeringSettings:applyFailed');
  nonEmpty(payload.code, 'code'); nonEmpty(payload.message, 'message');
  if (payload.reviewModel?.schema !== 'settings-review-model/v1') throw new TypeError('Settings failure review model is invalid.');
}
function optionalEmpty(value, topic) { if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length)) throw new TypeError(`${topic} payload must be omitted or empty.`); }
function exact(value, keys, topic) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${topic} payload must be an object.`); if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new TypeError(`${topic} payload fields are invalid.`); }
function nonEmpty(value, field) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string.`); }
