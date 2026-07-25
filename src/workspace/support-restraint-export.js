import {
  canonicalPrettyStringify,
  utf8ByteLength,
} from '../core/shared-piping-model/index.js';
import {
  validateRestraintCapabilityModel,
  validateSupportAttachmentModel,
} from '../core/support-restraints/index.js';
import { freezeDeep } from './dataset-utils.js';

export const SUPPORT_RESTRAINT_EXPORT_SCHEMA = 'support-restraint-export/v1';

export function createSupportRestraintExportArtifact(attachmentModel, restraintModel) {
  assertModels(attachmentModel, restraintModel);
  const payload = freezeDeep({
    schema: SUPPORT_RESTRAINT_EXPORT_SCHEMA,
    datasetId: attachmentModel.datasetId,
    supportAttachmentModel: attachmentModel,
    supportAttachmentAudit: attachmentModel.attachmentAudit,
    restraintCapabilityModel: restraintModel,
    restraintCapabilityAudit: restraintModel.restraintAudit,
  });
  const content = canonicalPrettyStringify(payload);
  return freezeDeep({
    schema: 'support-restraint-export-artifact/v1',
    filename: `support-restraint-${stableBaseName(attachmentModel.datasetId)}.json`,
    mimeType: 'application/json;charset=utf-8',
    content,
    byteLength: utf8ByteLength(content),
    attachmentModelSemanticHash: attachmentModel.semanticHash,
    restraintModelSemanticHash: restraintModel.semanticHash,
  });
}

export function triggerSupportRestraintDownload(documentRef, artifact, urlApi = URL) {
  assertDownloadInput(documentRef, artifact, urlApi);
  const blob = new Blob([artifact.content], { type: artifact.mimeType });
  const url = urlApi.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = artifact.filename;
    anchor.hidden = true;
    documentRef.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    urlApi.revokeObjectURL(url);
  }
}

function assertModels(attachmentModel, restraintModel) {
  const attachment = validateSupportAttachmentModel(attachmentModel);
  if (!attachment.ok) throw new TypeError(`Invalid attachment export: ${attachment.errors.join(' ')}`);
  const restraint = validateRestraintCapabilityModel(restraintModel);
  if (!restraint.ok) throw new TypeError(`Invalid restraint export: ${restraint.errors.join(' ')}`);
}

function assertDownloadInput(documentRef, artifact, urlApi) {
  if (!documentRef?.createElement || !documentRef?.body) throw new TypeError('Support/restraint download requires a document.');
  if (artifact?.schema !== 'support-restraint-export-artifact/v1') throw new TypeError('Invalid support/restraint export artifact.');
  if (!urlApi?.createObjectURL || !urlApi?.revokeObjectURL) throw new TypeError('Support/restraint download requires an object URL API.');
}

function stableBaseName(datasetId) {
  return String(datasetId || 'dataset')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'dataset';
}
