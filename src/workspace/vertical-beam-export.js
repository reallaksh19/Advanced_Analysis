import {
  canonicalPrettyStringify, deepFreeze, semanticHash, utf8ByteLength,
} from '../core/shared-piping-model/index.js';

export function createVerticalBeamExportArtifact(snapshot) {
  if (!snapshot?.profile || !snapshot?.flexuralProjection || !snapshot?.beamModel || !snapshot?.solution || !snapshot?.audit) {
    throw new TypeError('Completed vertical-beam solution is required for export.');
  }
  const base = {
    schema: 'vertical-beam-solution-export/v1', datasetId: snapshot.beamModel.datasetId,
    profile: snapshot.profile,
    flexuralPropertyProjection: snapshot.flexuralProjection,
    verticalBeamModel: snapshot.beamModel,
    verticalBeamSolution: snapshot.solution,
    verticalBeamSolverAudit: snapshot.audit,
  };
  const payload = deepFreeze({ ...base, semanticHash: semanticHash(base) });
  const content = canonicalPrettyStringify(payload);
  return deepFreeze({
    filename: `vertical-beam-solution-${safeName(payload.datasetId)}.json`,
    mimeType: 'application/json;charset=utf-8', content,
    byteLength: utf8ByteLength(content), semanticHash: payload.semanticHash,
  });
}

export function triggerVerticalBeamDownload(documentRef, artifact) {
  if (!documentRef?.createElement) throw new TypeError('A document is required for vertical-beam export.');
  const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mimeType }));
  const anchor = documentRef.createElement('a');
  anchor.href = url; anchor.download = artifact.filename; anchor.click();
  URL.revokeObjectURL(url);
}
function safeName(value) {
  const normalized = String(value || 'dataset').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return normalized.replace(/^-|-$/g, '') || 'dataset';
}
