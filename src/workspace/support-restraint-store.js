import {
  validateRestraintCapabilityModel,
  validateSupportAttachmentModel,
} from '../core/support-restraints/index.js';

class SupportRestraintStoreContract {
  #attachmentModel = null;
  #restraintModel = null;

  setModels(attachmentModel, restraintModel) {
    const attachmentValidation = validateSupportAttachmentModel(attachmentModel);
    if (!attachmentValidation.ok) throw new TypeError(`Support attachment model is invalid: ${attachmentValidation.errors.join(' ')}`);
    const restraintValidation = validateRestraintCapabilityModel(restraintModel);
    if (!restraintValidation.ok) throw new TypeError(`Restraint capability model is invalid: ${restraintValidation.errors.join(' ')}`);
    if (restraintModel.attachmentModelSemanticHash !== attachmentModel.semanticHash) {
      throw new TypeError('Restraint capability model does not belong to the attachment model.');
    }
    this.#attachmentModel = attachmentModel;
    this.#restraintModel = restraintModel;
  }

  getAttachmentModel() {
    return this.#attachmentModel;
  }

  getAttachmentAudit() {
    return this.#attachmentModel?.attachmentAudit || null;
  }

  getRestraintModel() {
    return this.#restraintModel;
  }

  getRestraintAudit() {
    return this.#restraintModel?.restraintAudit || null;
  }

  clear() {
    this.#attachmentModel = null;
    this.#restraintModel = null;
  }
}

export const SupportRestraintStore = Object.freeze(new SupportRestraintStoreContract());
