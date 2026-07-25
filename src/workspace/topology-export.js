import {
  canonicalPrettyStringify,
  utf8ByteLength,
} from '../core/shared-piping-model/index.js';
import { validatePipingPortTopologyGraph } from '../core/piping-topology/index.js';
import { freezeDeep } from './dataset-utils.js';

export const TOPOLOGY_EXPORT_ARTIFACT_SCHEMA = 'topology-export-artifact/v1';

export function createTopologyExportArtifact(graph) {
  const validation = validatePipingPortTopologyGraph(graph);
  if (!validation.ok) throw new TypeError(`Topology export is invalid: ${validation.errors.join(' ')}`);
  const content = canonicalPrettyStringify(graph);
  return freezeDeep({
    schema: TOPOLOGY_EXPORT_ARTIFACT_SCHEMA,
    filename: `${stableBaseName(graph.datasetId)}.json`,
    mimeType: 'application/json;charset=utf-8',
    content,
    byteLength: utf8ByteLength(content),
    topologySemanticHash: graph.semanticHash,
  });
}

export function triggerTopologyDownload(documentRef, artifact, urlApi = URL) {
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
  if (!documentRef?.createElement || !documentRef?.body) throw new TypeError('Topology download requires a document.');
  if (!artifact || artifact.schema !== TOPOLOGY_EXPORT_ARTIFACT_SCHEMA) {
    throw new TypeError(`Topology download requires ${TOPOLOGY_EXPORT_ARTIFACT_SCHEMA}.`);
  }
  if (!urlApi?.createObjectURL || !urlApi?.revokeObjectURL) throw new TypeError('Topology download requires an object URL API.');
}

function stableBaseName(datasetId) {
  const normalized = String(datasetId || 'dataset')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'dataset';
  return `piping-port-topology-${normalized}`;
}
