import { deepFreeze } from '../shared-piping-model/index.js';
import { createEngineeringSettingsAudit } from './audit.js';
import { approvedSettingValues } from './definitions.js';
import { createApprovedDefaultProfile, createEngineeringSettingsProfile, validateEngineeringSettingsProfile } from './profile.js';
import { createSettingsReviewModel } from './review-model.js';

export class EngineeringSettingsAuthority {
  constructor({ loadedProfile = null, persistenceSummary = {}, diagnostics = [] } = {}) {
    const validLoaded = loadedProfile && validateEngineeringSettingsProfile(loadedProfile).ok;
    this.activeProfile = validLoaded ? loadedProfile : createApprovedDefaultProfile();
    this.proposal = { ...this.activeProfile.settings };
    this.persistenceSummary = deepFreeze({ ...persistenceSummary });
    this.diagnostics = [...diagnostics];
    this.audit = createEngineeringSettingsAudit({ nextProfile: this.activeProfile, diagnostics: this.diagnostics });
  }
  updateProposal(settingId, value) { this.proposal = { ...this.proposal, [settingId]: value }; return this.getReviewModel(); }
  resetProposal() { this.proposal = { ...this.activeProfile.settings }; return this.getReviewModel(); }
  resetToApprovedDefaults() { this.proposal = { ...approvedSettingValues() }; return this.getReviewModel(); }
  prepareApply(evidence = {}) {
    const nextProfile = createEngineeringSettingsProfile(this.proposal);
    const audit = createEngineeringSettingsAudit({ previousProfile: this.activeProfile, nextProfile, evidence });
    return deepFreeze({ nextProfile, audit });
  }
  commit(prepared, persistenceSummary) {
    this.activeProfile = prepared.nextProfile;
    this.audit = prepared.audit;
    this.proposal = { ...this.activeProfile.settings };
    this.persistenceSummary = deepFreeze({ ...persistenceSummary });
    this.diagnostics = [];
    return this.getReviewModel();
  }
  recordFailure(code, message) {
    this.diagnostics = [{ code, severity: 'ERROR', message }];
    return this.getReviewModel();
  }
  getProfile() { return this.activeProfile; }
  getAudit() { return this.audit; }
  getProposal() { return deepFreeze({ ...this.proposal }); }
  getReviewModel(evidence = {}) {
    return createSettingsReviewModel({
      activeProfile: this.activeProfile, proposal: this.proposal, audit: this.audit,
      persistenceSummary: this.persistenceSummary, evidence, diagnostics: this.diagnostics,
    });
  }
}
