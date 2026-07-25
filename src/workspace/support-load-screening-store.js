import {
  validateSupportLoadScreeningAudit,
  validateTributarySupportLoadScreening,
  validateVerticalLoadPathModel,
  validateVerticalLoadPathProfile,
} from '../core/support-load-screening/index.js';

let profile = null;
let pathModel = null;
let screening = null;
let audit = null;

export const SupportLoadScreeningStore = Object.freeze({
  setPathFoundation(nextProfile, nextPathModel) {
    assertValid(validateVerticalLoadPathProfile(nextProfile), 'profile');
    assertValid(validateVerticalLoadPathModel(nextPathModel), 'path model');
    profile = nextProfile;
    pathModel = nextPathModel;
    screening = null;
    audit = null;
  },
  setScreening(nextScreening, nextAudit) {
    assertValid(validateTributarySupportLoadScreening(nextScreening), 'screening');
    assertValid(validateSupportLoadScreeningAudit(nextAudit), 'screening audit');
    if (!pathModel || nextScreening.pathModelSemanticHash !== pathModel.semanticHash) {
      throw new TypeError('Screening does not match the active path model.');
    }
    screening = nextScreening;
    audit = nextAudit;
  },
  clearScreening() { screening = null; audit = null; },
  clear() { profile = null; pathModel = null; screening = null; audit = null; },
  getProfile() { return profile; },
  getPathModel() { return pathModel; },
  getScreening() { return screening; },
  getAudit() { return audit; },
  getSnapshot() { return Object.freeze({ profile, pathModel, screening, audit }); },
});

function assertValid(validation, label) {
  if (!validation.ok) throw new TypeError(`Invalid support-load screening ${label}: ${validation.errors.join(' ')}`);
}
