import approved1885sProfile from '../../../project-data/1885s-project-data-profile.json' with { type: 'json' };
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { clonePlain, freezeDeep } from '../dataset-utils.js';
import {
  createEmptyProjectDataProfile,
  replaceProjectDataValue,
  validateProjectDataProfile,
} from './project-data-contract.js';

/** In-memory authority for visible, source-backed Project Data. */
export class ProjectDataStore {
  #profile = null;
  #origin = null;
  #listeners = new Set();

  #ensureInit() {
    if (!this.#profile) {
      this.#profile = approvedProfile();
      this.#origin = bundledOrigin(this.#profile);
    }
  }

  getProfile() {
    this.#ensureInit();
    return this.#profile;
  }

  getOrigin() {
    this.#ensureInit();
    return this.#origin;
  }

  importProfile(profile, sourceName) {
    if (typeof sourceName !== 'string' || !sourceName.trim()) throw new TypeError('Project Data import source name is required.');
    const audit = validateProjectDataProfile(profile, 'normalization', null);
    if (audit.errors.some((row) => row.code === 'INVALID_SCHEMA' || row.code === 'INVALID_FIELD')) {
      throw new TypeError(`Project Data import failed: ${audit.errors.map((row) => row.message).join(' ')}`);
    }
    this.#profile = freezeDeep(clonePlain(profile));
    this.#origin = freezeDeep({ kind: 'EXPLICIT_FILE_IMPORT', source: sourceName.trim(), profileSemanticHash: semanticHash(this.#profile) });
    this.#publish('imported');
    return this.#profile;
  }

  restoreApprovedProfile() {
    this.#profile = approvedProfile();
    this.#origin = bundledOrigin(this.#profile);
    this.#publish('approved-profile-restored');
    return this.#profile;
  }

  update(path, value, evidence, approved) {
    this.#ensureInit();
    this.#profile = replaceProjectDataValue(this.#profile, path, value, evidence, approved);
    this.#publish('updated');
    return this.#profile;
  }

  clear() {
    this.#profile = createEmptyProjectDataProfile();
    this.#origin = freezeDeep({ kind: 'EMPTY', source: 'User-cleared Project Data', profileSemanticHash: semanticHash(this.#profile) });
    this.#publish('cleared');
    return this.#profile;
  }

  validate(workflow, activeHashes) {
    this.#ensureInit();
    return validateProjectDataProfile(this.#profile, workflow, activeHashes);
  }

  subscribe(listener) {
    this.#ensureInit();
    if (typeof listener !== 'function') throw new TypeError('Project Data listener must be a function.');
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #publish(reason) {
    this.#ensureInit();
    this.#listeners.forEach((listener) => listener({ reason, profile: this.#profile }));
  }
}

export const projectDataStore = new ProjectDataStore();

function approvedProfile() {
  const profile = freezeDeep(clonePlain(approved1885sProfile));
  for (const workflow of ['normalization', 'topology', 'editing', 'webgl', 'benchmark']) {
    const audit = validateProjectDataProfile(profile, workflow, null);
    if (!audit.valid) throw new TypeError(`Bundled 1885S Project Data is invalid for ${workflow}: ${audit.errors.map((row) => `${row.path} ${row.message}`).join('; ')}`);
  }
  return profile;
}

function bundledOrigin(profile) {
  return freezeDeep({
    kind: 'BUNDLED_APPROVED_PROJECT_ARTIFACT',
    source: 'project-data/1885s-project-data-profile.json',
    profileSemanticHash: semanticHash(profile),
  });
}
