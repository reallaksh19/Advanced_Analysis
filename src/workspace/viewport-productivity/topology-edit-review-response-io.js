import {
  parseTopologyEditReviewResponseJson,
  TOPOLOGY_EDIT_REVIEW_RESPONSE_MAX_BYTES,
  topologyEditReviewResponseFilename,
  topologyEditReviewResponseJson,
} from './topology-edit-review-response.js';

export async function readTopologyEditReviewResponseFile(file) {
  if (!file || typeof file.text !== 'function') {
    throw new TypeError('A readable local JSON file is required.');
  }
  const byteLength = Number(file.size);
  if (!Number.isInteger(byteLength) || byteLength < 0) {
    throw new TypeError('Review response file size is unavailable.');
  }
  if (byteLength > TOPOLOGY_EDIT_REVIEW_RESPONSE_MAX_BYTES) {
    throw new RangeError(
      `Review response exceeds the ${TOPOLOGY_EDIT_REVIEW_RESPONSE_MAX_BYTES}-byte intake limit.`,
    );
  }
  return parseTopologyEditReviewResponseJson(await file.text(), { byteLength });
}

export function downloadTopologyEditReviewResponse(document, response) {
  if (!document) throw new TypeError('A browser document is required for response download.');
  const view = document.defaultView;
  const BlobType = view?.Blob ?? globalThis.Blob;
  const URLApi = view?.URL ?? globalThis.URL;
  if (!BlobType || !URLApi?.createObjectURL) {
    throw new Error('Browser download API is unavailable.');
  }
  const filename = topologyEditReviewResponseFilename(response);
  const blob = new BlobType([topologyEditReviewResponseJson(response)], {
    type: 'application/json',
  });
  const url = URLApi.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body?.append(anchor);
  anchor.click();
  anchor.remove();
  URLApi.revokeObjectURL(url);
  return filename;
}

export function topologyEditSafeReviewFileName(value) {
  const name = String(value ?? '').trim();
  return name ? name.slice(0, 160) : null;
}
