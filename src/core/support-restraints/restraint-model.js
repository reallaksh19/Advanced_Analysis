import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { validateSupportAttachmentModel } from './attachment-model.js';
import { classifySupportRestraint } from './restraint-classifier.js';
import {
  createDefaultRestraintClassificationProfile,
  validateRestraintClassificationProfile,
} from './restraint-profile.js';
import { createRestraintCapabilityAudit, validateRestraintCapabilityAudit } from './restraint-audit.js';
import {
  RESTRAINT_CAPABILITY_MODEL_SCHEMA,
  RESTRAINT_DIRECTIONS,
  RESTRAINT_QUALIFICATIONS,
  RESTRAINT_STATES,
} from './constants.js';

export function buildRestraintCapabilityModel(attachmentModel, profile = null) {
  assertAttachmentModel(attachmentModel);
  const resolvedProfile = profile || createDefaultRestraintClassificationProfile();
  assertProfile(resolvedProfile);
  const states = new Map(attachmentModel.supportStates.map((state) => [state.supportKey, state]));
  const attachments = groupAttachments(attachmentModel.attachments);
  const restraints = attachmentModel.supportProjection.supports.map((support) => (
    classifySupportRestraint(
      support,
      states.get(support.supportKey),
      attachments.get(support.supportKey) || [],
      resolvedProfile,
    )
  )).sort((left, right) => left.supportKey.localeCompare(right.supportKey));
  const restraintAudit = createRestraintCapabilityAudit(attachmentModel.datasetId, restraints);
  const base = {
    schema: RESTRAINT_CAPABILITY_MODEL_SCHEMA,
    datasetId: attachmentModel.datasetId,
    sharedModelSemanticHash: attachmentModel.sharedModelSemanticHash,
    topologySemanticHash: attachmentModel.topologySemanticHash,
    attachmentModelSemanticHash: attachmentModel.semanticHash,
    profile: resolvedProfile,
    restraints,
    restraintAudit,
    summary: restraintAudit.summary,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateRestraintCapabilityModel(model) {
  const errors = [];
  if (!model || model.schema !== RESTRAINT_CAPABILITY_MODEL_SCHEMA) errors.push('Invalid restraint capability model schema.');
  if (!stringValue(model?.datasetId)) errors.push('Restraint capability model datasetId is required.');
  validateRestraintClassificationProfile(model?.profile).errors.forEach((error) => errors.push(error));
  validateRestraintCapabilityAudit(model?.restraintAudit).errors.forEach((error) => errors.push(error));
  validateRestraints(model?.restraints, errors);
  if (model && model.semanticHash !== semanticHash(withoutHash(model))) errors.push('Restraint capability model semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function validateRestraints(restraints, errors) {
  if (!Array.isArray(restraints)) return errors.push('Restraint capability model restraints must be an array.');
  const ids = restraints.map((row) => stringValue(row?.restraintId));
  if (ids.some((id) => !id)) errors.push('Restraint record restraintId is required.');
  if (new Set(ids).size !== ids.length) errors.push('Restraint record IDs must be unique.');
  restraints.forEach((row) => validateRestraint(row, errors));
}

function validateRestraint(restraint, errors) {
  if (!stringValue(restraint?.supportKey)) errors.push('Restraint supportKey is required.');
  RESTRAINT_DIRECTIONS.forEach((direction) => {
    const record = restraint?.[direction.toLowerCase()];
    if (!Object.values(RESTRAINT_STATES).includes(record?.state)) errors.push(`Restraint ${restraint?.restraintId} has invalid ${direction} state.`);
  });
  if (!Object.values(RESTRAINT_QUALIFICATIONS).includes(restraint?.qualification)) {
    errors.push(`Restraint ${restraint?.restraintId} has invalid qualification.`);
  }
}

function groupAttachments(attachments) {
  const grouped = new Map();
  attachments.forEach((attachment) => {
    const rows = grouped.get(attachment.supportKey) || [];
    rows.push(attachment);
    rows.sort((left, right) => left.attachmentId.localeCompare(right.attachmentId));
    grouped.set(attachment.supportKey, rows);
  });
  return grouped;
}

function assertAttachmentModel(model) {
  const validation = validateSupportAttachmentModel(model);
  if (!validation.ok) throw new TypeError(`Restraint capability requires support-attachment-model/v1: ${validation.errors.join(' ')}`);
}

function assertProfile(profile) {
  const validation = validateRestraintClassificationProfile(profile);
  if (!validation.ok) throw new TypeError(`Invalid restraint classification profile: ${validation.errors.join(' ')}`);
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
