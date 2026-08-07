import {
  buildTopologyEditTableHumanExport,
  topologyEditTableHumanCsv,
} from '../topology-edit/table/topology-edit-table-human-export.js';

export function currentTopologyEditTableHumanExport(runtime) {
  if (!runtime?.projection || !runtime?.controller?.session) {
    throw new Error('TopologyEditTableExportDownload: certified Table projection is unavailable.');
  }
  const hasUnappliedChanges = Boolean(
    runtime.batch || runtime.batchPlan || runtime.preview || runtime.validation || runtime.staleResult,
  );
  return buildTopologyEditTableHumanExport({
    projection: runtime.projection,
    sessionSnapshot: runtime.controller.session.snapshot(),
    hasUnappliedChanges,
  });
}

export function downloadTopologyEditTableCsv(runtime) {
  const exportModel = currentTopologyEditTableHumanExport(runtime);
  const bytes = new TextEncoder().encode(topologyEditTableHumanCsv(exportModel));
  downloadBytes(runtime, bytes, fileName(exportModel, 'csv'), 'text/csv;charset=utf-8');
  return { exportModel, byteLength: bytes.byteLength };
}

export async function downloadTopologyEditTableXlsx(runtime) {
  const exportModel = currentTopologyEditTableHumanExport(runtime);
  const { topologyEditTableHumanXlsxBytes, TOPOLOGY_EDIT_TABLE_HUMAN_XLSX_MIME } = await import(
    '../topology-edit/table/topology-edit-table-human-xlsx.js'
  );
  const bytes = topologyEditTableHumanXlsxBytes(exportModel);
  downloadBytes(runtime, bytes, fileName(exportModel, 'xlsx'), TOPOLOGY_EDIT_TABLE_HUMAN_XLSX_MIME);
  return { exportModel, byteLength: bytes.byteLength };
}

function downloadBytes(runtime, bytes, name, type) {
  const documentRef = runtime.element?.ownerDocument;
  const URLRef = documentRef?.defaultView?.URL;
  if (!documentRef || !URLRef?.createObjectURL) {
    throw new Error('TopologyEditTableExportDownload: browser download authority is unavailable.');
  }
  const blob = new Blob([bytes], { type });
  const url = URLRef.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  URLRef.revokeObjectURL(url);
}
function fileName(exportModel, extension) {
  const dataset = safeName(exportModel.authority.datasetId || 'engineering-model');
  const hash = String(exportModel.authority.canonicalHash || '').split(':').at(-1)?.slice(0, 12) || 'canonical';
  return `${dataset}-3d-edit-${hash}.${extension}`;
}
function safeName(value) {
  return String(value).trim().replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'engineering-model';
}
