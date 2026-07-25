import {
  canonicalPrettyStringify,
  deepFreeze,
  semanticHash,
  utf8ByteLength,
} from '../core/shared-piping-model/index.js';

export function createSupportLoadScreeningExportArtifact(snapshot) {
  if (!snapshot?.profile || !snapshot?.pathModel || !snapshot?.screening || !snapshot?.audit) {
    throw new TypeError('Completed support-load screening is required for export.');
  }
  const base = {
    schema: 'support-load-screening-export/v1',
    datasetId: snapshot.pathModel.datasetId,
    profile: snapshot.profile,
    verticalLoadPathModel: snapshot.pathModel,
    tributarySupportLoadScreening: snapshot.screening,
    supportLoadScreeningAudit: snapshot.audit,
  };
  const payload = deepFreeze({ ...base, semanticHash: semanticHash(base) });
  const content = canonicalPrettyStringify(payload);
  return deepFreeze({
    filename: `support-load-screening-${safeName(payload.datasetId)}.json`,
    mimeType: 'application/json;charset=utf-8',
    content,
    byteLength: utf8ByteLength(content),
    semanticHash: payload.semanticHash,
  });
}

export function triggerSupportLoadScreeningDownload(documentRef, artifact) {
  if (!documentRef?.createElement) throw new TypeError('A document is required for support-load screening export.');
  const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mimeType }));
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeName(value) {
  const normalized = String(value || 'dataset').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return normalized.replace(/^-|-$/g, '') || 'dataset';
}
