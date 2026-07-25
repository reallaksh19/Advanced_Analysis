import { canonicalPrettyStringify, utf8ByteLength } from '../core/shared-piping-model/canonical-json.js';
import { validateSharedPipingModel } from '../core/shared-piping-model/shared-piping-model.js';
import { freezeDeep } from './dataset-utils.js';

export const SHARED_MODEL_EXPORT_ARTIFACT_SCHEMA = 'shared-model-export-artifact/v1';

export function createSharedModelExportArtifact(model) {
  const validation = validateSharedPipingModel(model);
  if (!validation.ok) throw new TypeError(`Shared model export is invalid: ${validation.errors.join(' ')}`);
  const content = canonicalPrettyStringify(model);
  return freezeDeep({
    schema: SHARED_MODEL_EXPORT_ARTIFACT_SCHEMA,
    filename: `${stableBaseName(model.project.datasetId)}.json`,
    mimeType: 'application/json;charset=utf-8',
    content,
    byteLength: utf8ByteLength(content),
    modelSemanticHash: model.semanticHash,
  });
}

export function triggerSharedModelDownload(documentRef, artifact, urlApi = URL) {
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

function assertDownloadInput(documentRef, artifact, urlApi) {
  if (!documentRef?.createElement || !documentRef?.body) throw new TypeError('Shared model download requires a document.');
  if (!artifact || artifact.schema !== SHARED_MODEL_EXPORT_ARTIFACT_SCHEMA) {
    throw new TypeError(`Shared model download requires ${SHARED_MODEL_EXPORT_ARTIFACT_SCHEMA}.`);
  }
  if (!urlApi?.createObjectURL || !urlApi?.revokeObjectURL) throw new TypeError('Shared model download requires an object URL API.');
}

function stableBaseName(datasetId) {
  const normalized = String(datasetId || 'dataset')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'dataset';
  return `shared-piping-model-${normalized}`;
}
