import {
  parseTopologyEditReviewResponseLedgerJson,
  TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES,
  topologyEditReviewResponseLedgerFilename,
  topologyEditReviewResponseLedgerJson,
} from './topology-edit-review-response-ledger.js';

export async function readTopologyEditReviewResponseLedgerFile(file) {
  if (!file || typeof file.text !== 'function') {
    throw new TypeError('A readable local review ledger JSON file is required.');
  }
  const byteLength = Number(file.size);
  if (!Number.isInteger(byteLength) || byteLength < 0) {
    throw new TypeError('Review ledger file size is unavailable.');
  }
  if (byteLength > TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES) {
    throw new RangeError(
      `Review ledger exceeds the ${TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES}-byte intake limit.`,
    );
  }
  return parseTopologyEditReviewResponseLedgerJson(await file.text(), { byteLength });
}

export function downloadTopologyEditReviewResponseLedger(document, ledger) {
  if (!document) throw new TypeError('A browser document is required for ledger download.');
  const view = document.defaultView;
  const BlobType = view?.Blob ?? globalThis.Blob;
  const URLApi = view?.URL ?? globalThis.URL;
  if (!BlobType || !URLApi?.createObjectURL) {
    throw new Error('Browser download API is unavailable.');
  }
  const filename = topologyEditReviewResponseLedgerFilename(ledger);
  const blob = new BlobType([topologyEditReviewResponseLedgerJson(ledger)], {
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

export function topologyEditSafeReviewLedgerFileName(value) {
  const name = String(value ?? '').trim();
  return name ? name.slice(0, 160) : null;
}
