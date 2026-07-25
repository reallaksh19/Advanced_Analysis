import {
  canonicalPrettyStringify,
  deepFreeze,
  semanticHash,
  utf8ByteLength,
} from '../core/shared-piping-model/index.js';

export function createModelLoadExportArtifact(foundation) {
  if (!foundation?.loadPrimitiveSet) throw new TypeError('Model-load foundation is required.');
  const base = {
    schema: 'model-load-export/v1',
    datasetId: foundation.loadPrimitiveSet.datasetId,
    gravityProfile: foundation.gravityProfile,
    loadCaseSet: foundation.loadCaseSet,
    compositionProfile: foundation.compositionProfile,
    loadSourceProjection: foundation.loadSourceProjection,
    loadPrimitiveSet: foundation.loadPrimitiveSet,
    readinessAudit: foundation.readinessAudit,
  };
  const payload = deepFreeze({ ...base, semanticHash: semanticHash(base) });
  const content = canonicalPrettyStringify(payload);
  return deepFreeze({
    filename: `model-load-${safeName(payload.datasetId)}.json`,
    mimeType: 'application/json;charset=utf-8',
    content,
    byteLength: utf8ByteLength(content),
    semanticHash: payload.semanticHash,
  });
}

export function triggerModelLoadDownload(documentRef, artifact) {
  if (!documentRef?.createElement) throw new TypeError('A document is required for model-load export.');
  const blob = new Blob([artifact.content], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
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
