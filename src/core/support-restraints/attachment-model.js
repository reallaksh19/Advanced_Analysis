import {
  deepFreeze,
  semanticHash,
  stringValue,
  validateSharedPipingModel,
} from '../shared-piping-model/index.js';
import { validatePipingPortTopologyGraph } from '../piping-topology/index.js';
import {
  createEvidenceOnlyAttachmentProfile,
  validateSupportAttachmentProfile,
} from './attachment-profile.js';
import { createSupportAttachmentAudit, validateSupportAttachmentAudit } from './attachment-audit.js';
import { resolveSupportAttachments } from './attachment-resolver.js';
import { buildAttachmentTargets } from './attachment-targets.js';
import { SUPPORT_ATTACHMENT_MODEL_SCHEMA } from './constants.js';
import {
  projectEngineeringSupports,
  validateEngineeringSupportProjection,
} from './support-projection.js';

export function buildSupportAttachmentModel(sharedModel, topologyGraph, profile = null) {
  assertInputs(sharedModel, topologyGraph);
  const resolvedProfile = profile || createEvidenceOnlyAttachmentProfile(sharedModel.units.length);
  assertProfile(resolvedProfile);
  const projection = projectEngineeringSupports(sharedModel);
  const targets = buildAttachmentTargets(sharedModel, topologyGraph);
  const resolution = resolveSupportAttachments({
    sharedModel,
    graph: topologyGraph,
    profile: resolvedProfile,
    projection,
    targets,
  });
  const attachmentAudit = createSupportAttachmentAudit(
    projection,
    resolution,
    targets,
    resolvedProfile,
  );
  const base = {
    schema: SUPPORT_ATTACHMENT_MODEL_SCHEMA,
    datasetId: sharedModel.project.datasetId,
    sharedModelSemanticHash: sharedModel.semanticHash,
    topologySemanticHash: topologyGraph.semanticHash,
    profile: resolvedProfile,
    supportProjection: projection,
    targets: targets.targets,
    attachments: resolution.attachments,
    supportStates: resolution.supportStates,
    attachmentAudit,
    summary: modelSummary(resolution, attachmentAudit),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateSupportAttachmentModel(model) {
  const errors = [];
  if (!model || model.schema !== SUPPORT_ATTACHMENT_MODEL_SCHEMA) errors.push('Invalid support attachment model schema.');
  if (!stringValue(model?.datasetId)) errors.push('Support attachment model datasetId is required.');
  validateSupportAttachmentProfile(model?.profile).errors.forEach((error) => errors.push(error));
  validateEngineeringSupportProjection(model?.supportProjection).errors.forEach((error) => errors.push(error));
  validateSupportAttachmentAudit(model?.attachmentAudit).errors.forEach((error) => errors.push(error));
  validateRows(model?.attachments, 'attachmentId', 'attachments', errors);
  validateRows(model?.supportStates, 'supportKey', 'support states', errors);
  validateReferences(model, errors);
  if (model && model.semanticHash !== semanticHash(withoutHash(model))) errors.push('Support attachment model semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function modelSummary(resolution, audit) {
  return {
    supportCount: resolution.supportStates.length,
    attachmentCount: resolution.attachments.length,
    attachedCount: audit.summary.attachedCount,
    ambiguousCount: audit.summary.ambiguousCount,
    unattachedCount: audit.summary.unattachedCount,
    invalidPositionCount: audit.summary.invalidPositionCount,
    identityConflictCount: audit.summary.identityConflictCount,
    unitBlockedCount: audit.summary.unitBlockedCount,
  };
}

function validateReferences(model, errors) {
  const supportKeys = new Set(model?.supportProjection?.supports?.map((row) => row.supportKey) || []);
  const componentKeys = new Set(model?.targets?.map((row) => row.componentKey) || []);
  const portKeys = new Set(model?.targets?.map((row) => row.portKey).filter(Boolean) || []);
  model?.attachments?.forEach((attachment) => {
    if (!supportKeys.has(attachment.supportKey)) errors.push(`Attachment ${attachment.attachmentId} references a missing support.`);
    if (!componentKeys.has(attachment.attachedComponentKey)) errors.push(`Attachment ${attachment.attachmentId} references a missing component.`);
    if (attachment.attachedPortKey && !portKeys.has(attachment.attachedPortKey)) errors.push(`Attachment ${attachment.attachmentId} references a missing port.`);
  });
}

function validateRows(rows, key, label, errors) {
  if (!Array.isArray(rows)) return errors.push(`Support attachment ${label} must be an array.`);
  const keys = rows.map((row) => stringValue(row?.[key]));
  if (keys.some((value) => !value)) errors.push(`Support attachment ${label} contains a missing ${key}.`);
  if (new Set(keys).size !== keys.length) errors.push(`Support attachment ${label} contains duplicate ${key} values.`);
}

function assertInputs(sharedModel, topologyGraph) {
  const sharedValidation = validateSharedPipingModel(sharedModel);
  if (!sharedValidation.ok) throw new TypeError(`Support attachment requires shared-piping-model/v1: ${sharedValidation.errors.join(' ')}`);
  const topologyValidation = validatePipingPortTopologyGraph(topologyGraph);
  if (!topologyValidation.ok) throw new TypeError(`Support attachment requires piping-port-topology-graph/v1: ${topologyValidation.errors.join(' ')}`);
  if (topologyGraph.sharedModelSemanticHash !== sharedModel.semanticHash) {
    throw new TypeError('Topology graph does not belong to the supplied shared model.');
  }
}

function assertProfile(profile) {
  const validation = validateSupportAttachmentProfile(profile);
  if (!validation.ok) throw new TypeError(`Invalid support attachment profile: ${validation.errors.join(' ')}`);
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
