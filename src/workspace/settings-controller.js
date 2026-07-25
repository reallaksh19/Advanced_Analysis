import {
  EngineeringSettingsAuthority,
  SETTINGS_EVENTS,
  validateEngineeringSettingsProfile,
} from '../core/settings-authority/index.js';
import { deepFreeze } from '../core/shared-piping-model/index.js';
import { EventBus } from './event-bus.js';
import { SettingsPersistenceAdapter } from './settings-persistence-adapter.js';
import { SettingsView } from './settings-view.js';

export class SettingsController {
  constructor(rootElement, eventBus = EventBus, persistence = new SettingsPersistenceAdapter(), evidenceProvider = () => ({})) {
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.persistence = persistence;
    this.evidenceProvider = evidenceProvider;
    this.authority = null;
    this.view = new SettingsView(rootElement, eventBus);
    this.unsubscribeCallbacks = [];
  }
  init() {
    if (this.authority) return;
    const loaded = this.persistence.load();
    this.authority = new EngineeringSettingsAuthority({ loadedProfile: loaded.profile, persistenceSummary: loaded.summary, diagnostics: loaded.diagnostics });
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(SETTINGS_EVENTS.PROPOSAL_CHANGED, ({ settingId, value }) => this.updateProposal(settingId, value)),
      this.eventBus.subscribe(SETTINGS_EVENTS.RESET_REQUESTED, ({ mode }) => this.reset(mode)),
      this.eventBus.subscribe(SETTINGS_EVENTS.APPLY_REQUESTED, () => this.apply()),
    ];
    this.render();
  }
  updateProposal(settingId, value) { this.authority.updateProposal(settingId, value); this.render(); }
  reset(mode) {
    if (mode === 'APPROVED_DEFAULTS') this.authority.resetToApprovedDefaults();
    else this.authority.resetProposal();
    this.render();
  }
  apply() {
    let accepted = null;
    try {
      const evidence = this.evidenceProvider();
      const prepared = this.authority.prepareApply(evidence);
      const persistenceSummary = this.persistence.save(prepared.nextProfile);
      const reviewModel = this.authority.commit(prepared, persistenceSummary);
      this.view.render(reviewModel);
      accepted = deepFreeze({ profile: prepared.nextProfile, audit: prepared.audit, reviewModel });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reviewModel = this.authority.recordFailure('SETTINGS_APPLY_REJECTED', message);
      this.view.render(reviewModel);
      this.eventBus.publish(SETTINGS_EVENTS.APPLY_FAILED, deepFreeze({ code: 'SETTINGS_APPLY_REJECTED', message, reviewModel }));
      return;
    }
    this.eventBus.publish(SETTINGS_EVENTS.CHANGED, accepted);
  }
  render() { this.view.render(this.authority.getReviewModel(this.evidenceProvider())); }
  getProfile() { return this.authority?.getProfile() || null; }
  getAudit() { return this.authority?.getAudit() || null; }
  getReviewModel() { return this.authority?.getReviewModel(this.evidenceProvider()) || null; }
  getStatus() {
    const profile = this.getProfile();
    return deepFreeze({ settingsAuthorityInitialized: Boolean(this.authority), settingsDefinitionsAvailable: true, settingsProfileValid: Boolean(profile && validateEngineeringSettingsProfile(profile).ok) });
  }
  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.view.destroy();
    this.authority = null;
  }
}
