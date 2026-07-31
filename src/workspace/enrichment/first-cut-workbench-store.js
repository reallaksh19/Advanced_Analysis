/**
 * Functionality: Stores staged UI sidecars, imported master data, preflight
 * evidence, and the sealed first-cut result. Imported model entities are never
 * stored or mutated here.
 */

import { freezeDeep } from '../dataset-utils.js';

export class FirstCutWorkbenchStore {
  #snapshot = emptySnapshot(0);

  loadDataset(sourceSemanticHash) {
    if (this.#snapshot.sourceSemanticHash === sourceSemanticHash) return this.#snapshot;
    const calculationPackage = this.#snapshot.calculationPackage;
    this.#snapshot = freezeDeep({
      ...emptySnapshot(this.#snapshot.version + 1),
      sourceSemanticHash,
      calculationPackage,
      basisVisible: Boolean(calculationPackage),
      stale: Boolean(calculationPackage),
    });
    return this.#snapshot;
  }

  setActiveTab(activeTab) {
    return this.#update({ activeTab });
  }

  setProfileField(field, value) {
    return this.#update({ profileForm: { ...this.#snapshot.profileForm, [field]: value } });
  }

  addBinding(binding) {
    const records = [...this.#snapshot.stagedBindings.filter((row) => row.recordId !== binding.recordId), binding];
    return this.#update({ stagedBindings: records.sort((left, right) => left.recordId.localeCompare(right.recordId)) });
  }

  removeBinding(recordId) {
    return this.#update({ stagedBindings: this.#snapshot.stagedBindings.filter((row) => row.recordId !== recordId) });
  }

  setMasterData(masterData) {
    return this.#update({ masterData, message: `Imported ${masterData.records.length} authorized master records.`, error: '' });
  }

  resetStaged() {
    return this.#update({
      profileForm: this.#snapshot.sealedProfileForm,
      stagedBindings: this.#snapshot.sealedBindings,
      preflight: null,
      error: '',
      message: 'Staged values restored from the last sealed sidecar.',
    });
  }

  seal(calculationPackage) {
    return this.#update({
      sealedProfileForm: this.#snapshot.profileForm,
      sealedBindings: this.#snapshot.stagedBindings,
      calculationPackage,
      basisVisible: true,
      stale: false,
      preflight: null,
      error: '',
      message: `First-cut package sealed with status ${calculationPackage.status}.`,
    });
  }

  setPreflight(preflight) { return this.#update({ preflight, error: '', message: '' }); }
  clearPreflight() { return this.#update({ preflight: null }); }
  hideBasis() { return this.#update({ basisVisible: false }); }
  markStale() { return this.#update({ stale: Boolean(this.#snapshot.calculationPackage) }); }
  setError(error) { return this.#update({ error: String(error), message: '' }); }
  setMessage(message) { return this.#update({ message: String(message), error: '' }); }
  getSnapshot() { return this.#snapshot; }
  clear() { this.#snapshot = emptySnapshot(this.#snapshot.version + 1); return this.#snapshot; }

  #update(patch) {
    this.#snapshot = freezeDeep({ ...this.#snapshot, ...patch, version: this.#snapshot.version + 1 });
    return this.#snapshot;
  }
}

function emptySnapshot(version) {
  return freezeDeep({
    sourceSemanticHash: '',
    activeTab: 'PIPING_CLASS_BORE',
    profileForm: emptyProfileForm(),
    sealedProfileForm: emptyProfileForm(),
    stagedBindings: [],
    sealedBindings: [],
    masterData: null,
    preflight: null,
    calculationPackage: null,
    basisVisible: false,
    stale: false,
    error: '',
    message: '',
    version,
  });
}

function emptyProfileForm() {
  return freezeDeep({
    profileId: '',
    methodId: '',
    loadCaseIds: [],
    gravityAccelerationMPerS2: '',
    gravityDirection: '',
    gravitySource: '',
    geometryAbsoluteM: '',
    geometryRelative: '',
    forceAbsoluteN: '',
    forceRelative: '',
    momentAbsoluteNm: '',
    momentRelative: '',
    sagRequested: false,
    sagMaximumM: '',
    sagSource: '',
    sustainedRequested: false,
    pressureFormulaId: '',
    sustainedInputJson: '',
    profileSource: '',
    masterSourceId: '',
    masterRevision: '',
  });
}
