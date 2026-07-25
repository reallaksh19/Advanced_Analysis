import {
  validateLoadCaseSet,
  validateModelLoadPrimitiveSet,
  validateModelLoadReadinessAudit,
} from '../core/model-loads/index.js';

class ModelLoadStoreContract {
  #foundation = null;

  setFoundation(foundation) {
    validate(foundation);
    this.#foundation = foundation;
    return this.#foundation;
  }

  getFoundation() {
    return this.#foundation;
  }

  getLoadCaseSet() {
    return this.#foundation?.loadCaseSet || null;
  }

  getLoadPrimitiveSet() {
    return this.#foundation?.loadPrimitiveSet || null;
  }

  getReadinessAudit() {
    return this.#foundation?.readinessAudit || null;
  }

  clear() {
    this.#foundation = null;
  }
}

function validate(foundation) {
  const results = [
    validateLoadCaseSet(foundation?.loadCaseSet),
    validateModelLoadPrimitiveSet(foundation?.loadPrimitiveSet),
    validateModelLoadReadinessAudit(foundation?.readinessAudit),
  ];
  const errors = results.flatMap((result) => result.errors);
  if (errors.length) throw new TypeError(`Model-load foundation is invalid: ${errors.join(' ')}`);
}

export const ModelLoadStore = Object.freeze(new ModelLoadStoreContract());
